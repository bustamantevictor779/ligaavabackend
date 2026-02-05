const express = require('express');
const router = express.Router();
const jugadoresController = require('../controllers/jugadoresController');
const { verifyToken } = require('../middleware/auth');

router.get('/equipo/:equipoId', jugadoresController.getJugadoresByEquipo);
router.post('/', verifyToken, jugadoresController.createJugador);
router.put('/:id', verifyToken, jugadoresController.updateJugador);
router.delete('/:id', verifyToken, jugadoresController.deleteJugador);

module.exports = router;