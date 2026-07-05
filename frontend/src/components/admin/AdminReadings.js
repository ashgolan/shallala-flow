import React, { useState, useEffect, useCallback, useRef } from 'react';
import { adminAPI, regionsAPI } from '../../api';
import { useLang } from '../../contexts/LangContext';
import { t } from '../../i18n/translations';
import ReadingsTable from './ReadingsTable';
import { getPrice, getBasePrice, getVatRate } from '../../utils/pricing'; // ✅ سعر موحّد شامل الضريبة (מע"מ)
import { cupsPositive } from '../../utils/cups'; // ✅ فرق أكواب موحّد (مجاميع فقط، بدون قيم سالبة)

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
  const dmsPattern  = /(\d{1,3})[°\u00b0]\s*(\d{1,2})['\'\u2032]\s*(\d{1,2}(?:\.\d+)?)["\"\u2033]?\s*([NS])/i;
  const dmsPattern2 = /(\d{1,3})[°\u00b0]\s*(\d{1,2})['\'\u2032]\s*(\d{1,2}(?:\.\d+)?)["\"\u2033]?\s*([EW])/i;
  const latM = s.match(dmsPattern);
  const lngM = s.match(dmsPattern2);
  if (latM && lngM) return {
    lat: dmsToDecimal(latM[1], latM[2], latM[3], latM[4]),
    lng: dmsToDecimal(lngM[1], lngM[2], lngM[3], lngM[4]),
  };
  return null;
};

const EMPTY_FORM = {
  farmerId:'', landId:'', year: new Date().getFullYear(),
  readings:['',''],
  extras: [], // ✅ مصفوفة الإضافات
  extra:'', extraPaid:'', extraNote:'',
};

// ✅ مكوّن إضافة واحدة مع autocomplete
function ExtraRow({ idx, extra, onChange, onRemove, suggestions, ar }) {
  const [showAc, setShowAc] = useState(false);
  const filtered = suggestions.filter(s => s.toLowerCase().includes((extra.note||'').toLowerCase()) && s !== extra.note);

  return (
    <div style={{background:'#fff7ed',border:'1.5px solid #fed7aa',borderRadius:10,padding:'10px 14px',display:'flex',flexDirection:'column',gap:8,position:'relative'}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontWeight:700,fontSize:13,color:'#92400e',minWidth:20}}>#{idx+1}</span>
        {/* سبب الإضافة مع autocomplete */}
        <div style={{flex:1,position:'relative'}}>
          <input
            value={extra.note||''}
            onChange={e=>onChange({...extra,note:e.target.value})}
            onFocus={()=>setShowAc(true)}
            onBlur={()=>setTimeout(()=>setShowAc(false),150)}
            placeholder={ar?'سبب الإضافة...':'סיבת התוספת...'}
            style={{width:'100%',fontSize:13}}
          />
          {/* قائمة الاقتراحات */}
          {showAc && filtered.length > 0 && (
            <div style={{position:'absolute',top:'100%',right:0,zIndex:200,background:'#fff',border:'1.5px solid #fed7aa',borderRadius:8,boxShadow:'0 4px 12px rgba(0,0,0,0.12)',minWidth:'100%',maxHeight:160,overflowY:'auto'}}>
              {filtered.map(s=>(
                <div key={s}
                  onMouseDown={()=>onChange({...extra,note:s})}
                  style={{padding:'8px 12px',cursor:'pointer',fontSize:13,fontWeight:600,color:'#92400e'}}
                  onMouseEnter={e=>e.currentTarget.style.background='#fff7ed'}
                  onMouseLeave={e=>e.currentTarget.style.background=''}>
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={onRemove}
          style={{width:26,height:26,borderRadius:6,border:'1.5px solid #fca5a5',background:'#fff1f2',color:'#dc2626',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:12,flexShrink:0}}>✕</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <div>
          <label style={{fontSize:11,color:'#92400e',fontWeight:700,display:'block',marginBottom:3}}>₪ {ar?'المبلغ':'סכום'} *</label>
          <input type="number" min="0" step="any"
            value={extra.amount||''}
            onChange={e=>onChange({...extra,amount:e.target.value})}
            placeholder="0"
            style={{width:'100%',fontSize:15,fontWeight:700,textAlign:'center'}}
          />
        </div>
        <div>
          <label style={{fontSize:11,color:'#16a34a',fontWeight:700,display:'block',marginBottom:3}}>✅ {ar?'المدفوع':'שולם'}</label>
          <input type="number" min="0" step="any"
            value={extra.paid||''}
            onChange={e=>onChange({...extra,paid:e.target.value})}
            placeholder="0"
            style={{width:'100%',fontSize:15,fontWeight:700,textAlign:'center'}}
          />
        </div>
      </div>
      {/* شريط التقدم */}
      {parseFloat(extra.amount)>0 && (
        <div>
          <div style={{height:4,borderRadius:2,background:'#fed7aa',overflow:'hidden'}}>
            <div style={{height:'100%',borderRadius:2,background:'#16a34a',width:`${Math.min(100,parseFloat(extra.paid||0)/parseFloat(extra.amount)*100)}%`,transition:'width 0.3s'}}/>
          </div>
          <div style={{fontSize:11,color:parseFloat(extra.paid||0)>=parseFloat(extra.amount)?'#16a34a':'#dc2626',fontWeight:700,marginTop:2,textAlign:'center'}}>
            {parseFloat(extra.paid||0)>=parseFloat(extra.amount)
              ? (ar?'✅ مدفوعة كاملاً':'✅ שולם במלואו')
              : `${ar?'متبقي':'נותר'}: ₪${(parseFloat(extra.amount)-parseFloat(extra.paid||0)).toLocaleString()}`}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminReadings({ adminRole='admin' }) {
  const isViewer = adminRole === 'viewer';
  const { lang } = useLang();
  const ar = lang === 'ar';

  const [farmers,  setFarmers]  = useState([]);
  const [lands,    setLands]    = useState([]);
  const [regions,  setRegions]  = useState([]);
  const [readings, setReadings] = useState([]);
  const [prices,   setPrices]   = useState({ globalPrice:0, yearPrices:{}, landPrices:{} });
  const [loading,  setLoading]  = useState(true);

  const [showRForm, setShowRForm] = useState(false);
  const [editR,     setEditR]     = useState(null);
  const rFormRef = useRef(null); // ✅ للتمرير التلقائي عند فتح نموذج التعديل/الإضافة
  const [rForm,     setRForm]     = useState(EMPTY_FORM);
  const [extrasSuggestions, setExtrasSuggestions] = useState([]); // ✅ اقتراحات

  const [filterF,        setFilterF]        = useState('');
  const [filterY,        setFilterY]        = useState('');
  const [filterR,        setFilterR]        = useState('');
  const [filterPaid,     setFilterPaid]     = useState('');
  const [farmerSearch,   setFarmerSearch]   = useState('');
  const [showFarmerList, setShowFarmerList] = useState(false);
  // ✅ بحث المزارع في النموذج
  const [formFarmerSearch,   setFormFarmerSearch]   = useState('');
  const [showFormFarmerList, setShowFormFarmerList] = useState(false);
  const [error,          setError]          = useState('');
  const [saving,         setSaving]         = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fd, ld, rd, rg, pr] = await Promise.all([
        adminAPI.getFarmers(),
        adminAPI.getLands(),
        adminAPI.getReadings(),
        regionsAPI.getRegions(),
        adminAPI.getPrices(),
      ]);
      setFarmers(fd.farmers || []);
      setLands(ld.lands || []);
      setReadings(rd.readings || []);
      setRegions(rg.regions || []);
      setPrices(pr || { globalPrice:0, yearPrices:{}, landPrices:{} });
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ✅ جمع أسماء الإضافات الموجودة للاقتراح
  const gatherSuggestions = (rdgs) => {
    const notes = [...new Set(
      rdgs.filter(r=>r.extras?.length).flatMap(r=>r.extras.map(e=>e.note)).filter(Boolean)
    )];
    setExtrasSuggestions(notes);
  };

  const farmerName = id => farmers.find(f => String(f.id) === String(id))?.nameHeb
                        || farmers.find(f => String(f.id) === String(id))?.name || '—';

  const landName = id => {
    const land = lands.find(l => String(l.id) === String(id));
    if (!land) return '—';
    if (land.regionId) {
      const reg = regions.find(r => String(r.id) === String(land.regionId));
      if (reg?.nameHeb && reg.nameHeb !== reg.name) return reg.nameHeb;
      if (reg?.name) return reg.name;
    }
    const code = land.stationNumber?.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase();
    if (code) {
      const reg = regions.find(r => r.name?.toUpperCase() === code);
      if (reg?.nameHeb && reg.nameHeb !== reg.name) return reg.nameHeb;
      if (reg?.name) return reg.name;
    }
    return land.stationNumber || '—';
  };

  const regionName = id => id ? (regions.find(r => String(r.id) === String(id))?.name || '') : '';
  const landRegion = lid => {
    const l = lands.find(x => String(x.id) === String(lid));
    return l?.regionId ? regionName(l.regionId) : '';
  };
  const years = [...new Set(readings.map(r => r.year))].sort((a,b) => b-a);
  const farmerLands = rForm.farmerId ? lands.filter(l => String(l.farmerId) === String(rForm.farmerId)) : lands;

  // ✅ يمرر الصفحة تلقائياً لأعلى نموذج القراءة (مهم عند التعديل من أسفل جدول طويل)
  const scrollToRForm = () => {
    setTimeout(() => {
      rFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const openAddR = () => {
    setEditR(null);
    setRForm(EMPTY_FORM);
    setFormFarmerSearch('');
    gatherSuggestions(readings);
    setError(''); setShowRForm(true);
    scrollToRForm();
  };

  const openEditR = r => {
    setEditR(r);
    // ✅ نضع اسم المزارع في حقل البحث
    const f = farmers.find(x=>String(x.id)===String(r.farmerId));
    setFormFarmerSearch(f ? (f.nameHeb||f.name||'') : '');
    setRForm({
      farmerId: r.farmerId, landId: r.landId, year: r.year,
      readings: [...r.readings.map(String)],
      extras: (r.extras||[]).map(e=>({note:e.note||'',amount:String(e.amount||''),paid:String(e.paid||'')})),
      extra: r.extra||'', extraPaid: r.extraPaid||'', extraNote: r.extraNote||'',
    });
    gatherSuggestions(readings);
    setError(''); setShowRForm(true);
    scrollToRForm();
  };

  const submitR = async e => {
    e.preventDefault();
    if (!rForm.farmerId || !rForm.landId) { setError(ar ? 'اختر المزارع والأرض' : 'בחר חקלאי וקרקע'); return; }
    if (!rForm.readings[0] && rForm.readings[0] !== 0) { setError(ar ? "القراءة الأولى مطلوبة" : "קריאה ראשונה חובה"); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        ...rForm,
        extras: (rForm.extras||[]).filter(e=>e.note||parseFloat(e.amount)>0).map(e=>({
          note: e.note||'', amount: parseFloat(e.amount)||0, paid: parseFloat(e.paid)||0,
        })),
      };
      if (editR) await adminAPI.updateReading(editR.id, payload);
      else       await adminAPI.createReading(payload);
      setShowRForm(false); load();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const delR = async id => {
    if (!window.confirm(ar ? 'حذف هذه القراءة؟' : 'למחוק קריאה זו?')) return;
    await adminAPI.deleteReading(id); load();
  };

  const addReadingField    = () => setRForm({ ...rForm, readings:[...rForm.readings,''] });
  const removeReadingField = i  => {
    if (rForm.readings.length <= 2) return;
    setRForm({ ...rForm, readings: rForm.readings.filter((_,idx) => idx !== i) });
  };
  const updateReadingField = (i,v) => {
    const r = [...rForm.readings]; r[i] = v; setRForm({ ...rForm, readings:r });
  };

  // ✅ إضافة/تعديل/حذف إضافة
  const addExtra    = () => setRForm({...rForm, extras:[...(rForm.extras||[]),{note:'',amount:'',paid:''}]});
  const updateExtra = (i, val) => { const ex=[...(rForm.extras||[])]; ex[i]=val; setRForm({...rForm,extras:ex}); };
  const removeExtra = i => setRForm({...rForm, extras:(rForm.extras||[]).filter((_,idx)=>idx!==i)});

  const filtered = readings.filter(r => {
    if (filterF && String(r.farmerId) !== String(filterF)) return false;
    if (filterY && r.year !== parseInt(filterY)) return false;
    if (filterR) {
      const land = lands.find(l => String(l.id) === String(r.landId));
      if (!land || String(land.regionId) !== String(filterR)) return false;
    }
    if (filterPaid === 'paid'   && !r.paid) return false;
    if (filterPaid === 'unpaid' &&  r.paid) return false;
    return true;
  });

  // ✅ إجمالي المبالغ (قبل / بعد الضريبة) للقراءات المعروضة حالياً حسب الفلاتر
  const grandBeforeVat = filtered.reduce((sum, r) => {
    const vals = r.readings || [];
    return sum + vals.slice(1).reduce((s, _, i) => {
      return s + cupsPositive(vals, i) * getBasePrice(prices, r.year, r.landId, i+1);
    }, 0);
  }, 0);
  const grandAfterVat = filtered.reduce((sum, r) => {
    const vals = r.readings || [];
    return sum + vals.slice(1).reduce((s, _, i) => {
      return s + cupsPositive(vals, i) * getPrice(prices, r.year, r.landId, i+1);
    }, 0);
  }, 0);
  const vatPercentLabel = (getVatRate(prices) * 100).toFixed(1).replace(/\.0$/, '');

  // ✅ إجمالي الأكواب + تفصيل كل دورة (قراءة) للقراءات المعروضة حالياً
  const cupsBreakdown = (() => {
    const byPeriod = {};
    let total = 0, maxPeriods = 0;
    filtered.forEach(r => {
      const vals = r.readings || [];
      vals.slice(1).forEach((_, i) => {
        const cups = cupsPositive(vals, i);
        if (cups) { byPeriod[i+1] = (byPeriod[i+1] || 0) + cups; total += cups; }
        maxPeriods = Math.max(maxPeriods, i+1);
      });
    });
    return { total, byPeriod, maxPeriods };
  })();

  const formTotalAmount = rForm.readings.slice(1).reduce((total, _, i) => {
    const prev = parseFloat(rForm.readings[i]);
    const curr = parseFloat(rForm.readings[i+1]);
    const cups = (!isNaN(prev) && !isNaN(curr)) ? curr - prev : 0;
    const price = getPrice(prices, rForm.year, rForm.landId, i+1);
    return total + (cups > 0 ? cups * price : 0);
  }, 0);

  // إجمالي الإضافات في النموذج
  const extrasTotal = (rForm.extras||[]).reduce((s,e)=>(s+(parseFloat(e.amount)||0)-(parseFloat(e.paid)||0)),0);

  return (
    <div>
      {/* ── ملخّص الحساب: قبل وبعد الضريبة (מע"מ) ── */}
      <div className="flex-gap gap-12 mb-16" style={{ flexWrap:'wrap' }}>
        <div style={{ flex:'1 1 200px', background:'var(--surface-2)', border:'1.5px solid var(--border)', borderRadius:10, padding:'10px 16px' }}>
          <div style={{ fontSize:12, color:'var(--text-muted)', fontWeight:700, marginBottom:2 }}>
            {ar ? 'الإجمالي قبل الضريبة' : 'סה"כ לפני מע"מ'}
          </div>
          <div style={{ fontSize:20, fontWeight:900, color:'var(--text-secondary)' }}>
            ₪{Math.round(grandBeforeVat).toLocaleString()}
          </div>
        </div>
        <div style={{ flex:'1 1 200px', background:'#fff7ed', border:'1.5px solid #fed7aa', borderRadius:10, padding:'10px 16px' }}>
          <div style={{ fontSize:12, color:'#92400e', fontWeight:700, marginBottom:2 }}>
            🧾 {ar ? `الإجمالي بعد الضريبة (${vatPercentLabel}%)` : `סה"כ אחרי מע"מ (${vatPercentLabel}%)`}
          </div>
          <div style={{ fontSize:20, fontWeight:900, color:'#854d0e' }}>
            ₪{Math.round(grandAfterVat).toLocaleString()}
          </div>
        </div>
      </div>

      {/* ── إجمالي الأكواب + تفصيل الدورات ── */}
      <div className="card mb-16">
        <div className="flex-between mb-12" style={{ flexWrap:'wrap', gap:8 }}>
          <h3 style={{ margin:0 }}>
            🥤 {ar ? 'إجمالي الأكواب' : 'סה"כ קובים'}
            {filterY && <span style={{ color:'var(--text-muted)', fontWeight:600, fontSize:14 }}> — {filterY}</span>}
          </h3>
          <div style={{ fontSize:24, fontWeight:900, color:'var(--primary)' }}>
            {Math.round(cupsBreakdown.total).toLocaleString()}
          </div>
        </div>
        {cupsBreakdown.maxPeriods === 0 ? (
          <p style={{ color:'var(--text-muted)', fontSize:13, textAlign:'center', padding:'8px 0' }}>
            {ar ? 'لا توجد بيانات كافية لعرض التفصيل' : 'אין מספיק נתונים להצגת פירוט'}
          </p>
        ) : (
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {Array.from({ length: cupsBreakdown.maxPeriods }, (_, idx) => idx + 1).map(p => {
              const val = cupsBreakdown.byPeriod[p] || 0;
              const pct = cupsBreakdown.total > 0 ? Math.round((val / cupsBreakdown.total) * 100) : 0;
              return (
                <div key={p} style={{ flex:'1 1 130px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px' }}>
                  <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:700, marginBottom:4 }}>
                    {ar ? `الدورة ${p}` : `תקופה ${p}`}
                  </div>
                  <div style={{ fontSize:18, fontWeight:900, color:'var(--primary-dark)', marginBottom:6 }}>
                    {Math.round(val).toLocaleString()}
                  </div>
                  <div style={{ height:6, borderRadius:3, background:'#e5e7eb', overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${pct}%`, background:'var(--primary)', borderRadius:3, transition:'width 0.3s' }}/>
                  </div>
                  <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:3, textAlign:'left' }}>{pct}%</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── شريط الفلاتر ── */}
      <div className="flex-between mb-16" style={{ flexWrap:'wrap', gap:12 }}>
        <div className="flex-gap gap-8" style={{ flexWrap:'wrap' }}>
          <div style={{ position:'relative' }}>
            <input type="text" value={farmerSearch}
              onChange={e => { setFarmerSearch(e.target.value); setShowFarmerList(true); }}
              onFocus={() => setShowFarmerList(true)}
              onBlur={() => setTimeout(() => setShowFarmerList(false), 150)}
              placeholder={filterF
                ? (farmers.find(f=>f.id===filterF)?.nameHeb || farmers.find(f=>f.id===filterF)?.name || '')
                : (ar ? '🔍 اختر مزارعاً...' : '🔍 חפש חקלאי...')}
              style={{ width:190, paddingLeft:8 }} />
            {filterF && (
              <button onClick={() => { setFilterF(''); setFarmerSearch(''); }}
                style={{ position:'absolute', left:6, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:14, lineHeight:1 }}>✕</button>
            )}
            {showFarmerList && (
              <div style={{ position:'absolute', top:'100%', right:0, zIndex:100, background:'#fff', border:'1.5px solid var(--border)', borderRadius:8, boxShadow:'0 4px 16px rgba(0,0,0,0.12)', maxHeight:220, overflowY:'auto', minWidth:220 }}>
                <div onMouseDown={() => { setFilterF(''); setFarmerSearch(''); setShowFarmerList(false); }}
                  style={{ padding:'8px 12px', fontSize:13, color:'var(--text-muted)', cursor:'pointer', borderBottom:'1px solid var(--border)' }}
                  onMouseEnter={e=>e.currentTarget.style.background='#f0fdf4'}
                  onMouseLeave={e=>e.currentTarget.style.background=''}>
                  {ar ? '— الكل —' : '— הכל —'}
                </div>
                {farmers.filter(f => { const q = farmerSearch.toLowerCase(); return !q || (f.nameHeb||f.name||'').toLowerCase().includes(q); })
                  .map(f => (
                    <div key={f.id} onMouseDown={() => { setFilterF(f.id); setFarmerSearch(''); setShowFarmerList(false); }}
                      style={{ padding:'8px 12px', fontSize:13, cursor:'pointer', fontFamily:'Heebo,sans-serif', fontWeight:600, background: filterF===f.id ? '#f0fdf4' : '' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#f0fdf4'}
                      onMouseLeave={e=>e.currentTarget.style.background=filterF===f.id?'#f0fdf4':''}>
                      {f.nameHeb || f.name}
                    </div>
                  ))}
              </div>
            )}
          </div>
          <select value={filterR} onChange={e => setFilterR(e.target.value)} style={{ width:160 }}>
            <option value="">{t('allRegions', lang)}</option>
            {regions.map(r => (
              <option key={r.id} value={r.id}>{r.name}{r.nameHeb && r.nameHeb !== r.name ? ` — ${r.nameHeb}` : ''}</option>
            ))}
          </select>
          <select value={filterY} onChange={e => setFilterY(e.target.value)} style={{ width:130 }}>
            <option value="">{t('allYears', lang)}</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={filterPaid} onChange={e => setFilterPaid(e.target.value)} style={{ width:150 }}>
            <option value="">{ar ? 'الكل' : 'הכל'}</option>
            <option value="paid">{ar ? '✅ مدفوع فقط' : '✅ שולם בלבד'}</option>
            <option value="unpaid">{ar ? '❌ غير مدفوع' : '❌ לא שולם'}</option>
          </select>
        </div>
        <div className="flex-gap gap-8">
          <button className="btn btn-outline btn-sm" onClick={() => window.print()}>🖨️</button>
          {!isViewer && <button className="btn btn-primary" onClick={openAddR}>+ {ar ? 'إضافة قراءة' : 'הוסף קריאה'}</button>}
        </div>
      </div>

      {error && <div className="alert alert-error mb-16">{error}</div>}

      {/* ══ نموذج القراءة ══ */}
      {showRForm && (
        <div ref={rFormRef} className="card mb-16 fade-in-fast" style={{ border:'2px solid var(--primary)', scrollMarginTop: 16 }}>
          <h3 className="mb-16">
            {editR ? `✏️ ${ar ? 'تعديل قراءة' : 'עריכת קריאה'}` : `+ ${ar ? 'إضافة قراءة' : 'הוסף קריאה'}`}
          </h3>
          <form onSubmit={submitR}>
            <div className="grid-3">
              <div className="form-group" style={{position:'relative'}}>
                <label>{ar ? 'المزارع *' : 'חקלאי *'}</label>
                <input
                  value={formFarmerSearch}
                  onChange={e => { setFormFarmerSearch(e.target.value); setShowFormFarmerList(true); }}
                  onFocus={() => setShowFormFarmerList(true)}
                  onBlur={() => setTimeout(() => setShowFormFarmerList(false), 150)}
                  placeholder={ar ? '🔍 ابحث باسم المزارع...' : '🔍 חפש חקלאי...'}
                  style={{width:'100%', borderColor: !rForm.farmerId && formFarmerSearch ? '#ef4444' : ''}}
                  autoComplete="off"
                />
                {/* اسم المزارع المختار */}
                {rForm.farmerId && (
                  <div style={{fontSize:11,color:'#16a34a',fontWeight:700,marginTop:3}}>
                    ✓ {farmers.find(f=>f.id===rForm.farmerId)?.nameHeb||farmers.find(f=>f.id===rForm.farmerId)?.name||''}
                  </div>
                )}
                {/* قائمة البحث */}
                {showFormFarmerList && (
                  <div style={{position:'absolute',top:'100%',right:0,zIndex:200,background:'#fff',border:'1.5px solid var(--border)',borderRadius:8,boxShadow:'0 4px 16px rgba(0,0,0,0.12)',maxHeight:240,overflowY:'auto',minWidth:'100%',width:'max-content'}}>
                    {farmers
                      .filter(f => {
                        const q = formFarmerSearch.toLowerCase();
                        return !q || (f.nameHeb||f.name||'').toLowerCase().includes(q) || (f.lastName||'').toLowerCase().includes(q) || (f.firstName||'').toLowerCase().includes(q);
                      })
                      .sort((a,b) => (a.lastName||'').localeCompare(b.lastName||'','ar'))
                      .map(f => (
                        <div key={f.id}
                          onMouseDown={() => {
                            setRForm(prev => ({ ...prev, farmerId: f.id, landId: '' }));
                            setFormFarmerSearch(f.nameHeb || f.name || '');
                            setShowFormFarmerList(false);
                          }}
                          style={{padding:'9px 14px',cursor:'pointer',fontFamily:'Heebo,sans-serif',fontWeight:600,fontSize:13,background:rForm.farmerId===f.id?'#f0fdf4':'',borderBottom:'1px solid #f3f4f6'}}
                          onMouseEnter={e=>e.currentTarget.style.background='#f0fdf4'}
                          onMouseLeave={e=>e.currentTarget.style.background=rForm.farmerId===f.id?'#f0fdf4':''}>
                          {f.nameHeb || f.name}
                          {f.phone && <span style={{fontSize:11,color:'var(--text-muted)',marginRight:8}}>{f.phone}</span>}
                        </div>
                      ))}
                    {farmers.filter(f=>{const q=formFarmerSearch.toLowerCase();return !q||(f.nameHeb||f.name||'').toLowerCase().includes(q)||(f.lastName||'').toLowerCase().includes(q);}).length === 0 && (
                      <div style={{padding:'12px 14px',color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>
                        {ar?'لا توجد نتائج':'אין תוצאות'}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>{ar ? 'المحطة *' : 'תחנה *'}</label>
                <select value={rForm.landId} onChange={e => setRForm({ ...rForm, landId: e.target.value })} disabled={!rForm.farmerId}>
                  <option value="">{rForm.farmerId ? `— ${ar ? 'اختر محطة' : 'בחר תחנה'} —` : `— ${ar ? 'اختر المزارع أولاً' : 'בחר חקלאי תחילה'} —`}</option>
                  {farmerLands.map(l => (
                    <option key={l.id} value={l.id}>
                      {(() => {
                        const reg = regions.find(r => String(r.id) === String(l.regionId));
                        const regName = reg?.nameHeb && reg.nameHeb !== reg.name ? reg.nameHeb : reg?.name || '';
                        return `${l.stationNumber}${regName ? ` — ${regName}` : ''}`;
                      })()}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>{t('year', lang)} *</label>
                <input type="number" value={rForm.year} onChange={e => setRForm({ ...rForm, year: e.target.value })} min={2000} max={2100} />
              </div>
            </div>

            {/* القراءات */}
            <div className="form-group">
              <label>{ar ? 'القراءات' : 'קריאות'}</label>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {rForm.readings.map((v,i) => {
                  const prev  = parseFloat(rForm.readings[i-1]);
                  const curr  = parseFloat(v);
                  const cups  = i > 0 && !isNaN(prev) && !isNaN(curr) && v !== '' ? curr - prev : null;
                  const price = i > 0 ? getPrice(prices, rForm.year, rForm.landId, i) : 0;
                  const amount = cups !== null && cups > 0 ? cups * price : null;
                  const isEmpty = v === '' || v === null;
                  return (
                    <div key={i} style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                      <span style={{ width:130, fontSize:13, fontWeight:700, color: i===0 ? 'var(--primary)' : 'var(--text-muted)', flexShrink:0 }}>
                        {ar ? 'قراءة' : 'קריאה'} {i+1}
                        {i===0 ? ` (${ar ? 'بداية *' : 'התחלה *'})` : ` (${ar ? 'فترة' : 'תקופה'} ${i})`}
                      </span>
                      <input type="number" step="any" value={v}
                        onChange={e => updateReadingField(i, e.target.value)}
                        placeholder={i===0 ? (ar?'مطلوب':'חובה') : (ar?'لم تؤخذ بعد':'טרם נלקחה')}
                        style={{ width:130, fontWeight:700, borderColor: i===0 && isEmpty ? '#ef4444' : '' }} />
                      {cups !== null && (
                        <span style={{ fontSize:12, fontWeight:700, minWidth:90, color:cups>=0?'#16a34a':'#dc2626', background:cups>=0?'#f0fdf4':'#fff1f2', border:`1px solid ${cups>=0?'#bbf7d0':'#fca5a5'}`, padding:'2px 10px', borderRadius:6 }}>
                          {cups >= 0 ? `🪣 ${cups}` : `⚠️ ${cups}`} {ar ? 'م³' : 'קוב'}
                        </span>
                      )}
                      {amount !== null && (
                        <span style={{ fontSize:12, fontWeight:700, color:'#854d0e', background:'#fef9c3', border:'1px solid #fde047', padding:'2px 10px', borderRadius:6 }}>
                          💰 ₪{Math.round(amount).toLocaleString()}
                        </span>
                      )}
                      {i >= 2 && (
                        <button type="button" onClick={() => removeReadingField(i)}
                          style={{ width:26, height:26, borderRadius:6, border:'1.5px solid #fca5a5', background:'#fff1f2', color:'#dc2626', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:13 }}>✕</button>
                      )}
                    </div>
                  );
                })}
                <button type="button" onClick={addReadingField} className="btn btn-outline btn-sm" style={{ width:'fit-content', marginTop:4 }}>
                  + {ar ? 'إضافة فترة' : 'הוסף תקופה'}
                </button>
              </div>
              {formTotalAmount > 0 && (
                <div style={{ marginTop:14, background:'linear-gradient(135deg,#14532d,#166534)', borderRadius:10, padding:'10px 18px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ color:'#a3e635', fontWeight:700, fontSize:13 }}>💰 {ar ? 'مجموع الأكواب:' : 'סה"כ קובים:'}</span>
                  <span style={{ color:'#fde68a', fontWeight:900, fontSize:20 }}>₪{Math.round(formTotalAmount).toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* ✅ قسم الإضافات المتعددة */}
            <div style={{ background:'#fffbeb', border:'1.5px solid #fde68a', borderRadius:12, padding:'14px 16px', marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                <h4 style={{ margin:0, fontSize:14, color:'#92400e' }}>
                  ➕ {ar ? 'الإضافات' : 'תוספות'}
                  {(rForm.extras||[]).length > 0 && (
                    <span style={{ marginRight:8, background:'#fed7aa', color:'#92400e', borderRadius:8, padding:'1px 8px', fontSize:12 }}>
                      {(rForm.extras||[]).length}
                    </span>
                  )}
                </h4>
                <button type="button" onClick={addExtra}
                  style={{ padding:'5px 14px', borderRadius:8, border:'1.5px solid #f59e0b', background:'#fff', color:'#92400e', cursor:'pointer', fontWeight:700, fontSize:12 }}>
                  + {ar ? 'إضافة جديدة' : 'תוספת חדשה'}
                </button>
              </div>

              {(rForm.extras||[]).length === 0 ? (
                <div style={{ textAlign:'center', color:'#d97706', fontSize:12, padding:'8px 0' }}>
                  {ar ? 'لا توجد إضافات — اضغط + لإضافة' : 'אין תוספות — לחץ + להוסיף'}
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {(rForm.extras||[]).map((ex,i)=>(
                    <ExtraRow key={i} idx={i} extra={ex}
                      onChange={val=>updateExtra(i,val)}
                      onRemove={()=>removeExtra(i)}
                      suggestions={extrasSuggestions}
                      ar={ar}
                    />
                  ))}
                  {/* إجمالي الإضافات */}
                  {(rForm.extras||[]).length > 1 && (
                    <div style={{ background:'#92400e', borderRadius:8, padding:'8px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ color:'#fde68a', fontWeight:700, fontSize:13 }}>
                        {ar ? 'إجمالي الإضافات المتبقية:' : 'סה"כ תוספות שנותרו:'}
                      </span>
                      <span style={{ color:'#fff', fontWeight:900, fontSize:18 }}>₪{extrasTotal.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && <div className="alert alert-error">{error}</div>}
            <div className="flex-gap gap-12">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? t('saving', lang) : `💾 ${t('save', lang)}`}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setShowRForm(false)}>
                {t('cancel', lang)}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ══ جدول القراءات ══ */}
      {loading ? (
        <div style={{ textAlign:'center', padding:40 }}><div className="spinner" /></div>
      ) : (
        <ReadingsTable
          readings={filtered}
          setReadings={setReadings}
          farmerName={farmerName}
          landName={landName}
          landRegion={landRegion}
          onEdit={openEditR}
          onDelete={delR}
          lang={lang}
          prices={prices}
          isViewer={isViewer}
          lands={lands}
          regions={regions}
        />
      )}
    </div>
  );
}