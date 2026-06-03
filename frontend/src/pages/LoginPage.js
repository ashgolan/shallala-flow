import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLang } from '../contexts/LangContext';
import { t } from '../i18n/translations';
import { publicAPI } from '../api';
import LangToggle from '../components/shared/LangToggle';

export default function LoginPage({ onFarmer, onAdmin }) {
  const { loginFarmer, loginAdmin } = useAuth();
  const { lang } = useLang();
  const [mode, setMode]       = useState('farmer');
  const [idNumber, setId]     = useState('');
  const [code, setCode]       = useState('');
  const [adminPass, setPass]  = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [pub, setPub]         = useState({ gallery:[], video:{ url:'' } });
  const [slide, setSlide]     = useState(0);

  // جلب الإعدادات العامة بدون الإعلان
  useEffect(() => { publicAPI.getSettings().then(setPub).catch(() => {}); }, []);

  useEffect(() => {
    if (pub.gallery.length < 2) return;
    const timer = setInterval(() => setSlide(s => (s + 1) % pub.gallery.length), 4000);
    return () => clearInterval(timer);
  }, [pub.gallery.length]);

  const handleFarmer = async e => {
    e.preventDefault();
    if (!idNumber || !code) { setError(t('fillAllFields', lang)); return; }
    setError(''); setLoading(true);
    try { await loginFarmer(idNumber, code); onFarmer(); }
    catch(err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleAdmin = async e => {
    e.preventDefault();
    if (!adminPass) { setError(t('fillAllFields', lang)); return; }
    setError(''); setLoading(true);
    try { await loginAdmin(adminPass); onAdmin(); }
    catch(err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const ytId = url => url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
  const { gallery, video } = pub;

  return (
    <div style={{ minHeight:'100vh', display:'flex', background:'linear-gradient(135deg, #052e16 0%, #166534 40%, #15803d 100%)' }}>

      {/* ── اليسار: Branding + Media ── */}
      <div style={{ flex:1, padding:'clamp(24px,5vw,56px)', display:'flex', flexDirection:'column', gap:28, overflowY:'auto', maxHeight:'100vh' }} className="login-left">
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:64, marginBottom:12, filter:'drop-shadow(0 4px 16px rgba(0,0,0,0.4))' }}>🌿</div>
          <h1 style={{ color:'#fff', fontSize:'clamp(1.8rem,4vw,2.8rem)', marginBottom:6 }}>
            {lang === 'ar' ? 'الشلالة' : 'השלאלה'}
          </h1>
          <p style={{ color:'rgba(255,255,255,0.75)', fontSize:15 }}>{t('appSubtitle', lang)}</p>
        </div>

        {/* Gallery */}
        {gallery.length > 0 && (
          <div className="slider-wrap" style={{ height:220, flexShrink:0, position:'relative' }}>
            <img src={gallery[slide]?.url} alt="" className="slider-img" style={{ height:220 }} />
            {gallery[slide]?.caption && <div className="slider-caption">{gallery[slide].caption}</div>}
            {gallery.length > 1 && (
              <div style={{ position:'absolute', bottom:10, left:'50%', transform:'translateX(-50%)', display:'flex', gap:6, zIndex:2 }}>
                {gallery.map((_,i) => (
                  <button key={i} className={`slider-dot ${i===slide?'active':''}`} onClick={() => setSlide(i)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Video */}
        {video?.url && ytId(video.url) && (
          <div style={{ background:'rgba(255,255,255,0.08)', borderRadius:16, padding:14, flexShrink:0 }}>
            {video.title && <p style={{ color:'rgba(255,255,255,0.8)', fontSize:13, marginBottom:10, fontWeight:700 }}>{video.title}</p>}
            <div style={{ position:'relative', paddingBottom:'56.25%', borderRadius:10, overflow:'hidden' }}>
              <iframe src={`https://www.youtube.com/embed/${ytId(video.url)}`}
                style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}
                frameBorder="0" allowFullScreen title="video" />
            </div>
          </div>
        )}
      </div>

      {/* ── اليمين: نموذج الدخول ── */}
      <div style={{
        width:'clamp(320px,42vw,460px)', background:'#fff',
        display:'flex', flexDirection:'column',
        padding:'clamp(24px,5vw,48px)', gap:24,
        overflowY:'auto', maxHeight:'100vh',
        justifyContent:'center',
      }}>

        {/* زر اللغة */}
        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <LangToggle style={{ background:'var(--surface-2)', border:'1.5px solid var(--border)', color:'var(--primary)' }} />
        </div>

        {/* الشعار */}
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:52, marginBottom:8 }}>🌿</div>
          <h2 style={{ color:'var(--primary)', fontSize:'1.6rem', marginBottom:4 }}>
            {lang === 'ar' ? 'الشلالة' : 'השלאלה'}
          </h2>
          <p style={{ color:'var(--text-muted)', fontSize:14 }}>{t('appSubtitle', lang)}</p>
        </div>

        {/* تبويبات */}
        <div className="tabs-bar">
          <button className={`tab-btn ${mode==='farmer'?'active':''}`}
            onClick={() => { setMode('farmer'); setError(''); }}>
            🌾 {t('farmerLogin', lang)}
          </button>
          <button className={`tab-btn ${mode==='admin'?'active':''}`}
            onClick={() => { setMode('admin'); setError(''); }}>
            ⚙️ {t('adminLogin', lang)}
          </button>
        </div>

        {/* نموذج المزارع */}
        {mode === 'farmer' ? (
          <form onSubmit={handleFarmer} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label>{t('idNumber', lang)}</label>
              <input type="text" placeholder={t('enterIdNumber', lang)}
                value={idNumber} onChange={e => setId(e.target.value)} autoComplete="off" />
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label>{t('personalCode', lang)} (4 {lang==='ar'?'أرقام':'ספרות'})</label>
              <input type="password" placeholder="••••" inputMode="numeric" maxLength={4}
                value={code} onChange={e => setCode(e.target.value.replace(/\D/g,'').slice(0,4))} />
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading}>
              {loading ? <span className="spinner spinner-sm" /> : t('loginBtn', lang)}
            </button>
          </form>
        ) : (
          <form onSubmit={handleAdmin} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label>{t('adminPassword', lang)}</label>
              <input type="password" placeholder={t('enterPassword', lang)}
                value={adminPass} onChange={e => setPass(e.target.value)} />
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading}>
              {loading ? <span className="spinner spinner-sm" /> : t('adminLoginBtn', lang)}
            </button>
          </form>
        )}

        <p style={{ textAlign:'center', fontSize:12, color:'var(--text-muted)' }}>
          {lang === 'ar' ? 'الشلالة' : 'השלאלה'} © {new Date().getFullYear()}
        </p>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .login-left { display: none !important; }
          div[style*="width: clamp(320px"] { width: 100% !important; min-height: 100vh; justify-content: flex-start !important; padding-top: 40px !important; }
        }
      `}</style>
    </div>
  );
}
