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

    // نحاول admin أولاً ثم viewer
    try {
      const decoded = verifyAdminToken(token);
      if (decoded.role !== 'admin')
        return res.status(403).json({ error: 'غير مصرح - ليس مدير' });
      req.adminRole = 'admin';
      return next();
    } catch {}

    // viewer لديه صلاحية قراءة فقط
    try {
      const decoded = verifyViewerToken(token);
      if (decoded.role !== 'viewer')
        return res.status(403).json({ error: 'غير مصرح' });
      req.adminRole = 'viewer';
      return next();
    } catch {}

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

    req.adminRole = 'admin';
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
    // نقبل admin أو viewer
    try {
      const d = verifyAdminToken(token);
      if (d.role === 'admin') { req.adminRole = 'admin'; return next(); }
    } catch {}
    try {
      const d = verifyViewerToken(token);
      if (d.role === 'viewer') { req.adminRole = 'viewer'; return next(); }
    } catch {}

    return res.status(401).json({ error: 'رمز غير صالح' });
  } catch (err) {
    return res.status(401).json({ error: 'خطأ في التحقق' });
  }
};

module.exports = { requireFarmer, requireAdmin, requireAdminOnly, requireViewer };
