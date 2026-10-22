import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLang } from '../contexts/LangContext';
import { readerAPI } from '../api';

// ════════════════════════════════════════════════════════════
//  صفحة إدخال القراءات (الناطور) — صفحة مستقلة للهاتف
//  ✅ الناطور بيدخل رقم الدورة المفتوحة فقط؛ أي رقم سابق للقراءة فقط
//     (القاعدة مفحوصة على السيرفر، الواجهة بس بتعكسها).
//  ✅ كل رقم بينحفظ على الهاتف أولاً (طابور) وبينبعت للسيرفر فوراً أو
//     لما يرجع الإنترنت — ما بتضيع قراءة بسبب التغطية.
//  ✅ embedded = داخل لوحة الإدارة (للمدير): بتظهر إعدادات الدورة فوق.
// ════════════════════════════════════════════════════════════

const QUEUE_KEY = 'shl_reader_queue';
const CACHE_KEY = 'shl_reader_cache';
const HIGH_FACTOR = 2;
const LOW_FACTOR  = 0.25;
const NEAR_M      = 60;   // مسافة اقتراح المحطة الأقرب
const GOOD_ACC_M  = 40;   // دقة موقع مقبولة للاقتراح
const SAVE_ACC_M  = 30;   // دقة موقع مقبولة لحفظ موقع محطة

const C = {
  primary: '#166534', primaryDark: '#14532d', primarySoft: '#dcfce7', primaryLine: '#bbf7d0',
  bg: '#f0fdf4', card: '#ffffff', text: '#052e16', muted: '#4b6b57', line: '#d7e6dc',
  grey: '#e5ebe7', greyText: '#3f4f46',
  okBg: '#e4f4ea', okLine: '#b7e0c6', ok: '#15803d', okText: '#14532d',
  warnBg: '#fff4df', warnLine: '#f0b44c', warn: '#b45309', warnText: '#7a4400', warnBtn: '#92400e',
  errBg: '#fdeceb', errLine: '#e8a29c', err: '#b42318', errText: '#7a1a12',
};

const STATUS_STYLE = {
  ok:        { bg: C.okBg,   line: C.okLine,   fg: C.okText,   chip: C.ok },
  high:      { bg: C.warnBg, line: C.warnLine, fg: C.warnText, chip: C.warnBtn },
  low:       { bg: C.warnBg, line: C.warnLine, fg: C.warnText, chip: C.warnBtn },
  zero:      { bg: C.warnBg, line: C.warnLine, fg: C.warnText, chip: C.warnBtn },
  decrease:  { bg: C.errBg,  line: C.errLine,  fg: C.errText,  chip: C.err },
  nohistory: { bg: '#eef2ef', line: C.line,    fg: C.greyText, chip: '#55655c' },
};
const WARN = ['high', 'low', 'zero', 'decrease'];
const SEG_COLOR = s => (s === 'decrease' ? '#d14b3f' : WARN.includes(s) ? '#e9a23b' : '#2e9b5c');

const L = {
  title:        { ar: 'إدخال القراءات', he: 'הזנת קריאות' },
  cycle:        { ar: 'دورة القراءة', he: 'מחזור קריאה' },
  period:       { ar: 'فترة', he: 'תקופה' },
  read:         { ar: 'تمت قراءة', he: 'נקראו' },
  of:           { ar: 'من', he: 'מתוך' },
  meters:       { ar: 'عداد', he: 'מונים' },
  left:         { ar: 'بقي', he: 'נותרו' },
  review:       { ar: 'للمراجعة', he: 'לבדיקה' },
  pending:      { ar: 'بانتظار الإرسال', he: 'ממתין לשליחה' },
  synced:       { ar: 'متزامن', he: 'מסונכרן' },
  offline:      { ar: 'بدون إنترنت', he: 'אין חיבור' },
  all:          { ar: 'الكل', he: 'הכל' },
  region:       { ar: 'منطقة', he: 'אזור' },
  station:      { ar: 'المحطة', he: 'עמדה' },
  nearYou:      { ar: 'أنت قرب المحطة', he: 'את/ה ליד עמדה' },
  away:         { ar: 'على بعد', he: 'במרחק' },
  m:            { ar: 'م', he: 'מ׳' },
  accuracy:     { ar: 'دقة الموقع', he: 'דיוק מיקום' },
  start:        { ar: 'ابدأ', he: 'התחל' },
  showDone:     { ar: 'إظهار المكتملة', he: 'הצג שהושלמו' },
  onlyReview:   { ar: 'للمراجعة فقط', he: 'לבדיקה בלבד' },
  done:         { ar: 'مكتملة', he: 'הושלמה' },
  meterN:       { ar: 'عداد', he: 'מונה' },
  previous:     { ar: 'السابقة', he: 'קודמת' },
  newReading:   { ar: 'القراءة الجديدة', he: 'קריאה חדשה' },
  cubic:        { ar: 'كوب', he: 'קוב' },
  expected:     { ar: 'المتوقع', he: 'צפוי' },
  lastYear:     { ar: 'نفس الفترة السنة الماضية', he: 'אותה תקופה אשתקד' },
  average:      { ar: 'معدل آخر الفترات', he: 'ממוצע תקופות אחרונות' },
  range:        { ar: 'المدى الطبيعي', he: 'טווח תקין' },
  saveNext:     { ar: 'حفظ والتالي', he: 'שמור והבא' },
  next:         { ar: 'التالي', he: 'הבא' },
  skip:         { ar: 'تخطٍّ', he: 'דלג' },
  note:         { ar: 'ملاحظة', he: 'הערה' },
  clear:        { ar: 'مسح', he: 'נקה' },
  back:         { ar: 'رجوع', he: 'חזרה' },
  locked:       { ar: 'هذه القراءة مسجّلة من المكتب — للقراءة فقط', he: 'קריאה זו נרשמה במשרד — לצפייה בלבד' },
  enteredByYou: { ar: 'أدخلتها بهذه الدورة — يمكنك تصحيحها', he: 'הוזנה במחזור זה — ניתן לתקן' },
  checkAgain:   { ar: 'تأكد من العداد مرة أخرى', he: 'בדוק/י את המונה שוב' },
  checkHint:    { ar: 'إذا كان الرقم صحيحاً سيُحفظ ويُعلَّم للمراجعة في المكتب.', he: 'אם המספר נכון הוא יישמר ויסומן לבדיקה במשרד.' },
  decreaseHint: { ar: 'القراءة أقل من السابقة. اختر السبب قبل الحفظ.', he: 'הקריאה נמוכה מהקודמת. בחר/י סיבה לפני השמירה.' },
  confirmSave:  { ar: 'الرقم صحيح · حفظ للمراجعة', he: 'המספר נכון · שמור לבדיקה' },
  editNumber:   { ar: 'تعديل الرقم', he: 'תיקון המספר' },
  higherBy:     { ar: 'أعلى من المتوقع بـ', he: 'גבוה מהצפוי פי' },
  lowerThan:    { ar: 'أقل بكثير من المتوقع', he: 'נמוך בהרבה מהצפוי' },
  zeroUse:      { ar: 'لا يوجد استهلاك', he: 'אין צריכה' },
  now:          { ar: 'الآن', he: 'עכשיו' },
  noCycle:      { ar: 'لا توجد دورة قراءة مفتوحة حالياً', he: 'אין מחזור קריאה פתוח כרגע' },
  noCycleHint:  { ar: 'المكتب يفتح الدورة عند موعد أخذ القراءات.', he: 'המשרד פותח את המחזור במועד הקריאות.' },
  loading:      { ar: 'جارٍ التحميل…', he: 'טוען…' },
  retry:        { ar: 'إعادة المحاولة', he: 'נסה שוב' },
  logout:       { ar: 'خروج', he: 'יציאה' },
  stationDone:  { ar: 'اكتملت المحطة', he: 'העמדה הושלמה' },
  saveLoc:      { ar: 'حفظ موقعي كموقع لهذه المحطة', he: 'שמור את מיקומי כמיקום העמדה' },
  locSaved:     { ar: 'تم حفظ موقع المحطة', he: 'מיקום העמדה נשמר' },
  locWeak:      { ar: 'دقة الموقع ضعيفة، انتظر قليلاً', he: 'דיוק המיקום חלש, המתן/י מעט' },
  rejected:     { ar: 'لم تُحفظ', he: 'לא נשמרה' },
  savedOffline: { ar: 'حُفظت على الهاتف — ستُرسل عند عودة الإنترنت', he: 'נשמרה בטלפון — תישלח כשיחזור החיבור' },
  cycleSettings:{ ar: 'إعدادات دورة القراءة', he: 'הגדרות מחזור קריאה' },
  year:         { ar: 'السنة', he: 'שנה' },
  phaseHint:    { ar: 'متل ف1/ف2 بجدول القراءات — الناطور بيدخل قراءة نهاية هالفترة', he: 'כמו ת1/ת2 בטבלת הקריאות — הקורא מזין את קריאת סוף התקופה' },
  yearStart:    { ar: 'بداية السنة', he: 'תחילת שנה' },
  pShort:       { ar: 'ف', he: 'ת' },
  excelCol:     { ar: 'بالإكسل: عمود', he: 'באקסל: עמודה' },
  newMeterStart:{ ar: 'بداية العداد الجديد', he: 'תחילת המונה החדש' },
  meterReplaced:{ ar: 'تم تبديل العداد بهذه الفترة', he: 'המונה הוחלף בתקופה זו' },
  oldMeterLast: { ar: 'آخر قراءة على القديم', he: 'קריאה אחרונה בישן' },
  oldMeterUse:  { ar: 'استهلاكه', he: 'צריכתו' },
  readNewMeter: { ar: 'اكتب الرقم الظاهر على العداد الجديد — الأكواب تشمل القديم + الجديد.', he: 'הזן את המספר שמופיע במונה החדש — הקוב כולל ישן + חדש.' },
  open:         { ar: 'مفتوحة للناطور', he: 'פתוח לקורא' },
  closed:       { ar: 'مغلقة', he: 'סגור' },
  save:         { ar: 'حفظ', he: 'שמור' },
  saved:        { ar: 'تم الحفظ', he: 'נשמר' },
  noMeters:     { ar: 'لا توجد عدادات هنا', he: 'אין מונים כאן' },
};

