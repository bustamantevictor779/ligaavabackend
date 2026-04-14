const pool = require('./src/config/database');
const bcrypt = require('bcryptjs');

const createAdmin = async () => {
  try {
    console.log('🚀 Iniciando script de creación de Admin...');

    // Datos del admin
    const userData = {
      username: 'victorbus',
      passwordPlain: 'vicbus1978',
      nombre: 'Victor Bus (Admin)',
      role: 'admin'
    };

    // 1. Encriptar la contraseña
    console.log('🔒 Encriptando contraseña...');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(userData.passwordPlain, salt);

    // 2. Verificar si el usuario ya existe (por username o email)
    const checkRes = await pool.query('SELECT * FROM usuarios WHERE username = $1', [
      userData.username
    ]);
    
    if (checkRes.rows.length > 0) {
      console.log(`⚠️ El usuario "${userData.username}" ya existe en la base de datos.`);
      
      // Opcional: Forzar actualización de contraseña y rol si ya existe
      await pool.query(
        `UPDATE usuarios 
         SET password = $1, role = $2, estado = 'activo' 
         WHERE username = $3`, 
        [passwordHash, userData.role, userData.username]
      );
      console.log(`🔄 Se han actualizado las credenciales y permisos del usuario existente.`);
      
    } else {
      // 3. Insertar nuevo usuario
      await pool.query(
        `INSERT INTO usuarios (nombre, username, password, role, estado, created_at)
         VALUES ($1, $2, $3, $4, 'activo', NOW())`,
        [userData.nombre, userData.username, passwordHash, userData.role]
      );
      console.log(`✅ ¡Usuario Admin creado exitosamente!`);
      console.log(`👤 Usuario: ${userData.username}`);
      console.log(`🔑 Contraseña: ${userData.passwordPlain}`);
    }

  } catch (error) {
    console.error('❌ Error al ejecutar el script:', error);
  } finally {
    // Cerrar la conexión a la base de datos
    await pool.end();
    console.log('👋 Conexión cerrada.');
  }
};

createAdmin();
