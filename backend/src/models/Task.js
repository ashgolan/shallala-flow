const mongoose = require('mongoose');

// ============================================================
//  Task.js — طلبات/مهام التواصل بين المدير العام والمراقبين
//  fromRole/toRole: 'admin' (جماعي — كل حسابات الأدمن تشوف نفس الصندوق)
//                    أو 'viewer' (محدد بـ userId من Privileged)
// ============================================================
const taskSchema = new mongoose.Schema({
  fromRole:  { type: String, enum: ['admin', 'viewer'], required: true },
  // ✅ Privileged._id كنص للمراقب المرسل؛ null إذا المرسل أدمن (لا يوجد userId بتوكن الأدمن)
  fromUserId: { type: String, default: null },
  // ✅ لقطة اسم وقت الإرسال — يبقى صحيح حتى لو تغيّر/انحذف المستخدم لاحقاً
  fromLabel: { type: String, default: '' },

  toRole:    { type: String, enum: ['admin', 'viewer'], required: true },
  toUserId:  { type: String, default: null },
  toLabel:   { type: String, default: '' },

  message:   { type: String, required: true, trim: true },

  imageUrl:  { type: String, default: '' },
  imagePath: { type: String, default: '' },

  status:    { type: String, enum: ['open', 'done'], default: 'open' },
  doneAt:       { type: Date,   default: null },
  doneByRole:   { type: String, default: '' },
  doneByUserId: { type: String, default: null },
  doneByLabel:  { type: String, default: '' },
}, { collection: 'tasks', timestamps: true });

taskSchema.index({ toRole: 1, toUserId: 1, status: 1 });
taskSchema.index({ fromRole: 1, fromUserId: 1 });
taskSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Task', taskSchema);