import React, { useState, useEffect, useCallback } from 'react';
import JSZip from 'jszip';
import { adminAPI, paymentsAPI } from '../../api';
import { useLang } from '../../contexts/LangContext';
import { getPrice } from '../../utils/pricing'; // ✅ سعر موحّد شامل الضريبة (מע"מ)
import { cupsPositive } from '../../utils/cups';     // ✅ فرق أكواب موحّد (مجاميع فقط، بدون قيم سالبة)
import { getExtrasNet } from '../../utils/extras';   // ✅ إضافات موحّدة (تدعم extras[] + الحقول القديمة)
import useElementWidth from '../../hooks/useElementWidth'; // ✅ قياس عرض موحّد للرسوم البيانية (يحل مشكلة الرسوم الفارغة)
import { CATEGORIES } from './AdminPayments'; // ✅ نفس تصنيفات المدفوعات (لترجمة الأسماء بدل عرضها بالإنجليزي)
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, PieChart, Pie, Cell,
} from 'recharts';


const COLORS = ['#16a34a','#84cc16','#0ea5e9','#f59e0b','#ef4444','#8b5cf6'];

// ── مكوّنات رسوم بيانية مستقلة: كل واحد يقيس عرض حاويته بنفسه عند ظهوره
//    فعلياً (بدل الاعتماد على قياس Recharts الداخلي غير الموثوق) ──

