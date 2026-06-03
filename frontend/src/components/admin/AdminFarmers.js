import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { adminAPI } from '../../api';
import { useLang } from '../../contexts/LangContext';
import { t } from '../../i18n/translations';

// حساب السعر
const getPrice = (prices, year, landId, idx) => {
  if (!prices) return 0;
  const lp = prices.landPrices?.[String(landId)];
  if (lp?.[`reading_\${idx}`]) return parseFloat(lp[`reading_\${idx}`]) || 0;
  if (lp?.default) return parseFloat(lp.default) || 0;
  const yp = prices.yearPrices?.[String(year)];
  if (yp?.[`reading_\${idx}`]) return parseFloat(yp[`reading_\${idx}`]) || 0;
  if (yp?.default) return parseFloat(yp.default) || 0;
  return parseFloat(prices?.globalPrice) || 0;
};

export default function AdminFarmers() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const [farmers, setFarmers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit]         = useState(null);
  const [form, setForm]         = useState({ name:'', idNumber:'', phone:'', notes:'' });
  const [newCode, setNewCode]   = useState(null);
  const [error, setError]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [readings, setReadings] = useState([]);
  const [prices, setPrices]     = useState({});
  const [revealCode, setRevealCode] = useState(null); // id المزارع الذي يُعرض كوده

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, rd, pr] = await Promise.all([
        adminAPI.getFarmers(),
        adminAPI.getReadings(),
        adminAPI.getPrices(),
      ]);
      setFarmers(d.farmers || []);
      setReadings(rd.readings || []);
      setPrices(pr || {});
    }
    catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEdit(null);
    setForm({ name:'', idNumber:'', phone:'', notes:'' });
    setNewCode(null); setError(''); setShowForm(true);
  };

  const openEdit = f => {
    setEdit(f);
    setForm({ name: f.nameHeb || f.name || '', idNumber: f.idNumber || '', phone: f.phone || '', notes: f.notes || '' });
    setNewCode(null); setError(''); setShowForm(true);
  };

  const submit = async e => {
    e.preventDefault();
    if (!form.name.trim() || !form.idNumber) {
      setError(ar ? 'الاسم ورقم الهوية مطلوبان' : 'שם ומספר ת"ז חובה'); return;
    }
    setSaving(true); setError('');
    try {
      if (edit) {
        await adminAPI.updateFarmer(edit.id, {
          name: form.name.trim(), nameHeb: form.name.trim(),
          idNumber: form.idNumber, phone: form.phone, notes: form.notes,
        });
        setShowForm(false);
      } else {
        // الكود يُولَّد تلقائياً في الـ Backend
        const res = await adminAPI.createFarmer({
          name: form.name.trim(), nameHeb: form.name.trim(),
          idNumber: form.idNumber, phone: form.phone, notes: form.notes,
        });
        setShowForm(false);
        setNewCode(res.code || null);
      }
      load();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleRevealCode = async (farmerId) => {
    if (revealCode === farmerId) { setRevealCode(null); return; }
    // نجلب الكود من الـ Backend
    try {
      const res = await adminAPI.getFarmerCode(farmerId);
      setRevealCode({ id: farmerId, code: res.code });
      // إخفاء تلقائي بعد 10 ثواني
      setTimeout(() => setRevealCode(null), 10000);
    } catch(e) { alert(ar?'خطأ في جلب الكود':'שגיאה בטעינת הקוד'); }
  };

  // حساب المبلغ غير المدفوع لكل مزارع
  const calcUnpaid = (farmerId) => {
    const farmerReadings = readings.filter(r => {
      const rId = String(r.farmerId || '').trim();
      const fId = String(farmerId || '').trim();
      return rId === fId && !r.paid;
    });
    return farmerReadings.reduce((total, r) => {
      const vals = r.readings || [];
      const cupsAmount = vals.slice(1).reduce((s, _, i) => {
        const cups = vals[i+1] - vals[i];
        const price = getPrice(prices, r.year, r.landId, i+1);
        return s + (cups > 0 ? cups * price : 0);
      }, 0);
      const extra = (parseFloat(r.extra) || 0) - (parseFloat(r.extraPaid) || 0);
      return total + cupsAmount + extra;
    }, 0);
  };

  const exportExcel = async () => {
    try {
      // جلب كل المزارعين مع أكوادهم
      const rows = await Promise.all(
        farmers.map(async f => {
          let code = '****';
          try {
            const res = await adminAPI.getFarmerCode(f.id);
            code = res.code || '****';
          } catch {}
          const unpaid = calcUnpaid(f.id);
          return {
            'שם החקלאי':        f.nameHeb || f.name || '',
            'מספר ת"ז':         f.idNumber || '',
            'קוד כניסה':        code,
            'טלפון':            f.phone || '',
            'יתרה לתשלום (₪)': unpaid > 0 ? Math.round(unpaid * 100) / 100 : 0,
          };
        })
      );

      const ws = XLSX.utils.json_to_sheet(rows);

      // عرض الأعمدة
      ws['!cols'] = [
        { wch: 22 }, // اسم
        { wch: 14 }, // هوية
        { wch: 14 }, // هاتف
        { wch: 12 }, // كود
        { wch: 18 }, // متبقي
      ];

      // RTL للورقة
      if (!ws['!opts']) ws['!opts'] = {};
      ws['!opts'].Views = [{ RTL: true }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'חקלאים');

      const date = new Date().toISOString().slice(0,10);
      XLSX.writeFile(wb, `alshallala-farmers-${date}.xlsx`);
    } catch(e) {
      alert(ar ? 'خطأ في التصدير' : 'שגיאה בייצוא');
    }
  };

  const del = async (id, name) => {
    if (!window.confirm(`${ar?'حذف المزارع':'מחיקת חקלאי'} "${name}"?`)) return;
    await adminAPI.deleteFarmer(id); load();
  };

  const filtered = farmers.filter(f =>
    !search || f.name?.includes(search) || f.nameHeb?.includes(search) || f.idNumber?.includes(search)
  );

  return (
    <div>
      <div className="flex-between mb-20" style={{ flexWrap:'wrap', gap:12 }}>
        <input type="text"
          placeholder={`🔍 ${t('search', lang)}`}
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ maxWidth:280 }} />
        <div className="flex-gap gap-8">
          <button className="btn btn-outline" onClick={exportExcel}
            style={{display:'flex', alignItems:'center', gap:6}}>
            📊 {ar?'تصدير Excel':'יצוא Excel'}
          </button>
          <button className="btn btn-primary" onClick={openAdd}>
            + {ar ? 'إضافة مزارع' : 'הוסף חקלאי'}
          </button>
        </div>
      </div>

      {/* نموذج الإضافة/التعديل */}
      {showForm && (
        <div className="card mb-20 fade-in-fast" style={{ border:'2px solid var(--primary)' }}>
          <h3 className="mb-16" style={{ fontFamily:'Heebo, sans-serif' }}>
            {edit ? `✏️ ${ar?'تعديل مزارع':'עריכת חקלאי'}` : `+ ${ar?'مزارع جديد':'חקלאי חדש'}`}
          </h3>
          <form onSubmit={submit}>
            <div className="grid-2">
              {/* اسم عبري */}
              <div className="form-group">
                <label style={{ fontFamily:'Heebo, sans-serif' }}>שם החקלאי (עברית) *</label>
                <input value={form.name} onChange={e => setForm({...form, name:e.target.value})}
                  placeholder="ישראל ישראלי"
                  style={{ fontFamily:'Heebo, sans-serif', fontSize:16, fontWeight:600 }} autoFocus />
              </div>

              {/* رقم الهوية */}
              <div className="form-group">
                <label>{t('idNumber', lang)} *</label>
                <input value={form.idNumber} onChange={e => setForm({...form, idNumber:e.target.value})}
                  placeholder="039444682" />
              </div>

              {/* الهاتف */}
              <div className="form-group">
                <label>{t('phone', lang)}</label>
                <input value={form.phone} onChange={e => setForm({...form, phone:e.target.value})}
                  placeholder="050-1234567" />
              </div>

              {/* إشعار الكود التلقائي */}
              {!edit && (
                <div className="form-group">
                  <label>{ar?'كود الدخول':'קוד כניסה'}</label>
                  <div style={{
                    background:'#f0fdf4', border:'1.5px dashed #16a34a',
                    borderRadius:10, padding:'10px 16px', textAlign:'center',
                    color:'#15803d', fontSize:13, fontWeight:600,
                  }}>
                    🎲 {ar?'سيُولَّد تلقائياً عند الحفظ':'יופק אוטומטית בשמירה'}
                  </div>
                </div>
              )}
            </div>

            {/* ملاحظة */}
            <div className="form-group">
              <label>{t('notes', lang)}</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm({...form, notes:e.target.value})}
                placeholder={ar ? 'ملاحظة تخص المزارع (تظهر له عند دخوله)' : 'הערה על החקלאי (מוצגת לו בכניסה)'} />
            </div>

            {error && <div className="alert alert-error">{error}</div>}
            <div className="flex-gap gap-12">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? t('saving', lang) : `💾 ${t('save', lang)}`}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>
                {t('cancel', lang)}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* عرض الكود المولَّد بعد الإضافة */}
      {newCode && (
        <div className="card mb-16 fade-in" style={{
          border:'2px solid #16a34a', background:'#f0fdf4', padding:'24px', textAlign:'center',
        }}>
          <div style={{fontSize:20, marginBottom:8}}>
            🎉 {ar?'تمت إضافة المزارع بنجاح!':'החקלאי נוסף בהצלחה!'}
          </div>
          <div style={{color:'var(--text-muted)', fontSize:13, marginBottom:16}}>
            {ar?'كود الدخول الخاص به:':'קוד הכניסה שלו:'}
          </div>
          <div style={{
            display:'inline-block', background:'#fff',
            border:'3px solid #16a34a', borderRadius:16,
            padding:'16px 48px', fontSize:52, fontWeight:900,
            fontFamily:'monospace', letterSpacing:14, color:'#14532d',
            boxShadow:'0 4px 20px rgba(22,163,74,0.2)',
          }}>
            {newCode}
          </div>
          <div style={{marginTop:14, color:'var(--text-muted)', fontSize:12}}>
            {ar?'احفظ هذا الكود وأرسله للمزارع — يمكنك رؤيته دائماً في الجدول':'שמור קוד זה ושלח לחקלאי — תוכל לראות אותו תמיד בטבלה'}
          </div>
          <button className="btn btn-outline btn-sm" style={{marginTop:14}} onClick={()=>setNewCode(null)}>
            {ar?'إغلاق':'סגור'}
          </button>
        </div>
      )}

      {/* جدول المزارعين */}
      {loading ? (
        <div style={{ textAlign:'center', padding:40 }}><div className="spinner" /></div>
      ) : (
        <div className="card">
          <p style={{ color:'var(--text-muted)', fontSize:13, marginBottom:12 }}>
            {filtered.length} {ar ? 'مزارع' : 'חקלאים'}
          </p>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>{ar ? 'الاسم' : 'שם'}</th>
                  <th>{t('idNumber', lang)}</th>
                  <th>{ar?'الكود':'קוד'}</th>
                  <th>{ar?'الهاتف':'טלפון'}</th>
                  <th style={{color:'#dc2626', background:'#fff1f2', minWidth:110}}>{ar?'غير مدفوع':'יתרה לתשלום'}</th>
                  <th>{t('phone', lang)}</th>
                  <th>{t('notes', lang)}</th>
                  <th>{ar ? 'إجراءات' : 'פעולות'}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(f => (
                  <tr key={f.id}>
                    <td>
                      <strong style={{ fontFamily:'Heebo, sans-serif', fontSize:15 }}>
                        {f.nameHeb || f.name}
                      </strong>
                    </td>
                    <td>
                      <code style={{ background:'var(--surface-2)', padding:'2px 8px', borderRadius:4, fontSize:12 }}>
                        {f.idNumber}
                      </code>
                    </td>
                    <td>
                      <div style={{display:'flex', alignItems:'center', gap:6}}>
                        <code style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', padding:'3px 10px', borderRadius:6, fontSize:13, fontWeight:700, letterSpacing:3, color:'#15803d' }}>
                          {revealCode?.id === f.id ? revealCode.code : '••••'}
                        </code>
                        <button
                          onClick={() => handleRevealCode(f.id)}
                          title={ar?'إظهار/إخفاء الكود':'הצג/הסתר קוד'}
                          style={{ width:24, height:24, borderRadius:6, border:'1px solid var(--border)', background:'var(--surface-2)', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:12, transition:'all 0.15s' }}
                          onMouseEnter={e=>e.currentTarget.style.background='var(--primary-light)'}
                          onMouseLeave={e=>e.currentTarget.style.background='var(--surface-2)'}
                        >{revealCode?.id === f.id ? '🙈' : '👁'}</button>
                      </div>
                    </td>
                    <td>{f.phone || '—'}</td>
                    {/* المبلغ غير المدفوع */}
                    {(() => {
                      const unpaid = calcUnpaid(f.id);
                      return (
                        <td style={{ textAlign:'center' }}>
                          {unpaid > 0 ? (
                            <span style={{
                              fontWeight:800, fontSize:14, color:'#dc2626',
                              background:'#fff1f2', border:'1.5px solid #fca5a5',
                              borderRadius:8, padding:'3px 10px', display:'inline-block'
                            }}>
                              ₪{unpaid.toLocaleString('he-IL', {minimumFractionDigits:0, maximumFractionDigits:1})}
                            </span>
                          ) : (
                            <span style={{color:'#16a34a', fontSize:13, fontWeight:700}}>✓</span>
                          )}
                        </td>
                      );
                    })()}
                    <td style={{ maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:12, color:'var(--text-muted)' }}>
                      {f.notes || '—'}
                    </td>
                    <td>
                      <div className="flex-gap gap-6">
                        <button onClick={() => openEdit(f)}
                          style={{ width:28, height:28, borderRadius:7, border:'1.5px solid var(--border)', background:'var(--surface-2)', color:'var(--primary)', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:13, transition:'all 0.18s' }}
                          onMouseEnter={e=>{e.currentTarget.style.background='var(--primary)';e.currentTarget.style.color='#fff';}}
                          onMouseLeave={e=>{e.currentTarget.style.background='var(--surface-2)';e.currentTarget.style.color='var(--primary)';}}>✏</button>
                        <button onClick={() => del(f.id, f.nameHeb || f.name)}
                          style={{ width:28, height:28, borderRadius:7, border:'1.5px solid #fca5a5', background:'#fff1f2', color:'#dc2626', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:13, transition:'all 0.18s' }}
                          onMouseEnter={e=>{e.currentTarget.style.background='#dc2626';e.currentTarget.style.color='#fff';}}
                          onMouseLeave={e=>{e.currentTarget.style.background='#fff1f2';e.currentTarget.style.color='#dc2626';}}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="empty-state"><span className="icon">👨‍🌾</span><p>{t('noData', lang)}</p></div>
          )}
        </div>
      )}
    </div>
  );
}
