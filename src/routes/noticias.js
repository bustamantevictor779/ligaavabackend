const express = require('express');
const router = express.Router();
const noticiasController = require('../controllers/noticiasController');
const { verifyToken, checkRole } = require('../middleware/auth');

// Rutas públicas
router.get('/', noticiasController.getAllNoticias);
router.get('/:id', noticiasController.getNoticiaById);

// Rutas admin (protegidas)
router.get('/admin/all', verifyToken, checkRole(['admin']), noticiasController.getAllNoticiasAdmin);
router.post('/', verifyToken, checkRole(['admin']), noticiasController.createNoticia);
router.put('/:id', verifyToken, checkRole(['admin']), noticiasController.updateNoticia);
router.delete('/:id', verifyToken, checkRole(['admin']), noticiasController.deleteNoticia);

module.exports = router;
