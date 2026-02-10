
const pool = require('../config/database');

// Obtener todos los equipos (con info de club y nivel)
exports.getAllEquipos = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        e.id, e.nivel_id, e.categoria, e.nombre_extra, e.estado,
        e.nombre, e.logo_url, e.sede_id,
        s.nombre as sede_nombre, s.ubicacion as sede_ubicacion,
        n.nombre as nivel_nombre, n.categoria as nivel_categoria,
        e.delegado_id, -- Nueva columna
        (
          SELECT u.nombre FROM usuarios u WHERE u.id = e.delegado_id
        ) as delegado_nombre,
        (
          SELECT u.telefono FROM usuarios u WHERE u.id = e.delegado_id
        ) as delegados_telefonos,
        (SELECT COUNT(*)::int FROM jugadores j WHERE j.equipo_id = e.id) as cantidad_jugadores
      FROM equipos e
      LEFT JOIN sedes s ON e.sede_id = s.id
      LEFT JOIN niveles n ON e.nivel_id = n.id
      ORDER BY e.nombre ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al obtener equipos' });
  }
};

// Obtener un equipo por ID
exports.getEquipoById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT 
        e.id, e.nivel_id, e.categoria, e.nombre_extra, e.estado,
        e.nombre, e.logo_url, e.sede_id,
        s.nombre as sede_nombre, s.ubicacion as sede_ubicacion,
        n.nombre as nivel_nombre, n.categoria as nivel_categoria,
        e.delegado_id, -- Nueva columna
        (
          SELECT u.nombre FROM usuarios u WHERE u.id = e.delegado_id
        ) as delegado_nombre,
        (
          SELECT u.telefono FROM usuarios u WHERE u.id = e.delegado_id
        ) as delegados_telefonos,
        (SELECT COUNT(*)::int FROM jugadores j WHERE j.equipo_id = e.id) as cantidad_jugadores
      FROM equipos e
      LEFT JOIN sedes s ON e.sede_id = s.id
      LEFT JOIN niveles n ON e.nivel_id = n.id
      WHERE e.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Equipo no encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al obtener el equipo' });
  }
};

