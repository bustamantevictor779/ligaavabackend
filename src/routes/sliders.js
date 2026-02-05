const express = require('express');
const router = express.Router();
const slidersController = require('../controllers/slidersController');
const { verifyToken, checkRole } = require('../middleware/auth');

// Rutas públicas
router.get('/', slidersController.getAllSliders);
router.get('/:id', slidersController.getSliderById);

// Rutas admin (protegidas)
router.get('/admin/all', verifyToken, checkRole(['admin']), slidersController.getAllSlidersAdmin);
router.post('/', verifyToken, checkRole(['admin']), slidersController.createSlider);
router.put('/:id', verifyToken, checkRole(['admin']), slidersController.updateSlider);
router.delete('/:id', verifyToken, checkRole(['admin']), slidersController.deleteSlider);

module.exports = router;
