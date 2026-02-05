const pool = require('../config/database');

// Obtener todos los sliders activos (público)
const getAllSliders = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM sliders WHERE estado = $1 ORDER BY orden ASC',
      ['activo']
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting sliders:', error);
    res.status(500).json({ error: 'Error al obtener sliders' });
  }
};

// Obtener un slider por ID
const getSliderById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM sliders WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Slider no encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting slider:', error);
    res.status(500).json({ error: 'Error al obtener slider' });
  }
};

// Crear slider (admin)
const createSlider = async (req, res) => {
  try {
    const { titulo, descripcion, imagen_url, enlace, orden } = req.body;

    // Validaciones
    if (!titulo || !imagen_url) {
      return res.status(400).json({ error: 'Título e imagen_url son requeridos' });
    }

    const result = await pool.query(
      `INSERT INTO sliders (titulo, descripcion, imagen_url, enlace, orden, estado, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [titulo, descripcion || null, imagen_url, enlace || null, orden || 0, 'activo']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating slider:', error);
    res.status(500).json({ error: 'Error al crear slider' });
  }
};

// Actualizar slider (admin)
const updateSlider = async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, descripcion, imagen_url, enlace, orden, estado } = req.body;

    const result = await pool.query(
      `UPDATE sliders 
       SET titulo = COALESCE($1, titulo),
           descripcion = COALESCE($2, descripcion),
           imagen_url = COALESCE($3, imagen_url),
           enlace = COALESCE($4, enlace),
           orden = COALESCE($5, orden),
           estado = COALESCE($6, estado),
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [titulo, descripcion, imagen_url, enlace, orden, estado, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Slider no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating slider:', error);
    res.status(500).json({ error: 'Error al actualizar slider' });
  }
};

// Eliminar slider (admin)
const deleteSlider = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM sliders WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Slider no encontrado' });
    }

    res.json({ message: 'Slider eliminado correctamente', slider: result.rows[0] });
  } catch (error) {
    console.error('Error deleting slider:', error);
    res.status(500).json({ error: 'Error al eliminar slider' });
  }
};

// Obtener todos los sliders (incluyendo inactivos) para admin
const getAllSlidersAdmin = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM sliders ORDER BY orden ASC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting sliders:', error);
    res.status(500).json({ error: 'Error al obtener sliders' });
  }
};

module.exports = {
  getAllSliders,
  getSliderById,
  createSlider,
  updateSlider,
  deleteSlider,
  getAllSlidersAdmin
};
