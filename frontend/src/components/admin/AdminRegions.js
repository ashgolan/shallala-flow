import React, { useState, useEffect, useCallback } from 'react';
import { regionsAPI } from '../../api';
import { useLang } from '../../contexts/LangContext';
import { t } from '../../i18n/translations';

export default function AdminRegions() {
  const { lang } = useLang();
  const [regions, setRegions]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit]         = useState(null);
  const [name, setName]         = useState('');
  const [error, setError]       = useState('');
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await regionsAPI.getRegions(); setRegions(d.regions || []); }
    catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEdit(null); setName(''); setError(''); setShowForm(true); };
  const openEdit = r => { setEdit(r); setName(r.name || ''); setError(''); setShowForm(true); };

  const submit = async e => {
    e.preventDefault();
    if (!name.trim()) { setError(lang==='ar'?'أدخل اسم المنطقة':'הזן שם אזור'); return; }
    setSaving(true); setError('');
    try {
      const data = { name: name.trim().toUpperCase(), nameHeb: name.trim().toUpperCase(), notes: '' };
      if (edit) await regionsAPI.updateRegion(edit.id, data);
      else      await regionsAPI.createRegion(data);
      setShowForm(false); load();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const del = async (id, name) => {
    if (!window.confirm(`${lang==='ar'?'حذف المنطقة':'מחיקת אזור'} "${name}"?`)) return;
    await regionsAPI.deleteRegion(id); load();
  };

  return (
    <div>
      <div className="flex-between mb-20" style={{ flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 className="mb-8">📍 {t('regionsTab', lang)}</h2>
          <p style={{ color:'var(--text-muted)', fontSize:13 }}>
            {lang==='ar'
              ? 'أضف المناطق بحرف أو حرفين إنجليزية (A, B, AB, FC...)'
              : 'הוסף אזורים עם אות או שתי אותיות באנגלית (A, B, AB, FC...)'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>
          + {lang==='ar'?'إضافة منطقة':'הוסף אזור'}
        </button>
      </div>

      {showForm && (
        <div className="card mb-20 fade-in-fast" style={{ border:'2px solid var(--primary)', maxWidth:400 }}>
          <h3 className="mb-16">{edit ? `✏️ ${lang==='ar'?'تعديل منطقة':'עריכת אזור'}` : `+ ${lang==='ar'?'منطقة جديدة':'אזור חדש'}`}</h3>
          <form onSubmit={submit}>
            <div className="form-group">
              <label style={{ fontSize:14 }}>
                {lang==='ar'?'اسم المنطقة (حرف أو حرفين)':'שם האזור (אות או שתי אותיות)'}
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value.toUpperCase())}
                placeholder="A / B / AB / FC"
                maxLength={5}
                style={{ fontSize:22, fontWeight:900, letterSpacing:4, textAlign:'center', fontFamily:'monospace' }}
                autoFocus
              />
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="flex-gap gap-12">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? t('saving',lang) : `💾 ${t('save',lang)}`}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>
                {t('cancel',lang)}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:40 }}><div className="spinner" /></div>
      ) : regions.length === 0 ? (
        <div className="card empty-state">
          <span className="icon">📍</span>
          <p>{lang==='ar'?'لا توجد مناطق بعد':'אין אזורים עדיין'}</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexWrap:'wrap', gap:12 }}>
          {regions.map(r => (
            <div key={r.id} className="card" style={{ padding:'16px 20px', minWidth:120, textAlign:'center' }}>
              <div style={{ fontSize:36, fontWeight:900, color:'var(--primary)', fontFamily:'monospace', letterSpacing:4, marginBottom:12 }}>
                {r.name}
              </div>
              <div className="flex-gap gap-6" style={{ justifyContent:'center' }}>
                <button onClick={() => openEdit(r)}
                          style={{
                            width:28, height:28, borderRadius:7,
                            border:'1.5px solid var(--border)',
                            background:'var(--surface-2)', color:'var(--primary)',
                            cursor:'pointer', display:'inline-flex',
                            alignItems:'center', justifyContent:'center',
                            fontSize:13, transition:'all 0.18s',
                          }}
                          onMouseEnter={e=>{e.currentTarget.style.background='var(--primary)';e.currentTarget.style.color='#fff';}}
                          onMouseLeave={e=>{e.currentTarget.style.background='var(--surface-2)';e.currentTarget.style.color='var(--primary)';}}
                        >✏</button>
                <button
                          onClick={() => del(r.id, r.name)}
                          style={{
                            width:28, height:28, borderRadius:7,
                            border:'1.5px solid #fca5a5',
                            background:'#fff1f2', color:'#dc2626',
                            cursor:'pointer', display:'inline-flex',
                            alignItems:'center', justifyContent:'center',
                            fontSize:13, transition:'all 0.18s',
                          }}
                          onMouseEnter={e=>{e.currentTarget.style.background='#dc2626';e.currentTarget.style.color='#fff';}}
                          onMouseLeave={e=>{e.currentTarget.style.background='#fff1f2';e.currentTarget.style.color='#dc2626';}}
                        >✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
