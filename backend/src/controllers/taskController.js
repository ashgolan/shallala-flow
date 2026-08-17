const busboy = require('busboy');
const { Privileged } = require('../models/Settings');
const Task = require('../models/Task');
const { getStorage } = require('../../config/firebase');
const { notifyTaskRecipients } = require('../services/pushNotify');

// ✅ يجيب لقطة اسم (label) المستخدم المراقب الحالي من جدول Privileged — تُخزَّن مع الطلب
//    حتى لو تغيّر الاسم أو انحذف المستخدم لاحقاً يبقى واضح مين كان المرسل/المستلم وقتها
const getViewerLabel = async (viewerId) => {
  if (!viewerId) return '';
  const doc = await Privileged.findOne({ key: 'privileged' });
  const user = doc?.users?.id ? doc.users.id(viewerId) : doc?.users?.find(u => u._id.toString() === viewerId);
  return user?.label || 'مراقب';
};

const taskResponse = (t) => ({
  id:           t._id.toString(),
  fromRole:     t.fromRole,
  fromUserId:   t.fromUserId,
  fromLabel:    t.fromLabel,
  toRole:       t.toRole,
  toUserId:     t.toUserId,
  toLabel:      t.toLabel,
  message:      t.message,
  imageUrl:     t.imageUrl || '',
  imagePath:    t.imagePath || '',
  status:       t.status,
  doneAt:       t.doneAt,
  doneByRole:   t.doneByRole || '',
  doneByUserId: t.doneByUserId || null,
  doneByLabel:  t.doneByLabel || '',
  createdAt:    t.createdAt,
  updatedAt:    t.updatedAt,
});

