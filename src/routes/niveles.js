const express = require('express');
const router = express.Router();
const nivelesController = require('../controllers/nivelesController');
const { verifyToken } = require('../middleware/auth'); // Asumiendo que solo usuarios logueados pueden ver
const { checkRole } = require('../middleware/auth'); // Asumiendo middleware que verifica si es admin

router.get('/', nivelesController.getAllNiveles); // Quitamos verifyToken para que sea una ruta pública
router.get('/torneo/:torneoId', verifyToken, nivelesController.getNivelesByTorneo);
router.get('/:id/candidatos-final', verifyToken, nivelesController.getCandidatosFinal);
router.post('/', verifyToken, checkRole(['admin']), nivelesController.createNivel);
router.put('/:id', verifyToken, checkRole(['admin']), nivelesController.updateNivel);
router.delete('/:id', verifyToken, checkRole(['admin']), nivelesController.deleteNivel);

module.exports = router;