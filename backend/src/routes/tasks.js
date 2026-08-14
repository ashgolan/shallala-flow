const express = require('express');
const router  = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');
const ctrl = require('../controllers/taskController');

// ============================================================
//  tasks.js — طلبات/مهام التواصل بين المدير العام والمراقبين
//  route منفصل عن admin.js عمداً: هنا كل من admin و viewer يقدر
//  يقرأ ويكتب (خلافاً لـ admin.js اللي يمنع viewer من الكتابة)،
//  لأن الفكرة أصلاً تواصل بالاتجاهين.
// ============================================================
router.use(requireAdmin);

router.get ('/pending-count', ctrl.getPendingCount);
router.get ('/',              ctrl.getTasks);
router.post('/',              ctrl.createTask);
router.put ('/:id/done',      ctrl.markDone);
router.put ('/:id/reopen',    ctrl.reopenTask);
router.post('/upload-image',  uploadLimiter, ctrl.uploadImage);

module.exports = router;