import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { adminAPI } from '../../api';
import { useLang } from '../../contexts/LangContext';
import { t } from '../../i18n/translations';

const dmsToDecimal = (deg, min, sec, dir) => {
  let dd = parseFloat(deg) + parseFloat(min)/60 + parseFloat(sec)/3600;
  if (/[SW]/i.test(dir)) dd = -dd;
  return parseFloat(dd.toFixed(6));
};

const parseGoogleCoords = (raw) => {
  if (!raw || raw.trim().length < 3) return null;
  const s = raw.trim();
  const decMatch = s.match(/^(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)$/);
  if (decMatch) return { lat: parseFloat(decMatch[1]), lng: parseFloat(decMatch[2]) };
  const dmsP1 = /(\d{1,3})[°\u00b0]\s*(\d{1,2})['\u2032]\s*(\d{1,2}(?:\.\d+)?)["\u2033]?\s*([NS])/i;
  const dmsP2 = /(\d{1,3})[°\u00b0]\s*(\d{1,2})['\u2032]\s*(\d{1,2}(?:\.\d+)?)["\u2033]?\s*([EW])/i;
  const latM = s.match(dmsP1);
  const lngM = s.match(dmsP2);
  if (latM && lngM) return {
    lat: dmsToDecimal(latM[1], latM[2], latM[3], latM[4]),
    lng: dmsToDecimal(lngM[1], lngM[2], lngM[3], lngM[4]),
  };
  return null;
};

const EMPTY_FARMER = { firstName:'', lastName:'', idNumber:'', phone:'', notes:'' };
const EMPTY_LAND   = { regionId:'', stationNumber:'', gpsRaw:'', stationLat:'', stationLng:'', description:'' };
const safeFloat = v => { const f = parseFloat(v); return (!isNaN(f) && v !== '' && v !== null) ? f : null; };

export default function AdminFarmers({ adminRole='admin' }) {
  const { lang }  = useLang();
  const ar        = lang === 'ar';
  const isViewer  = adminRole === 'viewer';

  const [farmers,  setFarmers]  = useState([]);
  const [regions,  setRegions]  = useState([]);
  const [allLands, setAllLands] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [readings, setReadings] = useState([]);
  const [prices,   setPrices]   = useState({});
  const [showForm,  setShowForm]  = useState(false);
  const [edit,      setEdit]      = useState(null);
  const [form,      setForm]      = useState(EMPTY_FARMER);
  const [newCode,   setNewCode]   = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [search,    setSearch]    = useState('');
  const [revealCode, setRevealCode] = useState(null);
  const [mapModal, setMapModal] = useState(null);
  const [expandedFarmer, setExpandedFarmer] = useState(null);
  const [farmerLands,    setFarmerLands]    = useState([]);
  const [loadingLands,   setLoadingLands]   = useState(false);
  const [landForm,       setLandForm]       = useState(null);
  const [editLand,       setEditLand]       = useState(null);
  const [landFormData,   setLandFormData]   = useState(EMPTY_LAND);
  const [savingLand,     setSavingLand]     = useState(false);
  const [landError,      setLandError]      = useState('');
  const [manualMode,     setManualMode]     = useState(false);
  const [pendingLands,   setPendingLands]   = useState([]);
  const [savingBatch,    setSavingBatch]    = useState(false);
  const [askLandFor,     setAskLandFor]     = useState(null); // { id, name } للمزارع الجديد

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, rg, rd, pr, ld] = await Promise.all([
        adminAPI.getFarmers(), adminAPI.getRegions(),
        adminAPI.getReadings(), adminAPI.getPrices(), adminAPI.getLands(),
      ]);
      setFarmers(d.farmers || []);
      setRegions(rg.regions || []);
      setReadings(rd.readings || []);
      setPrices(pr || {});
      setAllLands(ld.lands || []);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getPrice = (year, landId, idx) => {
    if (!prices) return 0;
    const lp = prices.landPrices?.[String(landId)];
    if (lp?.[`reading_${idx}`]) return parseFloat(lp[`reading_${idx}`]) || 0;
    if (lp?.default) return parseFloat(lp.default) || 0;
    const yp = prices.yearPrices?.[String(year)];
    if (yp?.[`reading_${idx}`]) return parseFloat(yp[`reading_${idx}`]) || 0;
    if (yp?.default) return parseFloat(yp.default) || 0;
    return parseFloat(prices?.globalPrice) || 0;
  };

  const calcUnpaid = farmerId => readings
    .filter(r => String(r.farmerId).trim() === String(farmerId).trim() && !r.paid)
    .reduce((total, r) => {
      const vals = r.readings || [];
      const cups = vals.slice(1).reduce((s,_,i) => { const c = vals[i+1]-vals[i]; return s+(c>0?c*getPrice(r.year,r.landId,i+1):0); }, 0);
      return total + cups + (parseFloat(r.extra)||0) - (parseFloat(r.extraPaid)||0);
    }, 0);

  const openAdd  = () => { setEdit(null); setForm(EMPTY_FARMER); setNewCode(null); setError(''); setShowForm(true); };
  const openEdit = f  => { setEdit(f); setForm({ firstName:f.firstName||'', lastName:f.lastName||'', idNumber:f.idNumber||'', phone:f.phone||'', notes:f.notes||'' }); setNewCode(null); setError(''); setShowForm(true); };

  const submitFarmer = async e => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) { setError(ar?'الاسم والاسم العائلة مطلوبان':'שם פרטי ושם משפחה חובה'); return; }
    // ✅ إذا رقم الهوية فارغ → يولَّد رقم مؤقت TMP تلقائياً، لا يمكنه تسجيل الدخول حتى يُحدَّث
    const idToUse = form.idNumber.trim() || `TMP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    setSaving(true); setError('');
    try {
      if (edit) {
        await adminAPI.updateFarmer(edit.id, { firstName:form.firstName.trim(), lastName:form.lastName.trim(), idNumber:idToUse, phone:form.phone, notes:form.notes });
        setShowForm(false);
      } else {
        const res = await adminAPI.createFarmer({ firstName:form.firstName.trim(), lastName:form.lastName.trim(), idNumber:idToUse, phone:form.phone, notes:form.notes });
        const newFarmerName = `${form.firstName.trim()} ${form.lastName.trim()}`;
        setShowForm(false); setNewCode(res.code || null);
        if (res.id) setAskLandFor({ id: res.id, name: newFarmerName });
      }
      load();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const delFarmer = async (id, name) => {
    if (!window.confirm(`${ar?'حذف':'מחיקה'} "${name}"?`)) return;
    await adminAPI.deleteFarmer(id); load();
  };

  const handleRevealCode = async farmerId => {
    if (revealCode?.id === farmerId) { setRevealCode(null); return; }
    try {
      const res = await adminAPI.getFarmerCode(farmerId);
      setRevealCode({ id: farmerId, code: res.code });
      setTimeout(() => setRevealCode(null), 10000);
    } catch(e) { alert(ar?'خطأ في جلب الكود':'שגיאה'); }
  };

  const loadFarmerLands = async farmerId => {
    setLoadingLands(true);
    try { const d = await adminAPI.getLandsByFarmer(farmerId); setFarmerLands(d.lands || []); }
    catch(e) { setFarmerLands([]); }
    finally { setLoadingLands(false); }
  };

  const toggleFarmerExpand = async farmerId => {
    if (expandedFarmer === farmerId) { setExpandedFarmer(null); setFarmerLands([]); setLandForm(null); setPendingLands([]); return; }
    setExpandedFarmer(farmerId); setLandForm(null); setPendingLands([]);
    await loadFarmerLands(farmerId);
  };

  const openAddLand = farmerId => { setEditLand(null); setLandFormData({...EMPTY_LAND, farmerId}); setLandError(''); setManualMode(false); setLandForm('add'); };

  const openEditLand = land => {
    setEditLand(land);
    setLandFormData({ regionId:land.regionId||'', stationNumber:land.stationNumber||'', gpsRaw:(land.stationLat&&land.stationLng)?`${land.stationLat}, ${land.stationLng}`:'', stationLat:land.stationLat||'', stationLng:land.stationLng||'', description:land.description||'' });
    setLandError(''); setManualMode(false); setLandForm('edit');
  };

  const handleGpsChange = val => {
    setLandFormData(prev => { const result = parseGoogleCoords(val); return {...prev, gpsRaw:val, stationLat:result?.lat||'', stationLng:result?.lng||''}; });
  };

  // ✅ تعديل وصف محطة في قائمة الانتظار
  const updatePendingDesc = (idx, desc) => {
    setPendingLands(prev => prev.map((p, i) => i === idx ? {...p, description: desc} : p));
  };

  const submitLand = async e => {
    e.preventDefault();
    if (!landFormData.stationNumber.trim()) { setLandError(ar?'رقم المحطة مطلوب':'מספר תחנה חובה'); return; }
    setSavingLand(true); setLandError('');
    try {
      const payload = { farmerId:expandedFarmer, regionId:landFormData.regionId||null, name:landFormData.stationNumber.trim(), nameHeb:landFormData.stationNumber.trim(), stationNumber:landFormData.stationNumber.trim(), description:landFormData.description||'', stationLat:safeFloat(landFormData.stationLat), stationLng:safeFloat(landFormData.stationLng) };
      await adminAPI.updateLand(editLand.id, payload);
      setLandForm(null);
      await loadFarmerLands(expandedFarmer);
    } catch(e) { setLandError(e.message); }
    finally { setSavingLand(false); }
  };

  const saveAllPending = async () => {
    if (!pendingLands.length) return;
    setSavingBatch(true);
    for (const p of pendingLands) {
      try {
        await adminAPI.createLand({ farmerId:expandedFarmer, regionId:p.regionId||null, name:p.stationNumber, nameHeb:p.stationNumber, stationNumber:p.stationNumber, description:p.description||'', stationLat:safeFloat(p.stationLat), stationLng:safeFloat(p.stationLng) });
      } catch {}
    }
    setPendingLands([]); setLandForm(null); setSavingBatch(false);
    await loadFarmerLands(expandedFarmer);
  };

  const delLand = async (id, name) => {
    if (!window.confirm(`${ar?'حذف الأرض':'מחיקת קרקע'} "${name}"?`)) return;
    await adminAPI.deleteLand(id); await loadFarmerLands(expandedFarmer);
  };

  const exportExcel = async () => {
    try {
      const rows = await Promise.all(farmers.map(async f => {
        let code = '****';
        try { const r = await adminAPI.getFarmerCode(f.id); code = r.code||'****'; } catch{}
        return { 'שם החקלאי':f.nameHeb||f.name||'', 'מספר ת"ז':f.idNumber||'', 'קוד כניסה':code, 'טלפון':f.phone||'', 'יתרה לתשלום (₪)':calcUnpaid(f.id)>0?Math.round(calcUnpaid(f.id)*100)/100:0 };
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{wch:22},{wch:14},{wch:12},{wch:14},{wch:18}];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'חקלאים');
      XLSX.writeFile(wb, `alshallala-farmers-${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch(e) { alert(ar?'خطأ في التصدير':'שגיאה בייצוא'); }
  };

  // ✅ ترتيب: افتراضي أبجدي حسب العائلة، أو حسب الرصيد عند الضغط
  const [sortBalance, setSortBalance] = React.useState(null); // null | 'asc' | 'desc'

  const filtered = farmers.filter(f => {
    if (!search) return true;
    const q = search.toLowerCase();
    const fullName = `${f.firstName||''} ${f.lastName||''} ${f.nameHeb||''} ${f.name||''}`.toLowerCase();
    return fullName.includes(q) || (f.idNumber||'').includes(q) || (f.lastName||'').toLowerCase().includes(q);
  });

  const MapModal = () => {
    if (!mapModal) return null;
    const { lat, lng, name } = mapModal;
    const earthUrl = `https://earth.google.com/web/@${lat},${lng},400a,800d,30y,0h,0t,0r/data=CgRCAggBMikKJwolCiExS0M0V193eFlWeTQ2UFR6RW81VkFtVVlvMDNHemUtUHQgAToDCgEwQgIIAEoICIXm6fQFEAE?hl=ar`;
    const osmUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.002},${lat-0.002},${lng+0.002},${lat+0.002}&marker=${lat},${lng}`;
    return (
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={()=>setMapModal(null)}>
        <div style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:520,overflow:'hidden',boxShadow:'0 8px 40px rgba(0,0,0,0.3)'}} onClick={e=>e.stopPropagation()}>
          <div style={{padding:'14px 18px',background:'var(--primary)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <strong style={{color:'#fff',fontFamily:'monospace',fontSize:16}}>📍 {name}</strong>
            <button onClick={()=>setMapModal(null)} style={{background:'none',border:'none',color:'#fff',fontSize:20,cursor:'pointer'}}>✕</button>
          </div>
          <iframe title="map" src={osmUrl} width="100%" height="280" style={{border:'none',display:'block'}} />
          <div style={{padding:'10px 16px',display:'flex',gap:10,justifyContent:'flex-end',background:'#f8fafc'}}>
            <a href={earthUrl} target="_blank" rel="noreferrer" style={{background:'var(--primary)',color:'#fff',padding:'6px 14px',borderRadius:8,fontSize:12,fontWeight:700,textDecoration:'none'}}>🌍 Google Earth</a>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
    <div>
      <MapModal />

      {/* ── مودال: هل تريد إضافة أراضي للمزارع الجديد؟ ── */}
      {askLandFor && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:20,padding:32,maxWidth:380,width:'100%',boxShadow:'0 12px 50px rgba(0,0,0,0.25)',textAlign:'center'}}>
            <div style={{fontSize:48,marginBottom:12}}>🌱</div>
            <h3 style={{margin:'0 0 8px',fontSize:20,color:'var(--primary)'}}>{ar?'إضافة أراضي':'הוספת קרקעות'}</h3>
            <p style={{color:'var(--text-muted)',fontSize:14,marginBottom:24,lineHeight:1.6}}>
              {ar
                ? <>هل تريد إضافة أراضي للمزارع<br/><strong style={{color:'var(--primary)'}}>{askLandFor.name}</strong> الآن؟</>
                : <>האם ברצונך להוסיף קרקעות לחקלאי<br/><strong style={{color:'var(--primary)'}}>{askLandFor.name}</strong> עכשיו?</>
              }
            </p>
            <div style={{display:'flex',gap:12,justifyContent:'center'}}>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  const farmerId = askLandFor.id;
                  setAskLandFor(null);
                  setExpandedFarmer(farmerId);
                  await loadFarmerLands(farmerId);
                  openAddLand(farmerId);
                  // نسكرول لنموذج الأرض بعد أن يكتمل الـ render
                  setTimeout(() => {
                    const el = document.getElementById(`land-form-${farmerId}`);
                    if (el) { const top = el.getBoundingClientRect().top + window.scrollY - 80; window.scrollTo({ top, behavior: 'smooth' }); }
                  }, 350);
                }}
              >
                ✅ {ar?'نعم، أضف الآن':'כן, הוסף עכשיו'}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => setAskLandFor(null)}
              >
                {ar?'لاحقاً':'מאוחר יותר'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex-between mb-20" style={{flexWrap:'wrap',gap:12}}>
        <input type="text" placeholder={`🔍 ${t('search',lang)}`} value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:280}} />
        <div className="flex-gap gap-8">
          <button className="btn btn-outline" onClick={async()=>{ if(window.confirm(ar?'مزامنة GPS؟':'לסנכרן GPS?')){ const r=await adminAPI.syncGPS(); alert((ar?'تم تحديث ':'עודכנו ')+r.updated+(ar?' قراءة':' קריאות')); } }}>🔄 GPS</button>
          <button className="btn btn-outline" onClick={exportExcel}>📊 Excel</button>
          {!isViewer && <button className="btn btn-primary" onClick={openAdd}>+ {ar?'إضافة مزارع':'הוסף חקלאי'}</button>}
        </div>
      </div>

      {showForm && (
        <div className="card mb-20 fade-in-fast" style={{border:'2px solid var(--primary)'}}>
          <h3 className="mb-16">{edit?`✏️ ${ar?'تعديل':'עריכה'}`:`+ ${ar?'مزارع جديد':'חקלאי חדש'}`}</h3>
          <form onSubmit={submitFarmer}>
            <div className="grid-2">
              <div className="form-group">
                <label style={{fontFamily:'Heebo,sans-serif'}}>{ar?'الاسم الشخصي':'שם פרטי'} *</label>
                <input value={form.firstName} onChange={e=>setForm({...form,firstName:e.target.value})} placeholder={ar?'غسان':'גסאן'} style={{fontFamily:'Heebo,sans-serif',fontSize:15}} autoFocus />
              </div>
              <div className="form-group">
                <label style={{fontFamily:'Heebo,sans-serif'}}>{ar?'اسم العائلة':'שם משפחה'} *</label>
                <input value={form.lastName} onChange={e=>setForm({...form,lastName:e.target.value})} placeholder={ar?'عمران':'עמראן'} style={{fontFamily:'Heebo,sans-serif',fontSize:15}} />
              </div>
              <div className="form-group">
                <label>{t('idNumber',lang)} <span style={{fontSize:11,color:'var(--text-muted)',fontWeight:400}}>{ar?'(اختياري — سيُولَّد مؤقت إن تُرك فارغاً)':'(אופציונלי — יוגרל זמני אם ריק)'}</span></label>
                <input value={form.idNumber} onChange={e=>setForm({...form,idNumber:e.target.value})} placeholder={ar?'اتركه فارغاً أو أدخل الرقم':"השאר ריק או הכנס ת\"ז"} />
              </div>
              <div className="form-group">
                <label>{t('phone',lang)}</label>
                <input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="050-1234567" type="tel" autoComplete="off" />
              </div>
              {!edit && (
                <div className="form-group">
                  <label>{ar?'كود الدخول':'קוד כניסה'}</label>
                  <div style={{background:'#f0fdf4',border:'1.5px dashed #16a34a',borderRadius:10,padding:'10px 16px',textAlign:'center',color:'#15803d',fontSize:13,fontWeight:600}}>🎲 {ar?'سيُولَّد تلقائياً':'יופק אוטומטית'}</div>
                </div>
              )}
            </div>
            <div className="form-group">
              <label>{t('notes',lang)}</label>
              <textarea rows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} />
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="flex-gap gap-12">
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving?t('saving',lang):`💾 ${t('save',lang)}`}</button>
              <button type="button" className="btn btn-outline" onClick={()=>setShowForm(false)}>{t('cancel',lang)}</button>
            </div>
          </form>
        </div>
      )}

      {newCode && (
        <div className="card mb-16 fade-in" style={{border:'2px solid #16a34a',background:'#f0fdf4',padding:24,textAlign:'center'}}>
          <div style={{fontSize:20,marginBottom:8}}>🎉 {ar?'تمت الإضافة!':'נוסף בהצלחה!'}</div>
          <div style={{display:'inline-block',background:'#fff',border:'3px solid #16a34a',borderRadius:16,padding:'16px 48px',fontSize:52,fontWeight:900,fontFamily:'monospace',letterSpacing:14,color:'#14532d'}}>{newCode}</div>
          <div style={{marginTop:14,color:'var(--text-muted)',fontSize:12}}>{ar?'احفظه وأرسله للمزارع':'שמור ושלח לחקלאי'}</div>
          <button className="btn btn-outline btn-sm" style={{marginTop:14}} onClick={()=>setNewCode(null)}>{ar?'إغلاق':'סגור'}</button>
        </div>
      )}

      {loading ? (
        <div style={{textAlign:'center',padding:40}}><div className="spinner"/></div>
      ) : (
        <div className="card">
          <p style={{color:'var(--text-muted)',fontSize:13,marginBottom:12}}>{filtered.length} {ar?'مزارع':'חקלאים'}</p>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{width:30}}></th>
                  <th
                    onClick={()=>setSortBalance(null)}
                    style={{cursor:'pointer',userSelect:'none'}}
                    title={ar?'اضغط للعودة للترتيب الأبجدي':'לחץ למיון אלפביתי'}
                  >
                    {ar?'الاسم':'שם'}{sortBalance !== null ? ' ↺' : ''}
                  </th>
                  <th>{t('idNumber',lang)}</th>
                  <th>{ar?'الكود':'קוד'}</th>
                  <th>{t('phone',lang)}</th>
                  <th
                    onClick={()=>setSortBalance(s => s === 'desc' ? 'asc' : 'desc')}
                    style={{color:'#dc2626',background:'#fff1f2',cursor:'pointer',userSelect:'none',whiteSpace:'nowrap'}}
                    title={ar?'اضغط للترتيب':'לחץ למיון'}
                  >
                    {ar?'غير مدفوع':'יתרה'}
                    {sortBalance === 'desc' ? ' ↓' : sortBalance === 'asc' ? ' ↑' : ' ↕'}
                  </th>
                  <th>{t('notes',lang)}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...filtered].sort((a,b) => {
                    if (sortBalance === 'asc')  return calcUnpaid(a.id) - calcUnpaid(b.id);
                    if (sortBalance === 'desc') return calcUnpaid(b.id) - calcUnpaid(a.id);
                    // ✅ ترتيب أبجدي افتراضي حسب اسم العائلة
                    const nameA = (a.lastName || a.name || '').trim();
                    const nameB = (b.lastName || b.name || '').trim();
                    return nameA.localeCompare(nameB, 'ar');
                  }).map(f => {
                  const unpaid = calcUnpaid(f.id);
                  const isOpen = expandedFarmer === f.id;
                  return (
                    <React.Fragment key={f.id}>
                      <tr id={`farmer-row-${f.id}`} style={{background:isOpen?'#f0fdf4':''}}>
                        <td style={{textAlign:'center'}}>
                          <button onClick={()=>toggleFarmerExpand(f.id)} style={{width:26,height:26,borderRadius:6,border:'1px solid var(--border)',background:isOpen?'var(--primary)':'var(--surface-2)',color:isOpen?'#fff':'var(--text-muted)',cursor:'pointer',fontSize:12,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                            {isOpen?'▲':'▼'}
                          </button>
                        </td>
                        <td>
                          <div style={{fontFamily:'Heebo,sans-serif'}}>
                            <span style={{fontWeight:900,fontSize:15,color:'var(--primary)'}}>{f.lastName||f.nameHeb||f.name} </span>
                            <span style={{fontWeight:700,fontSize:15}}>{f.firstName||''}</span>
                          </div>
                        </td>
                        <td>
                          {f.idNumber?.startsWith('TMP-')
                            ? <span title={f.idNumber} style={{background:'#fff7ed',border:'1px solid #fed7aa',color:'#c2410c',padding:'2px 8px',borderRadius:6,fontSize:11,fontWeight:700}}>⏳ {ar?'مؤقت':'זמני'}</span>
                            : <code style={{background:'var(--surface-2)',padding:'2px 8px',borderRadius:4,fontSize:12}}>{f.idNumber}</code>
                          }
                        </td>
                        <td>
                          <div style={{display:'flex',alignItems:'center',gap:5}}>
                            <code style={{background:'#f0fdf4',border:'1px solid #bbf7d0',padding:'3px 10px',borderRadius:6,fontSize:13,fontWeight:700,letterSpacing:3,color:'#15803d'}}>{revealCode?.id===f.id?revealCode.code:'••••'}</code>
                            <button onClick={()=>handleRevealCode(f.id)} style={{width:24,height:24,borderRadius:6,border:'1px solid var(--border)',background:'var(--surface-2)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:12}}>{revealCode?.id===f.id?'🙈':'👁'}</button>
                          </div>
                        </td>
                        <td>{f.phone||'—'}</td>
                        <td style={{textAlign:'center'}}>
                          {unpaid>0?<span style={{background:'#fff1f2',color:'#dc2626',padding:'3px 10px',borderRadius:6,fontWeight:700,fontSize:13}}>₪{Math.round(unpaid).toLocaleString()}</span>:<span style={{color:'#16a34a',fontWeight:700}}>✓</span>}
                        </td>
                        <td style={{maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:12,color:'var(--text-muted)'}}>{f.notes||'—'}</td>
                        {!isViewer && (
                          <td>
                            <div className="flex-gap gap-4">
                              <button onClick={()=>openEdit(f)} style={{width:26,height:26,borderRadius:6,border:'1.5px solid var(--border)',background:'var(--surface-2)',color:'var(--primary)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:12}} onMouseEnter={e=>{e.currentTarget.style.background='var(--primary)';e.currentTarget.style.color='#fff';}} onMouseLeave={e=>{e.currentTarget.style.background='var(--surface-2)';e.currentTarget.style.color='var(--primary)';}}>✏</button>
                              <button onClick={()=>delFarmer(f.id,f.nameHeb||f.name)} style={{width:26,height:26,borderRadius:6,border:'1.5px solid #fca5a5',background:'#fff1f2',color:'#dc2626',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:12}} onMouseEnter={e=>{e.currentTarget.style.background='#dc2626';e.currentTarget.style.color='#fff';}} onMouseLeave={e=>{e.currentTarget.style.background='#fff1f2';e.currentTarget.style.color='#dc2626';}}>✕</button>
                            </div>
                          </td>
                        )}
                      </tr>

                      {isOpen && (
                        <tr>
                          <td colSpan={isViewer?7:8} style={{padding:0,background:'#f8fffe'}}>
                            <div style={{padding:'12px 16px 16px',borderTop:'2px solid #bbf7d0'}}>
                              <div className="flex-between mb-8">
                                <strong style={{fontSize:13,color:'var(--primary)'}}>🌱 {ar?'أراضي':'קרקעות של'} {f.firstName||''} {f.lastName||f.nameHeb||f.name}</strong>
                                {!isViewer && <button className="btn btn-outline btn-sm" onClick={()=>openAddLand(f.id)}>+ {ar?'إضافة أرض':'הוסף קרקע'}</button>}
                              </div>

                              {landForm && (
                                <div id={`land-form-${f.id}`} style={{background:'#fff',border:'1.5px solid var(--primary)',borderRadius:10,padding:14,marginBottom:12}}>
                                  <h4 style={{margin:'0 0 12px'}}>{editLand?(ar?'✏ تعديل':'✏ עריכה'):(ar?'+ إضافة أراضي':'+ הוסף קרקעות')}</h4>
                                  <form onSubmit={editLand?submitLand:e=>e.preventDefault()}>

                                    {/* زرا الوضع — يظهران في الإضافة والتعديل */}
                                    <div style={{display:'flex',gap:8,marginBottom:14}}>
                                      <button type="button" onClick={()=>{setManualMode(false); if(!editLand) setLandFormData(EMPTY_LAND);}}
                                        style={{flex:1,padding:'8px',borderRadius:8,border:`2px solid ${!manualMode?'var(--primary)':'var(--border)'}`,background:!manualMode?'#f0fdf4':'var(--surface-2)',fontWeight:700,fontSize:13,cursor:'pointer',color:!manualMode?'var(--primary)':'var(--text-muted)'}}>
                                        📋 {ar?'اختر من القائمة':'בחר מרשימה'}
                                      </button>
                                      <button type="button" onClick={()=>{setManualMode(true); if(!editLand) setLandFormData(EMPTY_LAND);}}
                                        style={{flex:1,padding:'8px',borderRadius:8,border:`2px solid ${manualMode?'var(--primary)':'var(--border)'}`,background:manualMode?'#f0fdf4':'var(--surface-2)',fontWeight:700,fontSize:13,cursor:'pointer',color:manualMode?'var(--primary)':'var(--text-muted)'}}>
                                        ✏️ {ar?'إدخال يدوي':'הזנה ידנית'}
                                      </button>
                                    </div>

                                    {/* ── القائمة ── */}
                                    {!manualMode ? (
                                      <div className="form-group">
                                        <label style={{fontFamily:'Heebo,sans-serif'}}>{ar?'اختر محطة':'בחר תחנה'}</label>
                                        <select value={editLand ? landFormData.stationNumber : ""}
                                          onChange={e => {
                                            const val = e.target.value;
                                            if (!val) return;
                                            const s = allLands.find(l => l.stationNumber === val);
                                            if (s) {
                                              if (editLand) {
                                                // في التعديل: نملأ النموذج + ننسخ الوصف من المحطة تلقائياً (قابل للتعديل)
                                                setLandFormData({ regionId:s.regionId||'', stationNumber:s.stationNumber, stationLat:s.stationLat||'', stationLng:s.stationLng||'', gpsRaw:(s.stationLat&&s.stationLng)?`${s.stationLat}, ${s.stationLng}`:'', description: s.description || '' });
                                              } else {
                                                // في الإضافة: نسمح بالتكرار (مزارع يملك أكثر من ساعة في نفس المحطة)
                                                const isDuplicate = pendingLands.some(p => p.stationNumber === val);
                                                setPendingLands(prev => [...prev, {
                                                  regionId: s.regionId||'',
                                                  stationNumber: s.stationNumber,
                                                  stationLat: s.stationLat||'',
                                                  stationLng: s.stationLng||'',
                                                  description: isDuplicate ? '' : (s.description || ''),
                                                  _duplicate: isDuplicate,
                                                }]);
                                                e.target.value='';
                                              }
                                            }
                                          }}
                                          style={{fontSize:15,fontFamily:'monospace',fontWeight:700}}>
                                          <option value="">{editLand ? (landFormData.stationNumber||ar?'— اختر —':'— בחר —') : (ar?`— اختر (${pendingLands.length} في القائمة) —`:`— בחר (${pendingLands.length} בתור) —`)}</option>
                                          {(() => {
                                            const available = allLands.filter(l => l.stationNumber);
                                            const grouped = available.reduce((acc,l)=>{ const code=l.stationNumber?.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase()||'?'; if(!acc[code])acc[code]=[]; acc[code].push(l); return acc; },{});
                                            return Object.entries(grouped).sort(([a],[b])=>a.localeCompare(b)).map(([code,lands])=>(
                                              <optgroup key={code} label={`── ${code} ──`}>
                                                {lands.map(l=>{ const reg=regions.find(r=>r.id===l.regionId); return (
                                                  <option key={l.id} value={l.stationNumber}>
                                                    {l.stationNumber}{reg?.nameHeb&&reg.nameHeb!==reg.name?` (${reg.nameHeb})`:reg?.name?` (${reg.name})`:''}{l.stationLat?' 📍':''}
                                                  </option>
                                                );})}
                                              </optgroup>
                                            ));
                                          })()}
                                        </select>
                                        {/* في التعديل: نعرض معاينة + حقل وصف */}
                                        {editLand && landFormData.stationNumber && (
                                          <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'8px 12px',marginTop:8,fontSize:13}}>
                                            <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
                                              <strong style={{color:'var(--primary)',fontFamily:'monospace'}}>{landFormData.stationNumber}</strong>
                                              {landFormData.stationLat&&landFormData.stationLng
                                                ? <span style={{color:'#16a34a',fontSize:12}}>✓ GPS: {parseFloat(landFormData.stationLat).toFixed(4)}, {parseFloat(landFormData.stationLng).toFixed(4)}</span>
                                                : <span style={{color:'#ca8a04',fontSize:12}}>⚠️ {ar?'لا GPS':'אין GPS'}</span>}
                                            </div>
                                            <div style={{marginTop:8}}>
                                              <label style={{fontSize:12,color:'var(--text-muted)'}}>📝 {ar?'وصف':'תיאור'}</label>
                                              <input value={landFormData.description} onChange={e=>setLandFormData({...landFormData,description:e.target.value})}
                                                placeholder={ar?'وصف اختياري...':'תיאור אופציונלי...'} style={{width:'100%',marginTop:4,fontSize:12,padding:'5px 8px',borderRadius:6,border:'1px solid #bbf7d0'}}/>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      /* ── يدوي ── */
                                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12,marginBottom:12}}>
                                        <div className="form-group">
                                          <label>עמדה *</label>
                                          <input value={landFormData.stationNumber} onChange={e=>setLandFormData({...landFormData,stationNumber:e.target.value})} placeholder="A14" style={{fontFamily:'monospace',fontWeight:900,textAlign:'center',fontSize:18,letterSpacing:3}} autoFocus={manualMode&&!editLand}/>
                                        </div>
                                        <div className="form-group">
                                          <label>{ar?'المنطقة':'אזור'}</label>
                                          <select value={landFormData.regionId} onChange={e=>setLandFormData({...landFormData,regionId:e.target.value})}>
                                            <option value="">{ar?'— اختر —':'— בחר —'}</option>
                                            {regions.map(r=><option key={r.id} value={r.id}>{r.name}{r.nameHeb&&r.nameHeb!==r.name?` — ${r.nameHeb}`:''}</option>)}
                                          </select>
                                        </div>
                                        <div className="form-group">
                                          <label>📍 GPS</label>
                                          <input value={landFormData.gpsRaw} onChange={e=>handleGpsChange(e.target.value)} placeholder="32.12, 35.12" style={{fontFamily:'monospace',fontSize:12}}/>
                                        </div>
                                        <div className="form-group">
                                          <label>📝 {ar?'وصف':'תיאור'}</label>
                                          <input value={landFormData.description} onChange={e=>setLandFormData({...landFormData,description:e.target.value})} placeholder={ar?'وصف...':'תיאור...'}/>
                                        </div>
                                      </div>
                                    )}

                                    {landError && <div className="alert alert-error mb-8">{landError}</div>}
                                    <div className="flex-gap gap-8">
                                      {editLand ? (
                                        <>
                                          <button type="submit" className="btn btn-primary btn-sm" disabled={savingLand}>{savingLand?'⏳':`💾 ${ar?'حفظ':'שמור'}`}</button>
                                          <button type="button" className="btn btn-outline btn-sm" onClick={()=>setLandForm(null)}>{ar?'إلغاء':'ביטול'}</button>
                                        </>
                                      ) : (
                                        <button type="button" className="btn btn-outline btn-sm" onClick={()=>{setLandForm(null);setPendingLands([]);}}>
                                          {ar?'إلغاء':'ביטול'}
                                        </button>
                                      )}
                                    </div>
                                  </form>

                                  {/* ✅ قائمة الانتظار مع حقل وصف لكل محطة */}
                                  {!editLand && pendingLands.length > 0 && (
                                    <div style={{marginTop:14,background:'#f0fdf4',border:'1.5px solid #bbf7d0',borderRadius:10,padding:'12px 14px'}}>
                                      <div className="flex-between mb-10">
                                        <strong style={{fontSize:13,color:'var(--primary)'}}>🗂️ {ar?'قائمة الانتظار':'תור לשמירה'} ({pendingLands.length})</strong>
                                        <button className="btn btn-primary btn-sm" onClick={saveAllPending} disabled={savingBatch}>
                                          {savingBatch?'⏳':`💾 ${ar?`حفظ الكل (${pendingLands.length})`:`שמור הכל (${pendingLands.length})`}`}
                                        </button>
                                      </div>
                                      <div style={{display:'flex',flexDirection:'column',gap:6}}>
                                        {pendingLands.map((p, i) => (
                                          <div key={i} style={{display:'flex',alignItems:'center',gap:8,background:p._duplicate?'#fffbeb':'#fff',border:`1.5px solid ${p._duplicate?'#fcd34d':'#bbf7d0'}`,borderRadius:8,padding:'6px 10px'}}>
                                            <div style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:40}}>
                                              <code style={{fontWeight:900,color:'var(--primary)',fontSize:13}}>{p.stationNumber}</code>
                                              {p._duplicate && <span style={{fontSize:9,color:'#d97706',fontWeight:700}}>{ar?'مكرر':'כפול'}</span>}
                                            </div>
                                            {p.stationLat && <span style={{fontSize:10,color:'#16a34a'}}>📍</span>}
                                            <input
                                              value={p.description}
                                              onChange={e=>updatePendingDesc(i, e.target.value)}
                                              placeholder={p._duplicate ? (ar?'⚠️ أدخل وصفاً للتمييز (مطلوب)...':'⚠️ הכנס תיאור להבחנה (חובה)...') : (ar?'وصف خاص (اختياري)...':'תיאור (אופציונלי)...')}
                                              style={{flex:1,fontSize:12,padding:'3px 8px',borderRadius:5,border:`1px solid ${p._duplicate && !p.description ? '#f59e0b' : '#d1d5db'}`,background:p._duplicate && !p.description?'#fffbeb':'#fff'}}
                                            />
                                            <button onClick={()=>setPendingLands(prev=>prev.filter((_,idx)=>idx!==i))}
                                              style={{background:'none',border:'none',cursor:'pointer',color:'#dc2626',fontSize:16,padding:0,lineHeight:1,flexShrink:0}}>✕</button>
                                          </div>
                                        ))}
                                      </div>
                                      <p style={{fontSize:11,color:'var(--text-muted)',marginTop:8}}>
                                        💡 {ar?'اختر محطة → تُضاف فوراً → عدّل الوصف → حفظ الكل':'בחר תחנה → מתווספת מיד → ערוך תיאור → שמור הכל'}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {loadingLands ? (
                                <div style={{textAlign:'center',padding:20}}><div className="spinner"/></div>
                              ) : farmerLands.length === 0 ? (
                                <div style={{textAlign:'center',padding:16,color:'var(--text-muted)',fontSize:13}}>{ar?'لا توجد أراضٍ مسجلة':'אין קרקעות רשומות'}</div>
                              ) : (
                                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                                  <thead>
                                    <tr style={{background:'#e8f5e9'}}>
                                      <th style={{padding:'6px 10px',textAlign:'center'}}>עמדה</th>
                                      <th style={{padding:'6px 10px',textAlign:'center'}}>{ar?'المنطقة':'אזור'}</th>
                                      <th style={{padding:'6px 10px',textAlign:'right'}}>{ar?'الوصف':'תיאור'}</th>
                                      <th style={{padding:'6px 10px',textAlign:'center'}}>📍</th>
                                      {!isViewer && <th style={{padding:'6px 10px',width:70}}></th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {farmerLands.map(l => (
                                      <tr key={l.id} style={{borderBottom:'1px solid #e5e7eb'}}>
                                        <td style={{padding:'7px 10px',textAlign:'center'}}>
                                          {l.stationNumber?<code style={{background:'#f0fdf4',border:'1px solid #bbf7d0',padding:'3px 12px',borderRadius:6,fontWeight:900,fontSize:15,letterSpacing:2}}>{l.stationNumber}</code>:<span style={{color:'var(--border)'}}>—</span>}
                                        </td>
                                        <td style={{padding:'7px 10px',textAlign:'center',fontSize:13}}>
                                          {(()=>{ const reg=regions.find(r=>r.id===l.regionId); return reg?<span style={{background:'#f0fdf4',border:'1px solid #bbf7d0',padding:'2px 10px',borderRadius:6,fontWeight:700,color:'var(--primary)'}}>{reg.name}{reg.nameHeb&&reg.nameHeb!==reg.name?` — ${reg.nameHeb}`:''}</span>:<span style={{color:'var(--border)'}}>—</span>; })()}
                                        </td>
                                        <td style={{padding:'7px 10px',fontSize:12,color:'#1e40af',maxWidth:200}}>
                                          {l.description?<span style={{background:'#eff6ff',border:'1px solid #bfdbfe',padding:'2px 8px',borderRadius:6}}>🏡 {l.description}</span>:<span style={{color:'var(--border)'}}>—</span>}
                                        </td>
                                        <td style={{padding:'7px 10px',textAlign:'center',fontSize:11}}>
                                          {l.stationLat&&l.stationLng?<a href={`https://www.google.com/maps?q=${l.stationLat},${l.stationLng}`} target="_blank" rel="noreferrer" style={{color:'var(--primary)',fontWeight:600,textDecoration:'none'}}>📍 {parseFloat(l.stationLat).toFixed(4)}, {parseFloat(l.stationLng).toFixed(4)}</a>:<span style={{color:'var(--border)'}}>—</span>}
                                        </td>
                                        {!isViewer && (
                                          <td style={{padding:'7px 10px'}}>
                                            <div className="flex-gap gap-4">
                                              <button onClick={()=>openEditLand(l)} style={{width:26,height:26,borderRadius:6,border:'1.5px solid var(--border)',background:'var(--surface-2)',color:'var(--primary)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:12}} onMouseEnter={e=>{e.currentTarget.style.background='var(--primary)';e.currentTarget.style.color='#fff';}} onMouseLeave={e=>{e.currentTarget.style.background='var(--surface-2)';e.currentTarget.style.color='var(--primary)';}}>✏</button>
                                              <button onClick={()=>delLand(l.id,l.stationNumber||'?')} style={{width:26,height:26,borderRadius:6,border:'1.5px solid #fca5a5',background:'#fff1f2',color:'#dc2626',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:12}} onMouseEnter={e=>{e.currentTarget.style.background='#dc2626';e.currentTarget.style.color='#fff';}} onMouseLeave={e=>{e.currentTarget.style.background='#fff1f2';e.currentTarget.style.color='#dc2626';}}>✕</button>
                                            </div>
                                          </td>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length===0&&<div className="empty-state"><span className="icon">👨‍🌾</span><p>{t('noData',lang)}</p></div>}
        </div>
      )}
    </div>

      {/* ── زر العودة للأعلى ── */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        title={ar ? 'العودة للأعلى' : 'חזור למעלה'}
        style={{
          position: 'fixed',
          bottom: 32,
          left: 32,
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'rgba(var(--primary-rgb, 22,101,52), 0.75)',
          color: '#fff',
          border: 'none',
          fontSize: 22,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          zIndex: 1000,
          transition: 'opacity 0.2s, transform 0.2s',
          opacity: 0.7,
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1.1)'; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.transform = 'scale(1)'; }}
      >
        ↑
      </button>
    </>
  );
}
