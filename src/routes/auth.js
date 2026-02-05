const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');

// Rutas públicas (sin autenticación)
router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/logout', authController.logout);

// Rutas protegidas (requieren autenticación)
router.get('/me', verifyToken, authController.getMe);

module.exports = router;
