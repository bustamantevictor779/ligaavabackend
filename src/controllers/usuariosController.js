const pool = require('../config/database');
const bcrypt = require('bcryptjs');

// Obtener todos los árbitros
exports.getArbitros = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.nombre, u.role, u.estado, u.created_at,
       (SELECT COUNT(*)::int FROM partidos p WHERE p.arbitro_id = u.id) as "partidosAsignados"
       FROM usuarios u 
       WHERE u.role = 'arbitro' 
       ORDER BY u.nombre ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al obtener árbitros' });
  }
};

// Crear árbitro (password por defecto 12345678)
exports.createArbitro = async (req, res) => {
  try {
    const { nombre, username } = req.body;

    if (!nombre || !username) {
      return res.status(400).json({ error: 'Nombre y usuario son requeridos' });
    }

    // Verificar si el usuario ya existe
    const userCheck = await pool.query('SELECT id FROM usuarios WHERE username = $1', [username]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'El nombre de usuario ya está en uso' });
    }

    // Encriptar contraseña por defecto
    const salt = await bcrypt.genSalt(10);
    const defaultPassword = '12345678';
    const hashedPassword = await bcrypt.hash(defaultPassword, salt);

    const result = await pool.query(
      `INSERT INTO usuarios (nombre, username, password, role, estado, password_reset, created_at)
       VALUES ($1, $2, $3, 'arbitro', 'activo', TRUE, NOW())
       RETURNING id, nombre, username, role, estado`,
      [nombre, username, hashedPassword]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al crear árbitro' });
  }
};

// Actualizar usuario
exports.updateUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, username } = req.body;

    const result = await pool.query(
      `UPDATE usuarios 
       SET nombre = COALESCE($1, nombre),
           username = COALESCE($2, username),
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, nombre, username, role, estado`,
      [nombre, username, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
};

// Cambiar estado (Activar/Desactivar)
exports.toggleEstado = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    
    await client.query('BEGIN');

    // Obtener estado actual e invertirlo
    const current = await client.query('SELECT role, estado FROM usuarios WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const { role, estado } = current.rows[0];
    const newState = estado === 'activo' ? 'inactivo' : 'activo';

    const result = await client.query(
      'UPDATE usuarios SET estado = $1 WHERE id = $2 RETURNING id, estado',
      [newState, id]
    );

    // Si es delegado y se desactiva, desactivar sus equipos automáticamente
    if (role === 'delegado' && newState === 'inactivo') {
      await client.query(`
        UPDATE equipos 
        SET estado = 'inactivo' 
        WHERE sede_id IN (SELECT sede_id FROM delegados_sedes WHERE usuario_id = $1)
      `, [id]);
    }

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al cambiar estado' });
  } finally {
    client.release();
  }
};

// Reiniciar contraseña a default
exports.resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('12345678', salt);

    await pool.query(
      'UPDATE usuarios SET password = $1, password_reset = true WHERE id = $2',
      [hashedPassword, id]
    );

    res.json({ message: 'Contraseña reiniciada correctamente' });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al reiniciar contraseña' });
  }
};

// --- GESTIÓN DE DELEGADOS ---

// Obtener todos los delegados con su sede
exports.getDelegados = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.nombre, u.role, u.estado, u.created_at, u.telefono,
              s.id as sede_id, s.nombre as sede_nombre, ds.nombre_club
       FROM usuarios u 
       LEFT JOIN delegados_sedes ds ON u.id = ds.usuario_id
       LEFT JOIN sedes s ON ds.sede_id = s.id
       WHERE u.role = 'delegado' 
       ORDER BY u.nombre ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al obtener delegados' });
  }
};

// Crear delegado (con sede y password default)
exports.createDelegado = async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, username, sede_id, telefono, nombre_club } = req.body;

    if (!nombre || !username || !sede_id || !nombre_club) {
      return res.status(400).json({ error: 'Nombre, usuario y sede son requeridos' });
    }

    await client.query('BEGIN');

    // Verificar usuario
    const userCheck = await client.query('SELECT id FROM usuarios WHERE username = $1', [username]);
    if (userCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El nombre de usuario ya está en uso' });
    }

    // Hash password default 12345678
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('12345678', salt);

    // Insertar usuario
    const userResult = await client.query(
      `INSERT INTO usuarios (nombre, username, password, role, estado, telefono, password_reset, created_at)
       VALUES ($1, $2, $3, 'delegado', 'activo', $4, TRUE, NOW())
       RETURNING id, nombre, username, role, estado`,
      [nombre, username, hashedPassword, telefono || null]
    );
    const newUser = userResult.rows[0];

    // Insertar relación sede
    await client.query(
      `INSERT INTO delegados_sedes (usuario_id, sede_id, nombre_club) VALUES ($1, $2, $3)`,
      [newUser.id, sede_id, nombre_club]
    );

    await client.query('COMMIT');
    res.status(201).json({ ...newUser, sede_id, sede_nombre: 'Sede asignada' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al crear delegado' });
  } finally {
    client.release();
  }
};

// Verificar si el usuario necesita cambiar contraseña
exports.checkPasswordStatus = async (req, res) => {
  try {
    const { id } = req.user;
    const result = await pool.query('SELECT password_reset FROM usuarios WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ password_reset: result.rows[0].password_reset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al verificar estado' });
  }
};

// Cambiar contraseña propia
exports.changePassword = async (req, res) => {
  try {
    const { id } = req.user;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await pool.query('UPDATE usuarios SET password = $1, password_reset = FALSE WHERE id = $2', [hashedPassword, id]);
    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
};

// Actualizar delegado (incluyendo sede)
exports.updateDelegado = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { nombre, username, sede_id, telefono, nombre_club } = req.body;

    await client.query('BEGIN');

    // Actualizar datos básicos
    await client.query(
      `UPDATE usuarios SET nombre = COALESCE($1, nombre), username = COALESCE($2, username), telefono = COALESCE($3, telefono), updated_at = NOW() WHERE id = $4`,
      [nombre, username, telefono, id]
    );

    // Actualizar sede y club si se proporciona
    if (sede_id || nombre_club) {
      const checkSede = await client.query('SELECT id FROM delegados_sedes WHERE usuario_id = $1', [id]);
      if (checkSede.rows.length > 0) {
        await client.query('UPDATE delegados_sedes SET sede_id = COALESCE($1, sede_id), nombre_club = COALESCE($2, nombre_club) WHERE usuario_id = $3', [sede_id, nombre_club, id]);
      } else {
        await client.query('INSERT INTO delegados_sedes (usuario_id, sede_id, nombre_club) VALUES ($1, $2, $3)', [id, sede_id, nombre_club]);
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Delegado actualizado correctamente' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al actualizar delegado' });
  } finally {
    client.release();
  }
};