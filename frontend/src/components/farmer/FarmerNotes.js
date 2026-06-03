import { t } from '../../i18n/translations';
import React, { useState, useEffect, useCallback } from 'react';
import { farmerAPI } from '../../api';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

const TYPES = ['رش','سماد','حرث','حصاد','زراعة','مبيد حشري','ري يدوي','صيانة','أخرى'];
const TYPE_ICONS = { 'رش':'💧','سماد':'🌱','حرث':'⚙️','حصاد':'🌾','زراعة':'🌿','مبيد حشري':'🧪','ري يدوي':'🚿','صيانة':'🔧','أخرى':'📋' };
const TYPE_BADGE = { 'رش':'badge-blue','سماد':'badge-green','حرث':'badge-amber','حصاد':'badge-lime','زراعة':'badge-green','مبيد حشري':'badge-red','ري يدوي':'badge-blue','صيانة':'badge-amber','أخرى':'badge-gray' };

export default function FarmerNotes({ farmer, lands, lang = "ar" }) {
  const [notes, setNotes]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterLand, setFilter] = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [form, setForm]         = useState({ landId: '', date: new Date().toISOString().split('T')[0], type: 'رش', description: '', amount: '', unit: 'لتر' });

  const fetch = useCallback(async () => {
    setLoading(true);
    try { const d = await farmerAPI.getNotes(); setNotes(d.notes || []); }
    catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const submit = async e => {
    e.preventDefault();
    if (!form.landId || !form.description) { setError('اختر الأرض وأدخل الوصف'); return; }
    setSaving(true); setError('');
    try {
      await farmerAPI.addNote(form);
      setForm({ landId: '', date: new Date().toISOString().split('T')[0], type: 'رش', description: '', amount: '', unit: 'لتر' });
      setShowForm(false); fetch();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const del = async id => {
    if (!window.confirm('حذف هذه الملاحظة؟')) return;
    await farmerAPI.deleteNote(id); fetch();
  };

  const landName = id => lands.find(l => l.id === id)?.name || '';
  const filtered = filterLand ? notes.filter(n => n.landId === filterLand) : notes;

  return (
    <div className="fade-in">
      <div className="card mb-16 flex-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2>📝 المفكرة الزراعية</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>سجل عملياتك وموادك الزراعية</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? '✕ إلغاء' : '+ تسجيل جديد'}
        </button>
      </div>

      {showForm && (
        <div className="card mb-16 fade-in-fast" style={{ border: '2px solid var(--primary)' }}>
          <h3 className="mb-16">📋 إضافة تسجيل</h3>
          <form onSubmit={submit}>
            <div className="grid-2">
              <div className="form-group">
                <label>الأرض *</label>
                <select value={form.landId} onChange={e => setForm({ ...form, landId: e.target.value })}>
                  <option value="">— اختر —</option>
                  {lands.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>التاريخ *</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>نوع العملية</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>الكمية</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="number" placeholder="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} style={{ flex: 1 }} />
                  <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} style={{ width: 90 }}>
                    {['لتر','كجم','طن','كيس','علبة','وحدة'].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="form-group">
              <label>الوصف / المادة *</label>
              <textarea placeholder="اكتب المادة أو وصف العملية..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner spinner-sm" /> : '💾 حفظ في الأرشيف'}
            </button>
          </form>
        </div>
      )}

      <div className="card mb-16">
        <select value={filterLand} onChange={e => setFilter(e.target.value)}>
          <option value="">جميع الأراضي ({notes.length})</option>
          {lands.map(l => <option key={l.id} value={l.id}>{l.name} ({notes.filter(n => n.landId === l.id).length})</option>)}
        </select>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div> : (
        filtered.length === 0 ? (
          <div className="card empty-state"><span className="icon">📝</span><p>لا توجد تسجيلات بعد</p></div>
        ) : (
          <div className="flex-col gap-8">
            {filtered.map(note => (
              <div key={note.id} className="card" style={{ padding: '14px 18px' }}>
                <div className="flex-between" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <div className="flex-gap gap-12" style={{ flex: 1 }}>
                    <div style={{ width: 42, height: 42, background: 'var(--surface-2)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                      {TYPE_ICONS[note.type] || '📋'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="flex-gap gap-8 mb-8">
                        <span className={`badge ${TYPE_BADGE[note.type] || 'badge-gray'}`}>{note.type}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>📅 {format(new Date(note.date), 'dd MMMM yyyy', { locale: ar })}</span>
                        <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 700 }}>🌾 {landName(note.landId)}</span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{note.description}</div>
                      {note.amount && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>الكمية: {note.amount} {note.unit}</div>}
                    </div>
                  </div>
                  <button className="btn btn-danger btn-sm btn-icon" onClick={() => del(note.id)}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
