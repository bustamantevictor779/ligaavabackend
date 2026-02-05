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
        c.id, c.nombre, c.sede_id, c.liga_id, c.categoria, 
        c.logo_url, c.estado, c.created_at,
        s.nombre as sede_nombre,
        l.nombre as liga_nombre
      FROM clubes c
      LEFT JOIN sedes s ON c.sede_id = s.id
      LEFT JOIN ligas l ON c.liga_id = l.id
      ORDER BY c.nombre ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al obtener clubes' });
  }
};

// Obtener clubes por liga
exports.getClubesByLiga = async (req, res) => {
  try {
    const { ligaId } = req.params;
    const result = await pool.query(
      `SELECT 
        c.id, c.nombre, c.sede_id, c.liga_id, c.categoria, 
        c.logo_url, c.estado,
        s.nombre as sede_nombre
      FROM clubes c
      LEFT JOIN sedes s ON c.sede_id = s.id
      WHERE c.liga_id = $1
      ORDER BY c.nombre ASC`,
      [ligaId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al obtener clubes' });
  }
};

// Obtener un club por ID
exports.getClubeById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT 
        c.id, c.nombre, c.sede_id, c.liga_id, c.categoria, 
        c.logo_url, c.estado, c.created_at,
        s.nombre as sede_nombre,
        l.nombre as liga_nombre
      FROM clubes c
      LEFT JOIN sedes s ON c.sede_id = s.id
      LEFT JOIN ligas l ON c.liga_id = l.id
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
    const { nombre, sede_id, liga_id, categoria, logo_url, estado = 'activo' } = req.body;

    // Validar campos requeridos
    if (!nombre || !categoria) {
      return res.status(400).json({ error: 'Nombre y categoría son requeridos' });
    }

    // Validar que categoría sea válida
    if (!['masculino', 'femenino'].includes(categoria)) {
      return res.status(400).json({ error: 'Categoría inválida' });
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

    // Si se proporciona liga_id, validar que exista
    if (liga_id) {
      const ligaCheck = await pool.query('SELECT id FROM ligas WHERE id = $1', [liga_id]);
      if (ligaCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Liga no encontrada' });
      }
    }

    const result = await pool.query(
      `INSERT INTO clubes (nombre, sede_id, liga_id, categoria, logo_url, estado)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, nombre, sede_id, liga_id, categoria, logo_url, estado, created_at`,
      [nombre, sede_id || null, liga_id || null, categoria, logo_url || null, estado]
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
    const { nombre, sede_id, liga_id, categoria, logo_url, estado } = req.body;

    // Verificar que el club existe
    const clubeCheck = await pool.query('SELECT id FROM clubes WHERE id = $1', [id]);
    if (clubeCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Club no encontrado' });
    }

    // Validar campos si se proporcionan
    if (categoria && !['masculino', 'femenino'].includes(categoria)) {
      return res.status(400).json({ error: 'Categoría inválida' });
    }

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

    // Validar liga si se proporciona
    if (liga_id) {
      const ligaCheck = await pool.query('SELECT id FROM ligas WHERE id = $1', [liga_id]);
      if (ligaCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Liga no encontrada' });
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
    if (liga_id !== undefined) {
      fields.push(`liga_id = $${paramCount++}`);
      values.push(liga_id || null);
    }
    if (categoria !== undefined) {
      fields.push(`categoria = $${paramCount++}`);
      values.push(categoria);
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
       RETURNING id, nombre, sede_id, liga_id, categoria, logo_url, estado, created_at`,
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
      'SELECT id FROM partidos WHERE club_a_id = $1 OR club_b_id = $1',
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
