const PushSubscription = require('../models/PushSubscription');
const { webpush, isWebPushReady } = require('../../config/webpush');

// ============================================================
//  pushNotify.js — إرسال إشعار هاتف عند إنشاء طلب/مهمة جديدة
//  best-effort دائماً: أي فشل هون ما لازم يوقف إنشاء الطلب نفسه
//  (يُستدعى من taskController.createTask بدون await محظور على الرد)
// ============================================================

// ✅ نفس منطق توجيه الطلب بالضبط (طابق getTasks/getPendingCount بـ taskController):
//    toRole='admin' → صندوق مشترك، كل أجهزة الأدمن المشتركة
//    toRole='viewer' → فقط أجهزة المراقب صاحب toUserId
const findTargetSubscriptions = (task) => {
  if (task.toRole === 'admin') {
    return PushSubscription.find({ role: 'admin' }).lean();
  }
  return PushSubscription.find({ role: 'viewer', userId: task.toUserId }).lean();
};

const buildPayload = (task) => {
  const preview = task.message.length > 110 ? task.message.slice(0, 110) + '…' : task.message;
  return JSON.stringify({
    title: `📨 ${task.fromLabel || 'طلب جديد'}`,
    body:  preview,
    tag:   `task-${task._id}`,
    url:   '/?openTasks=1',
  });
};

const notifyTaskRecipients = async (task) => {
  try {
    if (!isWebPushReady()) return; // مفاتيح VAPID غير مضبوطة بعد — تجاهل بصمت

    const subs = await findTargetSubscriptions(task);
    if (!subs.length) return;

    const payload = buildPayload(task);

    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload,
        );
      } catch (err) {
        // ✅ 404/410 = الاشتراك منتهي/الجهاز ألغى الإذن → نظّفه من القاعدة
        if (err.statusCode === 404 || err.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
        } else {
          console.error('web-push send error:', err.message);
        }
      }
    }));
  } catch (err) {
    console.error('notifyTaskRecipients:', err);
  }
};

module.exports = { notifyTaskRecipients };