// Crear un nuevo equipo
exports.createEquipo = async (req, res) => {
  try {
    const { nombre, sede_id, logo_url, nivel_id, categoria, nombre_extra, delegado_id, estado = 'activo' } = req.body;

    if (!nombre || !categoria) {
      return res.status(400).json({ error: 'Nombre y categoría son requeridos' });
    }

    const result = await pool.query(
      `INSERT INTO equipos (nombre, sede_id, logo_url, nivel_id, categoria, nombre_extra, delegado_id, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [nombre, sede_id || null, logo_url || null, nivel_id || null, categoria, nombre_extra || null, delegado_id || null, estado]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al crear equipo' });
  }
};

// Actualizar equipo
exports.updateEquipo = async (req, res) => {
  try {
    const { id } = req.params; // equipo_id
    const { nombre, sede_id, logo_url, nivel_id, categoria, nombre_extra, delegado_id, estado } = req.body;

    // Construcción dinámica de la query para permitir NULLs y actualizaciones parciales correctas
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (nombre !== undefined) { fields.push(`nombre = $${paramCount++}`); values.push(nombre); }
    if (sede_id !== undefined) { fields.push(`sede_id = $${paramCount++}`); values.push(sede_id); }
    if (logo_url !== undefined) { fields.push(`logo_url = $${paramCount++}`); values.push(logo_url); }
    if (nivel_id !== undefined) { fields.push(`nivel_id = $${paramCount++}`); values.push(nivel_id); }
    if (categoria !== undefined) { fields.push(`categoria = $${paramCount++}`); values.push(categoria); }
    if (delegado_id !== undefined) { fields.push(`delegado_id = $${paramCount++}`); values.push(delegado_id); } // Nueva columna
    if (nombre_extra !== undefined) { fields.push(`nombre_extra = $${paramCount++}`); values.push(nombre_extra); }
    if (estado !== undefined) { fields.push(`estado = $${paramCount++}`); values.push(estado); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No se enviaron campos para actualizar' });
    }

    values.push(id);
    
    // Consulta base para devolver los datos completos (joins) después del update
    const returningQuery = `
      WITH updated AS (
        UPDATE equipos SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *
      )
      SELECT u.*, 
        s.nombre as sede_nombre, 
        n.nombre as nivel_nombre, n.categoria as nivel_categoria,
        (SELECT usr.nombre FROM usuarios usr WHERE usr.id = u.delegado_id) as delegado_nombre,
        (SELECT usr.telefono FROM usuarios usr WHERE usr.id = u.delegado_id) as delegado_telefono
      FROM updated u
      LEFT JOIN sedes s ON u.sede_id = s.id
      LEFT JOIN niveles n ON u.nivel_id = n.id`;

    const result = await pool.query(returningQuery, values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Equipo no encontrado' });
    }

    // --- INICIALIZAR ESTADÍSTICAS ---
    // Si se asignó un nivel (nivel_id tiene valor), creamos la entrada en estadísticas
    if (nivel_id) {
      try {
        // 1. Obtener el torneo_id asociado al nivel
        const nivelInfo = await pool.query('SELECT torneo_id FROM niveles WHERE id = $1', [nivel_id]);
        
        if (nivelInfo.rows.length > 0) {
          const torneo_id = nivelInfo.rows[0].torneo_id;

          // 2. Insertar registro inicial en estadisticas_equipos
          // Usamos ON CONFLICT para no duplicar si ya existe (gracias al índice único creado)
          await pool.query(`
            INSERT INTO estadisticas_equipos 
              (equipo_id, nivel_id, torneo_id, partidos_jugados, partidos_ganados, partidos_perdidos, sets_ganados, sets_perdidos, puntos_favor, puntos_contra, puntos_tabla)
            VALUES 
              ($1, $2, $3, 0, 0, 0, 0, 0, 0, 0, 0)
            ON CONFLICT (equipo_id, nivel_id) DO NOTHING
          `, [id, nivel_id, torneo_id]);
        }
      } catch (statsError) {
        console.error('Error al inicializar estadísticas del equipo:', statsError);
      }
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al actualizar equipo' });
  }
};

// Eliminar equipo (o desactivar)
exports.deleteEquipo = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    
    // Verificar si tiene jugadores antes de borrar
    const jugadoresCheck = await client.query('SELECT count(*) FROM jugadores WHERE equipo_id = $1', [id]);
    if (parseInt(jugadoresCheck.rows[0].count) > 0) {
      client.release();
      return res.status(400).json({ error: 'No se puede eliminar: el equipo tiene jugadores asignados. Elimínalos primero.' });
    }

    await client.query('BEGIN');

    // 1. Eliminar sets de los partidos donde juega el equipo
    await client.query(`
      DELETE FROM sets_partido 
      WHERE partido_id IN (
        SELECT id FROM partidos WHERE equipo_a_id = $1 OR equipo_b_id = $1
      )
    `, [id]);

    // 2. Eliminar partidos donde juega el equipo
    await client.query(`
      DELETE FROM partidos WHERE equipo_a_id = $1 OR equipo_b_id = $1
    `, [id]);

    // 3. Eliminar estadísticas del equipo
    await client.query('DELETE FROM estadisticas_equipos WHERE equipo_id = $1', [id]);

    // 4. Eliminar el equipo
    await client.query('DELETE FROM equipos WHERE id = $1', [id]);

    await client.query('COMMIT');
    res.json({ message: 'Equipo y sus partidos asociados eliminados correctamente' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al eliminar equipo' });
  } finally {
    client.release();
  }
};

// Obtener equipos del delegado (basado en su usuario -> sede -> clubes -> equipos)
exports.getEquiposDelegado = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      `SELECT 
        e.id, e.nivel_id, e.categoria, e.nombre_extra, e.estado,
        e.nombre, e.logo_url,
        n.nombre as nivel_nombre,
        (SELECT COUNT(*)::int FROM jugadores j WHERE j.equipo_id = e.id) as cantidad_jugadores
      FROM equipos e
      JOIN delegados_sedes ds ON e.sede_id = ds.sede_id
      LEFT JOIN niveles n ON e.nivel_id = n.id
      WHERE ds.usuario_id = $1
      ORDER BY e.nombre ASC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ message: 'Error al obtener equipos del delegado: ' + err.message });
  }
};
