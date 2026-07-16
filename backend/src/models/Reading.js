const mongoose = require('mongoose');

const extraSchema = new mongoose.Schema({
  note:   { type: String, default: '' },   // سبب الإضافة
  amount: { type: Number, default: 0 },    // المبلغ الكلي
  paid:   { type: Number, default: 0 },    // المدفوع منه
}, { _id: true });

// ✅ تبديل عداد داخل فترة موجودة (بدون إضافة فترة جديدة):
// period      = فهرس الفترة (0-based) التي حصل فيها التبديل — بين readings[period] و readings[period+1]
// oldFinal    = آخر قراءة على العداد القديم (إغلاقه) قبل الفك
// newInitial  = أول قراءة على العداد الجديد (بدايته) بعد التركيب
// الاستهلاك الكلي لهذه الفترة = (oldFinal - readings[period]) + (readings[period+1] - newInitial)
const meterChangeSchema = new mongoose.Schema({
  period:     { type: Number, required: true },
  oldFinal:   { type: Number, required: true },
  newInitial: { type: Number, required: true },
}, { _id: false });

const readingSchema = new mongoose.Schema({
  farmerId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', required: true, index: true },
  landId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Land',   required: true, index: true },
  year:          { type: Number, required: true, min: 2000, max: 2100 },
  readings:      { type: [Number], required: true, validate: v => v.length >= 2 },
  stationNumber: { type: String,  default: '' },
  stationLat:    { type: Number,  default: null },
  stationLng:    { type: Number,  default: null },
  // ✅ مصفوفة الإضافات
  extras:        { type: [extraSchema], default: [] },
  // ✅ الحقول القديمة للتوافق مع البيانات الموجودة
  extra:         { type: Number,  default: 0 },
  extraPaid:     { type: Number,  default: 0 },
  extraNote:     { type: String,  default: '' },
  note:          { type: String,  default: '' },
  // ✅ حالة دفع كل فترة (دورة) على حدة
  paidPeriods:   { type: [Boolean], default: [] },
  // ✅ تبديلات العداد — كل فترة تحتفظ برقمها وسعرها تماماً، ويُدمج فيها استهلاك
  // العداد القديم + الجديد معاً بدل خلق فترة منفصلة
  meterChanges:  { type: [meterChangeSchema], default: [] },
  // ✅ الحقول القديمة — تبقى للتوافق فقط، وتُشتق تلقائياً من paidPeriods
  paid:          { type: Boolean, default: false },
  paidAt:        { type: Date,    default: null },
}, {
  timestamps: true,
  collection: 'readings',
});

readingSchema.index({ landId: 1, year: 1 });

module.exports = mongoose.model('Reading', readingSchema);