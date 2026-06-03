const express = require('express');
const router  = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');
const ctrl = require('../controllers/adminController');
const { getStorage } = require('../../config/firebase');

router.use(requireAdmin);

// ── Farmers ──────────────────────────────
router.get   ('/farmers',            ctrl.getFarmers);
router.post  ('/farmers',            ctrl.createFarmer);
router.put   ('/farmers/:farmerId',  ctrl.updateFarmer);
router.get   ('/farmers/:farmerId/code', ctrl.getFarmerCode);
router.delete('/farmers/:farmerId',  ctrl.deleteFarmer);

// ── Regions (المناطق الزراعية) ───────────
router.get   ('/regions',            ctrl.getRegions);
router.post  ('/regions',            ctrl.createRegion);
router.put   ('/regions/:regionId',  ctrl.updateRegion);
router.delete('/regions/:regionId',  ctrl.deleteRegion);

// ── Lands ────────────────────────────────
router.get   ('/lands',              ctrl.getLands);
router.post  ('/lands',              ctrl.createLand);
router.put   ('/lands/:landId',      ctrl.updateLand);
router.delete('/lands/:landId',      ctrl.deleteLand);

// ── Readings ─────────────────────────────
router.get   ('/readings',              ctrl.getReadings);
router.post  ('/readings',             ctrl.createReading);
router.put   ('/readings/:readingId',  ctrl.updateReading);
router.delete('/readings/:readingId',  ctrl.deleteReading);

// ── Prices ───────────────────────────────
router.get ('/prices',   ctrl.getPrices);
router.post('/prices',   ctrl.updatePrices);

// ── Settings ─────────────────────────────
router.get ('/announcement',    ctrl.getAnnouncement);
router.post('/announcement',    ctrl.updateAnnouncement);
router.post('/admin-password',  ctrl.updateAdminPassword);
router.post('/video',           ctrl.updateVideo);

// ── Gallery ──────────────────────────────
router.get('/gallery',    ctrl.getGallery);
router.put('/gallery',    ctrl.updateGallery);

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

    bb.on('finish', () => {
      if (uploadedUrl) return res.json({ success: true, url: uploadedUrl, path: uploadedPath });
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

// ── Reports ──────────────────────────────
router.get('/report', ctrl.getReport);

module.exports = router;

// ── Update Reading Note ──────────────────────────────────────
router.post('/readings/:readingId/note', async (req, res) => {
  try {
    const Reading = require('../models/Reading');
    await Reading.findByIdAndUpdate(req.params.readingId, { note: req.body.note || '' });
    return res.json({ success: true });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
});

// ── Toggle Payment Status ─────────────────────────────────
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
