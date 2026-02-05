require('dotenv').config();
const pool = require('./src/config/database');

async function fixDatabase() {
  const client = await pool.connect();
  try {
    console.log('🛠️  Iniciando actualización de base de datos...');

    // 1. Agregar columnas equipo_a_id y equipo_b_id a la tabla partidos
    await client.query(`
      ALTER TABLE partidos 
      ADD COLUMN IF NOT EXISTS equipo_a_id INTEGER REFERENCES equipos(id),
      ADD COLUMN IF NOT EXISTS equipo_b_id INTEGER REFERENCES equipos(id);
    `);
    console.log('✅ Columnas de equipos agregadas a tabla partidos.');

    // 2. Hacer nullable las columnas antiguas de clubes (si existen) para evitar errores al insertar solo equipos
    try {
      await client.query(`
        ALTER TABLE partidos ALTER COLUMN club_a_id DROP NOT NULL;
        ALTER TABLE partidos ALTER COLUMN club_b_id DROP NOT NULL;
      `);
      console.log('✅ Columnas antiguas de clubes ahora permiten NULL (compatibilidad).');
    } catch (e) {
      console.log('ℹ️  Omitiendo modificación de columnas de clubes (probablemente no existen).');
    }

    console.log('✨ Base de datos actualizada con éxito.');
  } catch (error) {
    console.error('❌ Error actualizando BD:', error);
  } finally {
    client.release();
    pool.end();
    process.exit();
  }
}

fixDatabase();