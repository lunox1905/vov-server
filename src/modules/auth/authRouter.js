const express = require('express');
const authController = require('./authController');

const router = express.Router();

router.get('/', (req,res) => {
   res.send(200).json({ok:"ok"})
})
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/protected', authController.protectedRoute);

module.exports = router;