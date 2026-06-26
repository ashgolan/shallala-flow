const mongoose = require('mongoose');

const extraSchema = new mongoose.Schema({
  note:   { type: String, default: '' },   // سبب الإضافة
  amount: { type: Number, default: 0 },    // المبلغ الكلي
  paid:   { type: Number, default: 0 },    // المدفوع منه
}, { _id: true });

const readingSchema = new mongoose.Schema({
  farmerId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', required: true, index: true },
  landId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Land',   required: true, index: true },
  year:          { type: Number, required: true, min: 2000, max: 2100 },
  readings:      { type: [Number], required: true, validate: v => v.length >= 2 },
  stationNumber: { type: String,  default: '' },
  stationLat:    { type: Number,  default: null },
  stationLng:    { type: Number,  default: null },
  // ✅ مصفوفة الإضافات الجديدة
  extras:        { type: [extraSchema], default: [] },
  // ✅ الحقول القديمة للتوافق مع البيانات الموجودة
  extra:         { type: Number,  default: 0 },
  extraPaid:     { type: Number,  default: 0 },
  extraNote:     { type: String,  default: '' },
  note:          { type: String,  default: '' },
  paid:          { type: Boolean, default: false },
  paidAt:        { type: Date,    default: null },
}, {
  timestamps: true,
  collection: 'readings',
});

readingSchema.index({ landId: 1, year: 1 });

module.exports = mongoose.model('Reading', readingSchema);