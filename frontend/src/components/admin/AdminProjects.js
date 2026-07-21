import React, { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../../api';
import { useLang } from '../../contexts/LangContext';

const parseGoogleCoords = (raw) => {
  if (!raw || raw.trim().length < 3) return null;
  const s = raw.trim();
  const decMatch = s.match(/^(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)$/);
  if (decMatch) return { lat: parseFloat(decMatch[1]), lng: parseFloat(decMatch[2]) };
  const dmsToDecimal = (deg, min, sec, dir) => {
    let dd = parseFloat(deg) + parseFloat(min)/60 + parseFloat(sec)/3600;
    if (/[SW]/i.test(dir)) dd = -dd;
    return parseFloat(dd.toFixed(6));
  };
  const dmsP1 = /(\d{1,3})[°]\s*(\d{1,2})[']\s*(\d{1,2}(?:\.\d+)?)["]?\s*([NS])/i;
  const dmsP2 = /(\d{1,3})[°]\s*(\d{1,2})[']\s*(\d{1,2}(?:\.\d+)?)["]?\s*([EW])/i;
  const latM = s.match(dmsP1), lngM = s.match(dmsP2);
  if (latM && lngM) return {
    lat: dmsToDecimal(latM[1],latM[2],latM[3],latM[4]),
    lng: dmsToDecimal(lngM[1],lngM[2],lngM[3],lngM[4]),
  };
  return null;
};

// ✅ تنسيق التاريخ بأرقام لاتينية وتقويم ميلادي دائماً (بدل الهجري/الأرقام الهندية الافتراضية لـ ar-SA)
const formatDate = (dateVal, ar) => {
  if (!dateVal) return '';
  return new Date(dateVal).toLocaleDateString(ar ? 'ar-EG-u-nu-latn' : 'he-IL');
};

const EMPTY_PROJECT = { name:'', description:'', date:'', lat:'', lng:'', gpsRaw:'', locationNote:'', landId:'', status:'active', customMembers:false, targetAmount:'' };
const EMPTY_PAYMENT = { amount:'', date:new Date().toISOString().slice(0,10), note:'', receiptNumber:'', bookNumber:'' };
// ✅ حقول الدفعة الأولى داخل مودال "إضافة مشترك" (لمشاريع customMembers فقط) — نفس شكل EMPTY_PAYMENT
const EMPTY_FIRST_PAYMENT = { amount:'', date:new Date().toISOString().slice(0,10), note:'', receiptNumber:'', bookNumber:'' };

// ✅ adminRole='admin' → صلاحية كاملة على كل شيء
// ✅ adminRole='viewer' → صلاحية قراءة فقط، إلا للمشاريع الموجودة بـ allowedProjectIds (صلاحية كاملة على مشتركيها ودفعاتها فقط)
export default function AdminProjects({ adminRole='admin', allowedProjectIds=[] }) {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const isAdmin = adminRole === 'admin';

  const [projects,  setProjects]  = useState([]);
  const [farmers,   setFarmers]   = useState([]);
  const [lands,     setLands]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  // نموذج مشروع
  const [showForm,  setShowForm]  = useState(false);
  const [editProj,  setEditProj]  = useState(null);
  const [form,      setForm]      = useState(EMPTY_PROJECT);
  const [saving,    setSaving]    = useState(false);
  const [formErr,   setFormErr]   = useState('');

  // المشروع المفتوح
  const [openProj,  setOpenProj]  = useState(null);

  // إضافة مشترك
  const [addMemberModal,  setAddMemberModal]  = useState(false);
  const [selFarmerId,     setSelFarmerId]     = useState('');
  const [selAmount,       setSelAmount]       = useState('');
  // ✅ محطة خاصة بهذا المشترك (اختياري) — لمشاريع تخص عدة محطات مختلفة (مثل "تطوير طريق")
  const [selMemberStation, setSelMemberStation] = useState('');
  const [addingMember,    setAddingMember]    = useState(false);
  const [addMemberErr,    setAddMemberErr]    = useState('');
  // بحث عن المزارع بالكتابة (بدل القائمة العادية) — للمشاريع العادية فقط
  const [memberSearch,    setMemberSearch]    = useState('');
  const [showMemberList,  setShowMemberList]  = useState(false);
  // اسم حر للمشترك — للمشاريع customMembers فقط
  const [customMemberName, setCustomMemberName] = useState('');
  // ✅ حقول الدفعة الأولى (اختيارية) — تُدخل مع الاسم بنفس الخطوة لمشاريع customMembers
  const [firstPayment, setFirstPayment] = useState(EMPTY_FIRST_PAYMENT);
  // ✅ اسم مكرر عند إضافة مشترك جديد بمشروع customMembers — { member } أو null
  const [dupConfirm, setDupConfirm] = useState(null);

  // تعديل المبلغ المطلوب لمشترك موجود (بالضغط على الرقم بالجدول) — للمشاريع العادية فقط
  const [editAmountId,    setEditAmountId]    = useState(null); // memberId الجاري تعديله
  const [editAmountVal,   setEditAmountVal]   = useState('');

  // ✅ تعديل محطة مشترك موجود (بالضغط على شارة المحطة بالجدول) — للمشاريع العادية فقط
  const [editStationId,   setEditStationId]   = useState(null); // memberId الجاري تعديله
  const [editStationVal,  setEditStationVal]  = useState('');

  // ✅ تعديل اسم مشترك موجود (بالضغط على اسمه بالجدول) — لمشاريع customMembers فقط
  const [editNameId,  setEditNameId]  = useState(null); // memberId الجاري تعديله
  const [editNameVal, setEditNameVal] = useState('');

  // ✅ بحث داخل جدول مشتركي المشروع المفتوح (يفيد بمشاريع فيها مئات الأسماء)
  const [memberTableSearch, setMemberTableSearch] = useState('');

  // إضافة دفعة (ونفس المودال يُستخدم لتعديل دفعة موجودة عبر payModal.paymentId)
  const [payModal,    setPayModal]    = useState(null); // { projectId, memberId, farmerName, paymentId }
  const [payForm,     setPayForm]     = useState(EMPTY_PAYMENT);
  const [addingPay,   setAddingPay]   = useState(false);

  // خريطة
  const [mapModal,    setMapModal]    = useState(null); // { lat, lng, name }

  // اختيار نقطة الموقع
  const [locMode,     setLocMode]     = useState('manual'); // 'manual' | 'station'
  const [selStation,  setSelStation]  = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, fa, ld] = await Promise.all([
        adminAPI.getProjects(),
        adminAPI.getFarmers(),
        adminAPI.getLands(),
      ]);
      setProjects(pr.projects || []);
      setFarmers(fa.farmers || []);
      setLands(ld.lands || []);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ✅ هل عندي صلاحية كاملة (إضافة/تعديل/حذف مشتركين ودفعات) على هذا المشروع بالذات؟
  const canManageMembers = (proj) => isAdmin || (proj && allowedProjectIds.includes(proj.id));

  // ✅ هل أقدر أعدّل/أحذف المشروع نفسه (الاسم، الموقع، الحالة، الهدف الإجمالي)؟ — حصري للمدير الرئيسي
  const canManageProjectItself = isAdmin;

  // حسابات المشروع
  // ✅ لمشاريع customMembers: "المطلوب" = الهدف الإجمالي للمشروع (targetAmount)، وليس مجموع مبالغ الأفراد
  //    (لأن كل شخص يدفع حسب قدرته من دون مبلغ فردي محدد مسبقاً)
  const calcProject = (proj) => {
    const totalPaid = proj.members.reduce((s,m) => s + m.payments.reduce((ss,p) => ss + (p.amount||0), 0), 0);
    const totalRequired = proj.customMembers
      ? (proj.targetAmount || 0)
      : proj.members.reduce((s,m) => s + (m.amount||0), 0);
    const remaining = totalRequired - totalPaid;
    const pct = totalRequired > 0 ? Math.round(totalPaid/totalRequired*100) : 0;
    return { totalRequired, totalPaid, remaining, pct };
  };

  const calcMember = (m) => {
    const paid = m.payments.reduce((s,p) => s+(p.amount||0), 0);
    return { paid, remaining: (m.amount||0) - paid };
  };

  // ✅ اسم/رقم المحطة المرتبطة بمشروع (إن وُجدت) — نعتمد النص المخزّن مباشرة (موثوق دائماً)
  // بدل البحث عبر landId (قد يشير لأي نسخة من نسخ محطة مكررة بقاعدة البيانات)
  const projectStationLabel = (proj) => proj.stationNumber || null;

  // فتح نموذج المشروع
  const openAdd = () => {
    setEditProj(null);
    setForm(EMPTY_PROJECT);
    setLocMode('manual');
    setSelStation('');
    setFormErr('');
    setShowForm(true);
  };

  const openEdit = (proj) => {
    setEditProj(proj);
    setForm({
      name: proj.name||'', description: proj.description||'',
      date: proj.date ? proj.date.slice(0,10) : '',
      lat: proj.lat||'', lng: proj.lng||'',
      gpsRaw: (proj.lat&&proj.lng) ? `${proj.lat}, ${proj.lng}` : '',
      locationNote: proj.locationNote||'', status: proj.status||'active',
      landId: proj.landId||'',
      customMembers: !!proj.customMembers,
      targetAmount: proj.targetAmount != null ? String(proj.targetAmount) : '',
    });
    setLocMode(proj.landId ? 'station' : 'manual');
    setSelStation(proj.landId || '');
    setFormErr('');
    setShowForm(true);
  };

  const handleGpsChange = (val) => {
    const result = parseGoogleCoords(val);
    setForm(prev => ({ ...prev, gpsRaw: val, lat: result?.lat||'', lng: result?.lng||'' }));
  };

  const handleStationSelect = (stationId) => {
    setSelStation(stationId);
    const land = lands.find(l => l.id === stationId);
    if (land) {
      setForm(prev => ({
        ...prev,
        // ✅ landId هنا يُستخدم فقط لعرض GPS بالخريطة — الخادم يشتق منه رقم المحطة (نص)
        // ويحفظه كمفتاح المطابقة الفعلي (project.stationNumber)، فتبقى المطابقة موثوقة
        // حتى لو كان هذا السجل بالذات واحداً من عدة نسخ مكررة لنفس رقم المحطة
        landId: stationId,
        lat: land.stationLat || prev.lat, lng: land.stationLng || prev.lng,
        gpsRaw: (land.stationLat && land.stationLng) ? `${land.stationLat}, ${land.stationLng}` : prev.gpsRaw,
        locationNote: prev.locationNote || land.stationNumber || '',
      }));
    }
  };

  const submitProject = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormErr(ar?'اسم المشروع مطلوب':'שם הפרויקט חובה'); return; }
    setSaving(true); setFormErr('');
    try {
      const payload = {
        name: form.name.trim(), description: form.description,
        date: form.date || undefined,
        lat: form.lat ? parseFloat(form.lat) : null,
        lng: form.lng ? parseFloat(form.lng) : null,
        locationNote: form.locationNote,
        landId: form.landId || null,
        status: form.status,
        customMembers: !!form.customMembers,
        // ✅ الهدف الإجمالي — يُرسل فقط عندما تكون customMembers مفعّلة، وإلا يبقى null
        targetAmount: form.customMembers
          ? (form.targetAmount.trim() === '' ? null : parseFloat(form.targetAmount))
          : null,
      };
      if (editProj) {
        await adminAPI.updateProject(editProj.id, payload);
      } else {
        await adminAPI.createProject(payload);
      }
      setShowForm(false);
      load();
    } catch(e) { setFormErr(e.message); }
    finally { setSaving(false); }
  };

  const deleteProject = async (id, name) => {
    if (!window.confirm(`${ar?'حذف المشروع':'מחיקת פרויקט'} "${name}"?`)) return;
    await adminAPI.deleteProject(id);
    if (openProj?.id === id) setOpenProj(null);
    load();
  };

  // فتح مودال إضافة مشترك (مع تصفير الحقول)
  const openAddMember = (proj) => {
    setOpenProj(proj);
    setSelFarmerId('');
    setSelAmount('');
    setSelMemberStation('');
    setMemberSearch('');
    setShowMemberList(false);
    setCustomMemberName('');
    setFirstPayment(EMPTY_FIRST_PAYMENT);
    setAddMemberErr('');
    setDupConfirm(null);
    setAddMemberModal(true);
  };

  const closeAddMember = () => {
    setAddMemberModal(false);
    setSelFarmerId('');
    setSelAmount('');
    setSelMemberStation('');
    setMemberSearch('');
    setShowMemberList(false);
    setCustomMemberName('');
    setFirstPayment(EMPTY_FIRST_PAYMENT);
    setAddMemberErr('');
    setDupConfirm(null);
  };

  // إضافة مشترك
  // ✅ للمشاريع العادية: نفس السلوك القديم بالضبط (مبلغ فردي اختياري، بدون دفعة).
  // ✅ لمشاريع customMembers: الاسم + دفعة أولى اختيارية بنفس الخطوة —
  //    إذا أُدخل مبلغ الدفعة الأولى، ننشئ المشترك ثم نضيف له الدفعة مباشرة بنداء تالٍ.
  //    ✅ قبل الإنشاء نتحقق محلياً هل الاسم مكرر بنفس المشروع؛ إن كان كذلك نعرض تأكيد
  //    بدل إنشاء مشترك جديد (والخادم أيضاً يرفض التكرار كخط دفاع ثانٍ — انظر addMember بالباك إند).
  const submitAddMember = async () => {
    const isCustom = !!openProj?.customMembers;
    if (isCustom) {
      const trimmedName = customMemberName.trim();
      if (!trimmedName) return;
      if (!dupConfirm) {
        const dup = openProj.members.find(m => (m.memberName||'').trim().toLowerCase() === trimmedName.toLowerCase());
        if (dup) { setDupConfirm({ member: dup }); return; }
      }
    } else {
      if (!selFarmerId) return;
    }
    setAddingMember(true);
    setAddMemberErr('');
    try {
      if (isCustom) {
        const createRes = await adminAPI.addProjectMember(openProj.id, { memberName: customMemberName.trim() });
        const hasFirstPaymentAmount = firstPayment.amount.trim() !== '' && parseFloat(firstPayment.amount) > 0;

        if (hasFirstPaymentAmount) {
          // ✅ نجيب المشترك المُنشأ حديثاً من قائمة محدّثة (الـ backend لا يرجع memberId مباشرة بالإضافة)
          const updated = await adminAPI.getProjects();
          setProjects(updated.projects||[]);
          const freshProj = (updated.projects||[]).find(p => p.id === openProj.id);
          const newMember = freshProj?.members?.slice().reverse()
            .find(m => (m.memberName||'').trim() === customMemberName.trim());

          if (newMember) {
            try {
              await adminAPI.addProjectPayment(openProj.id, newMember.id, firstPayment);
              const finalUpdated = await adminAPI.getProjects();
              setProjects(finalUpdated.projects||[]);
              setOpenProj((finalUpdated.projects||[]).find(p=>p.id===openProj.id)||null);
              closeAddMember();
              return;
            } catch(payErr) {
              // ✅ المشترك انضاف بنجاح لكن الدفعة الأولى فشلت — نبلّغ بوضوح بدل ما تختفي المشكلة
              setOpenProj(freshProj || openProj);
              setAddMemberErr(ar
                ? `تمت إضافة المشترك بنجاح، لكن فشلت إضافة الدفعة الأولى: ${payErr.message}. يمكنك إضافتها يدوياً من زر "+" بجانب الدفعات.`
                : `המשתתף נוסף בהצלחה, אך התשלום הראשון נכשל: ${payErr.message}. ניתן להוסיף אותו ידנית מכפתור "+" ליד התשלומים.`);
              setAddingMember(false);
              return;
            }
          } else {
            setOpenProj(freshProj || openProj);
            closeAddMember();
            return;
          }
        } else {
          const proj = (updated => (updated.projects||[]).find(p => p.id === openProj.id))(await adminAPI.getProjects());
          const updated2 = await adminAPI.getProjects();
          setProjects(updated2.projects||[]);
          setOpenProj((updated2.projects||[]).find(p=>p.id===openProj.id)||null);
          closeAddMember();
          return;
        }
      } else {
        const amountToSend = selAmount.trim() === '' ? null : parseFloat(selAmount);
        await adminAPI.addProjectMember(openProj.id, { farmerId: selFarmerId, amount: amountToSend, stationNumber: selMemberStation || '' });
        const updated = await adminAPI.getProjects();
        setProjects(updated.projects||[]);
        const proj = (updated.projects||[]).find(p => p.id === openProj.id);
        if (proj) setOpenProj(proj);
        closeAddMember();
      }
    } catch(e) {
      setAddMemberErr(e.message);
    } finally {
      setAddingMember(false);
    }
  };

  const deleteMember = async (memberId) => {
    if (!window.confirm(ar?'حذف المشترك؟':'מחיקת המשתתף?')) return;
    await adminAPI.deleteProjectMember(openProj.id, memberId);
    const updated = await adminAPI.getProjects();
    setProjects(updated.projects||[]);
    setOpenProj((updated.projects||[]).find(p=>p.id===openProj.id)||null);
  };

  // تعديل مبلغ مشترك — للمشاريع العادية فقط (customMembers لا تملك مبلغ فردي)
  const startEditAmount = (m, proj) => {
    if (!canManageMembers(proj) || proj.customMembers) return;
    setEditAmountId(m.id);
    setEditAmountVal(m.amount === null || m.amount === undefined ? '' : String(m.amount));
  };

  const cancelEditAmount = () => {
    setEditAmountId(null);
    setEditAmountVal('');
  };

  const saveEditAmount = async (memberId) => {
    const trimmed = editAmountVal.trim();
    const payload = trimmed === '' ? null : parseFloat(trimmed);
    try {
      await adminAPI.updateProjectMember(openProj.id, memberId, { amount: payload });
      const updated = await adminAPI.getProjects();
      setProjects(updated.projects||[]);
      setOpenProj((updated.projects||[]).find(p=>p.id===openProj.id)||null);
    } catch(e) { alert(e.message); }
    finally { cancelEditAmount(); }
  };

  // ✅ تعديل محطة مشترك موجود — للمشاريع العادية فقط (customMembers لا تملك محطة فردية)
  const startEditStation = (m, proj) => {
    if (!canManageMembers(proj) || proj.customMembers) return;
    setEditStationId(m.id);
    setEditStationVal(m.stationNumber || '');
  };

  const cancelEditStation = () => {
    setEditStationId(null);
    setEditStationVal('');
  };

  const saveEditStation = async (memberId) => {
    try {
      await adminAPI.updateProjectMember(openProj.id, memberId, { stationNumber: editStationVal.trim() });
      const updated = await adminAPI.getProjects();
      setProjects(updated.projects||[]);
      setOpenProj((updated.projects||[]).find(p=>p.id===openProj.id)||null);
    } catch(e) { alert(e.message); }
    finally { cancelEditStation(); }
  };

  // ✅ تعديل اسم مشترك موجود — لمشاريع customMembers فقط
  const startEditName = (m, proj) => {
    if (!canManageMembers(proj) || !proj.customMembers) return;
    setEditNameId(m.id);
    setEditNameVal(m.memberName || '');
  };

  const cancelEditName = () => {
    setEditNameId(null);
    setEditNameVal('');
  };

  const saveEditName = async (memberId) => {
    const trimmed = editNameVal.trim();
    if (!trimmed) { cancelEditName(); return; }
    try {
      await adminAPI.updateProjectMember(openProj.id, memberId, { memberName: trimmed });
      const updated = await adminAPI.getProjects();
      setProjects(updated.projects||[]);
      setOpenProj((updated.projects||[]).find(p=>p.id===openProj.id)||null);
    } catch(e) { alert(e.message); }
    finally { cancelEditName(); }
  };

  const toggleInvoiced = async (memberId, current) => {
    await adminAPI.updateProjectMember(openProj.id, memberId, { invoiced: !current });
    const updated = await adminAPI.getProjects();
    setProjects(updated.projects||[]);
    setOpenProj((updated.projects||[]).find(p=>p.id===openProj.id)||null);
  };

  // ✅ فتح مودال الدفعة لمشترك موجود — يُستخدم من "اسم مكرر" (submitAddMember) لإضافة دفعة
  // بدل إنشاء مشترك مكرر، وأيضاً متاح كمسار مستقل لأي مشترك موجود
  const openPaymentModalFor = (member) => {
    const proj = openProj;
    closeAddMember();
    setPayModal({ projectId: proj.id, memberId: member.id, farmerName: memberDisplayName(member), paymentId: null });
    setPayForm(EMPTY_PAYMENT);
  };

  // ✅ فتح مودال الدفعة بوضع "تعديل" على دفعة موجودة بالذات — بدل الاكتفاء بالحذف
  const openEditPayment = (proj, member, pay) => {
    setOpenProj(proj);
    setPayModal({ projectId: proj.id, memberId: member.id, farmerName: memberDisplayName(member), paymentId: pay.id });
    setPayForm({
      amount: pay.amount != null ? String(pay.amount) : '',
      date: pay.date ? pay.date.slice(0,10) : new Date().toISOString().slice(0,10),
      note: pay.note || '',
      receiptNumber: pay.receiptNumber || '',
      bookNumber: pay.bookNumber || '',
    });
  };

  // دفعة — يعمل لإضافة دفعة جديدة (paymentId=null) أو تعديل دفعة موجودة (paymentId مُعرَّف)
  const submitPayment = async () => {
    if (!payForm.amount || parseFloat(payForm.amount) <= 0) return;
    setAddingPay(true);
    try {
      if (payModal.paymentId) {
        await adminAPI.updateProjectPayment(openProj.id, payModal.memberId, payModal.paymentId, payForm);
      } else {
        await adminAPI.addProjectPayment(openProj.id, payModal.memberId, payForm);
      }
      const updated = await adminAPI.getProjects();
      setProjects(updated.projects||[]);
      setOpenProj((updated.projects||[]).find(p=>p.id===openProj.id)||null);
      setPayModal(null);
      setPayForm(EMPTY_PAYMENT);
    } catch(e) { alert(e.message); }
    finally { setAddingPay(false); }
  };

  const deletePayment = async (memberId, paymentId) => {
    if (!window.confirm(ar?'حذف الدفعة؟':'מחיקת התשלום?')) return;
    await adminAPI.deleteProjectPayment(openProj.id, memberId, paymentId);
    const updated = await adminAPI.getProjects();
    setProjects(updated.projects||[]);
    setOpenProj((updated.projects||[]).find(p=>p.id===openProj.id)||null);
  };

  const farmerNameById = (fid) => {
    const f = farmers.find(f => f.id === fid);
    return f ? `${f.lastName||''} ${f.firstName||''}`.trim() : fid;
  };

  // ✅ اسم المشترك للعرض: من المزارعين إذا فيه farmerId، وإلا من الاسم الحر (memberName)
  const memberDisplayName = (m) => m.farmerId ? farmerNameById(m.farmerId) : (m.memberName || '—');

  // هل تم تحديد مبلغ لهذا المشترك؟ (null/undefined = غير محدد بعد) — للمشاريع العادية فقط
  const hasAmount = (m) => m.amount !== null && m.amount !== undefined;

  // المزارعون المتاحون للإضافة (غير مشتركين بالفعل بهذا المشروع) — للمشاريع العادية فقط
  const availableMembers = openProj && !openProj.customMembers
    ? farmers.filter(f => !openProj.members.find(m => m.farmerId === f.id))
    : [];

  // نتيجة البحث الحالية داخل مودال إضافة مشترك
  const memberSearchResults = (() => {
    const q = memberSearch.trim().toLowerCase();
    const list = !q
      ? availableMembers
      : availableMembers.filter(f => {
          const full = `${f.lastName||''} ${f.firstName||''} ${f.nameHeb||f.name||''} ${f.idNumber||''}`.toLowerCase();
          return full.includes(q);
        });
    return [...list].sort((a,b) => (a.lastName||'').localeCompare(b.lastName||'', 'ar'));
  })();

  const selectedMemberFarmer = selFarmerId ? farmers.find(f => f.id === selFarmerId) : null;

  // ✅ قائمة محطات بدون تكرار — نجمع كل الأراضي حسب رقم المحطة (نص) ونختار من كل
  // مجموعة سجلاً واحداً تمثيلياً (نفضّل واحداً فيه GPS)، بدل عرض كل نسخة مكررة
  // على حدة بالقائمة. هذا لا يحذف أو يدمج أي بيانات — فقط تنظيف للعرض.
  const uniqueStations = (() => {
    const groups = {};
    lands.filter(l => l.stationNumber).forEach(l => {
      const key = l.stationNumber.trim();
      if (!groups[key]) groups[key] = [];
      groups[key].push(l);
    });
    return Object.values(groups).map(group => {
      // نفضّل تمثيل المجموعة بأرض فيها GPS، وإلا أول سجل بالمجموعة
      return group.find(l => l.stationLat && l.stationLng) || group[0];
    }).sort((a,b) => (a.stationNumber||'').localeCompare(b.stationNumber||''));
  })();

  // ── MapModal ──
  const MapModal = () => {
    if (!mapModal) return null;
    const { lat, lng, name } = mapModal;
    const esriUrl  = `https://maps.google.com/maps?q=${lat},${lng}&z=18&t=k&output=embed&markers=${lat},${lng}`;
    const earthUrl = `https://earth.google.com/web/@${lat},${lng},400a,800d,30y,0h,0t,0r/data=CgRCAggBMikKJwolCiExS0M0V193eFlWeTQ2UFR6RW81VkFtVVlvMDNHemUtUHQgAToDCgEwQgIIAEoICIXm6fQFEAE?hl=ar`;
    return (
      <div onClick={()=>setMapModal(null)} style={{position:'fixed',inset:0,zIndex:99999,background:'rgba(0,0,0,0.65)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
        <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:16,overflow:'hidden',width:'100%',maxWidth:600,boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}}>
          <div style={{padding:'14px 18px',background:'var(--primary-dark)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:20}}>📍</span>
              <div>
                <div style={{color:'#fff',fontWeight:800,fontSize:15}}>{name}</div>
                <div style={{color:'rgba(255,255,255,0.6)',fontSize:12}}>{lat}, {lng}</div>
              </div>
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <a href={earthUrl} target="_blank" rel="noopener noreferrer" style={{color:'#a3e635',fontSize:12,fontWeight:700,textDecoration:'none',background:'rgba(255,255,255,0.1)',padding:'5px 10px',borderRadius:8}}>
                🗺️ Google Earth
              </a>
              <button onClick={()=>setMapModal(null)} style={{background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',width:30,height:30,borderRadius:'50%',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
            </div>
          </div>
          <div style={{position:'relative'}}>
            <iframe src={esriUrl} width="100%" height="380" style={{border:0,display:'block'}} allowFullScreen loading="lazy" title="map"/>
            <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-100%)',pointerEvents:'none',display:'flex',flexDirection:'column',alignItems:'center'}}>
              {mapModal?.name && (
                <div style={{background:'rgba(22,101,52,0.95)',color:'#fff',borderRadius:8,padding:'4px 12px',marginBottom:6,fontSize:13,fontWeight:800,boxShadow:'0 2px 8px rgba(0,0,0,0.3)',whiteSpace:'nowrap',fontFamily:'monospace'}}>
                  {mapModal.name}
                </div>
              )}
              <svg width="28" height="36" viewBox="0 0 28 36">
                <ellipse cx="14" cy="34" rx="6" ry="2" fill="rgba(0,0,0,0.3)"/>
                <path d="M14 0 C6.3 0 0 6.3 0 14 C0 24.5 14 36 14 36 C14 36 28 24.5 28 14 C28 6.3 21.7 0 14 0Z" fill="#16a34a"/>
                <circle cx="14" cy="14" r="7" fill="#fff"/>
                <circle cx="14" cy="14" r="4" fill="#16a34a"/>
              </svg>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const statusColor = s => s==='done'?'#16a34a':s==='cancelled'?'#dc2626':'#0369a1';
  const statusLabel = s => {
    if (s==='done')      return ar?'مكتمل':'הושלם';
    if (s==='cancelled') return ar?'ملغي':'בוטל';
    return ar?'نشط':'פעיל';
  };

  return (
    <div>
      <MapModal />

      {/* ── Modal: إضافة/تعديل مشروع ── (حصري للمدير الرئيسي) */}
      {showForm && canManageProjectItself && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:20,padding:28,maxWidth:540,width:'100%',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 16px 60px rgba(0,0,0,0.3)'}}>
            <h3 style={{margin:'0 0 20px',fontSize:18,color:'var(--primary)'}}>
              {editProj ? `✏️ ${ar?'تعديل مشروع':'עריכת פרויקט'}` : `🏗️ ${ar?'مشروع جديد':'פרויקט חדש'}`}
            </h3>
            <form onSubmit={submitProject}>
              <div className="form-group">
                <label>{ar?'اسم المشروع':'שם הפרויקט'} *</label>
                <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}
                  placeholder={ar?'مثال: مشروع عين الغزلان':'לדוג׳: פרויקט עין אלע׳זאל'} autoFocus/>
              </div>
              <div className="form-group">
                <label>{ar?'الوصف':'תיאור'}</label>
                <textarea rows={3} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}
                  placeholder={ar?'شرح مختصر عن المشروع...':'תיאור קצר של הפרויקט...'}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div className="form-group">
                  <label>{ar?'التاريخ':'תאריך'}</label>
                  <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>
                </div>
                <div className="form-group">
                  <label>{ar?'الحالة':'סטטוס'}</label>
                  <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                    <option value="active">{ar?'نشط':'פעיל'}</option>
                    <option value="done">{ar?'مكتمل':'הושלם'}</option>
                    <option value="cancelled">{ar?'ملغي':'בוטל'}</option>
                  </select>
                </div>
              </div>

              {/* ── نوع المشتركين ── */}
              <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:10,padding:'10px 14px',marginBottom:14}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <input type="checkbox" id="customMembersChk" checked={!!form.customMembers}
                    onChange={e=>setForm({...form,customMembers:e.target.checked})}
                    style={{width:18,height:18,cursor:'pointer'}}/>
                  <label htmlFor="customMembersChk" style={{cursor:'pointer',fontSize:13,fontWeight:700,color:'#92400e',margin:0}}>
                    {ar
                      ? '👤 مشتركون بأسماء حرة (غير مرتبطين بقائمة المزارعين) — يدفع كل شخص حسب قدرته من هدف عام'
                      : '👤 משתתפים בשמות חופשיים (לא מקושרים לרשימת החקלאים) — כל אחד משלם לפי יכולתו מיעד כללי'}
                  </label>
                </div>

                {/* ✅ الهدف الإجمالي للمشروع — يظهر فقط عند تفعيل customMembers */}
                {form.customMembers && (
                  <div className="form-group" style={{margin:'12px 0 0'}}>
                    <label style={{fontSize:12}}>{ar?'المبلغ الإجمالي المطلوب لكامل المشروع (₪)':'סכום כולל נדרש לכל הפרויקט (₪)'}</label>
                    <input type="number" min="0" value={form.targetAmount}
                      onChange={e=>setForm({...form,targetAmount:e.target.value})}
                      placeholder={ar?'مثال: 30000':'לדוג׳: 30000'}
                      style={{fontSize:16,fontWeight:700}}/>
                    <div style={{fontSize:11,color:'#92400e',marginTop:4}}>
                      {ar
                        ? '💡 هذا هو الهدف العام للمشروع كامل — كل مشترك يدفع دفعات بحسب قدرته من دون مبلغ فردي محدد له.'
                        : '💡 זהו היעד הכללי לכל הפרויקט — כל משתתף משלם תשלומים לפי יכולתו ללא סכום אישי קבוע.'}
                    </div>
                  </div>
                )}
              </div>

              {/* ── الموقع ── */}
              <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
                <label style={{fontWeight:700,color:'var(--primary)',fontSize:13,display:'block',marginBottom:10}}>
                  📍 {ar?'موقع المشروع':'מיקום הפרויקט'}
                </label>
                <div style={{display:'flex',gap:8,marginBottom:12}}>
                  <button type="button" onClick={()=>{ setLocMode('manual'); setSelStation(''); setForm(prev=>({...prev, landId:''})); }}
                    style={{flex:1,padding:'7px',borderRadius:8,border:`2px solid ${locMode==='manual'?'var(--primary)':'var(--border)'}`,background:locMode==='manual'?'#f0fdf4':'var(--surface-2)',fontWeight:700,fontSize:12,cursor:'pointer',color:locMode==='manual'?'var(--primary)':'var(--text-muted)'}}>
                    ✏️ {ar?'إدخال يدوي':'הזנה ידנית'}
                  </button>
                  <button type="button" onClick={()=>setLocMode('station')}
                    style={{flex:1,padding:'7px',borderRadius:8,border:`2px solid ${locMode==='station'?'var(--primary)':'var(--border)'}`,background:locMode==='station'?'#f0fdf4':'var(--surface-2)',fontWeight:700,fontSize:12,cursor:'pointer',color:locMode==='station'?'var(--primary)':'var(--text-muted)'}}>
                    📋 {ar?'من محطة مسجلة':'מתחנה רשומה'}
                  </button>
                </div>

                {locMode === 'manual' ? (
                  <div className="form-group" style={{margin:0}}>
                    <label style={{fontSize:12}}>GPS (Google Earth)</label>
                    <input value={form.gpsRaw} onChange={e=>handleGpsChange(e.target.value)}
                      placeholder="33.1234, 35.5678" style={{fontFamily:'monospace',fontSize:12}}/>
                    {form.lat && form.lng && (
                      <div style={{fontSize:11,color:'#16a34a',marginTop:4}}>
                        ✓ {parseFloat(form.lat).toFixed(5)}, {parseFloat(form.lng).toFixed(5)}
                      </div>
                    )}
                    <div style={{fontSize:11,color:'var(--text-muted)',marginTop:6}}>
                      {ar
                        ? '💡 بهذا الوضع لن يُربط المشروع بأي محطة محددة — تحذير "لم يدفع" بصفحة القراءات سيظهر على كل أراضي كل مشترك. للربط بمحطة محددة، اختر "من محطة مسجلة" بدل ذلك.'
                        : '💡 במצב זה הפרויקט לא יקושר לעמדה מסוימת — אזהרת "לא שולם" תופיע על כל הקרקעות של כל משתתף. לקישור לעמדה ספציפית, בחר "מתחנה רשומה" במקום.'}
                    </div>
                  </div>
                ) : (
                  <div className="form-group" style={{margin:0}}>
                    <label style={{fontSize:12}}>{ar?'اختر محطة':'בחר תחנה'}</label>
                    <select value={selStation} onChange={e=>handleStationSelect(e.target.value)}
                      style={{fontFamily:'monospace',fontWeight:700}}>
                      <option value="">{ar?'— اختر محطة —':'— בחר תחנה —'}</option>
                      {uniqueStations.map(l=>(
                        <option key={l.id} value={l.id}>
                          {l.stationNumber}{l.stationLat && l.stationLng ? ` — 📍 ${parseFloat(l.stationLat).toFixed(4)}, ${parseFloat(l.stationLng).toFixed(4)}` : ''}
                        </option>
                      ))}
                    </select>
                    {form.lat && form.lng && (
                      <div style={{fontSize:11,color:'#16a34a',marginTop:4}}>
                        ✓ {parseFloat(form.lat).toFixed(5)}, {parseFloat(form.lng).toFixed(5)}
                      </div>
                    )}
                    <div style={{fontSize:11,color:'#1e40af',marginTop:6}}>
                      {ar
                        ? '💡 نفس هذه المحطة تصير مرتبطة بالمشروع تلقائياً: تحذير "لم يدفع" بصفحة القراءات لكل مشتركي هذا المشروع سيظهر فقط على قراءات هذه المحطة (بالمطابقة على رقم المحطة نفسه، وليس سجلاً بعينه)، بدل الظهور على كل أراضيهم.'
                        : '💡 אותה עמדה זו תהיה מקושרת לפרויקט אוטומטית: אזהרת "לא שולם" בעמוד הקריאות לכל משתתפי פרויקט זה תופיע רק על קריאות עמדה זו, במקום על כל הקרקעות שלהם.'}
                    </div>
                  </div>
                )}

                <div className="form-group" style={{margin:'10px 0 0'}}>
                  <label style={{fontSize:12}}>{ar?'وصف الموقع (اختياري)':'תיאור מיקום (אופציונלי)'}</label>
                  <input value={form.locationNote} onChange={e=>setForm({...form,locationNote:e.target.value})}
                    placeholder={ar?'مثال: بجانب البئر الرئيسية':'לדוג׳: ליד הבאר הראשית'}/>
                </div>

                {form.lat && form.lng && (
                  <button type="button"
                    onClick={()=>{ const nm = form.locationNote || lands.find(l=>l.id===selStation)?.stationNumber || (ar?'الموقع':'מיקום'); setMapModal({lat:parseFloat(form.lat),lng:parseFloat(form.lng),name:nm}); }}
                    style={{marginTop:8,background:'none',border:'1px solid var(--primary)',color:'var(--primary)',borderRadius:8,padding:'5px 14px',cursor:'pointer',fontSize:12,fontWeight:700}}>
                    🗺️ {ar?'معاينة على الخريطة':'תצוגה מקדימה במפה'}
                  </button>
                )}
              </div>

              {formErr && <div className="alert alert-error mb-8">{formErr}</div>}
              <div className="flex-gap gap-12">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? '⏳...' : `💾 ${ar?'حفظ':'שמור'}`}
                </button>
                <button type="button" className="btn btn-outline" onClick={()=>setShowForm(false)}>
                  {ar?'إلغاء':'ביטול'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: إضافة مشترك ── */}
      {addMemberModal && openProj && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:18,padding:28,maxWidth:420,width:'100%',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 12px 50px rgba(0,0,0,0.25)'}}>
            <h3 style={{margin:'0 0 16px',color:'var(--primary)'}}>👤 {ar?'إضافة مشترك':'הוסף משתתף'}</h3>

            {openProj.customMembers ? (
              /* ══════════════════════════════════════════════════
                 ✅ مشروع بأسماء حرة: الاسم + دفعة أولى اختيارية بنفس الخطوة
                 (بدل فتح مودال ثانٍ لاحقاً لإدخال أول دفعة)
                 ══════════════════════════════════════════════════ */
              <>
                <div className="form-group">
                  <label>{ar?'اسم المشترك':'שם המשתתף'} *</label>
                  <input
                    value={customMemberName}
                    onChange={e=>{ setCustomMemberName(e.target.value); if (dupConfirm) setDupConfirm(null); }}
                    placeholder={ar?'اكتب اسم المشترك...':'הכנס שם משתתף...'}
                    autoFocus
                    style={{width:'100%'}}
                  />
                </div>

                {/* ✅ تنبيه اسم مكرر — يظهر بدل السماح بإنشاء مشترك مكرر */}
                {dupConfirm && (
                  <div style={{background:'#fef3c7',border:'1.5px solid #fcd34d',borderRadius:10,padding:'12px 14px',marginBottom:6}}>
                    <div style={{fontSize:13,fontWeight:700,color:'#92400e',marginBottom:10}}>
                      ⚠️ {ar
                        ? `الاسم "${customMemberName.trim()}" مضاف مسبقاً بهذا المشروع. هل تريد إضافة دفعة له بدل إنشاء مشترك جديد؟`
                        : `השם "${customMemberName.trim()}" כבר קיים בפרויקט זה. להוסיף לו תשלום במקום ליצור משתתף חדש?`}
                    </div>
                    <div className="flex-gap gap-12">
                      <button type="button" className="btn btn-primary btn-sm" onClick={()=>openPaymentModalFor(dupConfirm.member)}>
                        ✅ {ar?'نعم، إضافة دفعة':'כן, הוסף תשלום'}
                      </button>
                      <button type="button" className="btn btn-outline btn-sm" onClick={()=>setDupConfirm(null)}>
                        {ar?'لا، سأعدّل الاسم':'לא, אערוך את השם'}
                      </button>
                    </div>
                  </div>
                )}

                <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'12px 14px',marginTop:6}}>
                  <label style={{fontWeight:700,color:'var(--primary)',fontSize:13,display:'block',marginBottom:10}}>
                    💳 {ar?'الدفعة الأولى (اختياري)':'תשלום ראשון (אופציונלי)'}
                  </label>
                  <div className="form-group" style={{margin:'0 0 10px'}}>
                    <label style={{fontSize:12}}>{ar?'المبلغ (₪)':'סכום (₪)'}</label>
                    <input type="number" min="0" value={firstPayment.amount}
                      onChange={e=>setFirstPayment({...firstPayment, amount:e.target.value})}
                      placeholder={ar?'اتركه فارغاً إن لم يدفع بعد':'השאר ריק אם עדיין לא שילם'}
                      style={{fontSize:16,fontWeight:700,textAlign:'center'}}/>
                  </div>
                  {firstPayment.amount.trim() !== '' && (
                    <>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                        <div className="form-group" style={{margin:0}}>
                          <label style={{fontSize:12}}>{ar?'التاريخ':'תאריך'}</label>
                          <input type="date" value={firstPayment.date}
                            onChange={e=>setFirstPayment({...firstPayment, date:e.target.value})}/>
                        </div>
                        <div className="form-group" style={{margin:0}}>
                          <label style={{fontSize:12}}>{ar?'رقم الوصل':'מספר קבלה'}</label>
                          <input value={firstPayment.receiptNumber}
                            onChange={e=>setFirstPayment({...firstPayment, receiptNumber:e.target.value})}
                            placeholder={ar?'مثال: 1024':'לדוג׳: 1024'}/>
                        </div>
                      </div>
                      <div className="form-group" style={{margin:'0 0 10px'}}>
                        <label style={{fontSize:12}}>{ar?'رقم الدفتر':'מספר פנקס'}</label>
                        <input value={firstPayment.bookNumber}
                          onChange={e=>setFirstPayment({...firstPayment, bookNumber:e.target.value})}
                          placeholder={ar?'مثال: 3':'לדוג׳: 3'}/>
                      </div>
                      <div className="form-group" style={{margin:0}}>
                        <label style={{fontSize:12}}>{ar?'ملاحظة':'הערה'}</label>
                        <input value={firstPayment.note}
                          onChange={e=>setFirstPayment({...firstPayment, note:e.target.value})}
                          placeholder={ar?'اختياري...':'אופציונלי...'}/>
                      </div>
                    </>
                  )}
                  <div style={{fontSize:11,color:'var(--text-muted)',marginTop:8}}>
                    {ar
                      ? '💡 إذا دفع الآن، عبّي المبلغ وباقي التفاصيل هون مباشرة. لو لسا ما دفع، اتركها فارغة وتقدر تضيف دفعته من زر "+" بالجدول لاحقاً.'
                      : '💡 אם שילם עכשיו, מלא את הסכום ושאר הפרטים כאן ישירות. אם עדיין לא שילם, השאר ריק ותוכל להוסיף את התשלום שלו מכפתור "+" בטבלה מאוחר יותר.'}
                  </div>
                </div>
              </>
            ) : (
              /* ── حقل بحث المزارع (بدل القائمة العادية) — للمشاريع العادية فقط ── */
              <div className="form-group" style={{position:'relative'}}>
                <label>{ar?'اختر مزارع':'בחר חקלאי'}</label>
                <input
                  value={memberSearch}
                  onChange={e=>{
                    setMemberSearch(e.target.value);
                    setShowMemberList(true);
                    if (selFarmerId) setSelFarmerId('');
                  }}
                  onFocus={()=>setShowMemberList(true)}
                  onBlur={()=>setTimeout(()=>setShowMemberList(false),150)}
                  placeholder={ar?'🔍 ابحث باسم المزارع...':'🔍 חפש חקלאי...'}
                  autoComplete="off"
                  style={{width:'100%',fontFamily:'Heebo,sans-serif'}}
                />
                {showMemberList && (
                  <div style={{
                    position:'absolute', top:'100%', right:0, left:0, zIndex:20,
                    background:'#fff', border:'1.5px solid var(--border)', borderRadius:10,
                    maxHeight:220, overflowY:'auto', boxShadow:'0 8px 24px rgba(0,0,0,0.15)', marginTop:4,
                  }}>
                    {memberSearchResults.length === 0 ? (
                      <div style={{padding:'10px 12px',fontSize:13,color:'var(--text-muted)',textAlign:'center'}}>
                        {ar?'لا توجد نتائج':'אין תוצאות'}
                      </div>
                    ) : (
                      memberSearchResults.map(f => (
                        <div key={f.id}
                          onMouseDown={e=>e.preventDefault()}
                          onClick={()=>{
                            setSelFarmerId(f.id);
                            setMemberSearch(`${f.lastName||''} ${f.firstName||''}`.trim());
                            setShowMemberList(false);
                          }}
                          style={{
                            padding:'8px 12px', cursor:'pointer', fontSize:14,
                            fontFamily:'Heebo,sans-serif', fontWeight: selFarmerId===f.id?800:500,
                            background: selFarmerId===f.id ? '#f0fdf4' : '#fff',
                          }}
                          onMouseEnter={e=>e.currentTarget.style.background='#f0fdf4'}
                          onMouseLeave={e=>e.currentTarget.style.background=selFarmerId===f.id?'#f0fdf4':'#fff'}>
                          {f.lastName} {f.firstName}{f.idNumber?` — ${f.idNumber}`:''}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {!openProj.customMembers && selectedMemberFarmer && (
              <div style={{background:'#f0fdf4',border:'1.5px solid #bbf7d0',borderRadius:10,padding:'8px 12px',marginBottom:14,fontSize:13,display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:16}}>✅</span>
                <span style={{fontFamily:'Heebo,sans-serif',fontWeight:700}}>
                  {selectedMemberFarmer.lastName} {selectedMemberFarmer.firstName}
                </span>
              </div>
            )}

            {/* ✅ محطة خاصة بهذا المشترك (اختياري) — لمشاريع متعددة المحطات مثل "تطوير طريق" */}
            {!openProj.customMembers && (
              <div className="form-group">
                <label>{ar?'محطة هذا المشترك (اختياري)':'עמדה של משתתף זה (אופציונלי)'}</label>
                <select value={selMemberStation} onChange={e=>setSelMemberStation(e.target.value)}
                  style={{fontFamily:'monospace',fontWeight:700}}>
                  <option value="">
                    {openProj.stationNumber
                      ? (ar?`— نفس محطة المشروع (${openProj.stationNumber}) —`:`— אותה עמדה של הפרויקט (${openProj.stationNumber}) —`)
                      : (ar?'— بدون تحديد (كل أراضي المزارع) —':'— ללא ציון (כל הקרקעות של החקלאי) —')}
                  </option>
                  {uniqueStations.map(l => (
                    <option key={l.id} value={l.stationNumber}>{l.stationNumber}</option>
                  ))}
                </select>
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>
                  {ar
                    ? '💡 لمشروع يخص محطة واحدة اتركه فارغاً. لمشروع متعدد المحطات (مثل تطوير طريق يمر بعدة أراضٍ)، حدد هنا محطة هذا المشترك بالذات ليظهر تحذير "لم يدفع" على قراءات محطته فقط.'
                    : '💡 לפרויקט שנוגע לעמדה אחת השאר ריק. לפרויקט מרובה עמדות (כמו כביש שעובר בכמה קרקעות), ציין כאן את העמדה של משתתף זה כדי שהאזהרה תופיע רק על קריאות העמדה שלו.'}
                </div>
              </div>
            )}

            {/* حقل المبلغ الفردي — للمشاريع العادية فقط */}
            {!openProj.customMembers && (
              <div className="form-group">
                <label>{ar?'المبلغ المطلوب (₪)':'סכום נדרש (₪)'}</label>
                <input type="number" value={selAmount} onChange={e=>setSelAmount(e.target.value)}
                  placeholder={ar?'اتركه فارغاً إن لم تعرفه بعد':'השאר ריק אם עדיין לא ידוע'} min="0"
                  style={{fontSize:18,fontWeight:700,textAlign:'center'}}/>
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>
                  {ar?'💡 ما بتعرف المبلغ لسا؟ اتركه فارغاً — رح يظهر "غير محدد" وتقدر تحدده لاحقاً بالضغط عليه بالجدول.'
                     :'💡 עדיין לא יודע את הסכום? השאר ריק — יוצג "לא ידוע" ותוכל לקבוע אותו מאוחר יותר בלחיצה בטבלה.'}
                </div>
              </div>
            )}

            {addMemberErr && <div className="alert alert-error mb-8" style={{marginTop:12}}>{addMemberErr}</div>}

            <div className="flex-gap gap-12" style={{marginTop:16}}>
              <button className="btn btn-primary" onClick={submitAddMember}
                disabled={addingMember || !!dupConfirm || (openProj.customMembers ? !customMemberName.trim() : !selFarmerId)}>
                {addingMember?'⏳':`✅ ${ar?'إضافة':'הוסף'}`}
              </button>
              <button className="btn btn-outline" onClick={closeAddMember}>
                {ar?'إلغاء':'ביטול'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: إضافة/تعديل دفعة ── (نفس المودال يُستخدم للحالتين حسب payModal.paymentId) */}
      {payModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:18,padding:28,maxWidth:380,width:'100%',boxShadow:'0 12px 50px rgba(0,0,0,0.25)'}}>
            <h3 style={{margin:'0 0 4px',color:'var(--primary)'}}>
              {payModal.paymentId ? `✏️ ${ar?'تعديل دفعة':'עריכת תשלום'}` : `💳 ${ar?'إضافة دفعة':'הוסף תשלום'}`}
            </h3>
            <p style={{margin:'0 0 16px',color:'var(--text-muted)',fontSize:13}}>{payModal.farmerName}</p>
            <div className="form-group">
              <label>{ar?'المبلغ (₪)':'סכום (₪)'} *</label>
              <input type="number" value={payForm.amount} onChange={e=>setPayForm({...payForm,amount:e.target.value})}
                placeholder="0" min="0" style={{fontSize:20,fontWeight:900,textAlign:'center'}} autoFocus/>
            </div>
            <div className="form-group">
              <label>{ar?'التاريخ':'תאריך'}</label>
              <input type="date" value={payForm.date} onChange={e=>setPayForm({...payForm,date:e.target.value})}/>
            </div>

            {/* ── حقول إضافية: رقم الوصل ورقم الدفتر (فقط لمشاريع customMembers) ── */}
            {openProj?.customMembers && (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div className="form-group">
                  <label>{ar?'رقم الوصل':'מספר קבלה'}</label>
                  <input value={payForm.receiptNumber} onChange={e=>setPayForm({...payForm,receiptNumber:e.target.value})}
                    placeholder={ar?'مثال: 1024':'לדוג׳: 1024'}/>
                </div>
                <div className="form-group">
                  <label>{ar?'رقم الدفتر':'מספר פנקס'}</label>
                  <input value={payForm.bookNumber} onChange={e=>setPayForm({...payForm,bookNumber:e.target.value})}
                    placeholder={ar?'مثال: 3':'לדוג׳: 3'}/>
                </div>
              </div>
            )}

            <div className="form-group">
              <label>{ar?'ملاحظة':'הערה'}</label>
              <input value={payForm.note} onChange={e=>setPayForm({...payForm,note:e.target.value})}
                placeholder={ar?'اختياري...':'אופציونלי...'}/>
            </div>
            <div className="flex-gap gap-12">
              <button className="btn btn-primary" onClick={submitPayment} disabled={!payForm.amount||addingPay}>
                {addingPay?'⏳':(payModal.paymentId ? `💾 ${ar?'حفظ التعديل':'שמור עריכה'}` : `💾 ${ar?'حفظ':'שמור'}`)}
              </button>
              <button className="btn btn-outline" onClick={()=>{setPayModal(null);setPayForm(EMPTY_PAYMENT);}}>
                {ar?'إلغاء':'ביטול'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── رأس الصفحة ── */}
      <div className="flex-between mb-20" style={{flexWrap:'wrap',gap:12}}>
        <h2 style={{margin:0}}>🏗️ {ar?'المشاريع':'פרויקטים'}</h2>
        {canManageProjectItself && (
          <button className="btn btn-primary" onClick={openAdd}>
            + {ar?'مشروع جديد':'פרויקט חדש'}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:40}}><div className="spinner"/></div>
      ) : projects.length === 0 ? (
        <div className="card empty-state">
          <span className="icon">🏗️</span>
          <p>{ar?'لا توجد مشاريع بعد':'אין פרויקטים עדיין'}</p>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {projects.map(proj => {
            const { totalRequired, totalPaid, remaining, pct } = calcProject(proj);
            const isOpen = openProj?.id === proj.id;
            const canManage = canManageMembers(proj); // ✅ صلاحية إدارة مشتركي/دفعات *هذا* المشروع تحديداً
            const isCustom = !!proj.customMembers;
            const stationLabel = projectStationLabel(proj);

            // ✅ تصفية جدول المشتركين حسب مربع البحث (لا يؤثر على الإجماليات، فقط على الصفوف المعروضة)
            const searchQ = memberTableSearch.trim().toLowerCase();
            const filteredMembers = !searchQ
              ? proj.members
              : proj.members.filter(m => memberDisplayName(m).toLowerCase().includes(searchQ));

            return (
              <div key={proj.id} className="card" style={{padding:0,overflow:'hidden'}}>
                {/* رأس المشروع */}
                <div style={{padding:'16px 20px',background:isOpen?'#f0fdf4':'#fff',cursor:'pointer',borderBottom:isOpen?'2px solid #bbf7d0':'none'}}
                  onClick={()=>{ setOpenProj(isOpen?null:proj); setMemberTableSearch(''); }}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      <button style={{width:28,height:28,borderRadius:7,border:'1px solid var(--border)',background:isOpen?'var(--primary)':'var(--surface-2)',color:isOpen?'#fff':'var(--text-muted)',cursor:'pointer',fontSize:13,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                        {isOpen?'▲':'▼'}
                      </button>
                      <div>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{fontWeight:900,fontSize:16,color:'var(--primary)'}}>{proj.name}</div>
                          {/* ✅ شارة المحطة المرتبطة بالمشروع (إن وُجدت) */}
                          {stationLabel && (
                            <span style={{background:'#dbeafe',color:'#1e40af',padding:'2px 8px',borderRadius:6,fontSize:11,fontWeight:800,fontFamily:'monospace'}}>
                              📍 {stationLabel}
                            </span>
                          )}
                        </div>
                        {proj.description && <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>{proj.description}</div>}
                      </div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                      {/* شارة الحالة */}
                      <span style={{background:statusColor(proj.status)+'22',color:statusColor(proj.status),padding:'2px 10px',borderRadius:8,fontSize:11,fontWeight:700}}>
                        {statusLabel(proj.status)}
                      </span>
                      {/* الموقع */}
                      {proj.lat && proj.lng && (
                        <button onClick={e=>{e.stopPropagation();setMapModal({lat:proj.lat,lng:proj.lng,name:proj.name});}}
                          style={{background:'#f0fdf4',border:'1px solid #bbf7d0',color:'var(--primary)',borderRadius:8,padding:'4px 10px',cursor:'pointer',fontSize:12,fontWeight:700,display:'flex',alignItems:'center',gap:4}}>
                          📍 {ar?'الموقع':'מיקום'}
                        </button>
                      )}
                      {/* إشارة "مطلوب" فارغ لمشروع customMembers بدون هدف محدد */}
                      {isCustom && !proj.targetAmount ? (
                        <span style={{background:'#fef3c7',color:'#92400e',padding:'2px 10px',borderRadius:8,fontSize:11,fontWeight:700}}>
                          {ar?'⏳ لا يوجد هدف محدد':'⏳ אין יעד מוגדר'}
                        </span>
                      ) : (
                        <>
                          {/* الأعداد */}
                          <div style={{textAlign:'center'}}>
                            <div style={{fontSize:11,color:'var(--text-muted)'}}>{ar?'مطلوب':'נדרש'}</div>
                            <div style={{fontWeight:800,fontSize:14}}>₪{totalRequired.toLocaleString()}</div>
                          </div>
                          <div style={{textAlign:'center'}}>
                            <div style={{fontSize:11,color:'var(--text-muted)'}}>{ar?'مدفوع':'שולם'}</div>
                            <div style={{fontWeight:800,fontSize:14,color:'#16a34a'}}>₪{totalPaid.toLocaleString()}</div>
                          </div>
                          <div style={{textAlign:'center'}}>
                            <div style={{fontSize:11,color:'var(--text-muted)'}}>{ar?'متبقي':'נותר'}</div>
                            <div style={{fontWeight:800,fontSize:14,color:remaining>0?'#dc2626':'#16a34a'}}>₪{remaining.toLocaleString()}</div>
                          </div>
                          {/* شريط التقدم */}
                          <div style={{width:80}}>
                            <div style={{height:6,borderRadius:3,background:'#e5e7eb',overflow:'hidden'}}>
                              <div style={{height:'100%',borderRadius:3,background:pct>=100?'#16a34a':'var(--primary)',width:`${Math.min(pct,100)}%`,transition:'width 0.3s'}}/>
                            </div>
                            <div style={{fontSize:10,color:'var(--text-muted)',textAlign:'center',marginTop:2}}>{pct}%</div>
                          </div>
                        </>
                      )}
                      {/* أزرار التعديل — حصرية للمدير الرئيسي (تعديل/حذف المشروع نفسه) */}
                      {canManageProjectItself && (
                        <div className="flex-gap gap-4" onClick={e=>e.stopPropagation()}>
                          <button onClick={()=>openEdit(proj)} style={{width:28,height:28,borderRadius:7,border:'1.5px solid var(--border)',background:'var(--surface-2)',color:'var(--primary)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:13}}
                            onMouseEnter={e=>{e.currentTarget.style.background='var(--primary)';e.currentTarget.style.color='#fff';}}
                            onMouseLeave={e=>{e.currentTarget.style.background='var(--surface-2)';e.currentTarget.style.color='var(--primary)';}}>✏</button>
                          <button onClick={()=>deleteProject(proj.id,proj.name)} style={{width:28,height:28,borderRadius:7,border:'1.5px solid #fca5a5',background:'#fff1f2',color:'#dc2626',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:13}}
                            onMouseEnter={e=>{e.currentTarget.style.background='#dc2626';e.currentTarget.style.color='#fff';}}
                            onMouseLeave={e=>{e.currentTarget.style.background='#fff1f2';e.currentTarget.style.color='#dc2626';}}>✕</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* تفاصيل المشروع */}
                {isOpen && (
                  <div style={{padding:'16px 20px',background:'#f8fffe'}}>
                    <div className="flex-between mb-12">
                      <strong style={{fontSize:14,color:'var(--primary)'}}>
                        👥 {ar?'المشتركون':'משתתפים'} ({proj.members.length})
                      </strong>
                      {/* ✅ زر إضافة مشترك — يظهر للمدير أو للمراقب المصرّح له بهذا المشروع تحديداً */}
                      {canManage && (
                        <button className="btn btn-outline btn-sm" onClick={()=>openAddMember(proj)}>
                          + {ar?'إضافة مشترك':'הוסף משתתף'}
                        </button>
                      )}
                    </div>

                    {/* ✅ بحث عن مشترك — مفيد بمشاريع فيها مئات الأسماء */}
                    {proj.members.length > 0 && (
                      <div style={{marginBottom:12}}>
                        <input
                          value={memberTableSearch}
                          onChange={e=>setMemberTableSearch(e.target.value)}
                          placeholder={ar?`🔍 ابحث عن مشترك بالاسم... (${proj.members.length} مشترك)`:`🔍 חפש משתתף לפי שם... (${proj.members.length})`}
                          style={{width:'100%',fontFamily:'Heebo,sans-serif'}}
                        />
                        {memberTableSearch.trim() && (
                          <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>
                            {ar?`${filteredMembers.length} نتيجة من أصل ${proj.members.length}`:`${filteredMembers.length} מתוך ${proj.members.length}`}
                          </div>
                        )}
                      </div>
                    )}

                    {proj.members.length === 0 ? (
                      <div style={{textAlign:'center',padding:20,color:'var(--text-muted)',fontSize:13}}>
                        {ar?'لا يوجد مشتركون بعد':'אין משתתפים עדיין'}
                      </div>
                    ) : filteredMembers.length === 0 ? (
                      <div style={{textAlign:'center',padding:20,color:'var(--text-muted)',fontSize:13}}>
                        {ar?'لا توجد نتائج مطابقة للبحث':'אין תוצאות תואמות לחיפוש'}
                      </div>
                    ) : isCustom ? (
                      /* ══════════════════════════════════════════════════
                         ✅ جدول مبسّط لمشاريع customMembers: بدون أعمدة
                         "مطلوب/متبقي" فردية — فقط اسم + مجموع مدفوع + دفعات
                         ══════════════════════════════════════════════════ */
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                        <thead>
                          <tr style={{background:'#e8f5e9'}}>
                            <th style={{padding:'8px 12px',textAlign:'right',fontWeight:800}}>{ar?'المشترك':'משתתף'}</th>
                            <th style={{padding:'8px 12px',textAlign:'center',fontWeight:800,color:'#16a34a'}}>{ar?'إجمالي المدفوع':'סה"כ שולם'}</th>
                            <th style={{padding:'8px 12px',textAlign:'center',fontWeight:800}}>{ar?'فاتورة':'חשבונית'}</th>
                            <th style={{padding:'8px 12px',textAlign:'center',fontWeight:800}}>{ar?'الدفعات':'תשלומים'}</th>
                            {canManage && <th style={{padding:'8px 12px',width:80}}></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredMembers.map((m, mi) => {
                            const { paid } = calcMember(m);
                            return (
                              <React.Fragment key={m.id}>
                                <tr style={{borderBottom:'1px solid #e5e7eb',background:mi%2===0?'#fff':'#f9fafb'}}>
                                  <td style={{padding:'10px 12px',fontFamily:'Heebo,sans-serif',fontWeight:700,fontSize:14}}>
                                    {editNameId === m.id ? (
                                      <div style={{display:'flex',alignItems:'center',gap:4}}>
                                        <input autoFocus value={editNameVal}
                                          onChange={e=>setEditNameVal(e.target.value)}
                                          onKeyDown={e=>{ if(e.key==='Enter') saveEditName(m.id); if(e.key==='Escape') cancelEditName(); }}
                                          style={{fontSize:13,padding:'3px 6px',fontWeight:700,fontFamily:'Heebo,sans-serif'}}
                                        />
                                        <button onClick={()=>saveEditName(m.id)} title={ar?'حفظ':'שמור'}
                                          style={{background:'none',border:'none',color:'#16a34a',cursor:'pointer',fontSize:16,padding:0}}>✓</button>
                                        <button onClick={cancelEditName} title={ar?'إلغاء':'ביטול'}
                                          style={{background:'none',border:'none',color:'#dc2626',cursor:'pointer',fontSize:14,padding:0}}>✕</button>
                                      </div>
                                    ) : (
                                      <span onClick={()=>startEditName(m, proj)}
                                        style={{cursor:canManage?'pointer':'default'}}
                                        title={canManage?(ar?'اضغط للتعديل':'לחץ לעריכה'):''}>
                                        {memberDisplayName(m)}
                                      </span>
                                    )}
                                  </td>
                                  <td style={{padding:'10px 12px',textAlign:'center',fontWeight:700,color:'#16a34a'}}>
                                    ₪{paid.toLocaleString()}
                                  </td>
                                  <td style={{padding:'10px 12px',textAlign:'center'}}>
                                    {!canManage ? (
                                      <span style={{fontSize:16}}>{m.invoiced?'✅':'○'}</span>
                                    ) : (
                                      <button onClick={()=>toggleInvoiced(m.id, m.invoiced)}
                                        title={m.invoiced?(ar?'إلغاء الفاتورة':'בטל חשבונית'):(ar?'تم إصدار فاتورة':'הוצאה חשבונית')}
                                        style={{width:32,height:32,borderRadius:8,border:`2px solid ${m.invoiced?'#16a34a':'#d1d5db'}`,background:m.invoiced?'#f0fdf4':'#fff',cursor:'pointer',fontSize:16,display:'inline-flex',alignItems:'center',justifyContent:'center',transition:'all 0.2s'}}>
                                        {m.invoiced?'✅':'○'}
                                      </button>
                                    )}
                                  </td>
                                  <td style={{padding:'10px 12px',textAlign:'center'}}>
                                    <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                                      <span style={{fontSize:12,color:'var(--text-muted)'}}>
                                        {m.payments.length} {ar?'دفعة':'תשלומים'}
                                      </span>
                                      {canManage && (
                                        <button onClick={()=>{setOpenProj(proj);setPayModal({projectId:proj.id,memberId:m.id,farmerName:memberDisplayName(m),paymentId:null});}}
                                          style={{width:24,height:24,borderRadius:6,border:'1.5px solid #bbf7d0',background:'#f0fdf4',color:'var(--primary)',cursor:'pointer',fontSize:13,display:'inline-flex',alignItems:'center',justifyContent:'center',fontWeight:900}}>
                                          +
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                  {canManage && (
                                    <td style={{padding:'10px 12px'}}>
                                      <button onClick={()=>deleteMember(m.id)}
                                        style={{width:26,height:26,borderRadius:6,border:'1.5px solid #fca5a5',background:'#fff1f2',color:'#dc2626',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:12}}
                                        onMouseEnter={e=>{e.currentTarget.style.background='#dc2626';e.currentTarget.style.color='#fff';}}
                                        onMouseLeave={e=>{e.currentTarget.style.background='#fff1f2';e.currentTarget.style.color='#dc2626';}}>✕</button>
                                    </td>
                                  )}
                                </tr>
                                {/* الدفعات */}
                                {m.payments.length > 0 && (
                                  <tr>
                                    <td colSpan={canManage?5:4} style={{padding:'0 12px 10px 12px',background:mi%2===0?'#fff':'#f9fafb'}}>
                                      <div style={{display:'flex',flexWrap:'wrap',gap:6,paddingRight:16}}>
                                        {m.payments.map(pay => (
                                          <div key={pay.id} style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'4px 10px',fontSize:12,display:'flex',alignItems:'center',gap:6}}>
                                            <span style={{fontWeight:700,color:'#16a34a'}}>₪{pay.amount.toLocaleString()}</span>
                                            <span style={{color:'var(--text-muted)'}}>{formatDate(pay.date, ar)}</span>
                                            {(pay.receiptNumber || pay.bookNumber) && (
                                              <span style={{color:'#0369a1',fontWeight:700}}>
                                                {pay.receiptNumber && `📄${pay.receiptNumber}`}
                                                {pay.receiptNumber && pay.bookNumber && ' · '}
                                                {pay.bookNumber && `📘${pay.bookNumber}`}
                                              </span>
                                            )}
                                            {pay.note && <span style={{color:'#64748b'}}>· {pay.note}</span>}
                                            {canManage && (
                                              <>
                                                <button onClick={()=>openEditPayment(proj, m, pay)} title={ar?'تعديل':'עריכה'}
                                                  style={{background:'none',border:'none',color:'#0369a1',cursor:'pointer',fontSize:13,padding:0,lineHeight:1}}>✏️</button>
                                                <button onClick={()=>deletePayment(m.id,pay.id)}
                                                  style={{background:'none',border:'none',color:'#dc2626',cursor:'pointer',fontSize:13,padding:0,lineHeight:1}}>✕</button>
                                              </>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                        {/* مجموع المشروع */}
                        {proj.members.length > 1 && (
                          <tfoot>
                            <tr style={{background:'var(--primary)',borderTop:'2px solid var(--primary-dark)'}}>
                              <td style={{padding:'10px 12px',color:'#fff',fontWeight:900,fontSize:14}}>
                                ⚡ {ar?'الإجمالي':'סה"כ'}
                              </td>
                              <td style={{padding:'10px 12px',textAlign:'center',color:'#a3e635',fontWeight:900,fontSize:15}}>
                                ₪{totalPaid.toLocaleString()}
                              </td>
                              <td style={{padding:'10px 12px',textAlign:'center',color:'#fff',fontSize:13}}>
                                {proj.members.filter(m=>m.invoiced).length}/{proj.members.length} ✅
                              </td>
                              <td colSpan={canManage?2:1}/>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    ) : (
                      /* ══════════════════════════════════════════════════
                         الجدول العادي (المشاريع المرتبطة بالمزارعين) — بدون أي تغيير
                         ══════════════════════════════════════════════════ */
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                        <thead>
                          <tr style={{background:'#e8f5e9'}}>
                            <th style={{padding:'8px 12px',textAlign:'right',fontWeight:800}}>{ar?'المزارع':'חקלאי'}</th>
                            <th style={{padding:'8px 12px',textAlign:'center',fontWeight:800}}>{ar?'المحطة':'עמדה'}</th>
                            <th style={{padding:'8px 12px',textAlign:'center',fontWeight:800}}>{ar?'المطلوب':'נדרש'}</th>
                            <th style={{padding:'8px 12px',textAlign:'center',fontWeight:800,color:'#16a34a'}}>{ar?'المدفوع':'שולם'}</th>
                            <th style={{padding:'8px 12px',textAlign:'center',fontWeight:800,color:'#dc2626'}}>{ar?'المتبقي':'נותר'}</th>
                            <th style={{padding:'8px 12px',textAlign:'center',fontWeight:800}}>{ar?'فاتورة':'חשבונית'}</th>
                            <th style={{padding:'8px 12px',textAlign:'center',fontWeight:800}}>{ar?'الدفعات':'תשלומים'}</th>
                            {canManage && <th style={{padding:'8px 12px',width:80}}></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredMembers.map((m, mi) => {
                            const { paid, remaining: rem } = calcMember(m);
                            const fullPaid = hasAmount(m) && rem <= 0;
                            return (
                              <React.Fragment key={m.id}>
                                <tr style={{borderBottom:'1px solid #e5e7eb',background:mi%2===0?'#fff':'#f9fafb'}}>
                                  <td style={{padding:'10px 12px',fontFamily:'Heebo,sans-serif',fontWeight:700,fontSize:14}}>
                                    {memberDisplayName(m)}
                                  </td>
                                  {/* ✅ عمود المحطة الخاصة بهذا المشترك — قابل للتعديل بالضغط عليه */}
                                  <td style={{padding:'10px 12px',textAlign:'center'}}>
                                    {editStationId === m.id ? (
                                      <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
                                        <select autoFocus value={editStationVal} onChange={e=>setEditStationVal(e.target.value)}
                                          style={{fontSize:12,padding:'3px 4px',fontWeight:700}}>
                                          <option value="">{proj.stationNumber ? `— ${proj.stationNumber} —` : (ar?'بدون تحديد':'ללא ציון')}</option>
                                          {uniqueStations.map(l => (
                                            <option key={l.id} value={l.stationNumber}>{l.stationNumber}</option>
                                          ))}
                                        </select>
                                        <button onClick={()=>saveEditStation(m.id)} title={ar?'حفظ':'שמור'}
                                          style={{background:'none',border:'none',color:'#16a34a',cursor:'pointer',fontSize:16,padding:0}}>✓</button>
                                        <button onClick={cancelEditStation} title={ar?'إلغاء':'ביטול'}
                                          style={{background:'none',border:'none',color:'#dc2626',cursor:'pointer',fontSize:14,padding:0}}>✕</button>
                                      </div>
                                    ) : m.stationNumber ? (
                                      <span onClick={()=>startEditStation(m, proj)}
                                        style={{cursor:canManage?'pointer':'default',background:'#dcfce7',color:'var(--primary)',padding:'3px 10px',borderRadius:8,fontSize:12,fontWeight:800,fontFamily:'monospace',display:'inline-block'}}
                                        title={canManage?(ar?'اضغط للتعديل':'לחץ לעריכה'):''}>
                                        📍 {m.stationNumber}
                                      </span>
                                    ) : (
                                      <span onClick={()=>startEditStation(m, proj)}
                                        style={{cursor:canManage?'pointer':'default',color:'var(--text-muted)',fontSize:11}}
                                        title={canManage?(ar?'اضغط لتحديد محطة خاصة':'לחץ לבחירת עמדה'):''}>
                                        {proj.stationNumber ? `(${proj.stationNumber})` : (ar?'—':'—')}
                                      </span>
                                    )}
                                  </td>
                                  <td style={{padding:'10px 12px',textAlign:'center',fontWeight:700}}>
                                    {editAmountId === m.id ? (
                                      <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
                                        <input
                                          type="number" autoFocus value={editAmountVal}
                                          onChange={e=>setEditAmountVal(e.target.value)}
                                          onKeyDown={e=>{ if(e.key==='Enter') saveEditAmount(m.id); if(e.key==='Escape') cancelEditAmount(); }}
                                          placeholder={ar?'غير محدد':'לא ידוע'}
                                          style={{width:72,textAlign:'center',fontWeight:700,padding:'3px 4px',fontSize:13}}
                                        />
                                        <button onClick={()=>saveEditAmount(m.id)} title={ar?'حفظ':'שמור'}
                                          style={{background:'none',border:'none',color:'#16a34a',cursor:'pointer',fontSize:16,padding:0}}>✓</button>
                                        <button onClick={cancelEditAmount} title={ar?'إلغاء':'ביטול'}
                                          style={{background:'none',border:'none',color:'#dc2626',cursor:'pointer',fontSize:14,padding:0}}>✕</button>
                                      </div>
                                    ) : hasAmount(m) ? (
                                      <span onClick={()=>startEditAmount(m, proj)}
                                        style={{cursor:canManage?'pointer':'default'}}
                                        title={canManage?(ar?'اضغط للتعديل':'לחץ לעריכה'):''}>
                                        ₪{(m.amount||0).toLocaleString()}
                                      </span>
                                    ) : (
                                      <span onClick={()=>startEditAmount(m, proj)}
                                        style={{cursor:canManage?'pointer':'default',background:'#fef3c7',color:'#92400e',padding:'3px 10px',borderRadius:8,fontSize:12,fontWeight:700,display:'inline-block'}}
                                        title={canManage?(ar?'اضغط لتحديد المبلغ':'לחץ לקביעת סכום'):''}>
                                        ⏳ {ar?'غير محدد':'לא ידוע'}
                                      </span>
                                    )}
                                  </td>
                                  <td style={{padding:'10px 12px',textAlign:'center',fontWeight:700,color:'#16a34a'}}>
                                    ₪{paid.toLocaleString()}
                                  </td>
                                  <td style={{padding:'10px 12px',textAlign:'center',fontWeight:700}}>
                                    {!hasAmount(m) ? (
                                      <span style={{color:'var(--text-muted)'}}>—</span>
                                    ) : (
                                      <span style={{color:fullPaid?'#16a34a':'#dc2626',fontWeight:800}}>
                                        {fullPaid ? '✓' : `₪${rem.toLocaleString()}`}
                                      </span>
                                    )}
                                  </td>
                                  <td style={{padding:'10px 12px',textAlign:'center'}}>
                                    {!canManage ? (
                                      <span style={{fontSize:16}}>{m.invoiced?'✅':'○'}</span>
                                    ) : (
                                      <button onClick={()=>toggleInvoiced(m.id, m.invoiced)}
                                        title={m.invoiced?(ar?'إلغاء الفاتورة':'בטל חשבונית'):(ar?'تم إصدار فاتورة':'הוצאה חשבונית')}
                                        style={{width:32,height:32,borderRadius:8,border:`2px solid ${m.invoiced?'#16a34a':'#d1d5db'}`,background:m.invoiced?'#f0fdf4':'#fff',cursor:'pointer',fontSize:16,display:'inline-flex',alignItems:'center',justifyContent:'center',transition:'all 0.2s'}}>
                                        {m.invoiced?'✅':'○'}
                                      </button>
                                    )}
                                  </td>
                                  <td style={{padding:'10px 12px',textAlign:'center'}}>
                                    <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                                      <span style={{fontSize:12,color:'var(--text-muted)'}}>
                                        {m.payments.length} {ar?'دفعة':'תשלומים'}
                                      </span>
                                      {canManage && (
                                        <button onClick={()=>{setOpenProj(proj);setPayModal({projectId:proj.id,memberId:m.id,farmerName:memberDisplayName(m),paymentId:null});}}
                                          style={{width:24,height:24,borderRadius:6,border:'1.5px solid #bbf7d0',background:'#f0fdf4',color:'var(--primary)',cursor:'pointer',fontSize:13,display:'inline-flex',alignItems:'center',justifyContent:'center',fontWeight:900}}>
                                          +
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                  {canManage && (
                                    <td style={{padding:'10px 12px'}}>
                                      <button onClick={()=>deleteMember(m.id)}
                                        style={{width:26,height:26,borderRadius:6,border:'1.5px solid #fca5a5',background:'#fff1f2',color:'#dc2626',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:12}}
                                        onMouseEnter={e=>{e.currentTarget.style.background='#dc2626';e.currentTarget.style.color='#fff';}}
                                        onMouseLeave={e=>{e.currentTarget.style.background='#fff1f2';e.currentTarget.style.color='#dc2626';}}>✕</button>
                                    </td>
                                  )}
                                </tr>
                                {/* الدفعات */}
                                {m.payments.length > 0 && (
                                  <tr>
                                    <td colSpan={canManage?8:7} style={{padding:'0 12px 10px 12px',background:mi%2===0?'#fff':'#f9fafb'}}>
                                      <div style={{display:'flex',flexWrap:'wrap',gap:6,paddingRight:16}}>
                                        {m.payments.map(pay => (
                                          <div key={pay.id} style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'4px 10px',fontSize:12,display:'flex',alignItems:'center',gap:6}}>
                                            <span style={{fontWeight:700,color:'#16a34a'}}>₪{pay.amount.toLocaleString()}</span>
                                            <span style={{color:'var(--text-muted)'}}>{formatDate(pay.date, ar)}</span>
                                            {pay.note && <span style={{color:'#64748b'}}>· {pay.note}</span>}
                                            {canManage && (
                                              <>
                                                <button onClick={()=>openEditPayment(proj, m, pay)} title={ar?'تعديل':'עריכה'}
                                                  style={{background:'none',border:'none',color:'#0369a1',cursor:'pointer',fontSize:13,padding:0,lineHeight:1}}>✏️</button>
                                                <button onClick={()=>deletePayment(m.id,pay.id)}
                                                  style={{background:'none',border:'none',color:'#dc2626',cursor:'pointer',fontSize:13,padding:0,lineHeight:1}}>✕</button>
                                              </>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                        {/* مجموع المشروع */}
                        {proj.members.length > 1 && (
                          <tfoot>
                            <tr style={{background:'var(--primary)',borderTop:'2px solid var(--primary-dark)'}}>
                              <td style={{padding:'10px 12px',color:'#fff',fontWeight:900,fontSize:14}}>
                                ⚡ {ar?'الإجمالي':'סה"כ'}
                              </td>
                              <td/>
                              <td style={{padding:'10px 12px',textAlign:'center',color:'#a3e635',fontWeight:900,fontSize:15}}>
                                ₪{totalRequired.toLocaleString()}
                              </td>
                              <td style={{padding:'10px 12px',textAlign:'center',color:'#a3e635',fontWeight:900,fontSize:15}}>
                                ₪{totalPaid.toLocaleString()}
                              </td>
                              <td style={{padding:'10px 12px',textAlign:'center',color:remaining>0?'#fca5a5':'#a3e635',fontWeight:900,fontSize:15}}>
                                ₪{remaining.toLocaleString()}
                              </td>
                              <td style={{padding:'10px 12px',textAlign:'center',color:'#fff',fontSize:13}}>
                                {proj.members.filter(m=>m.invoiced).length}/{proj.members.length} ✅
                              </td>
                              <td colSpan={canManage?2:1}/>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
