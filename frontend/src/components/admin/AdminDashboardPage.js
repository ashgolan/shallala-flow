import React, { useState, useEffect, useCallback } from 'react';
import JSZip from 'jszip';
import { adminAPI, paymentsAPI } from '../../api';
import { useLang } from '../../contexts/LangContext';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts';

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
  if (!readings[idx] || !readings[idx-1]) return 0;
  return parseFloat(readings[idx]) - parseFloat(readings[idx-1]);
};

const COLORS = ['#16a34a','#84cc16','#0ea5e9','#f59e0b','#ef4444','#8b5cf6'];

export default function AdminDashboardPage() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [backupLoading, setBackupLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [report, paymentsRes, prices] = await Promise.allSettled([
        adminAPI.getReport(),
        paymentsAPI.getAll(),
        adminAPI.getPrices(),
      ]);
      setData({
        report:   report.status==='fulfilled'   ? report.value   : { readings:[], farmers:[], lands:[] },
        payments: paymentsRes.status==='fulfilled' ? (paymentsRes.value.payments||[]) : [],
        prices:   prices.status==='fulfilled'   ? prices.value   : {},
      });
    } catch(e) {
      console.error('Dashboard load error:', e);
      setData({ report:{ readings:[], farmers:[], lands:[] }, payments:[], prices:{} });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── حساب الإيرادات السنوية ──
  const calcYearlyIncome = () => {
    if (!data) return [];
    if (!data?.report) return [];
    const { report, prices } = data;
    const byYear = {};
    (report.readings||[]).forEach(r => {
      const y = r.year;
      if (!byYear[y]) byYear[y] = { year:y, income:0, cups:0 };
      const vals = r.readings||[];
      // أضف extra مرة واحدة فقط لكل قراءة (ليس لكل فترة)
      const extraNet = (parseFloat(r.extra)||0) - (parseFloat(r.extraPaid)||0);
      byYear[y].income += extraNet;
      vals.slice(1).forEach((v,i) => {
        const cups  = cupsDiff(vals, i+1);
        const price = getPrice(prices, y, r.landId, i+1);
        byYear[y].cups   += cups;
        byYear[y].income += cups * price;
      });
    });
    return Object.values(byYear).sort((a,b)=>a.year-b.year);
  };

  const calcYearlyPayments = () => {
    if (!data?.payments) return {};
    const byYear = {};
    data.payments.forEach(p => {
      const y = p.date?.slice(0,4);
      if (!byYear[y]) byYear[y] = 0;
      byYear[y] += parseFloat(p.amount)||0;
    });
    return byYear;
  };

  const buildComparisonChart = () => {
    const income   = calcYearlyIncome();
    const payments = calcYearlyPayments();
    return income.map(y => ({
      year: String(y.year),
      [ar?'الإيرادات':'הכנסות']: Math.round(y.income),
      [ar?'المدفوعات':'תשלומים']: Math.round(payments[y.year]||0),
      [ar?'الربح':'רווח']: Math.round(y.income - (payments[y.year]||0)),
    }));
  };

  const buildPaymentsByCategory = () => {
    if (!data?.payments) return [];
    const bycat = {};
    data.payments.forEach(p => {
      const cat = p.category||'general';
      bycat[cat] = (bycat[cat]||0) + (parseFloat(p.amount)||0);
    });
    return Object.entries(bycat).map(([name,value]) => ({ name, value:Math.round(value) }));
  };

  // ── النسخة الاحتياطية ──
  const downloadBackup = async () => {
    setBackupLoading(true);
    try {
      // جلب كل البيانات
      const results = await Promise.allSettled([
        adminAPI.getFarmers(),
        adminAPI.getLands(),
        adminAPI.getReadings(),
        paymentsAPI.getAll(),
        adminAPI.getPrices(),
        adminAPI.getRegions ? adminAPI.getRegions() : Promise.resolve({ regions:[] }),
      ]);

      const [farmersRes, landsRes, readingsRes, paymentsRes, pricesRes, regionsRes] = results;

      const date = new Date().toISOString().slice(0,10);

      // البيانات لكل موديل
      const models = {
        farmers:  farmersRes.status==='fulfilled'  ? (farmersRes.value.farmers||[])   : [],
        lands:    landsRes.status==='fulfilled'     ? (landsRes.value.lands||[])       : [],
        readings: readingsRes.status==='fulfilled'  ? (readingsRes.value.readings||[]) : [],
        payments: paymentsRes.status==='fulfilled'  ? (paymentsRes.value.payments||[]) : [],
        prices:   pricesRes.status==='fulfilled'    ? [pricesRes.value]                : [],
        regions:  regionsRes.status==='fulfilled'   ? (regionsRes.value.regions||[])   : [],
      };

      // إنشاء ملف ZIP
      const zip = new JSZip();
      const folder = zip.folder(`alshallala-backup-${date}`);

      // ملف لكل موديل
      Object.entries(models).forEach(([name, data]) => {
        folder.file(`${name}.json`, JSON.stringify(data, null, 2));
      });

      // ملف ملخص
      folder.file('_info.json', JSON.stringify({
        exportDate: new Date().toISOString(),
        version: '1.0',
        appName: 'الشلالة - نظام إدارة المياه الزراعية',
        stats: Object.fromEntries(
          Object.entries(models).map(([k,v]) => [`${k}Count`, Array.isArray(v)?v.length:1])
        ),
      }, null, 2));

      // تنزيل الـ ZIP
      const content = await zip.generateAsync({ type:'blob', compression:'DEFLATE' });
      const url = URL.createObjectURL(content);
      const a   = document.createElement('a');
      a.href    = url;
      a.download = `alshallala-backup-${date}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch(e) {
      console.error('Backup error:', e);
      alert((ar?'خطأ في التنزيل: ':'שגיאה בהורדה: ') + e.message);
    } finally {
      setBackupLoading(false);
    }
  };

  if (loading || !data) return <div style={{textAlign:'center',padding:60}}><div className="spinner"/></div>;

  const compChart    = buildComparisonChart();
  const catChart     = buildPaymentsByCategory();
  const yearlyIncome = calcYearlyIncome();
  const totalIncome  = yearlyIncome.reduce((s,y)=>s+y.income,0);
  const totalPayments= data.payments.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
  const netProfit    = totalIncome - totalPayments;
  const { report }   = data;

  return (
    <div>
      <div className="flex-between mb-20">
        <div>
          <h2 className="mb-4">📊 {ar?'لوحة التحكم':'לוח בקרה'}</h2>
          <p style={{color:'var(--text-muted)',fontSize:13}}>
            {ar?'نظرة عامة على الإيرادات والمدفوعات':'סקירת הכנסות ותשלומים'}
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={downloadBackup}
          disabled={backupLoading}
          style={{display:'flex',alignItems:'center',gap:8}}>
          {backupLoading ? '⏳' : '💾'} {ar?'تنزيل نسخة احتياطية':'הורד גיבוי'}
        </button>
      </div>

      {/* ── بطاقات الملخص ── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:24}}>
        {[
          { label:ar?'إجمالي الإيرادات':'סה"כ הכנסות', value:`₪${Math.round(totalIncome).toLocaleString()}`, icon:'💰', accent:true },
          { label:ar?'إجمالي المدفوعات':'סה"כ תשלומים', value:`₪${Math.round(totalPayments).toLocaleString()}`, icon:'💸' },
          { label:ar?'صافي الربح':'רווח נקי',  value:`₪${Math.round(netProfit).toLocaleString()}`, icon: netProfit>=0?'📈':'📉', accent: netProfit<0 },
          { label:ar?'عدد المزارعين':'חקלאים', value:(report.farmers||[]).length, icon:'👨‍🌾' },
          { label:ar?'عدد القراءات':'קריאות',  value:(report.readings||[]).length, icon:'📏' },
          { label:ar?'عدد الدفعات':'תשלומים',  value:data.payments.length, icon:'🧾' },
        ].map((s,i) => (
          <div key={i} className={`stat-card ${s.accent?'accent':''}`} style={{padding:'14px 16px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontWeight:900,fontSize:'clamp(1rem,3vw,1.4rem)',lineHeight:1.1,color:s.accent?'#fff':'var(--primary)'}}>{s.value}</div>
                <div style={{fontSize:11,marginTop:4,opacity:0.75,color:s.accent?'#fff':'var(--text-muted)'}}>{s.label}</div>
              </div>
              <div style={{fontSize:24,flexShrink:0}}>{s.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── الرسوم البيانية ── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(400px,1fr))',gap:16,marginBottom:20}}>

        {/* مقارنة الإيرادات والمدفوعات */}
        {compChart.length > 0 && (
          <div className="card">
            <h3 className="mb-16">📊 {ar?'مقارنة الإيرادات والمدفوعات':'השוואת הכנסות ותשלומים'}</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={compChart} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb"/>
                <XAxis dataKey="year" tick={{fontFamily:'Tajawal,Heebo',fontSize:12}}/>
                <YAxis tick={{fontFamily:'Tajawal,Heebo',fontSize:11}} tickFormatter={v=>`₪${(v/1000).toFixed(0)}k`}/>
                <Tooltip formatter={(v,n)=>[`₪${v.toLocaleString()}`,n]} contentStyle={{fontFamily:'Tajawal,Heebo'}}/>
                <Legend/>
                <Bar dataKey={ar?'الإيرادات':'הכנסות'} fill="#16a34a" radius={[4,4,0,0]}/>
                <Bar dataKey={ar?'المدفوعات':'תשלומים'} fill="#ef4444" radius={[4,4,0,0]}/>
                <Bar dataKey={ar?'الربح':'רווח'} fill="#0ea5e9" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* توزيع المدفوعات بالتصنيف */}
        {catChart.length > 0 && (
          <div className="card">
            <h3 className="mb-16">🥧 {ar?'توزيع المدفوعات':'חלוקת תשלומים'}</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={catChart} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                  label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}>
                  {catChart.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                </Pie>
                <Tooltip formatter={v=>`₪${v.toLocaleString()}`}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* الإيرادات السنوية */}
        {yearlyIncome.length > 0 && (
          <div className="card">
            <h3 className="mb-16">📈 {ar?'الإيرادات السنوية':'הכנסות שנתיות'}</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={yearlyIncome.map(y=>({year:String(y.year), income:Math.round(y.income)}))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb"/>
                <XAxis dataKey="year" tick={{fontFamily:'Tajawal,Heebo',fontSize:12}}/>
                <YAxis tick={{fontFamily:'Tajawal,Heebo',fontSize:11}} tickFormatter={v=>`₪${(v/1000).toFixed(0)}k`}/>
                <Tooltip formatter={v=>[`₪${v.toLocaleString()}`,ar?'الإيرادات':'הכנסות']} contentStyle={{fontFamily:'Tajawal,Heebo'}}/>
                <Line type="monotone" dataKey="income" stroke="#16a34a" strokeWidth={2.5} dot={{fill:'#16a34a',r:4}}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── النسخة الاحتياطية ── */}
      <div className="card">
        <div className="flex-between mb-12">
          <div>
            <h3 className="mb-4">💾 {ar?'النسخة الاحتياطية':'גיבוי נתונים'}</h3>
            <p style={{color:'var(--text-muted)',fontSize:13}}>
              {ar?'تنزيل نسخة كاملة من جميع البيانات بصيغة JSON':'הורדת עותק מלא של כל הנתונים בפורמט JSON'}
            </p>
          </div>
          <button className="btn btn-primary" onClick={downloadBackup} disabled={backupLoading}
            style={{display:'flex',alignItems:'center',gap:8,minWidth:160}}>
            {backupLoading ? '⏳ ' + (ar?'جاري التحضير...':'מכין...') : '⬇️ ' + (ar?'تنزيل الآن':'הורד עכשיו')}
          </button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:8}}>
          {[
            { label:ar?'مزارعون':'חקלאים',    count:(report.farmers||[]).length,  icon:'👨‍🌾' },
            { label:ar?'أراضٍ':'קרקעות',      count:(report.lands||[]).length,    icon:'🌾' },
            { label:ar?'قراءات':'קריאות',     count:(report.readings||[]).length, icon:'📏' },
            { label:ar?'دفعات':'תשלומים',      count:data.payments.length,        icon:'💸' },
          ].map((s,i) => (
            <div key={i} style={{background:'var(--surface-2)',borderRadius:10,padding:'10px 14px',textAlign:'center'}}>
              <div style={{fontSize:20,marginBottom:4}}>{s.icon}</div>
              <div style={{fontWeight:900,fontSize:18,color:'var(--primary)'}}>{s.count}</div>
              <div style={{fontSize:11,color:'var(--text-muted)'}}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
