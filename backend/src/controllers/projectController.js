const Project = require('../models/Project');
const Farmer  = require('../models/Farmer');
const Land    = require('../models/Land');

const plain = p => {
  const o = p.toObject ? p.toObject() : { ...p };
  o.id = o._id?.toString();
  o.landId = o.landId?.toString() || null;
  o.stationNumber = o.stationNumber || '';
  o.members = (o.members || []).map(m => ({
    ...m,
    id:       m._id?.toString(),
    farmerId: m.farmerId?.toString(),
    payments: (m.payments || []).map(pay => ({ ...pay, id: pay._id?.toString() })),
  }));
  return o;
};

// ✅ يحوّل المدخل إلى رقم، أو null إذا كان فارغاً/غير معروف (بدل فرضه صفر)
const parseAmountOrNull = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const f = parseFloat(v);
  return isNaN(f) ? null : f;
};

// ✅ هل هذا الطلب (مدير أو مراقب مصرّح له) يقدر يدير مشتركي/دفعات هذا المشروع؟
const canManageProject = (req, projectId) => {
  if (req.adminRole === 'admin') return true;
  const allowed = req.viewerAllowedProjectIds || [];
  return allowed.includes((projectId || '').toString());
};

// GET /admin/projects
const getProjects = async (req, res) => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 }).lean();
    return res.json({ projects: projects.map(p => ({
      ...p,
      id: p._id.toString(),
      landId: p.landId?.toString() || null,
      stationNumber: p.stationNumber || '',
      members: (p.members||[]).map(m => ({
        ...m,
        id:       m._id?.toString(),
        farmerId: m.farmerId?.toString(),
        payments: (m.payments||[]).map(pay => ({ ...pay, id: pay._id?.toString() })),
      })),
    })) });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// ✅ يشتق رقم المحطة (نص) من أرض معينة — هذا النص هو مفتاح المطابقة الفعلي
// المُستخدم بصفحة القراءات، وليس الـ landId نفسه (تفادياً لمشكلة الأراضي المكررة)
const deriveStationNumber = async (landId) => {
  if (!landId) return '';
  const land = await Land.findById(landId).lean();
  return land?.stationNumber || '';
};

// POST /admin/projects
const createProject = async (req, res) => {
  try {
    const { name, description, date, lat, lng, locationNote, landId, members, status, customMembers, targetAmount } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'اسم المشروع مطلوب' });
    const stationNumber = await deriveStationNumber(landId);
    const project = await Project.create({
      name: name.trim(), description: description||'',
      date: date ? new Date(date) : new Date(),
      lat: lat||null, lng: lng||null, locationNote: locationNote||'',
      landId: landId || null,
      stationNumber,
      members: (members||[]).map(m => ({
        farmerId: m.farmerId || undefined,
        memberName: m.memberName || '',
        amount: parseAmountOrNull(m.amount),
        invoiced: !!m.invoiced, payments: [],
      })),
      status: status||'active',
      customMembers: !!customMembers,
      targetAmount: parseAmountOrNull(targetAmount),
    });
    return res.status(201).json({ success: true, id: project._id.toString() });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم: ' + err.message }); }
};

