import React, { useState, useEffect, useCallback } from 'react';
import { regionsAPI } from '../../api';
import { useLang } from '../../contexts/LangContext';
import { t } from '../../i18n/translations';

export default function AdminRegions({ adminRole = 'admin' }) {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const isViewer = adminRole === 'viewer';

  const [regions, setRegions]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [edit, setEdit]           = useState(null);
  const [rCode, setRCode]         = useState('');
  const [rName, setRName]         = useState('');
  const [error, setError]         = useState('');
  const [saving, setSaving]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await regionsAPI.getRegions(); setRegions(d.regions || []); }
    catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEdit(null); setRCode(''); setRName(''); setError(''); setShowForm(true);
  };
  const openEdit = r => {
    setEdit(r);
    setRCode(r.name || '');
    setRName(r.nameHeb && r.nameHeb !== r.name ? r.nameHeb : '');
    setError(''); setShowForm(true);
  };

  const submit = async e => {
    e.preventDefault();
    if (!rCode.trim()) { setError(ar ? 'أدخل كود المنطقة' : 'הזן קוד אזור'); return; }
    if (!rName.trim()) { setError(ar ? 'أدخل اسم المنطقة' : 'הזן שם אזור'); return; }
    setSaving(true); setError('');
    try {
      const data = {
        name:    rCode.trim().toUpperCase(),
        nameHeb: rName.trim(),
        notes:   '',
      };
      if (edit) await regionsAPI.updateRegion(edit.id, data);
      else      await regionsAPI.createRegion(data);
      setShowForm(false); load();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const del = async (id, name) => {
    if (!window.confirm(`${ar ? 'حذف المنطقة' : 'מחיקת אזור'} "${name}"?`)) return;
    await regionsAPI.deleteRegion(id); load();
  };

  return (
    <div>
      {/* Header */}
      <div className="flex-between mb-20" style={{ flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 className="mb-4">📍 {ar ? 'المناطق' : 'אזורים חקלאיים'}</h2>
          <p style={{ color:'var(--text-muted)', fontSize:13 }}>
            {ar
              ? 'كل منطقة = حرف (أو حرفان) + اسم — مثال: A = אלעברה'
              : 'כל אזור = קוד (אות/שתי אותיות) + שם — לדוג׳: A = אלעברה'}
          </p>
        </div>
        {!isViewer && (
          <button className="btn btn-primary" onClick={openAdd}>
            + {ar ? 'إضافة منطقة' : 'הוסף אזור'}
          </button>
        )}
      </div>

      {/* نموذج الإضافة/التعديل */}
      {showForm && (
        <div className="card mb-20 fade-in-fast" style={{ border:'2px solid var(--primary)', maxWidth:500 }}>
          <h3 className="mb-16">
            {edit
              ? `✏️ ${ar ? 'تعديل منطقة' : 'עריכת אזור'}`
              : `+ ${ar ? 'منطقة جديدة' : 'אזור חדש'}`}
          </h3>
          <form onSubmit={submit}>
            <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:12, marginBottom:12 }}>
              {/* الكود */}
              <div className="form-group" style={{ margin:0 }}>
                <label style={{ fontSize:13 }}>{ar ? 'الكود' : 'קוד'} *</label>
                <input
                  value={rCode}
                  onChange={e => setRCode(e.target.value.toUpperCase())}
                  placeholder="A / B / FC"
                  maxLength={5}
                  style={{ fontSize:22, fontWeight:900, letterSpacing:4, textAlign:'center', fontFamily:'monospace' }}
                  autoFocus
                />
              </div>
              {/* الاسم */}
              <div className="form-group" style={{ margin:0 }}>
                <label style={{ fontSize:13, fontFamily:'Heebo,sans-serif' }}>
                  {ar ? 'اسم المنطقة' : 'שם האזור'} *
                </label>
                <input
                  value={rName}
                  onChange={e => setRName(e.target.value)}
                  placeholder="אלעברה / עין אלעוחלאן"
                  style={{ fontFamily:'Heebo,sans-serif', fontSize:15 }}
                />
              </div>
            </div>
            {error && <div className="alert alert-error mb-8">{error}</div>}
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

      {/* الجدول */}
      {loading ? (
        <div style={{ textAlign:'center', padding:40 }}><div className="spinner" /></div>
      ) : regions.length === 0 ? (
        <div className="card empty-state">
          <span className="icon">📍</span>
          <p>{ar ? 'لا توجد مناطق بعد' : 'אין אזורים עדיין'}</p>
        </div>
      ) : (
        <div className="card">
          <p style={{ color:'var(--text-muted)', fontSize:13, marginBottom:12 }}>
            {regions.length} {ar ? 'منطقة' : 'אזורים'}
          </p>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width:100, textAlign:'center', fontFamily:'monospace' }}>
                    {ar ? 'الكود' : 'קוד'}
                  </th>
                  <th style={{ fontFamily:'Heebo,sans-serif' }}>
                    {ar ? 'اسم المنطقة' : 'שם האזור'}
                  </th>
                  {!isViewer && <th style={{ width:80 }}></th>}
                </tr>
              </thead>
              <tbody>
                {regions.map(r => (
                  <tr key={r.id}>
                    <td style={{ textAlign:'center' }}>
                      <code style={{
                        background:'#f0fdf4', border:'1.5px solid #bbf7d0',
                        padding:'4px 14px', borderRadius:8,
                        fontWeight:900, fontSize:18, letterSpacing:4,
                        color:'var(--primary)',
                      }}>
                        {r.name}
                      </code>
                    </td>
                    <td style={{ fontFamily:'Heebo,sans-serif', fontWeight:600, fontSize:15 }}>
                      {r.nameHeb && r.nameHeb !== r.name
                        ? r.nameHeb
                        : <span style={{ color:'var(--text-muted)', fontStyle:'italic', fontSize:12 }}>
                            {ar ? '— بدون اسم' : '— ללא שם'}
                          </span>
                      }
                    </td>
                    {!isViewer && (
                      <td>
                        <div className="flex-gap gap-4">
                          <button onClick={() => openEdit(r)}
                            style={{ width:26, height:26, borderRadius:6, border:'1.5px solid var(--border)', background:'var(--surface-2)', color:'var(--primary)', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:12 }}
                            onMouseEnter={e => { e.currentTarget.style.background='var(--primary)'; e.currentTarget.style.color='#fff'; }}
                            onMouseLeave={e => { e.currentTarget.style.background='var(--surface-2)'; e.currentTarget.style.color='var(--primary)'; }}>✏</button>
                          <button onClick={() => del(r.id, r.name)}
                            style={{ width:26, height:26, borderRadius:6, border:'1.5px solid #fca5a5', background:'#fff1f2', color:'#dc2626', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:12 }}
                            onMouseEnter={e => { e.currentTarget.style.background='#dc2626'; e.currentTarget.style.color='#fff'; }}
                            onMouseLeave={e => { e.currentTarget.style.background='#fff1f2'; e.currentTarget.style.color='#dc2626'; }}>✕</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
