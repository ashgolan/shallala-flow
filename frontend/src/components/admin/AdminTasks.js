import React, { useState, useEffect, useCallback } from 'react';
import { tasksAPI, privilegedAPI } from '../../api';
import { useLang } from '../../contexts/LangContext';

// ============================================================
//  AdminTasks.js — صفحة "المهام والاستفسارات"
//  تواصل بالاتجاهين بين المدير العام والمدراء المراقبين:
//  مراقب ← يرسل فقط للمدير العام (كيان جماعي)
//  أدمن  ← يرسل لمراقب محدد يختاره من قائمة
// ============================================================
const EMPTY_FORM = { message: '', imageUrl: '', imagePath: '', toUserId: '' };

export default function AdminTasks({ adminRole = 'admin', onChanged }) {
  const isAdmin = adminRole === 'admin';
  const { lang } = useLang();
  const ar = lang === 'ar';

  const [tasks, setTasks]     = useState([]);
  const [viewers, setViewers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState('');
  const [busyId, setBusyId]     = useState(null);

  const notifyChanged = () => { onChanged && onChanged(); };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const d = await tasksAPI.getAll();
      setTasks(d.tasks || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isAdmin) return;
    privilegedAPI.getAll()
      .then(d => setViewers((d.users || []).filter(u => u.role === 'viewer')))
      .catch(() => {});
  }, [isAdmin]);

  // ✅ نعرض الاسم الحقيقي المخزّن وقت الإرسال إن وُجد (صار متاحاً للأدمن أيضاً بعد ربط
  //    هوية حساب الأدمن بتسجيل الدخول)، وإلا نرجع لتسمية عامة حسب الدور — لتوافق أي
  //    طلبات قديمة أُنشئت قبل هذا التحديث (تسجيلات دخول قديمة بدون هوية أدمن بالتوكن)
  const roleLabel = (role, storedLabel) =>
    storedLabel || (role === 'admin' ? (ar ? 'المدير العام' : 'מנהל כללי') : (ar ? 'مراقب' : 'צופה'));

  // ✅ صلاحية التصرّف (تعليم/إعادة فتح) — تحقّق تقريبي بالفرونت، والباك إند يفرض الصلاحية الفعلية
  const canAct = task => isAdmin || task.toRole === 'viewer';

  const filtered = tasks.filter(t => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (dateFrom && new Date(t.createdAt) < new Date(dateFrom + 'T00:00:00')) return false;
    if (dateTo   && new Date(t.createdAt) > new Date(dateTo   + 'T23:59:59')) return false;
    if (search && search.trim()) {
      const q = search.trim();
      const hay = `${t.message} ${roleLabel(t.fromRole, t.fromLabel)} ${roleLabel(t.toRole, t.toLabel)}`;
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const pendingForMe = tasks.filter(t => t.status === 'open' && canAct(t)).length;

  const openForm = () => {
    setForm(EMPTY_FORM); setFormError(''); setShowForm(true);
  };

  const uploadImg = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setFormError('');
    try {
      const d = await tasksAPI.uploadImage(file);
      setForm(f => ({ ...f, imageUrl: d.url, imagePath: d.path }));
    } catch (e) { setFormError(e.message); }
    finally { setUploading(false); }
  };

  const removeImg = () => setForm(f => ({ ...f, imageUrl: '', imagePath: '' }));

  const submit = async e => {
    e.preventDefault();
    if (!form.message.trim()) {
      setFormError(ar ? 'نص الرسالة مطلوب' : 'טקסט ההודעה חובה');
      return;
    }
    if (isAdmin && !form.toUserId) {
      setFormError(ar ? 'يرجى اختيار المراقب المستلم' : 'יש לבחור צופה מקבל');
      return;
    }
    setSaving(true); setFormError('');
    try {
      await tasksAPI.create({
        message:   form.message.trim(),
        imageUrl:  form.imageUrl,
        imagePath: form.imagePath,
        ...(isAdmin ? { toUserId: form.toUserId } : {}),
      });
      setShowForm(false);
      setForm(EMPTY_FORM);
      await load();
      notifyChanged();
    } catch (e) { setFormError(e.message); }
    finally { setSaving(false); }
  };

  const markDone = async id => {
    setBusyId(id);
    try { await tasksAPI.markDone(id); await load(); notifyChanged(); }
    catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  };

  const reopen = async id => {
    setBusyId(id);
    try { await tasksAPI.reopen(id); await load(); notifyChanged(); }
    catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  };

  // ✅ numberingSystem: 'latn' يفرض أرقام إنجليزية عادية (0-9) بدل الأرقام الهندية-العربية
  //    التي يستخدمها متصفح Chrome افتراضياً مع لغة 'ar-SA' — ليطابق شكل باقي أرقام التطبيق
  const fmtDate = iso => new Date(iso).toLocaleString(ar ? 'ar-SA' : 'he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    numberingSystem: 'latn',
  });

  return (
    <div>
      {/* Header */}
      <div className="flex-between mb-20" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 className="mb-4">📨 {ar ? 'المهام والاستفسارات' : 'משימות ופניות'}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {ar
              ? (isAdmin ? 'الطلبات الواردة من المدراء المراقبين، وإرسال مهام لهم' : 'تواصل مباشر مع المدير العام')
              : (isAdmin ? 'פניות מהמפקחים, ושליחת משימות אליהם' : 'תקשורת ישירה עם המנהל הכללי')}
          </p>
        </div>
        <button className="btn btn-primary" onClick={openForm}>
          {ar ? '+ طلب / مهمة جديدة' : '+ משימה / פנייה חדשה'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex-gap gap-8 mb-16" style={{ flexWrap: 'wrap' }}>
        <input placeholder={`🔍 ${ar ? 'بحث بالاسم أو النص...' : 'חיפוש לפי שם או טקסט...'}`}
          value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 240 }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 150 }}>
          <option value="">{ar ? 'كل الحالات' : 'כל הסטטוסים'}</option>
          <option value="open">{ar ? '🟡 مفتوح' : '🟡 פתוח'}</option>
          <option value="done">{ar ? '✅ تم التنفيذ' : '✅ בוצע'}</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          title={ar ? 'من تاريخ' : 'מתאריך'} style={{ width: 150 }} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          title={ar ? 'إلى تاريخ' : 'עד תאריך'} style={{ width: 150 }} />
        {(search || statusFilter || dateFrom || dateTo) && (
          <button type="button" className="btn btn-outline btn-sm"
            onClick={() => { setSearch(''); setStatusFilter(''); setDateFrom(''); setDateTo(''); }}>
            ✕ {ar ? 'مسح الفلاتر' : 'נקה סינון'}
          </button>
        )}
      </div>

      {pendingForMe > 0 && (
        <div className="alert" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', marginBottom: 16 }}>
          🔔 {ar ? `لديك ${pendingForMe} طلب بانتظار المتابعة` : `יש לך ${pendingForMe} פניות ממתינות`}
        </div>
      )}

      {/* Compose form */}
      {showForm && (
        <div className="card mb-16 fade-in-fast" style={{ border: '2px solid var(--primary)' }}>
          <h3 className="mb-16">+ {ar ? 'طلب / مهمة جديدة' : 'משימה / פנייה חדשה'}</h3>
          <form onSubmit={submit}>
            {!isAdmin ? (
              <div className="form-group">
                <label>{ar ? 'المستلم' : 'נמען'}</label>
                <div style={{ padding: '9px 12px', background: 'var(--surface-2)', borderRadius: 8, fontWeight: 700, color: 'var(--primary)' }}>
                  👤 {ar ? 'المدير العام' : 'מנהל כללי'}
                </div>
              </div>
            ) : (
              <div className="form-group">
                <label>{ar ? 'المراقب المستلم *' : 'צופה מקבל *'}</label>
                <select value={form.toUserId} onChange={e => setForm({ ...form, toUserId: e.target.value })}>
                  <option value="">{ar ? '— اختر —' : '— בחר —'}</option>
                  {viewers.map(v => (
                    <option key={v.id} value={v.id}>{v.label || v.idNumber}</option>
                  ))}
                </select>
                {viewers.length === 0 && (
                  <small style={{ color: 'var(--text-muted)' }}>
                    {ar ? 'لا يوجد مراقبون مضافون بعد' : 'אין צופים עדיין'}
                  </small>
                )}
              </div>
            )}

            <div className="form-group">
              <label>{ar ? 'نص الرسالة *' : 'טקסט ההודעה *'}</label>
              <textarea rows={4} value={form.message}
                onChange={e => setForm({ ...form, message: e.target.value })}
                placeholder={ar
                  ? 'مثال: تم تغيير عداد المزارع أحمد في محطة 12، الرقم الجديد 4520...'
                  : 'לדוגמה: הוחלף מונה לחקלאי אחמד בעמדה 12, המספר החדש 4520...'} />
            </div>

            <div className="form-group">
              <label>{ar ? 'صورة مرفقة (اختياري)' : 'תמונה מצורפת (אופציונלי)'}</label>
              {!form.imageUrl ? (
                <label style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  padding: 14, border: '2px dashed var(--primary)', borderRadius: 12,
                  cursor: uploading ? 'not-allowed' : 'pointer', background: 'var(--surface-2)', opacity: uploading ? 0.6 : 1,
                }}>
                  <span style={{ fontSize: 22 }}>📷</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>
                    {uploading ? (ar ? 'جاري الرفع...' : 'מעלה...') : (ar ? 'إرفاق صورة' : 'צרף תמונה')}
                  </span>
                  <input type="file" accept="image/*" onChange={uploadImg} style={{ display: 'none' }} disabled={uploading} />
                </label>
              ) : (
                <div style={{ position: 'relative', width: 140 }}>
                  <img src={form.imageUrl} alt="" style={{ width: 140, height: 100, objectFit: 'cover', borderRadius: 10, border: '1.5px solid var(--border)' }} />
                  <button type="button" onClick={removeImg}
                    style={{ position: 'absolute', top: -8, left: -8, width: 24, height: 24, borderRadius: '50%', border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 900 }}>✕</button>
                </div>
              )}
            </div>

            {formError && <div className="alert alert-error mb-8">{formError}</div>}
            <div className="flex-gap gap-8">
              <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
                {saving ? (ar ? 'جاري الإرسال...' : 'שולח...') : `📤 ${ar ? 'إرسال' : 'שלח'}`}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>
                {ar ? 'إلغاء' : 'ביטול'}
              </button>
            </div>
          </form>
        </div>
      )}

      {error && <div className="alert alert-error mb-16">{error}</div>}

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><span className="icon">📨</span><p>{ar ? 'لا توجد طلبات مطابقة' : 'לא נמצאו פניות'}</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(t => {
            const open = t.status === 'open';
            const mine = !isAdmin && t.fromRole === 'viewer'; // مراقب نظر لطلب أرسله هو بنفسه
            return (
              <div key={t.id} className="card" style={{
                padding: 14, borderRight: `3px solid ${open ? '#f59e0b' : '#15803d'}`,
              }}>
                <div className="flex-between mb-8" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
                    {!isAdmin && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                        background: mine ? '#eff6ff' : '#f0fdf4', color: mine ? '#2563eb' : '#15803d',
                      }}>
                        {mine ? (ar ? '📤 مرسل مني' : '📤 נשלח על ידי') : (ar ? '📥 وارد لي' : '📥 התקבל')}
                      </span>
                    )}
                    <strong>{roleLabel(t.fromRole, t.fromLabel)}</strong>
                    <span style={{ color: 'var(--text-muted)' }}>←</span>
                    <strong>{roleLabel(t.toRole, t.toLabel)}</strong>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20,
                    background: open ? '#fffbeb' : '#f0fdf4', color: open ? '#92400e' : '#15803d',
                    border: `1px solid ${open ? '#fde68a' : '#bbf7d0'}`,
                  }}>
                    {open ? (ar ? '🟡 مفتوح' : '🟡 פתוח') : (ar ? '✅ تم التنفيذ' : '✅ בוצע')}
                  </span>
                </div>

                <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', marginBottom: t.imageUrl ? 10 : 6 }}>{t.message}</p>

                {t.imageUrl && (
                  <a href={t.imageUrl} target="_blank" rel="noreferrer">
                    <img src={t.imageUrl} alt="" style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8, border: '1.5px solid var(--border)', marginBottom: 8 }} />
                  </a>
                )}

                <div className="flex-between" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    🕒 {fmtDate(t.createdAt)}
                    {!open && t.doneAt && (
                      <span> · {ar ? 'أُنجز بواسطة' : 'בוצע על ידי'} {roleLabel(t.doneByRole, t.doneByLabel)} — {fmtDate(t.doneAt)}</span>
                    )}
                  </div>
                  {canAct(t) && (
                    open ? (
                      <button className="btn btn-primary btn-sm" disabled={busyId === t.id} onClick={() => markDone(t.id)}>
                        {busyId === t.id ? '⏳' : '✅'} {ar ? 'تم التنفيذ' : 'בוצע'}
                      </button>
                    ) : (
                      <button className="btn btn-outline btn-sm" disabled={busyId === t.id} onClick={() => reopen(t.id)}>
                        {busyId === t.id ? '⏳' : '↩️'} {ar ? 'إعادة فتح' : 'פתח מחדש'}
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}