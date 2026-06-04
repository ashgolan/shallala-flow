const Farmer     = require('../models/Farmer');
const Land       = require('../models/Land');
const Reading    = require('../models/Reading');
const FarmerNote = require('../models/FarmerNote');
const { Prices, Announcement, Gallery, Video, Admin } = require('../models/Settings');
const { getStorage } = require('../../config/firebase');

// helper: plain object with string ids
const plain = (doc) => {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  o.id = o._id?.toString();
  if (o.farmerId) o.farmerId = o.farmerId.toString();
  if (o.landId)   o.landId   = o.landId.toString();
  return o;
};

// ════════════════════════════════════════
//  FARMERS
// ════════════════════════════════════════
const getFarmers = async (req, res) => {
  try {
    const farmers = await Farmer.find().sort({ name: 1 }).lean();
    return res.json({ farmers: farmers.map(f => { delete f.code; return { ...f, id: f._id.toString() }; }) });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// توليد كود 4 أرقام فريد
const generateUniqueCode = async () => {
  const existing = await Farmer.find({}, 'code').lean();
  const usedCodes = new Set(existing.map(f => f.code));
  let code;
  let attempts = 0;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
    attempts++;
    if (attempts > 1000) throw new Error('لا يمكن توليد كود فريد');
  } while (usedCodes.has(code));
  return code;
};

const createFarmer = async (req, res) => {
  try {
    const { name, nameHeb, idNumber, phone, notes, area } = req.body;
    if (!name || !idNumber)
      return res.status(400).json({ error: 'الاسم ورقم الهوية مطلوبان' });

    // توليد كود تلقائي فريد
    const code = await generateUniqueCode();

    const farmer = await Farmer.create({
      name,
      nameHeb: nameHeb || '',
      idNumber: idNumber.trim(),
      code,
      phone: phone || '',
      notes: notes || '',
      area: area || '',
    });

    // إرجاع الكود للعرض للمشرف
    return res.status(201).json({ success: true, id: farmer._id.toString(), code });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'رقم الهوية موجود مسبقاً' });
    return res.status(500).json({ error: 'خطأ في الخادم: ' + err.message });
  }
};

