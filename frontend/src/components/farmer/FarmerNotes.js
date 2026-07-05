import { t } from '../../i18n/translations';
import React, { useState, useEffect, useCallback } from 'react';
import { farmerAPI } from '../../api';
import { format } from 'date-fns';
import { ar as arLocale, he as heLocale } from 'date-fns/locale';

// ── نوع العملية — مفتاح ثابت + ترجمة + أيقونة
const TYPES = [
  { key:'spray',           ar:'رش',          he:'ריסוס',       icon:'💧', badge:'badge-blue'  },
  { key:'fertilizer',      ar:'سماد',        he:'דשן',         icon:'🌱', badge:'badge-green' },
  { key:'plow',            ar:'حرث',         he:'חרישה',       icon:'⚙️', badge:'badge-amber' },
  { key:'harvest',         ar:'حصاد',        he:'קציר',        icon:'🌾', badge:'badge-lime'  },
  { key:'planting',        ar:'زراعة',       he:'נטיעה',       icon:'🌿', badge:'badge-green' },
  { key:'pesticide',       ar:'مبيد حشري',   he:'קוטל חרקים',  icon:'🧪', badge:'badge-red'   },
  { key:'manualIrrigation',ar:'ري يدوي',     he:'השקיה ידנית', icon:'🚿', badge:'badge-blue'  },
  { key:'maintenance',     ar:'صيانة',       he:'תחזוקה',      icon:'🔧', badge:'badge-amber' },
  { key:'other',           ar:'أخرى',        he:'אחר',         icon:'📋', badge:'badge-gray'  },
];

const UNITS = [
  { ar:'لتر',  he:'ליטר' },
  { ar:'كجم',  he:'ק"ג'  },
  { ar:'طن',   he:'טון'  },
  { ar:'كيس',  he:'שקית' },
  { ar:'علبة', he:'קופסה'},
  { ar:'وحدة', he:'יחידה'},
];

const typeLabel  = (key, lang) => TYPES.find(t => t.key === key || t.ar === key || t.he === key)?.[lang] || key;
const typeIcon   = (key)       => TYPES.find(t => t.key === key || t.ar === key || t.he === key)?.icon  || '📋';
const typeBadge  = (key)       => TYPES.find(t => t.key === key || t.ar === key || t.he === key)?.badge || 'badge-gray';

