const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

// Login
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validar que los datos estén presentes
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Usuario y contraseña son requeridos'
      });
    }

    // Buscar usuario por username
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE username = $1 AND estado = $2',
      [username, 'activo']
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    const usuario = result.rows[0];

    // Validar contraseña
    const passwordValida = await bcrypt.compare(password, usuario.password);

    if (!passwordValida) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Generar token JWT
    const token = jwt.sign(
      {
        id: usuario.id,
        username: usuario.username,
        role: usuario.role,
        nombre: usuario.nombre
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Login exitoso',
      token,
      usuario: {
        id: usuario.id,
        username: usuario.username,
        nombre: usuario.nombre,
        role: usuario.role
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
};

// Register
const register = async (req, res) => {
  try {
    const { username, password, nombre, role } = req.body;

    // Validar datos
    if (!username || !password || !nombre || !role) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos son requeridos'
      });
    }

    // Validar rol
    const rolesValidos = ['admin', 'arbitro', 'delegado'];
    if (!rolesValidos.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Rol inválido'
      });
    }

    // Verificar si el username ya existe
    const usernameExistente = await pool.query(
      'SELECT id FROM usuarios WHERE username = $1',
      [username]
    );

    if (usernameExistente.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'El usuario ya está registrado'
      });
    }

    // Encriptar contraseña
    const salt = await bcrypt.genSalt(10);
    const passwordEncriptada = await bcrypt.hash(password, salt);

    // Crear usuario
    const resultado = await pool.query(
      `INSERT INTO usuarios (username, password, nombre, role, estado) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, username, nombre, role`,
      [username, passwordEncriptada, nombre, role, 'activo']
    );

    const usuarioCreado = resultado.rows[0];

    // Generar token
    const token = jwt.sign(
      {
        id: usuarioCreado.id,
        username: usuarioCreado.username,
        role: usuarioCreado.role,
        nombre: usuarioCreado.nombre
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      token,
      usuario: {
        id: usuarioCreado.id,
        username: usuarioCreado.username,
        nombre: usuarioCreado.nombre,
        role: usuarioCreado.role
      }
    });
  } catch (error) {
    console.error('Error en register:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
};

// Logout (solo es por frontend, el backend no hace nada especial)
const logout = (req, res) => {
  res.json({
    success: true,
    message: 'Sesión cerrada'
  });
};

// Obtener datos del usuario autenticado
const getMe = async (req, res) => {
  try {
    const usuarioId = req.user.id;

    const result = await pool.query(
      'SELECT id, username, nombre, role, estado FROM usuarios WHERE id = $1',
      [usuarioId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    res.json({
      success: true,
      usuario: result.rows[0]
    });
  } catch (error) {
    console.error('Error en getMe:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
};

module.exports = {
  login,
  register,
  logout,
  getMe
};