const REASONS = {
  high:     [['leak', 'تسرّب محتمل', 'נזילה אפשרית'], ['season', 'ري موسمي', 'השקיה עונתית'], ['broken', 'عداد معطل', 'מונה תקול'], ['other', 'أخرى', 'אחר']],
  low:      [['idle', 'أرض غير مزروعة', 'חלקה לא מעובדת'], ['stuck', 'عداد عالق', 'מונה תקוע'], ['other', 'أخرى', 'אחר']],
  zero:     [['idle', 'أرض غير مزروعة', 'חלקה לא מעובדת'], ['stuck', 'عداد عالق', 'מונה תקוע'], ['other', 'أخرى', 'אחר']],
  decrease: [['replaced', 'عداد مبدّل', 'מונה הוחלף'], ['prevError', 'خطأ بالقراءة السابقة', 'טעות בקריאה קודמת'], ['other', 'أخرى', 'אחר']],
};

const STATUS_LABEL = {
  ok:        ['طبيعي', 'תקין'],
  high:      ['مرتفع · راجع', 'גבוה · לבדיקה'],
  low:       ['منخفض · راجع', 'נמוך · לבדיקה'],
  zero:      ['صفر · راجع', 'אפס · לבדיקה'],
  decrease:  ['أقل من السابقة', 'נמוך מהקודמת'],
  nohistory: ['لا يوجد معدل', 'אין ממוצע'],
};

