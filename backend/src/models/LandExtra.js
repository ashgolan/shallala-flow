const mongoose = require('mongoose');

// ════════════════════════════════════════════════════════════
//  LandExtra — إضافة تابعة للأرض نفسها (مش لقراءة سنة معينة)
//  ✅ الفكرة: اشتراك/تجهيزات/رسوم بتخص الأرض بشكل دائم، وبنفس
//  السجل بيضل يظهر بغض النظر عن أي سنة قراءة تفتح — لحد ما تُعلَّم
//  مدفوعة بالكامل. قبل هيك كانت الإضافات محشورة جوا مستند Reading
//  (مربوطة landId+year)، فكانت "تختفي" كل ما تنفتح سنة جديدة.
// ════════════════════════════════════════════════════════════
const landExtraSchema = new mongoose.Schema({
  landId: { type: mongoose.Schema.Types.ObjectId, ref: 'Land', required: true, index: true },
  note:   { type: String, default: '' },   // سبب الإضافة (اشتراك خط مياه، تجهيزات...)
  amount: { type: Number, default: 0 },    // المبلغ الكلي
  paid:   { type: Number, default: 0 },    // المدفوع منه
}, {
  timestamps: true,
  collection: 'land_extras',
});

module.exports = mongoose.model('LandExtra', landExtraSchema);