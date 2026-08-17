const mongoose = require('mongoose');

// ============================================================
//  PushSubscription.js — اشتراكات Web Push (جهاز/متصفح واحد لكل سطر)
//  role/userId بنفس نمط Task.js (fromRole/toRole/toUserId) — تُستخدم
//  لتحديد مين يوصله إشعار: كل أجهزة role='admin' (صندوق مشترك)،
//  أو أجهزة role='viewer' التابعة لـ userId محدد فقط.
// ============================================================
const pushSubscriptionSchema = new mongoose.Schema({
  role:     { type: String, enum: ['admin', 'viewer'], required: true },
  userId:   { type: String, default: null }, // Privileged._id — موجود دايماً للـ viewer، وللأدمن إن وُجد بالتوكن
  endpoint: { type: String, required: true, unique: true },
  keys: {
    p256dh: { type: String, required: true },
    auth:   { type: String, required: true },
  },
}, { collection: 'push_subscriptions', timestamps: true });

pushSubscriptionSchema.index({ role: 1, userId: 1 });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);