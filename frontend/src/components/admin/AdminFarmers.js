import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { adminAPI } from '../../api';
import { useLang } from '../../contexts/LangContext';
import { t } from '../../i18n/translations';

// ── GPS parser (نفس الكود المستخدم في AdminReadings) ─────────
const dmsToDecimal = (deg, min, sec, dir) => {
  let dd = parseFloat(deg) + parseFloat(min)/60 + parseFloat(sec)/3600;
  if (/[SW]/i.test(dir)) dd = -dd;
  return parseFloat(dd.toFixed(6));
};

const parseGoogleCoords = (raw) => {
  if (!raw || raw.trim().length < 3) return null;
  const s = raw.trim();
  // 1. Decimal: "33.238322, 35.711053"
  const decMatch = s.match(/^(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)$/);
  if (decMatch) return { lat: parseFloat(decMatch[1]), lng: parseFloat(decMatch[2]) };
  // 2. DMS: 33°14'17.96"N 35°42'39.79"E
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

// ── Empty forms ──────────────────────────────────────────────
const EMPTY_FARMER = { name:'', idNumber:'', phone:'', notes:'' };
const EMPTY_LAND   = { regionId:'', stationNumber:'', gpsRaw:'', stationLat:'', stationLng:'', description:'' };

export default function AdminFarmers({ adminRole='admin' }) {
  const { lang }  = useLang();
  const ar        = lang === 'ar';
  const isViewer  = adminRole === 'viewer';

  const [farmers,  setFarmers]  = useState([]);
  const [regions,  setRegions]  = useState([]);
  const [allLands, setAllLands] = useState([]);  // ✅ كل المحطات المستوردة
  const [loading,  setLoading]  = useState(true);
  const [readings, setReadings] = useState([]);
  const [prices,   setPrices]   = useState({});

  // farmer form
  const [showForm,  setShowForm]  = useState(false);
  const [edit,      setEdit]      = useState(null);
  const [form,      setForm]      = useState(EMPTY_FARMER);
  const [newCode,   setNewCode]   = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [search,    setSearch]    = useState('');

  // reveal code
  const [revealCode, setRevealCode] = useState(null);

  // map modal
  const [mapModal, setMapModal] = useState(null);

  // lands per farmer (expanded)
  const [expandedFarmer, setExpandedFarmer] = useState(null);
  const [farmerLands,    setFarmerLands]    = useState([]);
  const [loadingLands,   setLoadingLands]   = useState(false);
  const [landForm,       setLandForm]       = useState(null);
  const [editLand,       setEditLand]       = useState(null);
  const [landFormData,   setLandFormData]   = useState(EMPTY_LAND);
  const [savingLand,     setSavingLand]     = useState(false);
  const [landError,      setLandError]      = useState('');
  const [manualMode,     setManualMode]     = useState(false); // ✅ وضع الإدخال اليدوي

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, rg, rd, pr, ld] = await Promise.all([
        adminAPI.getFarmers(),
        adminAPI.getRegions(),
        adminAPI.getReadings(),
        adminAPI.getPrices(),
        adminAPI.getLands(),
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

  // ── حساب المتبقي ────────────────────────────────────────
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

  const calcUnpaid = farmerId => {
    return readings
      .filter(r => String(r.farmerId).trim() === String(farmerId).trim() && !r.paid)
      .reduce((total, r) => {
        const vals = r.readings || [];
        const cups = vals.slice(1).reduce((s,_,i) => {
          const c = vals[i+1] - vals[i];
          return s + (c > 0 ? c * getPrice(r.year, r.landId, i+1) : 0);
        }, 0);
        const extra = (parseFloat(r.extra)||0) - (parseFloat(r.extraPaid)||0);
        return total + cups + extra;
      }, 0);
  };

  // ── Farmer CRUD ──────────────────────────────────────────
  const openAdd = () => { setEdit(null); setForm(EMPTY_FARMER); setNewCode(null); setError(''); setShowForm(true); };
  const openEdit = f => { setEdit(f); setForm({ name:f.nameHeb||f.name||'', idNumber:f.idNumber||'', phone:f.phone||'', notes:f.notes||'' }); setNewCode(null); setError(''); setShowForm(true); };

  const submitFarmer = async e => {
    e.preventDefault();
    if (!form.name.trim() || !form.idNumber) { setError(ar?'الاسم ورقم الهوية مطلوبان':'שם ומספר ת"ז חובה'); return; }
    setSaving(true); setError('');
    try {
      if (edit) {
        await adminAPI.updateFarmer(edit.id, { name:form.name.trim(), nameHeb:form.name.trim(), idNumber:form.idNumber, phone:form.phone, notes:form.notes });
        setShowForm(false);
      } else {
        const res = await adminAPI.createFarmer({ name:form.name.trim(), nameHeb:form.name.trim(), idNumber:form.idNumber, phone:form.phone, notes:form.notes });
        setShowForm(false);
        setNewCode(res.code || null);
      }
      load();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const delFarmer = async (id, name) => {
    if (!window.confirm(`${ar?'حذف':'מחיקה'} "${name}"?`)) return;
    await adminAPI.deleteFarmer(id); load();
  };

  // ── Reveal code ──────────────────────────────────────────
  const handleRevealCode = async farmerId => {
    if (revealCode?.id === farmerId) { setRevealCode(null); return; }
    try {
      const res = await adminAPI.getFarmerCode(farmerId);
      setRevealCode({ id: farmerId, code: res.code });
      setTimeout(() => setRevealCode(null), 10000);
    } catch(e) { alert(ar?'خطأ في جلب الكود':'שגיאה'); }
  };

  // ── Lands CRUD ───────────────────────────────────────────
  const loadFarmerLands = async farmerId => {
    setLoadingLands(true);
    try {
      const d = await adminAPI.getLandsByFarmer(farmerId);
      setFarmerLands(d.lands || []);
    } catch(e) { setFarmerLands([]); }
    finally { setLoadingLands(false); }
  };

  const toggleFarmerExpand = async farmerId => {
    if (expandedFarmer === farmerId) { setExpandedFarmer(null); setFarmerLands([]); setLandForm(null); return; }
    setExpandedFarmer(farmerId);
    setLandForm(null);
    await loadFarmerLands(farmerId);
  };

  const openAddLand = farmerId => {
    setEditLand(null);
    setLandFormData({ ...EMPTY_LAND, farmerId });
    setLandError('');
    setManualMode(false);
    setLandForm('add');
  };

  const openEditLand = land => {
    setEditLand(land);
    setLandFormData({
      regionId:      land.regionId || '',
      stationNumber: land.stationNumber || '',
      gpsRaw:        (land.stationLat && land.stationLng)
                       ? `${land.stationLat}, ${land.stationLng}`
                       : '',
      stationLat:    land.stationLat || '',
      stationLng:    land.stationLng || '',
      description:   land.description || '',
    });
    setLandError('');
    setManualMode(true); // التعديل دائماً يدوي
    setLandForm('edit');
  };

  const handleGpsChange = val => {
    setLandFormData(prev => {
      const result = parseGoogleCoords(val);
      return { ...prev, gpsRaw:val, stationLat: result?.lat||'', stationLng: result?.lng||'' };
    });
  };

  // ✅ FIX: تحقق من NaN قبل الإرسال
  const safeFloat = v => {
    const f = parseFloat(v);
    return (!isNaN(f) && v !== '' && v !== null) ? f : null;
  };

  const submitLand = async e => {
    e.preventDefault();
    if (!landFormData.stationNumber.trim()) {
      setLandError(ar ? 'رقم المحطة مطلوب' : 'מספר תחנה חובה'); return;
    }
    setSavingLand(true); setLandError('');
    try {
      const payload = {
        farmerId:      expandedFarmer,
        regionId:      landFormData.regionId || null,
        name:          landFormData.stationNumber.trim(),
        nameHeb:       landFormData.stationNumber.trim(),
        stationNumber: landFormData.stationNumber.trim(),
        description:   landFormData.description || '',
        stationLat:    safeFloat(landFormData.stationLat),
        stationLng:    safeFloat(landFormData.stationLng),
      };
      if (editLand) await adminAPI.updateLand(editLand.id, payload);
      else          await adminAPI.createLand(payload);
      setLandForm(null);
      await loadFarmerLands(expandedFarmer);
    } catch(e) { setLandError(e.message); }
    finally { setSavingLand(false); }
  };

  const delLand = async (id, name) => {
    if (!window.confirm(`${ar?'حذف الأرض':'מחיקת קרקע'} "${name}"?`)) return;
    await adminAPI.deleteLand(id);
    await loadFarmerLands(expandedFarmer);
  };

  // ── Excel export ─────────────────────────────────────────
  const exportExcel = async () => {
    try {
      const rows = await Promise.all(farmers.map(async f => {
        let code = '****';
        try { const r = await adminAPI.getFarmerCode(f.id); code = r.code||'****'; } catch{}
        const unpaid = calcUnpaid(f.id);
        return {
          'שם החקלאי':        f.nameHeb || f.name || '',
          'מספר ת"ז':         f.idNumber || '',
          'קוד כניסה':        code,
          'טלפון':            f.phone || '',
          'יתרה לתשלום (₪)': unpaid > 0 ? Math.round(unpaid*100)/100 : 0,
        };
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch:22 },{ wch:14 },{ wch:12 },{ wch:14 },{ wch:18 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'חקלאים');
      XLSX.writeFile(wb, `alshallala-farmers-${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch(e) { alert(ar?'خطأ في التصدير':'שגיאה בייצוא'); }
  };

  const filtered = farmers.filter(f => !search || f.name?.includes(search) || f.nameHeb?.includes(search) || f.idNumber?.includes(search));

  // ── MapModal ─────────────────────────────────────────────
  const MapModal = () => {
    if (!mapModal) return null;
    const { lat, lng, name } = mapModal;
    const earthUrl = `https://earth.google.com/web/@${lat},${lng},400a,800d,30y,0h,0t,0r`;
    const osmUrl   = `https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.002},${lat-0.002},${lng+0.002},${lat+0.002}&marker=${lat},${lng}`;
    return (
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
        onClick={()=>setMapModal(null)}>
        <div style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:520,overflow:'hidden',boxShadow:'0 8px 40px rgba(0,0,0,0.3)'}}
          onClick={e=>e.stopPropagation()}>
          <div style={{padding:'14px 18px',background:'var(--primary)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <strong style={{color:'#fff',fontFamily:'monospace',fontSize:16}}>📍 {name}</strong>
            <button onClick={()=>setMapModal(null)} style={{background:'none',border:'none',color:'#fff',fontSize:20,cursor:'pointer'}}>✕</button>
          </div>
          <iframe title="map" src={osmUrl} width="100%" height="280" style={{border:'none',display:'block'}} />
          <div style={{padding:'10px 16px',display:'flex',gap:10,justifyContent:'flex-end',background:'#f8fafc'}}>
            <span style={{fontSize:11,color:'var(--text-muted)',alignSelf:'center'}}>{parseFloat(lat).toFixed(5)}, {parseFloat(lng).toFixed(5)}</span>
            <a href={earthUrl} target="_blank" rel="noreferrer"
              style={{background:'var(--primary)',color:'#fff',padding:'6px 14px',borderRadius:8,fontSize:12,fontWeight:700,textDecoration:'none'}}>
              🌍 Google Earth
            </a>
          </div>
        </div>
      </div>
    );
  };

  // ── JSX ──────────────────────────────────────────────────
  return (
    <div>
      <MapModal />
      {/* Header */}
      <div className="flex-between mb-20" style={{flexWrap:'wrap', gap:12}}>
        <input type="text" placeholder={`🔍 ${t('search',lang)}`}
          value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:280}} />
        <div className="flex-gap gap-8">
          <button className="btn btn-outline" onClick={async()=>{
            if(window.confirm(ar?'مزامنة مواقع GPS من الأراضي إلى كل القراءات؟':'לסנכרן מיקומי GPS מהקרקעות לכל הקריאות?')){
              const r = await adminAPI.syncGPS();
              alert((ar?'تم تحديث ':'עודכנו ') + r.updated + (ar?' قراءة':'  קריאות'));
            }
          }} title={ar?'مزامنة GPS من الأراضي':'סנכרן GPS מקרקעות'}>
            🔄 GPS
          </button>
          <button className="btn btn-outline" onClick={exportExcel}>📊 Excel</button>
          {!isViewer && <button className="btn btn-primary" onClick={openAdd}>+ {ar?'إضافة مزارع':'הוסף חקלאי'}</button>}
        </div>
      </div>

      {/* Farmer form */}
      {showForm && (
        <div className="card mb-20 fade-in-fast" style={{border:'2px solid var(--primary)'}}>
          <h3 className="mb-16">{edit ? `✏️ ${ar?'تعديل':'עריכה'}` : `+ ${ar?'مزارع جديد':'חקלאי חדש'}`}</h3>
          <form onSubmit={submitFarmer}>
            <div className="grid-2">
              <div className="form-group">
                <label style={{fontFamily:'Heebo,sans-serif'}}>שם החקלאי (עברית) *</label>
                <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}
                  placeholder="ישראל ישראלי" style={{fontFamily:'Heebo,sans-serif',fontSize:16}} autoFocus />
              </div>
              <div className="form-group">
                <label>{t('idNumber',lang)} *</label>
                <input value={form.idNumber} onChange={e=>setForm({...form,idNumber:e.target.value})} placeholder="039444682" />
              </div>
              <div className="form-group">
                <label>{t('phone',lang)}</label>
                <input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="050-1234567" />
              </div>
              {!edit && (
                <div className="form-group">
                  <label>{ar?'كود الدخول':'קוד כניסה'}</label>
                  <div style={{background:'#f0fdf4',border:'1.5px dashed #16a34a',borderRadius:10,padding:'10px 16px',textAlign:'center',color:'#15803d',fontSize:13,fontWeight:600}}>
                    🎲 {ar?'سيُولَّد تلقائياً':'יופק אוטומטית'}
                  </div>
                </div>
              )}
            </div>
            <div className="form-group">
              <label>{t('notes',lang)}</label>
              <textarea rows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} />
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="flex-gap gap-12">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? t('saving',lang) : `💾 ${t('save',lang)}`}
              </button>
              <button type="button" className="btn btn-outline" onClick={()=>setShowForm(false)}>{t('cancel',lang)}</button>
            </div>
          </form>
        </div>
      )}

      {/* New code display */}
      {newCode && (
        <div className="card mb-16 fade-in" style={{border:'2px solid #16a34a',background:'#f0fdf4',padding:24,textAlign:'center'}}>
          <div style={{fontSize:20,marginBottom:8}}>🎉 {ar?'تمت الإضافة!':'נוסף בהצלחה!'}</div>
          <div style={{color:'var(--text-muted)',fontSize:13,marginBottom:16}}>{ar?'كود الدخول:':'קוד כניסה:'}</div>
          <div style={{display:'inline-block',background:'#fff',border:'3px solid #16a34a',borderRadius:16,padding:'16px 48px',fontSize:52,fontWeight:900,fontFamily:'monospace',letterSpacing:14,color:'#14532d'}}>
            {newCode}
          </div>
          <div style={{marginTop:14,color:'var(--text-muted)',fontSize:12}}>{ar?'احفظه وأرسله للمزارع':'שמור ושלח לחקלאי'}</div>
          <button className="btn btn-outline btn-sm" style={{marginTop:14}} onClick={()=>setNewCode(null)}>{ar?'إغلاق':'סגור'}</button>
        </div>
      )}

      {/* Farmers table */}
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
                  <th>{ar?'الاسم':'שם'}</th>
                  <th>{t('idNumber',lang)}</th>
                  <th>{ar?'الكود':'קוד'}</th>
                  <th>{t('phone',lang)}</th>
                  <th style={{color:'#dc2626',background:'#fff1f2'}}>{ar?'غير مدفوع':'יתרה'}</th>
                  <th>{t('notes',lang)}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(f => {
                  const unpaid  = calcUnpaid(f.id);
                  const isOpen  = expandedFarmer === f.id;
                  return (
                    <React.Fragment key={f.id}>
                      <tr style={{background: isOpen ? '#f0fdf4' : ''}}>
                        {/* toggle lands */}
                        <td style={{textAlign:'center'}}>
                          <button onClick={()=>toggleFarmerExpand(f.id)}
                            style={{width:26,height:26,borderRadius:6,border:'1px solid var(--border)',background:isOpen?'var(--primary)':'var(--surface-2)',color:isOpen?'#fff':'var(--text-muted)',cursor:'pointer',fontSize:12,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                            {isOpen ? '▲' : '▼'}
                          </button>
                        </td>
                        <td><strong style={{fontFamily:'Heebo,sans-serif',fontSize:15}}>{f.nameHeb||f.name}</strong></td>
                        <td><code style={{background:'var(--surface-2)',padding:'2px 8px',borderRadius:4,fontSize:12}}>{f.idNumber}</code></td>
                        <td>
                          <div style={{display:'flex',alignItems:'center',gap:5}}>
                            <code style={{background:'#f0fdf4',border:'1px solid #bbf7d0',padding:'3px 10px',borderRadius:6,fontSize:13,fontWeight:700,letterSpacing:3,color:'#15803d'}}>
                              {revealCode?.id===f.id ? revealCode.code : '••••'}
                            </code>
                            <button onClick={()=>handleRevealCode(f.id)}
                              style={{width:24,height:24,borderRadius:6,border:'1px solid var(--border)',background:'var(--surface-2)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:12}}>
                              {revealCode?.id===f.id ? '🙈' : '👁'}
                            </button>
                          </div>
                        </td>
                        <td>{f.phone||'—'}</td>
                        <td style={{textAlign:'center'}}>
                          {unpaid > 0
                            ? <span style={{background:'#fff1f2',color:'#dc2626',padding:'3px 10px',borderRadius:6,fontWeight:700,fontSize:13}}>₪{Math.round(unpaid).toLocaleString()}</span>
                            : <span style={{color:'#16a34a',fontWeight:700}}>✓</span>}
                        </td>
                        <td style={{maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:12,color:'var(--text-muted)'}}>{f.notes||'—'}</td>
                        {!isViewer && (
                          <td>
                            <div className="flex-gap gap-4">
                              <button onClick={()=>openEdit(f)}
                                style={{width:26,height:26,borderRadius:6,border:'1.5px solid var(--border)',background:'var(--surface-2)',color:'var(--primary)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:12}}
                                onMouseEnter={e=>{e.currentTarget.style.background='var(--primary)';e.currentTarget.style.color='#fff';}}
                                onMouseLeave={e=>{e.currentTarget.style.background='var(--surface-2)';e.currentTarget.style.color='var(--primary)';}}>✏</button>
                              <button onClick={()=>delFarmer(f.id,f.nameHeb||f.name)}
                                style={{width:26,height:26,borderRadius:6,border:'1.5px solid #fca5a5',background:'#fff1f2',color:'#dc2626',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:12}}
                                onMouseEnter={e=>{e.currentTarget.style.background='#dc2626';e.currentTarget.style.color='#fff';}}
                                onMouseLeave={e=>{e.currentTarget.style.background='#fff1f2';e.currentTarget.style.color='#dc2626';}}>✕</button>
                            </div>
                          </td>
                        )}
                      </tr>

                      {/* ── صف الأراضي الموسّع ── */}
                      {isOpen && (
                        <tr>
                          <td colSpan={isViewer ? 7 : 8} style={{padding:0,background:'#f8fffe'}}>
                            <div style={{padding:'12px 16px 16px',borderTop:'2px solid #bbf7d0'}}>
                              <div className="flex-between mb-8">
                                <strong style={{fontSize:13,color:'var(--primary)'}}>
                                  🌱 {ar?'أراضي':'קרקעות של'} {f.nameHeb||f.name}
                                </strong>
                                {!isViewer && (
                                  <button className="btn btn-outline btn-sm" onClick={()=>openAddLand(f.id)}>
                                    + {ar?'إضافة أرض':'הוסף קרקע'}
                                  </button>
                                )}
                              </div>

                              {/* نموذج الأرض */}
                              {landForm && (
                                <div style={{background:'#fff',border:'1.5px solid var(--primary)',borderRadius:10,padding:14,marginBottom:12}}>
                                  <h4 style={{margin:'0 0 12px'}}>{editLand ? (ar?'✏ تعديل أرض':'✏ עריכת קרקע') : (ar?'+ أرض جديدة':'+ קרקע חדשה')}</h4>
                                  <form onSubmit={submitLand}>

                                    {/* ── اختيار من القائمة أو يدوي ── */}
                                    {!editLand && (
                                      <div style={{display:'flex',gap:8,marginBottom:14}}>
                                        <button type="button"
                                          onClick={()=>{ setManualMode(false); setLandFormData(EMPTY_LAND); }}
                                          style={{flex:1,padding:'8px',borderRadius:8,border:`2px solid ${!manualMode?'var(--primary)':'var(--border)'}`,background:!manualMode?'#f0fdf4':'var(--surface-2)',fontWeight:700,fontSize:13,cursor:'pointer',color:!manualMode?'var(--primary)':'var(--text-muted)'}}>
                                          📋 {ar?'اختر من القائمة':'בחר מרשימה'}
                                        </button>
                                        <button type="button"
                                          onClick={()=>{ setManualMode(true); setLandFormData(EMPTY_LAND); }}
                                          style={{flex:1,padding:'8px',borderRadius:8,border:`2px solid ${manualMode?'var(--primary)':'var(--border)'}`,background:manualMode?'#f0fdf4':'var(--surface-2)',fontWeight:700,fontSize:13,cursor:'pointer',color:manualMode?'var(--primary)':'var(--text-muted)'}}>
                                          ✏️ {ar?'إدخال يدوي':'הזנה ידנית'}
                                        </button>
                                      </div>
                                    )}

                                    {/* ── وضع الاختيار من القائمة ── */}
                                    {!manualMode && !editLand ? (
                                      <div>
                                        <div className="form-group">
                                          <label style={{fontFamily:'Heebo,sans-serif'}}>
                                            {ar?'اختر المحطة':'בחר תחנה'} *
                                          </label>
                                          <select
                                            value={landFormData.stationNumber}
                                            onChange={e => {
                                              const selected = allLands.find(l => l.stationNumber === e.target.value && !l.farmerId);
                                              if (selected) {
                                                setLandFormData({
                                                  regionId:      selected.regionId || '',
                                                  stationNumber: selected.stationNumber,
                                                  gpsRaw:        (selected.stationLat && selected.stationLng) ? `${selected.stationLat}, ${selected.stationLng}` : '',
                                                  stationLat:    selected.stationLat || '',
                                                  stationLng:    selected.stationLng || '',
                                                  description:   selected.description || '',
                                                });
                                              } else {
                                                setLandFormData({...EMPTY_LAND, stationNumber: e.target.value});
                                              }
                                            }}
                                            style={{fontSize:15,fontFamily:'monospace',fontWeight:700}}>
                                            <option value="">{ar?'— اختر محطة —':'— בחר תחנה —'}</option>
                                            {/* تجميع حسب المنطقة */}
                                            {(() => {
                                              const available = allLands.filter(l => l.stationNumber);
                                              const grouped = available.reduce((acc, l) => {
                                                const code = l.stationNumber?.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() || '?';
                                                if (!acc[code]) acc[code] = [];
                                                acc[code].push(l);
                                                return acc;
                                              }, {});
                                              return Object.entries(grouped).sort(([a],[b])=>a.localeCompare(b)).map(([code, lands]) => (
                                                <optgroup key={code} label={`── ${code} ──`}>
                                                  {lands.map(l => {
                                                    const reg = regions.find(r => r.id === l.regionId);
                                                    return (
                                                      <option key={l.id} value={l.stationNumber}>
                                                        {l.stationNumber}
                                                        {reg?.nameHeb && reg.nameHeb !== reg.name ? ` (${reg.nameHeb})` : reg?.name ? ` (${reg.name})` : ''}
                                                        {l.stationLat ? ' 📍' : ''}
                                                      </option>
                                                    );
                                                  })}
                                                </optgroup>
                                              ));
                                            })()}
                                          </select>
                                          {allLands.filter(l=>l.stationNumber).length === 0 && (
                                            <p style={{fontSize:12,color:'#ca8a04',marginTop:6}}>
                                              ⚠️ {ar?'لا توجد محطات — استورد من KML أولاً في صفحة المناطق':'אין תחנות — ייבא KML תחילה בדף האזורים'}
                                            </p>
                                          )}
                                        </div>

                                        {/* معاينة المحطة المختارة */}
                                        {landFormData.stationNumber && (
                                          <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'10px 14px',marginBottom:12,fontSize:13}}>
                                            <div style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'center'}}>
                                              <strong style={{color:'var(--primary)',fontFamily:'monospace',fontSize:16}}>
                                                {landFormData.stationNumber}
                                              </strong>
                                              {landFormData.regionId && (
                                                <span>
                                                  📍 {regions.find(r=>r.id===landFormData.regionId)?.nameHeb || regions.find(r=>r.id===landFormData.regionId)?.name}
                                                </span>
                                              )}
                                              {landFormData.stationLat && landFormData.stationLng ? (
                                                <span style={{color:'#16a34a',fontWeight:600}}>
                                                  ✓ GPS: {parseFloat(landFormData.stationLat).toFixed(4)}, {parseFloat(landFormData.stationLng).toFixed(4)}
                                                </span>
                                              ) : (
                                                <span style={{color:'#ca8a04'}}>⚠️ {ar?'لا يوجد GPS':'אין GPS'}</span>
                                              )}
                                            </div>
                                            {landFormData.description && (
                                              <div style={{marginTop:6,fontSize:12,color:'#1e40af'}}>
                                                🏡 {landFormData.description}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      /* ── وضع الإدخال اليدوي ── */
                                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginBottom:12}}>
                                        <div className="form-group">
                                          <label style={{fontFamily:'Heebo,sans-serif'}}>עמדה (מס׳ תחנה) *</label>
                                          <input
                                            value={landFormData.stationNumber}
                                            onChange={e=>setLandFormData({...landFormData,stationNumber:e.target.value})}
                                            placeholder="A14 / B3 / FC7"
                                            style={{fontFamily:'monospace',fontWeight:900,textAlign:'center',fontSize:18,letterSpacing:3}}
                                            autoFocus={manualMode && !editLand}
                                          />
                                        </div>
                                        <div className="form-group">
                                          <label>{ar?'المنطقة':'אזור'}</label>
                                          <select value={landFormData.regionId} onChange={e=>setLandFormData({...landFormData,regionId:e.target.value})}>
                                            <option value="">{ar?'— اختر —':'— בחר —'}</option>
                                            {regions.map(r => (
                                              <option key={r.id} value={r.id}>
                                                {r.name}{r.nameHeb && r.nameHeb!==r.name ? ` — ${r.nameHeb}` : ''}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <div className="form-group">
                                          <label>📍 {ar?'الموقع (GPS)':'מיקום GPS'}</label>
                                          <input value={landFormData.gpsRaw}
                                            onChange={e=>handleGpsChange(e.target.value)}
                                            placeholder="32.123456, 35.123456"
                                            style={{fontFamily:'monospace',fontSize:12}} />
                                          {landFormData.stationLat && landFormData.stationLng && (
                                            <div style={{display:'flex',alignItems:'center',gap:8,marginTop:5}}>
                                              <span style={{fontSize:11,color:'#16a34a',flex:1}}>
                                                ✓ {parseFloat(landFormData.stationLat).toFixed(5)}, {parseFloat(landFormData.stationLng).toFixed(5)}
                                              </span>
                                              <button type="button"
                                                onClick={()=>setMapModal({lat:landFormData.stationLat,lng:landFormData.stationLng,name:landFormData.stationNumber||'📍'})}
                                                style={{background:'var(--primary)',color:'#fff',border:'none',borderRadius:6,padding:'3px 10px',fontSize:11,fontWeight:700,cursor:'pointer'}}>
                                                🗺️ {ar?'معاينة':'תצוגה מקדימה'}
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* وصف الأرض — مشترك بين الوضعين */}
                                    <div className="form-group">
                                      <label style={{fontSize:13}}>
                                        📝 {ar?'وصف الأرض (اختياري)':'תיאור התחנה (אופציונלי)'}
                                      </label>
                                      <textarea rows={2}
                                        value={landFormData.description}
                                        onChange={e=>setLandFormData({...landFormData,description:e.target.value})}
                                        placeholder={ar?'مثال: الأرض الكبيرة بجانب البئر...':'לדוג׳: השדה הגדול ליד הבאר...'}
                                        style={{fontSize:13,resize:'vertical'}} />
                                    </div>

                                    {landError && <div className="alert alert-error mb-8">{landError}</div>}
                                    <div className="flex-gap gap-8">
                                      <button type="submit" className="btn btn-primary btn-sm" disabled={savingLand}>
                                        {savingLand ? '⏳' : `💾 ${ar?'حفظ':'שמור'}`}
                                      </button>
                                      <button type="button" className="btn btn-outline btn-sm" onClick={()=>setLandForm(null)}>
                                        {ar?'إلغاء':'ביטול'}
                                      </button>
                                    </div>
                                  </form>
                                </div>
                              )}

                              {/* جدول الأراضي */}
                              {loadingLands ? (
                                <div style={{textAlign:'center',padding:20}}><div className="spinner"/></div>
                              ) : farmerLands.length === 0 ? (
                                <div style={{textAlign:'center',padding:16,color:'var(--text-muted)',fontSize:13}}>
                                  {ar?'لا توجد أراضٍ مسجلة':'אין קרקעות רשומות'} — {ar?'اضغط "إضافة أرض"':'לחץ "הוסף קרקע"'}
                                </div>
                              ) : (
                                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                                  <thead>
                                    <tr style={{background:'#e8f5e9'}}>
                                      <th style={{padding:'6px 10px',textAlign:'center',fontFamily:'Heebo,sans-serif'}}>עמדה</th>
                                      <th style={{padding:'6px 10px',textAlign:'center'}}>{ar?'المنطقة':'אזור'}</th>
                                      <th style={{padding:'6px 10px',textAlign:'right'}}>{ar?'الوصف':'תיאור'}</th>
                                      <th style={{padding:'6px 10px',textAlign:'center'}}>📍 {ar?'موقع':'מיקום'}</th>
                                      {!isViewer && <th style={{padding:'6px 10px',width:70}}></th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {farmerLands.map(l => (
                                      <tr key={l.id} style={{borderBottom:'1px solid #e5e7eb'}}>
                                        {/* עמדה */}
                                        <td style={{padding:'7px 10px',textAlign:'center'}}>
                                          {l.stationNumber
                                            ? <code style={{background:'#f0fdf4',border:'1px solid #bbf7d0',padding:'3px 12px',borderRadius:6,fontWeight:900,fontSize:15,letterSpacing:2}}>{l.stationNumber}</code>
                                            : <span style={{color:'var(--border)'}}>—</span>}
                                        </td>
                                        {/* אזור */}
                                        <td style={{padding:'7px 10px',textAlign:'center',fontSize:13}}>
                                          {(() => {
                                            const reg = regions.find(r=>r.id===l.regionId);
                                            return reg
                                              ? <span style={{background:'#f0fdf4',border:'1px solid #bbf7d0',padding:'2px 10px',borderRadius:6,fontWeight:700,color:'var(--primary)'}}>
                                                  {reg.name}
                                                  {reg.nameHeb && reg.nameHeb !== reg.name ? ` — ${reg.nameHeb}` : ''}
                                                </span>
                                              : <span style={{color:'var(--border)'}}>—</span>;
                                          })()}
                                        </td>
                                        {/* תיאור */}
                                        <td style={{padding:'7px 10px',fontSize:12,color:'#1e40af',maxWidth:200}}>
                                          {l.description
                                            ? <span style={{background:'#eff6ff',border:'1px solid #bfdbfe',padding:'2px 8px',borderRadius:6}}>
                                                🏡 {l.description}
                                              </span>
                                            : <span style={{color:'var(--border)'}}>—</span>}
                                        </td>
                                        {/* מיקום */}
                                        <td style={{padding:'7px 10px',textAlign:'center',fontSize:11}}>
                                          {l.stationLat && l.stationLng
                                            ? <a href={`https://www.google.com/maps?q=${l.stationLat},${l.stationLng}`} target="_blank" rel="noreferrer"
                                                style={{color:'var(--primary)',fontWeight:600,textDecoration:'none'}}>
                                                📍 {parseFloat(l.stationLat).toFixed(4)}, {parseFloat(l.stationLng).toFixed(4)}
                                              </a>
                                            : <span style={{color:'var(--border)'}}>—</span>}
                                        </td>
                                        {!isViewer && (
                                          <td style={{padding:'7px 10px'}}>
                                            <div className="flex-gap gap-4">
                                              <button onClick={()=>openEditLand(l)}
                                                style={{width:26,height:26,borderRadius:6,border:'1.5px solid var(--border)',background:'var(--surface-2)',color:'var(--primary)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:12}}
                                                onMouseEnter={e=>{e.currentTarget.style.background='var(--primary)';e.currentTarget.style.color='#fff';}}
                                                onMouseLeave={e=>{e.currentTarget.style.background='var(--surface-2)';e.currentTarget.style.color='var(--primary)';}}>✏</button>
                                              <button onClick={()=>delLand(l.id, l.stationNumber||'?')}
                                                style={{width:26,height:26,borderRadius:6,border:'1.5px solid #fca5a5',background:'#fff1f2',color:'#dc2626',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:12}}
                                                onMouseEnter={e=>{e.currentTarget.style.background='#dc2626';e.currentTarget.style.color='#fff';}}
                                                onMouseLeave={e=>{e.currentTarget.style.background='#fff1f2';e.currentTarget.style.color='#dc2626';}}>✕</button>
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
          {filtered.length === 0 && (
            <div className="empty-state"><span className="icon">👨‍🌾</span><p>{t('noData',lang)}</p></div>
          )}
        </div>
      )}
    </div>
  );
}