// PUT /admin/projects/:projectId
const updateProject = async (req, res) => {
  try {
    const { name, description, date, lat, lng, locationNote, landId, status, customMembers, targetAmount } = req.body;
    const update = {
      name: name?.trim(), description: description||'',
      date: date ? new Date(date) : undefined,
      lat: lat||null, lng: lng||null, locationNote: locationNote||'',
      status: status||'active',
    };
    if (customMembers !== undefined) update.customMembers = !!customMembers;
    // ✅ نحدّث targetAmount فقط إذا أُرسل صراحةً (undefined = لا تغيير، null = مسح القيمة)
    if (targetAmount !== undefined) update.targetAmount = parseAmountOrNull(targetAmount);
    // ✅ landId: undefined = لا تغيير، '' أو null = مسح الربط (يرجع للسلوك القديم لكل مشتركي المشروع)
    // نحدّث stationNumber معه دائماً حتى يبقى مفتاح المطابقة النصي متزامناً مع الاختيار
    if (landId !== undefined) {
      update.landId = landId || null;
      update.stationNumber = await deriveStationNumber(landId);
    }
    await Project.findByIdAndUpdate(req.params.projectId, update);
    return res.json({ success: true });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// DELETE /admin/projects/:projectId
const deleteProject = async (req, res) => {
  try {
    await Project.findByIdAndDelete(req.params.projectId);
    // ✅ تنظيف تلقائي: إزالة هذا المشروع من قوائم allowedProjectIds لكل المستخدمين المراقبين
    //    (يمنع تراكم مراجع "يتيمة" لمشاريع محذوفة)
    const { Privileged } = require('../models/Settings');
    const doc = await Privileged.findOne({ key: 'privileged' });
    if (doc) {
      let changed = false;
      doc.users.forEach(u => {
        if (u.allowedProjectIds?.includes(req.params.projectId)) {
          u.allowedProjectIds = u.allowedProjectIds.filter(id => id !== req.params.projectId);
          changed = true;
        }
      });
      if (changed) {
        doc.markModified('users');
        await doc.save();
      }
    }
    return res.json({ success: true });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// POST /admin/projects/:projectId/members — إضافة مشترك
const addMember = async (req, res) => {
  try {
    if (!canManageProject(req, req.params.projectId))
      return res.status(403).json({ error: 'غير مصرح لك بإدارة هذا المشروع' });

    const { farmerId, memberName, amount, stationNumber } = req.body;
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'المشروع غير موجود' });

    if (project.customMembers) {
      // مشروع بأسماء حرة — لا يوجد ربط بقائمة المزارعين، ولا مبلغ فردي (الهدف عام لكامل المشروع)
      if (!memberName?.trim()) return res.status(400).json({ error: 'اسم المشترك مطلوب' });
      const dup = project.members.find(m => (m.memberName||'').trim().toLowerCase() === memberName.trim().toLowerCase());
      if (dup) return res.status(409).json({ error: 'المشترك موجود مسبقاً في المشروع' });
      project.members.push({ memberName: memberName.trim(), amount: null, invoiced: false, payments: [] });
    } else {
      if (!farmerId) return res.status(400).json({ error: 'farmerId مطلوب' });
      const exists = project.members.find(m => m.farmerId?.toString() === farmerId);
      if (exists) return res.status(409).json({ error: 'المزارع موجود مسبقاً في المشروع' });
      project.members.push({
        farmerId, amount: parseAmountOrNull(amount), invoiced: false, payments: [],
        stationNumber: (stationNumber || '').trim(),
      });
    }
    await project.save();
    return res.json({ success: true });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// PUT /admin/projects/:projectId/members/:memberId
const updateMember = async (req, res) => {
  try {
    if (!canManageProject(req, req.params.projectId))
      return res.status(403).json({ error: 'غير مصرح لك بإدارة هذا المشروع' });

    const { amount, invoiced, memberName, stationNumber } = req.body;
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'غير موجود' });
    const member = project.members.id(req.params.memberId);
    if (!member) return res.status(404).json({ error: 'المشترك غير موجود' });

    // ✅ تعديل الاسم الحر (customMembers فقط) — نمنع إنشاء اسم مكرر بنفس المشروع عبر التعديل أيضاً
    if (memberName !== undefined && project.customMembers) {
      const trimmed = (memberName||'').trim();
      if (trimmed) {
        const dup = project.members.find(m =>
          m._id.toString() !== member._id.toString() &&
          (m.memberName||'').trim().toLowerCase() === trimmed.toLowerCase()
        );
        if (dup) return res.status(409).json({ error: 'يوجد مشترك آخر بنفس الاسم في هذا المشروع' });
        member.memberName = trimmed;
      }
    }
    // ✅ بمشاريع customMembers نتجاهل تعديل amount الفردي (الهدف عام لكامل المشروع فقط)
    if (amount !== undefined && !project.customMembers) member.amount = parseAmountOrNull(amount);
    if (invoiced !== undefined) member.invoiced = !!invoiced;
    // ✅ stationNumber: undefined = لا تغيير، '' = مسح (يرجع لمحطة المشروع العامة إن وُجدت)
    if (stationNumber !== undefined) member.stationNumber = (stationNumber || '').trim();
    await project.save();
    return res.json({ success: true });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// DELETE /admin/projects/:projectId/members/:memberId
const deleteMember = async (req, res) => {
  try {
    if (!canManageProject(req, req.params.projectId))
      return res.status(403).json({ error: 'غير مصرح لك بإدارة هذا المشروع' });

    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'غير موجود' });
    project.members = project.members.filter(m => m._id.toString() !== req.params.memberId);
    await project.save();
    return res.json({ success: true });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// POST /admin/projects/:projectId/members/:memberId/payments
const addPayment = async (req, res) => {
  try {
    if (!canManageProject(req, req.params.projectId))
      return res.status(403).json({ error: 'غير مصرح لك بإدارة هذا المشروع' });

    const { amount, date, note, receiptNumber, bookNumber } = req.body;
    if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: 'المبلغ مطلوب' });
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'غير موجود' });
    const member = project.members.id(req.params.memberId);
    if (!member) return res.status(404).json({ error: 'المشترك غير موجود' });
    member.payments.push({
      amount: parseFloat(amount),
      date: date ? new Date(date) : new Date(),
      note: note||'',
      receiptNumber: receiptNumber||'',
      bookNumber: bookNumber||'',
    });
    await project.save();
    return res.json({ success: true });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// PUT /admin/projects/:projectId/members/:memberId/payments/:paymentId
// ✅ تعديل دفعة موجودة (تصحيح مبلغ/تاريخ/رقم وصل/رقم دفتر خاطئ) بدل حذفها وإعادة إضافتها،
//    حتى يبقى نفس الـ id ولا نفقد أي تتبع مرتبط بها.
const updatePayment = async (req, res) => {
  try {
    if (!canManageProject(req, req.params.projectId))
      return res.status(403).json({ error: 'غير مصرح لك بإدارة هذا المشروع' });

    const { amount, date, note, receiptNumber, bookNumber } = req.body;
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'غير موجود' });
    const member = project.members.id(req.params.memberId);
    if (!member) return res.status(404).json({ error: 'المشترك غير موجود' });
    const payment = member.payments.id(req.params.paymentId);
    if (!payment) return res.status(404).json({ error: 'الدفعة غير موجودة' });

    if (amount !== undefined) {
      const f = parseFloat(amount);
      if (isNaN(f) || f <= 0) return res.status(400).json({ error: 'المبلغ غير صالح' });
      payment.amount = f;
    }
    if (date !== undefined) payment.date = date ? new Date(date) : payment.date;
    if (note !== undefined) payment.note = note || '';
    if (receiptNumber !== undefined) payment.receiptNumber = receiptNumber || '';
    if (bookNumber !== undefined) payment.bookNumber = bookNumber || '';

    await project.save();
    return res.json({ success: true });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// DELETE /admin/projects/:projectId/members/:memberId/payments/:paymentId
const deletePayment = async (req, res) => {
  try {
    if (!canManageProject(req, req.params.projectId))
      return res.status(403).json({ error: 'غير مصرح لك بإدارة هذا المشروع' });

    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'غير موجود' });
    const member = project.members.id(req.params.memberId);
    if (!member) return res.status(404).json({ error: 'غير موجود' });
    member.payments = member.payments.filter(p => p._id.toString() !== req.params.paymentId);
    await project.save();
    return res.json({ success: true });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

module.exports = {
  getProjects, createProject, updateProject, deleteProject,
  addMember, updateMember, deleteMember,
  addPayment, updatePayment, deletePayment,
};