const pool = require('../config/database');

// Función auxiliar para recalcular estadísticas de UN NIVEL completo (Copia de partidosController para consistencia)
const recalculateLevelStats = async (client, nivel_id) => {
    // 1. Resetear estadísticas del nivel a 0
    await client.query(`
        UPDATE estadisticas_equipos
        SET partidos_jugados = 0, partidos_ganados = 0, partidos_perdidos = 0,
            sets_ganados = 0, sets_perdidos = 0,
            puntos_favor = 0, puntos_contra = 0, puntos_tabla = 0
        WHERE nivel_id = $1
    `, [nivel_id]);

    // 2. Obtener todos los partidos finalizados del nivel con sus sets
    const matchesResult = await client.query(`
        SELECT p.*,
               (SELECT COALESCE(json_agg(sp.*), '[]') FROM sets_partido sp WHERE sp.partido_id = p.id) as sets
        FROM partidos p
        WHERE p.nivel_id = $1 AND p.estado = 'finalizado'
    `, [nivel_id]);

    const matches = matchesResult.rows;
    const teamStats = {};

    const initTeam = (id) => {
        if (!teamStats[id]) teamStats[id] = { pj: 0, pg: 0, pp: 0, sf: 0, sc: 0, pf: 0, pc: 0, pts: 0 };
    };

    for (const m of matches) {
        initTeam(m.equipo_a_id);
        initTeam(m.equipo_b_id);

        let setsA = 0;
        let setsB = 0;
        let pointsA = 0;
        let pointsB = 0;

        m.sets.forEach(s => {
            pointsA += s.puntos_equipo_a;
            pointsB += s.puntos_equipo_b;
            if (s.puntos_equipo_a > s.puntos_equipo_b) setsA++;
            else setsB++;
        });

        // Acumular sets y puntos
        teamStats[m.equipo_a_id].sf += setsA;
        teamStats[m.equipo_a_id].sc += setsB;
        teamStats[m.equipo_a_id].pf += pointsA;
        teamStats[m.equipo_a_id].pc += pointsB;

        teamStats[m.equipo_b_id].sf += setsB;
        teamStats[m.equipo_b_id].sc += setsA;
        teamStats[m.equipo_b_id].pf += pointsB;
        teamStats[m.equipo_b_id].pc += pointsA;

        // Determinar ganador y puntos de tabla
        let winnerId = setsA > setsB ? m.equipo_a_id : (setsB > setsA ? m.equipo_b_id : null);
        let loserId = setsA > setsB ? m.equipo_b_id : (setsB > setsA ? m.equipo_a_id : null);

        if (winnerId) {
            teamStats[winnerId].pj++; teamStats[winnerId].pg++;
            teamStats[loserId].pj++; teamStats[loserId].pp++;

            if (m.es_walkover) {
                teamStats[winnerId].pts += 4; // Walkover
            } else {
                // Regla cliente: 3-0/3-1 = 4pts/1pt, 3-2 = 3pts/2pts
                if (Math.abs(setsA - setsB) >= 2) {
                    teamStats[winnerId].pts += 4;
                    teamStats[loserId].pts += 1;
                } else {
                    teamStats[winnerId].pts += 3;
                    teamStats[loserId].pts += 2;
                }
            }
        }
    }

    // 3. Guardar estadísticas calculadas
    for (const [equipoId, stats] of Object.entries(teamStats)) {
        await client.query(`
            UPDATE estadisticas_equipos
            SET partidos_jugados = $1, partidos_ganados = $2, partidos_perdidos = $3,
                sets_ganados = $4, sets_perdidos = $5,
                puntos_favor = $6, puntos_contra = $7, puntos_tabla = $8
            WHERE equipo_id = $9 AND nivel_id = $10
        `, [stats.pj, stats.pg, stats.pp, stats.sf, stats.sc, stats.pf, stats.pc, stats.pts, equipoId, nivel_id]);
    }
};

