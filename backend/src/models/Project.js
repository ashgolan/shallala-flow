const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  amount:  { type: Number, required: true },
  date:    { type: Date,   default: Date.now },
  note:    { type: String, default: '' },
}, { _id: true });

const memberSchema = new mongoose.Schema({
  farmerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', required: true },
  amount:    { type: Number, default: 0 },   // المبلغ المطلوب
  invoiced:  { type: Boolean, default: false }, // صدرت فاتورة
  payments:  { type: [paymentSchema], default: [] },
}, { _id: true });

const projectSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  date:        { type: Date,   default: Date.now },
  lat:         { type: Number, default: null },
  lng:         { type: Number, default: null },
  locationNote:{ type: String, default: '' }, // اسم النقطة أو وصفها
  members:     { type: [memberSchema], default: [] },
  status:      { type: String, enum: ['active','done','cancelled'], default: 'active' },
}, {
  timestamps: true,
  collection: 'projects',
});

module.exports = mongoose.model('Project', projectSchema);
