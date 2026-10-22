const jwt = require('jsonwebtoken');

const FARMER_SECRET = process.env.JWT_SECRET;
const ADMIN_SECRET  = process.env.ADMIN_JWT_SECRET;
const VIEWER_SECRET = process.env.VIEWER_JWT_SECRET || process.env.ADMIN_JWT_SECRET + '_viewer';
// ✅ مفتاح منفصل للناطور — توكنه ما بيفتح أي مسار من مسارات الإدارة
const READER_SECRET = process.env.READER_JWT_SECRET || process.env.ADMIN_JWT_SECRET + '_reader';

const generateFarmerToken = (payload) =>
  jwt.sign(payload, FARMER_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });

// ✅ يقبل الآن حمولة إضافية اختيارية: { userId, label } — لتمييز حساب أدمن عن آخر
//    (لأجل ميزات مثل "المهام والاستفسارات" التي تحتاج تعرف مين بالضبط أرسل/أنجز الطلب)
const generateAdminToken = (payload = {}) =>
  jwt.sign({ role: 'admin', ...payload }, ADMIN_SECRET, { expiresIn: '8h' });

// ✅ يقبل الآن حمولة إضافية اختيارية: { userId, allowedProjectIds }
const generateViewerToken = (payload = {}) =>
  jwt.sign({ role: 'viewer', ...payload }, VIEWER_SECRET, { expiresIn: '8h' });

// ✅ الناطور: { userId, label } — صلاحية إدخال قراءات الدورة المفتوحة فقط
const generateReaderToken = (payload = {}) =>
  jwt.sign({ role: 'reader', ...payload }, READER_SECRET, { expiresIn: '12h' });

const verifyFarmerToken = (token) => jwt.verify(token, FARMER_SECRET);
const verifyAdminToken  = (token) => jwt.verify(token, ADMIN_SECRET);
const verifyViewerToken = (token) => jwt.verify(token, VIEWER_SECRET);
const verifyReaderToken = (token) => jwt.verify(token, READER_SECRET);

module.exports = {
  generateFarmerToken, generateAdminToken, generateViewerToken, generateReaderToken,
  verifyFarmerToken,   verifyAdminToken,   verifyViewerToken,   verifyReaderToken,
};