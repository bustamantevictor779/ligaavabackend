const express = require('express');
const router = express.Router();
const clubesController = require('../controllers/clubesController');
const auth = require('../middleware/auth');

// Obtener todos los clubes
router.get('/', clubesController.getAllClubos);

// Obtener clubes con detalles (admin)
router.get('/admin/all', auth, clubesController.getAllClubesAdmin);

// Obtener clubes por liga
router.get('/liga/:ligaId', clubesController.getClubesByLiga);

// Obtener un club específico
router.get('/:id', clubesController.getClubeById);

// Crear club (solo admin)
router.post('/', auth, clubesController.createClube);

// Actualizar club (solo admin)
router.put('/:id', auth, clubesController.updateClube);

// Eliminar club (solo admin)
router.delete('/:id', auth, clubesController.deleteClube);

module.exports = router;
