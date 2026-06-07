import React, { useState, useEffect, useCallback } from 'react';
import { adminAPI, regionsAPI } from '../../api';
import { useLang } from '../../contexts/LangContext';
import { t } from '../../i18n/translations';
import ReadingsTable from './ReadingsTable';

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

// ✅ دالة حساب السعر — نفس منطق ReadingsTable
const getPrice = (prices, year, landId, idx) => {
  if (!prices) return 0;
  const lp = prices.landPrices?.[String(landId)];
  if (lp?.[`reading_${idx}`]) return parseFloat(lp[`reading_${idx}`]) || 0;
  if (lp?.default)             return parseFloat(lp.default)           || 0;
  const yp = prices.yearPrices?.[String(year)];
  if (yp?.[`reading_${idx}`]) return parseFloat(yp[`reading_${idx}`]) || 0;
  if (yp?.default)             return parseFloat(yp.default)           || 0;
  return parseFloat(prices?.globalPrice) || 0;
};

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
  const [rForm,     setRForm]     = useState({
    farmerId:'', landId:'', year: new Date().getFullYear(),
    readings:['',''], extra:'', extraPaid:'', extraNote:'',
  });

  const [filterF,        setFilterF]        = useState('');
  const [filterY,        setFilterY]        = useState('');
  const [filterR,        setFilterR]        = useState('');
  const [filterPaid,     setFilterPaid]     = useState('');
  const [farmerSearch,   setFarmerSearch]   = useState('');
  const [showFarmerList, setShowFarmerList] = useState(false);
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

  const farmerLands = rForm.farmerId
    ? lands.filter(l => String(l.farmerId) === String(rForm.farmerId))
    : lands;

  const openAddR = () => {
    setEditR(null);
    setRForm({ farmerId:'', landId:'', year:new Date().getFullYear(), readings:['',''], extra:'', extraPaid:'', extraNote:'' });
    setError(''); setShowRForm(true);
  };
  const openEditR = r => {
    setEditR(r);
    setRForm({
      farmerId: r.farmerId, landId: r.landId, year: r.year,
      readings: [...r.readings.map(String)],
      extra: r.extra||'', extraPaid: r.extraPaid||'', extraNote: r.extraNote||'',
    });
    setError(''); setShowRForm(true);
  };
  const submitR = async e => {
    e.preventDefault();
    if (!rForm.farmerId || !rForm.landId) { setError(ar ? 'اختر المزارع والأرض' : 'בחר חקלאי וקרקע'); return; }
    if (rForm.readings.some(r => r === '')) { setError(ar ? 'أدخل جميع القراءات' : 'הזן את כל הקריאות'); return; }
    setSaving(true); setError('');
    try {
      if (editR) await adminAPI.updateReading(editR.id, rForm);
      else       await adminAPI.createReading(rForm);
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

  // ✅ حساب المجموع الكلي للقراءة الحالية في النموذج
  const formTotalAmount = rForm.readings.slice(1).reduce((total, _, i) => {
    const prev = parseFloat(rForm.readings[i]);
    const curr = parseFloat(rForm.readings[i+1]);
    const cups = (!isNaN(prev) && !isNaN(curr)) ? curr - prev : 0;
    const price = getPrice(prices, rForm.year, rForm.landId, i+1);
    return total + (cups > 0 ? cups * price : 0);
  }, 0);

  return (
    <div>
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
        <div className="card mb-16 fade-in-fast" style={{ border:'2px solid var(--primary)' }}>
          <h3 className="mb-16">
            {editR ? `✏️ ${ar ? 'تعديل قراءة' : 'עריכת קריאה'}` : `+ ${ar ? 'إضافة قراءة' : 'הוסף קריאה'}`}
          </h3>
          <form onSubmit={submitR}>
            <div className="grid-3">
              <div className="form-group">
                <label>{ar ? 'المزارع *' : 'חקלאי *'}</label>
                <select value={rForm.farmerId} onChange={e => setRForm({ ...rForm, farmerId: e.target.value, landId:'' })}>
                  <option value="">— {ar ? 'اختر' : 'בחר'} —</option>
                  {farmers.map(f => <option key={f.id} value={f.id}>{f.nameHeb || f.name}</option>)}
                </select>
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
                {rForm.farmerId && farmerLands.length === 0 && (
                  <p style={{ fontSize:12, color:'var(--red-500)', marginTop:4 }}>
                    ⚠️ {ar ? 'لا توجد محطات — أضفها في صفحة الحقلاء' : 'אין תחנות — הוסף בדף החקלאים'}
                  </p>
                )}
              </div>
              <div className="form-group">
                <label>{t('year', lang)} *</label>
                <input type="number" value={rForm.year} onChange={e => setRForm({ ...rForm, year: e.target.value })} min={2000} max={2100} />
              </div>
            </div>

            {/* معلومات المحطة */}
            {rForm.landId && (() => {
              const land = lands.find(l => l.id === rForm.landId);
              return land ? (
                <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', padding:'8px 14px', borderRadius:8, marginBottom:16, fontSize:13 }}>
                  {land.regionId && <span style={{ color:'var(--primary)', fontWeight:700, marginLeft:12 }}>📍 {regionName(land.regionId)}</span>}
                  {land.stationNumber && <span style={{ marginRight:12, fontWeight:700 }}> | עמדה: <code style={{ background:'white', border:'1px solid #bbf7d0', padding:'1px 8px', borderRadius:5 }}>{land.stationNumber}</code></span>}
                  {land.stationLat && land.stationLng
                    ? <span style={{ fontSize:11, color:'#16a34a' }}>✓ GPS: {parseFloat(land.stationLat).toFixed(4)}, {parseFloat(land.stationLng).toFixed(4)}</span>
                    : <span style={{ fontSize:11, color:'#f59e0b' }}>⚠ {ar ? 'لا يوجد GPS' : 'אין GPS'}</span>}
                </div>
              ) : null;
            })()}

            {/* القراءات */}
            <div className="form-group">
              <label>{ar ? 'القراءات (الأولى = بداية، التالية = قراءات الفترات)' : 'קריאות (ראשונה = התחלה, הבאות = קריאות תקופה)'}</label>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {rForm.readings.map((v,i) => {
                  const prev  = parseFloat(rForm.readings[i-1]);
                  const curr  = parseFloat(v);
                  const cups  = i > 0 && !isNaN(prev) && !isNaN(curr) ? curr - prev : null;
                  // ✅ حساب التكلفة للفترة
                  const price  = i > 0 ? getPrice(prices, rForm.year, rForm.landId, i) : 0;
                  const amount = cups !== null && cups > 0 ? cups * price : null;
                  return (
                    <div key={i} style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                      <span style={{ width:130, fontSize:13, fontWeight:700, color:'var(--text-muted)', flexShrink:0 }}>
                        {ar ? 'قراءة' : 'קריאה'} {i+1}
                        {i===0 ? ` (${ar ? 'بداية' : 'התחלה'})` : ` (${ar ? 'فترة' : 'תקופה'} ${i})`}
                      </span>
                      <input type="number" step="any" value={v}
                        onChange={e => updateReadingField(i, e.target.value)}
                        placeholder="0" style={{ width:130, fontWeight:700 }} />
                      {/* الأكواب */}
                      {cups !== null && (
                        <span style={{
                          fontSize:12, fontWeight:700, minWidth:90,
                          color: cups >= 0 ? '#16a34a' : '#dc2626',
                          background: cups >= 0 ? '#f0fdf4' : '#fff1f2',
                          border: `1px solid ${cups >= 0 ? '#bbf7d0' : '#fca5a5'}`,
                          padding:'2px 10px', borderRadius:6,
                        }}>
                          {cups >= 0 ? `🪣 ${cups}` : `⚠️ ${cups}`} {ar ? 'م³' : 'קוב'}
                        </span>
                      )}
                      {/* ✅ التكلفة */}
                      {amount !== null && (
                        <span style={{
                          fontSize:12, fontWeight:700,
                          color:'#854d0e',
                          background:'#fef9c3',
                          border:'1px solid #fde047',
                          padding:'2px 10px', borderRadius:6,
                        }}>
                          💰 ₪{Math.round(amount).toLocaleString()}
                          <span style={{ fontSize:10, color:'#92400e', marginRight:4 }}>
                            ({cups} × ₪{price})
                          </span>
                        </span>
                      )}
                      {i >= 2 && (
                        <button type="button" onClick={() => removeReadingField(i)}
                          style={{ width:26, height:26, borderRadius:6, border:'1.5px solid #fca5a5', background:'#fff1f2', color:'#dc2626', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:13 }}>
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
                <button type="button" onClick={addReadingField} className="btn btn-outline btn-sm" style={{ width:'fit-content', marginTop:4 }}>
                  + {ar ? 'إضافة فترة' : 'הוסף תקופה'}
                </button>
              </div>

              {/* ✅ المجموع الكلي */}
              {formTotalAmount > 0 && (
                <div style={{
                  marginTop:14, background:'linear-gradient(135deg,#14532d,#166534)',
                  borderRadius:10, padding:'10px 18px',
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                }}>
                  <span style={{ color:'#a3e635', fontWeight:700, fontSize:13 }}>
                    💰 {ar ? 'المجموع الكلي للقراءة:' : 'סה"כ לקריאה:'}
                  </span>
                  <span style={{ color:'#fde68a', fontWeight:900, fontSize:20 }}>
                    ₪{Math.round(formTotalAmount).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* الإضافات */}
            <div style={{ background:'var(--surface-2)', borderRadius:10, padding:'12px 16px', marginBottom:16 }}>
              <h4 className="mb-8" style={{ fontSize:13, color:'var(--primary)' }}>
                ➕ {ar ? 'مبلغ إضافي (اختياري)' : 'סכום נוסף (אופציונלי)'}
              </h4>
              <div className="grid-2">
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label style={{ fontSize:13 }}>₪ {ar ? 'المبلغ الإضافي' : 'סכום נוסף'}</label>
                  <input type="number" step="any" min="0" value={rForm.extra} onChange={e => setRForm({ ...rForm, extra:e.target.value })} placeholder="0" />
                </div>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label style={{ fontSize:13 }}>{ar ? 'سبب الإضافة' : 'סיבת התוספת'}</label>
                  <input value={rForm.extraNote} onChange={e => setRForm({ ...rForm, extraNote:e.target.value })} placeholder={ar ? 'مثال: غرامة، صيانة...' : 'לדוג: קנס, תחזוקה...'} />
                </div>
              </div>
              {rForm.extra > 0 && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, background:'#f0fdf4', borderRadius:8, padding:'10px 16px', marginTop:8 }}>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label style={{ fontSize:13 }}>✅ {ar ? 'المبلغ المدفوع منها (₪)' : 'שולם (₪)'}</label>
                    <input type="number" step="any" min="0" max={rForm.extra} value={rForm.extraPaid}
                      onChange={e => setRForm({ ...rForm, extraPaid:e.target.value })} placeholder="0" style={{ fontWeight:700 }} />
                  </div>
                  <div style={{ display:'flex', alignItems:'center', paddingTop:20 }}>
                    {rForm.extraPaid > 0 && rForm.extra > 0 && (
                      <span style={{ fontSize:13, fontWeight:700, color: parseFloat(rForm.extraPaid) >= parseFloat(rForm.extra) ? '#16a34a' : '#ca8a04' }}>
                        {parseFloat(rForm.extraPaid) >= parseFloat(rForm.extra)
                          ? `✅ ${ar ? 'مدفوع كاملاً' : 'שולם במלואו'}`
                          : `⚠️ ${ar ? 'متبقي' : 'נותר'}: ₪${(parseFloat(rForm.extra)-parseFloat(rForm.extraPaid)).toFixed(2)}`}
                      </span>
                    )}
                  </div>
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
