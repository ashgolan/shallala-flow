const LandExtra = require('../models/LandExtra');
const Land       = require('../models/Land');

// ════════════════════════════════════════════════════════════
//  landExtraController — CRUD لإضافات الأرض (LandExtra)
//  ✅ نفس نمط projectController.js: كولكشن مستقل، لا علاقة له
//  بمستند Reading إطلاقاً بعد الآن.
// ════════════════════════════════════════════════════════════

const serialize = (e) => ({
  id:        e._id.toString(),
  landId:    e.landId.toString(),
  note:      e.note   || '',
  amount:    e.amount || 0,
  paid:      e.paid   || 0,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

// GET /admin/land-extras?landId=...  (بدون landId = كل الإضافات بالنظام)
const getLandExtras = async (req, res) => {
  try {
    const filter = {};
    if (req.query.landId) filter.landId = req.query.landId;
    const extras = await LandExtra.find(filter).sort({ createdAt: -1 }).lean();
    return res.json({ extras: extras.map(e => serialize(e)) });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// POST /admin/land-extras   { landId, note, amount, paid }
const createLandExtra = async (req, res) => {
  try {
    const { landId, note, amount, paid } = req.body;
    if (!landId) return res.status(400).json({ error: 'الأرض مطلوبة' });
    if (!(note && note.trim()) && !(parseFloat(amount) > 0))
      return res.status(400).json({ error: 'سبب الإضافة أو المبلغ مطلوب' });

    const land = await Land.findById(landId).lean();
    if (!land) return res.status(404).json({ error: 'الأرض غير موجودة' });

    const extra = await LandExtra.create({
      landId,
      note:   note || '',
      amount: parseFloat(amount) || 0,
      paid:   parseFloat(paid)   || 0,
    });
    return res.status(201).json({ success: true, id: extra._id.toString() });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم: ' + err.message }); }
};

// PUT /admin/land-extras/:extraId   { note, amount, paid }
const updateLandExtra = async (req, res) => {
  try {
    const { note, amount, paid } = req.body;
    const updated = await LandExtra.findByIdAndUpdate(req.params.extraId, {
      note:   note || '',
      amount: parseFloat(amount) || 0,
      paid:   parseFloat(paid)   || 0,
    }, { new: true });
    if (!updated) return res.status(404).json({ error: 'غير موجود' });
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// DELETE /admin/land-extras/:extraId
const deleteLandExtra = async (req, res) => {
  try {
    await LandExtra.findByIdAndDelete(req.params.extraId);
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

module.exports = { getLandExtras, createLandExtra, updateLandExtra, deleteLandExtra };