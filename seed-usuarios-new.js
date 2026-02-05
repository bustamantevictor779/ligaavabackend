/**
 * Script para crear usuarios de prueba con username
 * Uso: node seed-usuarios-new.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./src/config/database');

const usuariosTest = [
  {
    username: 'admin',
    password: 'password123',
    nombre: 'Administrador',
    role: 'admin'
  },
  {
    username: 'arbitro',
    password: 'password123',
    nombre: 'Juan Pérez',
    role: 'arbitro'
  },
  {
    username: 'delegado',
    password: 'password123',
    nombre: 'María García',
    role: 'delegado'
  }
];

async function seedUsuarios() {
  try {
    console.log('🌱 Iniciando seed de usuarios con username...');

    for (const usuario of usuariosTest) {
      // Verificar si el usuario ya existe
      const existe = await pool.query(
        'SELECT id FROM usuarios WHERE username = $1',
        [usuario.username]
      );

      if (existe.rows.length > 0) {
        console.log(`⏭️  Usuario ${usuario.username} ya existe, saltando...`);
        continue;
      }

      // Encriptar contraseña
      const salt = await bcrypt.genSalt(10);
      const passwordEncriptada = await bcrypt.hash(usuario.password, salt);

      // Insertar usuario
      const resultado = await pool.query(
        `INSERT INTO usuarios (username, password, nombre, role, estado) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING id, username, nombre, role`,
        [usuario.username, passwordEncriptada, usuario.nombre, usuario.role, 'activo']
      );

      const usuarioCreado = resultado.rows[0];
      console.log(`✅ Usuario creado: ${usuarioCreado.username} (${usuarioCreado.role})`);
    }

    console.log('\n📋 Usuarios en la base de datos:');
    const allUsuarios = await pool.query(
      'SELECT id, username, nombre, role, estado FROM usuarios ORDER BY id'
    );
    console.table(allUsuarios.rows);

    console.log('\n✅ Seed completado');
    console.log('\n📝 Usuarios de prueba para login:');
    usuariosTest.forEach(u => {
      console.log(`   - Usuario: ${u.username} | Contraseña: ${u.password}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en seed:', error);
    process.exit(1);
  }
}

seedUsuarios();
