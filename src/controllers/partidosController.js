const pool = require('../config/database');

/**
 * Genera un fixture "todos contra todos" para un nivel específico.
 * Solo crea los cruces (equipo A vs equipo B) con estado 'pendiente'.
 * NO asigna fecha, hora, sede ni árbitro.
 */
exports.createFixture = async (req, res) => {
  const client = await pool.connect();
  try {
    const { nivel_id, equipo_ids } = req.body;

    if (!nivel_id || !equipo_ids || !Array.isArray(equipo_ids) || equipo_ids.length < 2) {
      return res.status(400).json({ message: 'Se requiere un nivel_id y al menos 2 equipos.' });
    }

    // 1. Obtener el torneo_id desde el nivel
    const nivelResult = await client.query('SELECT torneo_id FROM niveles WHERE id = $1', [nivel_id]);
    if (nivelResult.rows.length === 0) {
      return res.status(404).json({ message: 'Nivel no encontrado.' });
    }
    const torneo_id = nivelResult.rows[0].torneo_id;

    await client.query('BEGIN');

    // 2. Eliminar partidos pendientes anteriores de este nivel (limpieza)
    await client.query("DELETE FROM partidos WHERE nivel_id = $1 AND estado = 'pendiente'", [nivel_id]);

    // 3. Obtener el último número de partido para este nivel (para continuar la secuencia si hay jugados)
    const maxNumResult = await client.query('SELECT COALESCE(MAX(numero_partido), 0) as max_num FROM partidos WHERE nivel_id = $1', [nivel_id]);
    let currentNum = parseInt(maxNumResult.rows[0].max_num);

    // 3. Mezclar equipos y generar cruces
    const shuffledEquipos = [...equipo_ids].sort(() => Math.random() - 0.5);
    const partidosParaInsertar = [];

    for (let i = 0; i < shuffledEquipos.length; i++) {
      for (let j = i + 1; j < shuffledEquipos.length; j++) {
        // Asignar localía aleatoria
        if (Math.random() > 0.5) {
            partidosParaInsertar.push([shuffledEquipos[i], shuffledEquipos[j]]);
        } else {
            partidosParaInsertar.push([shuffledEquipos[j], shuffledEquipos[i]]);
        }
      }
    }

    // 4. Insertar partidos (Sin fecha, hora, sede ni árbitro)
    const query = `
      INSERT INTO partidos (equipo_a_id, equipo_b_id, nivel_id, torneo_id, estado, numero_partido)
      VALUES ($1, $2, $3, $4, 'pendiente', $5)
    `;

    for (const partido of partidosParaInsertar) {
      currentNum++;
      await client.query(query, [partido[0], partido[1], nivel_id, torneo_id, currentNum]);
    }

    // Recalcular para asegurar orden correcto si había partidos previos
    await recalculateMatchNumbers(client, nivel_id);

    await client.query('COMMIT');
    res.status(201).json({ message: `Se generaron ${partidosParaInsertar.length} partidos pendientes de programación.` });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating fixture:', error);
    res.status(500).json({ message: 'Error al generar el fixture: ' + error.message });
  } finally {
    client.release();
  }
};
// Función auxiliar para recalcular números de partido
// Ordena por Fecha -> Hora -> ID y actualiza la secuencia
const recalculateMatchNumbers = async (executor, nivel_id) => {
  await executor.query(`
    WITH ordered AS (
      SELECT id, ROW_NUMBER() OVER (
        ORDER BY 
          fecha ASC NULLS LAST, 
          horario ASC NULLS LAST, 
          id ASC
      ) as rn
      FROM partidos
      WHERE nivel_id = $1
    )
    UPDATE partidos p
    SET numero_partido = o.rn
    FROM ordered o
    WHERE p.id = o.id AND p.numero_partido IS DISTINCT FROM o.rn
  `, [nivel_id]);
};

