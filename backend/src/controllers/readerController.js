const Farmer      = require('../models/Farmer');
const Land        = require('../models/Land');
const Reading     = require('../models/Reading');
const ReaderCycle = require('../models/ReaderCycle');
const ReaderEntry = require('../models/ReaderEntry');
const { Region }  = require('../models/Settings');

// ════════════════════════════════════════════════════════════
//  صفحة إدخال القراءات (الناطور)
//  ✅ القاعدة الأساسية: الناطور بيكتب بس بخانة الدورة المفتوحة
//  (readings[phase-1]) لما تكون فاضية، أو بيصحّح رقم هو أدخله بنفس
//  الدورة وما تغيّر من المكتب. أي رقم سابق = للقراءة فقط.
// ════════════════════════════════════════════════════════════

// ✅ حدود "الرقم المنطقي" — نسبة من الاستهلاك المتوقع لهالأرض
const HIGH_FACTOR = 2;     // أكثر من ضعف المتوقع → للمراجعة
const LOW_FACTOR  = 0.25;  // أقل من ربع المتوقع → للمراجعة
const HISTORY_LEN = 4;     // عدد الفترات السابقة المعروضة/المحسوبة

const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);

const parseStation = s => {
  const m = (s || '').match(/^([A-Za-z]+)(\d+)$/);
  return m ? [m[1].toUpperCase(), parseInt(m[2], 10)] : [s || '', 0];
};
const stationSort = (a, b) => {
  const [aL, aN] = parseStation(a);
  const [bL, bN] = parseStation(b);
  return aL < bL ? -1 : aL > bL ? 1 : aN - bN;
};

const getCycleDoc = async () => {
  let doc = await ReaderCycle.findOne({ key: 'readerCycle' }).lean();
  if (!doc) doc = { year: null, phase: null, open: false };
  return doc;
};

// ✅ phase = رقم الفترة متل "ف1/ف2" بجدول القراءات بالضبط:
//    phase = k  → قراءة نهاية الفترة k = الخانة readings[k]
//    phase = 0  → قراءة بداية السنة   = الخانة readings[0]
const hasPhase = c => c.phase !== null && c.phase !== undefined && !isNaN(Number(c.phase));
const cycleOut = c => ({
  year:  c.year  ?? null,
  phase: hasPhase(c) ? Number(c.phase) : null,
  open:  !!(c.open && c.year && hasPhase(c)),
  updatedAt: c.updatedAt || null,
});

// ✅ استهلاك فترة k (بين readings[k] و readings[k+1]) مع مراعاة تبديل العداد
const periodConsumption = (r, k) => {
  const vals = r.readings || [];
  const a = num(vals[k]);
  const b = num(vals[k + 1]);
  if (a === null || b === null) return null;
  const mc = (r.meterChanges || []).find(c => c.period === k);
  if (mc) return (mc.oldFinal - a) + (b - mc.newInitial);
  return b - a;
};

// ✅ كل استهلاكات الأرض قبل الفترة المستهدفة (بالترتيب الزمني)
const buildHistory = (docsAsc, year, idx) => {
  const out = [];
  for (const r of docsAsc) {
    if (r.year > year) break;
    const vals = r.readings || [];
    for (let k = 0; k < vals.length - 1; k++) {
      // نوقف عند الفترة المستهدفة نفسها (الفترة اللي بتنتهي بالخانة idx)
      if (r.year === year && k + 1 >= idx) break;
      const c = periodConsumption(r, k);
      if (c === null || c < 0) continue;
      out.push({ year: r.year, period: k + 1, value: Math.round(c * 100) / 100 });
    }
  }
  return out;
};

// ✅ القراءة السابقة للخانة المستهدفة: آخر رقم موجود قبلها بنفس السنة، وإلا آخر رقم بالسنة اللي قبل
const findPrevious = (docsAsc, year, idx) => {
  const cur = docsAsc.find(r => r.year === year);
  if (cur) {
    for (let i = idx - 1; i >= 0; i--) {
      const v = num(cur.readings?.[i]);
      if (v !== null) return { value: v, year, idx: i };
    }
  }
  const earlier = docsAsc.filter(r => r.year < year).reverse();
  for (const r of earlier) {
    const vals = r.readings || [];
    for (let i = vals.length - 1; i >= 0; i--) {
      const v = num(vals[i]);
      if (v !== null) return { value: v, year: r.year, idx: i };
    }
  }
  return null;
};

