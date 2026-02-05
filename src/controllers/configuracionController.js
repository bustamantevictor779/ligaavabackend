const pool = require('../config/database');

exports.getInscripcionStatus = async (req, res) => {
  try {
    const result = await pool.query("SELECT valor FROM configuraciones WHERE clave = 'inscripcion_abierta'");
    // Si existe y es 'true', entonces está abierto. Si no existe o es 'false', está cerrado.
    const isOpen = result.rows.length > 0 && result.rows[0].valor === 'true';
    res.json({ inscripcion_abierta: isOpen });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
};

// Actualizar estado de inscripción (Recibe { estado: true/false })
exports.updateInscripcion = async (req, res) => {
  try {
    const { estado } = req.body; 
    // Forzamos a que sea string 'true' o 'false' para evitar errores
    const valor = (estado === true || estado === 'true') ? 'true' : 'false';
    
    await pool.query(
      "INSERT INTO configuraciones (clave, valor) VALUES ('inscripcion_abierta', $1) ON CONFLICT (clave) DO UPDATE SET valor = $1, updated_at = NOW()",
      [valor]
    );
    
    res.json({ message: 'Configuración actualizada', inscripcion_abierta: valor === 'true' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar configuración' });
  }
};