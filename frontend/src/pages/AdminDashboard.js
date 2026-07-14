import React, { useState } from 'react';
import { useLang } from '../contexts/LangContext';
import { t } from '../i18n/translations';
import AdminFarmers  from '../components/admin/AdminFarmers';
import AdminReadings from '../components/admin/AdminReadings';
import AdminRegions  from '../components/admin/AdminRegions';
import AdminProjects from '../components/admin/AdminProjects';
import { AdminPrices, AdminGallery, AdminSettings, AdminReports } from '../components/admin/AdminComponents';
import AdminPayments      from '../components/admin/AdminPayments';
import AdminDashboardPage from '../components/admin/AdminDashboardPage';
import LangToggle         from '../components/shared/LangToggle';
import AnnouncementBanner from '../components/shared/AnnouncementBanner';

export default function AdminDashboard({ onLogout, adminRole='admin', allowedProjectIds=[] }) {
  const { lang }        = useLang();
  const ar              = lang === 'ar';
  const [tab, setTab]   = useState('farmers');
  const [sideOpen, setSideOpen] = useState(false);

  const handleLogout = () => { onLogout && onLogout(); onLogout(); };

  // ✅ مراقب له صلاحية خاصة على مشروع واحد على الأقل يستطيع رؤية تبويب المشاريع حتى لو كان viewer عادي
  const hasProjectAccess = adminRole === 'admin' || (allowedProjectIds && allowedProjectIds.length > 0);

  const allTabs = [
    { key:'farmers',   icon:'👨‍🌾', label: t('farmers', lang) },
    { key:'regions',   icon:'📍', label: t('regionsTab', lang) },
    { key:'readings',  icon:'📏', label: t('readingsTab', lang) },
    { key:'prices',    icon:'💰', label: t('pricesTab', lang) },
    { key:'reports',   icon:'📊', label: t('reportsTab', lang) },
    { key:'gallery',   icon:'🖼️', label: t('galleryTab', lang) },
    { key:'payments',  icon:'💸', label: ar?'المدفوعات':'תשלומים' },
    { key:'projects',  icon:'🏗️', label: ar?'المشاريع':'פרויקטים' },
    { key:'dashboard', icon:'📊', label: ar?'لوحة التحكم':'לוח בקרה' },
    ...(adminRole === 'admin' ? [{ key:'settings', icon:'⚙️', label: t('settingsTab', lang) }] : []),
  ];

  // ✅ التبويبات المتاحة للمراقب العادي كما هي؛ تبويب المشاريع دايماً ظاهر (بما إن المراقب
  // العادي أصلاً يشوفه بوضع قراءة فقط، والمراقب المُصرّح له بمشروع يشوفه بصلاحيات كاملة عليه)
  const TABS = adminRole === 'viewer'
    ? allTabs.filter(t => ['reports','payments','projects','dashboard'].includes(t.key))
    : allTabs;

  const current = TABS.find(tb => tb.key === tab);

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'var(--surface)' }}>

      {sideOpen && (
        <div onClick={() => setSideOpen(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:199 }} />
      )}

      {/* ── Sidebar ── */}
      <aside style={{
        width:'var(--sidebar-width)', background:'var(--primary-dark)',
        position:'fixed', top:0, bottom:0, right:0, zIndex:200,
        display:'flex', flexDirection:'column', overflowY:'auto',
      }} className={`admin-sidebar${sideOpen ? ' open' : ''}`}>

        <div style={{ padding:'22px 16px 16px', textAlign:'center', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize:42, marginBottom:6 }}>🌿</div>
          <div style={{ color:'#fff', fontWeight:900, fontSize:18 }}>
            {lang === 'ar' ? 'الشلالة' : 'אלשללאלה'}
          </div>
          <div style={{ color:'rgba(255,255,255,0.45)', fontSize:11, marginTop:2 }}>
            {t('adminPanel', lang)}
          </div>
        </div>

        <nav style={{ flex:1, padding:'10px 8px', display:'flex', flexDirection:'column', gap:3 }}>
          {TABS.map(tb => (
            <button key={tb.key}
              onClick={() => { setTab(tb.key); setSideOpen(false); }}
              style={{
                display:'flex', alignItems:'center', gap:10, padding:'11px 12px',
                borderRadius:10, border:'none', cursor:'pointer', width:'100%',
                fontFamily:'Tajawal, Heebo, sans-serif', fontSize:14, fontWeight:700, textAlign:'right',
                background: tab === tb.key ? 'var(--accent)' : 'transparent',
                color:      tab === tb.key ? 'var(--green-950)' : 'rgba(255,255,255,0.7)',
                transition: 'all 0.2s',
              }}>
              <span style={{ fontSize:18, flexShrink:0 }}>{tb.icon}</span>
              <span>{tb.label}</span>
            </button>
          ))}
        </nav>

        <button onClick={handleLogout} style={{
          margin:'0 8px 14px', padding:'11px', borderRadius:10,
          border:'1px solid rgba(255,255,255,0.15)', background:'transparent',
          color:'rgba(255,255,255,0.55)', cursor:'pointer',
          fontFamily:'Tajawal, Heebo, sans-serif', fontSize:13, fontWeight:700,
          display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          transition:'all 0.2s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.1)'; e.currentTarget.style.color='#fff'; }}
          onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='rgba(255,255,255,0.55)'; }}
        >
          🚪 {t('logout', lang)}
        </button>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex:1, marginRight:'var(--sidebar-width)', display:'flex', flexDirection:'column', minWidth:0 }}>

        <div style={{
          background:'#fff', borderBottom:'1.5px solid var(--border)',
          padding:'0 16px', height:58, display:'flex', alignItems:'center',
          justifyContent:'space-between', position:'sticky', top:0, zIndex:99,
          boxShadow:'var(--shadow-sm)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <button onClick={() => setSideOpen(v => !v)}
              className="mobile-menu-btn"
              style={{ display:'none', background:'transparent', border:'none', fontSize:22, cursor:'pointer', color:'var(--primary)', padding:4 }}>
              ☰
            </button>
            <h2 style={{ color:'var(--primary)', fontSize:'1.05rem' }}>
              {current?.icon} {current?.label}
            </h2>
          </div>
          <LangToggle style={{
            background:'var(--surface-2)', border:'1.5px solid var(--border)',
            color:'var(--primary)',
          }} />
        </div>

        <AnnouncementBanner lang={lang} />

        <div style={{ flex:1, padding:'clamp(16px,3vw,24px)', maxWidth:1200, width:'100%', margin:'0 auto' }} className="page-content">
          {tab === 'farmers'   && <AdminFarmers   adminRole={adminRole} />}
          {tab === 'regions'   && <AdminRegions   adminRole={adminRole} />}
          {tab === 'readings'  && <AdminReadings  adminRole={adminRole} />}
          {tab === 'prices'    && <AdminPrices    adminRole={adminRole} />}
          {tab === 'reports'   && <AdminReports   adminRole={adminRole} />}
          {tab === 'gallery'   && <AdminGallery   adminRole={adminRole} />}
          {tab === 'payments'  && <AdminPayments  adminRole={adminRole} />}
          {tab === 'projects'  && <AdminProjects  adminRole={adminRole} allowedProjectIds={allowedProjectIds} />}
          {tab === 'dashboard' && <AdminDashboardPage adminRole={adminRole} />}
          {tab === 'settings'  && adminRole === 'admin' && <AdminSettings />}
        </div>

        <div style={{ textAlign:'center', padding:'12px', fontSize:12, color:'var(--text-muted)', borderTop:'1px solid var(--border)' }}>
          {lang === 'ar' ? 'الشلالة' : 'אלשללאלה'} © {new Date().getFullYear()}
        </div>
      </main>

      <style>{`
        @media (max-width: 768px) {
          .admin-sidebar { transform: translateX(100%); transition: transform 0.3s; }
          .admin-sidebar.open { transform: translateX(0) !important; }
          main { margin-right: 0 !important; }
          .mobile-menu-btn { display: block !important; }
        }
      `}</style>
    </div>
  );
}