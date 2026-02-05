const express = require('express');
const router = express.Router();
const configuracionController = require('../controllers/configuracionController');
const { verifyToken, checkRole } = require('../middleware/auth');

// Obtener estado (Delegados y Admin)
router.get('/inscripcion', verifyToken, configuracionController.getInscripcionStatus);

// Cambiar estado (Solo Admin) - Usamos POST para enviar el nuevo estado
router.post('/inscripcion', verifyToken, checkRole(['admin']), configuracionController.updateInscripcion);

module.exports = router;