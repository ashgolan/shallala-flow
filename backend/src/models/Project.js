const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  amount:        { type: Number, required: true },
  date:          { type: Date,   default: Date.now },
  note:          { type: String, default: '' },
  receiptNumber: { type: String, default: '' }, // رقم الوصل — يُستخدم فقط بمشاريع customMembers
  bookNumber:    { type: String, default: '' }, // رقم الدفتر — يُستخدم فقط بمشاريع customMembers
}, { _id: true });

const memberSchema = new mongoose.Schema({
  farmerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', required: false }, // اختياري الآن
  memberName: { type: String, default: '' }, // اسم حر — يُستخدم فقط عندما لا يوجد farmerId (مشاريع customMembers)
  amount:     { type: Number, default: null },   // المبلغ المطلوب — null = غير محدد بعد
  invoiced:   { type: Boolean, default: false }, // صدرت فاتورة
  payments:   { type: [paymentSchema], default: [] },
}, { _id: true });

const projectSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  description:   { type: String, default: '' },
  date:          { type: Date,   default: Date.now },
  lat:           { type: Number, default: null },
  lng:           { type: Number, default: null },
  locationNote:  { type: String, default: '' }, // اسم النقطة أو وصفها
  members:       { type: [memberSchema], default: [] },
  status:        { type: String, enum: ['active','done','cancelled'], default: 'active' },
  // ✅ إذا true: المشتركون بأسماء حرة (غير مرتبطين بقائمة المزارعين)، وتظهر حقول رقم الوصل/الدفتر بالدفعات
  customMembers: { type: Boolean, default: false },
}, {
  timestamps: true,
  collection: 'projects',
});

module.exports = mongoose.model('Project', projectSchema);