const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuariosController');
const { verifyToken } = require('../middleware/auth');

// Rutas de Árbitros
router.get('/arbitros', verifyToken, usuariosController.getArbitros);
router.post('/arbitros', verifyToken, usuariosController.createArbitro);
router.put('/:id', verifyToken, usuariosController.updateUsuario);
router.patch('/:id/estado', verifyToken, usuariosController.toggleEstado);
router.post('/:id/reset-password', verifyToken, usuariosController.resetPassword);

// Rutas de Delegados
router.get('/delegados', verifyToken, usuariosController.getDelegados);
router.post('/delegados', verifyToken, usuariosController.createDelegado);
router.put('/delegados/:id', verifyToken, usuariosController.updateDelegado);

// Rutas de Usuario (Propias)
router.get('/me/status', verifyToken, usuariosController.checkPasswordStatus);
router.post('/me/change-password', verifyToken, usuariosController.changePassword);

module.exports = router;