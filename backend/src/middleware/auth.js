const { verifyFarmerToken, verifyAdminToken } = require('../utils/jwt');

// ─── Farmer Auth ──────────────────────────────────────────────
const requireFarmer = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'غير مصرح - يجب تسجيل الدخول' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyFarmerToken(token);

    if (decoded.type !== 'farmer') {
      return res.status(403).json({ error: 'غير مصرح - نوع الحساب غير صحيح' });
    }

    req.farmer = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'انتهت صلاحية الجلسة - يرجى تسجيل الدخول مجدداً', expired: true });
    }
    return res.status(401).json({ error: 'رمز غير صالح' });
  }
};

// ─── Admin Auth ───────────────────────────────────────────────
const requireAdmin = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'غير مصرح' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAdminToken(token);

    if (decoded.type !== 'admin') {
      return res.status(403).json({ error: 'غير مصرح - ليس مدير' });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'انتهت صلاحية الجلسة', expired: true });
    }
    return res.status(401).json({ error: 'رمز غير صالح' });
  }
};

module.exports = { requireFarmer, requireAdmin };
