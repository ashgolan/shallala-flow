import React, { useState, useEffect, useCallback } from 'react';
import { paymentsAPI } from '../../api';
import { useLang } from '../../contexts/LangContext';

export const CATEGORIES = [
  { key:'contractor', ar:'مقاول', he:'קבלן' },
  { key:'company',    ar:'شركة',  he:'חברה' },
  { key:'committee',  ar:'لجنة',  he:'ועדה' },
  { key:'maintenance',ar:'صيانة', he:'תחזוקה' },
  { key:'water',      ar:'مياه',  he:'מים' },
  { key:'general',    ar:'عام',   he:'כללי' },
];

const EMPTY = { date:'', recipient:'', amount:'', checkNumber:'', invoiceNumber:'', description:'', category:'general', notes:'' };

export default function AdminPayments({ adminRole='admin' }) {
  const isViewer = adminRole === 'viewer';
  const { lang } = useLang();
  const ar = lang === 'ar';
  const [payments, setPayments] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit]         = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [error, setError]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [filterYear, setFilterYear] = useState('');
  const [search, setSearch]     = useState('');
  const [sortKey, setSortKey]   = useState('date');
  const [sortDir, setSortDir]   = useState('desc');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await paymentsAPI.getAll(filterYear);
      setPayments(d.payments || []);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, [filterYear]);

  useEffect(() => { load(); }, [load]);

  const years = [...new Set(payments.map(p => p.date?.slice(0,4)))].sort((a,b)=>b-a);

  const catLabel = key => {
    const c = CATEGORIES.find(x => x.key === key);
    return c ? c[ar?'ar':'he'] : key;
  };

  const openAdd = () => { setEdit(null); setForm({ ...EMPTY, date: new Date().toISOString().split('T')[0] }); setError(''); setShowForm(true); };
  const openEdit = p => { setEdit(p); setForm({ date:p.date, recipient:p.recipient, amount:p.amount, checkNumber:p.checkNumber||'', invoiceNumber:p.invoiceNumber||'', description:p.description, category:p.category||'general', notes:p.notes||'' }); setError(''); setShowForm(true); };

  const submit = async e => {
    e.preventDefault();
    if (!form.date || !form.recipient || !form.amount || !form.description) {
      setError(ar ? 'التاريخ والمستفيد والمبلغ والوصف مطلوبة' : 'תאריך, מקבל, סכום ותיאור חובה');
      return;
    }
    setSaving(true); setError('');
    try {
      if (edit) await paymentsAPI.update(edit.id, form);
      else await paymentsAPI.create(form);
      setShowForm(false);
      load();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const del = async (id, desc) => {
    if (!window.confirm(`${ar?'حذف':'מחיקה'} "${desc}"?`)) return;
    await paymentsAPI.delete(id);
    load();
  };

  const handleSort = key => {
    if (sortKey === key) setSortDir(d => d==='asc'?'desc':'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const filtered = payments
    .filter(p => !search || p.recipient?.includes(search) || p.description?.includes(search) || p.checkNumber?.includes(search) || p.invoiceNumber?.includes(search))
    .sort((a,b) => {
      let va, vb;
      if      (sortKey==='date')   { va=a.date;      vb=b.date; }
      else if (sortKey==='amount') { va=a.amount;    vb=b.amount; }
      else if (sortKey==='recipient') { va=a.recipient; vb=b.recipient; }
      else { va=a[sortKey]||''; vb=b[sortKey]||''; }
      if (typeof va==='string') return sortDir==='asc' ? va.localeCompare(vb,'he') : vb.localeCompare(va,'he');
      return sortDir==='asc' ? va-vb : vb-va;
    });

  const grandTotal = filtered.reduce((s,p) => s + (parseFloat(p.amount)||0), 0);

  const SI = ({ col }) => sortKey!==col
    ? <span style={{opacity:0.2,fontSize:9}}>⇅</span>
    : <span style={{fontSize:9,color:'var(--primary)'}}>{sortDir==='asc'?'▲':'▼'}</span>;

  const STh = ({ col, children, style={} }) => (
    <th onClick={()=>handleSort(col)} style={{cursor:'pointer',userSelect:'none',...style}}
      onMouseEnter={e=>e.currentTarget.style.background='#d4edda'}
      onMouseLeave={e=>e.currentTarget.style.background=''}>
      <span style={{display:'inline-flex',alignItems:'center',gap:3}}>{children} <SI col={col}/></span>
    </th>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex-between mb-20" style={{flexWrap:'wrap',gap:12}}>
        <div>
          <h2 className="mb-4">💸 {ar?'سجل المدفوعات':'סגל תשלומים'}</h2>
          <p style={{color:'var(--text-muted)',fontSize:13}}>
            {ar?'مدفوعات اللجنة للمقاولين والشركات':'תשלומי הוועדה לקבלנים וחברות'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd} style={{display: isViewer?'none':''}}>{ ar?'+ إضافة دفعة':'+ הוסף תשלום'}</button>
      </div>

      {/* Filters */}
      <div className="flex-gap gap-8 mb-16" style={{flexWrap:'wrap'}}>
        <input placeholder={`🔍 ${ar?'بحث...':'חיפוש...'}`} value={search}
          onChange={e=>setSearch(e.target.value)} style={{maxWidth:220}} />
        <select value={filterYear} onChange={e=>setFilterYear(e.target.value)} style={{width:140}}>
          <option value="">{ar?'جميع السنوات':'כל השנים'}</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card mb-16 fade-in-fast" style={{border:'2px solid var(--primary)'}}>
          <h3 className="mb-16">{edit ? `✏️ ${ar?'تعديل دفعة':'עריכת תשלום'}` : `+ ${ar?'دفعة جديدة':'תשלום חדש'}`}</h3>
          <form onSubmit={submit}>
            <div className="grid-3">
              <div className="form-group">
                <label>{ar?'التاريخ *':'תאריך *'}</label>
                <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} />
              </div>
              <div className="form-group">
                <label>{ar?'المستفيد *':'מקבל התשלום *'}</label>
                <input value={form.recipient} onChange={e=>setForm({...form,recipient:e.target.value})}
                  placeholder={ar?'اسم المقاول/الشركة/اللجنة':'שם הקבלן/חברה/ועדה'} />
              </div>
              <div className="form-group">
                <label>{ar?'المبلغ (₪) *':'סכום (₪) *'}</label>
                <input type="number" step="any" min="0" value={form.amount}
                  onChange={e=>setForm({...form,amount:e.target.value})}
                  placeholder="0" style={{fontWeight:700}} />
              </div>
              <div className="form-group">
                <label>{ar?'رقم الشيك':'מספר צ\'ק'}</label>
                <input value={form.checkNumber} onChange={e=>setForm({...form,checkNumber:e.target.value})}
                  placeholder="123456" style={{fontFamily:'monospace'}} />
              </div>
              <div className="form-group">
                <label style={{fontFamily:'Heebo,sans-serif'}}>{ar?'رقم החשבونית':'מספר חשבונית'}</label>
                <input value={form.invoiceNumber} onChange={e=>setForm({...form,invoiceNumber:e.target.value})}
                  placeholder="INV-001" style={{fontFamily:'monospace'}} />
              </div>
              <div className="form-group">
                <label>{ar?'التصنيف':'קטגוריה'}</label>
                <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
                  {CATEGORIES.map(c => <option key={c.key} value={c.key}>{ar?c.ar:c.he}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>{ar?'طبيعة العمل / سبب الدفع *':'תיאור העבודה / סיבת התשלום *'}</label>
              <input value={form.description} onChange={e=>setForm({...form,description:e.target.value})}
                placeholder={ar?'مثال: أعمال حفر، صيانة شبكة مياه...':'לדוג: עבודות חפירה, תחזוקת רשת מים...'} />
            </div>
            <div className="form-group">
              <label>{ar?'ملاحظات':'הערות'}</label>
              <textarea rows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} />
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="flex-gap gap-12">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? (ar?'جاري الحفظ...':'שומר...') : `💾 ${ar?'حفظ':'שמור'}`}
              </button>
              <button type="button" className="btn btn-outline" onClick={()=>setShowForm(false)}>
                {ar?'إلغاء':'ביטול'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Summary cards */}
      {filtered.length > 0 && (
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:10, marginBottom:16}}>
          {/* ✅ بطاقة "إجمالي المدفوعات" — نفس بنية وارتفاع باقي البطاقات بالضبط (سطر تسمية + سطر رقم)،
              وتميّزها فقط عبر حد جانبي أخضر + أيقونة 💰 داخل نص التسمية نفسه (بدون سطر إضافي يكبّر ارتفاع البطاقة) */}
          <div className="stat-card" style={{padding:'12px 16px', borderRight:'3px solid var(--primary)'}}>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4}}>💰 {ar?'إجمالي المدفوعات':'סה"כ תשלומים'}</div>
            <div style={{fontSize:'1.4rem',fontWeight:900,color:'var(--primary)'}}>₪{grandTotal.toLocaleString()}</div>
          </div>
          <div className="stat-card" style={{padding:'12px 16px'}}>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4}}>{ar?'عدد الدفعات':'מספר תשלומים'}</div>
            <div style={{fontSize:'1.4rem',fontWeight:900,color:'var(--primary)'}}>{filtered.length}</div>
          </div>
          {/* by category */}
          {CATEGORIES.filter(cat => filtered.some(p=>p.category===cat.key)).map(cat => {
            const total = filtered.filter(p=>p.category===cat.key).reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
            return (
              <div key={cat.key} className="stat-card" style={{padding:'12px 16px'}}>
                <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4}}>{ar?cat.ar:cat.he}</div>
                <div style={{fontSize:'1.1rem',fontWeight:800,color:'var(--primary)'}}>₪{total.toLocaleString()}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{textAlign:'center',padding:40}}><div className="spinner"/></div>
      ) : (
        <div className="card">
          <p style={{color:'var(--text-muted)',fontSize:13,marginBottom:12}}>
            {filtered.length} {ar?'دفعة':'תשלומים'}
          </p>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <STh col="date"        style={{minWidth:100}}>{ar?'التاريخ':'תאריך'}</STh>
                  <STh col="recipient"   style={{minWidth:130}}>{ar?'المستفيد':'מקבל'}</STh>
                  <STh col="description" style={{minWidth:160}}>{ar?'طبيعة العمل':'תיאור'}</STh>
                  <STh col="category"    style={{minWidth:90}}>{ar?'التصنيف':'קטגוריה'}</STh>
                  <th style={{minWidth:100, fontFamily:'monospace'}}>{ar?'رقم الشيك':'צ\'ק'}</th>
                  <th style={{minWidth:100, fontFamily:'monospace', fontFamily:'Heebo,sans-serif'}}>{ar?'رقم החשبونية':'חשבונית'}</th>
                  <STh col="amount"      style={{minWidth:100, textAlign:'center', background:'#fef9c3', color:'#854d0e'}}>💰 {ar?'المبلغ':'סכום'}</STh>
                  <th style={{minWidth:70}}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td style={{fontWeight:600, whiteSpace:'nowrap'}}>{p.date}</td>
                    <td><strong>{p.recipient}</strong></td>
                    <td style={{fontSize:13}}>
                      {p.description}
                      {p.notes && <div style={{fontSize:11,color:'var(--text-muted)'}}>{p.notes}</div>}
                    </td>
                    <td>
                      <span className="badge badge-blue" style={{fontSize:11}}>{catLabel(p.category)}</span>
                    </td>
                    <td style={{fontFamily:'monospace',fontSize:13}}>{p.checkNumber||'—'}</td>
                    <td style={{fontFamily:'monospace',fontSize:13}}>{p.invoiceNumber||'—'}</td>
                    <td style={{textAlign:'center', background:'#fefce8'}}>
                      <strong style={{color:'#92400e',fontSize:15}}>₪{parseFloat(p.amount).toLocaleString()}</strong>
                    </td>
                    <td>
                      <div className="flex-gap gap-4" style={{visibility:isViewer?'hidden':'visible'}}>
                        <button onClick={()=>openEdit(p)}
                          style={{width:28,height:28,borderRadius:7,border:'1.5px solid var(--border)',background:'var(--surface-2)',color:'var(--primary)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:13,transition:'all 0.18s'}}
                          onMouseEnter={e=>{e.currentTarget.style.background='var(--primary)';e.currentTarget.style.color='#fff';}}
                          onMouseLeave={e=>{e.currentTarget.style.background='var(--surface-2)';e.currentTarget.style.color='var(--primary)';}}>
                          ✏
                        </button>
                        <button onClick={()=>del(p.id,p.description)}
                          style={{width:28,height:28,borderRadius:7,border:'1.5px solid #fca5a5',background:'#fff1f2',color:'#dc2626',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:13,transition:'all 0.18s'}}
                          onMouseEnter={e=>{e.currentTarget.style.background='#dc2626';e.currentTarget.style.color='#fff';}}
                          onMouseLeave={e=>{e.currentTarget.style.background='#fff1f2';e.currentTarget.style.color='#dc2626';}}>
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 1 && (
                <tfoot>
                  <tr style={{background:'linear-gradient(90deg,#14532d,#166534)'}}>
                    <td colSpan={6} style={{fontWeight:900,color:'#fff',fontSize:14,padding:'11px 14px'}}>
                      ⚡ {ar?'الإجمالي الكلي':'סה"כ כללי'}
                    </td>
                    <td style={{textAlign:'center',padding:'11px 8px'}}>
                      <span style={{fontWeight:900,color:'#fde68a',fontSize:18}}>₪{grandTotal.toLocaleString()}</span>
                    </td>
                    <td/>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="empty-state"><span className="icon">💸</span><p>{ar?'لا توجد دفعات':'אין תשלומים'}</p></div>
          )}
        </div>
      )}
    </div>
  );
}