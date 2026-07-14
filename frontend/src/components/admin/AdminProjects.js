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

const EMPTY_PROJECT = { name:'', description:'', date:'', lat:'', lng:'', gpsRaw:'', locationNote:'', status:'active', customMembers:false };
const EMPTY_PAYMENT = { amount:'', date:new Date().toISOString().slice(0,10), note:'', receiptNumber:'', bookNumber:'' };

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
  const [addingMember,    setAddingMember]    = useState(false);
  // بحث عن المزارع بالكتابة (بدل القائمة العادية) — للمشاريع العادية فقط
  const [memberSearch,    setMemberSearch]    = useState('');
  const [showMemberList,  setShowMemberList]  = useState(false);
  // اسم حر للمشترك — للمشاريع customMembers فقط
  const [customMemberName, setCustomMemberName] = useState('');

  // تعديل المبلغ المطلوب لمشترك موجود (بالضغط على الرقم بالجدول)
  const [editAmountId,    setEditAmountId]    = useState(null); // memberId الجاري تعديله
  const [editAmountVal,   setEditAmountVal]   = useState('');

  // إضافة دفعة
  const [payModal,    setPayModal]    = useState(null); // { projectId, memberId, farmerName }
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

  // ✅ هل أقدر أعدّل/أحذف المشروع نفسه (الاسم، الموقع، الحالة)؟ — حصري للمدير الرئيسي فقط
  const canManageProjectItself = isAdmin;

  // حسابات المشروع
  const calcProject = (proj) => {
    const totalRequired = proj.members.reduce((s,m) => s + (m.amount||0), 0);
    const totalPaid     = proj.members.reduce((s,m) => s + m.payments.reduce((ss,p) => ss + (p.amount||0), 0), 0);
    const remaining     = totalRequired - totalPaid;
    const pct           = totalRequired > 0 ? Math.round(totalPaid/totalRequired*100) : 0;
    return { totalRequired, totalPaid, remaining, pct };
  };

  const calcMember = (m) => {
    const paid = m.payments.reduce((s,p) => s+(p.amount||0), 0);
    return { paid, remaining: (m.amount||0) - paid };
  };

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
      customMembers: !!proj.customMembers,
    });
    setLocMode('manual');
    setSelStation('');
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
    if (land?.stationLat && land?.stationLng) {
      setForm(prev => ({
        ...prev,
        lat: land.stationLat, lng: land.stationLng,
        gpsRaw: `${land.stationLat}, ${land.stationLng}`,
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
        status: form.status,
        customMembers: !!form.customMembers,
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
    setMemberSearch('');
    setShowMemberList(false);
    setCustomMemberName('');
    setAddMemberModal(true);
  };

  const closeAddMember = () => {
    setAddMemberModal(false);
    setSelFarmerId('');
    setSelAmount('');
    setMemberSearch('');
    setShowMemberList(false);
    setCustomMemberName('');
  };

  // إضافة مشترك (المبلغ اختياري — لو ترك فارغ يبقى "غير محدد" لحد ما يتحدد لاحقاً)
  const submitAddMember = async () => {
    const isCustom = !!openProj?.customMembers;
    if (isCustom) {
      if (!customMemberName.trim()) return;
    } else {
      if (!selFarmerId) return;
    }
    setAddingMember(true);
    try {
      const amountToSend = selAmount.trim() === '' ? null : parseFloat(selAmount);
      const payload = isCustom
        ? { memberName: customMemberName.trim(), amount: amountToSend }
        : { farmerId: selFarmerId, amount: amountToSend };
      await adminAPI.addProjectMember(openProj.id, payload);
      const updated = await adminAPI.getProjects();
      setProjects(updated.projects||[]);
      const proj = (updated.projects||[]).find(p => p.id === openProj.id);
      if (proj) setOpenProj(proj);
      closeAddMember();
    } catch(e) { alert(e.message); }
    finally { setAddingMember(false); }
  };

  const deleteMember = async (memberId) => {
    if (!window.confirm(ar?'حذف المشترك؟':'מחיקת המשתתף?')) return;
    await adminAPI.deleteProjectMember(openProj.id, memberId);
    const updated = await adminAPI.getProjects();
    setProjects(updated.projects||[]);
    setOpenProj((updated.projects||[]).find(p=>p.id===openProj.id)||null);
  };

  // تعديل مبلغ مشترك (تحديد المبلغ لأول مرة، أو تغييره لاحقاً)
  const startEditAmount = (m, proj) => {
    if (!canManageMembers(proj)) return;
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

  const toggleInvoiced = async (memberId, current) => {
    await adminAPI.updateProjectMember(openProj.id, memberId, { invoiced: !current });
    const updated = await adminAPI.getProjects();
    setProjects(updated.projects||[]);
    setOpenProj((updated.projects||[]).find(p=>p.id===openProj.id)||null);
  };

  // دفعة
  const submitPayment = async () => {
    if (!payForm.amount || parseFloat(payForm.amount) <= 0) return;
    setAddingPay(true);
    try {
      await adminAPI.addProjectPayment(openProj.id, payModal.memberId, payForm);
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

  // هل تم تحديد مبلغ لهذا المشترك؟ (null/undefined = غير محدد بعد)
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
              <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:10,padding:'10px 14px',marginBottom:14,display:'flex',alignItems:'center',gap:10}}>
                <input type="checkbox" id="customMembersChk" checked={!!form.customMembers}
                  onChange={e=>setForm({...form,customMembers:e.target.checked})}
                  style={{width:18,height:18,cursor:'pointer'}}/>
                <label htmlFor="customMembersChk" style={{cursor:'pointer',fontSize:13,fontWeight:700,color:'#92400e',margin:0}}>
                  {ar
                    ? '👤 مشتركون بأسماء حرة (غير مرتبطين بقائمة المزارعين) — تُفعّل حقول رقم الوصل ورقم الدفتر بالدفعات'
                    : '👤 משתתפים בשמות חופשיים (לא מקושרים לרשימת החקלאים) — יופעלו שדות מספר קבלה ומספר פנקס'}
                </label>
              </div>

              {/* ── الموقع ── */}
              <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
                <label style={{fontWeight:700,color:'var(--primary)',fontSize:13,display:'block',marginBottom:10}}>
                  📍 {ar?'موقع المشروع':'מיקום הפרויקט'}
                </label>
                <div style={{display:'flex',gap:8,marginBottom:12}}>
                  <button type="button" onClick={()=>setLocMode('manual')}
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
                  </div>
                ) : (
                  <div className="form-group" style={{margin:0}}>
                    <label style={{fontSize:12}}>{ar?'اختر محطة':'בחר תחנה'}</label>
                    <select value={selStation} onChange={e=>handleStationSelect(e.target.value)}
                      style={{fontFamily:'monospace',fontWeight:700}}>
                      <option value="">{ar?'— اختر محطة —':'— בחר תחנה —'}</option>
                      {lands.filter(l=>l.stationNumber&&l.stationLat).map(l=>(
                        <option key={l.id} value={l.id}>
                          {l.stationNumber} — 📍 {parseFloat(l.stationLat).toFixed(4)}, {parseFloat(l.stationLng).toFixed(4)}
                        </option>
                      ))}
                    </select>
                    {form.lat && form.lng && (
                      <div style={{fontSize:11,color:'#16a34a',marginTop:4}}>
                        ✓ {parseFloat(form.lat).toFixed(5)}, {parseFloat(form.lng).toFixed(5)}
                      </div>
                    )}
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
          <div style={{background:'#fff',borderRadius:18,padding:28,maxWidth:400,width:'100%',boxShadow:'0 12px 50px rgba(0,0,0,0.25)'}}>
            <h3 style={{margin:'0 0 16px',color:'var(--primary)'}}>👤 {ar?'إضافة مشترك':'הוסף משתתף'}</h3>

            {openProj.customMembers ? (
              /* ── مشروع بأسماء حرة: حقل نصي بسيط ── */
              <div className="form-group">
                <label>{ar?'اسم المشترك':'שם המשתתף'}</label>
                <input
                  value={customMemberName}
                  onChange={e=>setCustomMemberName(e.target.value)}
                  placeholder={ar?'اكتب اسم المشترك...':'הכנס שם משתתף...'}
                  autoFocus
                  style={{width:'100%'}}
                />
              </div>
            ) : (
              /* ── حقل بحث المزارع (بدل القائمة العادية) ── */
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
            <div className="flex-gap gap-12">
              <button className="btn btn-primary" onClick={submitAddMember}
                disabled={addingMember || (openProj.customMembers ? !customMemberName.trim() : !selFarmerId)}>
                {addingMember?'⏳':`✅ ${ar?'إضافة':'הוסף'}`}
              </button>
              <button className="btn btn-outline" onClick={closeAddMember}>
                {ar?'إلغاء':'ביטול'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: إضافة دفعة ── */}
      {payModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:18,padding:28,maxWidth:380,width:'100%',boxShadow:'0 12px 50px rgba(0,0,0,0.25)'}}>
            <h3 style={{margin:'0 0 4px',color:'var(--primary)'}}>💳 {ar?'إضافة دفعة':'הוסף תשלום'}</h3>
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
                placeholder={ar?'اختياري...':'אופציונלי...'}/>
            </div>
            <div className="flex-gap gap-12">
              <button className="btn btn-primary" onClick={submitPayment} disabled={!payForm.amount||addingPay}>
                {addingPay?'⏳':`💾 ${ar?'حفظ':'שמור'}`}
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

            return (
              <div key={proj.id} className="card" style={{padding:0,overflow:'hidden'}}>
                {/* رأس المشروع */}
                <div style={{padding:'16px 20px',background:isOpen?'#f0fdf4':'#fff',cursor:'pointer',borderBottom:isOpen?'2px solid #bbf7d0':'none'}}
                  onClick={()=>setOpenProj(isOpen?null:proj)}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      <button style={{width:28,height:28,borderRadius:7,border:'1px solid var(--border)',background:isOpen?'var(--primary)':'var(--surface-2)',color:isOpen?'#fff':'var(--text-muted)',cursor:'pointer',fontSize:13,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                        {isOpen?'▲':'▼'}
                      </button>
                      <div>
                        <div style={{fontWeight:900,fontSize:16,color:'var(--primary)'}}>{proj.name}</div>
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

                    {proj.members.length === 0 ? (
                      <div style={{textAlign:'center',padding:20,color:'var(--text-muted)',fontSize:13}}>
                        {ar?'لا يوجد مشتركون بعد':'אין משתתפים עדיין'}
                      </div>
                    ) : (
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                        <thead>
                          <tr style={{background:'#e8f5e9'}}>
                            <th style={{padding:'8px 12px',textAlign:'right',fontWeight:800}}>{ar?'المزارع':'חקלאי'}</th>
                            <th style={{padding:'8px 12px',textAlign:'center',fontWeight:800}}>{ar?'المطلوب':'נדרש'}</th>
                            <th style={{padding:'8px 12px',textAlign:'center',fontWeight:800,color:'#16a34a'}}>{ar?'المدفوع':'שולם'}</th>
                            <th style={{padding:'8px 12px',textAlign:'center',fontWeight:800,color:'#dc2626'}}>{ar?'المتبقي':'נותר'}</th>
                            <th style={{padding:'8px 12px',textAlign:'center',fontWeight:800}}>{ar?'فاتورة':'חשבונית'}</th>
                            <th style={{padding:'8px 12px',textAlign:'center',fontWeight:800}}>{ar?'الدفعات':'תשלומים'}</th>
                            {canManage && <th style={{padding:'8px 12px',width:80}}></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {proj.members.map((m, mi) => {
                            const { paid, remaining: rem } = calcMember(m);
                            const fullPaid = hasAmount(m) && rem <= 0;
                            return (
                              <React.Fragment key={m.id}>
                                <tr style={{borderBottom:'1px solid #e5e7eb',background:mi%2===0?'#fff':'#f9fafb'}}>
                                  <td style={{padding:'10px 12px',fontFamily:'Heebo,sans-serif',fontWeight:700,fontSize:14}}>
                                    {memberDisplayName(m)}
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
                                        <button onClick={()=>{setOpenProj(proj);setPayModal({projectId:proj.id,memberId:m.id,farmerName:memberDisplayName(m)});}}
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
                                    <td colSpan={canManage?7:6} style={{padding:'0 12px 10px 12px',background:mi%2===0?'#fff':'#f9fafb'}}>
                                      <div style={{display:'flex',flexWrap:'wrap',gap:6,paddingRight:16}}>
                                        {m.payments.map(pay => (
                                          <div key={pay.id} style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'4px 10px',fontSize:12,display:'flex',alignItems:'center',gap:6}}>
                                            <span style={{fontWeight:700,color:'#16a34a'}}>₪{pay.amount.toLocaleString()}</span>
                                            <span style={{color:'var(--text-muted)'}}>{pay.date?new Date(pay.date).toLocaleDateString(ar?'ar-SA':'he-IL'):''}</span>
                                            {(pay.receiptNumber || pay.bookNumber) && (
                                              <span style={{color:'#0369a1',fontWeight:700}}>
                                                {pay.receiptNumber && `📄${pay.receiptNumber}`}
                                                {pay.receiptNumber && pay.bookNumber && ' · '}
                                                {pay.bookNumber && `📘${pay.bookNumber}`}
                                              </span>
                                            )}
                                            {pay.note && <span style={{color:'#64748b'}}>· {pay.note}</span>}
                                            {canManage && (
                                              <button onClick={()=>deletePayment(m.id,pay.id)}
                                                style={{background:'none',border:'none',color:'#dc2626',cursor:'pointer',fontSize:13,padding:0,lineHeight:1}}>✕</button>
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