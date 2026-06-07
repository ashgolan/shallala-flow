import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { adminAPI, privilegedAPI, regionsAPI } from '../../api';
import { useLang } from '../../contexts/LangContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// ✅ AdminReports مستورد من ملفه المستقل
export { AdminReports } from './AdminReports';

// ════════════════════════════════════════════════════════════
//  ADMIN PRICES
// ════════════════════════════════════════════════════════════
export function AdminPrices() {
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
    try { await adminAPI.updatePrices(data); setPrices(data); setSuccess('✅ تم الحفظ'); setTimeout(()=>setSuccess(''),3000); }
    catch(e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const addYear = async e => {
    e.preventDefault();
    if (!newYear) return;
    const upd = { ...prices, yearPrices: { ...prices.yearPrices, [newYear]: { default: parseFloat(nyP.default)||0, ...(nyP.reading_1&&{reading_1:parseFloat(nyP.reading_1)}), ...(nyP.reading_2&&{reading_2:parseFloat(nyP.reading_2)}), ...(nyP.reading_3&&{reading_3:parseFloat(nyP.reading_3)}) } } };
    await save(upd); setNewYear(''); setNyP({ default:'', reading_1:'', reading_2:'', reading_3:'' });
  };

  const rmYear = async y => { const yp={...prices.yearPrices}; delete yp[y]; await save({...prices,yearPrices:yp}); };

  const addLand = async e => {
    e.preventDefault();
    if (!selLand) return;
    const upd = { ...prices, landPrices: { ...prices.landPrices, [selLand]: { default: parseFloat(nlP.default)||0, ...(nlP.reading_1&&{reading_1:parseFloat(nlP.reading_1)}), ...(nlP.reading_2&&{reading_2:parseFloat(nlP.reading_2)}), ...(nlP.reading_3&&{reading_3:parseFloat(nlP.reading_3)}) } } };
    await save(upd); setSelLand(''); setNlP({ default:'', reading_1:'', reading_2:'', reading_3:'' });
  };

  const rmLand = async id => { const lp={...prices.landPrices}; delete lp[id]; await save({...prices,landPrices:lp}); };
  const landName = id => lands.find(l=>l.id===id)?.name||id;

  return (
    <div>
      {success && <div className="alert alert-success mb-16">{success}</div>}
      <div className="card mb-16" style={{ padding:12, background:'var(--surface-2)', border:'none' }}>
        <h4 className="mb-8">📌 أولوية الأسعار (الأعلى أولاً)</h4>
        <div style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:2 }}>
          1️⃣ سعر أرض معينة في قراءة معينة &nbsp;·&nbsp; 2️⃣ سعر عام لأرض &nbsp;·&nbsp; 3️⃣ سعر سنة في قراءة &nbsp;·&nbsp; 4️⃣ سعر عام لسنة &nbsp;·&nbsp; 5️⃣ السعر العام
        </div>
      </div>

      <div className="flex-gap gap-8 mb-20">
        {[['global','🌐 السعر العام'],['yearly','📅 أسعار السنوات'],['land','🌾 أسعار الأراضي']].map(([k,l])=>(
          <button key={k} className={`btn btn-sm ${section===k?'btn-primary':'btn-outline'}`} onClick={()=>setSection(k)}>{l}</button>
        ))}
      </div>

      {section==='global' && (
        <div className="card fade-in">
          <h3 className="mb-16">🌐 السعر العام الافتراضي</h3>
          <p style={{ color:'var(--text-muted)', fontSize:13, marginBottom:16 }}>يُطبَّق على القراءات التي ليس لها سعر خاص</p>
          <div style={{ display:'flex', gap:12, alignItems:'flex-end', maxWidth:300 }}>
            <div className="form-group" style={{ marginBottom:0, flex:1 }}>
              <label>السعر لكل كوب (₪)</label>
              <input type="number" step="0.01" value={prices.globalPrice||''} onChange={e=>setPrices({...prices,globalPrice:parseFloat(e.target.value)||0})} placeholder="0.00"/>
            </div>
            <button className="btn btn-primary" onClick={()=>save(prices)} disabled={saving}>💾</button>
          </div>
          <div style={{ marginTop:14, padding:'10px 14px', background:'var(--surface-2)', borderRadius:8, fontSize:14, fontWeight:700, color:'var(--primary)' }}>
            السعر الحالي: ₪{prices.globalPrice||0} / كوب
          </div>
        </div>
      )}

      {section==='yearly' && (
        <div className="card fade-in">
          <h3 className="mb-16">📅 أسعار خاصة بالسنوات</h3>
          <form onSubmit={addYear} style={{ background:'var(--surface-2)', padding:16, borderRadius:12, marginBottom:20 }}>
            <h4 className="mb-12">إضافة سنة</h4>
            <div className="grid-2">
              <div className="form-group"><label>السنة</label><input type="number" value={newYear} onChange={e=>setNewYear(e.target.value)} placeholder="2025" min={2000} max={2100}/></div>
              <div className="form-group"><label>السعر الافتراضي للسنة (₪)</label><input type="number" step="0.01" value={nyP.default} onChange={e=>setNyP({...nyP,default:e.target.value})} placeholder="0.00"/></div>
              {['1','2','3'].map(n=><div className="form-group" key={n}><label>سعر القراءة {n} (اختياري)</label><input type="number" step="0.01" value={nyP[`reading_${n}`]} onChange={e=>setNyP({...nyP,[`reading_${n}`]:e.target.value})} placeholder="0.00"/></div>)}
            </div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>+ إضافة</button>
          </form>
          {Object.keys(prices.yearPrices||{}).length===0 ? <p style={{color:'var(--text-muted)',textAlign:'center',padding:20}}>لا توجد أسعار خاصة بالسنوات</p> : (
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>السنة</th><th>الافتراضي</th><th>ق1</th><th>ق2</th><th>ق3</th><th>حذف</th></tr></thead>
                <tbody>
                  {Object.entries(prices.yearPrices||{}).sort(([a],[b])=>b-a).map(([y,p])=>(
                    <tr key={y}>
                      <td><strong>{y}</strong></td>
                      <td>₪{p.default||0}</td>
                      <td>{p.reading_1?`₪${p.reading_1}`:'—'}</td>
                      <td>{p.reading_2?`₪${p.reading_2}`:'—'}</td>
                      <td>{p.reading_3?`₪${p.reading_3}`:'—'}</td>
                      <td><button onClick={()=>rmYear(y)} style={{width:28,height:28,borderRadius:7,border:'1.5px solid #fca5a5',background:'#fff1f2',color:'#dc2626',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:13,transition:'all 0.18s'}} onMouseEnter={e=>{e.currentTarget.style.background='#dc2626';e.currentTarget.style.color='#fff';}} onMouseLeave={e=>{e.currentTarget.style.background='#fff1f2';e.currentTarget.style.color='#dc2626';}}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {section==='land' && (
        <div className="card fade-in">
          <h3 className="mb-16">🌾 أسعار خاصة بالأراضي</h3>
          <form onSubmit={addLand} style={{ background:'var(--surface-2)', padding:16, borderRadius:12, marginBottom:20 }}>
            <h4 className="mb-12">إضافة سعر لأرض</h4>
            <div className="grid-2">
              <div className="form-group"><label>الأرض</label><select value={selLand} onChange={e=>setSelLand(e.target.value)}><option value="">— اختر —</option>{lands.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
              <div className="form-group"><label>السعر الافتراضي (₪)</label><input type="number" step="0.01" value={nlP.default} onChange={e=>setNlP({...nlP,default:e.target.value})} placeholder="0.00"/></div>
              {['1','2','3'].map(n=><div className="form-group" key={n}><label>سعر القراءة {n} (اختياري)</label><input type="number" step="0.01" value={nlP[`reading_${n}`]} onChange={e=>setNlP({...nlP,[`reading_${n}`]:e.target.value})} placeholder="0.00"/></div>)}
            </div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>+ إضافة</button>
          </form>
          {Object.keys(prices.landPrices||{}).length===0 ? <p style={{color:'var(--text-muted)',textAlign:'center',padding:20}}>لا توجد أسعار خاصة بالأراضي</p> : (
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>الأرض</th><th>الافتراضي</th><th>ق1</th><th>ق2</th><th>ق3</th><th>حذف</th></tr></thead>
                <tbody>
                  {Object.entries(prices.landPrices||{}).map(([id,p])=>(
                    <tr key={id}>
                      <td><strong>{landName(id)}</strong></td>
                      <td>₪{p.default||0}</td>
                      <td>{p.reading_1?`₪${p.reading_1}`:'—'}</td>
                      <td>{p.reading_2?`₪${p.reading_2}`:'—'}</td>
                      <td>{p.reading_3?`₪${p.reading_3}`:'—'}</td>
                      <td><button onClick={()=>rmLand(id)} style={{width:28,height:28,borderRadius:7,border:'1.5px solid #fca5a5',background:'#fff1f2',color:'#dc2626',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:13,transition:'all 0.18s'}} onMouseEnter={e=>{e.currentTarget.style.background='#dc2626';e.currentTarget.style.color='#fff';}} onMouseLeave={e=>{e.currentTarget.style.background='#fff1f2';e.currentTarget.style.color='#dc2626';}}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  ADMIN GALLERY
// ════════════════════════════════════════════════════════════
export function AdminGallery() {
  const [gallery, setGallery]   = useState([]);
  const [video, setVideo]       = useState({ url:'', title:'' });
  const [tab, setTab]           = useState('gallery');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving]     = useState(false);
  const [success, setSuccess]   = useState('');
  const [caption, setCaption]   = useState('');

  useEffect(() => {
    adminAPI.getGallery().then(d=>setGallery(d.images||[]));
    fetch(process.env.REACT_APP_API_URL+'/admin/video', { headers:{Authorization:`Bearer ${localStorage.getItem('shl_token')}`} }).then(r=>r.json()).then(d=>setVideo(d)).catch(()=>{});
  }, []);

  const uploadImg = async e => {
    const files = Array.from(e.target.files); if (!files.length) return;
    setUploading(true);
    try {
      const newImgs = [];
      for (let i=0; i<files.length; i++) {
        setProgress(Math.round((i/files.length)*100));
        const d = await adminAPI.uploadImage(files[i]);
        newImgs.push({ url:d.url, path:d.path, caption, uploadedAt:new Date().toISOString() });
      }
      const upd = [...gallery, ...newImgs];
      await adminAPI.updateGallery(upd); setGallery(upd); setCaption('');
      setSuccess('✅ تم الرفع'); setTimeout(()=>setSuccess(''),3000);
    } catch(e) { alert(e.message); }
    finally { setUploading(false); setProgress(0); }
  };

  const delImg = async i => {
    if (!window.confirm('حذف الصورة؟')) return;
    const img = gallery[i];
    if (img.path) await adminAPI.deleteImage(img.path).catch(()=>{});
    const upd = gallery.filter((_,idx)=>idx!==i);
    await adminAPI.updateGallery(upd); setGallery(upd);
  };

  const saveVideo = async e => {
    e.preventDefault(); setSaving(true);
    try { await adminAPI.updateVideo(video.url, video.title); setSuccess('✅ تم حفظ الفيديو'); setTimeout(()=>setSuccess(''),3000); }
    catch(e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const ytId = url => url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];

  return (
    <div>
      {success && <div className="alert alert-success mb-16">{success}</div>}
      <div className="flex-gap gap-8 mb-20">
        <button className={`btn btn-sm ${tab==='gallery'?'btn-primary':'btn-outline'}`} onClick={()=>setTab('gallery')}>🖼️ معرض الصور ({gallery.length})</button>
        <button className={`btn btn-sm ${tab==='video'?'btn-primary':'btn-outline'}`} onClick={()=>setTab('video')}>🎬 فيديو</button>
      </div>

      {tab==='gallery' && (
        <div className="fade-in">
          <div className="card mb-16" style={{ border:'2px dashed var(--border)' }}>
            <div className="form-group"><label>تعليق للصور الجديدة (اختياري)</label><input value={caption} onChange={e=>setCaption(e.target.value)} placeholder="مثال: مشروع الري 2025"/></div>
            <label style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:12, padding:20, border:'2px dashed var(--primary)', borderRadius:12, cursor:uploading?'not-allowed':'pointer', background:'var(--surface-2)', opacity:uploading?0.6:1 }}>
              <span style={{ fontSize:28 }}>📷</span>
              <div><div style={{ fontWeight:700, color:'var(--primary)' }}>اختر صوراً للرفع</div><div style={{ fontSize:12, color:'var(--text-muted)' }}>PNG, JPG, WEBP — عدة صور مرة واحدة</div></div>
              <input type="file" multiple accept="image/*" onChange={uploadImg} style={{ display:'none' }} disabled={uploading}/>
            </label>
            {uploading && <div className="mt-8"><div className="progress-bar"><div className="progress-fill" style={{ width:`${progress}%` }}/></div><p style={{ textAlign:'center', marginTop:6, fontSize:12, color:'var(--text-muted)' }}>{progress}% جاري الرفع...</p></div>}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px,1fr))', gap:12 }}>
            {gallery.map((img,i)=>(
              <div key={i} className="card" style={{ padding:0, overflow:'hidden' }}>
                <div style={{ position:'relative' }}>
                  <img src={img.url} alt="" style={{ width:'100%', height:140, objectFit:'cover', display:'block' }}/>
                  <button onClick={()=>delImg(i)} style={{position:'absolute',top:6,left:6,width:26,height:26,borderRadius:6,border:'none',background:'rgba(220,38,38,0.85)',color:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:900}}>✕</button>
                  <div style={{ position:'absolute', top:6, right:6, background:'rgba(0,0,0,0.6)', color:'#fff', padding:'2px 8px', borderRadius:4, fontSize:11 }}>{i+1}</div>
                </div>
                <div style={{ padding:8 }}>
                  <input style={{ fontSize:12, padding:'5px 8px' }} placeholder="تعليق..." defaultValue={img.caption||''} onBlur={async e => { const upd=[...gallery]; upd[i]={...upd[i],caption:e.target.value}; setGallery(upd); await adminAPI.updateGallery(upd); }}/>
                </div>
              </div>
            ))}
          </div>
          {gallery.length===0&&<div className="card empty-state mt-16"><span className="icon">🖼️</span><p>لا توجد صور في المعرض</p></div>}
        </div>
      )}

      {tab==='video' && (
        <div className="card fade-in">
          <h3 className="mb-16">🎬 فيديو زراعي</h3>
          <form onSubmit={saveVideo}>
            <div className="form-group"><label>رابط يوتيوب</label><input value={video.url} onChange={e=>setVideo({...video,url:e.target.value})} placeholder="https://www.youtube.com/watch?v=..."/></div>
            <div className="form-group"><label>عنوان (اختياري)</label><input value={video.title||''} onChange={e=>setVideo({...video,title:e.target.value})} placeholder="نصائح زراعية للموسم"/></div>
            {video.url && ytId(video.url) && (
              <div style={{ position:'relative', paddingBottom:'56.25%', borderRadius:12, overflow:'hidden', marginBottom:16 }}>
                <iframe src={`https://www.youtube.com/embed/${ytId(video.url)}`} style={{ position:'absolute', inset:0, width:'100%', height:'100%' }} frameBorder="0" allowFullScreen title="preview"/>
              </div>
            )}
            <div className="flex-gap gap-12">
              <button type="submit" className="btn btn-primary" disabled={saving}>💾 حفظ</button>
              {video.url && <button type="button" className="btn btn-danger" onClick={async()=>{ await adminAPI.updateVideo('',''); setVideo({url:'',title:''}); }}>🗑️ حذف</button>}
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
  const [ann, setAnn]         = useState({ text:'' });
  const [saving, setSaving]   = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError]     = useState('');

  useEffect(() => { adminAPI.getAnnouncement().then(setAnn); }, []);

  const saveAnn = async e => {
    e.preventDefault(); setSaving(true); setError(''); setSuccess('');
    try { await adminAPI.updateAnnouncement(ann.text); setSuccess('✅ تم حفظ الإعلان'); setTimeout(()=>setSuccess(''),3000); }
    catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      {success && <div className="alert alert-success mb-16">{success}</div>}
      {error && <div className="alert alert-error mb-16">{error}</div>}
      <div className="card mb-20">
        <h3 className="mb-8">📢 إعلان صفحة الدخول</h3>
        <p style={{ color:'var(--text-muted)', fontSize:13, marginBottom:16 }}>يظهر بارزاً في أعلى صفحة تسجيل الدخول مع تاريخ وساعة آخر تعديل</p>
        {ann.text && (
          <div className="announce-banner mb-16">
            <div className="announce-icon">📢</div>
            <div><p className="announce-text">{ann.text}</p>{ann.updatedAt&&<span className="announce-date">{new Date(ann.updatedAt).toLocaleString('ar')}</span>}</div>
          </div>
        )}
        <form onSubmit={saveAnn}>
          <div className="form-group"><textarea rows={4} value={ann.text} onChange={e=>setAnn({...ann,text:e.target.value})} placeholder="مثال: تم إدخال قراءات الفصل الثاني — يرجى مراجعة حساباتكم"/></div>
          <div className="flex-gap gap-12">
            <button type="submit" className="btn btn-primary" disabled={saving}>💾 حفظ</button>
            {ann.text && <button type="button" className="btn btn-danger" onClick={async()=>{ await adminAPI.updateAnnouncement(''); setAnn({text:''}); }}>🗑️ حذف</button>}
          </div>
        </form>
      </div>
      <PrivilegedUsers />
    </div>
  );
}

// ── إدارة المخولين ──────────────────────────────────────────
function PrivilegedUsers() {
  const [users, setUsers]     = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [form, setForm]       = useState({ idNumber:'', role:'admin', label:'', password:'' });
  const [selectedFarmer, setSelectedFarmer] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [newPass, setNewPassPriv] = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');

  const load = () => privilegedAPI.getAll().then(d => setUsers(d.users||[])).catch(()=>{});
  useEffect(() => { adminAPI.getFarmers().then(d => setFarmers(d.farmers||[])).catch(()=>{}); }, []);
  const openEdit = (u) => { setEditUser(u); setNewPassPriv(''); setError(''); };

  const saveEdit = async () => {
    if (!newPass) { setError('أدخل كلمة المرور الجديدة'); return; }
    if (newPass.length < 6) { setError('6 أحرف على الأقل'); return; }
    setSaving(true); setError('');
    try {
      await privilegedAPI.update(editUser.id, { password: newPass, label: editUser.label, role: editUser.role });
      setEditUser(null); setNewPassPriv('');
      setSuccess('✅ تم تغيير كلمة المرور'); setTimeout(()=>setSuccess(''),3000);
      load();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };
  useEffect(() => { load(); }, []);

  const submit = async e => {
    e.preventDefault();
    if (!form.idNumber || !form.password) { setError('رقم الهوية وكلمة المرور مطلوبان'); return; }
    setSaving(true); setError('');
    try {
      await privilegedAPI.add(form);
      setForm({ idNumber:'', role:'admin', label:'', password:'' });
      setSelectedFarmer(null); setShowForm(false);
      setSuccess('✅ تم إضافة المخوّل'); setTimeout(()=>setSuccess(''),3000);
      load();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const remove = async (id, label) => {
    if (!window.confirm(`حذف "${label}"?`)) return;
    await privilegedAPI.remove(id); load();
  };

  const ROLES = { admin: '🔐 مدير رئيسي', viewer: '👁 مراقب' };

  return (
    <div className="card">
      <div className="flex-between mb-16">
        <div>
          <h3 className="mb-4">👥 إدارة المخولين</h3>
          <p style={{ color:'var(--text-muted)', fontSize:13 }}>الأشخاص الذين يستطيعون الدخول كمدير أو مراقب بعد التحقق من هويتهم</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={()=>{setShowForm(v=>!v);setError('');setSelectedFarmer(null);setForm({idNumber:'',role:'admin',label:'',password:''});}}>
          {showForm ? 'إلغاء' : '+ إضافة مخوّل'}
        </button>
      </div>

      {success && <div className="alert alert-success mb-12">{success}</div>}

      {showForm && (
        <form onSubmit={submit} className="mb-16" style={{background:'var(--surface-2)',borderRadius:10,padding:16}}>
          <div className="form-group mb-16">
            <label>اختر مزارعاً من القائمة *</label>
            <select value={selectedFarmer?.id || ''} onChange={e => { const f=farmers.find(x=>x.id===e.target.value); setSelectedFarmer(f||null); if(f) setForm(prev=>({...prev,idNumber:f.idNumber||'',label:f.nameHeb||f.name||''})); }} style={{fontFamily:'Heebo,sans-serif',fontSize:15}}>
              <option value="">— اختر مزارعاً —</option>
              {farmers.map(f=><option key={f.id} value={f.id}>{f.nameHeb||f.name} — {f.idNumber}</option>)}
            </select>
          </div>
          {selectedFarmer && (
            <div style={{background:'#f0fdf4',border:'1.5px solid #bbf7d0',borderRadius:10,padding:'12px 16px',marginBottom:16}}>
              <div style={{display:'flex',gap:16,flexWrap:'wrap',fontSize:13}}>
                <span>👤 <strong style={{fontFamily:'Heebo,sans-serif'}}>{selectedFarmer.nameHeb||selectedFarmer.name}</strong></span>
                <span>🪪 {selectedFarmer.idNumber}</span>
                {selectedFarmer.phone && <span>📱 {selectedFarmer.phone}</span>}
              </div>
            </div>
          )}
          <div className="grid-2">
            <div className="form-group">
              <label>الدور *</label>
              <select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
                <option value="admin">🔐 مدير رئيسي (صلاحيات كاملة)</option>
                <option value="viewer">👁 مراقب (قراءة فقط)</option>
              </select>
            </div>
            <div className="form-group">
              <label>كلمة المرور الخاصة *</label>
              <input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="••••••••"/>
            </div>
          </div>
          {error && <div className="alert alert-error mb-8">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={saving||!selectedFarmer}>{saving?'⏳':'💾 حفظ'}</button>
        </form>
      )}

      <div className="tbl-wrap">
        <table>
          <thead><tr><th>رقم الهوية</th><th>الدور</th><th>الاسم</th><th></th></tr></thead>
          <tbody>
            {users.length===0&&<tr><td colSpan={4} style={{textAlign:'center',color:'var(--text-muted)',padding:20}}>لا يوجد مخولون</td></tr>}
            {users.map(u=>(
              <tr key={u.id}>
                <td><code style={{background:'var(--surface-2)',padding:'2px 8px',borderRadius:4}}>{u.idNumber}</code></td>
                <td><span className="badge badge-blue">{ROLES[u.role]||u.role}</span></td>
                <td style={{fontFamily:'Heebo,sans-serif',fontWeight:600}}>{u.label||'—'}</td>
                <td>
                  <div className="flex-gap gap-4">
                    <button onClick={()=>openEdit(u)} style={{width:28,height:28,borderRadius:7,border:'1.5px solid var(--border)',background:'var(--surface-2)',color:'var(--primary)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:13}} onMouseEnter={e=>{e.currentTarget.style.background='var(--primary)';e.currentTarget.style.color='#fff';}} onMouseLeave={e=>{e.currentTarget.style.background='var(--surface-2)';e.currentTarget.style.color='var(--primary)';}}>✏</button>
                    <button onClick={()=>remove(u.id,u.label||u.idNumber)} style={{width:28,height:28,borderRadius:7,border:'1.5px solid #fca5a5',background:'#fff1f2',color:'#dc2626',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:13}} onMouseEnter={e=>{e.currentTarget.style.background='#dc2626';e.currentTarget.style.color='#fff';}} onMouseLeave={e=>{e.currentTarget.style.background='#fff1f2';e.currentTarget.style.color='#dc2626';}}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editUser && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',borderRadius:16,padding:28,width:'100%',maxWidth:380,boxShadow:'0 8px 40px rgba(0,0,0,0.2)'}}>
            <h3 className="mb-16">🔐 تغيير كلمة مرور</h3>
            <p style={{color:'var(--text-muted)',fontSize:13,marginBottom:16}}>{editUser.label||editUser.idNumber} — <span className="badge badge-blue">{ROLES[editUser.role]}</span></p>
            <div className="form-group">
              <label>كلمة المرور الجديدة *</label>
              <input type="password" value={newPass} onChange={e=>setNewPassPriv(e.target.value)} placeholder="••••••••" autoFocus/>
            </div>
            {error && <div className="alert alert-error mb-8">{error}</div>}
            <div className="flex-gap gap-8">
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>{saving?'⏳':'💾 حفظ'}</button>
              <button className="btn btn-outline" onClick={()=>{setEditUser(null);setError('');}}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPrices;
