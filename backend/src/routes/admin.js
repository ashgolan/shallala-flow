const express = require('express');
const router  = express.Router();
const { requireAdmin, requireAdminOnly } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');
const ctrl = require('../controllers/adminController');
const { getStorage } = require('../../config/firebase');

router.use(requireAdmin);

router.use((req, res, next) => {
  if (req.adminRole === 'viewer' && req.method !== 'GET') {
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
    let uploadedUrl = null, uploadedPath = null;
    bb.on('file', (name, file, info) => {
      const { mimeType } = info;
      const allowed = ['image/jpeg','image/png','image/webp','image/gif'];
      if (!allowed.includes(mimeType)) { file.resume(); return res.status(400).json({ error: 'نوع الملف غير مسموح' }); }
      const ext      = mimeType.split('/')[1];
      const fileName = `gallery/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const fileRef  = bucket.file(fileName);
      uploadedPath   = fileName;
      const stream   = fileRef.createWriteStream({ metadata: { contentType: mimeType }, public: true });
      file.pipe(stream);
      stream.on('finish', async () => { uploadedUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`; });
      stream.on('error', () => { if (!res.headersSent) res.status(500).json({ error: 'فشل الرفع' }); });
    });
    bb.on('finish', () => { if (uploadedUrl) return res.json({ success: true, url: uploadedUrl, path: uploadedPath }); });
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
    const users = (doc?.users || []).map(u => ({ id: u._id.toString(), idNumber: u.idNumber, role: u.role, label: u.label }));
    return res.json({ users });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
});

router.post('/privileged', async (req, res) => {
  try {
    const { Privileged } = require('../models/Settings');
    const { idNumber, role, label, password } = req.body;
    if (!idNumber || !role || !password) return res.status(400).json({ error: 'رقم الهوية والدور وكلمة المرور مطلوبة' });
    if (!['admin','viewer'].includes(role)) return res.status(400).json({ error: 'الدور غير صالح' });
    let doc = await Privileged.findOne({ key: 'privileged' });
    if (!doc) doc = new Privileged({ key: 'privileged', users: [] });
    const exists = doc.users.find(u => u.idNumber.trim() === idNumber.trim());
    if (exists) return res.status(409).json({ error: 'رقم الهوية موجود مسبقاً' });
    doc.users.push({ idNumber: idNumber.trim(), role, label: label||'', password });
    doc.markModified('users');
    await doc.save();
    return res.json({ success: true });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
});

router.put('/privileged/:userId', async (req, res) => {
  try {
    const { Privileged } = require('../models/Settings');
    const { password, label, role } = req.body;
    const doc = await Privileged.findOne({ key: 'privileged' });
    if (!doc) return res.status(404).json({ error: 'غير موجود' });
    const user = doc.users.id(req.params.userId);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (password) user.password = password;
    if (label !== undefined) user.label = label;
    if (role) user.role = role;
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

router.post('/readings/:readingId/paid', async (req, res) => {
  try {
    const Reading = require('../models/Reading');
    const r = await Reading.findById(req.params.readingId);
    if (!r) return res.status(404).json({ error: 'غير موجود' });
    r.paid   = !r.paid;
    r.paidAt = r.paid ? new Date() : null;
    await r.save();
    return res.json({ success: true, paid: r.paid, paidAt: r.paidAt });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
});

module.exports = router;
