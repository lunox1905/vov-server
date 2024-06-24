const express = require('express');
const authController = require('../controller/auth');

const router = express.Router();

router.get('/ping', (req,res) => {
   res.send(200).json({ok:"ok"})
})
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/protected', authController.protectedRoute);

module.exports = router;