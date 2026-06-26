const bcrypt     = require('bcryptjs');
const Farmer     = require('../models/Farmer');
const Land       = require('../models/Land');
const Reading    = require('../models/Reading');
const FarmerNote = require('../models/FarmerNote');
const { Prices, Announcement, Gallery, Video, Admin } = require('../models/Settings');
const { getStorage } = require('../../config/firebase');

const plain = (doc) => {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  o.id = o._id?.toString();
  if (o.farmerId) o.farmerId = o.farmerId.toString();
  if (o.landId)   o.landId   = o.landId.toString();
  return o;
};

const safeFloat = (v) => {
  const f = parseFloat(v);
  return (!isNaN(f) && v !== '' && v !== null && v !== undefined) ? f : null;
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

const generateUniqueCode = async () => {
  const existing = await Farmer.find({}, 'code').lean();
  const usedCodes = new Set(existing.map(f => f.code));
  let code; let attempts = 0;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
    attempts++;
    if (attempts > 1000) throw new Error('لا يمكن توليد كود فريد');
  } while (usedCodes.has(code));
  return code;
};

const createFarmer = async (req, res) => {
  try {
    const { firstName, lastName, idNumber, phone, notes, area } = req.body;
    if (!firstName || !lastName || !idNumber) return res.status(400).json({ error: 'الاسم والعائلة ورقم الهوية مطلوبان' });
    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const code = await generateUniqueCode();
    const farmer = await Farmer.create({
      firstName: firstName.trim(), lastName: lastName.trim(),
      name: fullName, nameHeb: fullName,
      idNumber: idNumber.trim(), code,
      phone: phone || '', notes: notes || '', area: area || '',
    });
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
    const { code, firstName, lastName, phone, notes } = req.body;
    if (code && !/^\d{4}$/.test(code.toString())) return res.status(400).json({ error: 'الكود يجب أن يكون 4 أرقام' });
    const updateData = { ...req.body };
    if (firstName || lastName) {
      const fn = (firstName || '').trim();
      const ln = (lastName  || '').trim();
      if (fn && ln) {
        updateData.firstName = fn;
        updateData.lastName  = ln;
        updateData.name      = `${fn} ${ln}`;
        updateData.nameHeb   = `${fn} ${ln}`;
      }
    }
    await Farmer.findByIdAndUpdate(req.params.farmerId, updateData);
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
    const lands = await Land.find(filter).sort({ stationNumber: 1 }).lean();
    return res.json({ lands: lands.map(l => ({
      ...l, id: l._id.toString(),
      farmerId:    l.farmerId  ? l.farmerId.toString()  : null,
      regionId:    l.regionId  ? l.regionId.toString()  : null,
      stationNumber: l.stationNumber || '',
      stationLat:  l.stationLat  || null,
      stationLng:  l.stationLng  || null,
      description: l.description || '',
    })) });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const createLand = async (req, res) => {
  try {
    const { farmerId, regionId, name, nameHeb, stationNumber, stationLat, stationLng, description } = req.body;
    if (!stationNumber) return res.status(400).json({ error: 'رقم المحطة مطلوب' });
    const land = await Land.create({
      farmerId: farmerId || null, regionId: regionId || null,
      name: name || stationNumber, nameHeb: nameHeb || stationNumber,
      description: description || '', stationNumber,
      stationLat: safeFloat(stationLat), stationLng: safeFloat(stationLng),
    });
    return res.status(201).json({ success: true, id: land._id.toString() });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const updateLand = async (req, res) => {
  try {
    const { regionId, name, nameHeb, stationNumber, stationLat, stationLng, description } = req.body;
    await Land.findByIdAndUpdate(req.params.landId, {
      regionId: regionId || null,
      name: name || stationNumber || '', nameHeb: nameHeb || stationNumber || '',
      description: description || '', stationNumber: stationNumber || '',
      stationLat: safeFloat(stationLat), stationLng: safeFloat(stationLng),
    });
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const deleteLand = async (req, res) => {
  try {
    const id = req.params.landId;
    await Promise.all([ Land.findByIdAndDelete(id), Reading.deleteMany({ landId: id }) ]);
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const cleanDuplicateLands = async (req, res) => {
  try {
    const lands = await Land.find({}).sort({ createdAt: 1 }).lean();
    const groups = {};
    for (const land of lands) {
      const key = land.stationNumber?.trim() || land._id.toString();
      if (!groups[key]) groups[key] = [];
      groups[key].push(land);
    }
    let deleted = 0;
    for (const [station, group] of Object.entries(groups)) {
      if (group.length <= 1) continue;
      const toDelete = group.slice(1);
      for (const land of toDelete) {
        await Reading.updateMany({ landId: land._id }, { $set: { landId: group[0]._id } });
        await Land.findByIdAndDelete(land._id);
        deleted++;
      }
    }
    return res.json({ success: true, deleted });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ════════════════════════════════════════
//  READINGS
// ════════════════════════════════════════
// ✅ دالة مساعدة لتحويل extras من الطلب
const parseExtras = (extrasRaw) => {
  if (!Array.isArray(extrasRaw)) return [];
  return extrasRaw
    .filter(e => e.note || parseFloat(e.amount) > 0)
    .map(e => ({
      note:   e.note || '',
      amount: parseFloat(e.amount) || 0,
      paid:   parseFloat(e.paid)   || 0,
    }));
};

// ✅ دالة مساعدة لتوحيد بيانات القراءة في الاستجابة
const serializeReading = (r) => ({
  ...r,
  id:       r._id.toString(),
  farmerId: r.farmerId.toString(),
  landId:   r.landId.toString(),
  stationNumber: r.stationNumber || '',
  stationLat:    r.stationLat    || null,
  stationLng:    r.stationLng    || null,
  // ✅ extras الجديدة
  extras:    (r.extras || []).map(e => ({
    id:     e._id?.toString(),
    note:   e.note   || '',
    amount: e.amount || 0,
    paid:   e.paid   || 0,
  })),
  // الحقول القديمة للتوافق
  extra:     r.extra     || 0,
  extraPaid: r.extraPaid || 0,
  extraNote: r.extraNote || '',
  note:      r.note      || '',
  paid:      r.paid      || false,
  paidAt:    r.paidAt    || null,
});

const getReadings = async (req, res) => {
  try {
    const filter = {};
    if (req.query.farmerId) filter.farmerId = req.query.farmerId;
    if (req.query.year)     filter.year = parseInt(req.query.year);
    const readings = await Reading.find(filter).sort({ year: -1 }).lean();
    return res.json({ readings: readings.map(serializeReading) });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const createReading = async (req, res) => {
  try {
    const { farmerId, landId, year, readings, note, extra, extraPaid, extraNote } = req.body;
    if (!farmerId || !landId || !year || !readings?.length) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    if (readings[0] === '' || readings[0] === null || readings[0] === undefined)
      return res.status(400).json({ error: 'القراءة الأولى (البداية) مطلوبة' });
    const land = await Land.findById(landId).lean();
    const reading = await Reading.create({
      farmerId, landId, year: parseInt(year),
      readings: readings.map((r, i) => {
        if (r === '' || r === null || r === undefined) return null;
        const f = parseFloat(r);
        if (isNaN(f)) return null;
        if (i > 0 && f === 0) return null;
        return f;
      }),
      stationNumber: land?.stationNumber || '',
      stationLat:    land?.stationLat    || null,
      stationLng:    land?.stationLng    || null,
      extras:    parseExtras(req.body.extras),
      extra:     parseFloat(extra)     || 0,
      extraPaid: parseFloat(extraPaid) || 0,
      extraNote: extraNote || '',
      note:      note      || '',
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
    const land = await Land.findById(landId).lean();
    const updateData = {
      farmerId, landId, year: parseInt(year),
      readings: readings.map((r, i) => {
        if (r === '' || r === null || r === undefined) return null;
        const f = parseFloat(r);
        if (isNaN(f)) return null;
        if (i > 0 && f === 0) return null;
        return f;
      }),
      stationNumber: land?.stationNumber || '',
      stationLat:    land?.stationLat    || null,
      stationLng:    land?.stationLng    || null,
      extras:    parseExtras(req.body.extras),
      extra:     parseFloat(extra)     || 0,
      extraPaid: parseFloat(extraPaid) || 0,
      extraNote: extraNote || '',
      note:      note      || '',
    };
    await Reading.findByIdAndUpdate(req.params.readingId, { $set: updateData }, { new: true });
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم: ' + err.message }); }
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
    return res.json({ globalPrice: doc.globalPrice || 0, yearPrices: doc.yearPrices || {}, landPrices: doc.landPrices || {} });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const updatePrices = async (req, res) => {
  try {
    const { globalPrice, yearPrices, landPrices } = req.body;
    const doc = await Prices.findOneAndUpdate({ key: 'prices' }, { $set: { globalPrice: parseFloat(globalPrice) || 0 } }, { upsert: true, new: true });
    doc.yearPrices = yearPrices || {}; doc.landPrices = landPrices || {};
    doc.markModified('yearPrices'); doc.markModified('landPrices');
    await doc.save();
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
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
    await Announcement.findOneAndUpdate({ key: 'announcement' }, { text: req.body.text || '' }, { upsert: true, new: true });
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const updateAdminPassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    const hashedPassword = await bcrypt.hash(password, 12);
    await Admin.findOneAndUpdate({ key: 'admin' }, { password: hashedPassword }, { upsert: true });
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const updateVideo = async (req, res) => {
  try {
    await Video.findOneAndUpdate({ key: 'video' }, { url: req.body.url || '', title: req.body.title || '' }, { upsert: true });
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
    await Gallery.findOneAndUpdate({ key: 'gallery' }, { images: req.body.images || [] }, { upsert: true });
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
    const prices = pricesDoc ? { globalPrice: pricesDoc.globalPrice || 0, yearPrices: pricesDoc.yearPrices || {}, landPrices: pricesDoc.landPrices || {} } : {};
    return res.json({
      farmers:  farmers.map(f => { delete f.code; return { ...f, id: f._id.toString() }; }),
      lands:    lands.map(l => ({ ...l, id: l._id.toString(), farmerId: l.farmerId?.toString() || null, regionId: l.regionId?.toString() || null, description: l.description || '' })),
      readings: readings.map(r => ({
        ...r, id: r._id.toString(),
        farmerId: r.farmerId?.toString() || '', landId: r.landId?.toString() || '',
        stationNumber: r.stationNumber || '',
        extras: (r.extras || []).map(e => ({ id: e._id?.toString(), note: e.note||'', amount: e.amount||0, paid: e.paid||0 })),
        extra: r.extra || 0, extraPaid: r.extraPaid || 0,
        extraNote: r.extraNote || '', paid: r.paid || false, paidAt: r.paidAt || null,
      })),
      prices,
    });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// ════════════════════════════════════════
//  REGIONS
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
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const updateRegion = async (req, res) => {
  try {
    const { name, nameHeb, notes } = req.body;
    await Region.findByIdAndUpdate(req.params.regionId, { name, nameHeb: nameHeb || '', notes: notes || '' });
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

const deleteRegion = async (req, res) => {
  try {
    await Region.findByIdAndDelete(req.params.regionId);
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// ════════════════════════════════════════
//  IMPORT READINGS — معاينة
// ════════════════════════════════════════
const previewReadingsImport = async (req, res) => {
  try {
    const { rows, year } = req.body;
    if (!rows || !Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ error: 'لا توجد بيانات' });

    const preview = [];

    for (const row of rows) {
      const { landId, farmerId, readingId, allReadings, stationNumber, farmerName, farmerPhone } = row;

      if (!allReadings || !allReadings.length) continue;
      if (allReadings.every(v => v === null)) continue;

      let existing = null;
      if (readingId) existing = await Reading.findById(readingId).lean();
      if (!existing) existing = await Reading.findOne({ landId, year: parseInt(year) }).lean();

      const oldReadings = existing ? (existing.readings || []) : [];
      const changes = [];
      let hasAnyChange = false;

      for (let i = 0; i < allReadings.length; i++) {
        const newVal = allReadings[i];
        const oldVal = oldReadings[i] ?? null;
        if (newVal !== null && newVal !== oldVal) {
          hasAnyChange = true;
          changes.push({ idx: i, oldVal, newVal });
        }
      }

      if (!hasAnyChange) continue;

      const lastChange = changes[changes.length - 1];
      const prevValue  = lastChange.idx > 0 ? (allReadings[lastChange.idx - 1] ?? oldReadings[lastChange.idx - 1] ?? null) : null;

      preview.push({
        stationNumber, farmerName, farmerPhone,
        readingIndex:  lastChange.idx,
        prevValue,
        oldValue:      lastChange.oldVal,
        newValue:      lastChange.newVal,
        diff:          prevValue !== null ? lastChange.newVal - prevValue : null,
        changesCount:  changes.length,
        allReadings,
        oldReadings,
        readingId:     existing ? existing._id.toString() : null,
        landId, farmerId,
        year:          parseInt(year),
        status:        existing ? 'update' : 'create',
      });
    }

    return res.json({ success: true, preview, count: preview.length });
  } catch (err) {
    return res.status(500).json({ error: 'خطأ في الخادم: ' + err.message });
  }
};

// ════════════════════════════════════════
//  IMPORT READINGS — تطبيق
// ════════════════════════════════════════
const applyReadingsImport = async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'لا توجد بيانات للتطبيق' });

    let applied = 0, created = 0;
    const errors = [];

    for (const item of items) {
      const { readingId, landId, farmerId, year, allReadings } = item;
      if (!allReadings || !allReadings.length) continue;
      if (allReadings.every(v => v === null || v === undefined)) continue;

      try {
        const incomingReadings = item.allReadings || [];

        if (readingId) {
          const existing = await Reading.findById(readingId);
          if (!existing) { errors.push(`reading ${readingId} غير موجود`); continue; }

          const merged = [...(existing.readings || [])];
          for (let i = 0; i < incomingReadings.length; i++) {
            if (incomingReadings[i] !== null && incomingReadings[i] !== undefined) {
              while (merged.length <= i) merged.push(null);
              merged[i] = incomingReadings[i];
            }
          }
          while (merged.length < 2) merged.push(null);
          existing.readings = merged;
          existing.markModified('readings');
          await existing.save();
          applied++;
        } else {
          const land = await Land.findById(landId).lean();
          const newReadings = [...incomingReadings];
          while (newReadings.length < 2) newReadings.push(null);
          await Reading.create({
            farmerId, landId,
            year: parseInt(year),
            readings: newReadings,
            stationNumber: land?.stationNumber || '',
            stationLat:    land?.stationLat    || null,
            stationLng:    land?.stationLng    || null,
            extras: [], extra: 0, extraPaid: 0, extraNote: '', note: '',
          });
          created++;
        }
      } catch (e) {
        errors.push(`${item.stationNumber || landId}: ${e.message}`);
      }
    }

    return res.json({ success: true, applied, created, errors });
  } catch (err) {
    return res.status(500).json({ error: 'خطأ في الخادم: ' + err.message });
  }
};

module.exports = {
  getFarmers, createFarmer, getFarmerCode, updateFarmer, deleteFarmer,
  getLands, createLand, updateLand, deleteLand, cleanDuplicateLands,
  getReadings, createReading, updateReading, deleteReading,
  getPrices, updatePrices,
  getAnnouncement, updateAnnouncement, updateAdminPassword, updateVideo,
  getGallery, updateGallery,
  getReport,
  getRegions, createRegion, updateRegion, deleteRegion,
  previewReadingsImport, applyReadingsImport,
};