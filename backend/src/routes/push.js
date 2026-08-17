const express = require('express');
const router  = express.Router();
const { requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/pushController');

// ============================================================
//  push.js — إدارة اشتراكات إشعارات الهاتف (Web Push)
//  admin وviewer معاً يقدروا يشتركوا/يلغوا اشتراك أجهزتهم
// ============================================================
router.use(requireAdmin);

router.post('/subscribe',   ctrl.subscribe);
router.post('/unsubscribe', ctrl.unsubscribe);

module.exports = router;