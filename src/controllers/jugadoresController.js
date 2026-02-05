const pool = require('../config/database');

// Obtener jugadores por equipo
exports.getJugadoresByEquipo = async (req, res) => {
  try {
    const { equipoId } = req.params;
    const result = await pool.query(
      'SELECT * FROM jugadores WHERE equipo_id = $1 ORDER BY nombre ASC',
      [equipoId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al obtener jugadores' });
  }
};

// Crear jugador
exports.createJugador = async (req, res) => {
  try {
    const { equipo_id, nombre, dni, fecha_nacimiento } = req.body;

    if (!equipo_id || !nombre || !dni || !fecha_nacimiento) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    // Validar límite de 18 jugadores
    const countResult = await pool.query('SELECT COUNT(*) FROM jugadores WHERE equipo_id = $1', [equipo_id]);
    if (parseInt(countResult.rows[0].count) >= 18) {
      return res.status(400).json({ error: 'El equipo ya tiene el máximo de 18 jugadores' });
    }

    // Validar DNI único (opcional, pero recomendado si la BD tiene constraint)
    const dniCheck = await pool.query('SELECT id FROM jugadores WHERE dni = $1', [dni]);
    if (dniCheck.rows.length > 0) {
      return res.status(400).json({ error: 'El DNI ya está registrado' });
    }

    const result = await pool.query(
      `INSERT INTO jugadores (equipo_id, nombre, dni, fecha_nacimiento, estado)
       VALUES ($1, $2, $3, $4, 'activo')
       RETURNING *`,
      [equipo_id, nombre, dni, fecha_nacimiento]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al crear jugador' });
  }
};

// Actualizar jugador
exports.updateJugador = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, dni, fecha_nacimiento, estado } = req.body;

    const result = await pool.query(
      `UPDATE jugadores 
       SET nombre = COALESCE($1, nombre),
           dni = COALESCE($2, dni),
           fecha_nacimiento = COALESCE($3, fecha_nacimiento),
           estado = COALESCE($4, estado)
       WHERE id = $5
       RETURNING *`,
      [nombre, dni, fecha_nacimiento, estado, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Jugador no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al actualizar jugador' });
  }
};

// Eliminar jugador
exports.deleteJugador = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM jugadores WHERE id = $1', [id]);
    res.json({ message: 'Jugador eliminado' });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al eliminar jugador' });
  }
};