const pool = require('../config/database');

// Obtener todas las sedes
const getAllSedes = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM sedes WHERE estado = $1 ORDER BY nombre ASC',
      ['activo']
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting sedes:', error);
    res.status(500).json({ error: 'Error al obtener sedes' });
  }
};

// Obtener todas las sedes incluyendo inactivas (admin)
const getAllSedesAdmin = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM sedes ORDER BY nombre ASC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting sedes:', error);
    res.status(500).json({ error: 'Error al obtener sedes' });
  }
};

// Obtener una sede por ID
const getSedeById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM sedes WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sede no encontrada' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting sede:', error);
    res.status(500).json({ error: 'Error al obtener sede' });
  }
};

// Crear sede (admin)
const createSede = async (req, res) => {
  try {
    const { nombre, ubicacion, coordenadas_lat, coordenadas_lng } = req.body;

    if (!nombre || !ubicacion) {
      return res.status(400).json({ error: 'Nombre y ubicación son requeridos' });
    }

    const result = await pool.query(
      `INSERT INTO sedes (nombre, ubicacion, coordenadas_lat, coordenadas_lng, estado, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [nombre, ubicacion, coordenadas_lat || null, coordenadas_lng || null, 'activo']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating sede:', error);
    res.status(500).json({ error: 'Error al crear sede' });
  }
};

// Actualizar sede (admin)
const updateSede = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, ubicacion, coordenadas_lat, coordenadas_lng, estado } = req.body;

    const result = await pool.query(
      `UPDATE sedes 
       SET nombre = COALESCE($1, nombre),
           ubicacion = COALESCE($2, ubicacion),
           coordenadas_lat = COALESCE($3, coordenadas_lat),
           coordenadas_lng = COALESCE($4, coordenadas_lng),
           estado = COALESCE($5, estado)
       WHERE id = $6
       RETURNING *`,
      [nombre, ubicacion, coordenadas_lat, coordenadas_lng, estado, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sede no encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating sede:', error);
    res.status(500).json({ error: 'Error al actualizar sede' });
  }
};

// Eliminar sede (admin)
const deleteSede = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si la sede tiene clubes asociados
    const clubs = await pool.query('SELECT COUNT(*) FROM clubes WHERE sede_id = $1', [id]);
    if (parseInt(clubs.rows[0].count) > 0) {
      return res.status(400).json({ error: 'No se puede eliminar una sede que tiene clubes asociados' });
    }

    const result = await pool.query('DELETE FROM sedes WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sede no encontrada' });
    }

    res.json({ message: 'Sede eliminada correctamente', sede: result.rows[0] });
  } catch (error) {
    console.error('Error deleting sede:', error);
    res.status(500).json({ error: 'Error al eliminar sede' });
  }
};

module.exports = {
  getAllSedes,
  getAllSedesAdmin,
  getSedeById,
  createSede,
  updateSede,
  deleteSede
};