// ─── إنشاء طلب/مهمة جديدة ────────────────────────────────────
const createTask = async (req, res) => {
  try {
    const { message, imageUrl, imagePath, toUserId } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'نص الرسالة مطلوب' });
    }

    let fromRole, fromUserId, fromLabel, toRole, toUserId_, toLabel;

    if (req.adminRole === 'viewer') {
      // ✅ المراقب يرسل فقط للمدير العام (كيان جماعي — أي حساب أدمن يشوفه)
      fromRole   = 'viewer';
      fromUserId = req.viewerId || null;
      fromLabel  = await getViewerLabel(req.viewerId);
      toRole     = 'admin';
      toUserId_  = null;
      toLabel    = 'المدير العام';
    } else {
      // ✅ الأدمن يرسل لمراقب محدد إلزامياً
      if (!toUserId) return res.status(400).json({ error: 'يرجى اختيار المراقب المستلم' });
      const doc = await Privileged.findOne({ key: 'privileged' });
      const target = doc?.users?.id ? doc.users.id(toUserId) : doc?.users?.find(u => u._id.toString() === toUserId);
      if (!target || target.role !== 'viewer') {
        return res.status(404).json({ error: 'المراقب المستلم غير موجود' });
      }
      // ✅ هوية الأدمن المرسل (إن وُجدت بالتوكن — راجع requireAdmin بـ auth.js)؛
      //    تسجيلات دخول قديمة قبل هذا التحديث ما فيها userId فتنعدل بـ'المدير العام'
      fromRole   = 'admin';
      fromUserId = req.adminId || null;
      fromLabel  = req.adminLabel || 'المدير العام';
      toRole     = 'viewer';
      toUserId_  = toUserId;
      toLabel    = target.label || 'مراقب';
    }

    const task = await Task.create({
      fromRole, fromUserId, fromLabel,
      toRole, toUserId: toUserId_, toLabel,
      message: message.trim(),
      imageUrl:  imageUrl  || '',
      imagePath: imagePath || '',
    });

    // ✅ إشعار هاتف فوري للمستلم — best-effort، ما توقف الرد ولا تفشّل الطلب لو فشل الإرسال
    notifyTaskRecipients(task).catch(() => {});

    return res.status(201).json({ success: true, task: taskResponse(task) });
  } catch (err) {
    console.error('createTask:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

// ─── جلب الطلبات (مع فلاتر بحث/حالة/تاريخ) ───────────────────
const getTasks = async (req, res) => {
  try {
    const { q, status, dateFrom, dateTo } = req.query;
    const filter = {};

    if (req.adminRole === 'viewer') {
      // ✅ المراقب يشوف فقط طلباته هو (مرسلة أو واردة له) — خصوصية باقي المراقبين
      filter.$or = [
        { fromRole: 'viewer', fromUserId: req.viewerId },
        { toRole: 'viewer', toUserId: req.viewerId },
      ];
    }
    // الأدمن يشوف كل الطلبات (بدون فلتر مستخدم)

    if (status && ['open', 'done'].includes(status)) filter.status = status;

    if (q && q.trim()) {
      const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const textFilter = { $or: [{ message: rx }, { fromLabel: rx }, { toLabel: rx }] };
      filter.$and = filter.$and || [];
      filter.$and.push(textFilter);
    }

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom + 'T00:00:00');
      if (dateTo)   filter.createdAt.$lte = new Date(dateTo   + 'T23:59:59');
    }

    const tasks = await Task.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    return res.json({ tasks: tasks.map(taskResponse) });
  } catch (err) {
    console.error('getTasks:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

// ─── عدد الطلبات المفتوحة الموجهة لي (للشارة/الجرس) ──────────
const getPendingCount = async (req, res) => {
  try {
    const filter = { status: 'open' };
    if (req.adminRole === 'admin') {
      filter.toRole = 'admin';
    } else {
      filter.toRole = 'viewer';
      filter.toUserId = req.viewerId;
    }
    const count = await Task.countDocuments(filter);
    return res.json({ count });
  } catch (err) {
    console.error('getPendingCount:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

// ✅ يتحقق إذا الحساب الحالي مسموح له يغيّر حالة هذا الطلب
const canActOnTask = (req, task) => {
  if (req.adminRole === 'admin') return true;
  // مراقب: فقط الطلبات الموجهة له تحديداً
  return task.toRole === 'viewer' && task.toUserId === req.viewerId;
};

// ─── تعليم "تم التنفيذ" ───────────────────────────────────────
const markDone = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'الطلب غير موجود' });
    if (!canActOnTask(req, task)) return res.status(403).json({ error: 'غير مصرح' });

    task.status       = 'done';
    task.doneAt       = new Date();
    task.doneByRole   = req.adminRole;
    task.doneByUserId = req.adminRole === 'admin' ? (req.adminId || null) : (req.viewerId || null);
    task.doneByLabel  = req.adminRole === 'admin'
      ? (req.adminLabel || 'المدير العام')
      : await getViewerLabel(req.viewerId);
    await task.save();

    return res.json({ success: true, task: taskResponse(task) });
  } catch (err) {
    console.error('markDone:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

// ─── إعادة فتح طلب ─────────────────────────────────────────────
const reopenTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'الطلب غير موجود' });
    if (!canActOnTask(req, task)) return res.status(403).json({ error: 'غير مصرح' });

    task.status       = 'open';
    task.doneAt       = null;
    task.doneByRole   = '';
    task.doneByUserId = null;
    task.doneByLabel  = '';
    await task.save();

    return res.json({ success: true, task: taskResponse(task) });
  } catch (err) {
    console.error('reopenTask:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

// ─── رفع صورة مرفقة بالطلب (نفس نمط رفع صور المعرض) ───────────
const uploadImage = async (req, res) => {
  try {
    const bb = busboy({ headers: req.headers, limits: { fileSize: 5 * 1024 * 1024 } });
    const storage = getStorage();
    const bucket  = storage.bucket();
    let fileReceived = false;

    bb.on('file', (name, file, info) => {
      fileReceived = true;
      const { mimeType } = info;
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowed.includes(mimeType)) {
        file.resume();
        if (!res.headersSent) res.status(400).json({ error: 'نوع الملف غير مسموح' });
        return;
      }
      const ext      = mimeType.split('/')[1];
      const fileName = `tasks/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const fileRef  = bucket.file(fileName);
      const stream   = fileRef.createWriteStream({ metadata: { contentType: mimeType }, public: true });
      file.pipe(stream);
      stream.on('finish', () => {
        if (res.headersSent) return;
        const uploadedUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        res.json({ success: true, url: uploadedUrl, path: fileName });
      });
      stream.on('error', (err) => {
        console.error('GCS upload stream error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'فشل الرفع إلى التخزين' });
      });
    });
    bb.on('finish', () => {
      if (!fileReceived && !res.headersSent) res.status(400).json({ error: 'لم يتم إرسال أي ملف' });
    });
    bb.on('error', (err) => {
      console.error('Busboy parse error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'خطأ في معالجة الملف المرفوع' });
    });
    req.pipe(bb);
  } catch (err) {
    console.error('uploadImage:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

module.exports = {
  createTask, getTasks, getPendingCount, markDone, reopenTask, uploadImage,
};