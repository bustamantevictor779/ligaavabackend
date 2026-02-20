const pool = require('../config/database');

// Obtener estado de cuenta de todos los equipos de un torneo
exports.getPagosByTorneo = async (req, res) => {
    const { torneoId } = req.params;
    try {
        // Traemos TODOS los equipos activos del sistema
        // y hacemos LEFT JOIN con la tabla de pagos para ver si tienen registros en este torneo
        const query = `
            SELECT
                e.id as equipo_id,
                e.nombre as equipo_nombre,
                e.logo_url,
                n.nombre as nivel_nombre,
                COALESCE(p.monto_total, 0) as monto_total,
                COALESCE(p.monto_pagado, 0) as monto_pagado
            FROM equipos e
            LEFT JOIN niveles n ON e.nivel_id = n.id
            LEFT JOIN pagos p ON p.equipo_id = e.id AND p.torneo_id = $1
            WHERE e.estado = 'activo'
            ORDER BY e.nombre
        `;
        const result = await pool.query(query, [torneoId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting pagos:', error);
        res.status(500).json({ message: 'Error al obtener pagos' });
    }
};

// Actualizar (o crear) registro de pago
exports.updatePago = async (req, res) => {
    const { torneo_id, equipo_id, monto_total, monto_pagado } = req.body;
    try {
        // Usamos UPSERT (Insert on conflict update) para manejar la creación o edición
        const query = `
            INSERT INTO pagos (torneo_id, equipo_id, monto_total, monto_pagado, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (torneo_id, equipo_id)
            DO UPDATE SET
                monto_total = EXCLUDED.monto_total,
                monto_pagado = EXCLUDED.monto_pagado,
                updated_at = NOW()
        `;
        await pool.query(query, [torneo_id, equipo_id, monto_total, monto_pagado]);
        res.json({ message: 'Pago actualizado correctamente' });
    } catch (error) {
        console.error('Error updating pago:', error);
        res.status(500).json({ message: 'Error al actualizar pago' });
    }
};