function CompChartBox({ data, ar }) {
  const [ref, width] = useElementWidth();
  const incomeKey  = ar?'الإيرادات':'הכנסות';
  const paymentsKey= ar?'المدفوعات':'תשלומים';
  const profitKey  = ar?'الربح':'רווח';
  return (
    <div ref={ref} style={{ width:'100%' }}>
      {width > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:20, justifyContent:'center' }}>
          {data.map((y,i) => {
            const income   = y[incomeKey]   || 0;
            const payments = y[paymentsKey] || 0;
            const profit   = y[profitKey]   || 0;
            const slices = [
              { name: paymentsKey, value: Math.max(payments,0), color:'#ef4444' },
              { name: profitKey,   value: Math.max(profit,0),   color:'#0ea5e9' },
            ].filter(s=>s.value>0);
            return (
              <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', minWidth:150 }}>
                <div style={{ position:'relative', width:150, height:150 }}>
                  <PieChart width={150} height={150}>
                    <Pie data={slices.length?slices:[{name:'-',value:1,color:'#e5e7eb'}]}
                      cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                      {(slices.length?slices:[{color:'#e5e7eb'}]).map((s,idx) => <Cell key={idx} fill={s.color}/>)}
                    </Pie>
                    <Tooltip formatter={v=>`₪${v.toLocaleString()}`}/>
                  </PieChart>
                  <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
                    <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:700 }}>{y.year}</div>
                    <div style={{ fontSize:15, fontWeight:900, color:'#16a34a' }}>₪{(income/1000).toFixed(0)}k</div>
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:4, marginTop:10, fontSize:12 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:9, height:9, borderRadius:'50%', background:'#16a34a' }}/>
                    <span style={{ color:'var(--text-muted)' }}>{incomeKey}:</span>
                    <strong>₪{income.toLocaleString()}</strong>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:9, height:9, borderRadius:'50%', background:'#ef4444' }}/>
                    <span style={{ color:'var(--text-muted)' }}>{paymentsKey}:</span>
                    <strong>₪{payments.toLocaleString()}</strong>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:9, height:9, borderRadius:'50%', background:'#0ea5e9' }}/>
                    <span style={{ color:'var(--text-muted)' }}>{profitKey}:</span>
                    <strong style={{color: profit>=0?'inherit':'#dc2626'}}>₪{profit.toLocaleString()}</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CatChartBox({ data }) {
  const [ref, width] = useElementWidth();
  const total = data.reduce((s,d)=>s+d.value,0);
  const sorted = [...data].sort((a,b)=>b.value-a.value);
  return (
    <div ref={ref} style={{ width:'100%' }}>
      {width > 0 && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
          <PieChart width={150} height={150}>
            <Pie data={sorted} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={2}>
              {sorted.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
            </Pie>
            <Tooltip formatter={v=>`₪${v.toLocaleString()}`}/>
          </PieChart>
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:10, fontSize:12, width:'100%', maxWidth:260 }}>
            {sorted.map((d,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:9, height:9, borderRadius:'50%', background:COLORS[i%COLORS.length], flexShrink:0 }}/>
                <span style={{ flex:1, fontWeight:700, color:'var(--text-primary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{d.name}</span>
                <span style={{ fontWeight:800, color:'var(--text-muted)' }}>{total>0?Math.round(d.value/total*100):0}%</span>
                <span style={{ fontWeight:900, color:COLORS[i%COLORS.length], minWidth:60, textAlign:'left' }}>₪{d.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CupsPeriodChartBox({ data, ar }) {
  const [ref, width] = useElementWidth();
  return (
    <div ref={ref} style={{ width:'100%' }}>
      {width > 0 && (
        <BarChart width={width} height={220} data={data} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb"/>
          <XAxis dataKey="period" tick={{fontFamily:'Tajawal,Heebo',fontSize:12}}/>
          <YAxis tick={{fontFamily:'Tajawal,Heebo',fontSize:11}}/>
          <Tooltip formatter={v=>[v.toLocaleString(), ar?'أكواب':'קובים']} contentStyle={{fontFamily:'Tajawal,Heebo'}}/>
          <Bar dataKey={ar?'أكواب':'קובים'} radius={[4,4,0,0]}>
            {data.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
          </Bar>
        </BarChart>
      )}
    </div>
  );
}

function IncomeYearChartBox({ data, ar }) {
  const [ref, width] = useElementWidth();
  return (
    <div ref={ref} style={{ width:'100%' }}>
      {width > 0 && (
        <LineChart width={width} height={220} data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb"/>
          <XAxis dataKey="year" tick={{fontFamily:'Tajawal,Heebo',fontSize:12}}/>
          <YAxis tick={{fontFamily:'Tajawal,Heebo',fontSize:11}} tickFormatter={v=>`₪${(v/1000).toFixed(0)}k`}/>
          <Tooltip formatter={v=>[`₪${v.toLocaleString()}`,ar?'الإيرادات':'הכנסות']} contentStyle={{fontFamily:'Tajawal,Heebo'}}/>
          <Line type="monotone" dataKey="income" stroke="#16a34a" strokeWidth={2.5} dot={{fill:'#16a34a',r:4}}/>
        </LineChart>
      )}
    </div>
  );
}

export default function AdminDashboardPage({ adminRole='admin' }) {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [backupLoading, setBackupLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [report, paymentsRes, prices, regionsRes] = await Promise.allSettled([
        adminAPI.getReport(),
        paymentsAPI.getAll(),
        adminAPI.getPrices(),
        adminAPI.getRegions(),
      ]);
      setData({
        report:   report.status==='fulfilled'   ? report.value   : { readings:[], farmers:[], lands:[] },
        payments: paymentsRes.status==='fulfilled' ? (paymentsRes.value.payments||[]) : [],
        prices:   prices.status==='fulfilled'   ? prices.value   : {},
        regions:  regionsRes.status==='fulfilled' ? (regionsRes.value.regions||[]) : [],
      });
    } catch(e) {
      console.error('Dashboard load error:', e);
      setData({ report:{ readings:[], farmers:[], lands:[] }, payments:[], prices:{}, regions:[] });
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
      const extraNet = getExtrasNet(r);
      byYear[y].income += extraNet;
      vals.slice(1).forEach((v,i) => {
        const cups  = cupsPositive(vals, i);
        const price = getPrice(prices, y, r.landId, i+1);
        byYear[y].cups   += cups;
        byYear[y].income += cups * price;
      });
    });
    return Object.values(byYear).sort((a,b)=>a.year-b.year);
  };

  // ✅ إجمالي الأكواب + تفصيل كل دورة لسنة معينة
  const calcCupsBreakdown = (year) => {
    const byPeriod = {};
    let total = 0, maxPeriods = 0;
    (data?.report?.readings || []).filter(r => r.year === year).forEach(r => {
      const vals = r.readings || [];
      vals.slice(1).forEach((_, i) => {
        const cups = cupsPositive(vals, i);
        if (cups) { byPeriod[i+1] = (byPeriod[i+1] || 0) + cups; total += cups; }
        maxPeriods = Math.max(maxPeriods, i+1);
      });
    });
    return { total, byPeriod, maxPeriods };
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
    const catLabel = key => {
      const c = CATEGORIES.find(x => x.key === key);
      return c ? c[ar?'ar':'he'] : key;
    };
    return Object.entries(bycat).map(([name,value]) => ({ name: catLabel(name), value:Math.round(value) }));
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

  // ✅ سنة "الأكواب" المعروضة: السنة الحالية إن وُجدت بيانات لها، وإلا أحدث سنة متوفرة
  const availableYears = [...new Set((report.readings||[]).map(r=>r.year))];
  const nowYear = new Date().getFullYear();
  const cupsYear = availableYears.includes(nowYear) ? nowYear : (availableYears.length ? Math.max(...availableYears) : nowYear);
  const cupsBreakdown = calcCupsBreakdown(cupsYear);
  const cupsChartData = Array.from({ length: cupsBreakdown.maxPeriods }, (_, idx) => ({
    period: ar ? `دورة ${idx+1}` : `תקופה ${idx+1}`,
    [ar?'أكواب':'קובים']: Math.round(cupsBreakdown.byPeriod[idx+1] || 0),
  }));

  // ✅ أكثر 10 مزارعين استهلاكاً للمياه + تحديد الفترة الأعلى استهلاكاً لكل واحد
  const farmerNameOf = id => {
    const f = (report.farmers||[]).find(x => String(x.id) === String(id));
    return f?.nameHeb || f?.name || '—';
  };
  const topFarmers = (() => {
    const byFarmer = {}; // farmerId -> { total, peak:{cups,year,period} }
    (report.readings||[]).forEach(r => {
      const vals = r.readings || [];
      if (!byFarmer[r.farmerId]) byFarmer[r.farmerId] = { total: 0, peak: null };
      vals.slice(1).forEach((_, i) => {
        const cups = cupsPositive(vals, i);
        if (!cups) return;
        byFarmer[r.farmerId].total += cups;
        if (!byFarmer[r.farmerId].peak || cups > byFarmer[r.farmerId].peak.cups) {
          byFarmer[r.farmerId].peak = { cups, year: r.year, period: i+1 };
        }
      });
    });
    return Object.entries(byFarmer)
      .map(([farmerId, d]) => ({
        farmerId,
        name: farmerNameOf(farmerId),
        total: Math.round(d.total),
        peak: d.peak,
      }))
      .filter(f => f.total > 0)
      .sort((a,b) => b.total - a.total)
      .slice(0, 10);
  })();

  // ✅ أكثر 10 مناطق استهلاكاً للمياه (بنفس منطق استنتاج المنطقة المستخدم بباقي التطبيق)
  const regionOf = land => {
    const regions = data.regions || [];
    if (land?.regionId) {
      const reg = regions.find(r => String(r.id) === String(land.regionId));
      if (reg) return reg;
    }
    const code = land?.stationNumber?.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase();
    if (code) {
      const reg = regions.find(r => r.name?.toUpperCase() === code);
      if (reg) return reg;
    }
    return null;
  };
  const topRegions = (() => {
    const byRegion = {}; // key -> { code, label, total }
    (report.readings||[]).forEach(r => {
      const land = (report.lands||[]).find(l => String(l.id) === String(r.landId));
      const reg  = regionOf(land);
      const code = reg?.name || land?.stationNumber?.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() || '—';
      const key  = reg ? (reg.id || reg.name) : code;
      if (!byRegion[key]) {
        const label = reg ? ((reg.nameHeb && reg.nameHeb !== reg.name) ? reg.nameHeb : (reg.name||'')) : (ar?'غير مصنّف':'לא מסווג');
        byRegion[key] = { code, label, total: 0 };
      }
      const vals = r.readings || [];
      vals.slice(1).forEach((_, i) => {
        const cups = cupsPositive(vals, i);
        if (cups) byRegion[key].total += cups;
      });
    });
    return Object.values(byRegion)
      .map(d => ({ ...d, total: Math.round(d.total) }))
      .filter(d => d.total > 0)
      .sort((a,b) => b.total - a.total)
      .slice(0, 10);
  })();

  return (
    <div className="dashboard-v2">

      <div className="flex-between mb-16" style={{flexWrap:'wrap',gap:12}}>
        <div>
          <h2 className="mb-4">📊 {ar?'لوحة التحكم':'לוח בקרה'}</h2>
          <p style={{color:'var(--text-muted)',fontSize:13}}>
            {ar?'نظرة عامة على الإيرادات والمدفوعات':'סקירת הכנסות ותשלומים'}
          </p>
        </div>
        {adminRole !== 'viewer' && <button
          className="btn btn-primary"
          onClick={downloadBackup}
          disabled={backupLoading}
          style={{display:'flex',alignItems:'center',gap:8}}>
          {backupLoading ? '⏳' : '💾'} {ar?'تنزيل نسخة احتياطية':'הורד גיבוי'}
        </button>}
      </div>

      {/* ── الوضع المالي: 3 مؤشرات رئيسية كبيرة ── */}
      <div className="dv2-section-label">{ar?'الوضع المالي':'מצב כספי'}</div>
      <div className="dv2-kpi-primary">
        <div className="dv2-kpi-lg" style={{background:'var(--green-800)'}}>
          <div>
            <div className="v">₪{Math.round(totalIncome).toLocaleString()}</div>
            <div className="l">{ar?'إجمالي الإيرادات':'סה"כ הכנסות'}</div>
          </div>
          <div className="ico">💰</div>
        </div>
        <div className="dv2-kpi-lg" style={{background: netProfit>=0?'#0ea5e9':'#dc2626'}}>
          <div>
            <div className="v">₪{Math.round(netProfit).toLocaleString()}</div>
            <div className="l">{netProfit>=0?'📈':'📉'} {ar?'صافي الربح':'רווח נקי'}</div>
          </div>
          <div className="ico">{netProfit>=0?'📈':'📉'}</div>
        </div>
        <div className="dv2-kpi-lg" style={{background:'#f59e0b'}}>
          <div>
            <div className="v">₪{Math.round(totalPayments).toLocaleString()}</div>
            <div className="l">{ar?'إجمالي المدفوعات':'סה"כ תשלומים'}</div>
          </div>
          <div className="ico">💸</div>
        </div>
      </div>

      {/* ── النشاط التشغيلي: مؤشرات ثانوية أصغر ── */}
      <div className="dv2-section-label">{ar?'النشاط التشغيلي':'פעילות תפעולית'}</div>
      <div className="dv2-kpi-sec-grid">
        {[
          { label:(ar?'أكواب ':'קובים ')+cupsYear, value:Math.round(cupsBreakdown.total).toLocaleString(), icon:'🥤', bg:'#e0f2fe', color:'#0369a1' },
          { label:ar?'مزارعون':'חקלאים', value:(report.farmers||[]).length, icon:'👨‍🌾', bg:'#f3f4f6', color:'#4b5563' },
          { label:ar?'قراءات':'קריאות', value:(report.readings||[]).length, icon:'📏', bg:'#dcfce7', color:'#15803d' },
          { label:ar?'دفعات':'תשלומים', value:data.payments.length, icon:'🧾', bg:'#fef3c7', color:'#92400e' },
        ].map((s,i) => (
          <div key={i} className="dv2-kpi-sm">
            <div className="ico" style={{background:s.bg, color:s.color}}>{s.icon}</div>
            <div>
              <div className="v">{s.value}</div>
              <div className="l">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── الرسوم البيانية ── */}
      <div className="dv2-section-label">{ar?'التحليلات':'ניתוחים'}</div>
      <div className="charts-grid" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:16,marginBottom:20}}>

        {/* مقارنة الإيرادات والمدفوعات */}
        {compChart.length > 0 && (
          <div className="dv2-panel" style={{'--panel-accent':'#16a34a'}}>
            <div className="dv2-panel-title">📊 {ar?'مقارنة الإيرادات والمدفوعات':'השוואת הכנסות ותשלומים'}</div>
            <CompChartBox data={compChart} ar={ar} />
          </div>
        )}

        {/* توزيع المدفوعات بالتصنيف */}
        {catChart.length > 0 && (
          <div className="dv2-panel" style={{'--panel-accent':'#f59e0b'}}>
            <div className="dv2-panel-title">🥧 {ar?'توزيع المدفوعات':'חלוקת תשלומים'}</div>
            <CatChartBox data={catChart} />
          </div>
        )}

        {/* توزيع الأكواب حسب الدورة */}
        {cupsChartData.length > 0 && (
          <div className="dv2-panel" style={{'--panel-accent':'#0ea5e9'}}>
            <div className="dv2-panel-title">🥤 {(ar?'توزيع الأكواب حسب الدورة — ':'חלוקת קובים לפי תקופה — ')}{cupsYear}</div>
            <CupsPeriodChartBox data={cupsChartData} ar={ar} />
          </div>
        )}

        {/* الإيرادات السنوية */}
        {yearlyIncome.length > 0 && (
          <div className="dv2-panel" style={{'--panel-accent':'#16a34a'}}>
            <div className="dv2-panel-title">📈 {ar?'الإيرادات السنوية':'הכנסות שנתיות'}</div>
            <IncomeYearChartBox data={yearlyIncome.map(y=>({year:String(y.year), income:Math.round(y.income)}))} ar={ar} />
          </div>
        )}
      </div>

      {/* ── أكثر استهلاكاً: مزارعين + مناطق (قائمتين جنب بعض) ── */}
      {(topFarmers.length > 0 || topRegions.length > 0) && (
        <>
          <div className="dv2-section-label">{ar?'الأكثر استهلاكاً للمياه':'הצרכנים המובילים במים'}</div>
          <div className="charts-grid" style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:16, marginBottom:20}}>

            {/* قائمة المزارعين */}
            {topFarmers.length > 0 && (
              <div className="dv2-panel" style={{'--panel-accent':'#f59e0b'}}>
                <div className="dv2-panel-title">👨‍🌾 {ar?'أعلى 10 مزارعين — إجمالي الأكواب':'10 חקלאים מובילים — סה"כ קובים'}</div>
                <div style={{display:'flex', flexDirection:'column', gap:8}}>
                  {topFarmers.map((f, i) => (
                    <div key={f.farmerId} style={{
                      display:'flex', alignItems:'center', gap:12, padding:'10px 12px',
                      borderRadius:10, background: i<3 ? '#eff6ff' : 'var(--surface-2)',
                      border: i<3 ? '1px solid #bfdbfe' : '1px solid var(--border)',
                    }}>
                      <div style={{
                        width:28, height:28, borderRadius:'50%', flexShrink:0,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontWeight:900, fontSize:13,
                        background: i===0?'#fbbf24':i===1?'#cbd5e1':i===2?'#fdba74':'var(--border)',
                        color: i<3 ? '#78350f' : 'var(--text-muted)',
                      }}>{i+1}</div>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontWeight:800, fontSize:13.5, color:'var(--text-primary)', fontFamily:'Heebo,sans-serif', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{f.name}</div>
                        {f.peak && (
                          <div style={{fontSize:11, color:'var(--text-muted)', marginTop:2}}>
                            {ar?'الأعلى: ':'שיא: '}<strong style={{color:'#c2410c'}}>{f.peak.cups.toLocaleString()}</strong> {ar?'كوب':'קוב'} — {f.peak.year} · {ar?'الفترة':'תקופה'} {f.peak.period}
                          </div>
                        )}
                      </div>
                      <div style={{textAlign:'left', flexShrink:0}}>
                        <div style={{fontWeight:900, fontSize:15, color:'#0ea5e9'}}>{f.total.toLocaleString()}</div>
                        <div style={{fontSize:9.5, color:'var(--text-muted)', fontWeight:700}}>{ar?'كوب':'קוב'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* قائمة المناطق */}
            {topRegions.length > 0 && (
              <div className="dv2-panel" style={{'--panel-accent':'#0ea5e9'}}>
                <div className="dv2-panel-title">🗺️ {ar?'أعلى 10 مناطق — إجمالي الأكواب':'10 אזורים מובילים — סה"כ קובים'}</div>
                <div style={{display:'flex', flexDirection:'column', gap:8}}>
                  {topRegions.map((rgn, i) => (
                    <div key={rgn.code+i} style={{
                      display:'flex', alignItems:'center', gap:12, padding:'10px 12px',
                      borderRadius:10, background: i<3 ? '#eff6ff' : 'var(--surface-2)',
                      border: i<3 ? '1px solid #bfdbfe' : '1px solid var(--border)',
                    }}>
                      <div style={{
                        width:28, height:28, borderRadius:'50%', flexShrink:0,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontWeight:900, fontSize:13,
                        background: i===0?'#fbbf24':i===1?'#cbd5e1':i===2?'#fdba74':'var(--border)',
                        color: i<3 ? '#78350f' : 'var(--text-muted)',
                      }}>{i+1}</div>
                      <div style={{flex:1, minWidth:0, display:'flex', alignItems:'center', gap:8}}>
                        <code style={{background:'#f0fdf4', border:'1px solid #bbf7d0', padding:'2px 9px', borderRadius:6, fontWeight:900, fontSize:12.5, flexShrink:0}}>{rgn.code}</code>
                        <div style={{fontWeight:800, fontSize:13.5, color:'var(--text-primary)', fontFamily:'Heebo,sans-serif', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{rgn.label}</div>
                      </div>
                      <div style={{textAlign:'left', flexShrink:0}}>
                        <div style={{fontWeight:900, fontSize:15, color:'#0ea5e9'}}>{rgn.total.toLocaleString()}</div>
                        <div style={{fontSize:9.5, color:'var(--text-muted)', fontWeight:700}}>{ar?'كوب':'קוב'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── النسخة الاحتياطية ── */}
      {adminRole !== 'viewer' && <>
        <div className="dv2-section-label">{ar?'النسخة الاحتياطية':'גיבוי נתונים'}</div>
        <div className="dv2-panel" style={{'--panel-accent':'#6b7280'}}>
        <div className="flex-between mb-12" style={{flexWrap:'wrap',gap:12}}>
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
      </>}
    </div>
  );
}