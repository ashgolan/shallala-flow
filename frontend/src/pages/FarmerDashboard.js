import React, { useState, useEffect, useCallback } from 'react';
import { useLang } from '../contexts/LangContext';
import { t } from '../i18n/translations';
import { farmerAPI, publicAPI } from '../api';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import FarmerNotes from '../components/farmer/FarmerNotes';
import { LangToggleLight } from '../components/shared/LangToggle';
import AnnouncementBanner from '../components/shared/AnnouncementBanner';

const COLORS = ['#16a34a','#84cc16','#0ea5e9','#f59e0b','#ef4444','#8b5cf6','#ec4899'];

const getPrice = (prices, year, landId, idx) => {
  if (!prices) return 0;
  // landPrices — المفتاح هو landId كـ string
  const lp = prices.landPrices?.[String(landId)];
  if (lp?.[`reading_${idx}`]) return parseFloat(lp[`reading_${idx}`]) || 0;
  if (lp?.default) return parseFloat(lp.default) || 0;
  // yearPrices — المفتاح هو السنة كـ string
  const yp = prices.yearPrices?.[String(year)];
  if (yp?.[`reading_${idx}`]) return parseFloat(yp[`reading_${idx}`]) || 0;
  if (yp?.default) return parseFloat(yp.default) || 0;
  return parseFloat(prices.globalPrice) || 0;
};

const calcConsumption = (reading, prices) => {
  if (!reading?.readings || reading.readings.length < 2) return [];
  return reading.readings.slice(1).map((curr, i) => {
    const prev  = reading.readings[i];
    const cups  = curr - prev;
    const price = getPrice(prices, reading.year, reading.landId, i + 1);
    return { idx: i+1, cups, price, amount: cups * price, from: prev, to: curr };
  });
};