const computeExpected = (history, year, idx) => {
  // الأفضل: نفس الفترة بالسنة الماضية (بسبب اختلاف الاستهلاك بين المواسم)، وإلا معدل آخر الفترات
  const sameLastYear = history.find(h => h.year === year - 1 && h.period === idx);
  if (sameLastYear && sameLastYear.value > 0) return { expected: sameLastYear.value, basis: 'lastYear' };
  const recent = history.slice(-HISTORY_LEN).filter(h => h.value >= 0);
  if (!recent.length) return { expected: null, basis: null };
  const avg = recent.reduce((s, h) => s + h.value, 0) / recent.length;
  return { expected: avg > 0 ? Math.round(avg * 10) / 10 : null, basis: 'average' };
};

// ✅ تبديل عداد مسجّل بنفس الفترة المستهدفة (الفترة اللي بتنتهي بالخانة idx هي idx-1)؟
//    إذا نعم: الناطور بيقرأ العداد الجديد، فالمرجع هو "أول قراءة على العداد الجديد"
//    مش آخر قراءة على القديم.
const meterChangeFor = (curDoc, prev, idx) => (
  curDoc && prev && prev.year === curDoc.year && prev.idx === idx - 1
    ? ((curDoc.meterChanges || []).find(c => c.period === idx - 1) || null)
    : null
);
// ✅ الرقم اللي لازم القراءة الجديدة ما تنزل عنه (للتنبيه "أقل من السابقة")
const refValueFor = (prev, mc) => (mc ? mc.newInitial : (prev ? prev.value : null));

const consumptionFor = (curDoc, prev, idx, value) => {
  if (prev === null || value === null) return null;
  const mc = meterChangeFor(curDoc, prev, idx);
  const c = mc ? (mc.oldFinal - prev.value) + (value - mc.newInitial) : value - prev.value;
  return Math.round(c * 100) / 100;
};

// belowRef = القراءة أقل من المرجع (السابقة، أو بداية العداد الجديد بعد التبديل)
const classify = (consumption, expected, belowRef = false) => {
  if (consumption === null) return 'nohistory';
  if (belowRef || consumption < 0) return 'decrease';
  if (!expected) return consumption === 0 ? 'zero' : 'nohistory';
  if (consumption === 0) return 'zero';
  if (consumption > expected * HIGH_FACTOR) return 'high';
  if (consumption < expected * LOW_FACTOR) return 'low';
  return 'ok';
};

// ✅ يبني سطر عداد واحد للواجهة
const buildMeterRow = ({ land, farmer, docsAsc, year, idx, lastEntry }) => {
  const cur  = docsAsc.find(r => r.year === year) || null;
  const prev = findPrevious(docsAsc, year, idx);
  const history = buildHistory(docsAsc, year, idx);
  const { expected, basis } = computeExpected(history, year, idx);
  const currentValue = cur ? num(cur.readings?.[idx]) : null;

  // ✅ هل مسموح للناطور يكتب/يصحّح هالخانة؟
  let editable = false;
  let lockedReason = '';
  let byReader = false;
  if (currentValue === null) {
    editable = true;
  } else if (lastEntry && lastEntry.value === currentValue) {
    editable = true;      // رقم أدخله الناطور بهالدورة وما تغيّر من المكتب
    byReader = true;
  } else {
    lockedReason = 'office'; // الرقم موجود من المكتب/الإكسل — للقراءة فقط
  }

  const consumption = consumptionFor(cur, prev, idx, currentValue);
  const mc = meterChangeFor(cur, prev, idx);
  const refValue = refValueFor(prev, mc);

  return {
    landId:        land._id.toString(),
    farmerId:      farmer?._id?.toString() || '',
    farmerName:    farmer ? (farmer.name || `${farmer.firstName || ''} ${farmer.lastName || ''}`.trim()) : '',
    farmerNameHeb: farmer ? (farmer.nameHeb || farmer.name || '') : '',
    landName:      land.name && land.name !== land.stationNumber ? land.name : '',
    description:   land.description || '',
    stationNumber: land.stationNumber || '',
    regionId:      land.regionId ? land.regionId.toString() : '',
    lat:           num(land.stationLat),
    lng:           num(land.stationLng),
    readingId:     cur ? cur._id.toString() : null,
    prevValue:     prev ? prev.value : null,
    prevYear:      prev ? prev.year : null,
    prevSlot:      prev ? prev.idx : null,   // 0 = قراءة البداية، k = نهاية الفترة k
    currentValue,
    consumption,
    editable,
    byReader,
    lockedReason,
    meterChange:   cur ? ((cur.meterChanges || []).find(c => c.period === idx - 1) || null) : null,
    // ✅ تبديل العداد بيدخل بالحساب فقط إذا القراءة السابقة هي بداية نفس الفترة
    meterChangeApplies: !!mc,
    refValue,                                              // المرجع للمقارنة (بداية العداد الجديد بعد التبديل)
    oldMeterPart:  mc && prev ? Math.round((mc.oldFinal - prev.value) * 100) / 100 : null, // أكواب العداد القديم بهالفترة
    history:       history.slice(-HISTORY_LEN),
    expected,
    expectedBasis: basis,
    status:        lastEntry && byReader ? lastEntry.status : (currentValue !== null ? classify(consumption, expected, refValue !== null && currentValue < refValue) : null),
    reason:        lastEntry && byReader ? lastEntry.reason : '',
    note:          lastEntry && byReader ? lastEntry.note   : '',
    enteredAt:     lastEntry && byReader ? lastEntry.createdAt : null,
    enteredBy:     lastEntry && byReader ? lastEntry.byLabel   : '',
  };
};