// ── helpers ─────────────────────────────────────────────────
const safeGet = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
const stationPrefix = s => ((s || '').match(/^[A-Za-z]+/)?.[0] || '?').toUpperCase();
const fmt = v => (v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }));
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const distM = (a, b) => {
  const R = 6371000, rad = x => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const calcConsumption = (m, value, cycle) => {
  if (value === null || m.prevValue === null || m.prevValue === undefined) return null;
  const mc = m.meterChangeApplies ? m.meterChange : null;
  const c = mc ? (mc.oldFinal - m.prevValue) + (value - mc.newInitial) : value - m.prevValue;
  return Math.round(c * 100) / 100;
};
// ✅ المرجع للمقارنة: بداية العداد الجديد إذا انبدّل العداد بنفس الفترة، وإلا القراءة السابقة
const refOf = m => (m.meterChangeApplies && m.meterChange ? m.meterChange.newInitial : m.prevValue);
const classify = (consumption, expected, belowRef = false) => {
  if (consumption === null) return 'nohistory';
  if (belowRef || consumption < 0) return 'decrease';
  if (!expected) return consumption === 0 ? 'zero' : 'nohistory';
  if (consumption === 0) return 'zero';
  if (consumption > expected * HIGH_FACTOR) return 'high';
  if (consumption < expected * LOW_FACTOR) return 'low';
  return 'ok';
};

// ── small UI pieces ─────────────────────────────────────────
const Num = ({ children, style }) => (
  <span style={{ direction: 'ltr', unicodeBidi: 'isolate', fontVariantNumeric: 'tabular-nums', ...style }}>{children}</span>
);

const Icon = ({ d, size = 20, sw = 2.2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.map((p, i) => <path key={i} d={p} />)}
  </svg>
);
const IC = {
  check: ['M5 12l4 4 10-10'],
  pin:   ['M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z', 'M12 8.2a1.8 1.8 0 1 0 0 3.6a1.8 1.8 0 1 0 0-3.6'],
  back:  ['M9 5l7 7-7 7'],
  fwd:   ['M15 5l-7 7 7 7'],
  chev:  ['M15 6l-6 6 6 6'],
  warn:  ['M12 3l10 18H2z', 'M12 10v5', 'M12 18v.5'],
  del:   ['M21 5H9l-6 7 6 7h12z', 'M17 9l-6 6', 'M11 9l6 6'],
  note:  ['M4 20h4L19 9l-4-4L4 16v4z'],
  skip:  ['M19 5l-7 7 7 7', 'M11 5l-7 7 7 7'],
  cloud: ['M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7z'],
  lock:  ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  out:   ['M15 4h4v16h-4', 'M10 8l-4 4 4 4', 'M6 12h10'],
};

const Ring = ({ pct, size = 104, stroke = 10, label }) => {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} role="img" aria-label={label} style={{ position: 'absolute', inset: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.grey} strokeWidth={stroke} />
        {pct > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.primary} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={`${(pct / 100) * circ} ${circ}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Num style={{ fontSize: size > 80 ? 26 : 13, fontWeight: 800 }}>{Math.round(pct)}%</Num>
      </div>
    </div>
  );
};

const pill = (bg, fg) => ({ fontSize: 13, fontWeight: 700, padding: '4px 10px', borderRadius: 12, background: bg, color: fg, display: 'inline-flex', alignItems: 'center', gap: 4 });
const btnReset = { fontFamily: 'inherit', cursor: 'pointer' };

// ════════════════════════════════════════════════════════════
// manageCycle = المدير الرئيسي فقط (المراقب-الناطور بيشوف صفحة الإدخال بدون إعدادات الدورة)
export default function ReaderPage({ onLogout, embedded = false, manageCycle = false }) {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const t = k => (L[k] ? L[k][ar ? 'ar' : 'he'] : k);

  const [data, setData]         = useState(() => safeGet(CACHE_KEY, null));
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadErr] = useState('');
  const [queue, setQueue]       = useState(() => safeGet(QUEUE_KEY, []));
  const [online, setOnline]     = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [toast, setToast]       = useState('');
  const [rejected, setRejected] = useState([]);

  const [region, setRegion]     = useState('');
  const [showDone, setShowDone] = useState(false);
  const [onlyReview, setOnlyReview] = useState(false);
  const [station, setStation]   = useState(null);   // stationNumber المفتوحة
  const [landId, setLandId]     = useState(null);   // العداد المفتوح
  const [input, setInput]       = useState('');
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason]     = useState('');
  const [note, setNote]         = useState('');
  const [showNote, setShowNote] = useState(false);
  const [pos, setPos]           = useState(null);   // { lat, lng, acc }

  const flushing = useRef(false);
  const toastTimer = useRef(null);

  const say = useCallback(msg => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }, []);

  // ── تحميل البيانات ────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setLoadErr('');
    try {
      const d = await readerAPI.getMeters();
      setData(d);
      safeSet(CACHE_KEY, d);
    } catch (e) {
      setLoadErr(e instanceof TypeError ? t('offline') : (e.message || 'Error'));
    } finally { setLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // ── حالة الإنترنت ────────────────────────────────────────
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ── GPS (فقط والصفحة مفتوحة) ─────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    const id = navigator.geolocation.watchPosition(
      p => setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const cycle  = data?.cycle || null;
  const meters = useMemo(() => {
    const base = data?.meters || [];
    if (!queue.length) return base;
    // ✅ نطبّق الإدخالات اللي لسا ما وصلت السيرفر على النسخة المحلية
    const byLand = new Map(queue.map(q => [q.landId, q]));
    return base.map(m => {
      const q = byLand.get(m.landId);
      if (!q) return m;
      const consumption = calcConsumption(m, q.value, cycle);
      return { ...m, currentValue: q.value, consumption, status: classify(consumption, m.expected, refOf(m) !== null && refOf(m) !== undefined && q.value < refOf(m)), byReader: true, editable: true, pending: true, reason: q.reason, note: q.note };
    });
  }, [data, queue, cycle]);

  const replaceMeter = useCallback(row => {
    if (!row) return;
    setData(prev => {
      if (!prev) return prev;
      const next = { ...prev, meters: prev.meters.map(m => (m.landId === row.landId ? row : m)) };
      safeSet(CACHE_KEY, next);
      return next;
    });
  }, []);

  // ── إرسال الطابور للسيرفر ────────────────────────────────
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      let q = safeGet(QUEUE_KEY, []);
      while (q.length) {
        const item = q[0];
        try {
          const res = await readerAPI.saveEntry(item);
          replaceMeter(res.meter);
        } catch (e) {
          if (e instanceof TypeError) break;           // لا يوجد إنترنت — نحاول لاحقاً
          setRejected(r => [...r, { ...item, error: e.message }]); // رفض من السيرفر (مقفلة/الدورة مغلقة)
        }
        q = safeGet(QUEUE_KEY, []).filter(x => x.clientId !== item.clientId);
        safeSet(QUEUE_KEY, q);
        setQueue(q);
      }
    } finally { flushing.current = false; }
  }, [replaceMeter]);

  useEffect(() => { if (online && queue.length) flush(); }, [online]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = setInterval(() => { if (safeGet(QUEUE_KEY, []).length) flush(); }, 30000);
    return () => clearInterval(id);
  }, [flush]);

  // ── تجميع المحطات ────────────────────────────────────────
  const stations = useMemo(() => {
    const map = new Map();
    for (const m of meters) {
      if (!map.has(m.stationNumber)) map.set(m.stationNumber, { code: m.stationNumber, prefix: stationPrefix(m.stationNumber), regionId: m.regionId, lat: null, lng: null, meters: [] });
      const s = map.get(m.stationNumber);
      s.meters.push(m);
      if (s.lat === null && m.lat !== null && m.lng !== null) { s.lat = m.lat; s.lng = m.lng; }
    }
    return [...map.values()].map(s => {
      const done = s.meters.filter(m => m.currentValue !== null).length;
      const review = s.meters.filter(m => m.currentValue !== null && WARN.includes(m.status)).length;
      const dist = pos && s.lat !== null ? Math.round(distM(pos, s)) : null;
      return { ...s, done, review, total: s.meters.length, dist };
    });
  }, [meters, pos]);

  const totals = useMemo(() => {
    const total = meters.length;
    const done = meters.filter(m => m.currentValue !== null).length;
    const review = meters.filter(m => m.currentValue !== null && WARN.includes(m.status)).length;
    return { total, done, review, left: total - done, pct: total ? (done / total) * 100 : 0 };
  }, [meters]);

  const regions = useMemo(() => {
    const map = new Map();
    for (const s of stations) {
      if (!map.has(s.prefix)) map.set(s.prefix, { key: s.prefix, done: 0, total: 0 });
      const r = map.get(s.prefix); r.done += s.done; r.total += s.total;
    }
    return [...map.values()];
  }, [stations]);

  const nearest = useMemo(() => {
    if (!pos || pos.acc > GOOD_ACC_M) return null;
    const near = stations.filter(s => s.dist !== null && s.dist <= NEAR_M && s.done < s.total).sort((a, b) => a.dist - b.dist);
    if (!near.length) return null;
    // ✅ محطتين قريبات كتير من بعض — ما منختار تلقائياً
    if (near[1] && near[1].dist - near[0].dist < 10) return null;
    return near[0];
  }, [stations, pos]);

  const visibleStations = useMemo(() => stations.filter(s => {
    if (region && s.prefix !== region) return false;
    if (onlyReview) return s.review > 0;
    if (!showDone && s.done === s.total) return false;
    return true;
  }), [stations, region, showDone, onlyReview]);

  const curStation = station ? stations.find(s => s.code === station) : null;
  const curMeter   = curStation && landId ? curStation.meters.find(m => m.landId === landId) : null;

  // ── التنقل ───────────────────────────────────────────────
  const resetEntry = (m) => {
    setInput(m && m.currentValue !== null && m.editable ? String(m.currentValue) : '');
    setConfirming(false); setReason(m?.reason || ''); setNote(m?.note || ''); setShowNote(!!m?.note);
  };
  const openStation = code => {
    const s = stations.find(x => x.code === code);
    if (!s) return;
    const first = s.meters.find(m => m.currentValue === null) || s.meters[0];
    setStation(code); setLandId(first.landId); resetEntry(first);
    window.scrollTo?.(0, 0);
  };
  const openMeter = m => { setLandId(m.landId); resetEntry(m); };
  const backToStations = () => { setStation(null); setLandId(null); setConfirming(false); };

  const goNext = (justSavedId) => {
    if (!curStation) return;
    const list = curStation.meters;
    const i = list.findIndex(m => m.landId === landId);
    const after = [...list.slice(i + 1), ...list.slice(0, i)]
      .find(m => m.currentValue === null && m.landId !== justSavedId);
    if (after) { openMeter(after); return; }
    say(`${t('stationDone')} ${curStation.code}`);
    backToStations();
  };

  // ── الإدخال ──────────────────────────────────────────────
  const value = input === '' ? null : Number(input);
  // ✅ الفحص الكامل (يُستخدم عند الحفظ دائماً)
  const fullConsumption = curMeter ? calcConsumption(curMeter, value, cycle) : null;
  const refValue = curMeter ? refOf(curMeter) : null;
  const fullStatus = curMeter && value !== null
    ? classify(fullConsumption, curMeter.expected, refValue !== null && refValue !== undefined && value < refValue) : null;
  // ✅ أثناء الكتابة: ما منحكم على الرقم قبل ما يوصل لعدد خانات القراءة السابقة
  //    (أول رقم أو رقمين دايماً "أقل من السابقة" — كان يظهر تنبيه أحمر غلط)
  //    (بعد تبديل العداد: عدد خانات بداية العداد الجديد، مش القديم)
  const prevDigits = refValue !== null && refValue !== undefined
    ? String(Math.trunc(Math.abs(refValue))).length : 0;
  const typingIncomplete = value !== null && input.length < prevDigits;
  const liveConsumption = typingIncomplete ? null : fullConsumption;
  const liveStatus = typingIncomplete ? null : fullStatus;

  const press = k => {
    if (!curMeter?.editable) return;
    setConfirming(false);
    if (k === 'clear') { setInput(''); return; }
    if (k === 'del') { setInput(v => v.slice(0, -1)); return; }
    setInput(v => (v.length >= 9 ? v : (v === '0' ? k : v + k)));
  };

  const doSave = () => {
    if (!curMeter || value === null || !curMeter.editable || !cycle?.open) return;
    if (WARN.includes(fullStatus) && !confirming) { setConfirming(true); setReason(''); return; }
    if (fullStatus === 'decrease' && !reason) return;
    const item = { clientId: uid(), landId: curMeter.landId, value, reason: WARN.includes(fullStatus) ? reason : '', note: note.trim(), at: Date.now() };
    const q = [...safeGet(QUEUE_KEY, []).filter(x => x.landId !== item.landId), item];
    safeSet(QUEUE_KEY, q);
    setQueue(q);
    if (!navigator.onLine) say(t('savedOffline'));
    flush();
    goNext(curMeter.landId);
  };

  const saveStationLocation = async () => {
    if (!curStation || !pos) return;
    if (pos.acc > SAVE_ACC_M) { say(t('locWeak')); return; }
    try {
      await readerAPI.saveLocation(curStation.code, { lat: pos.lat, lng: pos.lng, accuracy: pos.acc });
      setData(prev => {
        if (!prev) return prev;
        const next = { ...prev, meters: prev.meters.map(m => (m.stationNumber === curStation.code && m.lat === null ? { ...m, lat: pos.lat, lng: pos.lng } : m)) };
        safeSet(CACHE_KEY, next);
        return next;
      });
      say(t('locSaved'));
    } catch (e) { say(e.message); }
  };

  // ════════════════════════════════════════════════════════
  //  الواجهة
  // ════════════════════════════════════════════════════════
  const wrap = {
    maxWidth: 480, margin: '0 auto', minHeight: embedded ? 0 : '100dvh', background: C.bg, color: C.text,
    display: 'flex', flexDirection: 'column', position: 'relative',
    borderRadius: embedded ? 18 : 0, overflow: embedded ? 'hidden' : 'visible',
    border: embedded ? `1px solid ${C.line}` : 'none',
  };

  const syncChip = (
    <span style={pill(queue.length ? C.warnBg : online ? C.okBg : '#eef2ef', queue.length ? C.warnText : online ? C.okText : C.greyText)}>
      <Icon d={queue.length ? IC.cloud : IC.check} size={15} sw={2.4} />
      {queue.length ? <>{t('pending')} <Num>{queue.length}</Num></> : online ? t('synced') : t('offline')}
    </span>
  );

  const toastEl = toast && (
    <div role="status" style={{ position: embedded ? 'absolute' : 'fixed', left: 16, right: 16, bottom: 96, zIndex: 50, maxWidth: 448, margin: '0 auto', background: C.text, color: '#fff', padding: '12px 16px', borderRadius: 14, fontSize: 15, fontWeight: 700, textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
      {toast}
    </div>
  );

  const rejectedEl = rejected.length > 0 && (
    <div style={{ margin: '10px 16px 0', background: C.errBg, border: `1px solid ${C.errLine}`, borderRadius: 14, padding: '10px 14px', color: C.errText, fontSize: 14 }}>
      {rejected.map(r => {
        const m = (data?.meters || []).find(x => x.landId === r.landId);
        return <div key={r.clientId}><b>{t('rejected')}:</b> <Num>{m?.stationNumber}</Num> · <Num>{r.value}</Num> — {r.error}</div>;
      })}
      <button type="button" onClick={() => setRejected([])} style={{ ...btnReset, marginTop: 6, background: 'none', border: 0, color: C.err, fontWeight: 700, padding: 0 }}>✕</button>
    </div>
  );

  // ── إعدادات الدورة (للمدير داخل لوحة الإدارة) ─────────────
  const cyclePanel = embedded && manageCycle && <CyclePanel cycle={cycle} t={t} onSaved={load} />;

  // ── تحميل / خطأ / لا توجد دورة ───────────────────────────
  if (!data && loading) {
    return <div style={wrap}>{cyclePanel}<div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 17 }}>{t('loading')}</div></div>;
  }
  if (!data && loadError) {
    return (
      <div style={wrap}>{cyclePanel}
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ color: C.err, fontWeight: 700, marginBottom: 14 }}>{loadError}</div>
          <button type="button" className="btn btn-primary" onClick={load}>{t('retry')}</button>
        </div>
      </div>
    );
  }

  const header = !embedded && (
    <div style={{ padding: '18px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: C.muted }}>
          {cycle?.year ? <>{t('cycle')} · <Num>{cycle.year}</Num> · {cycle.phase === 0 ? t('yearStart') : <>{t('period')} <Num>{cycle.phase}</Num></>}</> : t('title')}
        </div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, lineHeight: 1.2 }}>{t('title')}</h1>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {syncChip}
        {onLogout && (
          <button type="button" onClick={onLogout} aria-label={t('logout')} title={t('logout')}
            style={{ ...btnReset, width: 44, height: 44, borderRadius: 22, border: `1px solid ${C.line}`, background: C.card, color: C.greyText, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon d={IC.out} size={20} />
          </button>
        )}
      </div>
    </div>
  );

  if (!cycle?.open) {
    return (
      <div style={wrap}>
        {cyclePanel}{header}
        <div style={{ margin: 16, background: C.card, border: `1px solid ${C.line}`, borderRadius: 20, padding: '32px 20px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, background: C.grey, color: C.greyText, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><Icon d={IC.lock} size={26} /></div>
          <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>{t('noCycle')}</div>
          <div style={{ fontSize: 15, color: C.muted, marginBottom: 16 }}>{t('noCycleHint')}</div>
          <button type="button" className="btn btn-outline" onClick={load}>{t('retry')}</button>
        </div>
        {toastEl}
      </div>
    );
  }

  // ════════════════ شاشة العداد ════════════════
  if (curStation && curMeter) {
    const idxInStation = curStation.meters.findIndex(m => m.landId === curMeter.landId);
    // ✅ أثناء التنبيه نعرض الفحص الكامل، وأثناء الكتابة ما منحكم قبل ما يكتمل الرقم
    const dispStatus = confirming ? fullStatus : liveStatus;
    const dispCons   = confirming ? fullConsumption : liveConsumption;
    const st = value !== null ? dispStatus : (curMeter.currentValue !== null ? curMeter.status : null);
    const ss = STATUS_STYLE[st] || null;
    const shownCons = value !== null ? dispCons : curMeter.consumption;
    const name = ar ? curMeter.farmerName : (curMeter.farmerNameHeb || curMeter.farmerName);
    const sub = curMeter.description || curMeter.landName;
    const exp = curMeter.expected;
    const needReason = confirming && fullStatus === 'decrease' && !reason;
    const reasons = REASONS[fullStatus] || [];
    const stationNoLoc = curStation.lat === null;

    return (
      <div style={wrap}>
        {/* رأس */}
        <div style={{ padding: '14px 12px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={backToStations} aria-label={t('back')}
            style={{ ...btnReset, width: 44, height: 44, borderRadius: 22, background: C.card, border: `1px solid ${C.line}`, color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <Icon d={IC.back} size={22} />
          </button>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{t('station')} <Num>{curStation.code}</Num></div>
            <div style={{ fontSize: 13, color: C.muted }}>
              {t('meterN')} <Num>{idxInStation + 1}</Num> {t('of')} <Num>{curStation.total}</Num> · {t('region')} <Num>{curStation.prefix}</Num>
            </div>
          </div>
          {curStation.dist !== null
            ? <span style={{ ...pill(C.primarySoft, C.primary), height: 32, flex: 'none' }}><Icon d={IC.pin} size={15} /><Num>{curStation.dist}</Num> {t('m')}</span>
            : <span style={{ width: 44, flex: 'none' }} />}
        </div>

        {/* عدادات المحطة كنقاط للتنقل */}
        {curStation.total > 1 && (
          <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {curStation.meters.map((m, i) => {
              const active = m.landId === curMeter.landId;
              const filled = m.currentValue !== null;
              return (
                <button key={m.landId} type="button" onClick={() => openMeter(m)} aria-label={`${t('meterN')} ${i + 1}`}
                  style={{ ...btnReset, minWidth: 40, height: 32, borderRadius: 16, fontSize: 14, fontWeight: 800,
                    border: active ? `2px solid ${C.primary}` : `1px solid ${C.line}`,
                    background: filled ? SEG_COLOR(m.status) : C.card, color: filled ? '#fff' : C.greyText }}>
                  <Num>{i + 1}</Num>
                </button>
              );
            })}
          </div>
        )}

        <div style={{ margin: '0 16px', height: 6, borderRadius: 3, background: C.grey, overflow: 'hidden' }}>
          <div style={{ width: `${totals.pct}%`, height: '100%', background: C.primary }} />
        </div>

        {/* المزارع */}
        <div style={{ padding: '12px 20px 8px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 21, fontWeight: 800, minWidth: 0 }}>{name || '—'}</div>
          {sub && <div style={{ fontSize: 14, color: C.muted, textAlign: 'left', flex: 'none', maxWidth: '45%' }}>{sub}</div>}
        </div>

        {/* السابقة + الجديدة */}
        <div style={{ margin: '0 16px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <div style={{ background: '#e9efeb', borderRadius: 16, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {curMeter.meterChangeApplies ? (
              <>
                <div style={{ fontSize: 13, color: C.muted }}>{t('newMeterStart')}</div>
                <Num style={{ fontSize: 34, fontWeight: 800, color: C.greyText, textAlign: 'right' }}>{fmt(curMeter.meterChange.newInitial)}</Num>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, color: C.muted }}>
                  {t('previous')}{curMeter.prevYear ? <> · <Num>{curMeter.prevYear}</Num> · {curMeter.prevSlot === 0 ? t('yearStart') : <>{t('pShort')}<Num>{curMeter.prevSlot}</Num></>}</> : ''}
                </div>
                <Num style={{ fontSize: 34, fontWeight: 800, color: C.greyText, textAlign: 'right' }}>{fmt(curMeter.prevValue)}</Num>
              </>
            )}
          </div>
          <label style={{ background: C.card, border: `3px solid ${!curMeter.editable ? C.line : ss && confirming ? ss.line : C.primary}`, borderRadius: 16, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, cursor: 'text' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: curMeter.editable ? C.primary : C.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
              {!curMeter.editable && <Icon d={IC.lock} size={14} />}{t('newReading')}
            </span>
            <input
              value={curMeter.editable ? input : fmt(curMeter.currentValue)}
              readOnly={!curMeter.editable}
              inputMode="none"
              autoComplete="off"
              aria-label={t('newReading')}
              onChange={e => { setConfirming(false); setInput(e.target.value.replace(/[^\d]/g, '').slice(0, 9)); }}
              onKeyDown={e => { if (e.key === 'Enter') doSave(); }}
              style={{ border: 0, outline: 0, padding: 0, background: 'transparent', fontSize: 34, fontWeight: 800, color: C.text, width: '100%', textAlign: 'right', direction: 'ltr', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' }}
            />
          </label>
        </div>

        {/* ✅ تبديل عداد بنفس الفترة */}
        {curMeter.meterChangeApplies && (
          <div style={{ margin: '10px 16px 0', background: '#f3e8ff', border: '1px solid #d8b4fe', borderRadius: 14, padding: '10px 14px', color: '#5b21b6', fontSize: 14, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 800 }}>🔄 {t('meterReplaced')}</div>
            <div>
              {t('oldMeterLast')} <Num style={{ fontWeight: 700 }}>{fmt(curMeter.meterChange.oldFinal)}</Num>
              {' · '}{t('oldMeterUse')} <Num style={{ fontWeight: 700 }}>{fmt(curMeter.oldMeterPart)}</Num> {t('cubic')}
            </div>
            <div>{t('readNewMeter')}</div>
          </div>
        )}

        {/* الأكواب + فحص المنطقية */}
        {(shownCons !== null || st) && (
          <div style={{ margin: '10px 16px 0', background: ss?.bg || '#eef2ef', border: `${confirming ? 2 : 1}px solid ${ss?.line || C.line}`, borderRadius: 18, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, color: ss?.fg || C.greyText, minWidth: 0 }}>
                <Num style={{ fontSize: fmt(shownCons).length > 7 ? 36 : fmt(shownCons).length > 5 ? 42 : 50, fontWeight: 900, lineHeight: 1 }}>{fmt(shownCons)}</Num>
                <span style={{ fontSize: 18, fontWeight: 700 }}>{t('cubic')}</span>
              </div>
              {st && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 17, background: ss.chip, color: '#fff', fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap', maxWidth: '100%' }}>
                  <Icon d={st === 'ok' ? IC.check : IC.warn} size={17} sw={2.6} />
                  {STATUS_LABEL[st][ar ? 0 : 1]}
                </span>
              )}
            </div>
            {exp ? (
              WARN.includes(st) ? (
                <>
                  <div style={{ fontSize: 15, fontWeight: 700, color: ss.fg }}>
                    {st === 'high' && <>{t('higherBy')} <Num>×{(shownCons / exp).toFixed(1)}</Num> · </>}
                    {st === 'low' && <>{t('lowerThan')} · </>}
                    {st === 'zero' && <>{t('zeroUse')} · </>}
                    {t('expected')} <Num>{fmt(exp)}</Num> {t('cubic')}
                  </div>
                  <HistoryBars history={curMeter.history} current={shownCons} t={t} />
                </>
              ) : (
                <RangeBar consumption={shownCons} expected={exp} t={t} basis={curMeter.expectedBasis} />
              )
            ) : null}
          </div>
        )}

        {/* حالة القفل / تصحيح */}
        {!curMeter.editable && (
          <div style={{ margin: '10px 16px 0', display: 'flex', alignItems: 'center', gap: 8, background: '#eef2ef', borderRadius: 14, padding: '12px 14px', fontSize: 15, fontWeight: 700, color: C.greyText }}>
            <Icon d={IC.lock} size={18} />{t('locked')}
          </div>
        )}
        {curMeter.editable && curMeter.byReader && !confirming && (
          <div style={{ margin: '8px 16px 0', fontSize: 13, color: C.muted, textAlign: 'center' }}>
            {curMeter.pending ? t('pending') : t('enteredByYou')}
          </div>
        )}

        {/* تنبيه + سبب */}
        {confirming && curMeter.editable && (
          <div style={{ margin: '10px 16px 0', background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{t('checkAgain')}</div>
              <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.5 }}>{fullStatus === 'decrease' ? t('decreaseHint') : t('checkHint')}</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {reasons.map(([k, a, h]) => (
                <button key={k} type="button" aria-pressed={reason === k} onClick={() => setReason(r => (r === k ? '' : k))}
                  style={{ ...btnReset, height: 44, padding: '0 14px', borderRadius: 22, fontSize: 15, fontWeight: 700,
                    border: reason === k ? `2px solid ${ss.chip}` : `1px solid ${C.line}`,
                    background: reason === k ? ss.bg : C.card, color: reason === k ? ss.fg : C.greyText }}>
                  {ar ? a : h}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ملاحظة */}
        {curMeter.editable && showNote && (
          <div style={{ margin: '10px 16px 0' }}>
            <textarea value={note} onChange={e => setNote(e.target.value.slice(0, 300))} rows={2} placeholder={t('note')}
              style={{ width: '100%', boxSizing: 'border-box', borderRadius: 12, border: `1px solid ${C.line}`, padding: 10, fontSize: 16, fontFamily: 'inherit', resize: 'vertical' }} />
          </div>
        )}

        {/* أزرار صغيرة */}
        {!confirming && <div style={{ margin: '10px 16px 0', display: 'grid', gridTemplateColumns: stationNoLoc ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {curMeter.editable && (
            <button type="button" onClick={() => setShowNote(v => !v)} style={{ ...btnReset, height: 44, borderRadius: 12, border: `1px solid ${C.line}`, background: showNote ? C.primarySoft : C.card, color: C.greyText, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icon d={IC.note} size={18} sw={2} />{t('note')}
            </button>
          )}
          <button type="button" onClick={() => goNext(null)} style={{ ...btnReset, height: 44, borderRadius: 12, border: `1px solid ${C.line}`, background: C.card, color: C.greyText, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, gridColumn: curMeter.editable ? 'auto' : 'span 2' }}>
            <Icon d={IC.skip} size={18} sw={2} />{curMeter.editable ? t('skip') : t('next')}
          </button>
          {stationNoLoc && (
            <button type="button" onClick={saveStationLocation} disabled={!pos} title={t('saveLoc')} aria-label={t('saveLoc')}
              style={{ ...btnReset, height: 44, borderRadius: 12, border: `1px dashed ${C.primary}`, background: C.card, color: C.primary, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pos ? 1 : 0.5 }}>
              <Icon d={IC.pin} size={18} sw={2} />{pos ? <>±<Num>{pos.acc}</Num>{t('m')}</> : '—'}
            </button>
          )}
        </div>}

        {/* لوحة الأرقام */}
        {curMeter.editable && !confirming && (
          <div style={{ margin: '12px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, direction: 'ltr' }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'del'].map(k => (
              <button key={k} type="button" onClick={() => press(k)} aria-label={k === 'del' ? '⌫' : k === 'clear' ? t('clear') : k}
                style={{ ...btnReset, height: 56, borderRadius: 12, border: 0,
                  background: k === 'clear' || k === 'del' ? '#e3ebe6' : C.card,
                  color: C.text, fontSize: k === 'clear' ? 16 : 28, fontWeight: 800,
                  boxShadow: k === 'clear' || k === 'del' ? 'none' : `0 1px 0 ${C.line}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {k === 'del' ? <Icon d={IC.del} size={26} sw={2} /> : k === 'clear' ? t('clear') : k}
              </button>
            ))}
          </div>
        )}

        {/* زر الحفظ */}
        <div style={{ marginTop: 'auto', padding: '14px 16px 20px', position: 'sticky', bottom: 0, background: C.bg, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {curMeter.editable ? (
            confirming ? (
              <>
                <button type="button" onClick={doSave} disabled={needReason}
                  style={{ ...btnReset, height: 58, borderRadius: 16, border: 0, background: fullStatus === 'decrease' ? C.err : C.warnBtn, color: '#fff', fontSize: 18, fontWeight: 800, opacity: needReason ? 0.5 : 1 }}>
                  {t('confirmSave')}
                </button>
                <button type="button" onClick={() => setConfirming(false)}
                  style={{ ...btnReset, height: 52, borderRadius: 16, border: `2px solid ${C.primary}`, background: C.card, color: C.primary, fontSize: 17, fontWeight: 800 }}>
                  {t('editNumber')}
                </button>
              </>
            ) : (
              <button type="button" onClick={doSave} disabled={value === null}
                style={{ ...btnReset, height: 60, borderRadius: 16, border: 0, background: C.primary, color: '#fff', fontSize: 19, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: value === null ? 0.5 : 1 }}>
                {t('saveNext')}<Icon d={IC.fwd} size={22} sw={2.4} />
              </button>
            )
          ) : (
            <button type="button" onClick={() => goNext(null)}
              style={{ ...btnReset, height: 60, borderRadius: 16, border: 0, background: C.primary, color: '#fff', fontSize: 19, fontWeight: 800 }}>
              {t('next')}
            </button>
          )}
        </div>
        {toastEl}
      </div>
    );
  }

  // ════════════════ شاشة المحطات ════════════════
  return (
    <div style={wrap}>
      {cyclePanel}
      {header}
      {embedded && <div style={{ padding: '12px 16px 0', display: 'flex', justifyContent: 'flex-end' }}>{syncChip}</div>}

      {/* التقدم */}
      <div style={{ margin: '8px 16px 0', background: C.card, borderRadius: 20, padding: 18, display: 'flex', alignItems: 'center', gap: 18, border: `1px solid ${C.line}` }}>
        <Ring pct={totals.pct} label={`${Math.round(totals.pct)}%`} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ fontSize: 14, color: C.muted }}>{t('read')}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <Num style={{ fontSize: 38, fontWeight: 900, lineHeight: 1 }}>{totals.done}</Num>
            <span style={{ fontSize: 16, color: C.muted }}>{t('of')} <Num>{totals.total}</Num> {t('meters')}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={pill('#eef2ef', C.greyText)}>{t('left')} <Num>{totals.left}</Num></span>
            {totals.review > 0 && (
              <button type="button" onClick={() => setOnlyReview(v => !v)} aria-pressed={onlyReview}
                style={{ ...btnReset, ...pill(C.warnBg, C.warnText), border: onlyReview ? `2px solid ${C.warnBtn}` : '2px solid transparent' }}>
                <Num>{totals.review}</Num> {t('review')}
              </button>
            )}
          </div>
        </div>
      </div>

      {rejectedEl}

      {/* المحطة الأقرب */}
      {nearest && (
        <div style={{ margin: '12px 16px 0', background: C.primarySoft, border: `1px solid ${C.primaryLine}`, borderRadius: 16, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: C.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon d={IC.pin} size={22} sw={2} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{t('nearYou')} <Num>{nearest.code}</Num></div>
            <div style={{ fontSize: 13, color: C.muted }}>{t('away')} <Num>{nearest.dist}</Num> {t('m')} · {t('accuracy')} <Num>{pos.acc}</Num> {t('m')}</div>
          </div>
          <button type="button" onClick={() => openStation(nearest.code)}
            style={{ ...btnReset, flex: 'none', height: 44, padding: '0 18px', borderRadius: 12, border: 0, background: C.primary, color: '#fff', fontSize: 16, fontWeight: 800 }}>
            {t('start')}
          </button>
        </div>
      )}

      {/* المناطق */}
      <div style={{ padding: '14px 16px 6px', display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {[{ key: '', done: totals.done, total: totals.total }, ...regions].map(r => {
          const active = region === r.key;
          const complete = r.total > 0 && r.done === r.total;
          return (
            <button key={r.key || 'all'} type="button" onClick={() => setRegion(r.key)} aria-pressed={active}
              style={{ ...btnReset, flex: 'none', height: 42, padding: '0 14px', borderRadius: 21, fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6,
                border: active ? 0 : `1px solid ${complete ? C.okLine : C.line}`,
                background: active ? C.primary : complete ? C.okBg : C.card,
                color: active ? '#fff' : complete ? C.okText : C.greyText }}>
              {r.key ? <Num>{r.key}</Num> : t('all')}
              {complete && !active ? <Icon d={IC.check} size={14} sw={3} /> : <Num style={{ fontSize: 12, opacity: 0.85 }}>{r.done}/{r.total}</Num>}
            </button>
          );
        })}
      </div>

      <div style={{ padding: '2px 16px 8px', display: 'flex', justifyContent: 'flex-end' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: C.muted, cursor: 'pointer', minHeight: 32 }}>
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} style={{ width: 18, height: 18 }} />
          {t('showDone')}
        </label>
      </div>

      {/* المحطات */}
      <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visibleStations.length === 0 && (
          <div style={{ textAlign: 'center', color: C.muted, padding: 24 }}>{t('noMeters')}</div>
        )}
        {visibleStations.map(s => {
          const complete = s.done === s.total;
          const isNear = nearest && nearest.code === s.code;
          return (
            <button key={s.code} type="button" onClick={() => openStation(s.code)}
              style={{ ...btnReset, textAlign: 'inherit', background: C.card, border: isNear ? `2px solid ${C.primary}` : `1px solid ${C.line}`, borderRadius: 16, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, color: C.text, width: '100%' }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: complete ? C.okBg : isNear ? C.primarySoft : '#eef2ef', color: complete ? C.ok : C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, fontWeight: 900, flex: 'none' }}>
                <Num>{s.code}</Num>
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}><Num>{s.total}</Num> {t('meters')}</span>
                  {complete
                    ? <span style={pill(C.okBg, C.okText)}><Icon d={IC.check} size={14} sw={3} />{t('done')}</span>
                    : s.dist !== null && <span style={pill(isNear ? C.primarySoft : '#eef2ef', isNear ? C.primary : C.greyText)}><Num>{s.dist}</Num> {t('m')}</span>}
                </div>
                <div style={{ height: 8, display: 'flex', gap: 3 }}>
                  {s.meters.map(m => (
                    <div key={m.landId} style={{ flex: 1, borderRadius: 4, background: m.currentValue !== null ? SEG_COLOR(m.status) : C.grey }} />
                  ))}
                </div>
                <div style={{ fontSize: 13, color: C.muted }}>
                  <Num>{s.done} / {s.total}</Num>
                  {s.review > 0 && <> · <span style={{ color: C.warnText, fontWeight: 700 }}><Num>{s.review}</Num> {t('review')}</span></>}
                </div>
              </div>
              <span style={{ color: '#7a8a80' }}><Icon d={IC.chev} size={20} /></span>
            </button>
          );
        })}
      </div>
      {toastEl}
    </div>
  );
}

