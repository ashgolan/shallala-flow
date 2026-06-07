import React, { useState, useEffect, useCallback } from 'react';
import { regionsAPI, adminAPI } from '../../api';
import { useLang } from '../../contexts/LangContext';
import { t } from '../../i18n/translations';

const parseKML = (xmlText) => {
  const parser = new DOMParser();
  const doc    = parser.parseFromString(xmlText, 'text/xml');
  const placemarks = Array.from(doc.querySelectorAll('Placemark'));
  const stationPattern = /^[A-Za-z]{1,3}\d+$/;

  const pointsMap = {}; // ✅ نستخدم map لمنع التكرار
  for (const pm of placemarks) {
    const name = pm.querySelector('name')?.textContent?.trim() || '';
    if (!stationPattern.test(name)) continue;
    const coordsEl = pm.querySelector('Point coordinates');
    if (!coordsEl) continue;
    const [lngStr, latStr] = coordsEl.textContent.trim().split(',');
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (isNaN(lat) || isNaN(lng)) continue;
    const desc = pm.querySelector('description')?.textContent || '';
    const farmers = desc
      .replace(/<[^>]+>/g, '\n').split('\n')
      .map(s => s.replace(/&nbsp;/g,'').trim())
      .filter(s => s.length > 1);
    const regionCode = name.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() || '';

    if (pointsMap[name]) {
      // ✅ نقطة موجودة — أضف المزارعين الجدد فقط
      farmers.forEach(f => {
        if (!pointsMap[name].farmers.includes(f)) pointsMap[name].farmers.push(f);
      });
    } else {
      pointsMap[name] = { name, lat, lng, farmers, regionCode };
    }
  }

  const points = Object.values(pointsMap);
  points.sort((a,b) => {
    if (a.regionCode !== b.regionCode) return a.regionCode.localeCompare(b.regionCode);
    return (parseInt(a.name.replace(/\D/g,''))||0) - (parseInt(b.name.replace(/\D/g,''))||0);
  });
  return points;
};

