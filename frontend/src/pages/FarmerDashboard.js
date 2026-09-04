import React, { useState, useEffect, useCallback } from 'react';
import { useLang } from '../contexts/LangContext';
import { t } from '../i18n/translations';
import { farmerAPI, publicAPI } from '../api';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import FarmerNotes from '../components/farmer/FarmerNotes';
import { LangToggleLight } from '../components/shared/LangToggle';
import AnnouncementBanner from '../components/shared/AnnouncementBanner';
import { getPrice } from '../utils/pricing'; // ✅ سعر موحّد شامل الضريبة (מע"מ)
import { cupsDiff, cupsPositive } from '../utils/cups'; // ✅ فرق أكواب موحّد
// ✅ الإضافات صارت تابعة للأرض نفسها (LandExtra) وليست القراءة/السنة — لذلك نقرأها
// مباشرة من data.landExtras بدل استخراجها من كل قراءة على حدة
import useElementWidth from '../hooks/useElementWidth'; // ✅ قياس عرض موحّد للرسوم البيانية

// ── رسم بياني الأكواب السنوي (مكوّن مستقل — يقيس نفسه عند ظهوره فعلياً) ──
function CupsYearChart({ data, lang, t }) {
  const [ref, width] = useElementWidth();
  return (
    <div ref={ref} style={{ width:'100%' }}>
      {width > 0 && (
        <BarChart width={width} height={180} data={data} barSize={28}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6"/>
          <XAxis dataKey="year" tick={{ fontFamily:'Tajawal,Heebo', fontSize:11, fill:'#9ca3af' }}/>
          <YAxis tick={{ fontFamily:'Tajawal,Heebo', fontSize:11, fill:'#9ca3af' }}/>
          <Tooltip formatter={v=>[v.toLocaleString()+' '+t('cups',lang),'']} contentStyle={{ fontFamily:'Tajawal,Heebo', borderRadius:10, border:'1px solid #e5e7eb' }}/>
          <Bar dataKey="cups" radius={[6,6,0,0]}>
            {data.map((_,i)=><Cell key={i} fill={i===data.length-1?'#ea580c':'#fed7aa'}/>)}
          </Bar>
        </BarChart>
      )}
    </div>
  );
}

// ── رسم بياني المبلغ السنوي (مكوّن مستقل) ──
function AmountYearChart({ data, lang, t }) {
  const [ref, width] = useElementWidth();
  return (
    <div ref={ref} style={{ width:'100%' }}>
      {width > 0 && (
        <LineChart width={width} height={180} data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6"/>
          <XAxis dataKey="year" tick={{ fontFamily:'Tajawal,Heebo', fontSize:11, fill:'#9ca3af' }}/>
          <YAxis tick={{ fontFamily:'Tajawal,Heebo', fontSize:11, fill:'#9ca3af' }} tickFormatter={v=>`₪${(v/1000).toFixed(0)}k`}/>
          <Tooltip formatter={v=>[`₪${Math.round(v).toLocaleString()}`,t('amount',lang)]} contentStyle={{ fontFamily:'Tajawal,Heebo', borderRadius:10, border:'1px solid #e5e7eb' }}/>
          <Line type="monotone" dataKey="amount" stroke="#7c3aed" strokeWidth={2.5} dot={{ fill:'#7c3aed', r:4, strokeWidth:0 }}/>
        </LineChart>
      )}
    </div>
  );
}

// ── رسم بياني أكواب أرض واحدة (مكوّن مستقل لأنه يُستخدم داخل map) ──
function LandCupsChart({ data, color, lang, t }) {
  const [ref, width] = useElementWidth();
  return (
    <div ref={ref} style={{ width:'100%' }}>
      {width > 0 && (
        <BarChart width={width} height={120} data={data} barSize={20}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6"/>
          <XAxis dataKey="year" tick={{ fontFamily:'Tajawal,Heebo', fontSize:10, fill:'#9ca3af' }}/>
          <YAxis tick={{ fontFamily:'Tajawal,Heebo', fontSize:10, fill:'#9ca3af' }}/>
          <Tooltip formatter={v=>[v.toLocaleString()+' '+t('cups',lang),'']} contentStyle={{ fontFamily:'Tajawal,Heebo', borderRadius:10, border:'1px solid #e5e7eb' }}/>
          <Bar dataKey="cups" fill={color} radius={[5,5,0,0]}/>
        </BarChart>
      )}
    </div>
  );
}

// ── ألوان الرسوم البيانية ──
const CHART_COLORS = ['#ea580c','#7c3aed','#0891b2','#15803d','#db2777','#d97706'];

const calcConsumption = (reading, prices) => {
  if (!reading?.readings || reading.readings.length < 2) return [];
  return reading.readings.slice(1).map((curr, i) => {
    const prev = reading.readings[i];
    const cups         = cupsDiff(reading.readings, i) || 0; // خام (للعرض فقط، قد تكون سالبة كتنبيه)
    const cupsForTotal  = cupsPositive(reading.readings, i);  // للمجاميع/الإجماليات فقط
    const price = getPrice(prices, reading.year, reading.landId, i + 1);
    return { idx: i + 1, cups, cupsForTotal, price, amount: cupsForTotal * price, from: prev, to: curr };
  });
};

// ✅ إعدادات شارة كل حالة دفع (لون/أيقونة/نص) — مصدر واحد يُستخدم بكل الشارات
const payStatusConfig = (status, ar) => ({
  full:    { bg:'#f0fdf4', color:'#15803d', border:'#bbf7d0', icon:'✅', label: ar?'مدفوع بالكامل':'שולם במלואו' },
  partial: { bg:'#fffbeb', color:'#b45309', border:'#fde68a', icon:'⚠️', label: ar?'دفع جزئي':'שולם חלקית' },
  unpaid:  { bg:'#fff1f2', color:'#dc2626', border:'#fecaca', icon:'❌', label: ar?'غير مدفوع':'לא שולם' },
}[status]);

