const express = require('express');
const authController = require('../controller/auth');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/protected', authController.protectedRoute);

module.exports = router;