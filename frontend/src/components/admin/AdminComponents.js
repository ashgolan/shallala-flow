import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { adminAPI, privilegedAPI, regionsAPI } from '../../api';
import { useLang } from '../../contexts/LangContext';
import { t } from '../../i18n/translations';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// ✅ AdminReports مستورد من ملفه المستقل
export { AdminReports } from './AdminReports';

// ════════════════════════════════════════════════════════════
//  ADMIN PRICES
// ════════════════════════════════════════════════════════════
export function AdminPrices() {
  const { lang } = useLang();
  const ar = lang === 'ar';

  const [prices, setPrices] = useState({ globalPrice:0, yearPrices:{}, landPrices:{} });
  const [lands, setLands]   = useState([]);
  const [section, setSection] = useState('global');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [newYear, setNewYear] = useState('');
  const [nyP, setNyP] = useState({ default:'', reading_1:'', reading_2:'', reading_3:'' });
  const [selLand, setSelLand] = useState('');
  const [nlP, setNlP] = useState({ default:'', reading_1:'', reading_2:'', reading_3:'' });

  useEffect(() => {
    adminAPI.getPrices().then(p => setPrices(p)).catch(() => {});
    adminAPI.getLands().then(l => setLands(l.lands||[])).catch(() => {});
  }, []);

  const save = async (data) => {
    setSaving(true);
    try {
      await adminAPI.updatePrices(data);
      setPrices(data);
      setSuccess('✅ ' + t('save', lang));
      setTimeout(() => setSuccess(''), 3000);
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const addYear = async e => {
    e.preventDefault();
    if (!newYear) return;
    const upd = { ...prices, yearPrices: { ...prices.yearPrices, [newYear]: {
      default: parseFloat(nyP.default)||0,
      ...(nyP.reading_1 && { reading_1: parseFloat(nyP.reading_1) }),
      ...(nyP.reading_2 && { reading_2: parseFloat(nyP.reading_2) }),
      ...(nyP.reading_3 && { reading_3: parseFloat(nyP.reading_3) }),
    }}};
    await save(upd);
    setNewYear('');
    setNyP({ default:'', reading_1:'', reading_2:'', reading_3:'' });
  };

  const rmYear = async y => {
    const yp = { ...prices.yearPrices };
    delete yp[y];
    await save({ ...prices, yearPrices: yp });
  };

  const addLand = async e => {
    e.preventDefault();
    if (!selLand) return;
    const upd = { ...prices, landPrices: { ...prices.landPrices, [selLand]: {
      default: parseFloat(nlP.default)||0,
      ...(nlP.reading_1 && { reading_1: parseFloat(nlP.reading_1) }),
      ...(nlP.reading_2 && { reading_2: parseFloat(nlP.reading_2) }),
      ...(nlP.reading_3 && { reading_3: parseFloat(nlP.reading_3) }),
    }}};
    await save(upd);
    setSelLand('');
    setNlP({ default:'', reading_1:'', reading_2:'', reading_3:'' });
  };

  const rmLand = async id => {
    const lp = { ...prices.landPrices };
    delete lp[id];
    await save({ ...prices, landPrices: lp });
  };

  const landName = id => lands.find(l => l.id === id)?.name || id;

  const sections = [
    ['global', `🌐 ${t('globalPrice', lang)}`],
    ['yearly', `📅 ${t('yearlyPrices', lang)}`],
    ['land',   `🌾 ${t('landPrices', lang)}`],
  ];

  return (
    <div>
      {success && <div className="alert alert-success mb-16">{success}</div>}

      {/* أولوية الأسعار */}
      <div className="card mb-16" style={{ padding:12, background:'var(--surface-2)', border:'none' }}>
        <h4 className="mb-8">📌 {t('priceHierarchy', lang)}</h4>
        <div style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:2 }}>
          1️⃣ {ar?'سعر أرض معينة في قراءة معينة':'מחיר קרקע ספציפית בקריאה ספציפית'} &nbsp;·&nbsp;
          2️⃣ {ar?'سعر عام لأرض':'מחיר כללי לקרקע'} &nbsp;·&nbsp;
          3️⃣ {ar?'سعر سنة في قراءة':'מחיר שנה בקריאה'} &nbsp;·&nbsp;
          4️⃣ {ar?'سعر عام لسنة':'מחיר כללי לשנה'} &nbsp;·&nbsp;
          5️⃣ {t('globalPrice', lang)}
        </div>
        <div style={{ fontSize:12, color:'#92400e', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:6, padding:'6px 10px', marginTop:10, fontWeight:600 }}>
          🧾 {ar
            ? 'كل الأسعار هنا تُدخَل قبل الضريبة (מע"מ) — الضريبة تُضاف تلقائياً في حسابات القراءات والتقارير. لتغيير نسبة الضريبة: صفحة الإعدادات.'
            : 'כל המחירים כאן מוזנים לפני מע"מ — המע"מ מתווסף אוטומטית בחישובי הקריאות והדוחות. לשינוי אחוז המע"מ: עמוד ההגדרות.'}
        </div>
      </div>

      {/* تبويبات الأقسام */}
      <div className="flex-gap gap-8 mb-20">
        {sections.map(([k, l]) => (
          <button key={k} className={`btn btn-sm ${section === k ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setSection(k)}>{l}</button>
        ))}
      </div>

      {/* السعر العام */}
      {section === 'global' && (
        <div className="card fade-in">
          <h3 className="mb-16">🌐 {t('globalPrice', lang)}</h3>
          <p style={{ color:'var(--text-muted)', fontSize:13, marginBottom:16 }}>{t('globalPriceDesc', lang)}</p>
          <div style={{ display:'flex', gap:12, alignItems:'flex-end', maxWidth:300 }}>
            <div className="form-group" style={{ marginBottom:0, flex:1 }}>
              <label>{t('pricePerCup', lang)} (₪)</label>
              <input type="number" step="0.01"
                value={prices.globalPrice || ''}
                onChange={e => setPrices({ ...prices, globalPrice: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"/>
            </div>
            <button className="btn btn-primary" onClick={() => save(prices)} disabled={saving}>💾</button>
          </div>
          <div style={{ marginTop:14, padding:'10px 14px', background:'var(--surface-2)', borderRadius:8, fontSize:14, fontWeight:700, color:'var(--primary)' }}>
            {t('currentPrice', lang)}: ₪{prices.globalPrice || 0} / {t('cups', lang)}
          </div>
        </div>
      )}

      {/* أسعار السنوات */}
      {section === 'yearly' && (
        <div className="card fade-in">
          <h3 className="mb-16">📅 {t('yearlyPrices', lang)}</h3>
          <form onSubmit={addYear} style={{ background:'var(--surface-2)', padding:16, borderRadius:12, marginBottom:20 }}>
            <h4 className="mb-12">{t('addYear', lang)}</h4>
            <div className="grid-2">
              <div className="form-group">
                <label>{t('year', lang)}</label>
                <input type="number" value={newYear} onChange={e => setNewYear(e.target.value)} placeholder="2025" min={2000} max={2100}/>
              </div>
              <div className="form-group">
                <label>{t('defaultPrice', lang)} (₪)</label>
                <input type="number" step="0.01" value={nyP.default} onChange={e => setNyP({...nyP, default:e.target.value})} placeholder="0.00"/>
              </div>
              {['1','2','3'].map(n => (
                <div className="form-group" key={n}>
                  <label>{ar?`الفترة ${n}`:`תקופה ${n}`} <span style={{fontWeight:400,color:'var(--text-muted)'}}>({ar?`قراءة ${n}←${Number(n)+1}`:`קריאה ${n}←${Number(n)+1}`}, {t('optional', lang)})</span></label>
                  <input type="number" step="0.01" value={nyP[`reading_${n}`]}
                    onChange={e => setNyP({...nyP, [`reading_${n}`]: e.target.value})} placeholder="0.00"/>
                </div>
              ))}
            </div>
            <p style={{fontSize:12, color:'var(--text-muted)', marginTop:-6, marginBottom:10}}>
              💡 {ar
                ? 'كل حقل هو سعر الفترة (الفرق) بين قراءتين متتاليتين، وليس سعر القراءة نفسها — مثال: "الفترة 1" = الفرق بين القراءة الأولى والثانية.'
                : 'כל שדה הוא מחיר התקופה (ההפרש) בין שתי קריאות רצופות, לא מחיר הקריאה עצמה — לדוגמה: "תקופה 1" = ההפרש בין הקריאה הראשונה לשנייה.'}
            </p>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>+ {t('add', lang)}</button>
          </form>

          {Object.keys(prices.yearPrices || {}).length === 0
            ? <p style={{color:'var(--text-muted)', textAlign:'center', padding:20}}>{t('noYearPrices', lang)}</p>
            : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t('year', lang)}</th>
                      <th>{t('defaultPrice', lang)}</th>
                      <th title={ar?'الفترة 1 (قراءة 1←2)':'תקופה 1 (קריאה 1←2)'}>{ar?'فترة 1':'תק׳1'}</th>
                      <th title={ar?'الفترة 2 (قراءة 2←3)':'תקופה 2 (קריאה 2←3)'}>{ar?'فترة 2':'תק׳2'}</th>
                      <th title={ar?'الفترة 3 (قراءة 3←4)':'תקופה 3 (קריאה 3←4)'}>{ar?'فترة 3':'תק׳3'}</th>
                      <th>{t('delete', lang)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(prices.yearPrices || {}).sort(([a],[b]) => b - a).map(([y, p]) => (
                      <tr key={y}>
                        <td><strong>{y}</strong></td>
                        <td>₪{p.default || 0}</td>
                        <td>{p.reading_1 ? `₪${p.reading_1}` : '—'}</td>
                        <td>{p.reading_2 ? `₪${p.reading_2}` : '—'}</td>
                        <td>{p.reading_3 ? `₪${p.reading_3}` : '—'}</td>
                        <td>
                          <button onClick={() => rmYear(y)}
                            style={{width:28,height:28,borderRadius:7,border:'1.5px solid #fca5a5',background:'#fff1f2',color:'#dc2626',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:13,transition:'all 0.18s'}}
                            onMouseEnter={e=>{e.currentTarget.style.background='#dc2626';e.currentTarget.style.color='#fff';}}
                            onMouseLeave={e=>{e.currentTarget.style.background='#fff1f2';e.currentTarget.style.color='#dc2626';}}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      )}

      {/* أسعار الأراضي */}
      {section === 'land' && (
        <div className="card fade-in">
          <h3 className="mb-16">🌾 {t('landPrices', lang)}</h3>
          <form onSubmit={addLand} style={{ background:'var(--surface-2)', padding:16, borderRadius:12, marginBottom:20 }}>
            <h4 className="mb-12">{t('addLandPrice', lang)}</h4>
            <div className="grid-2">
              <div className="form-group">
                <label>{t('lands', lang)}</label>
                <select value={selLand} onChange={e => setSelLand(e.target.value)}>
                  <option value="">— {t('chooseLandOpt', lang)} —</option>
                  {lands.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>{t('defaultPrice', lang)} (₪)</label>
                <input type="number" step="0.01" value={nlP.default} onChange={e => setNlP({...nlP, default:e.target.value})} placeholder="0.00"/>
              </div>
              {['1','2','3'].map(n => (
                <div className="form-group" key={n}>
                  <label>{ar?`الفترة ${n}`:`תקופה ${n}`} <span style={{fontWeight:400,color:'var(--text-muted)'}}>({ar?`قراءة ${n}←${Number(n)+1}`:`קריאה ${n}←${Number(n)+1}`}, {t('optional', lang)})</span></label>
                  <input type="number" step="0.01" value={nlP[`reading_${n}`]}
                    onChange={e => setNlP({...nlP, [`reading_${n}`]: e.target.value})} placeholder="0.00"/>
                </div>
              ))}
            </div>
            <p style={{fontSize:12, color:'var(--text-muted)', marginTop:-6, marginBottom:10}}>
              💡 {ar
                ? 'كل حقل هو سعر الفترة (الفرق) بين قراءتين متتاليتين، وليس سعر القراءة نفسها — مثال: "الفترة 1" = الفرق بين القراءة الأولى والثانية.'
                : 'כל שדה הוא מחיר התקופה (ההפרש) בין שתי קריאות רצופות, לא מחיר הקריאה עצמה — לדוגמה: "תקופה 1" = ההפרש בין הקריאה הראשונה לשנייה.'}
            </p>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>+ {t('add', lang)}</button>
          </form>

          {Object.keys(prices.landPrices || {}).length === 0
            ? <p style={{color:'var(--text-muted)', textAlign:'center', padding:20}}>{t('noLandPrices', lang)}</p>
            : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{ar?'الأرض':'קרקע'}</th>
                      <th>{t('defaultPrice', lang)}</th>
                      <th title={ar?'الفترة 1 (قراءة 1←2)':'תקופה 1 (קריאה 1←2)'}>{ar?'فترة 1':'תק׳1'}</th>
                      <th title={ar?'الفترة 2 (قراءة 2←3)':'תקופה 2 (קריאה 2←3)'}>{ar?'فترة 2':'תק׳2'}</th>
                      <th title={ar?'الفترة 3 (قراءة 3←4)':'תקופה 3 (קריאה 3←4)'}>{ar?'فترة 3':'תק׳3'}</th>
                      <th>{t('delete', lang)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(prices.landPrices || {}).map(([id, p]) => (
                      <tr key={id}>
                        <td><strong>{landName(id)}</strong></td>
                        <td>₪{p.default || 0}</td>
                        <td>{p.reading_1 ? `₪${p.reading_1}` : '—'}</td>
                        <td>{p.reading_2 ? `₪${p.reading_2}` : '—'}</td>
                        <td>{p.reading_3 ? `₪${p.reading_3}` : '—'}</td>
                        <td>
                          <button onClick={() => rmLand(id)}
                            style={{width:28,height:28,borderRadius:7,border:'1.5px solid #fca5a5',background:'#fff1f2',color:'#dc2626',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:13,transition:'all 0.18s'}}
                            onMouseEnter={e=>{e.currentTarget.style.background='#dc2626';e.currentTarget.style.color='#fff';}}
                            onMouseLeave={e=>{e.currentTarget.style.background='#fff1f2';e.currentTarget.style.color='#dc2626';}}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  ADMIN GALLERY
// ════════════════════════════════════════════════════════════
export function AdminGallery() {
  const { lang } = useLang();
  const ar = lang === 'ar';

  const [gallery, setGallery]     = useState([]);
  const [video, setVideo]         = useState({ url:'', title:'' });
  const [tab, setTab]             = useState('gallery');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [saving, setSaving]       = useState(false);
  const [success, setSuccess]     = useState('');
  const [caption, setCaption]     = useState('');

  useEffect(() => {
    adminAPI.getGallery().then(d => setGallery(d.images || []));
    fetch(process.env.REACT_APP_API_URL + '/admin/video', {
      headers: { Authorization: `Bearer ${localStorage.getItem('shl_token')}` }
    }).then(r => r.json()).then(d => setVideo(d)).catch(() => {});
  }, []);

  const uploadImg = async e => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      const newImgs = [];
      for (let i = 0; i < files.length; i++) {
        setProgress(Math.round((i / files.length) * 100));
        const d = await adminAPI.uploadImage(files[i]);
        newImgs.push({ url: d.url, path: d.path, caption, uploadedAt: new Date().toISOString() });
      }
      const upd = [...gallery, ...newImgs];
      await adminAPI.updateGallery(upd);
      setGallery(upd);
      setCaption('');
      setSuccess('✅ ' + (ar ? 'تم الرفع' : 'הועלה בהצלחה'));
      setTimeout(() => setSuccess(''), 3000);
    } catch(e) { alert(e.message); }
    finally { setUploading(false); setProgress(0); }
  };

  const delImg = async i => {
    if (!window.confirm(ar ? 'حذف الصورة؟' : 'למחוק את התמונה?')) return;
    const img = gallery[i];
    if (img.path) await adminAPI.deleteImage(img.path).catch(() => {});
    const upd = gallery.filter((_, idx) => idx !== i);
    await adminAPI.updateGallery(upd);
    setGallery(upd);
  };

  const saveVideo = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminAPI.updateVideo(video.url, video.title, video.titleHe);
      setSuccess('✅ ' + (ar ? 'تم حفظ الفيديو' : 'הוידאו נשמר'));
      setTimeout(() => setSuccess(''), 3000);
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const ytId = url => url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];

  return (
    <div>
      {success && <div className="alert alert-success mb-16">{success}</div>}
      <div className="flex-gap gap-8 mb-20">
        <button className={`btn btn-sm ${tab === 'gallery' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setTab('gallery')}>🖼️ {t('gallery', lang)} ({gallery.length})</button>
        <button className={`btn btn-sm ${tab === 'video' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setTab('video')}>🎬 {t('video', lang)}</button>
      </div>

      {tab === 'gallery' && (
        <div className="fade-in">
          <div className="card mb-16" style={{ border:'2px dashed var(--border)' }}>
            <div className="form-group">
              <label>{t('captionPlaceholder', lang)} ({t('optional', lang)})</label>
              <input value={caption} onChange={e => setCaption(e.target.value)}
                placeholder={ar ? 'مثال: مشروع الري 2025' : 'לדוגמה: פרויקט השקיה 2025'}/>
            </div>
            <label style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:12, padding:20, border:'2px dashed var(--primary)', borderRadius:12, cursor: uploading ? 'not-allowed' : 'pointer', background:'var(--surface-2)', opacity: uploading ? 0.6 : 1 }}>
              <span style={{ fontSize:28 }}>📷</span>
              <div>
                <div style={{ fontWeight:700, color:'var(--primary)' }}>{t('uploadImages', lang)}</div>
                <div style={{ fontSize:12, color:'var(--text-muted)' }}>{t('uploadTypes', lang)}</div>
              </div>
              <input type="file" multiple accept="image/*" onChange={uploadImg} style={{ display:'none' }} disabled={uploading}/>
            </label>
            {uploading && (
              <div className="mt-8">
                <div className="progress-bar"><div className="progress-fill" style={{ width:`${progress}%` }}/></div>
                <p style={{ textAlign:'center', marginTop:6, fontSize:12, color:'var(--text-muted)' }}>{progress}% {ar ? 'جاري الرفع...' : 'מעלה...'}</p>
              </div>
            )}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px,1fr))', gap:12 }}>
            {gallery.map((img, i) => (
              <div key={i} className="card" style={{ padding:0, overflow:'hidden' }}>
                <div style={{ position:'relative' }}>
                  <img src={img.url} alt="" style={{ width:'100%', height:140, objectFit:'cover', display:'block' }}/>
                  <button onClick={() => delImg(i)}
                    style={{position:'absolute',top:6,left:6,width:26,height:26,borderRadius:6,border:'none',background:'rgba(220,38,38,0.85)',color:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:900}}>✕</button>
                  <div style={{ position:'absolute', top:6, right:6, background:'rgba(0,0,0,0.6)', color:'#fff', padding:'2px 8px', borderRadius:4, fontSize:11 }}>{i + 1}</div>
                </div>
                <div style={{ padding:8 }}>
                  <input style={{ fontSize:12, padding:'5px 8px' }}
                    placeholder={ar ? 'تعليق...' : 'כיתוב...'}
                    defaultValue={img.caption || ''}
                    onBlur={async e => {
                      const upd = [...gallery];
                      upd[i] = { ...upd[i], caption: e.target.value };
                      setGallery(upd);
                      await adminAPI.updateGallery(upd);
                    }}/>
                </div>
              </div>
            ))}
          </div>
          {gallery.length === 0 && (
            <div className="card empty-state mt-16">
              <span className="icon">🖼️</span>
              <p>{t('noGallery', lang)}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'video' && (
        <div className="card fade-in">
          <h3 className="mb-16">🎬 {ar ? 'فيديو زراعي' : 'סרטון חקלאי'}</h3>
          <form onSubmit={saveVideo}>
            <div className="form-group">
              <label>{t('youtubeLink', lang)}</label>
              <input value={video.url} onChange={e => setVideo({...video, url: e.target.value})}
                placeholder="https://www.youtube.com/watch?v=..."/>
            </div>
            <div className="form-group">
              <label>{t('videoTitle', lang)} ({t('optional', lang)})</label>
              <input value={video.title || ''} onChange={e => setVideo({...video, title: e.target.value})}
                placeholder={ar ? 'نصائح زراعية للموسم' : 'טיפים חקלאיים לעונה'}/>
            </div>
            {video.url && ytId(video.url) && (
              <div style={{ position:'relative', paddingBottom:'56.25%', borderRadius:12, overflow:'hidden', marginBottom:16 }}>
                <iframe src={`https://www.youtube.com/embed/${ytId(video.url)}`}
                  style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}
                  frameBorder="0" allowFullScreen title="preview"/>
              </div>
            )}
            <div className="flex-gap gap-12">
              <button type="submit" className="btn btn-primary" disabled={saving}>💾 {t('save', lang)}</button>
              {video.url && (
                <button type="button" className="btn btn-danger"
                  onClick={async () => { await adminAPI.updateVideo('', ''); setVideo({ url:'', title:'' }); }}>
                  {t('deleteVideo', lang)}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  ADMIN SETTINGS
// ════════════════════════════════════════════════════════════
export function AdminSettings() {
  const { lang } = useLang();
  const ar = lang === 'ar';

  const [ann, setAnn]         = useState({ text:'' });
  const [saving, setSaving]   = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError]     = useState('');

  useEffect(() => { adminAPI.getAnnouncement().then(setAnn); }, []);

  const saveAnn = async e => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await adminAPI.updateAnnouncement(ann.text);
      setSuccess('✅ ' + t('saveAnnouncement', lang).replace('💾 ', ''));
      setTimeout(() => setSuccess(''), 3000);
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      {success && <div className="alert alert-success mb-16">{success}</div>}
      {error   && <div className="alert alert-error mb-16">{error}</div>}

      <VatSettings ar={ar} lang={lang} />

      <div className="card mb-20">
        <h3 className="mb-8">📢 {t('announcement', lang)}</h3>
        <p style={{ color:'var(--text-muted)', fontSize:13, marginBottom:16 }}>{t('announcementDesc', lang)}</p>
        {ann.text && (
          <div className="announce-banner mb-16">
            <div className="announce-icon">📢</div>
            <div>
              <p className="announce-text">{ann.text}</p>
              {ann.updatedAt && (
                <span className="announce-date">
                  {new Date(ann.updatedAt).toLocaleString(ar ? 'ar' : 'he-IL')}
                </span>
              )}
            </div>
          </div>
        )}
        <form onSubmit={saveAnn}>
          <div className="form-group">
            <label>{t('announcementText', lang)}</label>
            <textarea rows={4} value={ann.text}
              onChange={e => setAnn({...ann, text: e.target.value})}
              placeholder={t('announcementPlaceholder', lang)}/>
          </div>
          <div className="flex-gap gap-12">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('saving', lang) : t('saveAnnouncement', lang)}
            </button>
            {ann.text && (
              <button type="button" className="btn btn-danger"
                onClick={async () => { await adminAPI.updateAnnouncement(''); setAnn({ text:'' }); }}>
                {t('deleteAnnouncement', lang)}
              </button>
            )}
          </div>
        </form>
      </div>

      <PrivilegedUsers lang={lang} ar={ar} />
    </div>
  );
}

// ── إعداد نسبة الضريبة (מע"מ) ──────────────────────────────────
function VatSettings({ ar, lang }) {
  const [prices, setPrices] = useState(null);
  const [vat, setVat]       = useState('18');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    adminAPI.getPrices().then(p => {
      setPrices(p);
      setVat(String(p?.vatRate ?? 18));
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await adminAPI.updatePrices({ ...prices, vatRate: parseFloat(vat) || 0 });
      setSuccess('✅ ' + (ar ? 'تم الحفظ' : 'נשמר'));
      setTimeout(() => setSuccess(''), 3000);
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="card mb-20">
      <h3 className="mb-8">🧾 {ar ? 'نسبة الضريبة (מע"מ)' : 'אחוז מע"מ'}</h3>
      <p style={{ color:'var(--text-muted)', fontSize:13, marginBottom:16 }}>
        {ar
          ? 'الأسعار في صفحة "الأسعار" تُدخل دائماً قبل الضريبة. هذه النسبة تُضاف تلقائياً على كل حسابات القراءات والتقارير.'
          : 'המחירים בעמוד "מחירים" מוזנים תמיד לפני מע"מ. אחוז זה מתווסף אוטומטית לכל חישובי הקריאות והדוחות.'}
      </p>
      {success && <div className="alert alert-success mb-16">{success}</div>}
      <div style={{ display:'flex', gap:12, alignItems:'flex-end', maxWidth:260 }}>
        <div className="form-group" style={{ marginBottom:0, flex:1 }}>
          <label>{ar ? 'نسبة الضريبة (%)' : 'אחוז מע"מ (%)'}</label>
          <input type="number" step="0.1" min="0" max="100"
            value={vat} onChange={e => setVat(e.target.value)} placeholder="18"/>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving || prices===null}>💾</button>
      </div>
    </div>
  );
}

// ── إدارة المخولين ──────────────────────────────────────────
function PrivilegedUsers({ lang, ar }) {
  const [users, setUsers]     = useState([]);
  const [farmers, setFarmers] = useState([]);
  // ✅ قائمة المشاريع (لاختيار المشاريع المسموح للمراقب بإدارتها بالكامل)
  const [projects, setProjects] = useState([]);
  const [form, setForm]       = useState({ idNumber:'', role:'admin', label:'', password:'', allowedProjectIds:[] });
  const [selectedFarmer, setSelectedFarmer] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [newPass, setNewPassPriv] = useState('');
  // ✅ قائمة المشاريع الجاري تعديلها بمودال تغيير كلمة المرور/الصلاحيات
  const [editAllowedIds, setEditAllowedIds] = useState([]);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');

  const ROLES = {
    admin:  ar ? '🔐 مدير رئيسي' : '🔐 מנהל ראשי',
    viewer: ar ? '👁 مراقب'      : '👁 צופה',
  };

  const load = () => privilegedAPI.getAll().then(d => setUsers(d.users || [])).catch(() => {});
  useEffect(() => {
    adminAPI.getFarmers().then(d => setFarmers(d.farmers || [])).catch(() => {});
    adminAPI.getProjects().then(d => setProjects(d.projects || [])).catch(() => {});
  }, []);

  const openEdit = (u) => {
    setEditUser(u);
    setNewPassPriv('');
    setEditAllowedIds(u.allowedProjectIds || []);
    setError('');
  };

  const toggleEditProject = (projId) => {
    setEditAllowedIds(prev =>
      prev.includes(projId) ? prev.filter(id => id !== projId) : [...prev, projId]
    );
  };

  const toggleFormProject = (projId) => {
    setForm(prev => ({
      ...prev,
      allowedProjectIds: prev.allowedProjectIds.includes(projId)
        ? prev.allowedProjectIds.filter(id => id !== projId)
        : [...prev.allowedProjectIds, projId],
    }));
  };

  const saveEdit = async () => {
    if (!newPass) { setError(ar ? 'أدخل كلمة المرور الجديدة' : 'הזן סיסמה חדשה'); return; }
    if (newPass.length < 6) { setError(t('passMin', lang)); return; }
    setSaving(true);
    setError('');
    try {
      await privilegedAPI.update(editUser.id, {
        password: newPass, label: editUser.label, role: editUser.role,
        // ✅ نحفظ قائمة المشاريع المسموحة كمان (فقط ذات معنى إذا كان الدور مراقب)
        allowedProjectIds: editUser.role === 'viewer' ? editAllowedIds : [],
      });
      setEditUser(null);
      setNewPassPriv('');
      setEditAllowedIds([]);
      setSuccess('✅ ' + (ar ? 'تم الحفظ' : 'נשמר'));
      setTimeout(() => setSuccess(''), 3000);
      load();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  useEffect(() => { load(); }, []);

  const submit = async e => {
    e.preventDefault();
    if (!form.idNumber || !form.password) {
      setError(ar ? 'رقم الهوية وكلمة المرور مطلوبان' : 'מספר ת"ז וסיסמה חובה');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await privilegedAPI.add(form);
      setForm({ idNumber:'', role:'admin', label:'', password:'', allowedProjectIds:[] });
      setSelectedFarmer(null);
      setShowForm(false);
      setSuccess('✅ ' + (ar ? 'تم إضافة المخوّل' : 'המשתמש נוסף'));
      setTimeout(() => setSuccess(''), 3000);
      load();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const remove = async (id, label) => {
    if (!window.confirm(`${ar ? 'حذف' : 'מחיקת'} "${label}"?`)) return;
    await privilegedAPI.remove(id);
    load();
  };

  return (
    <div className="card">
      {success && <div className="alert alert-success mb-16">{success}</div>}
      <div className="flex-between mb-16">
        <div>
          <h3 className="mb-4">👥 {ar ? 'إدارة المخولين' : 'ניהול משתמשים מורשים'}</h3>
          <p style={{ color:'var(--text-muted)', fontSize:13 }}>
            {ar ? 'الأشخاص الذين يستطيعون الدخول كمدير أو مراقب' : 'אנשים שיכולים להיכנס כמנהל או צופה'}
          </p>
        </div>
        <button className="btn btn-primary btn-sm"
          onClick={() => { setShowForm(v => !v); setError(''); setSelectedFarmer(null); setForm({ idNumber:'', role:'admin', label:'', password:'', allowedProjectIds:[] }); }}>
          {showForm ? (ar ? '✕ إلغاء' : '✕ ביטול') : (ar ? '+ إضافة مخوّل' : '+ הוסף מורשה')}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card mb-16" style={{ background:'var(--surface-2)', border:'none' }}>
          <h4 className="mb-12">{ar ? '+ مخوّل جديد' : '+ מורשה חדש'}</h4>
          <div className="grid-2">
            <div className="form-group">
              <label>{t('idNumber', lang)} *</label>
              <input value={form.idNumber} onChange={e => {
                const farmer = farmers.find(f => f.idNumber === e.target.value);
                setSelectedFarmer(farmer || null);
                setForm({...form, idNumber: e.target.value, label: farmer ? farmer.name : form.label});
              }} placeholder="012345678"/>
              {selectedFarmer && <small style={{color:'var(--primary)',fontWeight:700}}>✓ {selectedFarmer.name}</small>}
            </div>
            <div className="form-group">
              <label>{ar ? 'الدور' : 'תפקיד'} *</label>
              <select value={form.role} onChange={e => setForm({...form, role: e.target.value, allowedProjectIds: e.target.value === 'viewer' ? form.allowedProjectIds : []})}>
                <option value="admin">{ROLES.admin}</option>
                <option value="viewer">{ROLES.viewer}</option>
              </select>
            </div>
            <div className="form-group">
              <label>{ar ? 'الاسم / الوصف' : 'שם / תיאור'} ({t('optional', lang)})</label>
              <input value={form.label} onChange={e => setForm({...form, label: e.target.value})}
                placeholder={ar ? 'مثال: علاء - مدير' : 'לדוגמה: עלאא - מנהל'}/>
            </div>
            <div className="form-group">
              <label>{ar ? 'كلمة المرور' : 'סיסמה'} *</label>
              <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="••••••••"/>
            </div>
          </div>

          {/* ✅ اختيار المشاريع المسموح بإدارتها بالكامل — يظهر فقط عند اختيار دور "مراقب" */}
          {form.role === 'viewer' && (
            <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:10, padding:'12px 14px', marginTop:8, marginBottom:8 }}>
              <label style={{ fontWeight:700, color:'#92400e', fontSize:13, display:'block', marginBottom:8 }}>
                🏗️ {ar
                  ? 'صلاحية كاملة على مشاريع محددة (إضافة/تعديل/حذف مشتركين ودفعات)'
                  : 'הרשאה מלאה על פרויקטים ספציפיים (הוספה/עריכה/מחיקה של משתתפים ותשלומים)'}
              </label>
              {projects.length === 0 ? (
                <p style={{ fontSize:12, color:'var(--text-muted)', margin:0 }}>
                  {ar ? 'لا توجد مشاريع بعد' : 'אין פרויקטים עדיין'}
                </p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:160, overflowY:'auto' }}>
                  {projects.map(p => (
                    <label key={p.id} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
                      <input type="checkbox"
                        checked={form.allowedProjectIds.includes(p.id)}
                        onChange={() => toggleFormProject(p.id)}
                        style={{ width:16, height:16, cursor:'pointer' }}/>
                      <span>{p.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <div className="alert alert-error mb-8">{error}</div>}
          <div className="flex-gap gap-8">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('saving', lang) : `+ ${ar ? 'إضافة' : 'הוסף'}`}
            </button>
            <button type="button" className="btn btn-outline"
              onClick={() => { setShowForm(false); setError(''); }}>
              {t('cancel', lang)}
            </button>
          </div>
        </form>
      )}

      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('idNumber', lang)}</th>
              <th>{ar ? 'الدور' : 'תפקיד'}</th>
              <th>{ar ? 'الاسم' : 'שם'}</th>
              <th>{ar ? 'مشاريع مسموحة' : 'פרויקטים מורשים'}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr><td colSpan={5} style={{textAlign:'center', color:'var(--text-muted)', padding:20}}>
                {ar ? 'لا يوجد مخولون' : 'אין משתמשים מורשים'}
              </td></tr>
            )}
            {users.map(u => (
              <tr key={u.id}>
                <td><code style={{background:'var(--surface-2)', padding:'2px 8px', borderRadius:4}}>{u.idNumber}</code></td>
                <td><span className="badge badge-blue">{ROLES[u.role] || u.role}</span></td>
                <td style={{fontFamily:'Heebo,sans-serif', fontWeight:600}}>{u.label || '—'}</td>
                <td style={{fontSize:12}}>
                  {u.role === 'viewer' && (u.allowedProjectIds || []).length > 0
                    ? (u.allowedProjectIds || [])
                        .map(pid => projects.find(p => p.id === pid)?.name || pid)
                        .join('، ')
                    : <span style={{color:'var(--text-muted)'}}>—</span>}
                </td>
                <td>
                  <div className="flex-gap gap-4">
                    <button onClick={() => openEdit(u)}
                      style={{width:28,height:28,borderRadius:7,border:'1.5px solid var(--border)',background:'var(--surface-2)',color:'var(--primary)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:13}}
                      onMouseEnter={e=>{e.currentTarget.style.background='var(--primary)';e.currentTarget.style.color='#fff';}}
                      onMouseLeave={e=>{e.currentTarget.style.background='var(--surface-2)';e.currentTarget.style.color='var(--primary)';}}>✏</button>
                    <button onClick={() => remove(u.id, u.label || u.idNumber)}
                      style={{width:28,height:28,borderRadius:7,border:'1.5px solid #fca5a5',background:'#fff1f2',color:'#dc2626',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:13}}
                      onMouseEnter={e=>{e.currentTarget.style.background='#dc2626';e.currentTarget.style.color='#fff';}}
                      onMouseLeave={e=>{e.currentTarget.style.background='#fff1f2';e.currentTarget.style.color='#dc2626';}}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal تغيير كلمة المرور + الصلاحيات */}
      {editUser && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:16,padding:28,width:'100%',maxWidth:420,maxHeight:'88vh',overflowY:'auto',boxShadow:'0 8px 40px rgba(0,0,0,0.2)'}}>
            <h3 className="mb-16">🔐 {ar ? 'تعديل صلاحيات' : 'עריכת הרשאות'}</h3>
            <p style={{color:'var(--text-muted)',fontSize:13,marginBottom:16}}>
              {editUser.label || editUser.idNumber} — <span className="badge badge-blue">{ROLES[editUser.role]}</span>
            </p>
            <div className="form-group">
              <label>{t('newPassword', lang)} *</label>
              <input type="password" value={newPass}
                onChange={e => setNewPassPriv(e.target.value)}
                placeholder="••••••••" autoFocus/>
            </div>

            {/* ✅ تعديل المشاريع المسموحة — فقط للمراقب */}
            {editUser.role === 'viewer' && (
              <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:10, padding:'12px 14px', marginBottom:14 }}>
                <label style={{ fontWeight:700, color:'#92400e', fontSize:13, display:'block', marginBottom:8 }}>
                  🏗️ {ar
                    ? 'صلاحية كاملة على مشاريع محددة'
                    : 'הרשאה מלאה על פרויקטים ספציפיים'}
                </label>
                {projects.length === 0 ? (
                  <p style={{ fontSize:12, color:'var(--text-muted)', margin:0 }}>
                    {ar ? 'لا توجد مشاريع بعد' : 'אין פרויקטים עדיין'}
                  </p>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:160, overflowY:'auto' }}>
                    {projects.map(p => (
                      <label key={p.id} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
                        <input type="checkbox"
                          checked={editAllowedIds.includes(p.id)}
                          onChange={() => toggleEditProject(p.id)}
                          style={{ width:16, height:16, cursor:'pointer' }}/>
                        <span>{p.name}</span>
                      </label>
                    ))}
                  </div>
                )}
                <p style={{ fontSize:11, color:'#92400e', marginTop:8, marginBottom:0 }}>
                  ⚠️ {ar
                    ? 'التغيير يتطلب من المستخدم تسجيل الخروج والدخول من جديد ليصبح فعالاً.'
                    : 'השינוי דורש מהמשתמש להתנתק ולהתחבר מחדש כדי להיכנס לתוקף.'}
                </p>
              </div>
            )}

            {error && <div className="alert alert-error mb-8">{error}</div>}
            <div className="flex-gap gap-8">
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
                {saving ? t('saving', lang) : t('changeBtn', lang)}
              </button>
              <button className="btn btn-outline" onClick={() => { setEditUser(null); setError(''); setEditAllowedIds([]); }}>
                {t('cancel', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPrices;