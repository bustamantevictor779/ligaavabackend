const pool = require('../config/database');

// Función auxiliar para ordenar equipos según reglas personalizadas
const sortTeams = (teams, matches) => {
  return teams.sort((a, b) => {
    // 1. Puntos en la tabla (Mayor es mejor)
    if (b.puntos_tabla !== a.puntos_tabla) {
      return b.puntos_tabla - a.puntos_tabla;
    }

    // 2. Partido entre sí (Head-to-head)
    // Buscamos si jugaron un partido finalizado entre ellos
    const match = matches.find(m => 
      (m.equipo_a_id === a.equipo_id && m.equipo_b_id === b.equipo_id) ||
      (m.equipo_a_id === b.equipo_id && m.equipo_b_id === a.equipo_id)
    );

    if (match) {
      let winnerId = null;
      if (match.resultado_equipo_a > match.resultado_equipo_b) winnerId = match.equipo_a_id;
      else if (match.resultado_equipo_b > match.resultado_equipo_a) winnerId = match.equipo_b_id;
      
      if (winnerId) {
        // Si A ganó, A va primero (-1)
        if (winnerId === a.equipo_id) return -1;
        if (winnerId === b.equipo_id) return 1;
      }
    }

    // 3. Sets Positivos / Sets Ganados (Mayor es mejor)
    if (b.sets_ganados !== a.sets_ganados) {
      return b.sets_ganados - a.sets_ganados;
    }

    // 4. Diferencia de Sets (Fallback estándar)
    const diffSetsA = a.sets_ganados - a.sets_perdidos;
    const diffSetsB = b.sets_ganados - b.sets_perdidos;
    if (diffSetsB !== diffSetsA) {
      return diffSetsB - diffSetsA;
    }

    // 5. Diferencia de Puntos (Fallback final)
    const diffPuntosA = a.puntos_favor - a.puntos_contra;
    const diffPuntosB = b.puntos_favor - b.puntos_contra;
    return diffPuntosB - diffPuntosA;
  });
};

exports.getTablaPosiciones = async (req, res) => {
  try {
    const { nivelId } = req.params;
    
    // 1. Obtener estadísticas de los equipos
    const statsResult = await pool.query(`
      SELECT
        st.id,
        st.equipo_id,
        eq.nombre as club_nombre,
        eq.logo_url as club_logo,
        eq.nombre_extra,
        st.partidos_jugados,
        st.partidos_ganados,
        st.partidos_perdidos,
        st.sets_ganados,
        st.sets_perdidos,
        st.puntos_favor,
        st.puntos_contra,
        st.puntos_tabla,
        (st.puntos_favor - st.puntos_contra) as diferencia_puntos
      FROM estadisticas_equipos st
      JOIN equipos eq ON st.equipo_id = eq.id
      WHERE st.nivel_id = $1
    `, [nivelId]);

    // 2. Obtener partidos finalizados de este nivel para el desempate
    const matchesResult = await pool.query(`
      SELECT equipo_a_id, equipo_b_id, resultado_equipo_a, resultado_equipo_b
      FROM partidos
      WHERE nivel_id = $1 AND estado = 'finalizado'
    `, [nivelId]);

    // 3. Ordenar usando la lógica personalizada
    const sortedTeams = sortTeams(statsResult.rows, matchesResult.rows);

    res.json(sortedTeams);
  } catch (error) {
    console.error('Error getting tabla posiciones:', error);
    res.status(500).json({ message: 'Error al obtener la tabla de posiciones' });
  }
};

exports.getGanadoresDeGrupos = async (req, res) => {
  try {
    const { parentNivelId } = req.params;

    // 1. Encontrar todos los niveles descendientes (hojas) que tienen equipos/estadísticas
    // Usamos CTE recursiva para obtener todos los descendientes
    const descendantsQuery = `
      WITH RECURSIVE descendants AS (
        SELECT id, nivel_padre_id, nombre FROM niveles WHERE nivel_padre_id = $1
        UNION
        SELECT n.id, n.nivel_padre_id, n.nombre 
        FROM niveles n
        INNER JOIN descendants d ON n.nivel_padre_id = d.id
      )
      SELECT d.id 
      FROM descendants d
      WHERE EXISTS (SELECT 1 FROM estadisticas_equipos st WHERE st.nivel_id = d.id)
    `;
    
    const descendantsResult = await pool.query(descendantsQuery, [parentNivelId]);
    const activeLevelIds = descendantsResult.rows.map(r => r.id);
    const numGrupos = activeLevelIds.length;

    if (numGrupos === 0) return res.json([]);

    // Regla de clasificación para llegar a 4 equipos (Semifinales):
    // - 4 grupos -> Clasifica 1 por grupo
    // - 2 grupos -> Clasifican 2 por grupo
    // - 1 grupo  -> Clasifican 4 por grupo
    let clasificadosPorGrupo = numGrupos >= 4 ? 1 : (numGrupos === 1 ? 4 : 2);

    // 2. Obtener estadísticas de todos los equipos involucrados
    const statsResult = await pool.query(`
        SELECT
          st.equipo_id,
          st.nivel_id,
          eq.nombre as club_nombre,
          eq.nombre_extra,
          n.nombre as nivel_nombre,
          st.puntos_tabla,
          st.sets_ganados,
          st.sets_perdidos,
          st.puntos_favor,
          st.puntos_contra
        FROM estadisticas_equipos st
        JOIN equipos eq ON st.equipo_id = eq.id
        JOIN niveles n ON st.nivel_id = n.id
        WHERE st.nivel_id = ANY($1::int[])
    `, [activeLevelIds]);

    // 3. Obtener partidos para desempate
    const matchesResult = await pool.query(`
      SELECT nivel_id, equipo_a_id, equipo_b_id, resultado_equipo_a, resultado_equipo_b
      FROM partidos
      WHERE nivel_id = ANY($1::int[]) AND estado = 'finalizado'
    `, [activeLevelIds]);

    // 4. Agrupar por nivel, ordenar y seleccionar ganadores
    const winners = [];
    
    // Agrupar equipos por nivel
    const teamsByLevel = {};
    statsResult.rows.forEach(t => {
      if (!teamsByLevel[t.nivel_id]) teamsByLevel[t.nivel_id] = [];
      teamsByLevel[t.nivel_id].push(t);
    });

    // Agrupar partidos por nivel
    const matchesByLevel = {};
    matchesResult.rows.forEach(m => {
      if (!matchesByLevel[m.nivel_id]) matchesByLevel[m.nivel_id] = [];
      matchesByLevel[m.nivel_id].push(m);
    });

    // Procesar cada nivel
    for (const levelId of activeLevelIds) {
      if (teamsByLevel[levelId]) {
        // Ordenar con la misma lógica que la tabla de posiciones
        const sorted = sortTeams(teamsByLevel[levelId], matchesByLevel[levelId] || []);
        
        // Asignar ranking y filtrar
        sorted.forEach((t, i) => t.rn = i + 1);
        const topTeams = sorted.filter(t => t.rn <= clasificadosPorGrupo);
        winners.push(...topTeams);
      }
    }

    // Ordenar resultado final para consistencia visual
    winners.sort((a, b) => {
        if (a.nivel_id !== b.nivel_id) return a.nivel_id - b.nivel_id;
        return a.rn - b.rn;
    });

    res.json(winners);
  } catch (error) {
    console.error('Error getting ganadores de grupos:', error);
    res.status(500).json({ message: 'Error al obtener los ganadores de los grupos' });
  }
};