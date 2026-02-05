const express = require('express');
const router = express.Router();
const setsController = require('../controllers/setsController');
const { verifyToken } = require('../middleware/auth');

router.post('/', verifyToken, setsController.createSet);
router.delete('/:id', verifyToken, setsController.deleteSet);

module.exports = router;