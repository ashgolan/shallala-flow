const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { requireAdmin, requireAdminOnly } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');
const ctrl = require('../controllers/adminController');
const projectCtrl = require('../controllers/projectController');
const { getStorage } = require('../../config/firebase');

router.use(requireAdmin);

// ✅ يسمح لمراقب مصرّح له بمشروع معيّن بإدارة مشتركي/دفعات ذلك المشروع فقط
//    (باقي المسارات — بما فيها إنشاء/تعديل/حذف المشروع نفسه — تبقى محظورة على المراقب)
const isProjectMemberSubroute = (path) => /^\/projects\/[^/]+\/members(\/.*)?$/.test(path);

router.use((req, res, next) => {
  if (req.adminRole === 'viewer' && req.method !== 'GET') {
    if (isProjectMemberSubroute(req.path)) return next();
    return res.status(403).json({ error: 'غير مصرح — المراقب يمكنه القراءة فقط' });
  }
  next();
});

// ── Farmers ──────────────────────────────
router.get   ('/farmers',                ctrl.getFarmers);
router.post  ('/farmers',                ctrl.createFarmer);
router.put   ('/farmers/:farmerId',      ctrl.updateFarmer);
router.get   ('/farmers/:farmerId/code', ctrl.getFarmerCode);
router.delete('/farmers/:farmerId',      ctrl.deleteFarmer);

// ── Regions ───────────────────────────────
router.get   ('/regions',            ctrl.getRegions);
router.post  ('/regions',            ctrl.createRegion);
router.put   ('/regions/:regionId',  ctrl.updateRegion);
router.delete('/regions/:regionId',  ctrl.deleteRegion);

// ── Lands ────────────────────────────────
router.get   ('/lands',              ctrl.getLands);
router.post  ('/lands',              ctrl.createLand);
router.put   ('/lands/:landId',      ctrl.updateLand);
router.delete('/lands/:landId',      ctrl.deleteLand);

// ✅ تنظيف المحطات المكررة
router.post('/clean-duplicate-lands', ctrl.cleanDuplicateLands);

// ── Readings ─────────────────────────────
router.get   ('/readings',              ctrl.getReadings);
router.post  ('/readings',              ctrl.createReading);
router.put   ('/readings/:readingId',   ctrl.updateReading);
router.delete('/readings/:readingId',   ctrl.deleteReading);

// ── Prices ───────────────────────────────
router.get ('/prices',  ctrl.getPrices);
router.post('/prices',  ctrl.updatePrices);

// ── Settings ─────────────────────────────
router.get ('/announcement',   ctrl.getAnnouncement);
router.post('/announcement',   ctrl.updateAnnouncement);
router.post('/admin-password', ctrl.updateAdminPassword);
router.post('/video',          ctrl.updateVideo);

// ── Gallery ──────────────────────────────
router.get('/gallery', ctrl.getGallery);
router.put('/gallery', ctrl.updateGallery);

