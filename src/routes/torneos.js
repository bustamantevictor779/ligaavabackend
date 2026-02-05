const express = require('express');
const router = express.Router();
const torneosController = require('../controllers/torneosController');
const { verifyToken } = require('../middleware/auth');

// Rutas públicas (visibles para todos)
router.get('/', torneosController.getAllTorneos);
router.get('/:id', torneosController.getTorneoById);
router.get('/anio/:año', torneosController.getTorneosByYear);

// Rutas protegidas (solo admin)
router.post('/', verifyToken, torneosController.createTorneo);
router.put('/:id', verifyToken, torneosController.updateTorneo);
router.delete('/:id', verifyToken, torneosController.deleteTorneo);

module.exports = router;