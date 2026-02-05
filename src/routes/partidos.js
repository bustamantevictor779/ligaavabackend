const express = require('express');
const router = express.Router();
const partidosController = require('../controllers/partidosController');
const { verifyToken } = require('../middleware/auth');

// Rutas
router.get('/', partidosController.getAllPartidos);
router.post('/fixture', verifyToken, partidosController.createFixture);
router.post('/', verifyToken, partidosController.createPartido);
router.get('/mis-partidos', verifyToken, partidosController.getMisPartidos);
router.get('/mis-fechas', verifyToken, partidosController.getFechasConPartidosArbitro);
router.get('/mis-partidos-delegado', verifyToken, partidosController.getPartidosDelegado);
router.put('/:id', verifyToken, partidosController.updatePartido);
router.delete('/:id', verifyToken, partidosController.deletePartido);
router.post('/:id/marcar-ausente', verifyToken, partidosController.marcarAusente);
router.post('/:id/admin-result', verifyToken, partidosController.adminUpdateResult);

module.exports = router;