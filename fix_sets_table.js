require('dotenv').config();
const pool = require('./src/config/database');

async function fixSetsTable() {
  const client = await pool.connect();
  try {
    console.log('🛠️  Verificando tabla sets_partido...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS sets_partido(
        id SERIAL PRIMARY KEY,
        partido_id INTEGER REFERENCES partidos(id) ON DELETE CASCADE,
        numero_set INTEGER NOT NULL,
        puntos_equipo_a INTEGER DEFAULT 0,
        puntos_equipo_b INTEGER DEFAULT 0,
        ganador VARCHAR(10)
      );
    `);
    
    // Índice único para evitar sets duplicados en un mismo partido
    await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sets_partido_numero 
        ON sets_partido (partido_id, numero_set);
    `);

    console.log('✅ Tabla sets_partido lista.');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    pool.end();
    process.exit();
  }
}

fixSetsTable();