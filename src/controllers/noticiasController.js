const pool = require('../config/database');

// Obtener todas las noticias activas (público)
const getAllNoticias = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM noticias WHERE estado = $1 ORDER BY created_at DESC',
      ['activo']
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting noticias:', error);
    res.status(500).json({ error: 'Error al obtener noticias' });
  }
};

// Obtener una noticia por ID
const getNoticiaById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM noticias WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Noticia no encontrada' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting noticia:', error);
    res.status(500).json({ error: 'Error al obtener noticia' });
  }
};

// Crear noticia (admin)
const createNoticia = async (req, res) => {
  try {
    const { titulo, descripcion, contenido } = req.body;

    // Validaciones
    if (!titulo || !contenido) {
      return res.status(400).json({ error: 'Título y contenido son requeridos' });
    }

    const result = await pool.query(
      `INSERT INTO noticias (titulo, descripcion, contenido, estado, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
      [titulo, descripcion || null, contenido, 'activo']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating noticia:', error);
    res.status(500).json({ error: 'Error al crear noticia' });
  }
};

// Actualizar noticia (admin)
const updateNoticia = async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, descripcion, contenido, estado } = req.body;

    const result = await pool.query(
      `UPDATE noticias 
       SET titulo = COALESCE($1, titulo),
           descripcion = COALESCE($2, descripcion),
           contenido = COALESCE($3, contenido),
           estado = COALESCE($4, estado),
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [titulo, descripcion, contenido, estado, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Noticia no encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating noticia:', error);
    res.status(500).json({ error: 'Error al actualizar noticia' });
  }
};

// Eliminar noticia (admin)
const deleteNoticia = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM noticias WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Noticia no encontrada' });
    }

    res.json({ message: 'Noticia eliminada correctamente', noticia: result.rows[0] });
  } catch (error) {
    console.error('Error deleting noticia:', error);
    res.status(500).json({ error: 'Error al eliminar noticia' });
  }
};

// Obtener todas las noticias (incluyendo inactivas) para admin
const getAllNoticiasAdmin = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM noticias ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting noticias:', error);
    res.status(500).json({ error: 'Error al obtener noticias' });
  }
};

module.exports = {
  getAllNoticias,
  getNoticiaById,
  createNoticia,
  updateNoticia,
  deleteNoticia,
  getAllNoticiasAdmin
};
