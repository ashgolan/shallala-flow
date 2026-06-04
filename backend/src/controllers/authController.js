const Farmer = require('../models/Farmer');
const { Admin, Privileged } = require('../models/Settings');
const { generateFarmerToken, generateAdminToken, generateViewerToken } = require('../utils/jwt');
const { recordFailedAttempt, recordSuccess } = require('../middleware/loginProtection');

// ─── Step 1: التحقق من رقم الهوية والكود ──────────────────────
// يُرجع نوع المستخدم: farmer / admin / viewer / choice
const checkIdentity = async (req, res) => {
  try {
    const { idNumber, code } = req.body;
    if (!idNumber || !code)
      return res.status(400).json({ error: 'رقم الهوية والكود مطلوبان' });

    // تحقق من المزارع
    const farmer = await Farmer.findOne({
      idNumber: idNumber.toString().trim(),
      code:     code.toString().trim(),
    });

    if (!farmer) {
      await new Promise(r => setTimeout(r, 1000));
      const remaining = recordFailedAttempt(req);
      const msg = remaining > 0
        ? `بيانات الدخول غير صحيحة. تبقى ${remaining} محاولة.`
        : 'تم قفل الدخول لمدة 15 دقيقة.';
      return res.status(401).json({ error: msg });
    }

    // هل هذا الشخص مخول للإدارة؟
    const privilegedDoc = await Privileged.findOne({ key: 'privileged' });
    const privilegedUser = privilegedDoc?.users?.find(
      u => u.idNumber.trim() === idNumber.toString().trim()
    );

    if (privilegedUser) {
      // يظهر له خيار: مزارع أو المدور المخصص له
      return res.json({
        type: 'choice',
        farmerId:  farmer._id.toString(),
        farmerName: farmer.nameHeb || farmer.name,
        role: privilegedUser.role, // 'admin' أو 'viewer'
        label: privilegedUser.label || (privilegedUser.role === 'admin' ? 'مدير رئيسي' : 'مراقب'),
      });
    }

    // مزارع عادي → دخول مباشر
    recordSuccess(req);
    const token = generateFarmerToken({
      type: 'farmer',
      id: farmer._id.toString(),
      idNumber: farmer.idNumber,
    });
    return res.json({
      type: 'farmer',
      token,
      farmer: {
        id:      farmer._id.toString(),
        name:    farmer.name,
        nameHeb: farmer.nameHeb,
        idNumber: farmer.idNumber,
        phone:   farmer.phone,
        notes:   farmer.notes,
      },
    });
  } catch (err) {
    console.error('checkIdentity:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

// ─── Step 2a: دخول كمزارع (بعد الاختيار) ─────────────────────
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
      type: 'farmer',
      id: farmer._id.toString(),
      idNumber: farmer.idNumber,
    });
    return res.json({
      success: true, token,
      farmer: {
        id:      farmer._id.toString(),
        name:    farmer.name,
        nameHeb: farmer.nameHeb,
        idNumber: farmer.idNumber,
        phone:   farmer.phone,
        notes:   farmer.notes,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

// ─── Step 2b: دخول كمدير/مراقب (بعد الاختيار + password) ──────
const adminLogin = async (req, res) => {
  try {
    const { idNumber, code, password, role } = req.body;
    if (!password) return res.status(400).json({ error: 'كلمة المرور مطلوبة' });

    // تحقق من أن هذا المستخدم مخول
    const privilegedDoc = await Privileged.findOne({ key: 'privileged' });
    const privilegedUser = privilegedDoc?.users?.find(
      u => u.idNumber.trim() === idNumber?.toString().trim()
    );

    if (!privilegedUser)
      return res.status(403).json({ error: 'غير مخول' });

    // تحقق من كلمة المرور
    if (privilegedUser.password !== password) {
      await new Promise(r => setTimeout(r, 1500));
      const remaining = recordFailedAttempt(req);
      return res.status(401).json({
        error: remaining > 0
          ? `كلمة المرور غير صحيحة. تبقى ${remaining} محاولة.`
          : 'تم قفل الدخول لمدة 15 دقيقة.'
      });
    }

    // تحقق أيضاً من كود المزارع (أمان إضافي)
    const farmer = await Farmer.findOne({
      idNumber: idNumber?.toString().trim(),
      code: code?.toString().trim(),
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
