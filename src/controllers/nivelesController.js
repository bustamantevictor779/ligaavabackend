const pool = require('../config/database');

// Obtener todos los niveles con nombre de torneo y campeón
exports.getAllNiveles = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        n.*, 
        t.nombre as torneo_nombre,
        c.nombre as campeon_nombre 
       FROM niveles n
       LEFT JOIN torneos t ON n.torneo_id = t.id
       LEFT JOIN equipos c ON n.campeon_id = c.id
       ORDER BY n.torneo_id, n.id`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting niveles:', error);
    res.status(500).json({ message: 'Error al obtener niveles' });
  }
};

// Obtener niveles por torneo
exports.getNivelesByTorneo = async (req, res) => {
    try {
        const { torneoId } = req.params;
        const result = await pool.query('SELECT * FROM niveles WHERE torneo_id = $1 ORDER BY nombre', [torneoId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting niveles by torneo:', error);
        res.status(500).json({ message: 'Error al obtener niveles del torneo' });
    }
};

// Crear nivel
exports.createNivel = async (req, res) => {
    try {
        const { nombre, categoria, torneo_id, tipo, nivel_padre_id } = req.body;
        if (!nombre || !categoria || !torneo_id || !tipo) {
            return res.status(400).json({ message: 'Faltan campos requeridos' });
        }
        const result = await pool.query(
            `INSERT INTO niveles (nombre, categoria, torneo_id, tipo, nivel_padre_id, estado) 
             VALUES ($1, $2, $3, $4, $5, 'activo') RETURNING *`,
            [nombre, categoria, torneo_id, tipo, nivel_padre_id || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating nivel:', error);
        res.status(500).json({ message: 'Error al crear el nivel' });
    }
};

// Actualizar nivel (¡AQUÍ ESTÁ LA CORRECCIÓN!)
exports.updateNivel = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, categoria, estado, nivel_padre_id, campeon_id } = req.body;

    const result = await pool.query(
      `UPDATE niveles 
       SET 
         nombre = COALESCE($1, nombre),
         categoria = COALESCE($2, categoria),
         estado = COALESCE($3, estado),
         nivel_padre_id = $4, -- Permitir setear a null
         campeon_id = $5     -- Permitir setear a un valor o a null
       WHERE id = $6
       RETURNING *`,
      [nombre, categoria, estado, nivel_padre_id, campeon_id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Nivel no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating nivel:', error);
    res.status(500).json({ message: 'Error al actualizar nivel' });
  }
};

// Eliminar nivel
exports.deleteNivel = async (req, res) => {
    try {
        const { id } = req.params;
        // Verificar si tiene equipos asociados
        const check = await pool.query('SELECT 1 FROM equipos WHERE nivel_id = $1 LIMIT 1');
        if (check.rows.length > 0) {
            return res.status(400).json({ message: 'No se puede eliminar, el nivel tiene equipos inscritos.' });
        }
        await pool.query('DELETE FROM niveles WHERE id = $1', [id]);
        res.json({ message: 'Nivel eliminado' });
    } catch (error) {
        console.error('Error deleting nivel:', error);
        res.status(500).json({ message: 'Error al eliminar el nivel' });
    }
};

// Obtener candidatos para la final (ganadores de semis)
exports.getCandidatosFinal = async (req, res) => {
  try {
    const { id } = req.params; // nivel_id del playoff
    
    // Buscamos partidos de este nivel que sean semifinales y tengan un ganador (3 sets)
    const query = `
      SELECT 
        CASE 
            WHEN resultado_equipo_a = 3 THEN equipo_a_id
            WHEN resultado_equipo_b = 3 THEN equipo_b_id
        END as id,
        CASE 
            WHEN resultado_equipo_a = 3 THEN ea.nombre
            WHEN resultado_equipo_b = 3 THEN eb.nombre
        END as nombre
      FROM partidos p
      JOIN equipos ea ON p.equipo_a_id = ea.id
      JOIN equipos eb ON p.equipo_b_id = eb.id
      WHERE p.nivel_id = $1 
      AND (p.instancia ILIKE '%semifinal%' OR p.instancia ILIKE '%semi%')
      AND (p.resultado_equipo_a = 3 OR p.resultado_equipo_b = 3)
    `;

    const result = await pool.query(query, [id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting candidatos final:', error);
    res.status(500).json({ message: 'Error al obtener candidatos para la final' });
  }
};