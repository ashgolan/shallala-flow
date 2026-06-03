const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  date:        { type: Date,   required: true },
  recipient:   { type: String, required: true, trim: true }, // المستفيد (مقاول/شركة/لجنة)
  amount:      { type: Number, required: true, min: 0 },
  checkNumber: { type: String, default: '', trim: true },    // رقم الشيك
  invoiceNumber:{ type: String, default: '', trim: true },   // رقم החשבונית
  description: { type: String, required: true, trim: true }, // طبيعة العمل / سبب الدفع
  category:    { type: String, default: 'general', trim: true }, // تصنيف
  notes:       { type: String, default: '' },
}, {
  timestamps: true,
  collection: 'payments',
});

paymentSchema.index({ date: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
