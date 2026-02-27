const express = require('express');
const router = express.Router();
const { 
  getTablaPosiciones, 
  getGanadoresDeGrupos, 
  getMisTablasPosiciones 
} = require('../controllers/estadisticasController');
const { verifyToken, checkRole } = require('../middleware/auth'); // Middleware de autenticación y roles

// Ruta pública para que cualquiera pueda ver la tabla
router.get('/nivel/:nivelId', getTablaPosiciones);
router.get('/ganadores-grupos/:parentNivelId', getGanadoresDeGrupos);

// Ruta privada para que el delegado vea sus tablas
router.get('/mis-posiciones', verifyToken, checkRole(['delegado']), getMisTablasPosiciones);


module.exports = router;