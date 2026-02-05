const express = require('express');
const router = express.Router();
const utilsController = require('../controllers/utilsController');

router.post('/resolve-url', utilsController.resolveUrl);

module.exports = router;