exports.createSet = async (req, res) => {
  const client = await pool.connect();
  try {
    const { partido_id, numero_set, puntos_equipo_a, puntos_equipo_b } = req.body;

    if (!partido_id || !numero_set || puntos_equipo_a === undefined || puntos_equipo_b === undefined) {
        return res.status(400).json({ message: 'Faltan datos del set' });
    }

    // Validar si el partido ya terminó
    const partidoCheck = await client.query('SELECT estado FROM partidos WHERE id = $1', [partido_id]);
    if (partidoCheck.rows.length === 0) return res.status(404).json({ message: 'Partido no encontrado' });
    // Eliminamos la restricción de 'finalizado' para permitir ediciones

    await client.query('BEGIN');

    let ganador = null;
    if (parseInt(puntos_equipo_a) > parseInt(puntos_equipo_b)) ganador = 'a';
    else if (parseInt(puntos_equipo_b) > parseInt(puntos_equipo_a)) ganador = 'b';

    // Para reemplazar un set, primero lo borramos si existe (evita el error ON CONFLICT si no hay índice)
    await client.query(
      `DELETE FROM sets_partido WHERE partido_id = $1 AND numero_set = $2`,
      [partido_id, numero_set]
    );

    // Luego insertamos el nuevo/actualizado
    await client.query(
      `INSERT INTO sets_partido (partido_id, numero_set, puntos_equipo_a, puntos_equipo_b, ganador)
       VALUES ($1, $2, $3, $4, $5)`,
      [partido_id, numero_set, puntos_equipo_a, puntos_equipo_b, ganador]
    );

    // Actualizar estado a 'en_curso' si es el primer set y estaba programado
    if (partidoCheck.rows[0].estado === 'programado') {
        await client.query("UPDATE partidos SET estado = 'en_curso' WHERE id = $1", [partido_id]);
    }

    // Actualizar marcador global en tabla partidos
    const setsInfo = await client.query(`
        SELECT 
            COUNT(*) FILTER (WHERE puntos_equipo_a > puntos_equipo_b) as sets_a,
            COUNT(*) FILTER (WHERE puntos_equipo_b > puntos_equipo_a) as sets_b,
            COALESCE(SUM(puntos_equipo_a), 0) as total_puntos_a,
            COALESCE(SUM(puntos_equipo_b), 0) as total_puntos_b
        FROM sets_partido WHERE partido_id = $1
    `, [partido_id]);

    const setsA = parseInt(setsInfo.rows[0].sets_a);
    const setsB = parseInt(setsInfo.rows[0].sets_b);
    const totalPuntosA = parseInt(setsInfo.rows[0].total_puntos_a);
    const totalPuntosB = parseInt(setsInfo.rows[0].total_puntos_b);

    await client.query(
        'UPDATE partidos SET resultado_equipo_a = $1, resultado_equipo_b = $2 WHERE id = $3',
        [setsA, setsB, partido_id]
    );

    // Verificar si el partido finalizó (alguien llegó a 3 sets)
    if (setsA === 3 || setsB === 3) {
        const matchInfo = await client.query(
            'SELECT equipo_a_id, equipo_b_id, nivel_id FROM partidos WHERE id = $1',
            [partido_id]
        );
        const { equipo_a_id, equipo_b_id, nivel_id } = matchInfo.rows[0];

        await client.query("UPDATE partidos SET estado = 'finalizado' WHERE id = $1", [partido_id]);
        // Recálculo completo para asegurar consistencia
        await recalculateLevelStats(client, nivel_id);
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Set guardado correctamente' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating set:', error);
    res.status(500).json({ message: 'Error al cargar el set: ' + error.message });
  } finally {
    client.release();
  }
};

exports.deleteSet = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        
        // Obtener partido_id y estado antes de borrar
        const setInfo = await client.query(`
            SELECT s.partido_id, p.estado, p.equipo_a_id, p.equipo_b_id, p.nivel_id
            FROM sets_partido s
            JOIN partidos p ON s.partido_id = p.id
            WHERE s.id = $1
        `, [id]);
        
        if (setInfo.rows.length === 0) return res.status(404).json({ message: 'Set no encontrado' });
        const { partido_id, estado, equipo_a_id, equipo_b_id, nivel_id } = setInfo.rows[0];

        await client.query('BEGIN');

        // Si el partido estaba finalizado, debemos revertir las estadísticas
        if (estado === 'finalizado') {
            // Volver estado a en_curso
            await client.query("UPDATE partidos SET estado = 'en_curso' WHERE id = $1", [partido_id]);
            // Al volver a en_curso, el partido ya no cuenta como finalizado para las stats.
            // Recalculamos todo el nivel para que las stats de este partido desaparezcan de la tabla limpiamente.
            await recalculateLevelStats(client, nivel_id);
        }

        await client.query('DELETE FROM sets_partido WHERE id = $1', [id]);

        // Recalcular marcador global
        const setsInfoNew = await client.query(`
            SELECT 
                COUNT(*) FILTER (WHERE puntos_equipo_a > puntos_equipo_b) as sets_a,
                COUNT(*) FILTER (WHERE puntos_equipo_b > puntos_equipo_a) as sets_b
            FROM sets_partido WHERE partido_id = $1
        `, [partido_id]);

        const setsANew = setsInfoNew.rows[0].sets_a || 0;
        const setsBNew = setsInfoNew.rows[0].sets_b || 0;

        await client.query(
            'UPDATE partidos SET resultado_equipo_a = $1, resultado_equipo_b = $2 WHERE id = $3',
            [setsANew, setsBNew, partido_id]
        );

        await client.query('COMMIT');
        res.json({ message: 'Set eliminado' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deleting set:', error);
        res.status(500).json({ message: 'Error al eliminar el set' });
    } finally {
        client.release();
    }
};