// ✅ حالة الدفع الإجمالية لقراءة واحدة، بنفس منطق لوحة الإدارة:
// full = كل الفترات النشطة (اللي بدأت بقراءة أولى) مدفوعة، partial = دفع جزئي، unpaid = ولا شي مدفوع
const getPayStatus = (r) => {
  const vals = r?.readings || [];
  const periodsCount = Math.max(0, vals.length - 1);
  const active = [];
  for (let i = 0; i < periodsCount; i++) {
    if (vals[i] != null && vals[i] !== '') active.push(i);
  }
  if (active.length === 0) return 'unpaid';
  const pp = r?.paidPeriods || [];
  const paidCount = active.filter(i => pp[i]).length;
  if (paidCount === active.length) return 'full';
  if (paidCount === 0) return 'unpaid';
  return 'partial';
};

// ✅ حالة الدفع الإجمالية عبر كل قراءات المزارع مجتمعة (لبطاقة "إجمالي المبلغ" بنظرة عامة)
const getOverallPayStatus = (readingsArr) => {
  let totalActive = 0, totalPaid = 0;
  (readingsArr || []).forEach(r => {
    const vals = r.readings || [];
    const periodsCount = Math.max(0, vals.length - 1);
    const pp = r.paidPeriods || [];
    for (let i = 0; i < periodsCount; i++) {
      if (vals[i] != null && vals[i] !== '') {
        totalActive++;
        if (pp[i]) totalPaid++;
      }
    }
  });
  if (totalActive === 0) return 'unpaid';
  if (totalPaid === totalActive) return 'full';
  if (totalPaid === 0) return 'unpaid';
  return 'partial';
};

// ✅ شارة صغيرة لحالة الدفع (تُستخدم جنب اسم الأرض، ببطاقة KPI، وبأعلى بطاقة السنة)
const StatusBadge = ({ status, ar }) => {
  const cfg = payStatusConfig(status, ar);
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.border}`, borderRadius:8, padding:'3px 9px', fontSize:11, fontWeight:800 }}>
      {cfg.icon} {cfg.label}
    </span>
  );
};

// شارة مرتبطة مباشرة بقراءة واحدة (اختصار لـ StatusBadge)
const PayStatusBadge = ({ r, ar }) => <StatusBadge status={getPayStatus(r)} ar={ar}/>;

// ✅ شارة حالة المشروع (نشط/منتهي/ملغى) — تُستخدم ببطاقة "مشاريعي"
const projectStatusConfig = (status, ar) => ({
  active:    { bg:'#eff6ff', color:'#1d4ed8', label: ar?'نشط':'פעיל' },
  done:      { bg:'#f0fdf4', color:'#15803d', label: ar?'منتهي':'הסתיים' },
  cancelled: { bg:'#fff1f2', color:'#dc2626', label: ar?'ملغى':'בוטל' },
}[status] || { bg:'#f3f4f6', color:'#6b7280', label: status });

// ── أيقونة KPI ملونة ──
const KpiIcon = ({ icon, bg, border }) => (
  <div style={{
    width: 38, height: 38, borderRadius: 11,
    background: bg, border: `1.5px solid ${border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 18, flexShrink: 0,
  }}>{icon}</div>
);

// ── بطاقة KPI ──
const KpiCard = ({ icon, bg, border, value, label, footer, footerVal, trend, trendUp, delay, extra }) => (
  <div style={{
    background: '#fff', borderRadius: 16, border: '1.5px solid #e5e7eb',
    padding: '14px 14px 12px', display: 'flex', flexDirection: 'column', gap: 10,
    animation: `fdUp 0.45s ${delay}s ease both`, transition: 'all 0.2s', cursor: 'default',
  }}
    onMouseEnter={e => { e.currentTarget.style.borderColor='#fb923c'; e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 4px 16px rgba(234,88,12,0.12)'; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor='#e5e7eb'; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none'; }}
  >
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
      <KpiIcon icon={icon} bg={bg} border={border}/>
      {trend && (
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
          background: trendUp ? '#f0fdf4' : '#f9fafb',
          color: trendUp ? '#15803d' : '#6b7280',
        }}>{trend}</span>
      )}
    </div>
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#111827', lineHeight: 1 }}>{value}</div>
        {/* ✅ شارة حالة الدفع الإضافية (تظهر فقط إذا مُررت) */}
        {extra}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', marginTop: 5 }}>{label}</div>
    </div>
    <div style={{ height: 1, background: '#f3f4f6' }}/>
    <div style={{ fontSize: 9, color: '#9ca3af', fontWeight: 600 }}>
      {footer} <span style={{ color: '#ea580c', fontWeight: 800 }}>{footerVal}</span>
    </div>
  </div>
);

