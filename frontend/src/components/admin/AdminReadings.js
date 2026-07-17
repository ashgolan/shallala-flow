import React, { useState, useEffect, useCallback, useRef } from 'react';
import { adminAPI, regionsAPI } from '../../api';
import { useLang } from '../../contexts/LangContext';
import { t } from '../../i18n/translations';
import ReadingsTable from './ReadingsTable';
import { getPrice, getBasePrice, getVatRate } from '../../utils/pricing'; // ✅ سعر موحّد شامل الضريبة (מע"מ)
import { cupsPositive } from '../../utils/cups'; // ✅ فرق أكواب موحّد (يدعم تبديل العداد ضمن نفس الفترة)
import { getExtrasList as getExtras } from '../../utils/extras'; // ✅ إضافات موحّدة — تُستخدم برسالة واتساب

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
  // ✅ تبديلات العداد: [{ period, oldFinal, newInitial }] — period = فهرس الفترة (0-based)
  // بين readings[period] و readings[period+1]. الاستهلاك يُدمج بنفس رقم هذه الفترة.
  meterChanges: [],
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

// ✅ شباك الإضافة الجماعية على مجموعة كبيرة من المزارعين/الأراضي دفعة واحدة
function BulkExtraModal({ farmers, lands, regions, readings, onClose, onApplied, ar }) {
  const [step,      setStep]      = useState(1);
  const [title,     setTitle]     = useState('');
  const [amount,    setAmount]    = useState('');
  const [paidFully, setPaidFully] = useState(true);
  const [search,    setSearch]    = useState('');
  const [selected,  setSelected]  = useState({}); // key: farmerId_landId -> true
  const [excluded,  setExcluded]  = useState({}); // key -> true (أُزيل يدوياً من المعاينة)
  const [applying,  setApplying]  = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [result,    setResult]    = useState(null); // {success, fail}

  // ✅ لتفادي إغلاق النافذة عند السحب (تحديد نص) من الداخل للخارج
  const backdropMouseDown = useRef(false);

  const currentYear = new Date().getFullYear();

  // ✅ checkbox ثابت الحجم صراحة — حتى لا يتأثر بستايل input العام بالمشروع
  const cbStyle = { width:16, height:16, minWidth:16, flexShrink:0, accentColor:'#7c3aed', cursor:'pointer' };

  const farmerName = id => farmers.find(f=>String(f.id)===String(id))?.nameHeb
                        || farmers.find(f=>String(f.id)===String(id))?.name || '—';

  // ✅ اسم الأرض/المنطقة المعروض بجانب رقم المحطة
  const landLabel = (land) => {
    if (!land) return '—';
    if (land.regionId) {
      const reg = regions.find(r => String(r.id) === String(land.regionId));
      if (reg?.nameHeb && reg.nameHeb !== reg.name) return reg.nameHeb;
      if (reg?.name) return reg.name;
    }
    return land.description || '—';
  };

  // ✅ إجمالي الأكواب المصروفة لهذه الأرض بالسنة الحالية (بيساعد باتخاذ القرار)
  const cupsThisYear = (farmerId, landId) => {
    const r = readings.find(x => String(x.farmerId)===String(farmerId) && String(x.landId)===String(landId) && x.year===currentYear);
    if (!r) return null;
    const vals = r.readings || [];
    const changes = r.meterChanges || [];
    let total = 0;
    vals.slice(1).forEach((_, i) => { total += cupsPositive(vals, i, changes); });
    return total;
  };

  const farmersWithLands = farmers
    .map(f => ({ farmer: f, farmerLands: lands.filter(l => String(l.farmerId) === String(f.id)) }))
    .filter(x => x.farmerLands.length > 0)
    .sort((a,b) => (a.farmer.nameHeb||a.farmer.name||'').localeCompare(b.farmer.nameHeb||b.farmer.name||'','ar'));

  const filteredFarmers = farmersWithLands.filter(x => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (x.farmer.nameHeb||x.farmer.name||'').toLowerCase().includes(q);
  });

  const selectedCount = Object.values(selected).filter(Boolean).length;

  const toggleLand = (key) => setSelected(prev => ({ ...prev, [key]: !prev[key] }));

  const toggleFarmerAll = (farmerLands, checked) => {
    setSelected(prev => {
      const next = { ...prev };
      farmerLands.forEach(l => { next[`${l.farmerId}_${l.id}`] = checked; });
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected(prev => {
      const next = { ...prev };
      filteredFarmers.forEach(({ farmerLands }) => {
        farmerLands.forEach(l => { next[`${l.farmerId}_${l.id}`] = true; });
      });
      return next;
    });
  };

  const clearAll = () => setSelected({});

  // ✅ آخر قراءة مسجّلة لمزارع+أرض معينين (لإلحاق الإضافة بها)
  const latestReadingFor = (farmerId, landId) => {
    const matches = readings.filter(r => String(r.farmerId)===String(farmerId) && String(r.landId)===String(landId));
    if (matches.length === 0) return null;
    return matches.reduce((best,r) => (r.year > best.year ? r : best), matches[0]);
  };

  const previewRows = Object.keys(selected).filter(k => selected[k]).map(key => {
    const [farmerId, landId] = key.split('_');
    const land    = lands.find(l => String(l.id) === String(landId));
    const reading = latestReadingFor(farmerId, landId);
    return { key, farmerId, landId, land, reading };
  });

  // ✅ صفوف جاهزة للتطبيق (لها قراءة) — بعد استبعاد ما أزاله المستخدم يدوياً
  const applyRows   = previewRows.filter(r => r.reading && !excluded[r.key]);
  // ✅ صفوف تحذيرية (بدون أي قراءة مسجّلة) — لن تُطبَّق عليها الإضافة أبداً
  const warningRows = previewRows.filter(r => !r.reading && !excluded[r.key]);

  const applyBulk = async () => {
    if (applyRows.length === 0 || !title.trim() || !amount) return;
    if (!window.confirm(
      ar
        ? `تطبيق "${title.trim()}" (₪${amount}) على ${applyRows.length} أرض؟`
        : `להחיל "${title.trim()}" (₪${amount}) על ${applyRows.length} קרקעות?`
    )) return;
    setApplying(true); setProgress(0);
    let success = 0, fail = 0;
    for (const row of applyRows) {
      try {
        const r = row.reading;
        const newExtras = [
          ...(r.extras||[]),
          { note: title.trim(), amount: parseFloat(amount)||0, paid: paidFully ? (parseFloat(amount)||0) : 0 },
        ];
        await adminAPI.updateReading(r.id, {
          farmerId: r.farmerId, landId: r.landId, year: r.year,
          readings: r.readings, note: r.note||'',
          extras: newExtras,
          meterChanges: r.meterChanges||[],
          extra: r.extra||0, extraPaid: r.extraPaid||0, extraNote: r.extraNote||'',
        });
        success++;
      } catch(e) { console.error(e); fail++; }
      setProgress(p => p + 1);
    }
    setApplying(false);
    setResult({ success, fail });
    onApplied();
  };

  return (
    <div
      onMouseDown={(e) => { backdropMouseDown.current = (e.target === e.currentTarget); }}
      onClick={(e) => {
        if (backdropMouseDown.current && e.target === e.currentTarget && !applying) onClose();
        backdropMouseDown.current = false;
      }}
      style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:720, maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.4)' }}>

        {/* الرأس */}
        <div style={{ padding:'14px 20px', background:'#4c1d95', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:18 }}>👥</span>
            <span style={{ color:'#fff', fontWeight:800, fontSize:15 }}>
              {ar ? 'إضافة جماعية على مزارعين' : 'הוספה קבוצתית לחקלאים'}
            </span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ color:'#ddd6fe', fontSize:12 }}>{ar?`الخطوة ${step} من 3`:`שלב ${step} מתוך 3`}</span>
            {!applying && (
              <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:26, height:26, borderRadius:'50%', cursor:'pointer' }}>✕</button>
            )}
          </div>
        </div>

        {/* شريط التقدّم */}
        <div style={{ display:'flex', gap:4, padding:'10px 20px 0' }}>
          {[1,2,3].map(n => (
            <div key={n} style={{ height:4, flex:1, borderRadius:4, background: n<=step ? '#7c3aed' : '#e5e7eb' }} />
          ))}
        </div>

        <div style={{ padding:20, overflowY:'auto', flex:1 }}>

          {/* ── خطوة 1: بيانات الإضافة ── */}
          {step === 1 && (
            <div>
              <div className="form-group">
                <label>{ar?'عنوان الإضافة *':'כותרת התוספת *'}</label>
                <input value={title} onChange={e=>setTitle(e.target.value)}
                  placeholder={ar?'مثال: اشتراك خط مياه جديد':'לדוג׳: מנוי קו מים חדש'} style={{width:'100%'}} />
              </div>
              <div className="form-group">
                <label>₪ {ar?'المبلغ *':'סכום *'}</label>
                <input type="number" min="0" value={amount} onChange={e=>setAmount(e.target.value)}
                  placeholder="400" style={{width:'100%',fontWeight:700}} />
              </div>
              <div className="form-group">
                <label>{ar?'حالة الدفع':'סטטוס תשלום'}</label>
                <div style={{display:'flex',gap:8}}>
                  <button type="button" onClick={()=>setPaidFully(true)}
                    style={{flex:1,padding:'8px 0',borderRadius:8,fontWeight:700,cursor:'pointer',
                      border:`2px solid ${paidFully?'#16a34a':'#d1d5db'}`,
                      background:paidFully?'#f0fdf4':'#fff', color:paidFully?'#16a34a':'var(--text-muted)'}}>
                    ✓ {ar?'تم الدفع':'שולם'}
                  </button>
                  <button type="button" onClick={()=>setPaidFully(false)}
                    style={{flex:1,padding:'8px 0',borderRadius:8,fontWeight:700,cursor:'pointer',
                      border:`2px solid ${!paidFully?'#dc2626':'#d1d5db'}`,
                      background:!paidFully?'#fff1f2':'#fff', color:!paidFully?'#dc2626':'var(--text-muted)'}}>
                    ✕ {ar?'لم يُدفع بعد':'טרם שולם'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── خطوة 2: اختيار المزارعين والأراضي ── */}
          {step === 2 && (
            <div>
              <div style={{display:'flex',gap:8,marginBottom:10,alignItems:'center'}}>
                <input value={search} onChange={e=>setSearch(e.target.value)}
                  placeholder={ar?'🔍 بحث عن مزارع...':'🔍 חיפוש חקלאי...'} style={{flex:1}} />
                <button type="button" className="btn btn-outline btn-sm" onClick={selectAllVisible}>
                  {ar?'تحديد الكل':'בחר הכל'}
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={clearAll}>
                  {ar?'إلغاء التحديد':'נקה בחירה'}
                </button>
              </div>

              <div style={{border:'1.5px solid var(--border)',borderRadius:10,maxHeight:380,overflowY:'auto'}}>
                {/* رأس الجدول */}
                <div style={{
                  display:'grid', gridTemplateColumns:'26px 90px 1fr 100px',
                  gap:8, padding:'7px 12px', background:'#f5f3ff',
                  fontSize:11, fontWeight:800, color:'#5b21b6',
                  position:'sticky', top:0, zIndex:1, borderBottom:'1px solid #ddd6fe',
                }}>
                  <span></span>
                  <span style={{textAlign:'center'}}>{ar?'المحطة':'עמדה'}</span>
                  <span>{ar?'الأرض / المنطقة':'קרקע / אזור'}</span>
                  <span style={{textAlign:'center'}}>{ar?`كوب ${currentYear}`:`קוב ${currentYear}`}</span>
                </div>

                {filteredFarmers.length === 0 && (
                  <div style={{padding:20,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>
                    {ar?'لا توجد نتائج':'אין תוצאות'}
                  </div>
                )}

                {filteredFarmers.map(({ farmer, farmerLands }) => {
                  const allChecked  = farmerLands.every(l => selected[`${l.farmerId}_${l.id}`]);
                  const someChecked = farmerLands.some(l => selected[`${l.farmerId}_${l.id}`]);
                  return (
                    <div key={farmer.id} style={{borderBottom:'1px solid #f3f4f6'}}>
                      {/* رأس المزارع — تحديد كل أراضيه دفعة واحدة */}
                      <div style={{
                        display:'flex', alignItems:'center', gap:8,
                        padding:'9px 12px', background: someChecked ? '#f5f3ff' : '#fafafa',
                      }}>
                        <input type="checkbox" checked={allChecked}
                          ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                          onChange={e => toggleFarmerAll(farmerLands, e.target.checked)}
                          style={cbStyle} />
                        <span style={{fontWeight:800,fontSize:13,fontFamily:'Heebo,sans-serif',flex:1}}>
                          {farmer.nameHeb||farmer.name}
                        </span>
                        <span style={{fontSize:11,color:'var(--text-muted)'}}>
                          {farmerLands.length} {ar?'أرض':'קרקעות'}
                        </span>
                      </div>

                      {/* أراضي المزارع — كل أرض بصف مستقل */}
                      {farmerLands.map(l => {
                        const key = `${l.farmerId}_${l.id}`;
                        const checked = !!selected[key];
                        const cups = cupsThisYear(l.farmerId, l.id);
                        return (
                          <label key={l.id} onClick={()=>toggleLand(key)} style={{
                            display:'grid', gridTemplateColumns:'26px 90px 1fr 100px',
                            gap:8, alignItems:'center',
                            padding:'7px 12px 7px 30px', cursor:'pointer',
                            background: checked ? '#f5f3ff' : '#fff',
                            borderTop:'1px solid #f8f8f8',
                          }}>
                            <input type="checkbox" checked={checked} readOnly style={cbStyle} />
                            <code style={{
                              background:'#f0fdf4', border:'1px solid #bbf7d0', padding:'2px 6px',
                              borderRadius:5, fontWeight:900, fontSize:12, textAlign:'center',
                            }}>{l.stationNumber||'—'}</code>
                            <span style={{fontSize:12,color:'var(--text-secondary)',fontFamily:'Heebo,sans-serif'}}>
                              {landLabel(l)}
                            </span>
                            <span style={{
                              fontSize:11, fontWeight:700, textAlign:'center',
                              color: cups!=null ? '#16a34a' : 'var(--border)',
                            }}>
                              {cups!=null ? `🪣 ${Math.round(cups).toLocaleString()}` : '—'}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              <div style={{marginTop:10,fontSize:13,fontWeight:700,color:'#5b21b6'}}>
                {selectedCount} {ar?'أرض محددة':'קרקעות נבחרו'}
              </div>
            </div>
          )}

          {/* ── خطوة 3: معاينة قبل التطبيق ── */}
          {step === 3 && (
            <div>
              {result ? (
                <div style={{textAlign:'center',padding:'20px 0'}}>
                  <div style={{fontSize:40,marginBottom:10}}>{result.fail===0?'✅':'⚠️'}</div>
                  <div style={{fontWeight:800,fontSize:16,marginBottom:6}}>
                    {ar
                      ? `تم تطبيق الإضافة على ${result.success} أرض بنجاح`
                      : `התוספת הוחלה על ${result.success} קרקעות בהצלחה`}
                  </div>
                  {result.fail > 0 && (
                    <div style={{color:'#dc2626',fontSize:13,fontWeight:700}}>
                      {ar?`فشل تطبيقها على ${result.fail} أرض`:`נכשל עבור ${result.fail} קרקעות`}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:10}}>
                    {ar?`سيتم تطبيق "${title.trim()}" (₪${amount}) — `:`תוחל "${title.trim()}" (₪${amount}) — `}
                    <strong style={{color:'#5b21b6'}}>{applyRows.length}</strong> {ar?'سطر':'שורות'}
                  </div>

                  {/* الصفوف الجاهزة للتطبيق */}
                  <div style={{border:'1.5px solid var(--border)',borderRadius:10,maxHeight:220,overflowY:'auto',marginBottom:14}}>
                    {applyRows.length === 0 && (
                      <div style={{padding:16,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>
                        {ar?'لا توجد أسطر جاهزة للتطبيق':'אין שורות מוכנות להחלה'}
                      </div>
                    )}
                    {applyRows.map(row => (
                      <div key={row.key} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',borderBottom:'1px solid #f3f4f6'}}>
                        <div style={{fontSize:13}}>
                          <span style={{fontWeight:700,fontFamily:'Heebo,sans-serif'}}>{farmerName(row.farmerId)}</span>
                          <span style={{color:'var(--text-muted)'}}> — {row.land?.stationNumber||'—'}</span>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <span style={{
                            fontSize:11, padding:'2px 8px', borderRadius:6, color:'var(--text-muted)',
                            background:'var(--surface-2)',
                            textDecoration: paidFully ? 'line-through' : 'none',
                          }}>
                            {title.trim()} — ₪{amount}
                          </span>
                          <span style={{fontSize:11,color:'var(--text-muted)'}}>
                            {paidFully ? (ar?'مدفوع':'שולם') : (ar?'لم يُدفع':'לא שולם')}
                          </span>
                          <button type="button" onClick={()=>setExcluded(prev=>({...prev,[row.key]:true}))}
                            style={{width:22,height:22,borderRadius:6,border:'1.5px solid #fca5a5',background:'#fff1f2',color:'#dc2626',cursor:'pointer',fontSize:11}}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* تحذير: أراضٍ بدون أي قراءة مسجّلة */}
                  {warningRows.length > 0 && (
                    <div style={{border:'1.5px solid #fde68a',borderRadius:10,overflow:'hidden'}}>
                      <div style={{background:'#fffbeb',padding:'8px 12px',fontSize:12,fontWeight:800,color:'#92400e'}}>
                        ⚠️ {ar
                          ? `${warningRows.length} أرض بدون أي قراءة — لن تُطبَّق عليها الإضافة`
                          : `${warningRows.length} קרקעות ללא קריאה — התוספת לא תוחל עליהן`}
                      </div>
                      <div style={{maxHeight:140,overflowY:'auto'}}>
                        {warningRows.map(row => (
                          <div key={row.key} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 12px',borderTop:'1px solid #fef3c7'}}>
                            <div style={{fontSize:12}}>
                              <span style={{fontWeight:700,fontFamily:'Heebo,sans-serif'}}>{farmerName(row.farmerId)}</span>
                              <span style={{color:'var(--text-muted)'}}> — {row.land?.stationNumber||'—'}</span>
                            </div>
                            <button type="button" onClick={()=>setExcluded(prev=>({...prev,[row.key]:true}))}
                              style={{width:20,height:20,borderRadius:6,border:'1.5px solid #fde68a',background:'#fff',color:'#92400e',cursor:'pointer',fontSize:10}}>✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {applying && (
                    <div style={{marginTop:14}}>
                      <div style={{height:6,borderRadius:3,background:'#ede9fe',overflow:'hidden'}}>
                        <div style={{height:'100%',background:'#7c3aed',width:`${Math.round(progress/Math.max(1,applyRows.length)*100)}%`,transition:'width 0.2s'}}/>
                      </div>
                      <div style={{fontSize:12,color:'var(--text-muted)',marginTop:4,textAlign:'center'}}>
                        {progress} / {applyRows.length}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* الفوتر */}
        <div style={{ padding:'14px 20px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
          <button type="button" className="btn btn-outline" disabled={step===1||applying}
            onClick={()=>setStep(s=>Math.max(1,s-1))} style={{visibility: step===1?'hidden':'visible'}}>
            {ar?'رجوع':'חזור'}
          </button>
          {result ? (
            <button type="button" className="btn btn-primary" onClick={onClose}>
              {ar?'إغلاق':'סגור'}
            </button>
          ) : step < 3 ? (
            <button type="button" className="btn btn-primary"
              disabled={(step===1 && (!title.trim()||!amount)) || (step===2 && selectedCount===0)}
              onClick={()=>setStep(s=>Math.min(3,s+1))}>
              {ar?'التالي':'הבא'}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={applying||applyRows.length===0}
              onClick={applyBulk} style={{background:'#7c3aed',borderColor:'#7c3aed'}}>
              {applying ? `⏳ ${ar?'جاري التطبيق...':'מחיל...'}` : `✓ ${ar?'تطبيق نهائي':'החלה סופית'} (${applyRows.length})`}
            </button>
          )}
        </div>
      </div>
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
  // ✅ مشاريع اللجنة — تُستخدم فقط لحساب المزارعين المتأخرين بالدفع (تحذير ⚠️ بجدول القراءات)
  const [projects, setProjects] = useState([]);
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

  // ✅ شباك الإضافة الجماعية
  const [showBulkModal, setShowBulkModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fd, ld, rd, rg, pr, pd] = await Promise.all([
        adminAPI.getFarmers(),
        adminAPI.getLands(),
        adminAPI.getReadings(),
        regionsAPI.getRegions(),
        adminAPI.getPrices(),
        adminAPI.getProjects(),
      ]);
      setFarmers(fd.farmers || []);
      setLands(ld.lands || []);
      setReadings(rd.readings || []);
      setRegions(rg.regions || []);
      setPrices(pr || { globalPrice:0, yearPrices:{}, landPrices:{} });
      setProjects(pd.projects || []);
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

  // ✅ مزارعون لم يكملوا دفعهم لمشروع/مشاريع معينة — Map: farmerId -> [{ projectName, remaining }]
  const unpaidProjectsByFarmer = (() => {
    const map = {};
    projects.forEach(p => {
      (p.members || []).forEach(m => {
        if (m.amount === null || m.amount === undefined) return;
        const paid = (m.payments || []).reduce((s, pay) => s + (parseFloat(pay.amount) || 0), 0);
        const remaining = m.amount - paid;
        if (remaining > 0.01) {
          if (!map[m.farmerId]) map[m.farmerId] = [];
          map[m.farmerId].push({ projectName: p.name, remaining });
        }
      });
    });
    return map;
  })();

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
      // ✅ تحميل تبديلات العداد المخزّنة مسبقاً (كنصوص قابلة للتعديل بالحقول)
      meterChanges: (r.meterChanges||[]).map(m => ({
        period: m.period,
        oldFinal: String(m.oldFinal ?? ''),
        newInitial: String(m.newInitial ?? ''),
      })),
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
        meterChanges: (rForm.meterChanges||[]).map(m => ({
          period: m.period,
          oldFinal: parseFloat(m.oldFinal),
          newInitial: parseFloat(m.newInitial),
        })).filter(m => !isNaN(m.oldFinal) && !isNaN(m.newInitial)), // ✅ يتجاهل التبديلات غير المكتملة
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
    // ✅ عند حذف حقل قراءة، لازم نصحح فهارس تبديلات العداد كي تبقى متوافقة مع الفهرسة الجديدة
    const removedPeriod = i - 1; // الفترة المرتبطة بهذا الحقل (إن وُجدت)
    setRForm({
      ...rForm,
      readings: rForm.readings.filter((_,idx) => idx !== i),
      meterChanges: (rForm.meterChanges||[])
        .filter(m => m.period !== removedPeriod)
        .map(m => m.period > removedPeriod ? { ...m, period: m.period - 1 } : m),
    });
  };
  const updateReadingField = (i,v) => {
    const r = [...rForm.readings]; r[i] = v; setRForm({ ...rForm, readings:r });
  };

  // ✅ يبحث عن تبديل عداد مسجّل لفترة معينة ضمن النموذج الحالي
  const getMeterChangeFor = (period) => (rForm.meterChanges||[]).find(m => m.period === period);

  // ✅ تفعيل/إلغاء تبديل عداد لفترة معينة
  const toggleMeterChange = (period) => {
    setRForm(prev => {
      const existing = (prev.meterChanges||[]).find(m => m.period === period);
      if (existing) {
        return { ...prev, meterChanges: prev.meterChanges.filter(m => m.period !== period) };
      }
      return { ...prev, meterChanges: [...(prev.meterChanges||[]), { period, oldFinal:'', newInitial:'' }] };
    });
  };

  // ✅ تحديث حقل (oldFinal أو newInitial) لتبديل عداد معين
  const updateMeterChangeField = (period, field, value) => {
    setRForm(prev => ({
      ...prev,
      meterChanges: (prev.meterChanges||[]).map(m => m.period === period ? { ...m, [field]: value } : m),
    }));
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
  // (تبديل العداد يُدمج داخل نفس رقم فترته تلقائياً عبر cupsPositive — لا حاجة لأي معالجة إضافية هنا)
  const grandBeforeVat = filtered.reduce((sum, r) => {
    const vals = r.readings || [];
    const changes = r.meterChanges || [];
    return sum + vals.slice(1).reduce((s, _, i) => {
      return s + cupsPositive(vals, i, changes) * getBasePrice(prices, r.year, r.landId, i+1);
    }, 0);
  }, 0);
  const grandAfterVat = filtered.reduce((sum, r) => {
    const vals = r.readings || [];
    const changes = r.meterChanges || [];
    return sum + vals.slice(1).reduce((s, _, i) => {
      return s + cupsPositive(vals, i, changes) * getPrice(prices, r.year, r.landId, i+1);
    }, 0);
  }, 0);
  const vatPercentLabel = (getVatRate(prices) * 100).toFixed(1).replace(/\.0$/, '');

  // ✅ إجمالي الأكواب + تفصيل كل دورة (قراءة) للقراءات المعروضة حالياً
  const cupsBreakdown = (() => {
    const byPeriod = {};
    let total = 0, maxPeriods = 0;
    filtered.forEach(r => {
      const vals = r.readings || [];
      const changes = r.meterChanges || [];
      vals.slice(1).forEach((_, i) => {
        const cups = cupsPositive(vals, i, changes);
        if (cups) { byPeriod[i+1] = (byPeriod[i+1] || 0) + cups; total += cups; }
        maxPeriods = Math.max(maxPeriods, i+1);
      });
    });
    return { total, byPeriod, maxPeriods };
  })();

  // ✅ إجمالي مبلغ النموذج — يدمج تبديل العداد ضمن نفس رقم فترته (بدون انزياح بالسعر)
  const formTotalAmount = rForm.readings.slice(1).reduce((total, _, i) => {
    const change = getMeterChangeFor(i);
    const prev = parseFloat(rForm.readings[i]);
    const curr = parseFloat(rForm.readings[i+1]);
    let cups = 0;
    if (!isNaN(prev) && !isNaN(curr)) {
      if (change) {
        const of = parseFloat(change.oldFinal), ni = parseFloat(change.newInitial);
        cups = (!isNaN(of) && !isNaN(ni)) ? (of - prev) + (curr - ni) : 0;
      } else {
        cups = curr - prev;
      }
    }
    const price = getPrice(prices, rForm.year, rForm.landId, i+1);
    return total + (cups > 0 ? cups * price : 0);
  }, 0);

  // إجمالي الإضافات في النموذج
  const extrasTotal = (rForm.extras||[]).reduce((s,e)=>(s+(parseFloat(e.amount)||0)-(parseFloat(e.paid)||0)),0);

  // ✅ تحويل رقم الهاتف لصيغة دولية يفهمها رابط واتساب (wa.me) — افتراض إسرائيل (972+)
  const normalizePhone = (phone) => {
    let digits = (phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('0')) digits = '972' + digits.slice(1);
    else if (!digits.startsWith('972')) digits = '972' + digits;
    return digits;
  };

  // ✅ يبني نص كشف واتساب لمزارع واحد: تفصيل كل أرض/فترة + المبلغ الإجمالي غير المدفوع
  const buildFarmerStatement = (farmer, readingsForFarmer) => {
    let grandTotal = 0;
    const landBlocks = [];

    readingsForFarmer.forEach(r => {
      const land = lands.find(l => String(l.id) === String(r.landId));
      const stationLabel = land?.stationNumber || '';
      // ✅ اسم الأرض الوصفي (منطقة/اسم خاص) — يُعرض بجانب رقم المحطة لأن بعض
      // المزارعين لا يعرفون رقم محطتهم، بينما اسم الأرض/المنطقة مألوف لهم
      const landDisplay = landName(r.landId);
      const landLabel = (stationLabel && landDisplay && landDisplay !== stationLabel)
        ? `${stationLabel} — ${landDisplay}`
        : (stationLabel || landDisplay || '');

      const vals = r.readings || [];
      const changes = r.meterChanges || [];
      const periodLines = [];
      let landTotal = 0;

      vals.slice(1).forEach((_, i) => {
        const cups = cupsPositive(vals, i, changes);
        if (cups <= 0) return;
        const price = getPrice(prices, r.year, r.landId, i + 1);
        const amt = cups * price;
        const isPaid = !!(r.paidPeriods && r.paidPeriods[i]);
        periodLines.push(
          `   - ${ar ? 'فترة' : 'תקופה'} ${i + 1}: ${Math.round(cups).toLocaleString()} ${ar ? 'كوب' : 'קוב'} — ₪${Math.round(amt).toLocaleString()} ${isPaid ? (ar?'[مدفوع]':'[שולם]') : (ar?'[غير مدفوع]':'[לא שולם]')}`
        );
        if (!isPaid) { landTotal += amt; grandTotal += amt; }
      });

      // ✅ الإضافات غير المدفوعة لهذه الأرض
      getExtras(r).forEach(ex => {
        const amt = parseFloat(ex.amount) || 0;
        const paidAmt = parseFloat(ex.paid) || 0;
        const rem = amt - paidAmt;
        if (rem > 0.01) {
          periodLines.push(`   - ${ex.note || (ar ? 'إضافة' : 'תוספת')}: ₪${Math.round(rem).toLocaleString()} ${ar?'[غير مدفوع]':'[לא שולם]'}`);
          landTotal += rem; grandTotal += rem;
        }
      });

      if (periodLines.length > 0) {
        landBlocks.push(
          `${ar?'الأرض':'קרקע'}: ${landLabel} (${r.year})\n${periodLines.join('\n')}` +
          (landTotal > 0 ? `\n   ${ar ? 'مجموع الأرض' : 'סה"כ קרקע'}: ₪${Math.round(landTotal).toLocaleString()}` : '')
        );
      }
    });

    const farmerDisplayName = farmer.nameHeb || farmer.name || '';
    const header = `${ar ? 'مرحباً' : 'שלום'} ${farmerDisplayName}،\n${ar ? 'كشف قراءة المياه — الشلالة' : 'דו"ח קריאת מים — השלאלה'}\n`;
    const body = landBlocks.length > 0
      ? landBlocks.join('\n\n')
      : (ar ? 'لا يوجد مبلغ مستحق حالياً' : 'אין סכום לתשלום כרגע');
    const footer = grandTotal > 0
      ? `\n\n${ar ? 'الإجمالي المطلوب دفعه' : 'סה"כ לתשלום'}: ₪${Math.round(grandTotal).toLocaleString()}`
      : '';

    return `${header}\n${body}${footer}`;
  };

  // ✅ زر واتساب: يعمل فقط عند الفلترة على مزارع واحد بالتحديد (لأن الرسالة مخصصة لشخص واحد)
  const sendWhatsAppStatement = () => {
    const farmerIds = [...new Set(filtered.map(r => String(r.farmerId)))];
    if (farmerIds.length !== 1) {
      alert(ar ? 'فلتر باسم مزارع واحد فقط أولاً من الأعلى' : 'סנן קודם לפי חקלאי אחד בלבד');
      return;
    }
    const farmer = farmers.find(f => String(f.id) === farmerIds[0]);
    if (!farmer) return;
    if (!farmer.phone) {
      alert(ar ? 'لا يوجد رقم هاتف مسجل لهذا المزارع' : 'אין מספר טלפון רשום לחקלאי זה');
      return;
    }
    const text = buildFarmerStatement(farmer, filtered);
    const digits = normalizePhone(farmer.phone);
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div>
      {/* ══ شباك الإضافة الجماعية ══ */}
      {showBulkModal && (
        <BulkExtraModal
          farmers={farmers}
          lands={lands}
          regions={regions}
          readings={readings}
          ar={ar}
          onClose={() => setShowBulkModal(false)}
          onApplied={() => { load(); }}
        />
      )}

      {/* ✅ ترويسة طباعة أنيقة — تظهر فقط عند الطباعة (مخفية على الشاشة) */}
      <div className="print-letterhead">
        <div className="print-letterhead-brand">🌿 الشلالة — نظام إدارة مياه الري</div>
        <div className="print-letterhead-title">{ar ? 'كشف قراءة مياه' : 'דו"ח קריאת מים'}</div>
        {filtered.length === 1 && (
          <div className="print-letterhead-info">
            <span>{ar ? 'المزارع' : 'חקלאי'}: <strong>{farmerName(filtered[0].farmerId)}</strong></span>
            <span>{ar ? 'المحطة' : 'עמדה'}: <strong>{filtered[0].stationNumber || landName(filtered[0].landId)}</strong></span>
            <span>{ar ? 'السنة' : 'שנה'}: <strong>{filtered[0].year}</strong></span>
          </div>
        )}
        <div className="print-letterhead-date">
          {new Date().toLocaleDateString(ar ? 'ar-EG-u-nu-latn' : 'he-IL')}
        </div>
      </div>

      {/* ── ملخّص الحساب: قبل وبعد الضريبة (מע"מ) ── */}
      <div className="flex-gap gap-12 mb-16 print-summary" style={{ flexWrap:'wrap' }}>
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
      <div className="card mb-16 print-cups-card">
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
          <div className="print-cups-detail" style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
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
          <button className="btn btn-outline btn-sm" onClick={sendWhatsAppStatement}
            title={ar ? 'إرسال كشف واتساب للمزارع (فلتر بمزارع واحد أولاً)' : 'שלח דו"ח בוואטסאפ (סנן חקלאי אחד קודם)'}
            style={{ color:'#25D366', borderColor:'#25D366', display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
            <svg viewBox="0 0 32 32" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M16.004 3C9.377 3 4 8.373 4 15c0 2.24.615 4.42 1.78 6.32L4 29l7.86-1.75A11.94 11.94 0 0 0 16.004 27C22.63 27 28 21.627 28 15S22.63 3 16.004 3Zm0 21.8c-1.93 0-3.82-.52-5.47-1.5l-.39-.23-4.66 1.04 1.02-4.54-.25-.4A9.77 9.77 0 0 1 5.2 15c0-5.96 4.85-10.8 10.8-10.8 5.96 0 10.8 4.84 10.8 10.8 0 5.96-4.84 10.8-10.8 10.8Zm5.93-8.1c-.32-.16-1.9-.94-2.2-1.04-.3-.11-.51-.16-.73.16-.21.32-.84 1.04-1.03 1.25-.19.21-.38.24-.7.08-.32-.16-1.35-.5-2.57-1.6-.95-.85-1.6-1.9-1.78-2.22-.19-.32-.02-.49.14-.65.14-.14.32-.38.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.73-1.76-1-2.41-.26-.63-.53-.55-.73-.56-.19-.01-.4-.01-.62-.01-.21 0-.56.08-.86.4-.3.32-1.13 1.1-1.13 2.7 0 1.6 1.16 3.14 1.32 3.36.16.21 2.28 3.48 5.53 4.88.77.33 1.37.53 1.84.68.77.24 1.47.21 2.02.13.62-.09 1.9-.78 2.17-1.53.27-.75.27-1.4.19-1.53-.08-.13-.29-.21-.61-.37Z"/>
            </svg>
          </button>
          {!isViewer && (
            <button className="btn" style={{background:'#4c1d95',color:'#fff',border:'1.5px solid #4c1d95'}}
              onClick={() => setShowBulkModal(true)}>
              👥 {ar ? 'إضافة جماعية' : 'הוספה קבוצתית'}
            </button>
          )}
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
                  const periodIndex = i - 1; // ✅ الفترة المرتبطة بهذا الحقل (بين القراءة i-1 والقراءة i)
                  const change = i > 0 ? getMeterChangeFor(periodIndex) : null;
                  const prev  = parseFloat(rForm.readings[i-1]);
                  const curr  = parseFloat(v);
                  let cups = null;
                  if (i > 0 && v !== '' && !isNaN(prev) && !isNaN(curr)) {
                    if (change) {
                      const of = parseFloat(change.oldFinal), ni = parseFloat(change.newInitial);
                      cups = (!isNaN(of) && !isNaN(ni)) ? (of - prev) + (curr - ni) : null;
                    } else {
                      cups = curr - prev;
                    }
                  }
                  const price = i > 0 ? getPrice(prices, rForm.year, rForm.landId, i) : 0;
                  const amount = cups !== null && cups > 0 ? cups * price : null;
                  const isEmpty = v === '' || v === null;
                  return (
                    <div key={i} style={{ display:'flex', flexDirection:'column', gap:4 }}>
                      <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                        <span style={{ width:130, fontSize:13, fontWeight:700, color: i===0 ? 'var(--primary)' : 'var(--text-muted)', flexShrink:0 }}>
                          {ar ? 'قراءة' : 'קריאה'} {i+1}
                          {i===0 ? ` (${ar ? 'بداية *' : 'התחלה *'})` : ` (${ar ? 'فترة' : 'תקופה'} ${i})`}
                        </span>
                        <input type="number" step="any" value={v}
                          onChange={e => updateReadingField(i, e.target.value)}
                          placeholder={i===0 ? (ar?'مطلوب':'חובה') : (ar?'لم تؤخذ بعد':'טרם נלקחה')}
                          style={{ width:130, fontWeight:700, borderColor: i===0 && isEmpty ? '#ef4444' : (change ? '#a855f7' : '') }} />

                        {/* ✅ زر تبديل العداد — يظهر لكل فترة (من الحقل الثاني وما فوق) */}
                        {i > 0 && (
                          <button type="button" onClick={() => toggleMeterChange(periodIndex)}
                            title={ar ? 'فعّلها إذا صار تبديل/تعطّل للعداد أثناء هذه الفترة' : 'הפעל אם הוחלף המונה בתקופה זו'}
                            style={{
                              fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:8, cursor:'pointer',
                              border: change ? '1.5px solid #a855f7' : '1.5px solid var(--border)',
                              background: change ? '#f3e8ff' : '#fff',
                              color: change ? '#7c3aed' : 'var(--text-muted)',
                            }}>
                            🔄 {change ? (ar?'تبديل عداد بهذه الفترة ✓':'החלפת מונה בתקופה זו ✓') : (ar?'تبديل عداد بهذه الفترة؟':'החלפת מונה בתקופה זו?')}
                          </button>
                        )}

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

                      {/* ✅ حقول تبديل العداد — تظهر فقط عند تفعيل الزر لهذه الفترة */}
                      {change && (
                        <div style={{ marginRight:140, display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end', background:'#faf5ff', border:'1px dashed #d8b4fe', borderRadius:10, padding:'10px 12px' }}>
                          <div>
                            <label style={{ fontSize:11, color:'#7c3aed', fontWeight:700, display:'block', marginBottom:3 }}>
                              {ar ? 'آخر قراءة على العداد القديم' : 'קריאה אחרונה במונה הישן'}
                            </label>
                            <input type="number" step="any" value={change.oldFinal}
                              onChange={e => updateMeterChangeField(periodIndex, 'oldFinal', e.target.value)}
                              placeholder={ar?'مثال: 14620':'לדוג׳: 14620'}
                              style={{ width:140, fontWeight:700 }} />
                          </div>
                          <div>
                            <label style={{ fontSize:11, color:'#7c3aed', fontWeight:700, display:'block', marginBottom:3 }}>
                              {ar ? 'أول قراءة على العداد الجديد' : 'קריאה ראשונה במונה החדש'}
                            </label>
                            <input type="number" step="any" value={change.newInitial}
                              onChange={e => updateMeterChangeField(periodIndex, 'newInitial', e.target.value)}
                              placeholder={ar?'مثال: 199 أو 0':'לדוג׳: 199 או 0'}
                              style={{ width:140, fontWeight:700 }} />
                          </div>
                          <div style={{ fontSize:11, color:'#7c3aed', flex:'1 1 200px' }}>
                            💡 {ar
                              ? `الاستهلاك هذه الفترة = (إغلاق القديم − ${isNaN(prev)?'؟':prev}) + (${isNaN(curr)?'؟':curr} − بداية الجديد) — ويُحسب بسعر نفس هذه الفترة (فترة ${i}) بدون أي تغيير بترقيمها.`
                              : `הצריכה בתקופה זו = (סגירת הישן − ${isNaN(prev)?'?':prev}) + (${isNaN(curr)?'?':curr} − פתיחת החדש) — ותחושב לפי מחיר אותה תקופה (תקופה ${i}).`}
                          </div>
                        </div>
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
          unpaidProjectsByFarmer={unpaidProjectsByFarmer}
        />
      )}
    </div>
  );
}
