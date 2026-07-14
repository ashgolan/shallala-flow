const Project = require('../models/Project');
const Farmer  = require('../models/Farmer');
const Land    = require('../models/Land');

const plain = p => {
  const o = p.toObject ? p.toObject() : { ...p };
  o.id = o._id?.toString();
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

// GET /admin/projects
const getProjects = async (req, res) => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 }).lean();
    return res.json({ projects: projects.map(p => ({
      ...p,
      id: p._id.toString(),
      members: (p.members||[]).map(m => ({
        ...m,
        id:       m._id?.toString(),
        farmerId: m.farmerId?.toString(),
        payments: (m.payments||[]).map(pay => ({ ...pay, id: pay._id?.toString() })),
      })),
    })) });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// POST /admin/projects
const createProject = async (req, res) => {
  try {
    const { name, description, date, lat, lng, locationNote, members, status, customMembers } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'اسم المشروع مطلوب' });
    const project = await Project.create({
      name: name.trim(), description: description||'',
      date: date ? new Date(date) : new Date(),
      lat: lat||null, lng: lng||null, locationNote: locationNote||'',
      members: (members||[]).map(m => ({
        farmerId: m.farmerId || undefined,
        memberName: m.memberName || '',
        amount: parseAmountOrNull(m.amount),
        invoiced: !!m.invoiced, payments: [],
      })),
      status: status||'active',
      customMembers: !!customMembers,
    });
    return res.status(201).json({ success: true, id: project._id.toString() });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم: ' + err.message }); }
};

// PUT /admin/projects/:projectId
const updateProject = async (req, res) => {
  try {
    const { name, description, date, lat, lng, locationNote, status, customMembers } = req.body;
    const update = {
      name: name?.trim(), description: description||'',
      date: date ? new Date(date) : undefined,
      lat: lat||null, lng: lng||null, locationNote: locationNote||'',
      status: status||'active',
    };
    // ✅ نحدّث customMembers فقط إذا أُرسلت صراحةً، حتى لا نصفّرها بالخطأ بتعديلات لا تشملها
    if (customMembers !== undefined) update.customMembers = !!customMembers;
    await Project.findByIdAndUpdate(req.params.projectId, update);
    return res.json({ success: true });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// DELETE /admin/projects/:projectId
const deleteProject = async (req, res) => {
  try {
    await Project.findByIdAndDelete(req.params.projectId);
    return res.json({ success: true });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// POST /admin/projects/:projectId/members — إضافة مشترك
const addMember = async (req, res) => {
  try {
    const { farmerId, memberName, amount } = req.body;
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'المشروع غير موجود' });

    if (project.customMembers) {
      // مشروع بأسماء حرة — لا يوجد ربط بقائمة المزارعين
      if (!memberName?.trim()) return res.status(400).json({ error: 'اسم المشترك مطلوب' });
      const dup = project.members.find(m => (m.memberName||'').trim().toLowerCase() === memberName.trim().toLowerCase());
      if (dup) return res.status(409).json({ error: 'المشترك موجود مسبقاً في المشروع' });
      project.members.push({ memberName: memberName.trim(), amount: parseAmountOrNull(amount), invoiced: false, payments: [] });
    } else {
      if (!farmerId) return res.status(400).json({ error: 'farmerId مطلوب' });
      const exists = project.members.find(m => m.farmerId?.toString() === farmerId);
      if (exists) return res.status(409).json({ error: 'المزارع موجود مسبقاً في المشروع' });
      project.members.push({ farmerId, amount: parseAmountOrNull(amount), invoiced: false, payments: [] });
    }
    await project.save();
    return res.json({ success: true });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// PUT /admin/projects/:projectId/members/:memberId
const updateMember = async (req, res) => {
  try {
    const { amount, invoiced, memberName } = req.body;
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'غير موجود' });
    const member = project.members.id(req.params.memberId);
    if (!member) return res.status(404).json({ error: 'المشترك غير موجود' });
    // ✅ amount === null صراحةً تعني "أعِد الحالة إلى غير محدد"؛ amount === undefined تعني "لا تغيير"
    if (amount !== undefined) member.amount = parseAmountOrNull(amount);
    if (invoiced !== undefined) member.invoiced = !!invoiced;
    if (memberName !== undefined) member.memberName = (memberName||'').trim();
    await project.save();
    return res.json({ success: true });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
};

// DELETE /admin/projects/:projectId/members/:memberId
const deleteMember = async (req, res) => {
  try {
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

// DELETE /admin/projects/:projectId/members/:memberId/payments/:paymentId
const deletePayment = async (req, res) => {
  try {
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
  addPayment, deletePayment,
};