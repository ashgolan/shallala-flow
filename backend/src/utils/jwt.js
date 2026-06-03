const jwt = require('jsonwebtoken');

const generateFarmerToken = (farmer) => {
  return jwt.sign(
    {
      id: farmer.id,
      idNumber: farmer.idNumber,
      type: 'farmer',
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
};

const generateAdminToken = () => {
  return jwt.sign(
    { type: 'admin', role: 'admin' },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
};

const verifyFarmerToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

const verifyAdminToken = (token) => {
  return jwt.verify(token, process.env.ADMIN_JWT_SECRET);
};

module.exports = {
  generateFarmerToken,
  generateAdminToken,
  verifyFarmerToken,
  verifyAdminToken,
};