// ── Image Upload ─────────────────────────
router.post('/upload-image', uploadLimiter, async (req, res) => {
  try {
    const busboy = require('busboy');
    const bb = busboy({ headers: req.headers, limits: { fileSize: 5 * 1024 * 1024 } });
    const storage = getStorage();
    const bucket  = storage.bucket();
    let fileReceived = false;

    bb.on('file', (name, file, info) => {
      fileReceived = true;
      const { mimeType } = info;
      const allowed = ['image/jpeg','image/png','image/webp','image/gif'];
      if (!allowed.includes(mimeType)) {
        file.resume();
        if (!res.headersSent) res.status(400).json({ error: 'نوع الملف غير مسموح' });
        return;
      }
      const ext      = mimeType.split('/')[1];
      const fileName = `gallery/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const fileRef  = bucket.file(fileName);
      const stream   = fileRef.createWriteStream({ metadata: { contentType: mimeType }, public: true });
      file.pipe(stream);
      stream.on('finish', () => {
        if (res.headersSent) return;
        const uploadedUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        res.json({ success: true, url: uploadedUrl, path: fileName });
      });
      stream.on('error', (err) => {
        console.error('GCS upload stream error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'فشل الرفع إلى التخزين' });
      });
    });
    bb.on('finish', () => {
      if (!fileReceived && !res.headersSent) res.status(400).json({ error: 'لم يتم إرسال أي ملف' });
    });
    bb.on('error', (err) => {
      console.error('Busboy parse error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'خطأ في معالجة الملف المرفوع' });
    });
    req.pipe(bb);
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
});

router.delete('/image', async (req, res) => {
  try {
    const { path: imagePath } = req.body;
    if (!imagePath || !imagePath.startsWith('gallery/')) return res.status(403).json({ error: 'غير مسموح' });
    const storage = getStorage();
    await storage.bucket().file(imagePath).delete().catch(() => {});
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
});

// ── Privileged Users ──────────────────────────────────────────
router.get('/privileged', async (req, res) => {
  try {
    const { Privileged } = require('../models/Settings');
    const doc = await Privileged.findOne({ key: 'privileged' });
    const users = (doc?.users || []).map(u => ({
      id:       u._id.toString(),
      idNumber: u.idNumber,
      role:     u.role,
      label:    u.label,
      // ✅ المشاريع المسموح بإدارتها بالكامل (للمراقبين فقط)
      allowedProjectIds: u.allowedProjectIds || [],
    }));
    return res.json({ users });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
});

router.post('/privileged', async (req, res) => {
  try {
    const { Privileged } = require('../models/Settings');
    const { idNumber, role, label, password, allowedProjectIds } = req.body;
    if (!idNumber || !role || !password) return res.status(400).json({ error: 'رقم الهوية والدور وكلمة المرور مطلوبة' });
    if (!['admin','viewer'].includes(role)) return res.status(400).json({ error: 'الدور غير صالح' });
    if (password.length < 6) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    let doc = await Privileged.findOne({ key: 'privileged' });
    if (!doc) doc = new Privileged({ key: 'privileged', users: [] });
    const exists = doc.users.find(u => u.idNumber.trim() === idNumber.trim());
    if (exists) return res.status(409).json({ error: 'رقم الهوية موجود مسبقاً' });
    const hashedPassword = await bcrypt.hash(password, 12);
    doc.users.push({
      idNumber: idNumber.trim(), role, label: label||'', password: hashedPassword,
      // ✅ نخزن قائمة المشاريع فقط إذا كان الدور مراقب
      allowedProjectIds: role === 'viewer' ? (allowedProjectIds || []) : [],
    });
    doc.markModified('users');
    await doc.save();
    return res.json({ success: true });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
});

router.put('/privileged/:userId', async (req, res) => {
  try {
    const { Privileged } = require('../models/Settings');
    const { password, label, role, allowedProjectIds } = req.body;
    const doc = await Privileged.findOne({ key: 'privileged' });
    if (!doc) return res.status(404).json({ error: 'غير موجود' });
    const user = doc.users.id(req.params.userId);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
      user.password = await bcrypt.hash(password, 12);
    }
    if (label !== undefined) user.label = label;
    if (role) user.role = role;
    if (allowedProjectIds !== undefined) user.allowedProjectIds = allowedProjectIds;
    doc.markModified('users');
    await doc.save();
    return res.json({ success: true });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
});

router.delete('/privileged/:userId', async (req, res) => {
  try {
    const { Privileged } = require('../models/Settings');
    const doc = await Privileged.findOne({ key: 'privileged' });
    if (!doc) return res.json({ success: true });
    doc.users = doc.users.filter(u => u._id.toString() !== req.params.userId);
    doc.markModified('users');
    await doc.save();
    return res.json({ success: true });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
});

// ── Sync GPS ──────────────────────────────────────────────────
router.post('/sync-gps', async (req, res) => {
  try {
    const readings = await require('../models/Reading').find().lean();
    let updated = 0;
    for (const r of readings) {
      const land = await require('../models/Land').findById(r.landId).lean();
      if (land?.stationNumber || land?.stationLat) {
        await require('../models/Reading').findByIdAndUpdate(r._id, {
          stationNumber: land.stationNumber || '',
          stationLat:    land.stationLat    || null,
          stationLng:    land.stationLng    || null,
        });
        updated++;
      }
    }
    return res.json({ success: true, updated });
  } catch(err) { return res.status(500).json({ error: 'خطأ: ' + err.message }); }
});

// ── Reports ──────────────────────────────
router.get('/report', ctrl.getReport);

// ── Reading Note & Paid ───────────────────
router.post('/readings/:readingId/note', async (req, res) => {
  try {
    await require('../models/Reading').findByIdAndUpdate(req.params.readingId, { note: req.body.note || '' });
    return res.json({ success: true });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
});

// ✅ تبديل حالة الدفع لفترة (دورة) محددة داخل القراءة، بدل السطر كامل
router.post('/readings/:readingId/paid/:periodIndex', async (req, res) => {
  try {
    const Reading = require('../models/Reading');
    const r = await Reading.findById(req.params.readingId);
    if (!r) return res.status(404).json({ error: 'غير موجود' });

    const idx = parseInt(req.params.periodIndex, 10);
    const periodsCount = Math.max(0, (r.readings?.length || 1) - 1);
    if (isNaN(idx) || idx < 0 || idx >= periodsCount) {
      return res.status(400).json({ error: 'فهرس فترة غير صالح' });
    }

    const pp = [...(r.paidPeriods || [])];
    while (pp.length < periodsCount) pp.push(false);
    pp[idx] = !pp[idx];
    r.paidPeriods = pp;
    r.markModified('paidPeriods');

    // ✅ تحديث paid القديم للتوافق: true فقط إذا كل الفترات النشطة (بدأت فعلاً بقراءة) مدفوعة بالكامل
    const activeIdx = [];
    for (let i = 0; i < periodsCount; i++) {
      if (r.readings[i] != null) activeIdx.push(i);
    }
    const derivedPaid = activeIdx.length > 0 && activeIdx.every(i => pp[i]);
    r.paid   = derivedPaid;
    r.paidAt = derivedPaid ? new Date() : null;

    await r.save();
    return res.json({ success: true, paidPeriods: r.paidPeriods, paid: r.paid, paidAt: r.paidAt });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
});

router.post('/readings/:readingId/extra-status', async (req, res) => {
  try {
    const Reading = require('../models/Reading');
    const r = await Reading.findById(req.params.readingId);
    if (!r) return res.status(404).json({ error: 'غير موجود' });
    const isFullyPaid = r.extraPaid >= r.extra && r.extra > 0;
    r.extraPaid = isFullyPaid ? 0 : (r.extra || 0);
    await r.save();
    return res.json({ success: true, extraPaid: r.extraPaid });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
});

// ── Import Readings ───────────────────────
router.post('/preview-readings-import', ctrl.previewReadingsImport);
router.post('/apply-readings-import',   ctrl.applyReadingsImport);

// ── Projects ──────────────────────────────
router.get   ('/projects',                                                    projectCtrl.getProjects);
router.post  ('/projects',                                                    projectCtrl.createProject);
router.put   ('/projects/:projectId',                                         projectCtrl.updateProject);
router.delete('/projects/:projectId',                                         projectCtrl.deleteProject);
// Members
router.post  ('/projects/:projectId/members',                                 projectCtrl.addMember);
router.put   ('/projects/:projectId/members/:memberId',                       projectCtrl.updateMember);
router.delete('/projects/:projectId/members/:memberId',                       projectCtrl.deleteMember);
// Payments
router.post  ('/projects/:projectId/members/:memberId/payments',              projectCtrl.addPayment);
router.delete('/projects/:projectId/members/:memberId/payments/:paymentId',   projectCtrl.deletePayment);

module.exports = router;