const express = require('express');
const router = express.Router();
const clubesController = require('../controllers/clubesController');
const { verifyToken } = require('../middleware/auth');

// Obtener todos los clubes
router.get('/', clubesController.getAllClubos);

// Obtener clubes con detalles (admin)
router.get('/admin/all', verifyToken, clubesController.getAllClubesAdmin);

// Obtener clubes por nivel
router.get('/nivel/:nivelId', clubesController.getClubesByNivel); // Filtrar por nivel

// Obtener un club específico
router.get('/:id', clubesController.getClubeById);

// Crear club (solo admin)
router.post('/', verifyToken, clubesController.createClube);

// Actualizar club (solo admin)
router.put('/:id', verifyToken, clubesController.updateClube);

// Eliminar club (solo admin)
router.delete('/:id', verifyToken, clubesController.deleteClube);

module.exports = router;
