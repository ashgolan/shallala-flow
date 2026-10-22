const express = require('express');
const router  = express.Router();
const { verifyAdminToken, verifyReaderToken, verifyViewerToken } = require('../utils/jwt');
const { Privileged } = require('../models/Settings');
const ctrl = require('../controllers/readerController');

// ════════════════════════════════════════════════════════════
//  /api/reader — صفحة إدخال القراءات (الناطور)
//  ✅ مسموح لـ:
//     • المدير الرئيسي (admin) — بما فيه إعداد الدورة
//     • الناطور (role: reader) — توكن بمفتاح منفصل ما بيفتح أي مسار إدارة
//     • المراقب المعلَّم "ناطور" (viewer + canEnterReadings) — إدخال فقط
//  ✅ للناطور وللمراقب: نفحص الصلاحية من قاعدة البيانات بكل طلب، فإذا
//     انشال أو انلغت صلاحيته بتوقف فوراً بدون ما نستنى انتهاء التوكن.
// ════════════════════════════════════════════════════════════
const findPrivileged = async (userId) => {
  if (!userId) return null;
  const doc = await Privileged.findOne({ key: 'privileged' }).lean();
  return (doc?.users || []).find(u => u._id.toString() === String(userId)) || null;
};

const requireReaderOrAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
      return res.status(401).json({ error: 'غير مصرح' });
    const token = authHeader.split(' ')[1];

    try {
      const d = verifyAdminToken(token);
      if (d.role === 'admin') {
        req.readerRole  = 'admin';
        req.readerId    = d.userId || '';
        req.readerLabel = d.label  || '';
        return next();
      }
    } catch (e) {
      if (e.name === 'TokenExpiredError')
        return res.status(401).json({ error: 'انتهت صلاحية الجلسة', expired: true });
    }

    try {
      const d = verifyReaderToken(token);
      if (d.role === 'reader') {
        const u = await findPrivileged(d.userId);
        if (!u || u.role !== 'reader') return res.status(403).json({ error: 'غير مصرح' });
        req.readerRole  = 'reader';
        req.readerId    = d.userId || '';
        req.readerLabel = u.label || d.label || '';
        return next();
      }
    } catch (e) {
      if (e.name === 'TokenExpiredError')
        return res.status(401).json({ error: 'انتهت صلاحية الجلسة', expired: true });
    }

    try {
      const d = verifyViewerToken(token);
      if (d.role === 'viewer') {
        const u = await findPrivileged(d.userId);
        if (!u || u.role !== 'viewer' || !u.canEnterReadings)
          return res.status(403).json({ error: 'غير مصرح — هذا المراقب ليس ناطوراً' });
        req.readerRole  = 'reader';   // ✅ صلاحيات ناطور بالضبط (بدون إعداد الدورة)
        req.readerId    = d.userId || '';
        req.readerLabel = u.label || d.label || '';
        return next();
      }
    } catch (e) {
      if (e.name === 'TokenExpiredError')
        return res.status(401).json({ error: 'انتهت صلاحية الجلسة', expired: true });
    }

    return res.status(401).json({ error: 'رمز غير صالح' });
  } catch (err) {
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

router.use(requireReaderOrAdmin);

router.get ('/cycle',  ctrl.getCycle);
router.put ('/cycle',  ctrl.updateCycle);          // المدير فقط (فحص داخل الكنترولر)
router.get ('/meters', ctrl.getMeters);
router.post('/entries', ctrl.saveEntry);
router.post('/stations/:stationNumber/location', ctrl.saveStationLocation);

module.exports = router;
