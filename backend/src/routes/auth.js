const express = require('express');
const router  = express.Router();
const { checkIdentity, farmerLogin, adminLogin } = require('../controllers/authController');
const { checkLoginAttempts } = require('../middleware/loginProtection');
const { loginLimiter }       = require('../middleware/rateLimiter');

// Step 1: التحقق من الهوية والكود
router.post('/check-identity', checkLoginAttempts, loginLimiter, checkIdentity);

// Step 2a: دخول كمزارع
router.post('/farmer-login',   checkLoginAttempts, loginLimiter, farmerLogin);

// Step 2b: دخول كمدير أو مراقب
router.post('/admin-login',    checkLoginAttempts, loginLimiter, adminLogin);

module.exports = router;