const getFarmerCode = async (req, res) => {
  try {
    const farmer = await Farmer.findById(req.params.farmerId).lean();
    if (!farmer) return res.status(404).json({ error: 'غير موجود' });
    return res.json({ code: farmer.code });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const updateFarmer = async (req, res) => {
  try {
    const { code } = req.body;
    if (code && !/^\d{4}$/.test(code.toString()))
      return res.status(400).json({ error: 'الكود يجب أن يكون 4 أرقام' });
    await Farmer.findByIdAndUpdate(req.params.farmerId, { ...req.body });
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const deleteFarmer = async (req, res) => {
  try {
    const id = req.params.farmerId;
    await Promise.all([
      Farmer.findByIdAndDelete(id),
      Land.deleteMany({ farmerId: id }),
      Reading.deleteMany({ farmerId: id }),
      FarmerNote.deleteMany({ farmerId: id }),
    ]);
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// ════════════════════════════════════════
//  LANDS
// ════════════════════════════════════════
const getLands = async (req, res) => {
  try {
    const filter = {};
    if (req.query.farmerId) filter.farmerId = req.query.farmerId;
    const lands = await Land.find(filter).sort({ name: 1 }).lean();
    return res.json({ lands: lands.map(l => ({
      ...l,
      id:            l._id.toString(),
      farmerId:      l.farmerId ? l.farmerId.toString() : null,
      regionId:      l.regionId ? l.regionId.toString() : null,
      stationNumber: l.stationNumber || '',
      stationLat:    l.stationLat    || null,
      stationLng:    l.stationLng    || null,
    })) });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const createLand = async (req, res) => {
  try {
    const { farmerId, regionId, name, nameHeb, area, stationNumber, stationLat, stationLng } = req.body;
    if (!name) return res.status(400).json({ error: 'اسم الأرض مطلوب' });
    const land = await Land.create({
      farmerId:      farmerId || null,
      regionId:      regionId || null,
      name,
      nameHeb:       nameHeb || name,
      area:          area || '',
      stationNumber: stationNumber || '',
      stationLat:    stationLat    || null,
      stationLng:    stationLng    || null,
    });
    return res.status(201).json({ success: true, id: land._id.toString() });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const updateLand = async (req, res) => {
  try {
    const { regionId, name, nameHeb, area, stationNumber, stationLat, stationLng } = req.body;
    await Land.findByIdAndUpdate(req.params.landId, {
      regionId:      regionId || null,
      name:          name || '',
      nameHeb:       nameHeb || name || '',
      area:          area || '',
      stationNumber: stationNumber || '',
      stationLat:    stationLat    || null,
      stationLng:    stationLng    || null,
    });
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const deleteLand = async (req, res) => {
  try {
    const id = req.params.landId;
    await Promise.all([
      Land.findByIdAndDelete(id),
      Reading.deleteMany({ landId: id }),
    ]);
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// ════════════════════════════════════════
//  READINGS
// ════════════════════════════════════════
const getReadings = async (req, res) => {
  try {
    const filter = {};
    if (req.query.farmerId) filter.farmerId = req.query.farmerId;
    if (req.query.year)     filter.year = parseInt(req.query.year);
    const readings = await Reading.find(filter).sort({ year: -1 }).lean();
    return res.json({ readings: readings.map(r => ({
      ...r, id: r._id.toString(),
      farmerId: r.farmerId.toString(),
      landId: r.landId.toString(),
      stationNumber: r.stationNumber || '',
      stationLat: r.stationLat || null,
      stationLng: r.stationLng || null,
      extra: r.extra || 0,
      extraPaid: r.extraPaid || 0,
      extraNote: r.extraNote || '',
      note: r.note || '',
      paid: r.paid || false,
      paidAt: r.paidAt || null,
    })) });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const createReading = async (req, res) => {
  try {
    const { farmerId, landId, year, readings, note, extra, extraPaid, extraNote } = req.body;
    if (!farmerId || !landId || !year || !readings?.length)
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    if (readings.length < 2)
      return res.status(400).json({ error: 'يجب إدخال قراءتين على الأقل' });

    // ── جلب بيانات المحطة من الأرض تلقائياً ──────────────
    const land = await Land.findById(landId).lean();
    const stationNumber = land?.stationNumber || '';
    const stationLat    = land?.stationLat    || null;
    const stationLng    = land?.stationLng    || null;

    const reading = await Reading.create({
      farmerId, landId, year: parseInt(year),
      readings: readings.map(r => parseFloat(r) || 0),
      stationNumber,
      stationLat,
      stationLng,
      extra: parseFloat(extra) || 0,
      extraPaid: parseFloat(extraPaid) || 0,
      extraNote: extraNote || '',
      note: note || '',
    });
    return res.status(201).json({ success: true, id: reading._id.toString() });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'توجد قراءة لهذه الأرض في هذه السنة مسبقاً' });
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

const updateReading = async (req, res) => {
  try {
    const { farmerId, landId, year, readings, note, extra, extraPaid, extraNote } = req.body;
    // جلب الموقع من الأرض تلقائياً
    const land = await Land.findById(landId).lean();
    const updateData = {
      farmerId, landId, year: parseInt(year),
      readings: readings.map(r => parseFloat(r) || 0),
      stationNumber: land?.stationNumber || '',
      stationLat:    land?.stationLat    || null,
      stationLng:    land?.stationLng    || null,
      extra: parseFloat(extra) || 0,
      extraPaid: parseFloat(extraPaid) || 0,
      extraNote: extraNote || '',
      note: note || '',
    };
    await Reading.findByIdAndUpdate(req.params.readingId, { $set: updateData }, { new: true });
    return res.json({ success: true });
  } catch (err) {
    console.error('updateReading error:', err);
    return res.status(500).json({ error: 'خطأ في الخادم: ' + err.message });
  }
};

const deleteReading = async (req, res) => {
  try {
    await Reading.findByIdAndDelete(req.params.readingId);
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// ════════════════════════════════════════
//  PRICES
// ════════════════════════════════════════
const getPrices = async (req, res) => {
  try {
    const doc = await Prices.findOne({ key: 'prices' }).lean();
    if (!doc) return res.json({ globalPrice: 0, yearPrices: {}, landPrices: {} });
    return res.json({
      globalPrice: doc.globalPrice || 0,
      yearPrices:  doc.yearPrices  || {},
      landPrices:  doc.landPrices  || {},
    });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const updatePrices = async (req, res) => {
  try {
    const { globalPrice, yearPrices, landPrices } = req.body;
    // استخدام findOneAndUpdate مع markModified للـ Mixed type
    const doc = await Prices.findOneAndUpdate(
      { key: 'prices' },
      { $set: { globalPrice: parseFloat(globalPrice) || 0 } },
      { upsert: true, new: true }
    );
    doc.yearPrices = yearPrices || {};
    doc.landPrices = landPrices || {};
    doc.markModified('yearPrices');
    doc.markModified('landPrices');
    await doc.save();
    return res.json({ success: true });
  } catch (err) {
    console.error('updatePrices:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

// ════════════════════════════════════════
//  SETTINGS
// ════════════════════════════════════════
const getAnnouncement = async (req, res) => {
  try {
    const doc = await Announcement.findOne({ key: 'announcement' }).lean();
    return res.json(doc ? { text: doc.text, updatedAt: doc.updatedAt } : { text: '' });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const updateAnnouncement = async (req, res) => {
  try {
    await Announcement.findOneAndUpdate(
      { key: 'announcement' },
      { text: req.body.text || '' },
      { upsert: true, new: true }
    );
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const updateAdminPassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6)
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    await Admin.findOneAndUpdate({ key: 'admin' }, { password }, { upsert: true });
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const updateVideo = async (req, res) => {
  try {
    await Video.findOneAndUpdate(
      { key: 'video' },
      { url: req.body.url || '', title: req.body.title || '' },
      { upsert: true }
    );
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// ════════════════════════════════════════
//  GALLERY
// ════════════════════════════════════════
const getGallery = async (req, res) => {
  try {
    const doc = await Gallery.findOne({ key: 'gallery' }).lean();
    return res.json({ images: doc?.images || [] });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const updateGallery = async (req, res) => {
  try {
    await Gallery.findOneAndUpdate(
      { key: 'gallery' },
      { images: req.body.images || [] },
      { upsert: true }
    );
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// ════════════════════════════════════════
//  REPORTS
// ════════════════════════════════════════
const getReport = async (req, res) => {
  try {
    const filter = {};
    if (req.query.year)     filter.year = parseInt(req.query.year);
    if (req.query.farmerId) filter.farmerId = req.query.farmerId;

    const [farmers, lands, readings, pricesDoc] = await Promise.all([
      Farmer.find().sort({ name: 1 }).lean(),
      Land.find().lean(),
      Reading.find(filter).sort({ year: -1 }).lean(),
      Prices.findOne({ key: 'prices' }).lean(),
    ]);

    const prices = pricesDoc
      ? { globalPrice: pricesDoc.globalPrice || 0, yearPrices: pricesDoc.yearPrices || {}, landPrices: pricesDoc.landPrices || {} }
      : {};

    return res.json({
      farmers:  farmers.map(f => { delete f.code; return { ...f, id: f._id.toString() }; }),
      lands:    lands.map(l => ({ ...l, id: l._id.toString(), farmerId: l.farmerId?.toString() || null, regionId: l.regionId?.toString() || null })),
      readings: readings.map(r => ({
        ...r,
        id:            r._id.toString(),
        farmerId:      r.farmerId?.toString() || '',
        landId:        r.landId?.toString()   || '',
        stationNumber: r.stationNumber || '',
        extra:         r.extra     || 0,
        extraPaid:     r.extraPaid || 0,
        extraNote:     r.extraNote || '',
        paid:          r.paid || false,
        paidAt:        r.paidAt || null,
      })),
      prices,
    });
  } catch (err) {
    console.error('getReport:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

module.exports = {
  getFarmers, createFarmer, getFarmerCode, updateFarmer, deleteFarmer,
  getLands, createLand, updateLand, deleteLand,
  getReadings, createReading, updateReading, deleteReading,
  getPrices, updatePrices,
  getAnnouncement, updateAnnouncement, updateAdminPassword, updateVideo,
  getGallery, updateGallery,
  getReport,
};

// ════════════════════════════════════════
//  REGIONS — إضافة في آخر الملف
// ════════════════════════════════════════
const { Region } = require('../models/Settings');

const getRegions = async (req, res) => {
  try {
    const regions = await Region.find().sort({ name: 1 }).lean();
    return res.json({ regions: regions.map(r => ({ ...r, id: r._id.toString() })) });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const createRegion = async (req, res) => {
  try {
    const { name, nameHeb, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'اسم المنطقة مطلوب' });
    const region = await Region.create({ name, nameHeb: nameHeb || '', notes: notes || '' });
    return res.status(201).json({ success: true, id: region._id.toString() });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'المنطقة موجودة مسبقاً' });
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

const updateRegion = async (req, res) => {
  try {
    await Region.findByIdAndUpdate(req.params.regionId, req.body);
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const deleteRegion = async (req, res) => {
  try {
    const id = req.params.regionId;
    // إزالة المنطقة من الأراضي المرتبطة بها
    await Land.updateMany({ regionId: id }, { regionId: null });
    await Region.findByIdAndDelete(id);
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

module.exports.getRegions    = getRegions;
module.exports.createRegion  = createRegion;
module.exports.updateRegion  = updateRegion;
module.exports.deleteRegion  = deleteRegion;
