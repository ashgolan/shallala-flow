const jwt = require('jsonwebtoken');

const FARMER_SECRET = process.env.JWT_SECRET;
const ADMIN_SECRET  = process.env.ADMIN_JWT_SECRET;
const VIEWER_SECRET = process.env.VIEWER_JWT_SECRET || process.env.ADMIN_JWT_SECRET + '_viewer';

const generateFarmerToken = (payload) =>
  jwt.sign(payload, FARMER_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });

// ✅ يقبل الآن حمولة إضافية اختيارية: { userId, label } — لتمييز حساب أدمن عن آخر
//    (لأجل ميزات مثل "المهام والاستفسارات" التي تحتاج تعرف مين بالضبط أرسل/أنجز الطلب)
const generateAdminToken = (payload = {}) =>
  jwt.sign({ role: 'admin', ...payload }, ADMIN_SECRET, { expiresIn: '8h' });

// ✅ يقبل الآن حمولة إضافية اختيارية: { userId, allowedProjectIds }
const generateViewerToken = (payload = {}) =>
  jwt.sign({ role: 'viewer', ...payload }, VIEWER_SECRET, { expiresIn: '8h' });

const verifyFarmerToken = (token) => jwt.verify(token, FARMER_SECRET);
const verifyAdminToken  = (token) => jwt.verify(token, ADMIN_SECRET);
const verifyViewerToken = (token) => jwt.verify(token, VIEWER_SECRET);

module.exports = {
  generateFarmerToken, generateAdminToken, generateViewerToken,
  verifyFarmerToken,   verifyAdminToken,   verifyViewerToken,
};