export default function FarmerDashboard({ farmer: farmerProp, onLogout }) {
  const farmer = farmerProp || JSON.parse(localStorage.getItem('shl_farmer') || 'null');
  const { lang } = useLang();
  const [tab, setTab]     = useState('overview');
  const [data, setData]   = useState({ lands:[], readings:[], prices:{} });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [selYear, setSelYear] = useState(null);
  const [pub, setPub]         = useState({ gallery:[], video:{ url:'' } });
  const [search, setSearch]   = useState('');

  const load = useCallback(async () => {
    try { setLoading(true); setError(''); const d = await farmerAPI.getMyData(); setData(d); }
    catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { publicAPI.getSettings().then(d => setPub(d||{})).catch(()=>{}); }, []);

  const handleLogout = () => { onLogout && onLogout(); onLogout(); };

  if (loading) return (
    <div className="loading-screen">
      <span className="emoji">🌿</span>
      <div className="spinner" />
      <p style={{ color:'var(--text-muted)', fontWeight:600 }}>{t('loading', lang)}</p>
    </div>
  );

  const { lands, readings, prices } = data;

  const byYear = {};
  readings.forEach(r => {
    if (!byYear[r.year]) byYear[r.year] = { year:r.year, cups:0, amount:0 };
    calcConsumption(r, prices).forEach(c => { byYear[r.year].cups += c.cups; byYear[r.year].amount += c.amount; });
  });
  const yearlyData = Object.values(byYear).sort((a,b) => a.year-b.year);
  const years = Object.keys(byYear).map(Number).sort((a,b) => b-a);
  const totalCups   = yearlyData.reduce((s,y) => s+y.cups, 0);
  const totalAmount = yearlyData.reduce((s,y) => s+y.amount, 0);
  const landName = id => lands.find(l => l.id === id)?.name || '';
  const filteredLands = lands.filter(l => !search || l.name.includes(search) || (l.nameHeb||'').includes(search));

  const tabs = [
    { key:'overview', label: t('overview', lang),  icon:'📊' },
    { key:'years',    label: t('years', lang),     icon:'📅' },
    { key:'lands',    label: t('lands', lang),     icon:'🌾' },
    { key:'notes',    label: t('farmNotes', lang), icon:'📝' },
    { key:'gallery',  label: lang==='ar'?'الصور':'גלריה',     icon:'🖼️' },
  ];

  return (
    <div style={{ minHeight:'100vh', background:'var(--surface)' }}>

      {/* Nav */}
      <nav style={{ background:'var(--primary-dark)', position:'sticky', top:0, zIndex:100, boxShadow:'var(--shadow-md)' }}>
        <div style={{ maxWidth:1300, margin:'0 auto', padding:'0 16px', height:60, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <div className="flex-gap gap-12">
            <span style={{ fontSize:26 }}>🌿</span>
            <div>
              <div style={{ color:'#fff', fontWeight:900, fontSize:16 }}>
                {lang === 'ar' ? 'الشلالة' : 'אלשללאלה'}
              </div>
              <div style={{ color:'rgba(255,255,255,0.6)', fontSize:12 }}>
                {t('welcome', lang)} {farmer?.name}
              </div>
            </div>
          </div>
          <div className="flex-gap gap-8">
            <LangToggleLight style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', color:'#fff' }} />
            <button className="btn btn-sm" style={{ background:'rgba(255,255,255,0.12)', color:'#fff', border:'none' }} onClick={handleLogout}>
              {t('logout', lang)}
            </button>
          </div>
        </div>
      </nav>

      {/* Notice */}
      {farmer?.notes && (
        <div style={{ background:'linear-gradient(90deg,#fef3c7,#fef9c3)', borderBottom:'2px solid #fcd34d', padding:'10px 16px', display:'flex', gap:8, alignItems:'center', fontSize:14, fontWeight:600, color:'#78350f' }}>
          <span>📌</span><span>{farmer.notes}</span>
        </div>
      )}

      {/* Announcement Banner */}
      <AnnouncementBanner lang={lang} />

      {/* Desktop tabs */}
      <div style={{ background:'#fff', borderBottom:'1.5px solid var(--border)', padding:'8px 16px', position:'sticky', top:60, zIndex:99, boxShadow:'var(--shadow-sm)' }}>
        <div className="tabs-bar" style={{ maxWidth:1300, margin:'0 auto' }}>
          {tabs.map(tb => (
            <button key={tb.key} className={`tab-btn ${tab===tb.key?'active':''}`} onClick={() => setTab(tb.key)}>
              {tb.icon} {tb.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth:1300, margin:'0 auto', padding:'clamp(10px,3vw,24px)', width:'100%', overflowX:'hidden' }} className="page-content">
        {error && <div className="alert alert-error mb-16">{error}</div>}

        {/* OVERVIEW */}
        {tab === 'overview' && (
          <div className="fade-in">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16, width:'100%' }}>
              {[
                { label:t('numLands',lang),    value:lands.length,                    icon:'🌾' },
                { label:t('dataYears',lang),   value:years.length,                    icon:'📅' },
                { label:t('totalCups',lang),   value:totalCups.toLocaleString(),      icon:'💧' },
                { label:t('totalAmount',lang), value:'₪'+totalAmount.toLocaleString(), icon:'💰', accent:true },
              ].map((s,i) => (
                <div key={i} className={`stat-card ${s.accent?'accent':''}`}
                  style={{ padding:'12px 14px', minWidth:0, overflow:'hidden' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
                    <div style={{ minWidth:0, flex:1 }}>
                      <div style={{ fontWeight:900, fontSize:'clamp(1rem,5vw,1.6rem)', lineHeight:1.1,
                        color: s.accent ? '#fff' : 'var(--primary)',
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {s.value}
                      </div>
                      <div style={{ fontSize:'clamp(10px,2.5vw,12px)', marginTop:3, opacity:0.75,
                        color: s.accent ? '#fff' : 'var(--text-muted)' }}>
                        {s.label}
                      </div>
                    </div>
                    <div style={{ fontSize:'clamp(20px,5vw,28px)', flexShrink:0 }}>{s.icon}</div>
                  </div>
                </div>
              ))}
            </div>

            {yearlyData.length > 0 ? (
              <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:12, width:'100%' }} className="charts-grid">
                <div className="card" style={{ overflow:'hidden', minWidth:0 }}>
                  <h3 className="mb-16" style={{ fontSize:'clamp(13px,3.5vw,18px)' }}>📊 {t('consumptionChart', lang)}</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={yearlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="year" tick={{ fontFamily:'Tajawal,Heebo', fontSize:12 }} />
                      <YAxis tick={{ fontFamily:'Tajawal,Heebo', fontSize:12 }} />
                      <Tooltip formatter={v => [v.toLocaleString()+' '+t('cups',lang), t('consumptionChart',lang)]} contentStyle={{ fontFamily:'Tajawal,Heebo' }} />
                      <Bar dataKey="cups" fill="var(--primary)" radius={[6,6,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="card" style={{ overflow:'hidden', minWidth:0 }}>
                  <h3 className="mb-16" style={{ fontSize:'clamp(13px,3.5vw,18px)' }}>💰 {t('amountChart', lang)}</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={yearlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="year" tick={{ fontFamily:'Tajawal,Heebo', fontSize:12 }} />
                      <YAxis tick={{ fontFamily:'Tajawal,Heebo', fontSize:12 }} />
                      <Tooltip formatter={v => ['₪'+v.toLocaleString(), t('amount',lang)]} contentStyle={{ fontFamily:'Tajawal,Heebo' }} />
                      <Line type="monotone" dataKey="amount" stroke="var(--amber-500)" strokeWidth={2.5} dot={{ fill:'var(--amber-500)', r:4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="card" style={{ overflow:'hidden', minWidth:0 }}>
                  <h3 className="mb-16" style={{ fontSize:'clamp(13px,3.5vw,18px)' }}>📋 {t('landSummary', lang)}</h3>
                  <div className="tbl-wrap">
                    <table>
                      <thead><tr><th>{t('name',lang)}</th><th>{t('totalCups',lang)}</th><th>{t('totalAmount',lang)}</th></tr></thead>
                      <tbody>
                        {lands.map(l => {
                          const lR = readings.filter(r => r.landId === l.id);
                          const cups   = lR.reduce((s,r) => s+calcConsumption(r,prices).reduce((ss,c)=>ss+c.cups,0), 0);
                          const amount = lR.reduce((s,r) => s+calcConsumption(r,prices).reduce((ss,c)=>ss+c.amount,0), 0);
                          return (
                            <tr key={l.id}>
                              <td><strong>{l.name}</strong></td>
                              <td>{cups.toLocaleString()}</td>
                              <td><strong>₪{amount.toLocaleString()}</strong></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card empty-state"><span className="icon">📊</span><p>{t('noReadings',lang)}</p></div>
            )}
          </div>
        )}

        {/* YEARS */}
        {tab === 'years' && (
          <div className="fade-in flex-col gap-12">
            {years.length === 0 && <div className="card empty-state"><span className="icon">📅</span><p>{t('noYearData',lang)}</p></div>}
            {years.map(year => {
              const yR     = readings.filter(r => r.year === year);
              const cups   = yR.reduce((s,r)=>s+calcConsumption(r,prices).reduce((ss,c)=>ss+c.cups,0),0);
              const amount = yR.reduce((s,r)=>s+calcConsumption(r,prices).reduce((ss,c)=>ss+c.amount,0),0);
              const open   = selYear === year;
              return (
                <div key={year}>
                  <div className="card card-hover" onClick={() => setSelYear(open?null:year)} style={{ marginBottom:open?8:0 }}>
                    <div className="flex-between">
                      <div className="flex-gap gap-12">
                        <span style={{ background:'var(--primary)', color:'#fff', padding:'5px 16px', borderRadius:20, fontWeight:900, fontSize:16 }}>{year}</span>
                        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
                          <span style={{ background:'var(--surface-2)', padding:'4px 12px', borderRadius:8, fontWeight:900, fontSize:'clamp(13px,4vw,17px)', color:'var(--primary)' }}>
                            💧 {cups.toLocaleString()}
                          </span>
                          <span style={{ background:'var(--green-100)', padding:'4px 12px', borderRadius:8, fontWeight:900, fontSize:'clamp(13px,4vw,17px)', color:'var(--primary-dark)' }}>
                            ₪{amount.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <span style={{ color:'var(--text-muted)', fontSize:12, transition:'transform 0.3s', display:'inline-block', transform:open?'rotate(180deg)':'rotate(0)' }}>▼</span>
                    </div>
                  </div>

                  {open && (
                    <div className="card fade-in-fast" style={{ borderTop:'3px solid var(--primary)' }}>
                      {yR.map(r => {
                        const cons = calcConsumption(r, prices);
                        return (
                          <div key={r.id} style={{ marginBottom:20, paddingBottom:20, borderBottom:'1px solid var(--border)' }}>
                            <div style={{ fontWeight:800, color:'var(--primary)', marginBottom:10, fontSize:16 }}>🌾 {landName(r.landId)}</div>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
                              {r.readings.map((v,i) => (
                                <div key={i} style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8, padding:'4px 10px', textAlign:'center', minWidth:60 }}>
                                  <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:700 }}>{t('readingNum',lang)} {i+1}</div>
                                  <div style={{ fontSize:'clamp(14px,4vw,17px)', fontWeight:900, color:'var(--primary)' }}>{v}</div>
                                </div>
                              ))}
                            </div>
                            <div className="tbl-wrap">
                              <table>
                                <thead>
                                  <tr>
                                    <th>{t('period',lang)}</th>
                                    <th>{t('from',lang)}</th>
                                    <th>{t('to',lang)}</th>
                                    <th>{t('cups',lang)}</th>
                                    <th>{t('pricePerCup',lang)}</th>
                                    <th>{t('amount',lang)}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cons.map((c,i) => (
                                    <tr key={i}>
                                      <td>{t('period',lang)} {c.idx}</td>
                                      <td>{c.from}</td><td>{c.to}</td>
                                      <td><strong>{c.cups.toLocaleString()}</strong></td>
                                      <td>₪{c.price}</td>
                                      <td><strong style={{ color:'var(--primary)' }}>₪{c.amount.toLocaleString()}</strong></td>
                                    </tr>
                                  ))}
                                  <tr className="tbl-total">
                                    <td colSpan={3}>{t('total',lang)}</td>
                                    <td>{cons.reduce((s,c)=>s+c.cups,0).toLocaleString()}</td>
                                    <td>—</td>
                                    <td>₪{cons.reduce((s,c)=>s+c.amount,0).toLocaleString()}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* LANDS */}
        {tab === 'lands' && (
          <div className="fade-in">
            <div className="card mb-16">
              <input type="text" placeholder={`🔍 ${t('searchLand',lang)}`} value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex-col gap-16">
              {filteredLands.map(land => {
                const lR = readings.filter(r => r.landId === land.id);
                const chartData = Object.entries(
                  lR.reduce((acc, r) => { acc[r.year] = (acc[r.year]||0) + calcConsumption(r,prices).reduce((s,c)=>s+c.cups,0); return acc; }, {})
                ).map(([year,cups]) => ({ year:String(year), cups })).sort((a,b)=>a.year-b.year);
                const totalC = chartData.reduce((s,d)=>s+d.cups,0);
                const totalA = lR.reduce((s,r)=>s+calcConsumption(r,prices).reduce((ss,c)=>ss+c.amount,0),0);
                return (
                  <div key={land.id} className="card">
                    <div className="flex-between mb-16" style={{ flexWrap:'wrap', gap:12 }}>
                      <div>
                        <h3>{land.name}</h3>
                        {land.area && <span className="badge badge-green mt-8">{land.area} {t('dunam',lang)}</span>}
                      </div>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        <span style={{ background:'var(--surface-2)', padding:'4px 10px', borderRadius:8, fontSize:13, fontWeight:800, color:'var(--primary)' }}>
                          💧 {totalC.toLocaleString()} {t('cups',lang)}
                        </span>
                        <span style={{ background:'var(--green-100)', padding:'4px 10px', borderRadius:8, fontSize:13, fontWeight:800, color:'var(--primary-dark)' }}>
                          ₪{totalA.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    {chartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={150}>
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="year" tick={{ fontFamily:'Tajawal,Heebo', fontSize:12 }} />
                          <YAxis tick={{ fontFamily:'Tajawal,Heebo', fontSize:12 }} />
                          <Tooltip formatter={v => [v.toLocaleString()+' '+t('cups',lang), '']} contentStyle={{ fontFamily:'Tajawal,Heebo' }} />
                          <Bar dataKey="cups" fill="var(--sky-500)" radius={[4,4,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p style={{ color:'var(--text-muted)', textAlign:'center', padding:20 }}>{t('noReadings',lang)}</p>
                    )}
                  </div>
                );
              })}
              {filteredLands.length===0 && <div className="card empty-state"><span className="icon">🌾</span><p>{t('noLands',lang)}</p></div>}
            </div>
          </div>
        )}

        {/* NOTES */}
        {tab === 'notes' && <FarmerNotes farmer={farmer} lands={lands} lang={lang} />}

        {/* GALLERY */}
        {tab === 'gallery' && (
          <div className="fade-in" style={{ maxWidth:900, margin:'0 auto' }}>

            {/* Video — عرض محدود وأنيق */}
            {pub.video?.url && (() => {
              const ytId = pub.video.url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
              return ytId ? (
                <div className="card mb-20" style={{ maxWidth:560, margin:'0 auto 20px' }}>
                  {pub.video.title && (
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                      <span style={{ fontSize:18 }}>🎬</span>
                      <h3 style={{ margin:0, fontSize:15 }}>{pub.video.title}</h3>
                    </div>
                  )}
                  <div style={{ position:'relative', paddingBottom:'56.25%', borderRadius:10, overflow:'hidden', background:'#000' }}>
                    <iframe src={`https://www.youtube.com/embed/${ytId}`}
                      style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}
                      frameBorder="0" allowFullScreen title="video" />
                  </div>
                </div>
              ) : null;
            })()}

            {/* Images grid — 3 أعمدة على الكمبيوتر، 2 على الهاتف */}
            {pub.gallery?.length > 0 ? (
              <>
                <p style={{ color:'var(--text-muted)', fontSize:13, marginBottom:12, textAlign:'center' }}>
                  📸 {pub.gallery.length} {lang==='ar'?'صورة':'תמונות'}
                </p>
                <div style={{
                  display:'grid',
                  gridTemplateColumns:'repeat(3, 1fr)',
                  gap:14,
                }}>
                  {pub.gallery.map((img, i) => (
                    <div key={i} style={{
                      borderRadius:12, overflow:'hidden',
                      boxShadow:'var(--shadow-sm)',
                      background:'#fff',
                      cursor:'pointer',
                      transition:'transform 0.2s, box-shadow 0.2s',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.transform='scale(1.02)'; e.currentTarget.style.boxShadow='var(--shadow-md)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform='scale(1)'; e.currentTarget.style.boxShadow='var(--shadow-sm)'; }}
                      onClick={() => window.open(img.url, '_blank')}
                    >
                      <img src={img.url} alt={img.caption||''}
                        style={{ width:'100%', height:180, objectFit:'cover', display:'block' }} />
                      {img.caption && (
                        <div style={{ padding:'8px 12px', fontSize:12, color:'var(--text-muted)', fontWeight:600, background:'#fff' }}>
                          {img.caption}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="card empty-state"><span className="icon">🖼️</span><p>{lang==='ar'?'لا توجد صور بعد':'אין תמונות עדיין'}</p></div>
            )}
          </div>
        )}
      </div>

      {/* Mobile Bottom Nav */}
      <nav style={{ display:'none', position:'fixed', bottom:0, left:0, right:0, background:'#fff', borderTop:'1.5px solid var(--border)', zIndex:200, boxShadow:'0 -4px 12px rgba(0,0,0,0.08)' }} className="mobile-bottom-nav">
        {tabs.map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            style={{ flex:1, padding:'10px 4px', border:'none', background:'transparent', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:3,
              color: tab===tb.key ? 'var(--primary)' : 'var(--text-muted)',
              fontFamily:'Tajawal,Heebo', fontSize:10, fontWeight: tab===tb.key ? 800 : 500 }}>
            <span style={{ fontSize:18 }}>{tb.icon}</span>
            <span>{tb.label}</span>
          </button>
        ))}
      </nav>

      <style>{`
        @media (max-width: 768px) {
          .mobile-bottom-nav { display: flex !important; }
          div[style*="top: 60px"] .tabs-bar { display: none !important; }
        }
      `}</style>
    </div>
  );
}
