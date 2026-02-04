const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');

// Rutas públicas
router.post('/login',verifyToken, authController.login);
router.post('/register', authController.register);
router.post('/logout', authController.logout);

// Rutas protegidas
router.get('/me', verifyToken, authController.getMe);

module.exports = router;