export default function FarmerNotes({ farmer, lands, lang = 'ar' }) {
  const ar = lang === 'ar';
  const dateLocale = ar ? arLocale : heLocale;

  const [notes,     setNotes]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [filterLand,setFilter]    = useState('');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [form,      setForm]      = useState({
    landId: '', date: new Date().toISOString().split('T')[0],
    type: 'spray', description: '', amount: '', unit: ar ? 'لتر' : 'ליטר',
  });

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try { const d = await farmerAPI.getNotes(); setNotes(d.notes || []); }
    catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  const submit = async e => {
    e.preventDefault();
    if (!form.landId || !form.description) {
      setError(t('chooseLand', lang) + ' / ' + t('chooseDesc', lang));
      return;
    }
    setSaving(true); setError('');
    try {
      await farmerAPI.addNote({ ...form, typeLang: form.type });
      setForm({ landId:'', date: new Date().toISOString().split('T')[0], type:'spray', description:'', amount:'', unit: ar ? 'لتر' : 'ליטר' });
      setShowForm(false);
      loadNotes();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const del = async id => {
    if (!window.confirm(t('deleteNote', lang))) return;
    await farmerAPI.deleteNote(id);
    loadNotes();
  };

  const landName = id => landLabel(lands.find(l => l.id === id));
  // ✅ اسم المنطقة (تلقائياً) مع رقم المحطة بين قوسين — nameHeb يُفضَّل دائماً
  // (نفس قاعدة صفحة التقارير بالإدارة، بغض النظر عن لغة الواجهة)
  function landLabel(l) {
    if (!l) return '';
    const regionLabel = (l.regionNameHeb && l.regionNameHeb !== l.regionName)
      ? l.regionNameHeb
      : (l.regionName || '');
    if (regionLabel) return `${regionLabel} (${l.stationNumber || ''})`.replace(' ()', '');
    return l.name || l.stationNumber || '';
  }
  const filtered = filterLand ? notes.filter(n => n.landId === filterLand) : notes;

  return (
    <div className="fade-in">

      {/* Header */}
      <div className="card mb-16 flex-between" style={{ flexWrap:'wrap', gap:12 }}>
        <div>
          <h2>📝 {t('farmNotesTitle', lang)}</h2>
          <p style={{ color:'var(--text-muted)', fontSize:13, marginTop:4 }}>{t('farmNotesDesc', lang)}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? `✕ ${t('cancel', lang)}` : t('addRecord', lang)}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card mb-16 fade-in-fast" style={{ border:'2px solid var(--primary)' }}>
          <h3 className="mb-16">📋 {t('addRecord', lang)}</h3>
          <form onSubmit={submit}>
            <div className="grid-2">
              <div className="form-group">
                <label>{t('lands', lang)} *</label>
                <select value={form.landId} onChange={e => setForm({ ...form, landId: e.target.value })}>
                  <option value="">— {t('chooseLandOpt', lang)} —</option>
                  {lands.map(l => <option key={l.id} value={l.id}>{landLabel(l)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>{t('date', lang)} *</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>{t('operation', lang)}</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  {TYPES.map(tp => (
                    <option key={tp.key} value={tp.key}>{tp.icon} {ar ? tp.ar : tp.he}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>{t('quantity', lang)}</label>
                <div style={{ display:'flex', gap:8 }}>
                  <input type="number" placeholder="0" value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })} style={{ flex:1 }}/>
                  <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} style={{ width:90 }}>
                    {UNITS.map(u => (
                      <option key={u.ar} value={ar ? u.ar : u.he}>{ar ? u.ar : u.he}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="form-group">
              <label>{t('description', lang)} *</label>
              <textarea
                placeholder={ar ? 'اكتب المادة أو وصف العملية...' : 'כתוב חומר או תיאור פעולה...'}
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                rows={2}/>
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><span className="spinner spinner-sm"/> {t('saving', lang)}</> : t('saveToArchive', lang)}
            </button>
          </form>
        </div>
      )}

      {/* Filter */}
      <div className="card mb-16">
        <select value={filterLand} onChange={e => setFilter(e.target.value)}>
          <option value="">{t('allLands', lang)} ({notes.length})</option>
          {lands.map(l => (
            <option key={l.id} value={l.id}>
              {landLabel(l)} ({notes.filter(n => n.landId === l.id).length})
            </option>
          ))}
        </select>
      </div>

      {/* Notes list */}
      {loading ? (
        <div style={{ textAlign:'center', padding:40 }}><div className="spinner"/></div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <span className="icon">📝</span>
          <p>{t('noNotes', lang)}</p>
        </div>
      ) : (
        <div className="flex-col gap-8">
          {filtered.map(note => {
            const noteTypeKey = note.typeLang || note.type;
            return (
              <div key={note.id} className="card" style={{ padding:'14px 18px' }}>
                <div className="flex-between" style={{ flexWrap:'wrap', gap:8 }}>
                  <div className="flex-gap gap-12" style={{ flex:1 }}>
                    <div style={{ width:42, height:42, background:'var(--surface-2)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
                      {typeIcon(noteTypeKey)}
                    </div>
                    <div style={{ flex:1 }}>
                      <div className="flex-gap gap-8 mb-8">
                        <span className={`badge ${typeBadge(noteTypeKey)}`}>
                          {typeLabel(noteTypeKey, lang)}
                        </span>
                        <span style={{ fontSize:12, color:'var(--text-muted)' }}>
                          📅 {format(new Date(note.date), 'dd MMMM yyyy', { locale: dateLocale })}
                        </span>
                        <span style={{ fontSize:12, color:'var(--primary)', fontWeight:700 }}>
                          🌾 {landName(note.landId)}
                        </span>
                      </div>
                      <div style={{ fontWeight:700, fontSize:14 }}>{note.description}</div>
                      {note.amount && (
                        <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:3 }}>
                          {t('quantity', lang)}: {note.amount} {note.unit}
                        </div>
                      )}
                    </div>
                  </div>
                  <button className="btn btn-danger btn-sm btn-icon" onClick={() => del(note.id)}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}