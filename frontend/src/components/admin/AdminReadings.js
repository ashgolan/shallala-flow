import React, { useState, useEffect, useCallback } from 'react';
import { adminAPI, regionsAPI } from '../../api';
import { useLang } from '../../contexts/LangContext';
import { t } from '../../i18n/translations';
import ReadingsTable from './ReadingsTable';

// تحويل DMS الصحيح إلى Decimal
// مثال: 33°14'17.96"N → 33.238322
const dmsToDecimal = (deg, min, sec, dir) => {
  let dd = parseFloat(deg) + parseFloat(min)/60 + parseFloat(sec)/3600;
  if (/[SW]/i.test(dir)) dd = -dd;
  return parseFloat(dd.toFixed(6));
};

const parseGoogleCoords = (raw) => {
  if (!raw || raw.trim().length < 3) return null;
  const s = raw.trim();

  // 1. تنسيق Decimal: "33.238322, 35.711053" أو "33.238322 35.711053"
  const decMatch = s.match(/^(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)$/);
  if (decMatch) {
    return { lat: parseFloat(decMatch[1]), lng: parseFloat(decMatch[2]) };
  }

  // 2. تنسيق DMS: 33°14'17.96"N 35°42'39.79"E
  // يدعم: ° ' " أو unicode variants أو مسافات
  const dmsPattern = /(\d{1,3})[°\u00b0]\s*(\d{1,2})['\'\u2032]\s*(\d{1,2}(?:\.\d+)?)["\"\u2033]?\s*([NS])/i;
  const dmsPattern2 = /(\d{1,3})[°\u00b0]\s*(\d{1,2})['\'\u2032]\s*(\d{1,2}(?:\.\d+)?)["\"\u2033]?\s*([EW])/i;

  const latM = s.match(dmsPattern);
  const lngM = s.match(dmsPattern2);

  if (latM && lngM) {
    return {
      lat: dmsToDecimal(latM[1], latM[2], latM[3], latM[4]),
      lng: dmsToDecimal(lngM[1], lngM[2], lngM[3], lngM[4]),
    };
  }

  return null;
};


export default function AdminReadings({ adminRole='admin' }) {
  const isViewer = adminRole === 'viewer';
  const { lang } = useLang();
  const [farmers, setFarmers]   = useState([]);
  const [lands, setLands]       = useState([]);
  const [regions, setRegions]   = useState([]);
  const [readings, setReadings] = useState([]);
  const [prices, setPrices]     = useState({ globalPrice:0, yearPrices:{}, landPrices:{} });
  const [loading, setLoading]   = useState(true);
  const [showRForm, setShowRForm] = useState(false);
  const [showLForm, setShowLForm] = useState(false);
  const [editR, setEditR]       = useState(null);
  const [rForm, setRForm]       = useState({ farmerId:'', landId:'', year:new Date().getFullYear(), readings:['',''], extra:'', extraPaid:'', extraNote:'' });
  const [lForm, setLForm] = useState({ regionId:"", name:"" });
  const [editLand, setEditLand] = useState(null);
  const [filterF, setFilterF]   = useState('');
  const [filterPaid, setFilterPaid] = useState('');
  const ar = lang === 'ar';
  const [filterY, setFilterY]   = useState('');
  const [filterR, setFilterR]   = useState('');
  const [error, setError]       = useState('');
  const [saving, setSaving]     = useState(false);

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

  const farmerName = id => farmers.find(f => String(f.id) === String(id))?.name || '—';
  const landName   = id => lands.find(l => String(l.id) === String(id))?.name || '—';
  const regionName = id => id ? (regions.find(r => String(r.id) === String(id))?.name || '') : '';
  const landRegion = lid => { const l = lands.find(x => String(x.id) === String(lid)); return l?.regionId ? regionName(l.regionId) : ''; };
  const years = [...new Set(readings.map(r => r.year))].sort((a,b) => b-a);

  // ── Reading form ──
  const openAddR = () => {
    setEditR(null);
    setRForm({ farmerId:'', landId:'', year:new Date().getFullYear(), readings:['',''], extra:'', extraPaid:'', extraNote:'' });
    setError(''); setShowRForm(true);
  };
  const openEditR = r => {
    setEditR(r);
    setRForm({ farmerId:r.farmerId, landId:r.landId, year:r.year, readings:[...r.readings.map(String)], extra:r.extra||'', extraPaid:r.extraPaid||'', extraNote:r.extraNote||'' });
    setError(''); setShowRForm(true);
  };
  const submitR = async e => {
    e.preventDefault();
    if (!rForm.farmerId || !rForm.landId) { setError(lang==='ar'?'اختر المزارع والأرض':'בחר חקלאי וקרקע'); return; }
    if (rForm.readings.some(r => r === '')) { setError(lang==='ar'?'أدخل جميع القراءات':'הזן את כל הקריאות'); return; }
    setSaving(true); setError('');
    try {
      if (editR) await adminAPI.updateReading(editR.id, rForm);
      else await adminAPI.createReading(rForm);
      setShowRForm(false); load();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };
  const delR = async id => {
    if (!window.confirm(lang==='ar'?'حذف هذه القراءة؟':'למחוק קריאה זו?')) return;
    await adminAPI.deleteReading(id); load();
  };

  // ── Land form — اسم عبري فقط، بدون ربط بمزارع ──
  const openEditLand = l => {
    setEditLand(l);
    setLForm({ regionId: l.regionId||'', name: l.name||'' });
    setShowLForm(true);
    setError('');
  };

  const submitL = async e => {
    e.preventDefault();
    if (!lForm.name.trim()) { setError(lang==='ar'?'أدخل اسم الأرض':'הזן שם קרקע'); return; }
    setSaving(true); setError('');
    try {
      if (editLand) {
        await adminAPI.updateLand(editLand.id, {
          regionId: lForm.regionId || null,
          name: lForm.name.trim(),
          nameHeb: lForm.name.trim(),
        });
      } else {
        await adminAPI.createLand({
          regionId: lForm.regionId || null,
          name: lForm.name.trim(),
          nameHeb: lForm.name.trim(),
        });
      }
      setLForm({ regionId:'', name:'' });
      setEditLand(null);
      setShowLForm(false); load();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };
  const delL = async (id, name) => {
    if (!window.confirm(`${lang==='ar'?'حذف الأرض':'מחיקת קרקע'} "${name}"?`)) return;
    await adminAPI.deleteLand(id); load();
  };

  const addReadingField    = () => setRForm({ ...rForm, readings:[...rForm.readings,''] });
  const removeReadingField = i  => { if(rForm.readings.length<=2) return; setRForm({...rForm,readings:rForm.readings.filter((_,idx)=>idx!==i)}); };
  const updateReadingField = (i,v) => { const r=[...rForm.readings]; r[i]=v; setRForm({...rForm,readings:r}); };

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

  return (
    <div>
      {/* Filters + actions */}
      <div className="flex-between mb-16" style={{ flexWrap:'wrap', gap:12 }}>
        <div className="flex-gap gap-8" style={{ flexWrap:'wrap' }}>
          <select value={filterF} onChange={e => setFilterF(e.target.value)} style={{ width:180 }}>
            <option value="">{t('allFarmers', lang)}</option>
            {farmers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <select value={filterR} onChange={e => setFilterR(e.target.value)} style={{ width:160 }}>
            <option value="">{t('allRegions', lang)}</option>
            {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select value={filterY} onChange={e => setFilterY(e.target.value)} style={{ width:130 }}>
            <option value="">{t('allYears', lang)}</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={filterPaid} onChange={e => setFilterPaid(e.target.value)} style={{ width:150 }}>
            <option value="">{ar?'الكل (مدفوع + غير)':'הכל'}</option>
            <option value="paid">{ar?'✅ مدفوع فقط':'✅ שולם בלבד'}</option>
            <option value="unpaid">{ar?'❌ غير مدفوع':'❌ לא שולם'}</option>
          </select>
        </div>
        <div className="flex-gap gap-8">
          <button className="btn btn-outline btn-sm" onClick={() => window.print()} title={ar?'طباعة':'הדפסה'}>
            🖨️
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => { setShowLForm(v=>!v); setError(''); }}>
            🌾 {showLForm ? t('cancel',lang) : (lang==='ar'?'+ أرض جديدة':'+ קרקע חדשה')}
          </button>
          {!isViewer && <button className="btn btn-primary" onClick={openAddR}>
            + {lang==='ar'?'إضافة قراءة':'הוסף קריאה'}
          </button>}
        </div>
      </div>

      {error && <div className="alert alert-error mb-16">{error}</div>}

      {/* ══ نموذج الأرض — عبري فقط، مستقلة ══ */}
      {showLForm && (
        <div className="card mb-16 fade-in-fast" style={{ border:'2px solid var(--lime-500)' }}>
          <h3 className="mb-4" style={{ fontFamily:'Heebo, sans-serif' }}>
            🌾 {editLand ? (lang==='ar'?'تعديل أرض':'עריכת קרקע') : (lang==='ar'?'إضافة أرض':'הוספת קרקע')}
          </h3>
          <p style={{ color:'var(--text-muted)', fontSize:13, marginBottom:16 }}>
            {lang==='ar'
              ? 'الأراضي قائمة مستقلة — يتم ربطها بالمزارع عند إضافة القراءة'
              : 'הקרקעות רשימה עצמאית — מקושרות לחקלאי בעת הוספת קריאה'}
          </p>
          <form onSubmit={submitL}>
            <div className="grid-2">
              <div className="form-group">
                <label style={{ fontFamily:'Heebo, sans-serif' }}>שם הקרקע (עברית) *</label>
                <input
                  value={lForm.name}
                  onChange={e => setLForm({...lForm, name:e.target.value})}
                  placeholder="חלקת הצפון"
                  style={{ fontFamily:'Heebo, sans-serif', fontSize:16, fontWeight:700 }}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>📍 {t('region', lang)}</label>
                <select value={lForm.regionId} onChange={e => setLForm({...lForm,regionId:e.target.value})}>
                  <option value="">— {lang==='ar'?'اختر المنطقة':'בחר אזור'} —</option>
                  {regions.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="flex-gap gap-8">
              <button type="submit" className="btn btn-accent btn-sm" disabled={saving}>
                💾 {t('save', lang)}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowLForm(false)}>
                {t('cancel', lang)}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ══ نموذج القراءة ══ */}
      {showRForm && (
        <div className="card mb-16 fade-in-fast" style={{ border:'2px solid var(--primary)' }}>
          <h3 className="mb-16">
            {editR ? `✏️ ${lang==='ar'?'تعديل قراءة':'עריכת קריאה'}` : `+ ${lang==='ar'?'إضافة قراءة':'הוסף קריאה'}`}
          </h3>
          <form onSubmit={submitR}>
            <div className="grid-3">
              <div className="form-group">
                <label>{lang==='ar'?'المزارع *':'חקלאי *'}</label>
                <select value={rForm.farmerId} onChange={e => setRForm({...rForm,farmerId:e.target.value})}>
                  <option value="">— {lang==='ar'?'اختر':'בחר'} —</option>
                  {farmers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>{lang==='ar'?'الأرض *':'קרקע *'}</label>
                {/* ✅ كل الأراضي بدون فلتر بالمزارع */}
                <select value={rForm.landId} onChange={e => setRForm({...rForm,landId:e.target.value})}>
                  <option value="">— {lang==='ar'?'اختر':'בחר'} —</option>
                  {lands.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name}{regionName(l.regionId) ? ` — ${regionName(l.regionId)}` : ''}
                    </option>
                  ))}
                </select>
                {lands.length === 0 && (
                  <p style={{ fontSize:12, color:'var(--red-500)', marginTop:4 }}>
                    ⚠️ {lang==='ar'?'لا توجد أراضٍ — أضف أرضاً أولاً':'אין קרקעות — הוסף קרקע תחילה'}
                  </p>
                )}
              </div>
              <div className="form-group">
                <label>{t('year', lang)} *</label>
                <input type="number" value={rForm.year}
                  onChange={e => setRForm({...rForm,year:e.target.value})} min={2000} max={2100} />
              </div>

            </div>



            {rForm.landId && (
              <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', padding:'8px 14px', borderRadius:8, marginBottom:16, fontSize:13 }}>
                {landRegion(rForm.landId) && <span style={{color:'var(--primary)',fontWeight:700,marginLeft:12}}>📍 {t('region',lang)}: {landRegion(rForm.landId)}</span>}
                {(() => {
                  const land = lands.find(l => l.id === rForm.landId);
                  return land?.stationNumber
                    ? <span style={{marginRight:12,fontWeight:700,color:'var(--primary-dark)'}}> | עמדה: <code style={{background:'white',border:'1px solid #bbf7d0',padding:'1px 8px',borderRadius:5}}>{land.stationNumber}</code></span>
                    : null;
                })()}
                {(() => {
                  const land = lands.find(l => l.id === rForm.landId);
                  return land?.stationLat && land?.stationLng
                    ? <span style={{fontSize:11,color:'#16a34a',marginRight:8}}>  ✓ GPS: {parseFloat(land.stationLat).toFixed(4)}, {parseFloat(land.stationLng).toFixed(4)}</span>
                    : <span style={{fontSize:11,color:'#f59e0b',marginRight:8}}>  ⚠ {ar?'لا يوجد موقع GPS — أضفه في صفحة المزارعين':'אין מיקום GPS — הוסף בדף החקלאים'}</span>;
                })()}
              </div>
            )}

            <div className="form-group">
              <label>
                {lang==='ar'
                  ? 'القراءات (الأولى = بداية، التالية = قراءات الفترات)'
                  : 'קריאות (ראשונה = התחלה, הבאות = קריאות תקופה)'}
              </label>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {rForm.readings.map((v,i) => (
                  <div key={i} style={{ display:'flex', gap:10, alignItems:'center' }}>
                    <span style={{ width:130, fontSize:13, fontWeight:700, color:'var(--text-muted)', flexShrink:0 }}>
                      {lang==='ar'?'قراءة':'קריאה'} {i+1}{i===0?` (${lang==='ar'?'أولى':'ראשונה'})`:''}
                    </span>
                    <input type="number" step="any" value={v}
                      onChange={e => updateReadingField(i,e.target.value)}
                      placeholder={`${lang==='ar'?'القراءة':'קריאה'} ${i+1}`}
                      style={{ maxWidth:180 }} />
                    {rForm.readings.length > 2 && (
                      <button type="button" className="btn btn-danger btn-sm btn-icon" onClick={() => removeReadingField(i)}>✕</button>
                    )}
                    {i > 0 && rForm.readings[i-1] !== '' && v !== '' && (
                      <span style={{ fontSize:13, color:'var(--primary)', fontWeight:700 }}>
                        {lang==='ar'?'الفرق':'הפרש'}: {(parseFloat(v)-parseFloat(rForm.readings[i-1])).toFixed(2)} {t('cups',lang)}
                      </span>
                    )}
                  </div>
                ))}
                <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf:'flex-start' }} onClick={addReadingField}>
                  {t('addReadingField', lang)}
                </button>
              </div>
            </div>

            {/* إضافات */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:10, background:'#fff8e1', borderRadius:10, padding:'12px 16px', marginBottom:0 }}>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label style={{ fontSize:13 }}>💰 {ar?'مبلغ إضافي (₪)':'תוספת (₪)'}</label>
                <input
                  type="number" step="any" min="0"
                  value={rForm.extra}
                  onChange={e => setRForm({...rForm, extra:e.target.value})}
                  placeholder="0"
                  style={{ fontWeight:700 }}
                />
              </div>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label style={{ fontSize:13 }}>📝 {ar?'سبب الإضافة':'סיבת התוספת'}</label>
                <input
                  value={rForm.extraNote}
                  onChange={e => setRForm({...rForm, extraNote:e.target.value})}
                  placeholder={ar?'مثال: غرامة، صيانة...':'לדוג: קנס, תחזוקה...'}
                />
              </div>
            </div>
            {rForm.extra > 0 && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, background:'#f0fdf4', borderRadius:8, padding:'10px 16px', marginTop:8 }}>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label style={{ fontSize:13 }}>✅ {ar?'المبلغ المدفوع منها (₪)':'שולם (₪)'}</label>
                  <input
                    type="number" step="any" min="0"
                    max={rForm.extra}
                    value={rForm.extraPaid}
                    onChange={e => setRForm({...rForm, extraPaid:e.target.value})}
                    placeholder="0"
                    style={{ fontWeight:700 }}
                  />
                </div>
                <div style={{ display:'flex', alignItems:'center', paddingTop:20 }}>
                  {rForm.extraPaid > 0 && rForm.extra > 0 && (
                    <span style={{ fontSize:13, fontWeight:700, color: parseFloat(rForm.extraPaid)>=parseFloat(rForm.extra) ? '#16a34a' : '#ca8a04' }}>
                      {parseFloat(rForm.extraPaid) >= parseFloat(rForm.extra)
                        ? `✅ ${ar?'مدفوع كاملاً':'שולם במלואו'}`
                        : `⚠️ ${ar?'متبقي':'נותר'}: ₪${(parseFloat(rForm.extra)-parseFloat(rForm.extraPaid)).toFixed(2)}`}
                    </span>
                  )}
                </div>
              </div>
            )}

            {error && <div className="alert alert-error">{error}</div>}
            <div className="flex-gap gap-12">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? t('saving',lang) : `💾 ${t('save',lang)}`}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setShowRForm(false)}>
                {t('cancel',lang)}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ══ جدول الأراضي ══ */}
      <details className="card mb-16">
        <summary style={{ cursor:'pointer', fontWeight:700, color:'var(--primary)', listStyle:'none', display:'flex', justifyContent:'space-between', alignItems:'center', padding:4 }}>
          <span>🌾 {lang==='ar'?'جميع الأراضي':'כל הקרקעות'} ({lands.length})</span>
          <span style={{ fontSize:12 }}>▼</span>
        </summary>
        <div className="tbl-wrap mt-16">
          <table>
            <thead>
              <tr>
                <th>{lang==='ar'?'الأرض':'קרקע'}</th>
                <th>📍 {t('region',lang)}</th>
                <th>{t('area',lang)}</th>
                <th>{t('delete',lang)}</th>
              </tr>
            </thead>
            <tbody>
              {lands.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign:'center', color:'var(--text-muted)', padding:20 }}>
                  {lang==='ar'?'لا توجد أراضٍ بعد':'אין קרקעות עדיין'}
                </td></tr>
              ) : lands.map(l => (
                <tr key={l.id}>
                  <td><strong style={{ fontFamily:'Heebo, sans-serif', fontSize:15 }}>{l.name}</strong></td>
                  <td>
                    {l.regionId
                      ? <span className="badge badge-green">{regionName(l.regionId)}</span>
                      : <span style={{ color:'var(--text-muted)',fontSize:12 }}>—</span>}
                  </td>
                  <td>{l.area ? `${l.area} ${t('dunam',lang)}` : '—'}</td>
                  <td>
                    <div className="flex-gap gap-6">
                      <button onClick={() => openEditLand(l)}
                          style={{
                            width:28, height:28, borderRadius:7,
                            border:'1.5px solid var(--border)',
                            background:'var(--surface-2)', color:'var(--primary)',
                            cursor:'pointer', display:'inline-flex',
                            alignItems:'center', justifyContent:'center',
                            fontSize:13, transition:'all 0.18s',
                          }}
                          onMouseEnter={e=>{e.currentTarget.style.background='var(--primary)';e.currentTarget.style.color='#fff';}}
                          onMouseLeave={e=>{e.currentTarget.style.background='var(--surface-2)';e.currentTarget.style.color='var(--primary)';}}
                        >✏</button>
                      <button
                          onClick={() => delL(l.id,l.name)}
                          style={{
                            width:28, height:28, borderRadius:7,
                            border:'1.5px solid #fca5a5',
                            background:'#fff1f2', color:'#dc2626',
                            cursor:'pointer', display:'inline-flex',
                            alignItems:'center', justifyContent:'center',
                            fontSize:13, transition:'all 0.18s',
                          }}
                          onMouseEnter={e=>{e.currentTarget.style.background='#dc2626';e.currentTarget.style.color='#fff';}}
                          onMouseLeave={e=>{e.currentTarget.style.background='#fff1f2';e.currentTarget.style.color='#dc2626';}}
                        >✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* ══ جدول القراءات — أعمدة ثابتة ══ */}
      {loading ? (
        <div style={{ textAlign:'center', padding:40 }}><div className="spinner" /></div>
      ) : (
        <ReadingsTable
          setReadings={setReadings}
          readings={filtered}
          prices={prices}
          farmerName={farmerName}
          landName={landName}
          landRegion={landRegion}
          onEdit={openEditR}
          onDelete={delR}
          lang={lang}
          isViewer={isViewer}
          lands={lands}
        />
      )}
    </div>
  );
}
