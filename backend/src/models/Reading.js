const mongoose = require('mongoose');

const readingSchema = new mongoose.Schema({
  farmerId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', required: true, index: true },
  landId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Land',   required: true, index: true },
  year:          { type: Number, required: true, min: 2000, max: 2100 },
  readings:      { type: [Number], required: true, validate: v => v.length >= 2 },
  stationNumber: { type: String,  default: '' },  // رقم المحطة مثل A16
  stationLat:    { type: Number,  default: null }, // خط العرض
  stationLng:    { type: Number,  default: null }, // خط الطول
  extra:         { type: Number,  default: 0 },    // مبلغ إضافي
  extraPaid:     { type: Number,  default: 0 },    // المبلغ المدفوع من الإضافة
  extraNote:     { type: String,  default: '' },   // سبب الإضافة
  note:          { type: String,  default: '' },   // ملاحظة القراءة
  paid:          { type: Boolean, default: false },
  paidAt:        { type: Date, default: null },
}, {
  timestamps: true,
  collection: 'readings',
});

// index بدون unique — يمكن لنفس الأرض أن تملك أكثر من قراءة في نفس السنة
readingSchema.index({ landId: 1, year: 1 });

module.exports = mongoose.model('Reading', readingSchema);
