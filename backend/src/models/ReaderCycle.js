const mongoose = require('mongoose');

// ════════════════════════════════════════════════════════════
//  ReaderCycle — دورة القراءة المفتوحة لصفحة الناطور
//  ✅ مستند واحد فقط (key: 'readerCycle'). المدير يحدد السنة ورقم الفترة
//  (نفس رقم الفترة المستخدم بتصدير ملف الإكسل: الفترة p → الخانة readings[p-1])
//  ويفتح/يغلق الدورة. لما تكون مغلقة، الناطور ما بيقدر يدخل ولا رقم.
// ════════════════════════════════════════════════════════════
const readerCycleSchema = new mongoose.Schema({
  key:   { type: String, default: 'readerCycle', unique: true },
  year:  { type: Number, default: null },
  phase: { type: Number, default: null },  // 1-based — نفس "תקופה" بملف الإكسل
  open:  { type: Boolean, default: false },
  openedBy: { type: String, default: '' },
}, { collection: 'settings_reader_cycle', timestamps: true });

module.exports = mongoose.model('ReaderCycle', readerCycleSchema);
