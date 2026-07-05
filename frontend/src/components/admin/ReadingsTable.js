import React, { useState } from 'react';
import { togglePaid, updateNote } from '../../api';
import { getPrice } from '../../utils/pricing'; // ✅ سعر موحّد شامل الضريبة (מע"מ)
import { cupsDiff, cupsPositive } from '../../utils/cups'; // ✅ فرق أكواب موحّد
import { getExtrasList as getExtras, getExtrasNet } from '../../utils/extras'; // ✅ إضافات موحّدة

const PaidBtn = ({ paid, loading, onClick }) => (
  <button onClick={onClick} disabled={loading}
    title={paid ? 'שולם ✓' : 'לא שולם'}
    style={{ width:18, height:18, borderRadius:'50%', border: paid ? '2px solid #4ade80' : '2px solid #f87171', background: 'transparent', cursor: loading ? 'wait' : 'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', transition:'all 0.25s', opacity: loading ? 0.5 : 1, flexShrink:0, position:'relative', animation: !paid && !loading ? 'pulse-red 2.5s ease-in-out infinite' : 'none' }}
    onMouseEnter={e => { if(!loading) e.currentTarget.style.transform='scale(1.15)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform='scale(1)'; }}>
    <span style={{ width: paid ? 7 : 6, height: paid ? 7 : 6, borderRadius:'50%', background: paid ? '#4ade80' : '#f87171', display:'block', transition:'all 0.25s' }}/>
    <style>{`@keyframes pulse-red{0%{box-shadow:0 0 0 0 rgba(248,113,113,0.3);}60%{box-shadow:0 0 0 5px rgba(248,113,113,0);}100%{box-shadow:0 0 0 0 rgba(248,113,113,0);}}`}</style>
  </button>
);

const IconBtn = ({ onClick, title, bg, hoverBg, color, hoverColor, border, children }) => (
  <button onClick={onClick} title={title}
    style={{ width:28, height:28, borderRadius:7, border, background: bg, color, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:13, transition:'all 0.18s', flexShrink:0 }}
    onMouseEnter={e => { e.currentTarget.style.background=hoverBg; e.currentTarget.style.color=hoverColor; }}
    onMouseLeave={e => { e.currentTarget.style.background=bg; e.currentTarget.style.color=color; }}
  >{children}</button>
);

export default function ReadingsTable({
  readings, setReadings, farmerName, landName, landRegion,
  onEdit, onDelete, lang, prices, isViewer=false, lands=[], regions=[],
}) {
  const [expandedId, setExpandedId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [editNoteId, setEditNoteId] = useState(null);
  const [noteText,   setNoteText]   = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [sortKey,    setSortKey]    = useState(null);
  const [sortDir,    setSortDir]    = useState('asc');
  const [mapModal,   setMapModal]   = useState(null);
  const ar = lang === 'ar';

  const handleSort = key => {
    if (sortKey === key) setSortDir(d => d==='asc' ? 'desc' : 'asc');
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
    else if (sortKey==='total')   { va=(a.readings||[]).slice(1).reduce((s,_,i)=>s+cupsPositive(a.readings,i),0); vb=(b.readings||[]).slice(1).reduce((s,_,i)=>s+cupsPositive(b.readings,i),0); }
    else if (sortKey==='amount')  { va=(a.readings||[]).slice(1).reduce((s,_,i)=>s+cupsPositive(a.readings,i)*getPrice(prices,a.year,a.landId,i+1),0); vb=(b.readings||[]).slice(1).reduce((s,_,i)=>s+cupsPositive(b.readings,i)*getPrice(prices,b.year,b.landId,i+1),0); }
    else if (sortKey==='paid')    { va=a.paid?1:0; vb=b.paid?1:0; }
    if (typeof va==='string') return sortDir==='asc' ? va.localeCompare(vb,'he') : vb.localeCompare(va,'he');
    return sortDir==='asc' ? va-vb : vb-va;
  });

  const SI = ({ col }) => sortKey!==col ? <span style={{opacity:0.2,fontSize:9}}>⇅</span> : <span style={{fontSize:9,color:'var(--primary)'}}>{sortDir==='asc'?'▲':'▼'}</span>;
  const STh = ({ col, children, style={} }) => (
    <th onClick={()=>handleSort(col)} style={{ cursor:'pointer', userSelect:'none', whiteSpace:'nowrap', ...style }}
      onMouseEnter={e=>e.currentTarget.style.background='#d4edda'} onMouseLeave={e=>e.currentTarget.style.background=''}>
      <span style={{display:'inline-flex',alignItems:'center',gap:3}}>{children} <SI col={col}/></span>
    </th>
  );

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

  const maxReadings = Math.max(2, ...readings.map(r=>r.readings?.length||0));
  const cupsCols    = maxReadings - 1;
  const grandCups   = sorted.reduce((s,r)=>s+(r.readings||[]).slice(1).reduce((ss,_,i)=>ss+cupsPositive(r.readings,i),0),0);
  const grandAmount = sorted.reduce((s,r)=>s+(r.readings||[]).slice(1).reduce((ss,_,i)=>ss+cupsPositive(r.readings,i)*getPrice(prices,r.year,r.landId,i+1),0),0);
  const paidCount   = readings.filter(r=>r.paid).length;

  // ✅ إجمالي الإضافات
  const grandExtrasRem = sorted.reduce((s,r) => s + getExtrasNet(r), 0);

  const MapModal = () => {
    if (!mapModal) return null;
    const { lat, lng, name } = mapModal;
    const esriUrl  = `https://maps.google.com/maps?q=${lat},${lng}&z=18&t=k&output=embed&markers=${lat},${lng}`;
    const earthUrl = `https://earth.google.com/web/@${lat},${lng},400a,800d,30y,0h,0t,0r/data=CgRCAggBMikKJwolCiExS0M0V193eFlWeTQ2UFR6RW81VkFtVVlvMDNHemUtUHQgAToDCgEwQgIIAEoICIXm6fQFEAE?hl=ar`;
    return (
      <div onClick={() => setMapModal(null)} style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.65)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
        <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, overflow:'hidden', width:'100%', maxWidth:600, boxShadow:'0 20px 60px rgba(0,0,0,0.4)' }}>
          <div style={{ padding:'14px 18px', background:'var(--primary-dark)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:20 }}>📍</span>
              <div>
                <div style={{ color:'#fff', fontWeight:800, fontSize:15 }}>{name}</div>
                <div style={{ color:'rgba(255,255,255,0.6)', fontSize:12 }}>{lat}, {lng}</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <a href={earthUrl} target="_blank" rel="noopener noreferrer" style={{ color:'#a3e635', fontSize:12, fontWeight:700, textDecoration:'none', background:'rgba(255,255,255,0.1)', padding:'5px 10px', borderRadius:8 }}>
                🗺️ {ar ? 'فتح في Google Earth 🌍' : 'פתח ב-Google Earth 🌍'}
              </a>
              <button onClick={() => setMapModal(null)} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:30, height:30, borderRadius:'50%', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>
          </div>
          <div style={{ position:'relative' }}>
            <iframe src={esriUrl} width="100%" height="380" style={{ border:0, display:'block' }} allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="map" />
            <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%, -100%)', pointerEvents:'none', display:'flex', flexDirection:'column', alignItems:'center' }}>
              {(() => {
                const land = mapModal && lands.find(l => l.stationNumber === mapModal.name);
                const desc = land?.description;
                if (!desc) return null;
                const lines = desc.split(/[،,\n]/).map(s=>s.trim()).filter(Boolean);
                return (
                  <div style={{ background:'rgba(22,163,74,0.95)', color:'#fff', borderRadius:10, padding:'6px 12px', marginBottom:6, boxShadow:'0 3px 12px rgba(0,0,0,0.35)', border:'2px solid #fff', maxWidth:220, textAlign:'center', fontFamily:'Heebo,sans-serif', fontSize:13, fontWeight:700, lineHeight:1.6 }}>
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

  if (readings.length===0) return (
    <div className="card empty-state"><span className="icon">📏</span><p>{ar?'لا توجد قراءات':'אין קריאות'}</p></div>
  );

  const thBase   = { padding:'10px 10px', fontSize:12, fontWeight:800, whiteSpace:'nowrap' };
  const thCups   = { ...thBase, background:'#e8f5e9', color:'var(--primary)', textAlign:'center', minWidth:70 };
  const thTotal  = { ...thBase, background:'#c8e6c9', color:'var(--primary-dark)', textAlign:'center', minWidth:75 };
  const thAmount = { ...thBase, background:'#fef08a', color:'#854d0e', textAlign:'center', minWidth:90 };

  return (
    <div className="card">
      <MapModal />
      <div className="flex-between mb-12" style={{flexWrap:'wrap',gap:8}}>
        <div className="flex-gap gap-12">
          <span style={{color:'var(--text-muted)',fontSize:13}}>{readings.length} {ar?'قراءة':'קריאות'}</span>
          <span style={{color:'#16a34a',fontWeight:700,fontSize:13}}>✓ {paidCount} {ar?'مدفوع':'שולם'}</span>
          <span style={{color:'#dc2626',fontWeight:700,fontSize:13}}>✕ {readings.length-paidCount} {ar?'غير مدفوع':'לא שולם'}</span>
        </div>
        <span style={{fontSize:12,color:'var(--text-muted)'}}>💡 {ar?'اضغط على الصف لأرقام الساعات':'לחץ על שורה לקריאות'}</span>
      </div>

      <div className="tbl-wrap">
        <table style={{minWidth:600}}>
          <thead>
            <tr>
              <STh col="paid"    style={{...thBase, minWidth:50, textAlign:'center'}}>{ar?'دفع':'תשלום'}</STh>
              <STh col="farmer"  style={{...thBase, minWidth:110}}>{ar?'المزارع':'חקלאי'}</STh>
              <STh col="land"    style={{...thBase, minWidth:100}}>{ar?'المنطقة':'אזור'}</STh>
              <STh col="year"    style={{...thBase, minWidth:60, textAlign:'center'}}>{ar?'السنة':'שנה'}</STh>
              <STh col="station" style={{...thBase, minWidth:65, textAlign:'center', fontFamily:'monospace'}}>{ar?'المحطة':'עמדה'}</STh>
              {Array.from({length:cupsCols}).map((_,i) => (
                <STh key={i} col={`cups_${i}`} style={thCups}>🪣 {ar?`ف${i+1}`:`ת${i+1}`}</STh>
              ))}
              <STh col="total"  style={thTotal}>🪣 {ar?'الكل':'כלל'}</STh>
              <th style={{ ...thBase, minWidth:90, background:'#fff3e0', color:'#e65100', textAlign:'center' }}>➕ {ar?'إضافات':'תוספות'}</th>
              <STh col="amount" style={{...thAmount, minWidth:100}}>💰 {ar?'الإجمالي':'סה"כ'}</STh>
              <th style={{...thBase, minWidth:90, textAlign:'center'}}>💬</th>
              <th style={{...thBase, minWidth:70, textAlign:'center'}}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const expanded      = expandedId===r.id;
              const vals          = r.readings||[];
              const cupsPerPeriod = Array.from({length:cupsCols}).map((_,i)=>cupsDiff(vals,i));
              const totalCups     = cupsPerPeriod.reduce((s,c)=>s+(c && c>0 ? c : 0),0);
              const rowAmount     = cupsPerPeriod.reduce((s,c,i)=>s+(c && c>0 ? c : 0)*getPrice(prices,r.year,r.landId,i+1),0);
              const isPaid        = !!r.paid;
              const rowBg   = isPaid ? 'rgba(220,252,231,0.5)' : 'rgba(254,226,226,0.35)';
              const cupsBg  = isPaid ? '#d1fae5' : '#fee2e2';
              const totalBg = isPaid ? '#a7f3d0' : '#fecaca';
              const amtBg   = isPaid ? '#fef9c3' : '#fef3c7';

              // ✅ إجمالي الإضافات للصف
              const rowExtras = getExtras(r);
              const rowExtrasTotal = rowExtras.reduce((s,e)=>(s+(parseFloat(e.amount)||0)-(parseFloat(e.paid)||0)),0);

              return (
                <React.Fragment key={r.id}>
                  <tr onClick={()=>setExpandedId(p=>p===r.id?null:r.id)}
                    style={{cursor:'pointer', background:rowBg, borderRight:`3px solid ${isPaid?'#16a34a':'#ef4444'}`, transition:'filter 0.15s'}}
                    onMouseEnter={e=>e.currentTarget.style.filter='brightness(0.96)'}
                    onMouseLeave={e=>e.currentTarget.style.filter=''}>

                    <td style={{textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                      {isViewer ? <span style={{fontSize:16}}>{isPaid?'✓':'○'}</span>
                        : <PaidBtn paid={isPaid} loading={togglingId===r.id} onClick={e=>handlePaid(e,r)}/>}
                    </td>
                    <td><strong style={{fontFamily:'Heebo,sans-serif',fontSize:14}}>{farmerName(r.farmerId)}</strong></td>
                    <td style={{fontFamily:'Heebo,sans-serif',fontSize:13}}>{landName(r.landId)}</td>
                    <td style={{textAlign:'center'}}><span className="badge badge-blue">{r.year}</span></td>

                    <td style={{textAlign:'center'}} onClick={e => e.stopPropagation()}>
                      {(() => {
                        const land = lands.find(l => String(l.id) === String(r.landId));
                        const lat  = land?.stationLat || r.stationLat;
                        const lng  = land?.stationLng || r.stationLng;
                        const num  = land?.stationNumber || r.stationNumber;
                        if (!num) return <span style={{color:'var(--border)'}}>—</span>;
                        if (lat && lng) return (
                          <button onClick={e => { e.stopPropagation(); setMapModal({ lat, lng, name:num }); }}
                            style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:5, fontFamily:'monospace', fontWeight:900, fontSize:13, color:'var(--primary)', background:'#dcfce7', padding:'4px 0', borderRadius:6, border:'1.5px solid #16a34a', cursor:'pointer', transition:'all 0.2s', minWidth:68, textAlign:'center' }}
                            onMouseEnter={e=>{e.currentTarget.style.background='#16a34a';e.currentTarget.style.color='#fff';}}
                            onMouseLeave={e=>{e.currentTarget.style.background='#dcfce7';e.currentTarget.style.color='var(--primary)';}}>
                            {num} <span style={{fontSize:12}}>📍</span>
                          </button>
                        );
                        return <span style={{fontFamily:'monospace',fontWeight:900,fontSize:13,color:'var(--primary)',background:'var(--surface-2)',padding:'3px 0',borderRadius:6,display:'inline-block',minWidth:68,textAlign:'center'}}>{num}</span>;
                      })()}
                    </td>

                    {cupsPerPeriod.map((cups,i) => {
                      const rawB = vals[i+1];
                      return (
                        <td key={i} style={{textAlign:'center', background:cupsBg}}>
                          {cups !== null
                            ? <span style={{fontWeight:700,fontSize:13,color:cups<0?'#dc2626':'inherit'}}>{cups.toLocaleString()}</span>
                            : rawB != null && rawB !== '' && parseFloat(rawB) !== 0
                              ? <span style={{fontWeight:700,fontSize:13}}>{parseFloat(rawB).toLocaleString()}</span>
                              : <span style={{color:'#d1d5db',fontSize:11}}>—</span>}
                        </td>
                      );
                    })}

                    <td style={{textAlign:'center', background:totalBg}}>
                      {cupsPerPeriod.some(c => c === null && vals.slice(1).some(v => v === null || v === 0 || v === ''))
                        ? <span style={{fontSize:13,color:'#9ca3af',fontWeight:600}}>
                            {totalCups > 0 && <span style={{color:'var(--primary-dark)',fontWeight:700,marginLeft:4}}>{totalCups.toLocaleString()} </span>}
                            ⏳
                          </span>
                        : <strong style={{fontSize:14}}>{totalCups.toLocaleString()}</strong>
                      }
                    </td>

                    {/* ✅ عمود الإضافات المتعددة */}
                    <td style={{textAlign:'center', background:'#fff3e0', padding:'6px 4px', minWidth:90}}>
                      {rowExtras.length === 0 ? (
                        <span style={{color:'var(--border)'}}>—</span>
                      ) : (
                        <div style={{display:'flex',flexDirection:'column',gap:3}}>
                          {rowExtras.map((ex,ei) => {
                            const amt  = parseFloat(ex.amount)||0;
                            const paid = parseFloat(ex.paid)||0;
                            const rem  = amt - paid;
                            const done = rem <= 0;
                            return (
                              <div key={ei} style={{borderRadius:6,overflow:'hidden',border:`1px solid ${done?'#d1d5db':'#fed7aa'}`}}>
                                {ex.note && (
                                  <div style={{background:done?'#f3f4f6':'#fef3c7',padding:'1px 5px',fontSize:10,fontWeight:700,color:done?'#9ca3af':'#92400e',textAlign:'center'}}>
                                    {ex.note}
                                  </div>
                                )}
                                <div style={{padding:'2px 5px',background:done?'#f9fafb':'#fff7ed',display:'flex',gap:3,alignItems:'center',justifyContent:'center'}}>
                                  {done
                                    ? <span style={{color:'#9ca3af',textDecoration:'line-through',fontSize:10}}>₪{amt.toLocaleString()}</span>
                                    : <>
                                        <span style={{fontWeight:800,color:'#e65100',fontSize:12}}>₪{rem.toLocaleString()}</span>
                                        {paid > 0 && <span style={{color:'#16a34a',fontSize:10,fontWeight:600}}>✓{paid.toLocaleString()}</span>}
                                      </>
                                  }
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>

                    <td style={{textAlign:'center', background:amtBg}}>
                      <strong style={{fontSize:14,color:'#854d0e'}}>
                        ₪{Math.round(rowAmount + rowExtrasTotal).toLocaleString()}
                      </strong>
                    </td>

                    <td style={{textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                      {isViewer ? (
                        r.note
                          ? <span style={{background:'#fef9c3',border:'1px solid #fde047',borderRadius:6,padding:'2px 8px',fontSize:12,color:'#78350f',fontWeight:600}}>💬 {r.note}</span>
                          : <span style={{color:'var(--border)'}}>—</span>
                      ) : editNoteId===r.id ? (
                        <div style={{display:'flex',gap:4,alignItems:'center'}}>
                          <input value={noteText} onChange={e=>setNoteText(e.target.value)}
                            style={{width:100,fontSize:12,padding:'3px 6px'}} autoFocus
                            onKeyDown={e=>{if(e.key==='Enter')saveNote(e,r);if(e.key==='Escape')setEditNoteId(null);}}/>
                          <IconBtn onClick={e=>saveNote(e,r)} title="حفظ" bg="#dcfce7" hoverBg="#16a34a" color="#16a34a" hoverColor="#fff" border="1.5px solid #16a34a">✓</IconBtn>
                          <IconBtn onClick={e=>{e.stopPropagation();setEditNoteId(null)}} title="إلغاء" bg="#fff1f2" hoverBg="#dc2626" color="#dc2626" hoverColor="#fff" border="1.5px solid #fca5a5">✕</IconBtn>
                        </div>
                      ) : r.note ? (
                        <div style={{display:'flex',alignItems:'center',gap:4,justifyContent:'center'}}>
                          <span style={{background:'#fef9c3',border:'1px solid #fde047',borderRadius:6,padding:'2px 8px',fontSize:12,color:'#78350f',fontWeight:600,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',cursor:'pointer'}}
                            onClick={e=>openNote(e,r)} title={r.note}>
                            💬 {r.note}
                          </span>
                          <IconBtn onClick={async e=>{e.stopPropagation();await updateNote(r.id,'');setReadings(prev=>prev.map(x=>x.id===r.id?{...x,note:''}:x));}}
                            title={ar?'حذف الملاحظة':'מחק הערה'} bg="#fff1f2" hoverBg="#dc2626" color="#dc2626" hoverColor="#fff" border="1.5px solid #fca5a5">✕</IconBtn>
                        </div>
                      ) : (
                        <IconBtn onClick={e=>openNote(e,r)} title={ar?'إضافة ملاحظة':'הוסף הערה'}
                          bg="var(--surface-2)" hoverBg="#fef08a" color="var(--text-muted)" hoverColor="#78350f" border="1.5px solid var(--border)">💬</IconBtn>
                      )}
                    </td>

                    <td style={{textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                      {!isViewer && (
                        <div className="flex-gap gap-4">
                          <IconBtn onClick={e=>{e.stopPropagation();onEdit(r)}} title={ar?'تعديل':'עריכה'} bg="var(--surface-2)" hoverBg="var(--primary)" color="var(--primary)" hoverColor="#fff" border="1.5px solid var(--border)">✏</IconBtn>
                          <IconBtn onClick={e=>{e.stopPropagation();onDelete(r.id)}} title={ar?'حذف':'מחיקה'} bg="#fff1f2" hoverBg="#dc2626" color="#dc2626" hoverColor="#fff" border="1.5px solid #fca5a5">✕</IconBtn>
                        </div>
                      )}
                    </td>
                  </tr>

                  {expanded && (
                    <tr style={{background: isPaid?'#f0fdf4':'#fff5f5'}}>
                      <td colSpan={99} style={{padding:'10px 18px'}}>
                        <div style={{display:'flex',flexWrap:'wrap',gap:16,alignItems:'flex-start'}}>

                          <div>
                            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4,fontWeight:700}}>📊 {ar?'قراءات العداد:':'קריאות מד המים:'}</div>
                            <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                              {vals.map((v,i) => (
                                <React.Fragment key={i}>
                                  {v == null || v === ''
                                    ? <span style={{background:'#f3f4f6',border:'1.5px dashed #d1d5db',borderRadius:6,padding:'3px 10px',fontSize:12,color:'#9ca3af',fontStyle:'italic'}}>
                                        {ar?`ق${i+1}`:`ק${i+1}`}: ⏳ {ar?'لم تؤخذ':'טרם נלקחה'}
                                      </span>
                                    : <span style={{background:'#fff',border:'1px solid var(--border)',borderRadius:6,padding:'3px 10px',fontWeight:700,fontSize:13}}>
                                        {ar?`ق${i+1}`:`ק${i+1}`} ({i===0?ar?'أولى':'ראשונה':ar?`ت${i}`:`ת${i}`}): <strong>{parseFloat(v).toLocaleString()}</strong>
                                      </span>
                                  }
                                  {i < vals.length-1 && <span style={{color:'var(--text-muted)',fontSize:12}}>←</span>}
                                </React.Fragment>
                              ))}
                            </div>
                          </div>

                          {cupsPerPeriod.filter(c=>c!==null).length > 0 && (
                            <div>
                              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4,fontWeight:700}}>🔥 {ar?'حساب الفترات:':'חישוב תקופות:'}</div>
                              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                                {cupsPerPeriod.map((cups,i) => cups!==null && (
                                  <span key={i} style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:6,padding:'3px 10px',fontSize:12,fontWeight:700,color:'var(--primary)'}}>
                                    {ar?`ت${i+1}`:`ת${i+1}`}: <strong>{cups.toLocaleString()}</strong> × ₪{getPrice(prices,r.year,r.landId,i+1).toFixed(2)} = <strong style={{color:'#854d0e'}}>₪{Math.round(cups*getPrice(prices,r.year,r.landId,i+1)).toLocaleString()}</strong>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* ✅ الإضافات في الصف الموسَّع */}
                          {rowExtras.length > 0 && (
                            <div>
                              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:6,fontWeight:700}}>➕ {ar?'الإضافات:':'תוספות:'}</div>
                              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                                {rowExtras.map((ex,ei) => {
                                  const amt  = parseFloat(ex.amount)||0;
                                  const paid = parseFloat(ex.paid)||0;
                                  const rem  = amt - paid;
                                  const done = rem <= 0;
                                  return (
                                    <div key={ei} style={{background:done?'#f3f4f6':'#fff3e0',border:`1.5px solid ${done?'#d1d5db':'#fed7aa'}`,borderRadius:8,padding:'6px 12px',fontSize:12,opacity:done?0.75:1}}>
                                      {ex.note && (
                                        <div style={{fontWeight:700,color:done?'#9ca3af':'#92400e',marginBottom:3,textDecoration:done?'line-through':'none'}}>
                                          {ex.note}
                                        </div>
                                      )}
                                      <div style={{display:'flex',gap:8,alignItems:'center'}}>
                                        <span style={{fontWeight:700,color:done?'#9ca3af':'#e65100',textDecoration:done?'line-through':'none'}}>₪{amt.toLocaleString()}</span>
                                        {paid > 0 && <span style={{color:'#16a34a',fontWeight:600,fontSize:11}}>✓ ₪{paid.toLocaleString()}</span>}
                                        {!done && <span style={{color:'#dc2626',fontWeight:800,fontSize:12}}>⟵ ₪{rem.toLocaleString()}</span>}
                                        {done && <span style={{color:'#16a34a',fontSize:11}}>✅ {ar?'مدفوعة':'שולם'}</span>}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>

                        <div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center',marginTop:8}}>
                          {isPaid && r.paidAt && <span style={{fontSize:11,color:'#16a34a',fontWeight:700}}>✓ {ar?'دُفع في':'שולם ב-'} {new Date(r.paidAt).toLocaleDateString(ar?'ar-SA':'he-IL')}</span>}
                          {(() => { const land=lands.find(l=>String(l.id)===String(r.landId)); return land?.description?(<span style={{fontSize:12,background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'4px 10px',color:'#1e40af',fontWeight:600}}>🏡 {land.description}</span>):null; })()}
                          {r.note && <span style={{fontSize:12,background:'#fef9c3',border:'1px solid #fde047',borderRadius:8,padding:'4px 10px',color:'#78350f',fontWeight:600}}>💬 {r.note}</span>}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {sorted.length > 1 && (
              <tr style={{background:'linear-gradient(90deg,#14532d,#166534)', borderTop:'2px solid #14532d'}}>
                <td colSpan={5} style={{fontWeight:900,color:'#fff',fontSize:14,padding:'11px 14px'}}>⚡ {ar?'الإجمالي الكلي':'סה"כ כללי'}</td>
                {Array.from({length:cupsCols}).map((_,i) => {
                  const col = sorted.reduce((s,r)=>s+cupsPositive(r.readings||[],i),0);
                  return <td key={i} style={{textAlign:'center',padding:'11px 8px'}}><span style={{fontWeight:900,color:'#a3e635',fontSize:15}}>{col.toLocaleString()}</span></td>;
                })}
                <td style={{textAlign:'center',padding:'11px 8px'}}><span style={{fontWeight:900,color:'#a3e635',fontSize:17}}>{grandCups.toLocaleString()}</span></td>
                <td style={{textAlign:'center',padding:'11px 8px',color:'#fde68a',fontWeight:900,fontSize:15}}>
                  ₪{sorted.reduce((s,r)=>s+getExtras(r).reduce((ss,e)=>(ss+(parseFloat(e.amount)||0)),0),0).toLocaleString()}
                </td>
                <td style={{textAlign:'center',padding:'11px 8px',borderLeft:'2px solid #a3e635'}}>
                  <span style={{fontWeight:900,color:'#fde68a',fontSize:19}}>
                    ₪{Math.round(grandAmount + grandExtrasRem).toLocaleString()}
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