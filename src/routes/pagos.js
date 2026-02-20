const express = require('express');
const router = express.Router();
const pagosController = require('../controllers/pagosController');
const { verifyToken, checkRole } = require('../middleware/auth');

// Obtener pagos de un torneo (Solo admin)
router.get('/torneo/:torneoId', verifyToken, checkRole(['admin']), pagosController.getPagosByTorneo);

// Actualizar pago (Solo admin)
router.post('/', verifyToken, checkRole(['admin']), pagosController.updatePago);

module.exports = router;
