const Farmer = require('../models/Farmer');
const { Admin } = require('../models/Settings');
const { generateFarmerToken, generateAdminToken } = require('../utils/jwt');
const { recordFailedAttempt, recordSuccess } = require('../middleware/loginProtection');

// ─── Farmer Login ──────────────────────────────────────────────
const farmerLogin = async (req, res) => {
  try {
    const { idNumber, code } = req.body;

    if (!idNumber || !code)
      return res.status(400).json({ error: 'رقم الهوية والكود مطلوبان' });

    if (!/^\d{4}$/.test(code.toString()))
      return res.status(400).json({ error: 'الكود يجب أن يكون 4 أرقام' });

    const farmer = await Farmer.findOne({
      idNumber: idNumber.toString().trim(),
      code:     code.toString().trim(),
    });

    if (!farmer) {
      await new Promise(r => setTimeout(r, 1000));
      const remaining = recordFailedAttempt(req);
      const msg = remaining > 0
        ? `بيانات الدخول غير صحيحة. تبقى ${remaining} محاولة قبل القفل.`
        : 'بيانات الدخول غير صحيحة. تم قفل الدخول لمدة 15 دقيقة.';
      return res.status(401).json({ error: msg });
    }

    recordSuccess(req);

    const token = generateFarmerToken({ id: farmer._id.toString(), idNumber: farmer.idNumber });
    return res.json({
      success: true,
      token,
      farmer: {
        id:       farmer._id.toString(),
        name:     farmer.name,
        nameHeb:  farmer.nameHeb,
        idNumber: farmer.idNumber,
        phone:    farmer.phone,
        notes:    farmer.notes,
      },
    });
  } catch (err) {
    console.error('farmerLogin:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

// ─── Admin Login ───────────────────────────────────────────────
const adminLogin = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'كلمة المرور مطلوبة' });

    const adminDoc = await Admin.findOne({ key: 'admin' });
    if (!adminDoc)
      return res.status(500).json({ error: 'لم يتم إعداد كلمة مرور الإدارة بعد' });

    if (adminDoc.password !== password) {
      await new Promise(r => setTimeout(r, 1500)); // تأخير أطول للإدارة
      const remaining = recordFailedAttempt(req);
      const msg = remaining > 0
        ? `كلمة المرور غير صحيحة. تبقى ${remaining} محاولة قبل القفل.`
        : 'كلمة المرور غير صحيحة. تم قفل الدخول لمدة 15 دقيقة.';
      return res.status(401).json({ error: msg });
    }

    recordSuccess(req);
    const token = generateAdminToken();
    return res.json({ success: true, token });
  } catch (err) {
    console.error('adminLogin:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

module.exports = { farmerLogin, adminLogin };
