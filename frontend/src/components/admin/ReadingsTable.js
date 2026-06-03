import React, { useState } from 'react';
import { togglePaid, updateNote } from '../../api';

const getPrice = (prices, year, landId, idx) => {
  if (!prices) return 0;
  const lp = prices.landPrices?.[String(landId)];
  if (lp?.[`reading_${idx}`]) return parseFloat(lp[`reading_${idx}`]) || 0;
  if (lp?.default) return parseFloat(lp.default) || 0;
  const yp = prices.yearPrices?.[String(year)];
  if (yp?.[`reading_${idx}`]) return parseFloat(yp[`reading_${idx}`]) || 0;
  if (yp?.default) return parseFloat(yp.default) || 0;
  return parseFloat(prices?.globalPrice) || 0;
};

const cupsDiff = (readings, idx) => {
  if (idx === 0 || readings[idx] == null || readings[idx-1] == null) return null;
  const d = parseFloat(readings[idx]) - parseFloat(readings[idx-1]);
  return isNaN(d) ? null : d;
};

// ── زر الدفع ─────────────────────────────────────────────────
const PaidBtn = ({ paid, loading, onClick }) => (
  <button onClick={onClick} disabled={loading}
    title={paid ? 'שולם ✓' : 'לא שולם ✕'}
    style={{
      width:28, height:28, borderRadius:'50%',
      border: paid ? '2px solid #16a34a' : '2px solid #ef4444',
      background: paid ? '#dcfce7' : '#fee2e2',
      color: paid ? '#15803d' : '#dc2626',
      cursor: loading ? 'wait' : 'pointer',
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      fontSize:13, fontWeight:900, transition:'all 0.18s',
      opacity: loading ? 0.5 : 1, flexShrink:0,
      boxShadow: paid ? '0 1px 4px rgba(22,163,74,0.3)' : '0 1px 4px rgba(239,68,68,0.2)',
    }}
    onMouseEnter={e => { if(!loading) e.currentTarget.style.transform='scale(1.15)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform='scale(1)'; }}
  >{loading ? '·' : paid ? '✓' : '✕'}</button>
);

// ── زر أيقونة صغير ───────────────────────────────────────────
const IconBtn = ({ onClick, title, bg, hoverBg, color, hoverColor, border, children }) => (
  <button onClick={onClick} title={title}
    style={{
      width:28, height:28, borderRadius:7, border,
      background: bg, color, cursor:'pointer',
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      fontSize:13, transition:'all 0.18s', flexShrink:0,
    }}
    onMouseEnter={e => { e.currentTarget.style.background=hoverBg; e.currentTarget.style.color=hoverColor; }}
    onMouseLeave={e => { e.currentTarget.style.background=bg; e.currentTarget.style.color=color; }}
  >{children}</button>
);

export default function ReadingsTable({ readings, setReadings, farmerName, landName, landRegion, onEdit, onDelete, lang, prices }) {
  const [expandedId, setExpandedId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [editNoteId, setEditNoteId] = useState(null);
  const [noteText,   setNoteText]   = useState('');
  const [savingNote, setSavingNote]   = useState(false);
  const [sortKey,    setSortKey]    = useState(null);
  const [sortDir,    setSortDir]    = useState('asc');
  const [mapModal,   setMapModal]   = useState(null); // { lat, lng, name }

  const ar = lang === 'ar';

  // ── Sort ──────────────────────────────────────────────────
  const handleSort = key => {
    if (sortKey === key) setSortDir(d => d==='asc'?'desc':'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setExpandedId(null);
  };

  const sorted = [...readings].sort((a,b) => {
    if (!sortKey) return 0;
    let va, vb;
    if      (sortKey==='farmer')  { va=farmerName(a.farmerId); vb=farmerName(b.farmerId); }
    else if (sortKey==='land')    { va=landName(a.landId);     vb=landName(b.landId); }
    else if (sortKey==='year')    { va=a.year;                 vb=b.year; }
    else if (sortKey==='station') { va=a.stationNumber||'';    vb=b.stationNumber||''; }
    else if (sortKey==='total')   {
      va = (a.readings||[]).slice(1).reduce((s,_,i)=>s+(cupsDiff(a.readings,i+1)||0),0);
      vb = (b.readings||[]).slice(1).reduce((s,_,i)=>s+(cupsDiff(b.readings,i+1)||0),0);
    }
    else if (sortKey==='amount')  {
      va = (a.readings||[]).slice(1).reduce((s,_,i)=>s+(cupsDiff(a.readings,i+1)||0)*getPrice(prices,a.year,a.landId,i+1),0);
      vb = (b.readings||[]).slice(1).reduce((s,_,i)=>s+(cupsDiff(b.readings,i+1)||0)*getPrice(prices,b.year,b.landId,i+1),0);
    }
    else if (sortKey==='paid')    { va=a.paid?1:0; vb=b.paid?1:0; }
    if (typeof va==='string') return sortDir==='asc' ? va.localeCompare(vb,'he') : vb.localeCompare(va,'he');
    return sortDir==='asc' ? va-vb : vb-va;
  });

  const SI = ({ col }) => sortKey!==col
    ? <span style={{opacity:0.2,fontSize:9}}>⇅</span>
    : <span style={{fontSize:9,color:'var(--primary)'}}>{sortDir==='asc'?'▲':'▼'}</span>;

  const STh = ({ col, children, style={} }) => (
    <th onClick={()=>handleSort(col)}
      style={{ cursor:'pointer', userSelect:'none', whiteSpace:'nowrap', ...style }}
      onMouseEnter={e=>e.currentTarget.style.background='#d4edda'}
      onMouseLeave={e=>e.currentTarget.style.background=''}>
      <span style={{display:'inline-flex',alignItems:'center',gap:3}}>{children} <SI col={col}/></span>
    </th>
  );

  // ── Paid toggle ───────────────────────────────────────────
  const handlePaid = async (e,r) => {
    e.stopPropagation();
    if (togglingId) return;
    setTogglingId(r.id);
    try {
      const res = await togglePaid(r.id);
      setReadings(prev => prev.map(x => x.id===r.id ? {...x,paid:res.paid,paidAt:res.paidAt} : x));
    } catch(err) { alert(ar?'خطأ':'שגיאה'); }
    finally { setTogglingId(null); }
  };

  // ── Note ──────────────────────────────────────────────────
  const openNote = (e,r) => { e.stopPropagation(); setEditNoteId(r.id); setNoteText(r.note||''); };
  const saveNote = async (e,r) => {
    e.stopPropagation(); setSavingNote(true);
    try {
      await updateNote(r.id, noteText);
      setReadings(prev => prev.map(x => x.id===r.id ? {...x,note:noteText} : x));
      setEditNoteId(null);
    } catch {}
    finally { setSavingNote(false); }
  };

  // ── Totals ────────────────────────────────────────────────
  const maxReadings = Math.max(2, ...readings.map(r=>r.readings?.length||0));
  const cupsCols    = maxReadings - 1;

  const grandCups   = sorted.reduce((s,r)=>s+(r.readings||[]).slice(1).reduce((ss,_,i)=>ss+(cupsDiff(r.readings,i+1)||0),0),0);
  const grandAmount = sorted.reduce((s,r)=>s+(r.readings||[]).slice(1).reduce((ss,_,i)=>ss+(cupsDiff(r.readings,i+1)||0)*getPrice(prices,r.year,r.landId,i+1),0),0);
  const paidCount   = readings.filter(r=>r.paid).length;

  // ── Map Modal ──────────────────────────────────────────────
  const MapModal = () => {
    if (!mapModal) return null;
    const { lat, lng, name } = mapModal;
    const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.005},${lat-0.005},${lng+0.005},${lat+0.005}&layer=mapnik&marker=${lat},${lng}`;
    // رابط Google Earth يفتح المشروع على الإحداثيات المحددة
    const earthUrl = `https://earth.google.com/web/@${lat},${lng},400a,800d,30y,0h,0t,0r/data=CgRCAggBMikKJwolCiExS0M0V193eFlWeTQ2UFR6RW81VkFtVVlvMDNHemUtUHQgAToDCgEwQgIIAEoICLG2obACEAE`;
    const mapsUrl  = earthUrl;
    return (
      <div
        onClick={() => setMapModal(null)}
        style={{
          position:'fixed', inset:0, zIndex:9999,
          background:'rgba(0,0,0,0.65)',
          display:'flex', alignItems:'center', justifyContent:'center',
          padding:20,
        }}>
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background:'#fff', borderRadius:16, overflow:'hidden',
            width:'100%', maxWidth:600,
            boxShadow:'0 20px 60px rgba(0,0,0,0.4)',
          }}>
          {/* Header */}
          <div style={{
            padding:'14px 18px', background:'var(--primary-dark)',
            display:'flex', alignItems:'center', justifyContent:'space-between',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:20 }}>📍</span>
              <div>
                <div style={{ color:'#fff', fontWeight:800, fontSize:15 }}>{name}</div>
                <div style={{ color:'rgba(255,255,255,0.6)', fontSize:12 }}>{lat}, {lng}</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                style={{ color:'#a3e635', fontSize:12, fontWeight:700, textDecoration:'none',
                  background:'rgba(255,255,255,0.1)', padding:'5px 10px', borderRadius:8 }}>
                🗺️ {ar?'فتح في Google Earth 🌍':'פתח ב-Google Earth 🌍'}
              </a>
              <button onClick={() => setMapModal(null)}
                style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff',
                  width:30, height:30, borderRadius:'50%', cursor:'pointer', fontSize:16,
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                ✕
              </button>
            </div>
          </div>
          {/* Map */}
          <iframe
            src={embedUrl}
            width="100%" height="380"
            style={{ border:0, display:'block' }}
            allowFullScreen loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="map"
          />
        </div>
      </div>
    );
  };

  if (readings.length===0) return (
    <div className="card empty-state"><span className="icon">📏</span><p>{ar?'لا توجد قراءات':'אין קריאות'}</p></div>
  );

  // ── TH style helpers ──────────────────────────────────────
  const thBase   = { padding:'10px 10px', fontSize:12, fontWeight:800, whiteSpace:'nowrap' };
  const thCups   = { ...thBase, background:'#e8f5e9', color:'var(--primary)', textAlign:'center', minWidth:70 };
  const thTotal  = { ...thBase, background:'#c8e6c9', color:'var(--primary-dark)', textAlign:'center', minWidth:75 };
  const thAmount = { ...thBase, background:'#fef08a', color:'#854d0e', textAlign:'center', minWidth:90 };

  return (
    <div className="card">
      <MapModal />
      {/* ── إحصائية ── */}
      <div className="flex-between mb-12" style={{flexWrap:'wrap',gap:8}}>
        <div className="flex-gap gap-12">
          <span style={{color:'var(--text-muted)',fontSize:13}}>{readings.length} {ar?'قراءة':'קריאות'}</span>
          <span style={{color:'#16a34a',fontWeight:700,fontSize:13}}>✓ {paidCount} {ar?'مدفوع':'שולם'}</span>
          <span style={{color:'#dc2626',fontWeight:700,fontSize:13}}>✕ {readings.length-paidCount} {ar?'غير مدفوع':'לא שולם'}</span>
        </div>
        <span style={{fontSize:12,color:'var(--text-muted)'}}>
          💡 {ar?'اضغط على الصف لأرقام الساعات':'לחץ על שורה לקריאות'}
        </span>
      </div>

      <div className="tbl-wrap">
        <table style={{minWidth:600}}>
          <thead>
            <tr>
              {/* ── أعمدة ثابتة ── */}
              <STh col="paid"    style={{...thBase, minWidth:50, textAlign:'center'}}>{ar?'دفع':'תשלום'}</STh>
              <STh col="farmer"  style={{...thBase, minWidth:110}}>{ar?'المزارع':'חקלאי'}</STh>
              <STh col="land"    style={{...thBase, minWidth:100}}>{ar?'الأرض':'קרקע'}</STh>
              <STh col="year"    style={{...thBase, minWidth:60, textAlign:'center'}}>{ar?'السنة':'שנה'}</STh>
              <STh col="station" style={{...thBase, minWidth:65, textAlign:'center', fontFamily:'monospace'}}>{ar?'المحطة':'עמדה'}</STh>

              {/* ── أعمدة الأكواب ── */}
              {Array.from({length:cupsCols}).map((_,i) => (
                <STh key={i} col={`cups_${i}`} style={thCups}>🪣 {ar?`ف${i+1}`:`ת${i+1}`}</STh>
              ))}

              {/* ── إجمالي + مبلغ ── */}
              <STh col="total"  style={thTotal}>🪣 {ar?'الكل':'כלל'}</STh>
              <th style={{ ...thBase, minWidth:80, background:'#fff3e0', color:'#e65100', textAlign:'center' }}>
                ➕ {ar?'إضافات':'תוספות'}
              </th>
              <STh col="amount" style={{...thAmount, minWidth:100}}>💰 {ar?'الإجمالي':'סה"כ'}</STh>

              {/* ── ملاحظة + إجراءات ── */}
              <th style={{...thBase, minWidth:90, textAlign:'center'}}>💬</th>
              <th style={{...thBase, minWidth:70, textAlign:'center'}}></th>
            </tr>
          </thead>

          <tbody>
            {sorted.map(r => {
              const expanded      = expandedId===r.id;
              const vals          = r.readings||[];
              const cupsPerPeriod = Array.from({length:cupsCols}).map((_,i)=>cupsDiff(vals,i+1));
              const totalCups     = cupsPerPeriod.reduce((s,c)=>s+(c||0),0);
              const rowAmount     = cupsPerPeriod.reduce((s,c,i)=>s+(c||0)*getPrice(prices,r.year,r.landId,i+1),0);
              const isPaid        = !!r.paid;

              const rowBg   = isPaid ? 'rgba(220,252,231,0.5)' : 'rgba(254,226,226,0.35)';
              const cupsBg  = isPaid ? '#d1fae5' : '#fee2e2';
              const totalBg = isPaid ? '#a7f3d0' : '#fecaca';
              const amtBg   = isPaid ? '#fef9c3' : '#fef3c7';

              return (
                <React.Fragment key={r.id}>
                  <tr onClick={()=>setExpandedId(p=>p===r.id?null:r.id)}
                    style={{cursor:'pointer', background:rowBg, borderRight:`3px solid ${isPaid?'#16a34a':'#ef4444'}`, transition:'filter 0.15s'}}
                    onMouseEnter={e=>e.currentTarget.style.filter='brightness(0.96)'}
                    onMouseLeave={e=>e.currentTarget.style.filter=''}>

                    {/* دفع */}
                    <td style={{textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                      <PaidBtn paid={isPaid} loading={togglingId===r.id} onClick={e=>handlePaid(e,r)}/>
                    </td>

                    {/* بيانات */}
                    <td><strong style={{fontFamily:'Heebo,sans-serif',fontSize:14}}>{farmerName(r.farmerId)}</strong></td>
                    <td style={{fontFamily:'Heebo,sans-serif',fontSize:13}}>{landName(r.landId)}</td>
                    <td style={{textAlign:'center'}}><span className="badge badge-blue">{r.year}</span></td>
                    <td style={{textAlign:'center'}} onClick={e => e.stopPropagation()}>
                      {r.stationNumber ? (
                        r.stationLat && r.stationLng ? (
                          <button
                            onClick={e => { e.stopPropagation(); setMapModal({ lat:r.stationLat, lng:r.stationLng, name:r.stationNumber }); }}
                            title={ar?'عرض الموقع':'הצג מיקום'}
                            style={{
                              display:'inline-flex', alignItems:'center', gap:5,
                              fontFamily:'monospace', fontWeight:900, fontSize:13,
                              color:'var(--primary)', background:'#dcfce7',
                              padding:'4px 10px', borderRadius:6,
                              border:'1.5px solid #16a34a', cursor:'pointer', transition:'all 0.2s',
                            }}
                            onMouseEnter={e=>{e.currentTarget.style.background='#16a34a';e.currentTarget.style.color='#fff';}}
                            onMouseLeave={e=>{e.currentTarget.style.background='#dcfce7';e.currentTarget.style.color='var(--primary)';}}
                          >
                            {r.stationNumber} <span style={{fontSize:12}}>📍</span>
                          </button>
                        ) : (
                          <span style={{fontFamily:'monospace',fontWeight:900,fontSize:13,color:'var(--primary)',background:'var(--surface-2)',padding:'3px 10px',borderRadius:6}}>
                            {r.stationNumber}
                          </span>
                        )
                      ) : (
                        <span style={{color:'var(--border)'}}>—</span>
                      )}
                    </td>

                    {/* أكواب كل فترة */}
                    {cupsPerPeriod.map((cups,i) => (
                      <td key={i} style={{textAlign:'center', background:cupsBg}}>
                        {cups!==null
                          ? <strong style={{fontSize:14,color:'var(--primary-dark)'}}>{cups.toLocaleString()}</strong>
                          : <span style={{color:'var(--border)'}}>—</span>}
                      </td>
                    ))}

                    {/* إجمالي الأكواب */}
                    <td style={{textAlign:'center', background:totalBg}}>
                      <strong style={{fontSize:15,color:'var(--primary-dark)'}}>{totalCups.toLocaleString()}</strong>
                    </td>

                    {/* ➕ إضافات مع المبلغ المدفوع */}
                    <td style={{textAlign:'center', background:'#fff8e1'}} onClick={e=>e.stopPropagation()}>
                      {(r.extra > 0) ? (() => {
                        const extra    = parseFloat(r.extra) || 0;
                        const paid     = parseFloat(r.extraPaid) || 0;
                        const remaining = extra - paid;
                        const isFullPaid = paid >= extra;
                        const isPartial  = paid > 0 && paid < extra;
                        return (
                          <div title={r.extraNote||''} style={{ cursor: r.extraNote?'help':'default', lineHeight:1.3 }}>
                            {/* المبلغ الكلي */}
                            <div style={{
                              fontWeight:800, fontSize:13,
                              color: isFullPaid ? '#9ca3af' : '#e65100',
                              textDecoration: isFullPaid ? 'line-through' : 'none',
                            }}>
                              +₪{extra.toLocaleString()}
                            </div>
                            {/* المدفوع / المتبقي */}
                            {isFullPaid && (
                              <div style={{fontSize:10, color:'#16a34a', fontWeight:700}}>✓ {ar?'مدفوع':'שולם'}</div>
                            )}
                            {isPartial && (
                              <div style={{fontSize:10, color:'#ca8a04', fontWeight:700}}>
                                {ar?'متبقي':'נותר'}: ₪{remaining.toLocaleString()}
                              </div>
                            )}
                            {r.extraNote && (
                              <div style={{fontSize:9, color:'#9ca3af', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:80}}>{r.extraNote}</div>
                            )}
                          </div>
                        );
                      })() : <span style={{color:'var(--border)',fontSize:12}}>—</span>}
                    </td>
                    {/* 💰 الإجمالي = أكواب + إضافة - مدفوع من الإضافة */}
                    <td style={{textAlign:'center', background:amtBg, borderLeft:'2px solid #f59e0b'}}>
                      <strong style={{fontSize:15,color:'#92400e'}}>
                        ₪{(rowAmount + (parseFloat(r.extra)||0) - (parseFloat(r.extraPaid)||0)).toLocaleString()}
                      </strong>
                    </td>

                    {/* ملاحظة */}
                    <td style={{textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                      {editNoteId===r.id ? (
                        <div style={{display:'flex',flexDirection:'column',gap:4,minWidth:140}}>
                          <textarea autoFocus value={noteText} onChange={e=>setNoteText(e.target.value)} rows={2}
                            style={{fontSize:12,padding:'4px 8px',borderRadius:6,border:'1.5px solid var(--primary)',fontFamily:'Tajawal,Heebo,sans-serif',resize:'none',width:'100%'}}
                            onClick={e=>e.stopPropagation()}/>
                          <div className="flex-gap gap-4">
                            <button onClick={e=>saveNote(e,r)} disabled={savingNote}
                              style={{flex:1,padding:'3px 6px',borderRadius:5,border:'none',background:'var(--primary)',color:'#fff',fontSize:11,cursor:'pointer'}}>
                              {savingNote?'⏳':'💾'}
                            </button>
                            <button onClick={e=>{e.stopPropagation();setEditNoteId(null);}}
                              style={{padding:'3px 8px',borderRadius:5,border:'1px solid var(--border)',background:'transparent',fontSize:11,cursor:'pointer'}}>✕</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={e=>openNote(e,r)}
                          style={{
                            background: r.note?'var(--amber-100)':'var(--surface-2)',
                            border: r.note?'1.5px solid var(--amber-400)':'1.5px solid var(--border)',
                            borderRadius:8, padding:'4px 8px', cursor:'pointer', fontSize:13,
                            display:'flex', alignItems:'center', gap:4, maxWidth:110, overflow:'hidden',
                          }}>
                          <span>{r.note?'💬':'➕'}</span>
                          {r.note&&<span style={{fontSize:11,color:'#78350f',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:70}}>{r.note}</span>}
                        </button>
                      )}
                    </td>

                    {/* إجراءات */}
                    <td style={{textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                      <div className="flex-gap gap-6" style={{justifyContent:'center'}}>
                        <IconBtn onClick={()=>onEdit(r)} title={ar?'تعديل':'עריכה'}
                          bg="var(--surface-2)" hoverBg="var(--primary)"
                          color="var(--primary)" hoverColor="#fff"
                          border="1.5px solid var(--border)">✏</IconBtn>
                        <IconBtn onClick={()=>onDelete(r.id)} title={ar?'حذف':'מחיקה'}
                          bg="#fff1f2" hoverBg="#dc2626"
                          color="#dc2626" hoverColor="#fff"
                          border="1.5px solid #fca5a5">✕</IconBtn>
                      </div>
                    </td>
                  </tr>

                  {/* تفاصيل أرقام الساعات */}
                  {expanded && (
                    <tr style={{background: isPaid?'#f0fdf4':'#fff5f5'}}>
                      <td colSpan={6+cupsCols+4} style={{padding:'10px 16px'}}>
                        <div className="flex-gap gap-8" style={{flexWrap:'wrap',alignItems:'center'}}>
                          <span style={{fontSize:12,color:'var(--text-muted)',fontWeight:700}}>
                            📟 {ar?'أرقام العداد:':'קריאות מד המים:'}
                          </span>
                          {vals.map((v,i) => (
                            <React.Fragment key={i}>
                              <div style={{textAlign:'center'}}>
                                <div style={{fontSize:10,color:'var(--text-muted)',fontWeight:700,marginBottom:2}}>
                                  {ar?`ق${i+1}`:`ק${i+1}`}{i===0?(ar?' (أولى)':' (ראשונה)'):''}
                                </div>
                                <div style={{background:'white',border:'1.5px solid var(--border)',borderRadius:8,padding:'5px 12px',fontWeight:800,fontSize:15,fontFamily:'monospace',color:'var(--primary-dark)'}}>
                                  {Number(v).toLocaleString()}
                                </div>
                              </div>
                              {i<vals.length-1&&<span style={{color:'var(--text-muted)'}}>←</span>}
                            </React.Fragment>
                          ))}
                          {isPaid&&r.paidAt&&(
                            <span style={{fontSize:11,color:'#16a34a',marginRight:'auto'}}>
                              ✓ {ar?'مدفوع':'שולם'} {new Date(r.paidAt).toLocaleDateString(ar?'ar-SA':'he-IL')}
                            </span>
                          )}
                          {r.note&&(
                            <span style={{fontSize:12,background:'var(--amber-100)',border:'1px solid var(--amber-400)',borderRadius:8,padding:'4px 10px',color:'#78350f',fontWeight:600}}>
                              💬 {r.note}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {/* ── صف الإجمالي ── */}
            {sorted.length > 1 && (
              <tr style={{background:'linear-gradient(90deg,#14532d,#166534)', borderTop:'2px solid #14532d'}}>
                <td colSpan={5} style={{fontWeight:900,color:'#fff',fontSize:14,padding:'11px 14px'}}>
                  ⚡ {ar?'الإجمالي الكلي':'סה"כ כללי'}
                </td>
                {Array.from({length:cupsCols}).map((_,i) => {
                  const col = sorted.reduce((s,r)=>s+(cupsDiff(r.readings||[],i+1)||0),0);
                  return (
                    <td key={i} style={{textAlign:'center',padding:'11px 8px'}}>
                      <span style={{fontWeight:900,color:'#a3e635',fontSize:15}}>{col.toLocaleString()}</span>
                    </td>
                  );
                })}
                <td style={{textAlign:'center',padding:'11px 8px'}}>
                  <span style={{fontWeight:900,color:'#a3e635',fontSize:17}}>{grandCups.toLocaleString()}</span>
                </td>
                <td style={{textAlign:'center',padding:'11px 8px',borderLeft:'2px solid #a3e635'}}>
                  <span style={{fontWeight:900,color:'#fde68a',fontSize:19}}>
                    ₪{(grandAmount
                      + sorted.reduce((s,r)=>s+(parseFloat(r.extra)||0),0)
                      - sorted.reduce((s,r)=>s+(parseFloat(r.extraPaid)||0),0)
                    ).toLocaleString()}
                  </span>
                </td>
                <td colSpan={2}/>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
