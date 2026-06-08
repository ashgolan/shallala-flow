import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { adminAPI, regionsAPI } from '../../api';
import { useLang } from '../../contexts/LangContext';
import ReadingsTable from './ReadingsTable';

const getP = (prices, year, landId, idx) => {
  if (!prices) return 0;
  const lp = prices.landPrices?.[String(landId)];
  if (lp?.[`reading_${idx}`]) return parseFloat(lp[`reading_${idx}`]) || 0;
  if (lp?.default) return parseFloat(lp.default) || 0;
  const yp = prices.yearPrices?.[String(year)];
  if (yp?.[`reading_${idx}`]) return parseFloat(yp[`reading_${idx}`]) || 0;
  if (yp?.default) return parseFloat(yp.default) || 0;
  return parseFloat(prices?.globalPrice) || 0;
};

export function AdminReports() {
  const { lang } = useLang();
  const ar = lang === 'ar';

  const [data, setData]       = useState({ farmers:[], lands:[], readings:[], prices:{} });
  const [loading, setLoading] = useState(true);
  const [regions, setRegions] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [mapModal, setMapModal] = useState(null);

  // فلاتر
  const [filterYear,    setFilterYear]    = useState('');
  const [filterFarmer,  setFilterFarmer]  = useState('');
  const [filterRegion,  setFilterRegion]  = useState('');
  const [filterPaid,    setFilterPaid]    = useState('');
  const [farmerSearch,  setFarmerSearch]  = useState('');
  const [showFarmerList,setShowFarmerList]= useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, rg] = await Promise.all([adminAPI.getReport(), regionsAPI.getRegions()]);
      setData(d);
      setRegions(rg.regions || []);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { farmers, lands, readings, prices } = data;

  const farmerName = id => farmers.find(f=>String(f.id)===String(id))?.nameHeb
                        || farmers.find(f=>String(f.id)===String(id))?.name || '—';

  // ✅ اسم المنطقة من regionId أو من حرف stationNumber
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

  const calcRow = r => {
    const vals = r.readings || [];
    const periods = vals.slice(1).map((v, i) => {
      const cups  = parseFloat(vals[i+1]) - parseFloat(vals[i]);
      const price = getP(prices, r.year, r.landId, i+1);
      return { cups: cups > 0 ? cups : 0, price, amount: cups > 0 ? cups * price : 0 };
    });
    const totalCups  = periods.reduce((s,p) => s + p.cups, 0);
    const cupsAmount = periods.reduce((s,p) => s + p.amount, 0);
    const extra      = parseFloat(r.extra) || 0;
    const extraPaid  = parseFloat(r.extraPaid) || 0;
    const total      = cupsAmount + extra - extraPaid;
    return { periods, totalCups, cupsAmount, extra, extraPaid, total };
  };

  const years = [...new Set(readings.map(r => r.year))].sort((a,b) => b-a);

  const filtered = readings.filter(r => {
    if (filterYear   && r.year !== parseInt(filterYear)) return false;
    if (filterFarmer && String(r.farmerId) !== filterFarmer) return false;
    if (filterPaid === 'paid'   && !r.paid) return false;
    if (filterPaid === 'unpaid' &&  r.paid) return false;
    if (filterRegion) {
      const land = lands.find(l => String(l.id) === String(r.landId));
      if (!land) return false;
      // تحقق من regionId أو من الحرف
      if (land.regionId && String(land.regionId) !== filterRegion) {
        const reg = regions.find(r2 => String(r2.id) === filterRegion);
        const code = land.stationNumber?.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase();
        if (!reg || reg.name?.toUpperCase() !== code) return false;
      } else if (!land.regionId) {
        const reg = regions.find(r2 => String(r2.id) === filterRegion);
        const code = land.stationNumber?.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase();
        if (!reg || reg.name?.toUpperCase() !== code) return false;
      }
    }
    return true;
  });

  const grandTotal = filtered.reduce((s,r) => s + calcRow(r).total, 0);
  const grandCups  = filtered.reduce((s,r) => s + calcRow(r).totalCups, 0);
  const paidCount  = filtered.filter(r => r.paid).length;

  // ── Map Modal ──────────────────────────────────────────────
  const MapModal = () => {
    if (!mapModal) return null;
    const { lat, lng, name } = mapModal;
    const esriUrl = `https://maps.google.com/maps?q=${lat},${lng}&z=18&t=k&output=embed&markers=${lat},${lng}`;
    const earthUrl = `https://earth.google.com/web/@${lat},${lng},400a,800d,30y,0h,0t,0r`;
    return (
      <div onClick={() => setMapModal(null)}
        style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.65)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
        <div onClick={e => e.stopPropagation()}
          style={{ background:'#fff', borderRadius:16, overflow:'hidden', width:'100%', maxWidth:600, boxShadow:'0 20px 60px rgba(0,0,0,0.4)' }}>
          <div style={{ padding:'14px 18px', background:'#14532d', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:20 }}>📍</span>
              <div>
                <div style={{ color:'#fff', fontWeight:800, fontSize:15 }}>{name}</div>
                <div style={{ color:'rgba(255,255,255,0.6)', fontSize:12 }}>{lat}, {lng}</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <a href={earthUrl} target="_blank" rel="noopener noreferrer"
                style={{ color:'#a3e635', fontSize:12, fontWeight:700, textDecoration:'none', background:'rgba(255,255,255,0.1)', padding:'5px 10px', borderRadius:8 }}>
                🌍 Google Earth
              </a>
              <button onClick={() => setMapModal(null)}
                style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:30, height:30, borderRadius:'50%', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>
          </div>
          {/* overlay الوصف + دبوس */}
          <div style={{ position:'relative' }}>
            <iframe src={esriUrl} width="100%" height="360" style={{ border:0, display:'block' }}
              allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="map" />
            <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-100%)', pointerEvents:'none', display:'flex', flexDirection:'column', alignItems:'center' }}>
              {(() => {
                const land = lands.find(l => l.stationNumber === name);
                const desc = land?.description;
                if (!desc) return null;
                const lines = desc.split(/[،,\n]/).map(s=>s.trim()).filter(Boolean);
                return (
                  <div style={{ background:'rgba(22,163,74,0.95)', color:'#fff', borderRadius:10, padding:'6px 12px', marginBottom:6, boxShadow:'0 3px 12px rgba(0,0,0,0.35)', border:'2px solid #fff', maxWidth:220, textAlign:'center', fontFamily:'Heebo,sans-serif', fontSize:13, fontWeight:700 }}>
                    {lines.join(' • ')}
                  </div>
                );
              })()}
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

  // ── طباعة ──────────────────────────────────────────────────
  const handlePrint = () => {
    const date = new Date().toLocaleDateString(ar?'ar-SA':'he-IL');
    const yearLabel = filterYear || (ar?'جميع السنوات':'כל השנים');
    const farmerLabel = filterFarmer ? (farmers.find(f=>f.id===filterFarmer)?.nameHeb||'—') : (ar?'جميع المزارعين':'כל החקלאים');
    const rows = filtered.map(r => {
      const { totalCups, extra, extraPaid, total } = calcRow(r);
      const land = lands.find(l => String(l.id) === String(r.landId));
      const isPaid = !!r.paid;
      return `<tr style="background:${isPaid?'#f0fdf4':'#fff5f5'}">
        <td>${farmerName(r.farmerId)}</td>
        <td>${landName(r.landId)}</td>
        <td style="text-align:center">${r.year}</td>
        <td style="text-align:center">${land?.stationNumber||r.stationNumber||'—'}</td>
        <td style="text-align:center">${totalCups.toLocaleString()}</td>
        <td style="text-align:center">${extra>0?'+₪'+extra.toLocaleString():'—'}</td>
        <td style="text-align:center;font-weight:bold">₪${Math.round(total).toLocaleString()}</td>
        <td style="text-align:center;color:${isPaid?'#16a34a':'#dc2626'};font-weight:bold">${isPaid?'✓':'○'}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"/>
<title>${ar?'تقرير':'דוח'} — ${yearLabel}</title>
<style>body{font-family:Arial,sans-serif;padding:16px;font-size:12px;direction:rtl;}
table{width:100%;border-collapse:collapse;}th,td{border:1px solid #d1d5db;padding:5px 8px;}
thead tr{background:#166534;color:white;}tfoot tr{background:#14532d;color:white;}
@page{size:landscape;margin:1cm;}</style></head><body>
<h1>🌿 ${ar?'الشلالة — تقرير':'אלשללאלה — דוח'}</h1>
<p>${ar?'تاريخ':'תאריך'}: ${date} | ${yearLabel} | ${farmerLabel}</p>
<table><thead><tr>
  <th>${ar?'المزارع':'חקלאי'}</th><th>${ar?'المنطقة':'אזור'}</th>
  <th>${ar?'السنة':'שנה'}</th><th>${ar?'المحطة':'עמדה'}</th>
  <th>${ar?'الكل':'כלל'}</th><th>${ar?'إضافات':'תוספות'}</th>
  <th>${ar?'الإجمالي':'סה"כ'}</th><th>${ar?'دفع':'תשלום'}</th>
</tr></thead><tbody>${rows}</tbody>
<tfoot><tr>
  <td colspan="4" style="font-weight:bold">${ar?'الإجمالي':'סה"כ'} (${filtered.length})</td>
  <td style="text-align:center;font-weight:bold">${grandCups.toLocaleString()}</td>
  <td></td>
  <td style="text-align:center;font-weight:bold">₪${Math.round(grandTotal).toLocaleString()}</td>
  <td style="text-align:center">${paidCount}/${filtered.length} ✓</td>
</tr></tfoot></table></body></html>`;

    const win = window.open('','_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  // ── Excel للناطور ─────────────────────────────────────────
  const handleWatchmanExcel = () => {
    const year = filterYear || new Date().getFullYear();
    const landReadings = {};
    readings.filter(r => !filterYear || r.year === parseInt(filterYear)).forEach(r => {
      const key = String(r.landId);
      if (!landReadings[key] || r.year > landReadings[key].year) landReadings[key] = r;
    });
    const rows = Object.values(landReadings).map(r => {
      const vals    = r.readings || [];
      const farmer  = farmers.find(f => String(f.id) === String(r.farmerId));
      const land    = lands.find(l => String(l.id) === String(r.landId));
      return {
        'שם החקלאי': farmer?.nameHeb||farmer?.name||'—',
        'אזור':       landName(r.landId),
        'עמדה':       land?.stationNumber||r.stationNumber||'—',
        'טלפון':      farmer?.phone||'—',
        [`קריאה אחרונה (${r.year})`]: vals[vals.length-1]||0,
        'קריאה חדשה': '',
        'הערות':      '',
      };
    }).sort((a,b) => (a['עמדה']||'').localeCompare(b['עמדה']||'','he'));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{wch:20},{wch:16},{wch:8},{wch:14},{wch:16},{wch:14},{wch:16}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `שנה ${year}`);
    XLSX.writeFile(wb, `alshallala-watchman-${year}.xlsx`);
  };

  if (loading) return <div style={{textAlign:'center',padding:60}}><div className="spinner"/></div>;

  return (
    <div>
      <MapModal />

      {/* ── الأزرار ── */}
      <div className="flex-between mb-16" style={{flexWrap:'wrap',gap:10}}>
        <h2 style={{margin:0}}>📊 {ar?'التقارير':'דוחות'}</h2>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="btn btn-outline" onClick={handleWatchmanExcel}>📋 {ar?'Excel للناطور':'Excel לשומר'}</button>
          <button className="btn btn-outline" onClick={handlePrint}>🖨️ {ar?'طباعة':'הדפסה'}</button>
        </div>
      </div>

      {/* ── الفلاتر ── */}
      <div className="card mb-16">
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:10, alignItems:'end'}}>

          {/* فلتر المزارعين searchable */}
          <div className="form-group" style={{marginBottom:0}}>
            <label style={{fontSize:12}}>{ar?'المزارع':'חקלאי'}</label>
            <div style={{position:'relative'}}>
              <input type="text" value={farmerSearch}
                onChange={e=>{setFarmerSearch(e.target.value);setShowFarmerList(true);}}
                onFocus={()=>setShowFarmerList(true)}
                onBlur={()=>setTimeout(()=>setShowFarmerList(false),150)}
                placeholder={filterFarmer
                  ? (farmers.find(f=>f.id===filterFarmer)?.nameHeb||'')
                  : (ar?'🔍 كل المزارعين...':'🔍 כל החקלאים...')}
                style={{width:'100%', paddingLeft: filterFarmer?28:8}} />
              {filterFarmer && (
                <button onClick={()=>{setFilterFarmer('');setFarmerSearch('');}}
                  style={{position:'absolute',left:6,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',fontSize:14}}>✕</button>
              )}
              {showFarmerList && (
                <div style={{position:'absolute',top:'100%',right:0,zIndex:100,background:'#fff',border:'1.5px solid var(--border)',borderRadius:8,boxShadow:'0 4px 16px rgba(0,0,0,0.12)',maxHeight:200,overflowY:'auto',minWidth:220,width:'100%'}}>
                  <div onMouseDown={()=>{setFilterFarmer('');setFarmerSearch('');setShowFarmerList(false);}}
                    style={{padding:'8px 12px',fontSize:13,color:'var(--text-muted)',cursor:'pointer',borderBottom:'1px solid var(--border)'}}
                    onMouseEnter={e=>e.currentTarget.style.background='#f0fdf4'}
                    onMouseLeave={e=>e.currentTarget.style.background=''}>
                    {ar?'— الكل —':'— הכל —'}
                  </div>
                  {farmers.filter(f=>{const q=farmerSearch.toLowerCase();return !q||(f.nameHeb||f.name||'').toLowerCase().includes(q);})
                    .map(f=>(
                      <div key={f.id} onMouseDown={()=>{setFilterFarmer(f.id);setFarmerSearch('');setShowFarmerList(false);}}
                        style={{padding:'8px 12px',fontSize:13,cursor:'pointer',fontFamily:'Heebo,sans-serif',fontWeight:600,background:filterFarmer===f.id?'#f0fdf4':''}}
                        onMouseEnter={e=>e.currentTarget.style.background='#f0fdf4'}
                        onMouseLeave={e=>e.currentTarget.style.background=filterFarmer===f.id?'#f0fdf4':''}>
                        {f.nameHeb||f.name}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* فلتر المنطقة */}
          <div className="form-group" style={{marginBottom:0}}>
            <label style={{fontSize:12}}>{ar?'المنطقة':'אזור'}</label>
            <select value={filterRegion} onChange={e=>setFilterRegion(e.target.value)}>
              <option value="">{ar?'كل المناطق':'כל האזורים'}</option>
              {regions.map(r=>(
                <option key={r.id} value={r.id}>
                  {r.name}{r.nameHeb&&r.nameHeb!==r.name?` — ${r.nameHeb}`:''}
                </option>
              ))}
            </select>
          </div>

          {/* فلتر السنة */}
          <div className="form-group" style={{marginBottom:0}}>
            <label style={{fontSize:12}}>{ar?'السنة':'שנה'}</label>
            <select value={filterYear} onChange={e=>setFilterYear(e.target.value)}>
              <option value="">{ar?'كل السنوات':'כל השנים'}</option>
              {years.map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* فلتر الدفع */}
          <div className="form-group" style={{marginBottom:0}}>
            <label style={{fontSize:12}}>{ar?'حالة الدفع':'סטטוס'}</label>
            <select value={filterPaid} onChange={e=>setFilterPaid(e.target.value)}>
              <option value="">{ar?'الكل':'הכל'}</option>
              <option value="paid">{ar?'مدفوع ✓':'שולם ✓'}</option>
              <option value="unpaid">{ar?'غير مدفوع ○':'לא שולם ○'}</option>
            </select>
          </div>

          <button className="btn btn-outline btn-sm" style={{alignSelf:'end'}}
            onClick={()=>{setFilterYear('');setFilterFarmer('');setFilterRegion('');setFilterPaid('');setFarmerSearch('');}}>
            {ar?'إعادة ضبط':'אפס'}
          </button>
        </div>
      </div>

      {/* ── ملخص ── */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:10, marginBottom:16}}>
        {[
          { label:ar?'عدد القراءات':'קריאות', value:filtered.length, icon:'📏' },
          { label:ar?'مدفوع':'שולם', value:`${paidCount}/${filtered.length}`, icon:'✅' },
          { label:ar?'إجمالي الأكواب':'קובים', value:grandCups.toLocaleString(), icon:'🪣' },
          { label:ar?'الإجمالي الكلي':'סה"כ', value:`₪${Math.round(grandTotal).toLocaleString()}`, icon:'💰', accent:true },
        ].map((s,i)=>(
          <div key={i} className={`stat-card ${s.accent?'accent':''}`} style={{padding:'12px 16px'}}>
            <div style={{fontSize:20,marginBottom:4}}>{s.icon}</div>
            <div style={{fontWeight:900,fontSize:'1.2rem',color:s.accent?'#fff':'var(--primary)'}}>{s.value}</div>
            <div style={{fontSize:11,opacity:0.75,color:s.accent?'#fff':'var(--text-muted)'}}>{s.label}</div>
          </div>
        ))}
      </div>


      {/* ── الجدول — نفس صفحة القراءات بدون تعديل/حذف ── */}
      <ReadingsTable
        readings={filtered}
        setReadings={() => {}}
        farmerName={farmerName}
        landName={landName}
        landRegion={landRegion}
        onEdit={() => {}}
        onDelete={() => {}}
        lang={lang}
        prices={prices}
        isViewer={true}
        lands={lands}
        regions={regions}
      />
    </div>
  );
}