const loadContext = async (landFilter = {}) => {
  const lands = await Land.find({ ...landFilter, stationNumber: { $nin: ['', null] }, farmerId: { $ne: null } }).lean();
  const landIds   = lands.map(l => l._id);
  const farmerIds = [...new Set(lands.map(l => l.farmerId.toString()))];
  const [farmers, readings] = await Promise.all([
    Farmer.find({ _id: { $in: farmerIds } }).select('name nameHeb firstName lastName').lean(),
    Reading.find({ landId: { $in: landIds } }).select('landId year readings meterChanges').sort({ year: 1, _id: 1 }).lean(),
  ]);
  const farmersById = new Map(farmers.map(f => [f._id.toString(), f]));
  const readingsByLand = new Map();
  for (const r of readings) {
    const k = r.landId.toString();
    if (!readingsByLand.has(k)) readingsByLand.set(k, []);
    readingsByLand.get(k).push(r);
  }
  return { lands, farmersById, readingsByLand };
};

const latestEntriesMap = async (landIds, year, idx) => {
  const entries = await ReaderEntry.find({ landId: { $in: landIds }, year, idx }).sort({ createdAt: -1 }).lean();
  const map = new Map();
  for (const e of entries) {
    const k = e.landId.toString();
    if (!map.has(k)) map.set(k, e);
  }
  return map;
};

