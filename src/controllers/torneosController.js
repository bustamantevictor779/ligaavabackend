const pool = require('../config/database');

// Obtener todos los torneos
const getAllTorneos = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM torneos 
       ORDER BY 
         CASE WHEN estado = 'activo' THEN 0 ELSE 1 END,
         fecha_inicio DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting torneos:', error);
    res.status(500).json({ error: 'Error al obtener torneos' });
  }
};

// Obtener un torneo por ID
const getTorneoById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM torneos WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Torneo no encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting torneo:', error);
    res.status(500).json({ error: 'Error al obtener torneo' });
  }
};

// Obtener torneos por año
const getTorneosByYear = async (req, res) => {
  try {
    const { año } = req.params;
    const result = await pool.query(
      'SELECT * FROM torneos WHERE año = $1 ORDER BY fecha_inicio DESC',
      [año]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting torneos:', error);
    res.status(500).json({ error: 'Error al obtener torneos' });
  }
};

// Crear torneo (admin)
const createTorneo = async (req, res) => {
  try {
    const { nombre, año, fecha_inicio, fecha_fin } = req.body;

    if (!nombre || !año || !fecha_inicio || !fecha_fin) {
      return res.status(400).json({ 
        error: 'Nombre, año, fecha_inicio y fecha_fin son requeridos' 
      });
    }

    // Validar que fecha_fin sea después de fecha_inicio
    if (new Date(fecha_fin) <= new Date(fecha_inicio)) {
      return res.status(400).json({ 
        error: 'La fecha de fin debe ser posterior a la fecha de inicio' 
      });
    }

    const result = await pool.query(
      `INSERT INTO torneos (nombre, año, fecha_inicio, fecha_fin, estado, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [nombre, año, fecha_inicio, fecha_fin, 'activo']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating torneo:', error);
    res.status(500).json({ error: 'Error al crear torneo' });
  }
};

// Actualizar torneo (admin)
const updateTorneo = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, año, fecha_inicio, fecha_fin, estado } = req.body;

    // Si se proporcionan fechas, validar que fecha_fin sea después de fecha_inicio
    if (fecha_inicio && fecha_fin && new Date(fecha_fin) <= new Date(fecha_inicio)) {
      return res.status(400).json({ 
        error: 'La fecha de fin debe ser posterior a la fecha de inicio' 
      });
    }

    const result = await pool.query(
      `UPDATE torneos 
       SET nombre = COALESCE($1, nombre),
           año = COALESCE($2, año),
           fecha_inicio = COALESCE($3, fecha_inicio),
           fecha_fin = COALESCE($4, fecha_fin),
           estado = COALESCE($5, estado)
       WHERE id = $6
       RETURNING *`,
      [nombre, año, fecha_inicio, fecha_fin, estado, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Torneo no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating torneo:', error);
    res.status(500).json({ error: 'Error al actualizar torneo' });
  }
};

// Eliminar torneo (admin)
const deleteTorneo = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // 1. Eliminar sets de partidos del torneo
    await client.query(`
      DELETE FROM sets_partido 
      WHERE partido_id IN (SELECT id FROM partidos WHERE torneo_id = $1)
    `, [id]);

    // 2. Eliminar partidos del torneo
    await client.query('DELETE FROM partidos WHERE torneo_id = $1', [id]);

    // 3. Eliminar estadísticas de equipos del torneo
    await client.query('DELETE FROM estadisticas_equipos WHERE torneo_id = $1', [id]);

    // 4. Desvincular equipos de los niveles del torneo
    await client.query(`
      UPDATE equipos 
      SET nivel_id = NULL 
      WHERE nivel_id IN (SELECT id FROM niveles WHERE torneo_id = $1)
    `, [id]);

    // 5. Eliminar niveles del torneo
    await client.query('DELETE FROM niveles WHERE torneo_id = $1', [id]);

    // 6. Eliminar el torneo
    const result = await client.query('DELETE FROM torneos WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Torneo no encontrado' });
    }

    await client.query('COMMIT');
    res.json({ message: 'Torneo eliminado correctamente', torneo: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting torneo:', error);
    res.status(500).json({ error: 'Error al eliminar torneo' });
  } finally {
    client.release();
  }
};

module.exports = {
  getAllTorneos,
  getTorneoById,
  getTorneosByYear,
  createTorneo,
  updateTorneo,
  deleteTorneo
};
