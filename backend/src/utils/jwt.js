const jwt = require('jsonwebtoken');

const FARMER_SECRET = process.env.JWT_SECRET;
const ADMIN_SECRET  = process.env.ADMIN_JWT_SECRET;
const VIEWER_SECRET = process.env.VIEWER_JWT_SECRET || process.env.ADMIN_JWT_SECRET + '_viewer';

const generateFarmerToken = (payload) =>
  jwt.sign(payload, FARMER_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });

const generateAdminToken = () =>
  jwt.sign({ role: 'admin' }, ADMIN_SECRET, { expiresIn: '8h' });

const generateViewerToken = () =>
  jwt.sign({ role: 'viewer' }, VIEWER_SECRET, { expiresIn: '8h' });

const verifyFarmerToken = (token) => jwt.verify(token, FARMER_SECRET);
const verifyAdminToken  = (token) => jwt.verify(token, ADMIN_SECRET);
const verifyViewerToken = (token) => jwt.verify(token, VIEWER_SECRET);

module.exports = {
  generateFarmerToken, generateAdminToken, generateViewerToken,
  verifyFarmerToken,   verifyAdminToken,   verifyViewerToken,
};
