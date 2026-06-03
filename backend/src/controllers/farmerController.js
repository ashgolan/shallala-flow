const Land       = require('../models/Land');
const Reading    = require('../models/Reading');
const FarmerNote = require('../models/FarmerNote');
const { Prices } = require('../models/Settings');

// ─── My Data ───────────────────────────────────────────────────
const getMyData = async (req, res) => {
  try {
    const farmerId = req.farmer.id;

    // 1. قراءات المزارع
    const readings = await Reading.find({ farmerId }).sort({ year: 1 }).lean();

    // 2. الأراضي من القراءات
    const landIds = [...new Set(readings.map(r => r.landId?.toString()).filter(Boolean))];
    const [lands, pricesDoc] = await Promise.all([
      landIds.length > 0 ? Land.find({ _id: { $in: landIds } }).lean() : Promise.resolve([]),
      Prices.findOne({ key: 'prices' }).lean(),
    ]);

    // ✅ Mixed type — لا نستخدم Object.fromEntries
    const prices = pricesDoc ? {
      globalPrice: parseFloat(pricesDoc.globalPrice) || 0,
      yearPrices:  pricesDoc.yearPrices  || {},
      landPrices:  pricesDoc.landPrices  || {},
    } : { globalPrice: 0, yearPrices: {}, landPrices: {} };

    return res.json({
      lands: lands.map(l => ({
        ...l,
        id:       l._id.toString(),
        farmerId: l.farmerId?.toString() || null,
        regionId: l.regionId?.toString() || null,
      })),
      readings: readings.map(r => ({
        ...r,
        id:            r._id.toString(),
        farmerId:      r.farmerId?.toString() || '',
        landId:        r.landId?.toString()   || '',
        stationNumber: r.stationNumber || '',
        paid:          r.paid || false,
      })),
      prices,
    });
  } catch (err) {
    console.error('getMyData error:', err.message);
    return res.status(500).json({ error: 'خطأ في الخادم: ' + err.message });
  }
};

// ─── Notes ─────────────────────────────────────────────────────
const getMyNotes = async (req, res) => {
  try {
    const notes = await FarmerNote.find({ farmerId: req.farmer.id }).sort({ date: -1 }).lean();
    return res.json({
      notes: notes.map(n => ({
        ...n,
        id:       n._id.toString(),
        farmerId: n.farmerId?.toString() || '',
        landId:   n.landId?.toString()   || '',
      }))
    });
  } catch (err) {
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

const addNote = async (req, res) => {
  try {
    const { landId, date, type, description, amount, unit } = req.body;
    if (!landId || !date || !description)
      return res.status(400).json({ error: 'الأرض والتاريخ والوصف مطلوبة' });

    const reading = await Reading.findOne({ farmerId: req.farmer.id, landId });
    if (!reading) return res.status(403).json({ error: 'هذه الأرض لا تخصك' });

    const note = await FarmerNote.create({
      farmerId: req.farmer.id, landId, date,
      type: type || 'أخرى', description,
      amount: amount || '', unit: unit || '',
    });

    return res.status(201).json({ success: true, id: note._id.toString() });
  } catch (err) {
    console.error('addNote error:', err.message);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

const deleteNote = async (req, res) => {
  try {
    const note = await FarmerNote.findOne({ _id: req.params.noteId, farmerId: req.farmer.id });
    if (!note) return res.status(403).json({ error: 'غير مصرح' });
    await note.deleteOne();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

module.exports = { getMyData, getMyNotes, addNote, deleteNote };