// Función auxiliar para recalcular estadísticas de UN NIVEL completo
// Se llama cada vez que se modifica un resultado finalizado
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
  const teamStats = {}; // Cache local para acumular

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
              teamStats[winnerId].pts += 4; // Walkover (Ausencia)
          } else {
              // Regla estándar: 3-0/3-1 = 3pts, 3-2 = 2pts (ganador) / 1pt (perdedor)
              if (Math.abs(setsA - setsB) >= 2) {
                  teamStats[winnerId].pts += 3;
              } else {
                  teamStats[winnerId].pts += 2;
                  teamStats[loserId].pts += 1;
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

// Función auxiliar para verificar y crear la final si las semifinales terminaron
const checkAndCreateFinal = async (client, nivel_id) => {
  try {
    console.log(`\n🔍 [DEBUG SYSTEM] Verificando creación de Final para Nivel ID: ${nivel_id}`);

    // 1. Traer TODOS los partidos del nivel para inspeccionar
    const allMatchesRes = await client.query(`
        SELECT id, instancia, estado, equipo_a_id, equipo_b_id, resultado_equipo_a, resultado_equipo_b 
        FROM partidos WHERE nivel_id = $1
    `, [nivel_id]);
    
    const allMatches = allMatchesRes.rows;
    console.log(`📊 [DEBUG SYSTEM] Total partidos en nivel: ${allMatches.length}`);
    allMatches.forEach(m => console.log(`   - ID: ${m.id} | Instancia: "${m.instancia}" | Estado: ${m.estado}`));

    // 2. Filtrar semifinales usando JS (más seguro que SQL para strings sucios)
    const semis = allMatches.filter(p => {
        if (!p.instancia) return false;
        const inst = p.instancia.trim().toLowerCase();
        return inst === 'semifinal 1' || inst === 'semifinal 2';
    });

    console.log(`🎯 [DEBUG SYSTEM] Semifinales identificadas: ${semis.length}`);

    if (semis.length !== 2) {
        console.log('❌ [DEBUG SYSTEM] No se encontraron exactamente 2 semifinales. Cancelando.');
        return;
    }

    const allFinished = semis.every(p => p.estado === 'finalizado');
    if (!allFinished) {
        console.log('❌ [DEBUG SYSTEM] Al menos una semifinal no está finalizada. Cancelando.');
        return;
    }

    // 3. Determinar ganadores
    const winners = [];
    for (const p of semis) {
        if (p.resultado_equipo_a > p.resultado_equipo_b) winners.push(p.equipo_a_id);
        else if (p.resultado_equipo_b > p.resultado_equipo_a) winners.push(p.equipo_b_id);
    }

    console.log(`🏆 [DEBUG SYSTEM] Ganadores detectados: ${JSON.stringify(winners)}`);

    if (winners.length !== 2) {
        console.log('❌ [DEBUG SYSTEM] No hay 2 ganadores claros. Cancelando.');
        return;
    }

    // 4. Buscar si ya existe la final
    const finalMatch = allMatches.find(p => p.instancia && p.instancia.trim().toLowerCase() === 'final');

    if (!finalMatch) {
        console.log('✨ [DEBUG SYSTEM] No existe final. CREANDO NUEVA FINAL...');
        
        // Obtener torneo_id (necesario para insert)
        const nivelRes = await client.query('SELECT torneo_id FROM niveles WHERE id = $1', [nivel_id]);
        const torneo_id = nivelRes.rows[0].torneo_id;

        // Obtener numero partido
        const maxNumResult = await client.query('SELECT COALESCE(MAX(numero_partido), 0) as max_num FROM partidos WHERE nivel_id = $1', [nivel_id]);
        const nextNum = parseInt(maxNumResult.rows[0].max_num) + 1;

        await client.query(`
            INSERT INTO partidos (torneo_id, nivel_id, equipo_a_id, equipo_b_id, estado, instancia, numero_partido)
            VALUES ($1, $2, $3, $4, 'pendiente', 'final', $5)
        `, [torneo_id, nivel_id, winners[0], winners[1], nextNum]);
        
        console.log('✅ [DEBUG SYSTEM] ¡FINAL CREADA EXITOSAMENTE!');
    } else {
        console.log('⚠️ [DEBUG SYSTEM] La final ya existe. Verificando si es necesario actualizar equipos...');
        if (finalMatch.estado === 'pendiente') {
             await client.query(`
                UPDATE partidos 
                SET equipo_a_id = $1, equipo_b_id = $2
                WHERE id = $3
            `, [winners[0], winners[1], finalMatch.id]);
            console.log('✅ [DEBUG SYSTEM] Equipos de la final actualizados.');
        } else {
            console.log('ℹ️ [DEBUG SYSTEM] La final ya no está pendiente. No se toca.');
        }
    }

  } catch (error) {
    console.error('🔥 [DEBUG SYSTEM] ERROR CRÍTICO EN checkAndCreateFinal:', error);
  }
};

// Función auxiliar para verificar y establecer el campeón si la final terminó
const checkAndSetChampion = async (client, nivel_id) => {
  try {
    // 1. Verificar si existe una Final finalizada en este nivel
    const finalMatchRes = await client.query(`
        SELECT * FROM partidos 
        WHERE nivel_id = $1 AND TRIM(LOWER(instancia)) = 'final' AND estado = 'finalizado'
    `, [nivel_id]);

    if (finalMatchRes.rows.length > 0) {
        const finalMatch = finalMatchRes.rows[0];
        let championId = null;

        // Determinar ganador por sets/resultado
        if (finalMatch.resultado_equipo_a > finalMatch.resultado_equipo_b) {
            championId = finalMatch.equipo_a_id;
        } else if (finalMatch.resultado_equipo_b > finalMatch.resultado_equipo_a) {
            championId = finalMatch.equipo_b_id;
        }

        if (championId) {
            // 2. Actualizar el nivel: setear campeón y estado finalizado
            await client.query(`
                UPDATE niveles 
                SET campeon_id = $1, estado = 'finalizado'
                WHERE id = $2
            `, [championId, nivel_id]);
        }
    }
  } catch (error) {
    console.error('Error en checkAndSetChampion:', error);
  }
};

// Obtener todos los partidos (para la sección de administración)
exports.getAllPartidos = async (req, res) => {
    try {
        const { onlyActive } = req.query;
        let query = `
            SELECT 
                p.id, p.fecha, p.horario, p.estado, p.resultado_equipo_a, p.resultado_equipo_b,
                p.sede_id, p.arbitro_id, p.numero_partido,
                p.torneo_id, p.nivel_id, p.instancia,
                t.nombre as torneo_nombre,
                n.nombre as nivel_nombre,
                n.categoria as nivel_categoria,
                n.tipo as nivel_tipo,
                s.nombre as sede_nombre,
                u.nombre as arbitro_nombre,
                ea.nombre as equipo_a_nombre, ea.logo_url as equipo_a_logo,
                eb.nombre as equipo_b_nombre, eb.logo_url as equipo_b_logo,
                (SELECT COALESCE(json_agg(sp.* ORDER BY sp.numero_set), '[]') FROM sets_partido sp WHERE sp.partido_id = p.id) as sets
            FROM partidos p
            JOIN torneos t ON p.torneo_id = t.id
            JOIN niveles n ON p.nivel_id = n.id
            JOIN equipos ea ON p.equipo_a_id = ea.id
            JOIN equipos eb ON p.equipo_b_id = eb.id
            LEFT JOIN sedes s ON p.sede_id = s.id
            LEFT JOIN usuarios u ON p.arbitro_id = u.id
        `;

        if (onlyActive === 'true') {
            query += ` WHERE t.estado = 'activo'`;
        }

        query += ` ORDER BY p.id DESC`;

        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting partidos:', error);
        res.status(500).json({ message: 'Error al obtener partidos' });
    }
};

// Actualizar partido
exports.updatePartido = async (req, res) => {
    try {
        const { id } = req.params;
        const { fecha, horario, sede_id, arbitro_id, estado, instancia } = req.body;
        const instanciaNormalized = instancia ? instancia.trim().toLowerCase() : instancia;

        const result = await pool.query(
            `UPDATE partidos SET
                fecha = COALESCE($1, fecha),
                horario = COALESCE($2, horario),
                sede_id = COALESCE($3, sede_id),
                arbitro_id = COALESCE($4, arbitro_id),
                estado = COALESCE($5, estado),
                instancia = COALESCE($6, instancia)
            WHERE id = $7 RETURNING *`,
            [fecha, horario, sede_id, arbitro_id, estado, instanciaNormalized, id]
        );
        
        if (result.rows.length === 0) return res.status(404).json({ message: 'Partido no encontrado' });
        
        const updatedPartido = result.rows[0];
        // Recalcular números del nivel por si cambió el orden cronológico
        await recalculateMatchNumbers(pool, updatedPartido.nivel_id);
        
        res.json(updatedPartido);
    } catch (error) {
        console.error('Error updating partido:', error);
        res.status(500).json({ message: 'Error al actualizar el partido' });
    }
};

// Crear un único partido (para playoffs)
exports.createPartido = async (req, res) => {
  try {
    const { torneo_id, nivel_id, equipo_a_id, equipo_b_id, instancia, fecha, horario, sede_id, arbitro_id } = req.body;

    if (!torneo_id || !nivel_id || !equipo_a_id || !equipo_b_id) {
      return res.status(400).json({ message: 'Faltan datos para crear el partido.' });
    }

    const instanciaNormalized = instancia ? instancia.trim().toLowerCase() : null;

    // Si se proveen datos de programación, el estado es 'programado', si no 'pendiente'
    const estado = (fecha && horario && sede_id && arbitro_id) ? 'programado' : 'pendiente';

    // Calcular siguiente numero
    const maxNumResult = await pool.query('SELECT COALESCE(MAX(numero_partido), 0) as max_num FROM partidos WHERE nivel_id = $1', [nivel_id]);
    const nextNum = parseInt(maxNumResult.rows[0].max_num) + 1;

    const result = await pool.query(
      `INSERT INTO partidos (torneo_id, nivel_id, equipo_a_id, equipo_b_id, estado, instancia, numero_partido, fecha, horario, sede_id, arbitro_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        torneo_id, nivel_id, equipo_a_id, equipo_b_id, estado, 
        instanciaNormalized, nextNum, fecha || null, horario || null, 
        sede_id || null, arbitro_id || null
      ]
    );

    const newPartido = result.rows[0];
    await recalculateMatchNumbers(pool, newPartido.nivel_id);

    res.status(201).json(newPartido);
  } catch (error) {
    console.error('Error creating single partido:', error);
    res.status(500).json({ message: 'Error al crear el partido: ' + error.message });
  }
};

// Obtener partidos asignados al árbitro logueado
exports.getMisPartidos = async (req, res) => {
    try {
        const arbitroId = req.user.id; // Obtenido del token
        const result = await pool.query(`
            SELECT 
                p.id, p.fecha, p.horario, p.estado, 
                p.resultado_equipo_a, p.resultado_equipo_b,
                p.equipo_a_id, p.equipo_b_id, p.numero_partido,
                p.instancia, t.nombre as torneo_nombre,
                n.nombre as nivel_nombre,
                s.nombre as sede_nombre,
                ea.nombre as equipo_a_nombre,
                eb.nombre as equipo_b_nombre,
                (SELECT COALESCE(json_agg(sp.* ORDER BY sp.numero_set), '[]') FROM sets_partido sp WHERE sp.partido_id = p.id) as sets
            FROM partidos p
            JOIN torneos t ON p.torneo_id = t.id
            JOIN niveles n ON p.nivel_id = n.id
            JOIN equipos ea ON p.equipo_a_id = ea.id
            JOIN equipos eb ON p.equipo_b_id = eb.id
            LEFT JOIN sedes s ON p.sede_id = s.id
            WHERE p.arbitro_id = $1 AND t.estado = 'activo'
            ORDER BY p.fecha ASC, p.horario ASC
        `, [arbitroId]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting mis partidos:', error);
        res.status(500).json({ message: 'Error al obtener mis partidos' });
    }
};

// Obtener fechas con partidos para el calendario del árbitro
exports.getFechasConPartidosArbitro = async (req, res) => {
    try {
        const arbitroId = req.user.id;
        const result = await pool.query(`
            SELECT DISTINCT to_char(p.fecha, 'YYYY-MM-DD') as fecha
            FROM partidos p
            JOIN torneos t ON p.torneo_id = t.id
            WHERE p.arbitro_id = $1 AND p.fecha IS NOT NULL AND t.estado = 'activo'
        `, [arbitroId]);
        res.json(result.rows.map(r => r.fecha));
    } catch (error) {
        console.error('Error getting fechas partidos:', error);
        res.status(500).json({ message: 'Error al obtener fechas' });
    }
};

// Obtener partidos para el delegado (equipos de sus sedes)
exports.getPartidosDelegado = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(`
            SELECT 
                p.id, p.fecha, p.horario, p.estado, 
                p.resultado_equipo_a, p.resultado_equipo_b,
                p.equipo_a_id, p.equipo_b_id, p.numero_partido,
                p.instancia, t.nombre as torneo_nombre,
                n.nombre as nivel_nombre,
                s.nombre as sede_nombre,
                ea.nombre as equipo_a_nombre,
                eb.nombre as equipo_b_nombre,
                (SELECT COALESCE(json_agg(sp.* ORDER BY sp.numero_set), '[]') FROM sets_partido sp WHERE sp.partido_id = p.id) as sets
            FROM partidos p
            JOIN torneos t ON p.torneo_id = t.id
            JOIN niveles n ON p.nivel_id = n.id
            JOIN equipos ea ON p.equipo_a_id = ea.id
            JOIN equipos eb ON p.equipo_b_id = eb.id
            LEFT JOIN sedes s ON p.sede_id = s.id
            WHERE 
                (ea.sede_id IN (SELECT sede_id FROM delegados_sedes WHERE usuario_id = $1)
                OR
                eb.sede_id IN (SELECT sede_id FROM delegados_sedes WHERE usuario_id = $1))
                AND t.estado = 'activo'
                AND p.estado != 'pendiente'
            ORDER BY p.fecha ASC, p.horario ASC
        `, [userId]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting partidos delegado:', error);
        res.status(500).json({ message: 'Error al obtener partidos del delegado' });
    }
};

// Eliminar un partido manualmente
exports.deletePartido = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Obtener info antes de borrar para saber si hay que recalcular
        const partidoInfo = await pool.query('SELECT nivel_id, estado FROM partidos WHERE id = $1', [id]);
        if (partidoInfo.rows.length === 0) return res.status(404).json({ message: 'Partido no encontrado' });
        const { nivel_id, estado } = partidoInfo.rows[0];

        const result = await pool.query('DELETE FROM partidos WHERE id = $1 RETURNING *', [id]);
        
        await recalculateMatchNumbers(pool, nivel_id);
        
        // Si el partido estaba finalizado, recalcular estadísticas del nivel
        if (estado === 'finalizado') {
            await recalculateLevelStats(pool, nivel_id);
        }
        
        res.json({ message: 'Partido eliminado correctamente' });
    } catch (error) {
        console.error('Error deleting partido:', error);
        res.status(500).json({ message: 'Error al eliminar el partido' });
    }
};

// Marcar un equipo como ausente
exports.marcarAusente = async (req, res) => {
    const client = await pool.connect();
    console.log(`\n📥 [DEBUG SYSTEM] Recibida petición marcarAusente para partido ID: ${req.params.id}`);
    try {
        const { id } = req.params; // partido_id
        const { equipo_ausente } = req.body; // 'a' o 'b'

        if (!equipo_ausente || !['a', 'b'].includes(equipo_ausente)) {
            return res.status(400).json({ message: 'Se debe especificar qué equipo está ausente ("a" o "b").' });
        }

        await client.query('BEGIN');

        const partidoInfo = await client.query(
            'SELECT equipo_a_id, equipo_b_id, nivel_id, estado FROM partidos WHERE id = $1',
            [id]
        );

        if (partidoInfo.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Partido no encontrado.' });
        }

        const { equipo_a_id, equipo_b_id, nivel_id, estado } = partidoInfo.rows[0];

        if (estado === 'finalizado' || estado === 'en_curso') {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: `No se puede marcar ausencia en un partido que está "${estado}".` });
        }

        // Limpiar sets existentes por si se cargó alguno por error
        await client.query('DELETE FROM sets_partido WHERE partido_id = $1', [id]);

        const resultado_a = equipo_ausente === 'a' ? 0 : 3;
        const resultado_b = equipo_ausente === 'b' ? 0 : 3;

        // Insertar 3 sets con resultado 25-0 para el ganador
        const puntos_a_set = equipo_ausente === 'a' ? 0 : 25;
        const puntos_b_set = equipo_ausente === 'b' ? 0 : 25;
        for (let i = 1; i <= 3; i++) {
            await client.query(
                `INSERT INTO sets_partido (partido_id, numero_set, puntos_equipo_a, puntos_equipo_b)
                 VALUES ($1, $2, $3, $4)`,
                [id, i, puntos_a_set, puntos_b_set]
            );
        }

        // Actualizar el partido
        await client.query(
            `UPDATE partidos
             SET estado = 'finalizado', resultado_equipo_a = $1, resultado_equipo_b = $2, es_walkover = TRUE
             WHERE id = $3`,
            [resultado_a, resultado_b, id]
        );

        // Actualizar estadísticas
        const equipoGanadorId = equipo_ausente === 'a' ? equipo_b_id : equipo_a_id;
        const equipoPerdedorId = equipo_ausente === 'a' ? equipo_a_id : equipo_b_id;

        // Sumar puntos al ganador
        await client.query(
            `UPDATE estadisticas_equipos 
             SET partidos_jugados = partidos_jugados + 1, 
                 partidos_ganados = partidos_ganados + 1, 
                 puntos_tabla = puntos_tabla + 4,
                 sets_ganados = sets_ganados + 3,
                 puntos_favor = puntos_favor + 75
             WHERE equipo_id = $1 AND nivel_id = $2`, 
            [equipoGanadorId, nivel_id]
        );
        // Sumar partido perdido al ausente (0 puntos)
        await client.query(
            `UPDATE estadisticas_equipos 
             SET partidos_jugados = partidos_jugados + 1, 
                 partidos_perdidos = partidos_perdidos + 1,
                 sets_perdidos = sets_perdidos + 3,
                 puntos_contra = puntos_contra + 75
             WHERE equipo_id = $1 AND nivel_id = $2`, 
            [equipoPerdedorId, nivel_id]
        );

        // Verificar si se debe crear la final (si es playoff)
        await checkAndCreateFinal(client, nivel_id);
        // Verificar si se debe declarar campeón (si era la final)
        await checkAndSetChampion(client, nivel_id);

        await client.query('COMMIT');

        res.json({ message: `Partido finalizado por ausencia del equipo ${equipo_ausente.toUpperCase()}.` });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error marcando ausencia:', error);
        res.status(500).json({ message: 'Error al marcar ausencia: ' + error.message });
    } finally {
        if (client) client.release();
    }
};

// Actualizar resultado completo (Admin)
exports.adminUpdateResult = async (req, res) => {
    const client = await pool.connect();
    console.log(`\n📥 [DEBUG SYSTEM] Recibida petición adminUpdateResult para partido ID: ${req.params.id}`);
    try {
        const { id } = req.params;
        const { sets } = req.body; // Array de sets [{numero_set, puntos_equipo_a, puntos_equipo_b}, ...]

        if (!sets || !Array.isArray(sets)) {
            return res.status(400).json({ message: 'Se requiere un array de sets.' });
        }

        await client.query('BEGIN');

        // 1. Obtener info del partido
        const partidoRes = await client.query('SELECT nivel_id FROM partidos WHERE id = $1', [id]);
        if (partidoRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Partido no encontrado' });
        }
        const { nivel_id } = partidoRes.rows[0];

        // 2. Borrar sets anteriores
        await client.query('DELETE FROM sets_partido WHERE partido_id = $1', [id]);

        // 3. Insertar nuevos sets y calcular resultado global
        let setsA = 0;
        let setsB = 0;

        for (const s of sets) {
            await client.query(
                'INSERT INTO sets_partido (partido_id, numero_set, puntos_equipo_a, puntos_equipo_b) VALUES ($1, $2, $3, $4)',
                [id, s.numero_set, s.puntos_equipo_a, s.puntos_equipo_b]
            );
            if (s.puntos_equipo_a > s.puntos_equipo_b) setsA++;
            else if (s.puntos_equipo_b > s.puntos_equipo_a) setsB++;
        }

        // 4. Actualizar cabecera del partido (quitamos es_walkover si se edita manualmente)
        await client.query(
            "UPDATE partidos SET resultado_equipo_a = $1, resultado_equipo_b = $2, estado = 'finalizado', es_walkover = FALSE WHERE id = $3",
            [setsA, setsB, id]
        );

        // 5. Recalcular TODAS las estadísticas del nivel
        console.log('🔄 [DEBUG SYSTEM] Recalculando estadísticas...');
        await recalculateLevelStats(client, nivel_id);

        // Verificar si se debe crear la final (si es playoff)
        console.log('🏁 [DEBUG SYSTEM] Llamando a checkAndCreateFinal...');
        await checkAndCreateFinal(client, nivel_id);
        // Verificar si se debe declarar campeón (si era la final)
        await checkAndSetChampion(client, nivel_id);

        await client.query('COMMIT');
        res.json({ message: 'Resultado actualizado y estadísticas recalculadas.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error admin update result:', error);
        res.status(500).json({ message: 'Error al actualizar resultado: ' + error.message });
    } finally {
        client.release();
    }
};

// Registrar o actualizar un set (Usado por Árbitros)
exports.registrarSet = async (req, res) => {
    const client = await pool.connect();
    console.log(`\n📥 [ARBITRO] Registrando set para partido ID: ${req.body.partido_id}`);
    try {
        const { partido_id, numero_set, puntos_equipo_a, puntos_equipo_b } = req.body;

        if (!partido_id || !numero_set) {
            return res.status(400).json({ message: 'Faltan datos del set.' });
        }

        await client.query('BEGIN');

        // 1. Insertar o Actualizar el set
        // Primero borramos si existe para ese numero (upsert simple)
        await client.query('DELETE FROM sets_partido WHERE partido_id = $1 AND numero_set = $2', [partido_id, numero_set]);
        
        await client.query(
            'INSERT INTO sets_partido (partido_id, numero_set, puntos_equipo_a, puntos_equipo_b) VALUES ($1, $2, $3, $4)',
            [partido_id, numero_set, puntos_equipo_a, puntos_equipo_b]
        );

        // 2. Verificar estado del partido (¿Alguien ganó ya?)
        const setsRes = await client.query('SELECT * FROM sets_partido WHERE partido_id = $1 ORDER BY numero_set', [partido_id]);
        const sets = setsRes.rows;

        let setsA = 0;
        let setsB = 0;
        sets.forEach(s => {
            if (s.puntos_equipo_a > s.puntos_equipo_b) setsA++;
            else if (s.puntos_equipo_b > s.puntos_equipo_a) setsB++;
        });

        // Obtener info del partido
        const partidoRes = await client.query('SELECT nivel_id, estado FROM partidos WHERE id = $1', [partido_id]);
        const { nivel_id, estado } = partidoRes.rows[0];

        let nuevoEstado = 'en_curso';
        // Condición de victoria: Primero en llegar a 3 sets (Mejor de 5)
        // OJO: Si tu torneo es a 3 sets (mejor de 3), cambia el 3 por 2. Asumo estándar de 5.
        if (setsA === 3 || setsB === 3) {
            nuevoEstado = 'finalizado';
            console.log(`🏁 [ARBITRO] Partido ${partido_id} FINALIZADO. Resultado: ${setsA}-${setsB}`);
        }

        // 3. Actualizar estado y resultado global del partido
        await client.query(
            'UPDATE partidos SET resultado_equipo_a = $1, resultado_equipo_b = $2, estado = $3 WHERE id = $4',
            [setsA, setsB, nuevoEstado, partido_id]
        );

        // 4. Si el partido finalizó, disparar toda la lógica de torneos
        if (nuevoEstado === 'finalizado') {
            console.log('🔄 [ARBITRO] Recalculando estadísticas y verificando fases...');
            await recalculateLevelStats(client, nivel_id);
            await checkAndCreateFinal(client, nivel_id);
            await checkAndSetChampion(client, nivel_id);
        }

        await client.query('COMMIT');
        
        res.json({ 
            message: 'Set registrado correctamente', 
            partido: { id: partido_id, estado: nuevoEstado, marcador: { equipoA: setsA, equipoB: setsB } } 
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error registrando set:', error);
        res.status(500).json({ message: 'Error al registrar el set: ' + error.message });
    } finally {
        client.release();
    }
};

const fs = require('fs');
const path = require('path');
const logFile = path.join(__dirname, '..', 'log_arbitro.txt');

// Helper para loggear a consola y archivo
const writeLog = (message) => {
    const logMessage = `${new Date().toISOString()} - ${message}\n`;
    console.log(logMessage.trim());
    try {
        fs.appendFileSync(logFile, logMessage);
    } catch (err) {
        console.error('FALLO AL ESCRIBIR LOG:', err);
    }
};

// Registrar o actualizar un set (Usado por Árbitros)
exports.registrarSet = async (req, res) => {
    const client = await pool.connect();
    writeLog(`\n📥 [ARBITRO] Registrando set para partido ID: ${req.body.partido_id}`);
    try {
        const { partido_id, numero_set, puntos_equipo_a, puntos_equipo_b } = req.body;

        if (!partido_id || !numero_set) {
            return res.status(400).json({ message: 'Faltan datos del set.' });
        }

        await client.query('BEGIN');

        // 1. Insertar o Actualizar el set
        await client.query('DELETE FROM sets_partido WHERE partido_id = $1 AND numero_set = $2', [partido_id, numero_set]);
        await client.query(
            'INSERT INTO sets_partido (partido_id, numero_set, puntos_equipo_a, puntos_equipo_b) VALUES ($1, $2, $3, $4)',
            [partido_id, numero_set, puntos_equipo_a, puntos_equipo_b]
        );

        // 2. Verificar estado del partido (¿Alguien ganó ya?)
        const setsRes = await client.query('SELECT * FROM sets_partido WHERE partido_id = $1 ORDER BY numero_set', [partido_id]);
        const sets = setsRes.rows;

        let setsA = 0;
        let setsB = 0;
        sets.forEach(s => {
            if (s.puntos_equipo_a > s.puntos_equipo_b) setsA++;
            else if (s.puntos_equipo_b > s.puntos_equipo_a) setsB++;
        });

        const partidoRes = await client.query('SELECT nivel_id, estado FROM partidos WHERE id = $1', [partido_id]);
        const { nivel_id } = partidoRes.rows[0];

        let nuevoEstado = 'en_curso';
        if (setsA === 3 || setsB === 3) {
            nuevoEstado = 'finalizado';
            writeLog(`🏁 [ARBITRO] Partido ${partido_id} FINALIZADO. Resultado: ${setsA}-${setsB}`);
        }

        // 3. Actualizar estado y resultado global del partido
        await client.query(
            'UPDATE partidos SET resultado_equipo_a = $1, resultado_equipo_b = $2, estado = $3 WHERE id = $4',
            [setsA, setsB, nuevoEstado, partido_id]
        );

        // 4. Si el partido finalizó, disparar toda la lógica de torneos
        if (nuevoEstado === 'finalizado') {
            writeLog('🔄 [ARBITRO] Recalculando estadísticas y verificando fases...');
            await recalculateLevelStats(client, nivel_id);
            await checkAndCreateFinal(client, nivel_id);
            await checkAndSetChampion(client, nivel_id);
        } else {
            writeLog(`ℹ️ [ARBITRO] Partido ${partido_id} sigue en curso. No se verifica la fase final.`);
        }

        await client.query('COMMIT');
        res.json({ message: 'Set registrado' });

    } catch (error) {
        await client.query('ROLLBACK');
        writeLog(`🔥 [ARBITRO] ERROR CRÍTICO registrando set: ${error.message}`);
        res.status(500).json({ message: 'Error al registrar el set: ' + error.message });
    } finally {
        client.release();
    }
};