const Farmer = require('../models/Farmer');
const { Admin, Privileged } = require('../models/Settings');
const { generateFarmerToken, generateAdminToken, generateViewerToken } = require('../utils/jwt');
const { recordFailedAttempt, recordSuccess } = require('../middleware/loginProtection');

// ✅ helper — يبني الاسم الكامل من أي مصدر متاح
const fullName = f =>
  f.name ||
  `${f.firstName||''} ${f.lastName||''}`.trim() ||
  f.nameHeb || '';

const farmerResponse = f => ({
  id:        f._id.toString(),
  name:      fullName(f),
  nameHeb:   f.nameHeb || fullName(f),
  firstName: f.firstName || '',
  lastName:  f.lastName  || '',
  idNumber:  f.idNumber,
  phone:     f.phone  || '',
  notes:     f.notes  || '',
});

// ─── Step 1 ────────────────────────────────────────────────────
const checkIdentity = async (req, res) => {
  try {
    const { idNumber, code } = req.body;
    if (!idNumber || !code)
      return res.status(400).json({ error: 'رقم الهوية والكود مطلوبان' });

    const farmer = await Farmer.findOne({
      idNumber: idNumber.toString().trim(),
      code:     code.toString().trim(),
    });

    if (!farmer) {
      await new Promise(r => setTimeout(r, 1000));
      const remaining = recordFailedAttempt(req);
      return res.status(401).json({
        error: remaining > 0
          ? `بيانات الدخول غير صحيحة. تبقى ${remaining} محاولة.`
          : 'تم قفل الدخول لمدة 15 دقيقة.',
      });
    }

    const privilegedDoc  = await Privileged.findOne({ key: 'privileged' });
    const privilegedUser = privilegedDoc?.users?.find(
      u => u.idNumber.trim() === idNumber.toString().trim()
    );

    if (privilegedUser) {
      return res.json({
        type:       'choice',
        farmerId:   farmer._id.toString(),
        farmerName: fullName(farmer),
        role:       privilegedUser.role,
        label:      privilegedUser.label || (privilegedUser.role === 'admin' ? 'מנהל ראשי' : 'צופה'),
      });
    }

    recordSuccess(req);
    const token = generateFarmerToken({
      type: 'farmer', id: farmer._id.toString(), idNumber: farmer.idNumber,
    });
    return res.json({ type: 'farmer', token, farmer: farmerResponse(farmer) });

  } catch (err) {
    console.error('checkIdentity:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

// ─── Step 2a ───────────────────────────────────────────────────
const farmerLogin = async (req, res) => {
  try {
    const { idNumber, code } = req.body;
    const farmer = await Farmer.findOne({
      idNumber: idNumber.toString().trim(),
      code:     code.toString().trim(),
    });
    if (!farmer) return res.status(401).json({ error: 'بيانات غير صحيحة' });

    recordSuccess(req);
    const token = generateFarmerToken({
      type: 'farmer', id: farmer._id.toString(), idNumber: farmer.idNumber,
    });
    return res.json({ success: true, token, farmer: farmerResponse(farmer) });

  } catch (err) {
    console.error('farmerLogin:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

// ─── Step 2b ───────────────────────────────────────────────────
const adminLogin = async (req, res) => {
  try {
    const { idNumber, code, password } = req.body;
    if (!password) return res.status(400).json({ error: 'كلمة المرور مطلوبة' });

    const privilegedDoc  = await Privileged.findOne({ key: 'privileged' });
    const privilegedUser = privilegedDoc?.users?.find(
      u => u.idNumber.trim() === idNumber?.toString().trim()
    );

    if (!privilegedUser) return res.status(403).json({ error: 'غير مخول' });

    if (privilegedUser.password !== password) {
      await new Promise(r => setTimeout(r, 1500));
      const remaining = recordFailedAttempt(req);
      return res.status(401).json({
        error: remaining > 0
          ? `كلمة المرور غير صحيحة. تبقى ${remaining} محاولة.`
          : 'تم قفل الدخول لمدة 15 دقيقة.',
      });
    }

    const farmer = await Farmer.findOne({
      idNumber: idNumber?.toString().trim(),
      code:     code?.toString().trim(),
    });
    if (!farmer) return res.status(401).json({ error: 'بيانات غير صحيحة' });

    recordSuccess(req);
    const token = privilegedUser.role === 'admin'
      ? generateAdminToken()
      : generateViewerToken();

    return res.json({ success: true, token, role: privilegedUser.role });

  } catch (err) {
    console.error('adminLogin:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

module.exports = { checkIdentity, farmerLogin, adminLogin };
