const express = require('express');
const router = express.Router();
const sedesController = require('../controllers/sedesController');
const { verifyToken, checkRole } = require('../middleware/auth');

// Rutas públicas
router.get('/', sedesController.getAllSedes);
router.get('/:id', sedesController.getSedeById);

// Rutas admin (protegidas)
router.get('/admin/all', verifyToken, checkRole(['admin']), sedesController.getAllSedesAdmin);
router.post('/', verifyToken, checkRole(['admin']), sedesController.createSede);
router.put('/:id', verifyToken, checkRole(['admin']), sedesController.updateSede);
router.delete('/:id', verifyToken, checkRole(['admin']), sedesController.deleteSede);

module.exports = router;
