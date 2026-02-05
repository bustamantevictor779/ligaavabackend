const pool = require('../config/database');

// Obtener todos los clubes
exports.getAllClubos = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM clubes ORDER BY nombre ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al obtener clubes' });
  }
};

// Obtener clubes admin (con más detalles)
exports.getAllClubesAdmin = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        c.id, c.nombre, c.sede_id, c.logo_url, c.estado, c.created_at,
        s.nombre as sede_nombre,
        (SELECT COUNT(*)::int FROM jugadores j JOIN equipos e ON j.equipo_id = e.id WHERE e.club_id = c.id) as cantidad_jugadores
      FROM clubes c
      LEFT JOIN sedes s ON c.sede_id = s.id
      ORDER BY c.nombre ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al obtener clubes' });
  }
};

// Obtener clubes por nivel (usando la tabla equipos)
exports.getClubesByNivel = async (req, res) => {
  try {
    const { nivelId } = req.params;
    const result = await pool.query(
      `SELECT 
        c.id, c.nombre, c.sede_id, c.logo_url, c.estado,
        s.nombre as sede_nombre
      FROM clubes c
      JOIN equipos e ON c.id = e.club_id
      LEFT JOIN sedes s ON c.sede_id = s.id
      WHERE e.nivel_id = $1
      ORDER BY c.nombre ASC`,
      [nivelId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al obtener clubes por nivel' });
  }
};

// Obtener un club por ID
exports.getClubeById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT 
        c.id, c.nombre, c.sede_id, c.logo_url, c.estado, c.created_at,
        s.nombre as sede_nombre,
        (SELECT COUNT(*)::int FROM jugadores j JOIN equipos e ON j.equipo_id = e.id WHERE e.club_id = c.id) as cantidad_jugadores
      FROM clubes c
      LEFT JOIN sedes s ON c.sede_id = s.id
      WHERE c.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Club no encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al obtener el club' });
  }
};

// Crear club
exports.createClube = async (req, res) => {
  try {
    const { nombre, sede_id, logo_url, estado = 'activo' } = req.body;

    // Validar campos requeridos
    if (!nombre) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }

    // Validar estado
    if (estado && !['activo', 'inactivo'].includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    // Si se proporciona sede_id, validar que exista
    if (sede_id) {
      const sedeCheck = await pool.query('SELECT id FROM sedes WHERE id = $1', [sede_id]);
      if (sedeCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Sede no encontrada' });
      }
    }

    const result = await pool.query(
      `INSERT INTO clubes (nombre, sede_id, logo_url, estado)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, sede_id, logo_url, estado, created_at`,
      [nombre, sede_id || null, logo_url || null, estado]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al crear club' });
  }
};

// Actualizar club
exports.updateClube = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, sede_id, logo_url, estado } = req.body;

    // Verificar que el club existe
    const clubeCheck = await pool.query('SELECT id FROM clubes WHERE id = $1', [id]);
    if (clubeCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Club no encontrado' });
    }

    // Validar campos si se proporcionan
    if (estado && !['activo', 'inactivo'].includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    // Validar sede si se proporciona
    if (sede_id) {
      const sedeCheck = await pool.query('SELECT id FROM sedes WHERE id = $1', [sede_id]);
      if (sedeCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Sede no encontrada' });
      }
    }

    const fields = [];
    const values = [];
    let paramCount = 1;

    if (nombre !== undefined) {
      fields.push(`nombre = $${paramCount++}`);
      values.push(nombre);
    }
    if (sede_id !== undefined) {
      fields.push(`sede_id = $${paramCount++}`);
      values.push(sede_id || null);
    }
    if (logo_url !== undefined) {
      fields.push(`logo_url = $${paramCount++}`);
      values.push(logo_url || null);
    }
    if (estado !== undefined) {
      fields.push(`estado = $${paramCount++}`);
      values.push(estado);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE clubes SET ${fields.join(', ')} WHERE id = $${paramCount}
       RETURNING id, nombre, sede_id, logo_url, estado, created_at`,
      values
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al actualizar club' });
  }
};

// Eliminar club
exports.deleteClube = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el club existe
    const clubeCheck = await pool.query('SELECT id FROM clubes WHERE id = $1', [id]);
    if (clubeCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Club no encontrado' });
    }

    // Verificar que no haya partidos asociados
    const partidosCheck = await pool.query(
      `SELECT p.id FROM partidos p
       JOIN equipos e ON (p.equipo_a_id = e.id OR p.equipo_b_id = e.id)
       WHERE e.club_id = $1`,
      [id]
    );

    if (partidosCheck.rows.length > 0) {
      return res.status(400).json({ 
        error: 'No se puede eliminar el club porque tiene partidos asociados' 
      });
    }

    await pool.query('DELETE FROM clubes WHERE id = $1', [id]);

    res.json({ message: 'Club eliminado correctamente' });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al eliminar club' });
  }
};
