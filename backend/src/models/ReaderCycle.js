const mongoose = require('mongoose');

// ════════════════════════════════════════════════════════════
//  ReaderCycle — دورة القراءة المفتوحة لصفحة الناطور
//  ✅ مستند واحد فقط (key: 'readerCycle'). المدير يحدد السنة ورقم الفترة
//  (متل ف1/ف2 بجدول القراءات: الفترة k → الخانة readings[k]؛ 0 = قراءة بداية السنة)
//  ويفتح/يغلق الدورة. لما تكون مغلقة، الناطور ما بيقدر يدخل ولا رقم.
// ════════════════════════════════════════════════════════════
const readerCycleSchema = new mongoose.Schema({
  key:   { type: String, default: 'readerCycle', unique: true },
  year:  { type: Number, default: null },
  phase: { type: Number, default: null },  // متل ف1/ف2 بجدول القراءات: k = قراءة نهاية الفترة k (الخانة readings[k])، 0 = قراءة بداية السنة
  open:  { type: Boolean, default: false },
  openedBy: { type: String, default: '' },
}, { collection: 'settings_reader_cycle', timestamps: true });

module.exports = mongoose.model('ReaderCycle', readerCycleSchema);