// ════════════════════════════════════════
//  GET /reader/cycle
// ════════════════════════════════════════
const getCycle = async (req, res) => {
  try {
    const c = await getCycleDoc();
    return res.json({ cycle: cycleOut(c), role: req.readerRole });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// ════════════════════════════════════════
//  PUT /reader/cycle  (المدير فقط)
// ════════════════════════════════════════
const updateCycle = async (req, res) => {
  try {
    if (req.readerRole !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    const year  = parseInt(req.body.year, 10);
    const phase = parseInt(req.body.phase, 10);
    const open  = !!req.body.open;
    if (!year || year < 2000 || year > 2100) return res.status(400).json({ error: 'السنة غير صالحة' });
    if (isNaN(phase) || phase < 0 || phase > 24) return res.status(400).json({ error: 'رقم الفترة غير صالح' });
    const doc = await ReaderCycle.findOneAndUpdate(
      { key: 'readerCycle' },
      { $set: { year, phase, open, openedBy: req.readerLabel || '' } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ).lean();
    return res.json({ success: true, cycle: cycleOut(doc) });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// ════════════════════════════════════════
//  GET /reader/meters — كل العدادات للدورة الحالية
// ════════════════════════════════════════
const getMeters = async (req, res) => {
  try {
    const c = cycleOut(await getCycleDoc());
    const regions = (await Region.find().sort({ name: 1 }).lean())
      .map(r => ({ id: r._id.toString(), name: r.name || '', nameHeb: r.nameHeb || '' }));
    if (!c.year || c.phase === null) return res.json({ cycle: c, regions, meters: [] });

    const idx = c.phase;   // ✅ الفترة k → الخانة readings[k] (متل ف1/ف2 بجدول القراءات)
    const { lands, farmersById, readingsByLand } = await loadContext();
    const entries = await latestEntriesMap(lands.map(l => l._id), c.year, idx);

    const meters = lands
      .map(land => buildMeterRow({
        land,
        farmer:   farmersById.get(land.farmerId.toString()),
        docsAsc:  readingsByLand.get(land._id.toString()) || [],
        year:     c.year,
        idx,
        lastEntry: entries.get(land._id.toString()),
      }))
      .sort((a, b) => stationSort(a.stationNumber, b.stationNumber) || a.farmerName.localeCompare(b.farmerName));

    return res.json({ cycle: c, regions, meters });
  } catch (err) {
    console.error('reader getMeters:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

// ════════════════════════════════════════
//  POST /reader/entries — إدخال/تصحيح رقم واحد
//  body: { landId, value, reason?, note?, clientId? }
// ════════════════════════════════════════
const saveEntry = async (req, res) => {
  try {
    const { landId, reason, note, clientId } = req.body || {};
    const value = num(req.body?.value);
    if (!landId) return res.status(400).json({ error: 'الأرض غير محددة' });
    if (value === null || value < 0 || value > 1e9)
      return res.status(400).json({ error: 'رقم القراءة غير صالح', code: 'invalid' });

    const c = cycleOut(await getCycleDoc());
    if (!c.open) return res.status(403).json({ error: 'لا توجد دورة قراءة مفتوحة', code: 'closed' });
    const year = c.year;
    const idx  = c.phase;   // ✅ الفترة k → الخانة readings[k]
    const cleanValue = Math.round(value * 100) / 100;

    // ✅ منع التكرار — نفس الإدخال وصل مرتين (مزامنة بعد انقطاع)
    if (clientId) {
      const dup = await ReaderEntry.findOne({ clientId: String(clientId) }).lean();
      if (dup) {
        const row = await buildRowForLand(landId, year, idx);
        return res.json({ success: true, duplicate: true, meter: row });
      }
    }

    const land = await Land.findById(landId).lean();
    if (!land || !land.farmerId || !land.stationNumber)
      return res.status(404).json({ error: 'العداد غير موجود' });

    let doc = await Reading.findOne({ landId: land._id, year }).sort({ _id: 1 }).lean();
    const lastEntry = doc
      ? await ReaderEntry.findOne({ landId: land._id, year, idx }).sort({ createdAt: -1 }).lean()
      : null;
    const currentValue = doc ? num(doc.readings?.[idx]) : null;

    // ✅ القاعدة: خانة فاضية، أو تصحيح رقم الناطور نفسه بهالدورة
    if (currentValue !== null && !(lastEntry && lastEntry.value === currentValue))
      return res.status(409).json({ error: 'هذه القراءة مسجّلة مسبقاً ولا يمكن تعديلها من هنا', code: 'locked' });

    if (!doc) {
      // ✅ مستند جديد لهالأرض بهالسنة — نفس منطق الاستيراد من الإكسل
      const arr = [];
      for (let i = 0; i <= idx; i++) arr.push(null);
      arr[idx] = cleanValue;
      while (arr.length < 2) arr.push(null);
      const periodsCount = Math.max(0, arr.length - 1);
      const created = await Reading.create({
        farmerId: land.farmerId, landId: land._id, year,
        readings: arr,
        stationNumber: land.stationNumber || '',
        stationLat:    land.stationLat || null,
        stationLng:    land.stationLng || null,
        note: '',
        paidPeriods: Array(periodsCount).fill(false),
        meterChanges: [],
      });
      doc = created.toObject();
    } else {
      // ✅ كتابة ذرية مشروطة على المصفوفة كاملة: ما بتنجح إلا إذا مصفوفة القراءات
      //    لسا بالضبط متل ما قرأناها (لا أحد غيّرها بنفس اللحظة).
      //    ⚠️ ما منفحص الخانة لحالها (readings.N = null) لأنها غالباً مش موجودة بعد
      //    (المصفوفة أقصر) — وهالفحص بـ MongoDB ما بيطابق، فكان الحفظ يُرفض بالغلط.
      const oldReadings = Array.isArray(doc.readings) ? doc.readings : [];
      const newReadings = oldReadings.map(v => (v === undefined ? null : v));
      while (newReadings.length <= idx) newReadings.push(null);
      newReadings[idx] = cleanValue;
      while (newReadings.length < 2) newReadings.push(null);

      // ✅ مصفوفة الدفع: منطوّلها بس (بدون لمس أي قيمة موجودة) — نفس الاستيراد من الإكسل
      const periodsCount = Math.max(0, newReadings.length - 1);
      const oldPaid = Array.isArray(doc.paidPeriods) ? doc.paidPeriods : [];
      const set = { readings: newReadings, updatedAt: new Date() };
      if (oldPaid.length < periodsCount) {
        const pp = [];
        for (let i = 0; i < periodsCount; i++) pp.push(!!oldPaid[i]);
        set.paidPeriods = pp;
      }

      const upd = await Reading.collection.updateOne(
        { _id: doc._id, readings: oldReadings },
        { $set: set }
      );
      if (!upd.matchedCount)
        return res.status(409).json({ error: 'تغيّرت هذه القراءة قبل لحظات — حدّث الصفحة', code: 'changed' });
      doc = { ...doc, ...set };
    }

    // ✅ حساب الحالة على السيرفر (مش معتمدين على الهاتف)
    const docsAsc = await Reading.find({ landId: land._id }).select('landId year readings meterChanges').sort({ year: 1, _id: 1 }).lean();
    const prev = findPrevious(docsAsc, year, idx);
    const history = buildHistory(docsAsc, year, idx);
    const { expected } = computeExpected(history, year, idx);
    const cur = docsAsc.find(r => r.year === year);
    const consumption = consumptionFor(cur, prev, idx, cleanValue);
    const ref = refValueFor(prev, meterChangeFor(cur, prev, idx));
    const status = classify(consumption, expected, ref !== null && cleanValue < ref);

    await ReaderEntry.create({
      readingId: doc._id, landId: land._id, year, idx,
      value: cleanValue,
      prevValue: prev ? prev.value : null,
      consumption, expected, status,
      reason: String(reason || '').slice(0, 60),
      note:   String(note   || '').slice(0, 300),
      byRole:   req.readerRole,
      byUserId: req.readerId || '',
      byLabel:  req.readerLabel || '',
      clientId: clientId ? String(clientId) : '',
    });

    const row = await buildRowForLand(land._id, year, idx);
    return res.json({ success: true, meter: row });
  } catch (err) {
    console.error('reader saveEntry:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

const buildRowForLand = async (landId, year, idx) => {
  const { lands, farmersById, readingsByLand } = await loadContext({ _id: landId });
  const land = lands[0];
  if (!land) return null;
  const entries = await latestEntriesMap([land._id], year, idx);
  return buildMeterRow({
    land,
    farmer:  farmersById.get(land.farmerId.toString()),
    docsAsc: readingsByLand.get(land._id.toString()) || [],
    year, idx,
    lastEntry: entries.get(land._id.toString()),
  });
};

// ════════════════════════════════════════
//  POST /reader/stations/:stationNumber/location
//  ✅ حفظ موقع محطة — فقط للأراضي اللي ما إلها موقع مسجّل (ما بنغيّر موقع موجود)
// ════════════════════════════════════════
const saveStationLocation = async (req, res) => {
  try {
    const stationNumber = String(req.params.stationNumber || '').trim();
    const lat = num(req.body?.lat);
    const lng = num(req.body?.lng);
    if (!stationNumber) return res.status(400).json({ error: 'المحطة غير محددة' });
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180)
      return res.status(400).json({ error: 'الموقع غير صالح' });

    const missing = { stationNumber, $or: [{ stationLat: null }, { stationLng: null }, { stationLat: 0 }] };
    const upd = await Land.updateMany(missing, { $set: { stationLat: lat, stationLng: lng } });
    if (!upd.modifiedCount)
      return res.status(409).json({ error: 'لهذه المحطة موقع مسجّل مسبقاً', code: 'exists' });

    // ✅ نفس سلوك "مزامنة GPS" بالإدارة — نسخ الموقع لمستندات القراءة الناقصة
    await Reading.updateMany(
      { stationNumber, $or: [{ stationLat: null }, { stationLng: null }] },
      { $set: { stationLat: lat, stationLng: lng } }
    );
    return res.json({ success: true, updated: upd.modifiedCount });
  } catch (err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

module.exports = { getCycle, updateCycle, getMeters, saveEntry, saveStationLocation };