// ── مقياس المدى الطبيعي ─────────────────────────────────────
function RangeBar({ consumption, expected, t, basis }) {
  const max = expected * 3;
  const pct = v => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ position: 'relative', height: 14, direction: 'ltr' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 5, height: 4, borderRadius: 2, background: '#c9dccf' }} />
        <div style={{ position: 'absolute', left: pct(expected * LOW_FACTOR), width: `calc(${pct(expected * HIGH_FACTOR)} - ${pct(expected * LOW_FACTOR)})`, top: 3, height: 8, borderRadius: 4, background: '#9fd0b3' }} />
        <div style={{ position: 'absolute', left: pct(expected), top: 0, width: 2, height: 14, background: C.okText }} />
        {consumption !== null && consumption >= 0 && (
          <div style={{ position: 'absolute', left: `calc(${pct(consumption)} - 7px)`, top: 0, width: 14, height: 14, borderRadius: 7, background: C.ok, border: '2px solid #fff', boxSizing: 'border-box' }} />
        )}
      </div>
      <div style={{ fontSize: 13, color: '#2d5a41' }}>
        {t('expected')} <Num>{fmt(expected)}</Num> {t('cubic')} ({basis === 'lastYear' ? t('lastYear') : t('average')}) · {t('range')} <Num>{fmt(Math.round(expected * LOW_FACTOR))}–{fmt(Math.round(expected * HIGH_FACTOR))}</Num>
      </div>
    </div>
  );
}

