const pool = require('../config/database');

// Función auxiliar para ordenar equipos según reglas personalizadas
const sortTeams = (teams, matches) => {
  return teams.sort((a, b) => {
    // 1. Puntos en la tabla (Prioridad 1)
    const ptsA = Number(a.puntos_tabla) || 0;
    const ptsB = Number(b.puntos_tabla) || 0;
    if (ptsB !== ptsA) {
      return ptsB - ptsA;
    } 

        // 3. Partido entre sí (Head-to-head - Prioridad 3)
    // Buscamos si jugaron un partido finalizado entre ellos
    const match = matches.find(m =>
      (Number(m.equipo_a_id) === Number(a.equipo_id) && Number(m.equipo_b_id) === Number(b.equipo_id)) ||
      (Number(m.equipo_a_id) === Number(b.equipo_id) && Number(m.equipo_b_id) === Number(a.equipo_id))
    );

    if (match) {
      let winnerId = null;
      const resA = Number(match.resultado_equipo_a) || 0;
      const resB = Number(match.resultado_equipo_b) || 0;
      if (resA > resB) winnerId = match.equipo_a_id;
      else if (resB > resA) winnerId = match.equipo_b_id;
      
      if (winnerId) {
        if (Number(winnerId) === Number(a.equipo_id)) return -1;
        if (Number(winnerId) === Number(b.equipo_id)) return 1;
      }
    }

    // 2. Diferencia de Sets (Prioridad 2 - Total Sets / TS)
    // Corregimos la jerarquía para que la diferencia de sets (ganados - perdidos) sea el primer desempate
    const dsA = (Number(a.sets_ganados) || 0) - (Number(a.sets_perdidos) || 0);
    const dsB = (Number(b.sets_ganados) || 0) - (Number(b.sets_perdidos) || 0);
    if (dsB !== dsA) {
      return dsB - dsA;
    }



    // 4. Puntos a favor (Prioridad 4)
    const pfA = Number(a.puntos_favor) || 0;
    const pfB = Number(b.puntos_favor) || 0;
    if (pfB !== pfA) {
      return pfB - pfA;
    }

    // 5. Fallback: Diferencia de Puntos
    const dpA = (Number(a.puntos_favor) || 0) - (Number(a.puntos_contra) || 0);
    const dpB = (Number(b.puntos_favor) || 0) - (Number(b.puntos_contra) || 0);
    if (dpB !== dpA) return dpB - dpA;

    // 6. Fallback final: Sets a favor
    const sgA = Number(a.sets_ganados) || 0;
    const sgB = Number(b.sets_ganados) || 0;
    return sgB - sgA;
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
    const allRankedTeams = [];
    
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
        allRankedTeams.push(...sorted);
      }
    }

    // Ordenar globalmente a todos los equipos clasificados
    // Primero por el ranking dentro de su grupo, luego por puntos de tabla como desempate
    allRankedTeams.sort((a, b) => {
        if (a.rn !== b.rn) return a.rn - b.rn;
        return b.puntos_tabla - a.puntos_tabla;
    });

    res.json(allRankedTeams);
  } catch (error) {
    console.error('Error getting ganadores de grupos:', error);
    res.status(500).json({ message: 'Error al obtener los ganadores de los grupos' });
  }
};

// Obtener las tablas de posiciones de los niveles donde participa un delegado
exports.getMisTablasPosiciones = async (req, res) => {
  try {
    const delegadoId = req.user.id;

    // 1. Obtener los equipos del delegado que están en un nivel
    const misEquiposResult = await pool.query(
      `SELECT id, nivel_id FROM equipos WHERE delegado_id = $1 AND nivel_id IS NOT NULL`,
      [delegadoId]
    );

    const misEquipos = misEquiposResult.rows;

    if (misEquipos.length === 0) {
      return res.json([]); // No hay equipos en niveles
    }

    const myTeamIds = new Set(misEquipos.map(e => e.id));
    const uniqueNivelIds = [...new Set(misEquipos.map(e => e.nivel_id))];
    
    const result = [];

    for (const nivelId of uniqueNivelIds) {
      // Obtener nombre del nivel
      const nivelRes = await pool.query('SELECT nombre FROM niveles WHERE id = $1', [nivelId]);
      const nivelNombre = nivelRes.rows[0]?.nombre || 'Nivel Desconocido';

      // Obtener estadísticas completas del nivel
      const statsResult = await pool.query(`
        SELECT 
          st.equipo_id, 
          eq.nombre as club_nombre, 
          eq.logo_url as club_logo, 
          eq.nombre_extra,
          st.puntos_tabla, 
          st.partidos_jugados, 
          st.partidos_ganados, 
          st.partidos_perdidos,
          st.sets_ganados,
          st.sets_perdidos,
          st.puntos_favor,
          st.puntos_contra
        FROM estadisticas_equipos st
        JOIN equipos eq ON st.equipo_id = eq.id
        WHERE st.nivel_id = $1
      `, [nivelId]);

      const matchesResult = await pool.query(
        `SELECT equipo_a_id, equipo_b_id, resultado_equipo_a, resultado_equipo_b
         FROM partidos WHERE nivel_id = $1 AND estado = 'finalizado'`,
        [nivelId]
      );
      
      const sortedTable = sortTeams(statsResult.rows, matchesResult.rows);

      // Marcar equipos del delegado y asignar posición
      const tablaFinal = sortedTable.map((t, index) => ({
        posicion: index + 1,
        ...t,
        es_mi_equipo: myTeamIds.has(t.equipo_id)
      }));

      result.push({
        nivel_id: nivelId,
        nivel_nombre: nivelNombre,
        tabla: tablaFinal
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Error en getMisTablasPosiciones:', error);
    res.status(500).json({ message: 'Error al obtener las tablas de posiciones' });
  }
};