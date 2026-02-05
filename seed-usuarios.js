/**
 * Script para crear usuarios de prueba
 * Uso: node seed-usuarios.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./src/config/database');

const usuariosTest = [
  {
    email: 'admin@ligaava.com',
    password: 'password123',
    nombre: 'Administrador',
    role: 'admin'
  },
  {
    email: 'arbitro@ligaava.com',
    password: 'password123',
    nombre: 'Juan Pérez',
    role: 'arbitro'
  },
  {
    email: 'delegado@ligaava.com',
    password: 'password123',
    nombre: 'María García',
    role: 'delegado'
  }
];

async function seedUsuarios() {
  try {
    console.log('🌱 Iniciando seed de usuarios...');

    for (const usuario of usuariosTest) {
      // Verificar si el usuario ya existe
      const existe = await pool.query(
        'SELECT id FROM usuarios WHERE email = $1',
        [usuario.email]
      );

      if (existe.rows.length > 0) {
        console.log(`⏭️  Usuario ${usuario.email} ya existe, saltando...`);
        continue;
      }

      // Encriptar contraseña
      const salt = await bcrypt.genSalt(10);
      const passwordEncriptada = await bcrypt.hash(usuario.password, salt);

      // Insertar usuario
      const resultado = await pool.query(
        `INSERT INTO usuarios (email, password, nombre, role, estado) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING id, email, nombre, role`,
        [usuario.email, passwordEncriptada, usuario.nombre, usuario.role, 'activo']
      );

      const usuarioCreado = resultado.rows[0];
      console.log(`✅ Usuario creado: ${usuarioCreado.email} (${usuarioCreado.role})`);
    }

    console.log('\n📋 Usuarios en la base de datos:');
    const allUsuarios = await pool.query(
      'SELECT id, email, nombre, role, estado FROM usuarios ORDER BY id'
    );
    console.table(allUsuarios.rows);

    console.log('\n✅ Seed completado');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en seed:', error);
    process.exit(1);
  }
}

seedUsuarios();
