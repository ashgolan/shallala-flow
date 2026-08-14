const bcrypt  = require('bcryptjs');
const Farmer  = require('../models/Farmer');
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

// ✅ helper — يشيل الأصفار الزايدة من بداية رقم الهوية للمقارنة
// مثال: "039444682" → "39444682"  |  "39444682" → "39444682"
const normalizeId = v => (v || '').toString().trim().replace(/^0+(?=\d)/, '');

// ✅ helper — يبني regex يطابق رقم الهوية بأي عدد من الأصفار بالبداية
// مثال: normalizeId = "39444682" → يطابق "39444682" و"039444682" و"0039444682" إلخ
const idRegex = idNumber => new RegExp(`^0*${normalizeId(idNumber)}$`);

// ✅ helper — يجيب مزارع بمطابقة رقم الهوية (متجاهل الأصفار بالبداية) + الكود
const findFarmerByIdAndCode = (idNumber, code) =>
  Farmer.findOne({
    idNumber: idRegex(idNumber),
    code:     code.toString().trim(),
  });

// ─── Step 1 ────────────────────────────────────────────────────
const checkIdentity = async (req, res) => {
  try {
    const { idNumber, code } = req.body;
    if (!idNumber || !code)
      return res.status(400).json({ error: 'رقم الهوية والكود مطلوبان' });

    const farmer = await findFarmerByIdAndCode(idNumber, code);

    if (!farmer) {
      await new Promise(r => setTimeout(r, 1000));
      const remaining = recordFailedAttempt(req);
      return res.status(401).json({
        error: remaining > 0
          ? `بيانات الدخول غير صحيحة. تبقى ${remaining} محاولة.`
          : 'تم قفل الدخول لمدة 15 دقيقة.',
      });
    }

    // ✅ منع تسجيل الدخول إذا كان رقم الهوية مؤقتاً
    if (farmer.idNumber?.startsWith('TMP-')) {
      return res.status(403).json({
        error: 'هذا الحساب لا يملك رقم هوية حقيقي بعد. يرجى التواصل مع المدير لتحديث البيانات.',
      });
    }

    const privilegedDoc  = await Privileged.findOne({ key: 'privileged' });
    const privilegedUser = privilegedDoc?.users?.find(
      u => normalizeId(u.idNumber) === normalizeId(idNumber)
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
    const farmer = await findFarmerByIdAndCode(idNumber, code);
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
      u => normalizeId(u.idNumber) === normalizeId(idNumber)
    );

    if (!privilegedUser) return res.status(403).json({ error: 'غير مخول' });

    // ✅ مقارنة مع bcrypt — يدعم كلمات المرور القديمة (plaintext) والجديدة (hashed)
    const stored = privilegedUser.password;
    let passwordMatch = false;

    if (stored.startsWith('$2a$') || stored.startsWith('$2b$')) {
      // كلمة مرور مشفرة → مقارنة بـ bcrypt
      passwordMatch = await bcrypt.compare(password, stored);
    } else {
      // كلمة مرور قديمة plaintext → مقارنة مباشرة ثم ترقية
      passwordMatch = (stored === password);
      if (passwordMatch) {
        // ✅ ترقية تلقائية: تشفير كلمة المرور القديمة
        const hashed = await bcrypt.hash(password, 12);
        privilegedUser.password = hashed;
        privilegedDoc.markModified('users');
        await privilegedDoc.save();
        console.log(`✅ Password upgraded to bcrypt for user ${idNumber}`);
      }
    }

    if (!passwordMatch) {
      await new Promise(r => setTimeout(r, 1500));
      const remaining = recordFailedAttempt(req);
      return res.status(401).json({
        error: remaining > 0
          ? `كلمة المرور غير صحيحة. تبقى ${remaining} محاولة.`
          : 'تم قفل الدخول لمدة 15 دقيقة.',
      });
    }

    const farmer = await findFarmerByIdAndCode(idNumber, code);
    if (!farmer) return res.status(401).json({ error: 'بيانات غير صحيحة' });

    recordSuccess(req);

    // ✅ للمراقب: نحقن الصلاحيات الخاصة (allowedProjectIds) داخل التوكن نفسه
    // ✅ للأدمن أيضاً: نحقن هويته (userId/label) حتى نقدر نميّزه عن باقي حسابات الأدمن
    //    (تُستخدم مثلاً بميزة "المهام والاستفسارات" لمعرفة مين أرسل/أنجز الطلب بالضبط)
    const allowedProjectIds = privilegedUser.allowedProjectIds || [];
    const token = privilegedUser.role === 'admin'
      ? generateAdminToken({
          userId: privilegedUser._id.toString(),
          label:  privilegedUser.label || '',
        })
      : generateViewerToken({
          userId: privilegedUser._id.toString(),
          allowedProjectIds,
        });

    return res.json({
      success: true,
      token,
      role: privilegedUser.role,
      allowedProjectIds: privilegedUser.role === 'viewer' ? allowedProjectIds : [],
    });

  } catch (err) {
    console.error('adminLogin:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

module.exports = { checkIdentity, farmerLogin, adminLogin };