// ── بطاقة مشروع مرتبط بالمزارع (تظهر أعلى الصفحة الافتتاحية إن وُجد) ──
const ProjectCard = ({ p, ar, delay }) => {
  const isCustom  = p.customMembers;
  // بمشاريع customMembers: الهدف عام لكامل المشروع، ومساهمة المزارع فردية بدون مبلغ مطلوب محدد له
  const required  = isCustom ? p.totalRequired : p.myRequired;
  const paid       = p.myPaid;
  const remaining  = isCustom ? p.totalRemaining : p.myRemaining;
  const pct = required > 0 ? Math.min(100, Math.round((paid / required) * 100)) : 0;
  const statusCfg = projectStatusConfig(p.status, ar);

  return (
    <div className="fd-card" style={{
      background:'#fff', borderRadius:16, border:'1.5px solid #e5e7eb',
      borderInlineStart:'4px solid #7c3aed', padding:16, animationDelay:`${delay}s`,
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, flexWrap:'wrap', marginBottom:12 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <span style={{ fontSize:16 }}>🏗️</span>
            <div style={{ fontSize:15, fontWeight:900, color:'#111827' }}>{p.name}</div>
            <span style={{ background:statusCfg.bg, color:statusCfg.color, borderRadius:8, padding:'2px 9px', fontSize:10, fontWeight:800 }}>{statusCfg.label}</span>
          </div>
          {p.description && <div style={{ fontSize:12, color:'#6b7280', marginTop:5 }}>{p.description}</div>}
          {p.stationNumber && <div style={{ fontSize:11, color:'#9ca3af', marginTop:4, fontWeight:700 }}>📍 {p.stationNumber}</div>}
        </div>
        {p.date && (
          <div style={{ fontSize:10, color:'#9ca3af', fontWeight:600, whiteSpace:'nowrap' }}>
            {new Date(p.date).toLocaleDateString(ar?'ar-EG-u-nu-latn':'he-IL')}
          </div>
        )}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))', gap:10, marginBottom: required > 0 ? 10 : 0 }}>
        <div style={{ background:'#f5f3ff', borderRadius:10, padding:'8px 12px', textAlign:'center' }}>
          <div style={{ fontSize:10, color:'#7c3aed', fontWeight:700 }}>{isCustom ? (ar?'هدف المشروع':'יעד הפרויקט') : (ar?'المبلغ المطلوب':'סכום נדרש')}</div>
          <div style={{ fontSize:16, fontWeight:900, color:'#111827' }}>{required != null ? `₪${Math.round(required).toLocaleString()}` : '—'}</div>
        </div>
        <div style={{ background:'#f0fdf4', borderRadius:10, padding:'8px 12px', textAlign:'center' }}>
          <div style={{ fontSize:10, color:'#15803d', fontWeight:700 }}>{isCustom ? (ar?'مساهمتك':'התרומה שלך') : (ar?'المدفوع':'שולם')}</div>
          <div style={{ fontSize:16, fontWeight:900, color:'#111827' }}>₪{Math.round(paid).toLocaleString()}</div>
        </div>
        {remaining != null && (
          <div style={{ background: remaining>0?'#fff1f2':'#f0fdf4', borderRadius:10, padding:'8px 12px', textAlign:'center' }}>
            <div style={{ fontSize:10, color: remaining>0?'#dc2626':'#15803d', fontWeight:700 }}>{isCustom ? (ar?'المتبقي إجمالاً':'יתרה כוללת') : (ar?'المتبقي':'יתרה')}</div>
            <div style={{ fontSize:16, fontWeight:900, color:'#111827' }}>₪{Math.round(Math.max(remaining,0)).toLocaleString()}</div>
          </div>
        )}
      </div>

      {required > 0 && (
        <div style={{ height:6, background:'#f3f4f6', borderRadius:3, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${pct}%`, background:'linear-gradient(90deg,#7c3aed,#a78bfa)', borderRadius:3 }}/>
        </div>
      )}
    </div>
  );
};

// ── شريط مستحقات مختصر (أكواب / مشاريع / إضافات) — يظهر فقط إذا في شيء غير مدفوع ──
// ✅ مقصود يكون خفيف وهادئ: صف واحد رفيع بشارات صغيرة، يختفي تلقائياً إذا كل شيء مدفوع
const DuesSummary = ({ cups, projects, extras, extrasList, ar }) => {
  const [showExtras, setShowExtras] = useState(false);
  const hasExtrasDetail = extras > 0.01 && extrasList && extrasList.length > 0;

  const items = [
    { key:'cups',     icon:'💧', label: ar?'الأكواب':'קוב',        value: cups,     color:'#0891b2', bg:'#ecfeff', border:'#a5f3fc' },
    { key:'projects', icon:'🏗️', label: ar?'المشاريع':'פרויקטים', value: projects, color:'#7c3aed', bg:'#f5f3ff', border:'#ddd6fe' },
    { key:'extras',   icon:'➕', label: ar?'إضافات':'תוספות',      value: extras,   color:'#d97706', bg:'#fffbeb', border:'#fde68a' },
  ].filter(it => it.value > 0.01);

  if (items.length === 0) return null;
  const total = items.reduce((s, it) => s + it.value, 0);

  return (
    <div className="fd-card" style={{
      background:'#fff', borderRadius:14, border:'1.5px solid #fecaca',
      padding:'10px 16px', marginBottom:18, display:'flex', flexDirection:'column', gap:0,
      animationDelay:'0.02s',
    }}>
      <div style={{ display:'flex', alignItems:'center', flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, fontWeight:800, color:'#dc2626', whiteSpace:'nowrap' }}>
          <span style={{ fontSize:14 }}>🔔</span>
          {ar?'مستحقات غير مدفوعة':'חובות פתוחים'}
        </div>
        <div style={{ display:'flex', gap:7, flexWrap:'wrap', flex:1 }}>
          {items.map(it => {
            const clickable = it.key === 'extras' && hasExtrasDetail;
            return (
              <span key={it.key}
                onClick={clickable ? () => setShowExtras(s => !s) : undefined}
                style={{
                  display:'inline-flex', alignItems:'center', gap:5,
                  background:it.bg, color:it.color, border:`1px solid ${it.border}`,
                  borderRadius:9, padding:'3px 10px', fontSize:11, fontWeight:800,
                  cursor: clickable ? 'pointer' : 'default',
                }}>
                {it.icon} {it.label}: ₪{Math.round(it.value).toLocaleString()}
                {clickable && <span style={{ fontSize:9 }}>{showExtras ? '▲' : '▼'}</span>}
              </span>
            );
          })}
        </div>
        <div style={{ fontSize:12, fontWeight:900, color:'#dc2626', whiteSpace:'nowrap' }}>
          {ar?'الإجمالي':'סה"כ'} ₪{Math.round(total).toLocaleString()}
        </div>
      </div>

      {/* ✅ تفاصيل الإضافات — سبب كل إضافة غير مدفوعة، تظهر فقط عند الضغط على الشارة */}
      {showExtras && hasExtrasDetail && (
        <div style={{ marginTop:10, paddingTop:10, borderTop:'1px dashed #fde68a', display:'flex', flexDirection:'column', gap:6 }}>
          {extrasList.map((e, i) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, fontSize:11.5, color:'#78350f' }}>
              <span>📌 {e.note || (ar?'إضافة بدون سبب مذكور':'תוספת ללא סיבה מצוינת')}{e.landLabel ? ` — ${e.landLabel}` : ''}{e.year ? ` (${e.year})` : ''}</span>
              <strong style={{ color:'#d97706', whiteSpace:'nowrap' }}>₪{Math.round(e.remaining).toLocaleString()}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function FarmerDashboard({ farmer: farmerProp, onLogout }) {
  const stored = localStorage.getItem('shl_farmer');
  const farmer = farmerProp || (() => {
    try { return stored && stored !== 'undefined' ? JSON.parse(stored) : null; }
    catch { return null; }
  })();

  const { lang } = useLang();
  const ar = lang === 'ar';
  const [tab, setTab]     = useState('overview');
  const [data, setData]   = useState({ lands: [], readings: [], prices: {}, projects: [], landExtras: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selYear, setSelYear] = useState(null);
  const [pub, setPub]     = useState({ gallery: [], video: { url: '' } });
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try { setLoading(true); setError(''); const d = await farmerAPI.getMyData(); setData(d); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { publicAPI.getSettings().then(d => setPub(d || {})).catch(() => {}); }, []);

  const handleLogout = () => { onLogout && onLogout(); onLogout(); };

  if (loading) return (
    <div className="loading-screen">
      <span className="emoji">🌿</span>
      <div className="spinner"/>
      <p style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{t('loading', lang)}</p>
    </div>
  );

  const { lands, readings, prices, projects: myProjects = [], landExtras = [] } = data;

  const byYear = {};
  readings.forEach(r => {
    if (!byYear[r.year]) byYear[r.year] = { year: r.year, cups: 0, amount: 0 };
    calcConsumption(r, prices).forEach(c => {
      byYear[r.year].cups   += c.cupsForTotal;
      byYear[r.year].amount += c.amount;
    });
  });
  const yearlyData = Object.values(byYear).sort((a, b) => a.year - b.year);
  const years      = Object.keys(byYear).map(Number).sort((a, b) => b - a);
  const totalCups   = yearlyData.reduce((s, y) => s + y.cups,   0);
  const totalAmount = yearlyData.reduce((s, y) => s + y.amount, 0);
  const maxCups     = Math.max(...yearlyData.map(y => y.cups), 1);

  // ✅ حالة الدفع الإجمالية عبر كل القراءات — لبطاقة "إجمالي المبلغ"
  const overallPayStatus = getOverallPayStatus(readings);

  // ✅ مبلغ الأكواب غير المدفوع — مجموع فترات القراءات غير المدفوعة فقط (paidPeriods)
  const cupsUnpaid = readings.reduce((total, r) => {
    const pp = r.paidPeriods || [];
    return total + calcConsumption(r, prices).reduce((s, c) => s + (pp[c.idx - 1] ? 0 : c.amount), 0);
  }, 0);

  // ✅ مبلغ المشاريع غير المدفوع — فقط المشاريع ذات المبلغ الفردي (وليست أهداف مشتركة)
  const projectsUnpaid = myProjects.reduce((s, p) =>
    s + (p.customMembers ? 0 : Math.max(p.myRemaining || 0, 0)), 0);

  // ✅ اسم المنطقة (تلقائياً من صفحة المناطق) مع رقم المحطة بين قوسين
  // ملاحظة: نفس قاعدة صفحة التقارير بالإدارة — nameHeb هو الاسم الحقيقي المُدخَل
  // غالباً، فنفضّله دائماً بغض النظر عن لغة الواجهة (name غالباً رمز مطابقة فقط)
  const landLabel = land => {
    if (!land) return '';
    const regionLabel = (land.regionNameHeb && land.regionNameHeb !== land.regionName)
      ? land.regionNameHeb
      : (land.regionName || '');
    if (regionLabel) return `${regionLabel} (${land.stationNumber || ''})`.replace(' ()', '');
    return land.name || land.stationNumber || '';
  };
  const landName     = id => landLabel(lands.find(l => l.id === id));
  const filteredLands = lands.filter(l =>
    !search || l.name.includes(search) || (l.nameHeb || '').includes(search)
  );

  // ✅ قائمة تفصيلية بكل إضافة غير مدفوعة (السبب/الأرض/المبلغ المتبقي) — تُستخدم بشريط المستحقات
  // الإضافات صارت تابعة للأرض نفسها (landExtras) وليست لقراءة/سنة معينة، فكل إضافة
  // تظهر مرة واحدة بغض النظر عن عدد سنوات القراءات المسجّلة لتلك الأرض — بدون أي تكرار.
  const extrasUnpaidList = landExtras
    .map(e => {
      const remaining = (parseFloat(e.amount) || 0) - (parseFloat(e.paid) || 0);
      if (remaining <= 0.01) return null;
      return {
        note:      (e.note || '').trim(),
        remaining,
        year:      e.createdAt ? new Date(e.createdAt).getFullYear() : null, // ✅ سنة إضافتها (تقريبية) — للعرض فقط
        landLabel: landName(e.landId),
      };
    })
    .filter(Boolean);
  const extrasUnpaid = extrasUnpaidList.reduce((s, e) => s + e.remaining, 0);

  // بيانات توزيع الأراضي للـ Pie chart
  const landPie = lands.map((l, i) => {
    const lR   = readings.filter(r => r.landId === l.id);
    const cups = lR.reduce((s, r) => s + calcConsumption(r, prices).reduce((ss, c) => ss + c.cupsForTotal, 0), 0);
    return { name: landLabel(l), value: Math.round(cups), color: CHART_COLORS[i % CHART_COLORS.length] };
  }).filter(d => d.value > 0);

  const tabs = [
    { key: 'overview', label: t('overview', lang),  icon: '📊' },
    { key: 'years',    label: t('years', lang),      icon: '📅' },
    { key: 'lands',    label: t('lands', lang),      icon: '🌾' },
    { key: 'notes',    label: t('farmNotes', lang),  icon: '📝' },
    { key: 'gallery',  label: t('gallery', lang),       icon: '🖼️' },
  ];

  // أحدث سنة للـ trend
  const latestYear = years[0];
  const prevYear   = years[1];
  const latestCups  = latestYear ? byYear[latestYear]?.cups   || 0 : 0;
  const prevCups    = prevYear   ? byYear[prevYear]?.cups     || 0 : 0;
  const cupsTrend   = prevCups > 0 ? Math.round(((latestCups - prevCups) / prevCups) * 100) : null;

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4fb', direction: 'rtl', fontFamily: lang === 'he' ? "'Heebo','Tajawal',sans-serif" : "'Tajawal','Heebo',sans-serif" }}>

      <style>{`
        @keyframes fdUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fdIn { from{opacity:0} to{opacity:1} }
        .fd-card { animation: fdUp 0.4s ease both; min-width: 0; }
        .charts-grid { min-width: 0; }
        .charts-grid > * { min-width: 0; }
        .charts-grid .recharts-responsive-container { min-width: 0; width: 100% !important; }
        @media(max-width:768px){ .fd-desktop-tabs{ display:none!important; } .fd-mobile-nav{ display:flex!important; } .fd-page-content{ padding-bottom:80px!important; } }
        @media(min-width:769px){ .fd-mobile-nav{ display:none!important; } }
        .fd-year-card:hover{ border-color:#ea580c!important; transform:translateX(${ar?'-3px':'3px'}); }
        .fd-land-card:hover{ border-color:#ea580c!important; box-shadow:0 4px 16px rgba(234,88,12,0.1); }
        .fd-nav-btn:hover{ background:#fff7ed; }
        .fd-tab-btn{ transition:all 0.2s; }
        .fd-tab-btn:hover{ color:#ea580c; }
      `}</style>

      {/* ══ TOPBAR ══ */}
      <nav style={{
        background: '#fff', borderBottom: '1.5px solid #e5e7eb',
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
      }}>
        <div style={{ maxWidth: 1300, margin: '0 auto', padding: '0 16px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>

          <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
            <div style={{ width:38, height:38, background:'linear-gradient(135deg,#ea580c,#fb923c)', borderRadius:11, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>🌿</div>
            <div>
              <div style={{ fontSize:15, fontWeight:900, color:'#111827', lineHeight:1.1 }}>{ar?'الشلالة':'אלשללאלה'}</div>
              <div style={{ fontSize:10, color:'#9ca3af', fontWeight:600, marginTop:1 }}>{ar?'نظام إدارة المياه':'מערכת ניהול מים'}</div>
            </div>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <LangToggleLight style={{ background:'#f9fafb', border:'1.5px solid #e5e7eb', color:'#374151', borderRadius:10, padding:'5px 12px', fontSize:10, fontWeight:700 }}/>
            <button onClick={handleLogout} style={{ background:'#fff1f2', border:'1.5px solid #fecaca', color:'#dc2626', borderRadius:10, padding:'5px 12px', fontSize:10, fontFamily:'inherit', fontWeight:700, cursor:'pointer' }}>
              {t('logout', lang)}
            </button>
          </div>
        </div>
      </nav>

      {/* ── إشعار المزارع ── */}
      {farmer?.notes && (
        <div style={{ background:'#fffbeb', borderBottom:'2px solid #fcd34d', padding:'10px 16px', display:'flex', gap:8, alignItems:'center', fontSize:13, fontWeight:600, color:'#78350f' }}>
          <span>📌</span><span>{farmer.notes}</span>
        </div>
      )}

      <AnnouncementBanner lang={lang}/>

      {/* ── Desktop tabs ── */}
      <div className="fd-desktop-tabs" style={{ background:'#fff', borderBottom:'1.5px solid #e5e7eb', padding:'0 16px', position:'sticky', top:60, zIndex:99, boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ maxWidth:1300, margin:'0 auto', display:'flex', gap:2, padding:'8px 0', overflowX:'auto' }}>
          {tabs.map(tb => (
            <button key={tb.key} className="fd-tab-btn"
              onClick={() => setTab(tb.key)}
              style={{
                padding:'8px 18px', borderRadius:10, border:'none', cursor:'pointer',
                fontFamily:'inherit', fontSize:13, fontWeight:700,
                background: tab===tb.key ? '#fff7ed' : 'transparent',
                color:      tab===tb.key ? '#ea580c' : '#6b7280',
                borderBottom: tab===tb.key ? '2px solid #ea580c' : '2px solid transparent',
              }}>
              {tb.icon} {tb.label}
            </button>
          ))}
        </div>
      </div>

      {/* ══ CONTENT ══ */}
      <div className="fd-page-content" style={{ maxWidth:1300, margin:'0 auto', padding:'clamp(14px,3vw,24px)', width:'100%', overflowX:'hidden' }}>
        {error && <div className="alert alert-error mb-16">{error}</div>}

        {/* ══ OVERVIEW ══ */}
        {tab === 'overview' && (
          <div style={{ animation:'fdIn 0.4s ease both' }}>

            {/* تحية */}
            <div style={{ marginBottom:18, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
              <div>
                <div style={{ fontSize:11, color:'#9ca3af', fontWeight:600, marginBottom:2 }}>
                  {ar?'مرحباً 👋':'שלום 👋'}
                </div>
                <div style={{ fontSize:'clamp(18px,4vw,24px)', fontWeight:900, color:'#111827' }}>{farmer?.name || farmer?.nameAr}</div>
              </div>
              <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, padding:'5px 14px', fontSize:10, color:'#9ca3af', fontWeight:600 }}>
                📅 {new Date().toLocaleDateString(ar?'ar-SA':'he-IL', { month:'long', year:'numeric' })}
              </div>
            </div>

            {/* ✅ شريط مستحقات مختصر (أكواب/مشاريع/إضافات) — يختفي تلقائياً إذا كل شيء مدفوع */}
            <DuesSummary cups={cupsUnpaid} projects={projectsUnpaid} extras={extrasUnpaid} extrasList={extrasUnpaidList} ar={ar}/>

            {/* ✅ المشاريع المرتبطة بالمزارع (إن وُجدت) — تظهر المبلغ المطلوب/المدفوع/المتبقي وتفاصيل المشروع */}
            {myProjects.length > 0 && (
              <div style={{ marginBottom:20, display:'flex', flexDirection:'column', gap:12 }}>
                {myProjects.map((p, i) => (
                  <ProjectCard key={p.id} p={p} ar={ar} delay={0.05 + i * 0.05}/>
                ))}
              </div>
            )}

            {/* KPI Grid */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:10, marginBottom:20 }}>
              <KpiCard
                icon="🌾" bg="#fff7ed" border="#fed7aa"
                value={lands.length} label={t('numLands', lang)}
                footer={ar?'إجمالي دونم':'סה"כ דונמים'} footerVal={lands.reduce((s,l)=>s+(parseFloat(l.area)||0),0)||'—'}
                trend={ar?'ثابت':'קבוע'} trendUp={false} delay={0.05}
              />
              <KpiCard
                icon="📅" bg="#f5f3ff" border="#ddd6fe"
                value={years.length} label={t('dataYears', lang)}
                footer={ar?'منذ عام':'מאז שנת'} footerVal={years.length?Math.min(...years):'—'}
                trend={ar?'↑ نشط':'↑ פעיל'} trendUp={true} delay={0.1}
              />
              <KpiCard
                icon="💧" bg="#eff6ff" border="#bfdbfe"
                value={totalCups.toLocaleString()} label={t('totalCups', lang)}
                footer={ar?'هذا العام':'השנה'} footerVal={latestCups.toLocaleString()}
                trend={cupsTrend!==null ? `${cupsTrend>0?'↑':'↓'} ${Math.abs(cupsTrend)}%` : null}
                trendUp={cupsTrend>0} delay={0.15}
              />
              <KpiCard
                icon="💰" bg="#f0fdf4" border="#bbf7d0"
                value={`₪${Math.round(totalAmount).toLocaleString()}`} label={t('totalAmount', lang)}
                footer={ar?'هذا العام':'השנה'} footerVal={`₪${Math.round(byYear[latestYear]?.amount||0).toLocaleString()}`}
                trend={ar?'↑ نشط':'↑ פעיל'} trendUp={true} delay={0.2}
                extra={<StatusBadge status={overallPayStatus} ar={ar}/>}
              />
            </div>

            {/* Charts */}
            {yearlyData.length > 0 ? (
              <div className="charts-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:14 }}>

                {/* رسم بياني الأكواب */}
                <div className="fd-card" style={{ background:'#fff', borderRadius:16, border:'1.5px solid #e5e7eb', padding:16, animationDelay:'0.25s' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                    <div style={{ fontSize:13, fontWeight:900, color:'#111827' }}>📈 {t('consumptionChart', lang)}</div>
                    <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6, background:'#fff7ed', color:'#c2410c', border:'1px solid #fed7aa' }}>{ar?'كوب':'קוב'}</span>
                  </div>
                  <CupsYearChart data={yearlyData} lang={lang} t={t} />
                </div>

                {/* رسم بياني المبلغ */}
                <div className="fd-card" style={{ background:'#fff', borderRadius:16, border:'1.5px solid #e5e7eb', padding:16, animationDelay:'0.3s' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                    <div style={{ fontSize:13, fontWeight:900, color:'#111827' }}>💰 {t('amountChart', lang)}</div>
                    <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6, background:'#f5f3ff', color:'#6d28d9', border:'1px solid #ddd6fe' }}>₪</span>
                  </div>
                  <AmountYearChart data={yearlyData} lang={lang} t={t} />
                </div>

                {/* توزيع الأراضي Pie */}
                {landPie.length > 0 && (
                  <div className="fd-card" style={{ background:'#fff', borderRadius:16, border:'1.5px solid #e5e7eb', padding:16, animationDelay:'0.35s' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                      <div style={{ fontSize:13, fontWeight:900, color:'#111827' }}>🥧 {t('landDistribution', lang)}</div>
                      <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6, background:'#f0fdf4', color:'#15803d', border:'1px solid #bbf7d0' }}>{ar?'كوب':'קוב'}</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                      <ResponsiveContainer width={110} height={110}>
                        <PieChart>
                          <Pie data={landPie} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="value" paddingAngle={3}>
                            {landPie.map((d,i)=><Cell key={i} fill={d.color}/>)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ display:'flex', flexDirection:'column', gap:7, flex:1 }}>
                        {landPie.map((d,i)=>(
                          <div key={i} style={{ display:'flex', alignItems:'center', gap:7, fontSize:11, fontWeight:700, color:'#374151' }}>
                            <div style={{ width:9, height:9, borderRadius:'50%', background:d.color, flexShrink:0 }}/>
                            <span style={{ flex:1 }}>{d.name}</span>
                            <span style={{ color:d.color, fontWeight:900 }}>{Math.round(totalCups>0?(d.value/totalCups)*100:0)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ملخص الأراضي */}
                <div className="fd-card" style={{ background:'#fff', borderRadius:16, border:'1.5px solid #e5e7eb', padding:16, animationDelay:'0.4s' }}>
                  <div style={{ fontSize:13, fontWeight:900, color:'#111827', marginBottom:14 }}>📋 {t('landSummary', lang)}</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {lands.map((l,i) => {
                      const lR   = readings.filter(r => r.landId === l.id);
                      const cups = lR.reduce((s,r)=>s+calcConsumption(r,prices).reduce((ss,c)=>ss+c.cupsForTotal,0),0);
                      const amt  = lR.reduce((s,r)=>s+calcConsumption(r,prices).reduce((ss,c)=>ss+c.amount,0),0);
                      const pct  = totalCups>0 ? Math.round((cups/totalCups)*100) : 0;
                      const color= CHART_COLORS[i%CHART_COLORS.length];
                      return (
                        <div key={l.id}>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, fontWeight:700, marginBottom:5 }}>
                            <span style={{ color:'#374151' }}>{landLabel(l)}</span>
                            <span style={{ color }}>{pct}% — ₪{Math.round(amt).toLocaleString()}</span>
                          </div>
                          <div style={{ height:6, background:'#f3f4f6', borderRadius:3, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg,${color},${color}aa)`, borderRadius:3 }}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            ) : (
              <div className="card empty-state"><span className="icon">📊</span><p>{t('noReadings', lang)}</p></div>
            )}
          </div>
        )}

        {/* ══ YEARS ══ */}
        {tab === 'years' && (
          <div style={{ animation:'fdIn 0.4s ease both', display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ fontSize:11, color:'#9ca3af', fontWeight:700, marginBottom:4 }}>{t('dataYears', lang)}</div>
            {years.length === 0 && <div className="card empty-state"><span className="icon">📅</span><p>{t('noYearData', lang)}</p></div>}
            {years.map((year, yi) => {
              const yR    = readings.filter(r => r.year === year);
              const cups  = yR.reduce((s,r)=>s+calcConsumption(r,prices).reduce((ss,c)=>ss+c.cupsForTotal,0),0);
              const amount= yR.reduce((s,r)=>s+calcConsumption(r,prices).reduce((ss,c)=>ss+c.amount,0),0);
              const open  = selYear === year;
              const pct   = Math.round((cups/maxCups)*100);
              return (
                <div key={year} style={{ animation:`fdUp 0.4s ${yi*0.05}s ease both` }}>
                  <div className="fd-year-card"
                    onClick={() => setSelYear(open ? null : year)}
                    style={{ background:'#fff', borderRadius:14, border:'1.5px solid #e5e7eb', padding:'14px 16px', cursor:'pointer', transition:'all 0.2s', marginBottom: open?0:0 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div style={{ background:'linear-gradient(135deg,#ea580c,#fb923c)', color:'#fff', borderRadius:20, padding:'4px 14px', fontSize:13, fontWeight:900 }}>{year}</div>
                      <div style={{ display:'flex', gap:8 }}>
                        <span style={{ background:'#f0fdf4', color:'#15803d', padding:'4px 10px', borderRadius:8, fontSize:11, fontWeight:800 }}>💧 {cups.toLocaleString()}</span>
                        <span style={{ background:'#fff7ed', color:'#c2410c', padding:'4px 10px', borderRadius:8, fontSize:11, fontWeight:800 }}>₪{Math.round(amount).toLocaleString()}</span>
                      </div>
                      <span style={{ color:'#9ca3af', fontSize:14, transition:'transform 0.3s', display:'inline-block', transform: open?'rotate(180deg)':'rotate(0)' }}>▼</span>
                    </div>
                    <div style={{ marginTop:10, height:5, background:'#f3f4f6', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${pct}%`, background:'linear-gradient(90deg,#ea580c,#fb923c)', borderRadius:3 }}/>
                    </div>
                  </div>

                  {open && (
                    <div className="fd-card" style={{ background:'#fff', borderRadius:14, border:'1.5px solid #fed7aa', borderTop:'3px solid #ea580c', padding:14, marginTop:6 }}>
                      {yR.map(r => {
                        const cons = calcConsumption(r, prices);
                        return (
                          <div key={r.id} style={{ marginBottom:18, paddingBottom:18, borderBottom:'1px solid #f3f4f6' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, flexWrap:'wrap' }}>
                              <div style={{ fontWeight:800, color:'#ea580c', fontSize:14 }}>🌾 {landName(r.landId)}</div>
                              {/* ✅ شارة حالة الدفع الإجمالية لهذه القراءة */}
                              <PayStatusBadge r={r} ar={ar}/>
                            </div>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
                              {r.readings.map((v,i) => (
                                <div key={i} style={{ background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:8, padding:'4px 10px', textAlign:'center', minWidth:60 }}>
                                  <div style={{ fontSize:10, color:'#9ca3af', fontWeight:700 }}>{t('readingNum',lang)} {i+1}</div>
                                  <div style={{ fontSize:16, fontWeight:900, color:'#111827' }}>{v}</div>
                                </div>
                              ))}
                            </div>
                            {cons.length > 0 && (
                              <div className="tbl-wrap">
                                <table>
                                  <thead><tr>
                                    <th>{t('period',lang)}</th>
                                    <th>{t('from',lang)}</th>
                                    <th>{t('to',lang)}</th>
                                    <th>{t('cups',lang)}</th>
                                    <th>{t('pricePerCup',lang)}</th>
                                    <th>{t('amount',lang)}</th>
                                    {/* ✅ عمود حالة الدفع لكل فترة على حدة */}
                                    <th>{ar?'الدفع':'תשלום'}</th>
                                  </tr></thead>
                                  <tbody>
                                    {cons.map(c => {
                                      // ✅ فهرس الفترة بمصفوفة paidPeriods = c.idx - 1
                                      const periodPaid = !!(r.paidPeriods && r.paidPeriods[c.idx - 1]);
                                      return (
                                        <tr key={c.idx}>
                                          <td style={{ fontWeight:700 }}>{t('period',lang)} {c.idx}</td>
                                          <td>{c.from}</td>
                                          <td>{c.to}</td>
                                          <td><strong style={{ color:'#ea580c' }}>{Math.round(c.cups).toLocaleString()}</strong></td>
                                          <td>₪{c.price.toFixed(2)}</td>
                                          <td><strong>₪{Math.round(c.amount).toLocaleString()}</strong></td>
                                          <td>
                                            <span style={{
                                              display:'inline-flex', alignItems:'center', gap:4,
                                              background: periodPaid ? '#f0fdf4' : '#fff1f2',
                                              color: periodPaid ? '#15803d' : '#dc2626',
                                              border: `1px solid ${periodPaid ? '#bbf7d0' : '#fecaca'}`,
                                              borderRadius:7, padding:'3px 9px', fontSize:11, fontWeight:800,
                                            }}>
                                              {periodPaid ? `✅ ${ar?'مدفوع':'שולם'}` : `❌ ${ar?'غير مدفوع':'לא שולם'}`}
                                            </span>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
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

        {/* ══ LANDS ══ */}
        {tab === 'lands' && (
          <div style={{ animation:'fdIn 0.4s ease both' }}>
            <div style={{ marginBottom:14 }}>
              <input
                value={search} onChange={e=>setSearch(e.target.value)}
                placeholder={t('searchLand', lang)}
                style={{ width:'100%', padding:'10px 14px', borderRadius:12, border:'1.5px solid #e5e7eb', fontFamily:'inherit', fontSize:13, background:'#fff', outline:'none' }}
              />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {filteredLands.map((land, li) => {
                const lR       = readings.filter(r => r.landId === land.id);
                const chartData= Object.entries(
                  lR.reduce((acc,r)=>{ acc[r.year]=(acc[r.year]||0)+calcConsumption(r,prices).reduce((s,c)=>s+c.cupsForTotal,0); return acc; },{})
                ).map(([year,cups])=>({ year:String(year), cups:Math.round(cups) })).sort((a,b)=>a.year-b.year);
                const totalC   = chartData.reduce((s,d)=>s+d.cups,0);
                const totalA   = lR.reduce((s,r)=>s+calcConsumption(r,prices).reduce((ss,c)=>ss+c.amount,0),0);
                const color    = CHART_COLORS[li%CHART_COLORS.length];
                return (
                  <div key={land.id} className="fd-land-card fd-card"
                    style={{ background:'#fff', borderRadius:16, border:'1.5px solid #e5e7eb', padding:16, transition:'all 0.2s', animationDelay:`${li*0.06}s` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, flexWrap:'wrap', gap:10 }}>
                      <div>
                        <div style={{ fontSize:15, fontWeight:900, color:'#111827' }}>{landLabel(land)}</div>
                        {land.area && <div style={{ fontSize:10, color:'#9ca3af', fontWeight:700, marginTop:2 }}>{land.area} {t('dunam',lang)}</div>}
                      </div>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        <span style={{ background:'#f0fdf4', color:'#15803d', padding:'4px 10px', borderRadius:8, fontSize:12, fontWeight:800 }}>💧 {totalC.toLocaleString()}</span>
                        <span style={{ background:'#fff7ed', color:color, padding:'4px 10px', borderRadius:8, fontSize:12, fontWeight:800 }}>₪{Math.round(totalA).toLocaleString()}</span>
                      </div>
                    </div>
                    {chartData.length > 0 ? (
                      <LandCupsChart data={chartData} color={color} lang={lang} t={t} />
                    ) : (
                      <p style={{ color:'#9ca3af', textAlign:'center', padding:16, fontSize:12 }}>{t('noReadings',lang)}</p>
                    )}
                  </div>
                );
              })}
              {filteredLands.length===0 && <div className="card empty-state"><span className="icon">🌾</span><p>{t('noLands',lang)}</p></div>}
            </div>
          </div>
        )}

        {/* ══ NOTES ══ */}
        {tab === 'notes' && <FarmerNotes farmer={farmer} lands={lands} lang={lang}/>}

        {/* ══ GALLERY ══ */}
        {tab === 'gallery' && (
          <div style={{ animation:'fdIn 0.4s ease both', maxWidth:900, margin:'0 auto' }}>
            {pub.video?.url && (() => {
              const ytId = pub.video.url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
              return ytId ? (
                <div style={{ background:'#fff', borderRadius:16, border:'1.5px solid #e5e7eb', padding:16, marginBottom:16, maxWidth:560, margin:'0 auto 16px' }}>
                  {pub.video.title && (
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                      <span style={{ fontSize:18 }}>🎬</span>
                      <div style={{ fontSize:14, fontWeight:900, color:'#111827' }}>{lang==='he' && pub.video?.titleHe ? pub.video.titleHe : pub.video.title}</div>
                    </div>
                  )}
                  <div style={{ position:'relative', paddingBottom:'56.25%', borderRadius:10, overflow:'hidden', background:'#000' }}>
                    <iframe src={`https://www.youtube.com/embed/${ytId}`}
                      style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}
                      frameBorder="0" allowFullScreen title="video"/>
                  </div>
                </div>
              ) : null;
            })()}
            {pub.gallery?.length > 0 ? (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12 }}>
                {pub.gallery.map((img,i) => (
                  <div key={i}
                    style={{ borderRadius:12, overflow:'hidden', background:'#fff', border:'1.5px solid #e5e7eb', cursor:'pointer', transition:'all 0.2s' }}
                    onClick={() => window.open(img.url,'_blank')}
                    onMouseEnter={e=>{ e.currentTarget.style.transform='scale(1.02)'; e.currentTarget.style.borderColor='#fb923c'; }}
                    onMouseLeave={e=>{ e.currentTarget.style.transform='scale(1)'; e.currentTarget.style.borderColor='#e5e7eb'; }}>
                    <img src={img.url} alt={img.caption||''} style={{ width:'100%', height:130, objectFit:'cover', display:'block' }}/>
                    {img.caption && (
                      <div style={{ padding:'6px 10px', fontSize:11, color:'#9ca3af', fontWeight:600 }}>{img.caption}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="card empty-state"><span className="icon">🖼️</span><p>{t('noGallery', lang)}</p></div>
            )}
          </div>
        )}
      </div>

      {/* ══ MOBILE BOTTOM NAV ══ */}
      <nav className="fd-mobile-nav" style={{
        display:'none', position:'fixed', bottom:0, left:0, right:0,
        background:'#fff', borderTop:'1.5px solid #e5e7eb', zIndex:200,
        boxShadow:'0 -4px 16px rgba(0,0,0,0.07)', padding:'8px 6px 12px',
      }}>
        {tabs.map(tb => (
          <button key={tb.key} className="fd-nav-btn"
            onClick={() => setTab(tb.key)}
            style={{
              flex:1, padding:'5px 2px', border:'none', background:'transparent',
              cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:3,
              borderRadius:10, transition:'background 0.2s', fontFamily:'inherit',
            }}>
            <div style={{
              width:28, height:28, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15,
              background: tab===tb.key ? 'linear-gradient(135deg,#ea580c,#fb923c)' : 'transparent',
            }}>{tb.icon}</div>
            <span style={{ fontSize:9, fontWeight:700, color: tab===tb.key?'#ea580c':'#9ca3af' }}>{tb.label}</span>
            <div style={{ height:3, width:18, borderRadius:2, background: tab===tb.key?'#ea580c':'transparent' }}/>
          </button>
        ))}
      </nav>

    </div>
  );
}