const { verifyFarmerToken, verifyAdminToken, verifyViewerToken } = require('../utils/jwt');

// ─── Farmer Auth ──────────────────────────────────────────────
const requireFarmer = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
      return res.status(401).json({ error: 'غير مصرح - يجب تسجيل الدخول' });

    const decoded = verifyFarmerToken(authHeader.split(' ')[1]);
    if (decoded.type !== 'farmer')
      return res.status(403).json({ error: 'غير مصرح' });

    req.farmer = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'انتهت صلاحية الجلسة', expired: true });
    return res.status(401).json({ error: 'رمز غير صالح' });
  }
};

// ─── Admin Auth (full access) ─────────────────────────────────
const requireAdmin = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
      return res.status(401).json({ error: 'غير مصرح' });

    const token = authHeader.split(' ')[1];

    // ✅ نحاول admin أولاً — مع التمييز بين منتهي الصلاحية وغير صالح
    try {
      const decoded = verifyAdminToken(token);
      if (decoded.role !== 'admin')
        return res.status(403).json({ error: 'غير مصرح - ليس مدير' });
      req.adminRole = 'admin';
      // ✅ هوية حساب الأدمن (إن وُجدت بالتوكن — توكنات قديمة قبل هذا التحديث ما فيها userId)
      req.adminId    = decoded.userId || null;
      req.adminLabel = decoded.label  || '';
      return next();
    } catch (adminErr) {
      // ✅ إذا انتهت صلاحية token الأدمن → أرسل expired فوراً
      if (adminErr.name === 'TokenExpiredError')
        return res.status(401).json({ error: 'انتهت صلاحية الجلسة', expired: true });
    }

    // ✅ نحاول viewer — مع التمييز بين منتهي الصلاحية وغير صالح
    try {
      const decoded = verifyViewerToken(token);
      if (decoded.role !== 'viewer')
        return res.status(403).json({ error: 'غير مصرح' });
      req.adminRole = 'viewer';
      // ✅ صلاحيات المشاريع الخاصة بهذا المراقب (محقونة داخل التوكن وقت الدخول)
      req.viewerId = decoded.userId || null;
      req.viewerAllowedProjectIds = decoded.allowedProjectIds || [];
      return next();
    } catch (viewerErr) {
      // ✅ إذا انتهت صلاحية token الـ viewer → أرسل expired فوراً
      if (viewerErr.name === 'TokenExpiredError')
        return res.status(401).json({ error: 'انتهت صلاحية الجلسة', expired: true });
    }

    return res.status(401).json({ error: 'رمز غير صالح' });
  } catch (err) {
    return res.status(401).json({ error: 'خطأ في التحقق' });
  }
};

// ─── Admin Only (write operations) ───────────────────────────
const requireAdminOnly = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
      return res.status(401).json({ error: 'غير مصرح' });

    const decoded = verifyAdminToken(authHeader.split(' ')[1]);
    if (decoded.role !== 'admin')
      return res.status(403).json({ error: 'غير مصرح - ليس مدير رئيسي' });

    req.adminRole  = 'admin';
    req.adminId    = decoded.userId || null;
    req.adminLabel = decoded.label  || '';
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'انتهت صلاحية الجلسة', expired: true });
    return res.status(401).json({ error: 'رمز غير صالح' });
  }
};

// ─── Viewer (read-only) ───────────────────────────────────────
const requireViewer = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
      return res.status(401).json({ error: 'غير مصرح' });

    const token = authHeader.split(' ')[1];

    try {
      const d = verifyAdminToken(token);
      if (d.role === 'admin') {
        req.adminRole  = 'admin';
        req.adminId    = d.userId || null;
        req.adminLabel = d.label  || '';
        return next();
      }
    } catch (e) {
      if (e.name === 'TokenExpiredError')
        return res.status(401).json({ error: 'انتهت صلاحية الجلسة', expired: true });
    }
    try {
      const d = verifyViewerToken(token);
      if (d.role === 'viewer') {
        req.adminRole = 'viewer';
        req.viewerId = d.userId || null;
        req.viewerAllowedProjectIds = d.allowedProjectIds || [];
        return next();
      }
    } catch (e) {
      if (e.name === 'TokenExpiredError')
        return res.status(401).json({ error: 'انتهت صلاحية الجلسة', expired: true });
    }

    return res.status(401).json({ error: 'رمز غير صالح' });
  } catch (err) {
    return res.status(401).json({ error: 'خطأ في التحقق' });
  }
};

module.exports = { requireFarmer, requireAdmin, requireAdminOnly, requireViewer };