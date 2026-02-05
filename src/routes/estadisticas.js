const express = require('express');
const router = express.Router();
const estadisticasController = require('../controllers/estadisticasController');

// Ruta pública para que cualquiera pueda ver la tabla
router.get('/nivel/:nivelId', estadisticasController.getTablaPosiciones);
router.get('/ganadores-grupos/:parentNivelId', estadisticasController.getGanadoresDeGrupos);

module.exports = router;