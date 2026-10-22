const mongoose = require('mongoose');

// ════════════════════════════════════════════════════════════
//  ReaderEntry — سجل كل رقم أدخله الناطور من صفحة إدخال القراءات
//  ✅ ما بيغيّر بنية Reading نهائياً: القيمة نفسها بتنكتب بخانة
//  readings[idx] بمستند القراءة العادي (متل الاستيراد من الإكسل بالضبط)،
//  وهون بنحفظ مين أدخلها ومتى وحالتها (طبيعي/للمراجعة) والسبب.
//  ✅ يُستخدم كمان لتحديد إذا الناطور مسموح له يصحّح رقمه: فقط إذا آخر
//  سجل لهالخانة هو تبعه والقيمة بالخانة ما تغيّرت من المكتب بعده.
// ════════════════════════════════════════════════════════════
const readerEntrySchema = new mongoose.Schema({
  readingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reading', required: true, index: true },
  landId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Land',    required: true, index: true },
  year:      { type: Number, required: true },
  idx:       { type: Number, required: true },        // الخانة بمصفوفة readings
  value:     { type: Number, required: true },
  prevValue: { type: Number, default: null },          // القراءة السابقة وقت الإدخال
  consumption: { type: Number, default: null },        // الأكواب المحسوبة وقت الإدخال
  expected:  { type: Number, default: null },          // الاستهلاك المتوقع (للمقارنة)
  status:    { type: String, enum: ['ok', 'high', 'low', 'zero', 'decrease', 'nohistory'], default: 'ok' },
  reason:    { type: String, default: '' },            // سبب يختاره الناطور عند التنبيه
  note:      { type: String, default: '' },
  byRole:    { type: String, default: 'reader' },      // reader | admin
  byUserId:  { type: String, default: '' },
  byLabel:   { type: String, default: '' },
  clientId:  { type: String, default: '', index: true }, // لمنع التكرار عند المزامنة بعد انقطاع الإنترنت
}, { collection: 'reader_entries', timestamps: true });

readerEntrySchema.index({ landId: 1, year: 1, idx: 1, createdAt: -1 });

module.exports = mongoose.model('ReaderEntry', readerEntrySchema);
