const express = require('express');
const router  = express.Router();
const { farmerLogin, adminLogin } = require('../controllers/authController');
const { loginLimiter }            = require('../middleware/rateLimiter');
const { checkLoginAttempts }      = require('../middleware/loginProtection');

// checkLoginAttempts يأتي قبل loginLimiter للتحقق من القفل أولاً
router.post('/farmer-login', checkLoginAttempts, loginLimiter, farmerLogin);
router.post('/admin-login',  checkLoginAttempts, loginLimiter, adminLogin);

module.exports = router;