export default function AdminRegions({ adminRole = 'admin' }) {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const isViewer = adminRole === 'viewer';

  const [regions,  setRegions]  = useState([]);
  const [loadingR, setLoadingR] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [edit,     setEdit]     = useState(null);
  const [rCode,    setRCode]    = useState('');
  const [rName,    setRName]    = useState('');
  const [error,    setError]    = useState('');
  const [saving,   setSaving]   = useState(false);

  const [kmlPoints,    setKmlPoints]    = useState([]);
  const [kmlSelected,  setKmlSelected]  = useState({});
  const [kmlImporting, setKmlImporting] = useState(false);
  const [kmlDone,      setKmlDone]      = useState(null);
  const [showKml,      setShowKml]      = useState(false);
  const [cleaning,     setCleaning]     = useState(false);  // ✅ تنظيف التكرار

  const load = useCallback(async () => {
    setLoadingR(true);
    try { const d = await regionsAPI.getRegions(); setRegions(d.regions || []); }
    catch(e) { setError(e.message); }
    finally { setLoadingR(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── عند تغيير المناطق نحدّث ربط نقاط KML تلقائياً ─────────
  useEffect(() => {
    if (kmlPoints.length === 0) return;
    setKmlPoints(prev => prev.map(p => ({
      ...p,
      regionId: regions.find(r => r.name?.toUpperCase() === p.regionCode)?.id || p.regionId || null,
    })));
  }, [regions]);

  const openAdd = () => { setEdit(null); setRCode(''); setRName(''); setError(''); setShowForm(true); };
  const openEdit = r => {
    setEdit(r);
    setRCode(r.name || '');
    setRName(r.nameHeb && r.nameHeb !== r.name ? r.nameHeb : '');
    setError(''); setShowForm(true);
  };

  const submit = async e => {
    e.preventDefault();
    if (!rCode.trim()) { setError(ar?'أدخل كود المنطقة':'הזן קוד אזור'); return; }
    if (!rName.trim()) { setError(ar?'أدخل اسم المنطقة':'הזן שם אזור'); return; }
    setSaving(true); setError('');
    try {
      const data = { name: rCode.trim().toUpperCase(), nameHeb: rName.trim(), notes: '' };
      if (edit) await regionsAPI.updateRegion(edit.id, data);
      else      await regionsAPI.createRegion(data);
      setShowForm(false); load();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const del = async (id, name) => {
    if (!window.confirm(`${ar?'حذف المنطقة':'מחיקת אזור'} "${name}"?`)) return;
    await regionsAPI.deleteRegion(id); load();
  };

  const handleKmlFile = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const raw = parseKML(ev.target.result);
      // ربط تلقائي بالمناطق الموجودة
      const points = raw.map(p => ({
        ...p,
        regionId: regions.find(r => r.name?.toUpperCase() === p.regionCode)?.id || null,
      }));
      const sel = {};
      points.forEach(p => { sel[p.name] = true; });
      setKmlPoints(points);
      setKmlSelected(sel);
      setKmlDone(null);
      setShowKml(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const toggleAll = val => {
    const sel = {};
    kmlPoints.forEach(p => { sel[p.name] = val; });
    setKmlSelected(sel);
  };

  // ✅ تنظيف المحطات المكررة
  const cleanDuplicates = async () => {
    if (!window.confirm(ar
      ? 'سيتم حذف المحطات المكررة والاحتفاظ بنسخة واحدة فقط من كل محطة. القراءات ستُنقل تلقائياً. متابعة؟'
      : 'יימחקו תחנות כפולות ותישמר רק עותק אחד. הקריאות יועברו אוטומטית. להמשיך?'
    )) return;
    setCleaning(true);
    try {
      const res = await adminAPI.cleanDuplicateLands();
      alert(ar
        ? `✅ تم! حُذف ${res.deleted} محطة مكررة.`
        : `✅ הסתיים! נמחקו ${res.deleted} תחנות כפולות.`
      );
    } catch(e) {
      alert(ar ? 'خطأ: ' + e.message : 'שגיאה: ' + e.message);
    } finally { setCleaning(false); }
  };

  const importKml = async () => {
    const toImport = kmlPoints.filter(p => kmlSelected[p.name]);
    if (!toImport.length) return;
    setKmlImporting(true);
    let imported = 0, updated = 0, skipped = 0;

    // ✅ جلب الأراضي الموجودة مسبقاً
    let existingLands = [];
    try { const d = await adminAPI.getLands(); existingLands = d.lands || []; } catch {}

    for (const p of toImport) {
      try {
        // ✅ تحقق إذا كانت المحطة موجودة مسبقاً
        const existing = existingLands.find(l => l.stationNumber === p.name);
        if (existing) {
          // تحديث الموجود بدل إنشاء جديد
          await adminAPI.updateLand(existing.id, {
            name:          p.name,
            nameHeb:       p.name,
            stationNumber: p.name,
            regionId:      p.regionId || existing.regionId || null,
            stationLat:    p.lat,
            stationLng:    p.lng,
            description:   p.farmers.join('، '),
          });
          updated++;
        } else {
          await adminAPI.createLand({
            name:          p.name,
            nameHeb:       p.name,
            stationNumber: p.name,
            regionId:      p.regionId || null,
            stationLat:    p.lat,
            stationLng:    p.lng,
            description:   p.farmers.join('، '),
          });
          imported++;
        }
      } catch { skipped++; }
    }
    setKmlImporting(false);
    setKmlDone({ imported, updated, skipped });
  };

  // ألوان تلقائية لكل منطقة
  const regionColors = ['#dcfce7','#dbeafe','#fef9c3','#fce7f3','#ede9fe','#ffedd5','#f0f9ff','#fff7ed'];
  const regionColorMap = {};
  [...new Set(kmlPoints.map(p=>p.regionCode))].forEach((code,i) => {
    regionColorMap[code] = regionColors[i % regionColors.length];
  });

  const selectedCount = Object.values(kmlSelected).filter(Boolean).length;

  // تجميع النقاط حسب المنطقة للعرض
  const groupedPoints = kmlPoints.reduce((acc, p) => {
    if (!acc[p.regionCode]) acc[p.regionCode] = [];
    acc[p.regionCode].push(p);
    return acc;
  }, {});

  return (
    <div>
      {/* ══ المناطق ══ */}
      <div className="flex-between mb-20" style={{ flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 className="mb-4">📍 {ar?'المناطق':'אזורים חקלאיים'}</h2>
          <p style={{ color:'var(--text-muted)', fontSize:13 }}>
            {ar?'كود (حرف/حرفان) + اسم — مثال: A = אלעברה':'קוד (אות/שתיים) + שם — לדוג׳: A = אלעברה'}
          </p>
        </div>
        {!isViewer && (
          <button className="btn btn-primary" onClick={openAdd}>
            + {ar?'إضافة منطقة':'הוסף אזור'}
          </button>
        )}
      </div>

      {showForm && (
        <div className="card mb-20 fade-in-fast" style={{ border:'2px solid var(--primary)', maxWidth:500 }}>
          <h3 className="mb-16">{edit ? `✏️ ${ar?'تعديل':'עריכה'}` : `+ ${ar?'منطقة جديدة':'אזור חדש'}`}</h3>
          <form onSubmit={submit}>
            <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:12, marginBottom:12 }}>
              <div className="form-group" style={{ margin:0 }}>
                <label style={{ fontSize:13 }}>{ar?'الكود':'קוד'} *</label>
                <input value={rCode} onChange={e=>setRCode(e.target.value.toUpperCase())}
                  placeholder="A / B / FC" maxLength={5} autoFocus
                  style={{ fontSize:22, fontWeight:900, letterSpacing:4, textAlign:'center', fontFamily:'monospace' }} />
              </div>
              <div className="form-group" style={{ margin:0 }}>
                <label style={{ fontSize:13, fontFamily:'Heebo,sans-serif' }}>{ar?'اسم المنطقة':'שם האזור'} *</label>
                <input value={rName} onChange={e=>setRName(e.target.value)}
                  placeholder="אלעברה / עין אלעוחלאן"
                  style={{ fontFamily:'Heebo,sans-serif', fontSize:15 }} />
              </div>
            </div>
            {error && <div className="alert alert-error mb-8">{error}</div>}
            <div className="flex-gap gap-12">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? t('saving',lang) : `💾 ${t('save',lang)}`}
              </button>
              <button type="button" className="btn btn-outline" onClick={()=>setShowForm(false)}>{t('cancel',lang)}</button>
            </div>
          </form>
        </div>
      )}

      {loadingR ? (
        <div style={{ textAlign:'center', padding:30 }}><div className="spinner" /></div>
      ) : regions.length === 0 ? (
        <div className="card empty-state mb-32"><span className="icon">📍</span><p>{ar?'لا توجد مناطق':'אין אזורים'}</p></div>
      ) : (
        <div className="card mb-32">
          <p style={{ color:'var(--text-muted)', fontSize:13, marginBottom:12 }}>{regions.length} {ar?'منطقة':'אזורים'}</p>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width:100, textAlign:'center' }}>{ar?'الكود':'קוד'}</th>
                  <th style={{ fontFamily:'Heebo,sans-serif' }}>{ar?'اسم المنطقة':'שם האזור'}</th>
                  {!isViewer && <th style={{ width:80 }}></th>}
                </tr>
              </thead>
              <tbody>
                {regions.map(r => (
                  <tr key={r.id}>
                    <td style={{ textAlign:'center' }}>
                      <code style={{ background:'#f0fdf4', border:'1.5px solid #bbf7d0', padding:'4px 14px', borderRadius:8, fontWeight:900, fontSize:18, letterSpacing:4, color:'var(--primary)' }}>{r.name}</code>
                    </td>
                    <td style={{ fontFamily:'Heebo,sans-serif', fontWeight:600, fontSize:15 }}>
                      {r.nameHeb && r.nameHeb !== r.name ? r.nameHeb
                        : <span style={{ color:'var(--text-muted)', fontStyle:'italic', fontSize:12 }}>{ar?'— بدون اسم':'— ללא שם'}</span>}
                    </td>
                    {!isViewer && (
                      <td>
                        <div className="flex-gap gap-4">
                          <button onClick={()=>openEdit(r)} style={{ width:26,height:26,borderRadius:6,border:'1.5px solid var(--border)',background:'var(--surface-2)',color:'var(--primary)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:12 }}
                            onMouseEnter={e=>{e.currentTarget.style.background='var(--primary)';e.currentTarget.style.color='#fff';}}
                            onMouseLeave={e=>{e.currentTarget.style.background='var(--surface-2)';e.currentTarget.style.color='var(--primary)';}}>✏</button>
                          <button onClick={()=>del(r.id,r.name)} style={{ width:26,height:26,borderRadius:6,border:'1.5px solid #fca5a5',background:'#fff1f2',color:'#dc2626',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:12 }}
                            onMouseEnter={e=>{e.currentTarget.style.background='#dc2626';e.currentTarget.style.color='#fff';}}
                            onMouseLeave={e=>{e.currentTarget.style.background='#fff1f2';e.currentTarget.style.color='#dc2626';}}>✕</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ فاصل بين القسمين ══ */}
      {!isViewer && (
        <div style={{ margin:'32px 0', display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ flex:1, height:1, background:'linear-gradient(90deg, transparent, var(--border))' }}/>
          <span style={{ fontSize:20 }}>🗺️</span>
          <div style={{ flex:1, height:1, background:'linear-gradient(90deg, var(--border), transparent)' }}/>
        </div>
      )}

      {/* ══ استيراد KML ══ */}
      {!isViewer && (
        <div>
          {/* رأس القسم */}
          <div style={{ marginBottom:20 }}>
            <h2 style={{ margin:'0 0 6px' }}>
              {ar?'استيراد من Google Earth':'ייבוא מ-Google Earth'}
            </h2>
            <p style={{ color:'var(--text-muted)', fontSize:13, margin:'0 0 16px' }}>
              {ar
                ? 'المحطات تُجمَّع تلقائياً حسب الحرف — A → منطقة A، B → منطقة B'
                : 'תחנות מקובצות אוטומטית לפי אות — A → אזור A, B → אזור B'}
            </p>
            {/* أزرار بنفس الحجم */}
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              {/* زر رفع KML */}
              <label style={{
                height:44, minWidth:190, padding:'0 20px',
                borderRadius:10, cursor:'pointer', boxSizing:'border-box',
                fontWeight:600, fontSize:14, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8,
                background:'#f0fdf4', color:'var(--primary)',
                border:'1.5px solid #86efac',
                transition:'all 0.2s',
              }}
              onMouseEnter={e=>{e.currentTarget.style.background='#dcfce7';e.currentTarget.style.borderColor='#4ade80';}}
              onMouseLeave={e=>{e.currentTarget.style.background='#f0fdf4';e.currentTarget.style.borderColor='#86efac';}}>
                📥 {ar?'رفع ملف KML':'העלה קובץ KML'}
                <input type="file" accept=".kml,.kmz" onChange={handleKmlFile} style={{ display:'none' }} />
              </label>

              {/* زر تنظيف التكرار */}
              <button onClick={cleanDuplicates} disabled={cleaning}
                style={{
                  height:44, minWidth:190, padding:'0 20px', boxSizing:'border-box',
                  borderRadius:10, cursor: cleaning ? 'wait' : 'pointer',
                  fontWeight:600, fontSize:14, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8,
                  background:'#fff7ed', color:'#c2410c',
                  border:'1.5px solid #fed7aa',
                  transition:'all 0.2s',
                }}
                onMouseEnter={e=>{ if(!cleaning){ e.currentTarget.style.background='#ffedd5'; e.currentTarget.style.borderColor='#fb923c'; }}}
                onMouseLeave={e=>{ if(!cleaning){ e.currentTarget.style.background='#fff7ed'; e.currentTarget.style.borderColor='#fed7aa'; }}}>
                {cleaning ? `⏳ ${ar?'جاري...':'מנקה...'}` : `🧹 ${ar?'تنظيف التكرار':'נקה כפילויות'}`}
              </button>
            </div>
          </div>

          {showKml && kmlPoints.length > 0 && (
            <div className="card fade-in">
              {/* شريط التحكم */}
              <div className="flex-between mb-12" style={{ flexWrap:'wrap', gap:10 }}>
                <div className="flex-gap gap-12">
                  <span style={{ fontWeight:700, fontSize:14 }}>📍 {kmlPoints.length} {ar?'محطة':'תחנות'}</span>
                  <span style={{ color:'var(--primary)', fontWeight:700, fontSize:13 }}>✓ {selectedCount} {ar?'محددة':'נבחרו'}</span>
                </div>
                <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                  {/* بحر الكل */}
                  <button onClick={()=>toggleAll(true)} style={{
                    height:40, padding:'0 18px', boxSizing:'border-box', borderRadius:8,
                    fontWeight:600, fontSize:13, cursor:'pointer',
                    display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6,
                    background:'#f8fafc', color:'#475569', border:'1.5px solid #cbd5e1', transition:'all 0.2s',
                  }}
                  onMouseEnter={e=>{e.currentTarget.style.background='#f1f5f9';e.currentTarget.style.borderColor='#94a3b8';}}
                  onMouseLeave={e=>{e.currentTarget.style.background='#f8fafc';e.currentTarget.style.borderColor='#cbd5e1';}}>
                    ✓ {ar?'تحديد الكل':'בחר הכל'}
                  </button>
                  {/* بطل الكل */}
                  <button onClick={()=>toggleAll(false)} style={{
                    height:40, padding:'0 18px', boxSizing:'border-box', borderRadius:8,
                    fontWeight:600, fontSize:13, cursor:'pointer',
                    display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6,
                    background:'#f8fafc', color:'#475569', border:'1.5px solid #cbd5e1', transition:'all 0.2s',
                  }}
                  onMouseEnter={e=>{e.currentTarget.style.background='#f1f5f9';e.currentTarget.style.borderColor='#94a3b8';}}
                  onMouseLeave={e=>{e.currentTarget.style.background='#f8fafc';e.currentTarget.style.borderColor='#cbd5e1';}}>
                    ○ {ar?'إلغاء الكل':'בטל הכל'}
                  </button>
                  {/* زر الاستيراد */}
                  <button onClick={importKml} disabled={kmlImporting||selectedCount===0} style={{
                    height:40, padding:'0 22px', boxSizing:'border-box', borderRadius:8,
                    fontWeight:700, fontSize:13, cursor: kmlImporting||selectedCount===0 ? 'not-allowed' : 'pointer',
                    display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6,
                    background: kmlImporting||selectedCount===0 ? '#f1f5f9' : 'var(--primary)',
                    color: kmlImporting||selectedCount===0 ? '#94a3b8' : '#fff',
                    border: 'none', transition:'all 0.2s',
                    boxShadow: kmlImporting||selectedCount===0 ? 'none' : '0 2px 6px rgba(22,163,74,0.3)',
                  }}
                  onMouseEnter={e=>{ if(!kmlImporting&&selectedCount>0) e.currentTarget.style.opacity='0.9'; }}
                  onMouseLeave={e=>{ e.currentTarget.style.opacity='1'; }}>
                    {kmlImporting ? `⏳ ${ar?'جاري...':'מייבא...'}` : `📥 ${ar?`استيراد ${selectedCount}`:`ייבא ${selectedCount}`} ${ar?'محطة':'תחנות'}`}
                  </button>
                </div>
              </div>

              {/* نتيجة الاستيراد */}
              {kmlDone && (
                <div style={{ background:kmlDone.skipped>0?'#fef9c3':'#f0fdf4', border:`1.5px solid ${kmlDone.skipped>0?'#fde047':'#bbf7d0'}`, borderRadius:10, padding:'12px 16px', marginBottom:16, display:'flex', gap:12, alignItems:'center' }}>
                  <span style={{ fontSize:24 }}>{kmlDone.skipped>0?'⚠️':'🎉'}</span>
                  <div>
                    <div style={{ fontWeight:700 }}>{ar?'اكتمل الاستيراد!':'הייבוא הושלם!'}</div>
                    <div style={{ fontSize:13, color:'var(--text-muted)', marginTop:2 }}>
                      ✅ {kmlDone.imported} {ar?'محطة جديدة':'תחנות חדשות'}
                      {kmlDone.updated > 0 && <span style={{ color:'#0369a1' }}> | 🔄 {kmlDone.updated} {ar?'محطة محدّثة':'תחנות עודכנו'}</span>}
                      {kmlDone.skipped > 0 && <span style={{ color:'#ca8a04' }}> | ⚠️ {kmlDone.skipped} {ar?'فشل':'נכשלו'}</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* تلميح */}
              <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:8, padding:'8px 14px', marginBottom:16, fontSize:12, color:'#0369a1' }}>
                💡 {ar
                  ? 'المحطات مجمّعة حسب المنطقة. المنطقة تُعيَّن تلقائياً إذا كانت موجودة. اضغط على صف لتحديده/إلغائه.'
                  : 'תחנות מקובצות לפי אזור. האזור מוקצה אוטומטית אם קיים. לחץ שורה לבחירה/ביטול.'}
              </div>

              {/* عرض مجمّع حسب المنطقة */}
              {Object.entries(groupedPoints).map(([code, pts]) => {
                const reg = regions.find(r => r.name?.toUpperCase() === code);
                const allChecked = pts.every(p => kmlSelected[p.name]);
                const someChecked = pts.some(p => kmlSelected[p.name]);
                return (
                  <div key={code} style={{ marginBottom:20 }}>
                    {/* رأس المنطقة */}
                    <div style={{ background: regionColorMap[code]||'#f0fdf4', border:'1.5px solid #bbf7d0', borderRadius:10, padding:'10px 16px', marginBottom:8, display:'flex', alignItems:'center', gap:12 }}>
                      <input type="checkbox"
                        checked={allChecked}
                        ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                        onChange={e => {
                          const sel = {...kmlSelected};
                          pts.forEach(p => { sel[p.name] = e.target.checked; });
                          setKmlSelected(sel);
                        }}
                        style={{ width:16, height:16, cursor:'pointer' }} />
                      <code style={{ background:'var(--primary)', color:'#fff', padding:'3px 14px', borderRadius:6, fontWeight:900, fontSize:18, letterSpacing:3 }}>{code}</code>
                      {reg
                        ? <span style={{ fontFamily:'Heebo,sans-serif', fontWeight:700, fontSize:15 }}>
                            {reg.nameHeb || reg.name}
                          </span>
                        : <span style={{ fontSize:13, color:'#ca8a04', fontWeight:600 }}>
                            ⚠️ {ar?'المنطقة غير موجودة — أضفها أولاً':'האזור לא קיים — הוסף תחילה'}
                          </span>}
                      <span style={{ marginRight:'auto', fontSize:12, color:'var(--text-muted)' }}>
                        {pts.filter(p=>kmlSelected[p.name]).length}/{pts.length} {ar?'محددة':'נבחרו'}
                      </span>
                    </div>

                    {/* نقاط المنطقة */}
                    <div style={{ display:'flex', flexWrap:'wrap', gap:8, paddingRight:16 }}>
                      {pts.map(p => {
                        const isChecked = !!kmlSelected[p.name];
                        return (
                          <div key={p.name}
                            onClick={()=>setKmlSelected(prev=>({...prev,[p.name]:!prev[p.name]}))}
                            style={{
                              background: isChecked ? '#fff' : '#f3f4f6',
                              border: `2px solid ${isChecked ? 'var(--primary)' : '#d1d5db'}`,
                              borderRadius:10, padding:'8px 12px', cursor:'pointer',
                              opacity: isChecked ? 1 : 0.5, transition:'all 0.15s',
                              minWidth:120,
                            }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                              <code style={{ background:'var(--primary)', color:'#fff', padding:'1px 8px', borderRadius:4, fontWeight:900, fontSize:14 }}>
                                {p.name}
                              </code>
                              {isChecked && <span style={{ color:'var(--primary)', fontSize:14 }}>✓</span>}
                            </div>
                            <div style={{ fontSize:10, color:'#64748b' }}>
                              📍 {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                            </div>
                            {p.farmers.length > 0 && (
                              <div style={{ fontSize:10, color:'#374151', marginTop:2, maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                👥 {p.farmers.join('، ')}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* زر استيراد في الأسفل */}
              <div style={{ marginTop:20, textAlign:'center' }}>
                <button className="btn btn-primary" onClick={importKml}
                  disabled={kmlImporting||selectedCount===0}
                  style={{ height:44, padding:'0 32px', borderRadius:10, fontSize:15, fontWeight:700, boxSizing:'border-box' }}>
                  {kmlImporting ? `⏳ ${ar?'جاري الاستيراد...':'מייבא...'}` : `📥 ${ar?`استيراد ${selectedCount} محطة`:`ייבא ${selectedCount} תחנות`}`}
                </button>
              </div>
            </div>
          )}

          {showKml && kmlPoints.length === 0 && (
            <div className="card" style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>
              ⚠️ {ar?'لم يتم العثور على محطات':'לא נמצאו תחנות'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
