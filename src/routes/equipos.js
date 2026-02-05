const express = require('express');
const router = express.Router();
const equiposController = require('../controllers/equiposController');
const { verifyToken } = require('../middleware/auth');

// Rutas públicas
router.get('/', equiposController.getAllEquipos);
router.get('/mis-equipos', verifyToken, equiposController.getEquiposDelegado);
router.get('/:id', equiposController.getEquipoById);

// Rutas protegidas
router.post('/', verifyToken, equiposController.createEquipo);
router.put('/:id', verifyToken, equiposController.updateEquipo);
router.delete('/:id', verifyToken, equiposController.deleteEquipo);

module.exports = router;