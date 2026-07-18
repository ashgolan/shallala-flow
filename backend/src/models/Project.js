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
  // ✅ محطة خاصة بهذا المشترك تحديداً — تُستخدم لمشاريع لا تخص محطة واحدة (مثل "تطوير طريق")
  // بل عدة مزارعين كل واحد على محطته الخاصة. لها أولوية على محطة المشروع العامة (project.stationNumber)
  // عند تحديد نطاق تحذير "لم يدفع" بصفحة القراءات. فارغة = تُستخدم محطة المشروع العامة إن وُجدت.
  stationNumber: { type: String, default: '' },
  amount:     { type: Number, default: null },   // المبلغ المطلوب الفردي — null = غير محدد بعد (لا يُستخدم في مشاريع customMembers)
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
  // ✅ الأرض/المحطة التي يخص بها هذا المشروع بأكمله — اختياري (يُستخدم لعرض GPS على الخريطة فقط)
  landId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Land', default: null },
  // ✅ رقم المحطة كنص — هذا هو المفتاح الفعلي المستخدم لمطابقة تحذير "لم يدفع" بصفحة
  // القراءات (يُقارَن بـ reading.stationNumber نصياً). نعتمد النص بدل landId لأن الأراضي
  // المكررة بقاعدة البيانات (نفس رقم المحطة بعدة سجلات) تكسر أي مطابقة تعتمد على الـ ID،
  // بينما النص "K3" يبقى متطابقاً دائماً بغض النظر عن عدد النسخ المكررة.
  stationNumber: { type: String, default: '' },
  members:       { type: [memberSchema], default: [] },
  status:        { type: String, enum: ['active','done','cancelled'], default: 'active' },
  // ✅ إذا true: المشتركون بأسماء حرة (غير مرتبطين بقائمة المزارعين)، وتظهر حقول رقم الوصل/الدفتر بالدفعات
  customMembers: { type: Boolean, default: false },
  // ✅ المبلغ الإجمالي المطلوب لكامل المشروع — يُستخدم فقط عندما customMembers=true
  //    (بدل تحديد مبلغ مطلوب لكل مشترك على حدة؛ كل شخص يدفع حسب قدرته من هذا الهدف العام)
  targetAmount:  { type: Number, default: null },
}, {
  timestamps: true,
  collection: 'projects',
});

module.exports = mongoose.model('Project', projectSchema);