// ── آخر الفترات مقابل الحالية ───────────────────────────────
function HistoryBars({ history, current, t }) {
  const items = [...(history || []).map(h => ({ v: h.value, label: `${String(h.year).slice(2)}/${h.period}` })), { v: current, label: t('now'), now: true }];
  const max = Math.max(1, ...items.map(i => Math.max(0, i.v || 0)));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 92 }}>
      {items.map((i, k) => (
        <div key={k} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <Num style={{ fontSize: 12, fontWeight: i.now ? 800 : 500, color: i.now ? C.warnText : '#6b5a3f' }}>{fmt(i.v)}</Num>
          <div style={{ width: '100%', height: Math.max(4, (Math.max(0, i.v || 0) / max) * 52), borderRadius: 4, background: i.now ? '#e9a23b' : '#d9c7a3' }} />
          <Num style={{ fontSize: 12, fontWeight: i.now ? 800 : 500, color: i.now ? C.warnText : '#6b5a3f' }}>{i.label}</Num>
        </div>
      ))}
    </div>
  );
}

// ── إعدادات الدورة (للمدير) ─────────────────────────────────
function CyclePanel({ cycle, t, onSaved }) {
  const [year, setYear]   = useState(cycle?.year || new Date().getFullYear());
  const [phase, setPhase] = useState(cycle?.phase ?? 1);
  const [open, setOpen]   = useState(!!cycle?.open);
  const [busy, setBusy]   = useState(false);
  const [msg, setMsg]     = useState('');

  useEffect(() => {
    if (!cycle) return;
    if (cycle.year) setYear(cycle.year);
    if (cycle.phase !== null && cycle.phase !== undefined) setPhase(cycle.phase);
    setOpen(!!cycle.open);
  }, [cycle]);

  const save = async () => {
    setBusy(true); setMsg('');
    try {
      await readerAPI.updateCycle({ year, phase, open });
      setMsg('✅ ' + t('saved'));
      onSaved && onSaved();
      setTimeout(() => setMsg(''), 2500);
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ margin: 16, marginBottom: 0, background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 16, fontWeight: 800 }}>{t('cycleSettings')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: C.muted }}>
          {t('year')}
          <input type="number" value={year} onChange={e => setYear(e.target.value)} style={{ width: 96, height: 40, borderRadius: 10, border: `1px solid ${C.line}`, padding: '0 10px', fontSize: 16, fontFamily: 'inherit' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: C.muted }}>
          {t('period')}
          <select value={phase} onChange={e => setPhase(Number(e.target.value))} style={{ height: 40, borderRadius: 10, border: `1px solid ${C.line}`, padding: '0 10px', fontSize: 16, fontFamily: 'inherit', background: '#fff' }}>
            <option value={0}>{t('yearStart')}</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(k => (
              <option key={k} value={k}>{t('period')} {k} ({t('pShort')}{k})</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, height: 40, fontSize: 15, fontWeight: 700, color: open ? C.ok : C.greyText, cursor: 'pointer' }}>
          <input type="checkbox" checked={open} onChange={e => setOpen(e.target.checked)} style={{ width: 20, height: 20 }} />
          {open ? t('open') : t('closed')}
        </label>
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy} style={{ height: 40 }}>{t('save')}</button>
      </div>
      <div style={{ fontSize: 12, color: C.muted }}>{t('phaseHint')} · {t('excelCol')} ת{Number(phase) + 1}</div>
      {msg && <div style={{ fontSize: 14, fontWeight: 700 }}>{msg}</div>}
    </div>
  );
}
