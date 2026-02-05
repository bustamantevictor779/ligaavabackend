const pool = require('../config/database');

// Helper para actualizar estadísticas
const updateTeamStats = async (client, equipo_id, nivel_id, stats, operation = '+') => {
    const op = operation === '+' ? '+' : '-';
    await client.query(`
        UPDATE estadisticas_equipos
        SET 
            partidos_jugados = partidos_jugados ${op} $1,
            partidos_ganados = partidos_ganados ${op} $2,
            partidos_perdidos = partidos_perdidos ${op} $3,
            sets_ganados = sets_ganados ${op} $4,
            sets_perdidos = sets_perdidos ${op} $5,
            puntos_favor = puntos_favor ${op} $6,
            puntos_contra = puntos_contra ${op} $7,
            puntos_tabla = puntos_tabla ${op} $8
        WHERE equipo_id = $9 AND nivel_id = $10
    `, [
        stats.jugados,
        stats.ganados,
        stats.perdidos,
        stats.sets_ganados,
        stats.sets_perdidos,
        stats.puntos_favor,
        stats.puntos_contra,
        stats.puntos_tabla,
        equipo_id,
        nivel_id
    ]);
};

const calculatePoints = (setsWon, setsLost) => {
    let pointsWinner = 0;
    let pointsLoser = 0;

    if (setsWon === 3) {
        // Ganador
        if (setsLost === 0 || setsLost === 1) pointsWinner = 4; // 3-0 o 3-1
        else if (setsLost === 2) pointsWinner = 3; // 3-2
        
        // Perdedor
        if (setsLost === 0 || setsLost === 1) pointsLoser = 1; // 0-3 o 1-3
        else if (setsLost === 2) pointsLoser = 2; // 2-3
    }
    return { pointsWinner, pointsLoser };
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
    if (partidoCheck.rows[0].estado === 'finalizado') {
        return res.status(400).json({ message: 'El partido ya ha finalizado.' });
    }

    await client.query('BEGIN');

    let ganador = null;
    if (parseInt(puntos_equipo_a) > parseInt(puntos_equipo_b)) ganador = 'a';
    else if (parseInt(puntos_equipo_b) > parseInt(puntos_equipo_a)) ganador = 'b';

    // Insertar set
    const result = await client.query(
      `INSERT INTO sets_partido (partido_id, numero_set, puntos_equipo_a, puntos_equipo_b, ganador)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [partido_id, numero_set, puntos_equipo_a, puntos_equipo_b, ganador]
    );

    // Actualizar estado a 'en_curso' si es el primer set y estaba programado
    if (partidoCheck.rows[0].estado === 'programado') {
        await client.query("UPDATE partidos SET estado = 'en_curso' WHERE id = $1", [partido_id]);
    }

    // Actualizar marcador global en tabla partidos
    const setsInfo = await client.query(`
        SELECT 
            COUNT(*) FILTER (WHERE ganador = 'a') as sets_a,
            COUNT(*) FILTER (WHERE ganador = 'b') as sets_b,
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

        const { pointsWinner, pointsLoser } = calculatePoints(Math.max(setsA, setsB), Math.min(setsA, setsB));
        
        const statsA = {
            jugados: 1,
            ganados: setsA === 3 ? 1 : 0,
            perdidos: setsA === 3 ? 0 : 1,
            sets_ganados: setsA,
            sets_perdidos: setsB,
            puntos_favor: totalPuntosA,
            puntos_contra: totalPuntosB,
            puntos_tabla: setsA === 3 ? pointsWinner : pointsLoser
        };

        const statsB = {
            jugados: 1,
            ganados: setsB === 3 ? 1 : 0,
            perdidos: setsB === 3 ? 0 : 1,
            sets_ganados: setsB,
            sets_perdidos: setsA,
            puntos_favor: totalPuntosB,
            puntos_contra: totalPuntosA,
            puntos_tabla: setsB === 3 ? pointsWinner : pointsLoser
        };

        await updateTeamStats(client, equipo_a_id, nivel_id, statsA, '+');
        await updateTeamStats(client, equipo_b_id, nivel_id, statsB, '+');

        await client.query("UPDATE partidos SET estado = 'finalizado' WHERE id = $1", [partido_id]);
    }

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
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
            // Obtener totales actuales (que incluyen el set a borrar)
            const setsInfo = await client.query(`
                SELECT 
                    COUNT(*) FILTER (WHERE ganador = 'a') as sets_a,
                    COUNT(*) FILTER (WHERE ganador = 'b') as sets_b,
                    COALESCE(SUM(puntos_equipo_a), 0) as total_puntos_a,
                    COALESCE(SUM(puntos_equipo_b), 0) as total_puntos_b
                FROM sets_partido WHERE partido_id = $1
            `, [partido_id]);

            const setsA = parseInt(setsInfo.rows[0].sets_a);
            const setsB = parseInt(setsInfo.rows[0].sets_b);
            const totalPuntosA = parseInt(setsInfo.rows[0].total_puntos_a);
            const totalPuntosB = parseInt(setsInfo.rows[0].total_puntos_b);

            const { pointsWinner, pointsLoser } = calculatePoints(Math.max(setsA, setsB), Math.min(setsA, setsB));

            const statsA = {
                jugados: 1,
                ganados: setsA === 3 ? 1 : 0,
                perdidos: setsA === 3 ? 0 : 1,
                sets_ganados: setsA,
                sets_perdidos: setsB,
                puntos_favor: totalPuntosA,
                puntos_contra: totalPuntosB,
                puntos_tabla: setsA === 3 ? pointsWinner : pointsLoser
            };

            const statsB = {
                jugados: 1,
                ganados: setsB === 3 ? 1 : 0,
                perdidos: setsB === 3 ? 0 : 1,
                sets_ganados: setsB,
                sets_perdidos: setsA,
                puntos_favor: totalPuntosB,
                puntos_contra: totalPuntosA,
                puntos_tabla: setsB === 3 ? pointsWinner : pointsLoser
            };

            // Restar estadísticas
            await updateTeamStats(client, equipo_a_id, nivel_id, statsA, '-');
            await updateTeamStats(client, equipo_b_id, nivel_id, statsB, '-');

            // Volver estado a en_curso
            await client.query("UPDATE partidos SET estado = 'en_curso' WHERE id = $1", [partido_id]);
        }

        await client.query('DELETE FROM sets_partido WHERE id = $1', [id]);

        // Recalcular marcador global
        const setsInfoNew = await client.query(`
            SELECT 
                COUNT(*) FILTER (WHERE ganador = 'a') as sets_a,
                COUNT(*) FILTER (WHERE ganador = 'b') as sets_b
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