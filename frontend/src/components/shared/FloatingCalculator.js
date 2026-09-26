import React, { useState, useEffect, useCallback } from 'react';
import { useLang } from '../../contexts/LangContext';

// ════════════════════════════════════════════════════════════
//  FloatingCalculator — زر عائم شفاف بزاوية الشاشة (بكل التطبيق)
//  ✅ عند الضغط: اختيار بين "آلة حاسبة عادية" أو "حاسبة ضريبة (מע"מ)".
//  ✅ حاسبة الضريبة: نفس منطق flex.co.il — تُدخل قيمة واحدة (المبلغ قبل
//  الضريبة / الضريبة / المبلغ شامل الضريبة) + نسبة الضريبة، وتحصل على
//  الباقي فوراً مقرّباً لأغورة.
//  ✅ مكوّن مستقل تماماً — لا يلمس أي بيانات أو API، ولا يؤثر على أي صفحة.
// ════════════════════════════════════════════════════════════

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmt = (n) => (isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const COLORS = {
  green: '#166534',
  greenSoft: '#dcfce7',
  border: '#e5e7eb',
  muted: '#6b7280',
};

// ── آلة حاسبة عادية ─────────────────────────────────────────
function BasicCalc({ ar }) {
  const [display, setDisplay] = useState('0');
  const [acc, setAcc] = useState(null);      // القيمة المتراكمة
  const [op, setOp] = useState(null);        // العملية المنتظرة
  const [fresh, setFresh] = useState(true);  // الرقم التالي يبدأ من جديد
  const [expr, setExpr] = useState('');      // سطر العملية الصغير فوق الشاشة

  const compute = (a, b, o) => {
    switch (o) {
      case '+': return a + b;
      case '−': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? NaN : a / b;
      default: return b;
    }
  };
  const show = (n) => {
    if (!isFinite(n)) return ar ? 'خطأ' : 'שגיאה';
    return String(parseFloat(n.toPrecision(12)));
  };

  const inputDigit = useCallback((d) => {
    setDisplay(prev => {
      if (fresh || prev === '0' || isNaN(parseFloat(prev))) return d === '.' ? '0.' : d;
      if (d === '.' && prev.includes('.')) return prev;
      if (prev.replace('-', '').replace('.', '').length >= 15) return prev;
      return prev + d;
    });
    setFresh(false);
  }, [fresh]);

  const inputOp = useCallback((o) => {
    const cur = parseFloat(display);
    if (isNaN(cur)) return;
    let next = cur;
    if (acc !== null && op && !fresh) {
      next = compute(acc, cur, op);
      setDisplay(show(next));
    }
    setAcc(next);
    setOp(o);
    setFresh(true);
    setExpr(`${show(next)} ${o}`);
  }, [display, acc, op, fresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const equals = useCallback(() => {
    const cur = parseFloat(display);
    if (acc === null || !op || isNaN(cur)) return;
    const res = compute(acc, cur, op);
    setExpr(`${show(acc)} ${op} ${show(cur)} =`);
    setDisplay(show(res));
    setAcc(null); setOp(null); setFresh(true);
  }, [display, acc, op]); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = useCallback(() => { setDisplay('0'); setAcc(null); setOp(null); setFresh(true); setExpr(''); }, []);
  const back = useCallback(() => {
    if (fresh) return;
    setDisplay(prev => (prev.length <= 1 || (prev.length === 2 && prev.startsWith('-'))) ? '0' : prev.slice(0, -1));
  }, [fresh]);
  const percent = () => { const v = parseFloat(display); if (!isNaN(v)) { setDisplay(show(acc !== null ? acc * v / 100 : v / 100)); setFresh(false); } };
  const negate = () => { const v = parseFloat(display); if (!isNaN(v) && v !== 0) setDisplay(show(-v)); };

  // ✅ دعم لوحة المفاتيح (فقط لما الحاسبة مفتوحة وما في حقل إدخال مُركّز)
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;
      const k = e.key;
      if (/^[0-9]$/.test(k)) { inputDigit(k); e.preventDefault(); }
      else if (k === '.' || k === ',') { inputDigit('.'); e.preventDefault(); }
      else if (k === '+') { inputOp('+'); e.preventDefault(); }
      else if (k === '-') { inputOp('−'); e.preventDefault(); }
      else if (k === '*') { inputOp('×'); e.preventDefault(); }
      else if (k === '/') { inputOp('÷'); e.preventDefault(); }
      else if (k === 'Enter' || k === '=') { equals(); e.preventDefault(); }
      else if (k === 'Backspace') { back(); e.preventDefault(); }
      else if (k === 'Delete' || k.toLowerCase() === 'c') { clear(); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inputDigit, inputOp, equals, back, clear]);

  const keys = [
    ['C', '⌫', '%', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '−'],
    ['1', '2', '3', '+'],
    ['±', '0', '.', '='],
  ];
  const press = (k) => {
    if (/^[0-9.]$/.test(k)) inputDigit(k);
    else if (['+', '−', '×', '÷'].includes(k)) inputOp(k);
    else if (k === '=') equals();
    else if (k === 'C') clear();
    else if (k === '⌫') back();
    else if (k === '%') percent();
    else if (k === '±') negate();
  };
  const keyStyle = (k) => {
    const isOp = ['+', '−', '×', '÷'].includes(k);
    const isEq = k === '=';
    const isFn = ['C', '⌫', '%', '±'].includes(k);
    return {
      height: 46, borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 18, fontWeight: 700,
      fontFamily: 'inherit',
      background: isEq ? COLORS.green : isOp ? '#bbf7d0' : isFn ? '#f3f4f6' : '#fff',
      color: isEq ? '#fff' : isOp ? COLORS.green : k === 'C' ? '#dc2626' : '#111827',
      boxShadow: isEq || isOp ? 'none' : `inset 0 0 0 1px ${COLORS.border}`,
      outline: op === k && fresh && acc !== null ? `2px solid ${COLORS.green}` : 'none',
    };
  };

  return (
    <div>
      <div dir="ltr" style={{ background: '#f9fafb', border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '8px 12px', marginBottom: 10, textAlign: 'right' }}>
        <div style={{ fontSize: 12, color: COLORS.muted, minHeight: 16 }}>{expr}</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {isNaN(parseFloat(display)) ? display : parseFloat(display).toLocaleString('en-US', { maximumFractionDigits: 10 }) + (display.endsWith('.') ? '.' : '')}
        </div>
      </div>
      <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {keys.flat().map(k => (
          <button key={k} type="button" onClick={() => press(k)} style={keyStyle(k)}>{k}</button>
        ))}
      </div>
    </div>
  );
}

// ── حاسبة ضريبة (מע"מ) ───────────────────────────────────────
function VatCalc({ ar }) {
  const [mode, setMode] = useState('gross'); // net | vat | gross
  const [value, setValue] = useState('');
  const [rate, setRate] = useState('18');

  const v = parseFloat(value);
  const p = (parseFloat(rate) || 0) / 100;
  let net = 0, vat = 0, gross = 0;
  const valid = !isNaN(v) && (mode !== 'vat' || p > 0);
  if (valid) {
    if (mode === 'net') { net = v; vat = r2(v * p); gross = r2(net + vat); }
    else if (mode === 'gross') { gross = v; net = r2(v / (1 + p)); vat = r2(gross - net); }
    else { vat = v; net = r2(v / p); gross = r2(net + vat); }
  }

  const modes = [
    { key: 'net', label: ar ? 'المبلغ قبل الضريبة' : 'סכום (לפני מע"מ)' },
    { key: 'vat', label: ar ? 'الضريبة فقط' : 'מע"מ' },
    { key: 'gross', label: ar ? 'المبلغ شامل الضريبة' : 'סכום כולל מע"מ' },
  ];
  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`, fontSize: 16, fontWeight: 700, fontFamily: 'inherit', boxSizing: 'border-box' };
  const Row = ({ label, val, strong }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: strong ? 15 : 13, fontWeight: strong ? 800 : 600, color: strong ? '#111827' : '#374151' }}>
      <span>{label}</span><span dir="ltr">₪{fmt(val)}</span>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted, marginBottom: 6 }}>{ar ? 'ماذا لديك؟' : 'מה יש לי ביד?'}</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {modes.map(m => (
          <button key={m.key} type="button" onClick={() => setMode(m.key)} style={{
            flex: 1, padding: '7px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
            border: mode === m.key ? `1.5px solid ${COLORS.green}` : `1.5px solid ${COLORS.border}`,
            background: mode === m.key ? COLORS.greenSoft : '#fff', color: mode === m.key ? COLORS.green : '#374151',
          }}>{m.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 2 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted }}>{ar ? 'القيمة (₪)' : 'ערך (₪)'}</label>
          <input type="number" step="any" inputMode="decimal" value={value} autoFocus
            onChange={e => setValue(e.target.value)} placeholder="0.00" style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted }}>{ar ? 'الضريبة %' : 'מע"מ %'}</label>
          <input type="number" step="any" inputMode="decimal" value={rate}
            onChange={e => setRate(e.target.value)} style={inputStyle} />
        </div>
      </div>

      <div style={{ background: '#f9fafb', border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '8px 12px' }}>
        <Row label={ar ? 'المبلغ قبل الضريبة' : 'סכום'} val={net} />
        <Row label={ar ? `الضريبة (${rate || 0}%)` : `מע"מ (${rate || 0}%)`} val={vat} />
        <div style={{ borderTop: `1px dashed ${COLORS.border}`, margin: '4px 0' }} />
        <Row label={ar ? 'المبلغ شامل الضريبة' : 'סכום + מע"מ'} val={gross} strong />
        <div style={{ borderTop: `1px dashed ${COLORS.border}`, margin: '6px 0 2px' }} />
        <div style={{ fontSize: 11, color: COLORS.muted }}>
          <Row label={ar ? '25% من الضريبة' : '25% מע"מ'} val={r2(vat * 0.25)} />
          <Row label={ar ? 'ثلث الضريبة' : 'שליש מע"מ'} val={r2(vat / 3)} />
          <Row label={ar ? '45% من الضريبة' : '45% מע"מ'} val={r2(vat * 0.45)} />
          <Row label={ar ? 'ثلثا الضريبة' : 'שני שליש מע"מ'} val={r2(vat * 2 / 3)} />
        </div>
      </div>
      <button type="button" onClick={() => { setValue(''); setRate('18'); }} style={{
        marginTop: 10, width: '100%', padding: '8px', borderRadius: 8, border: `1.5px solid ${COLORS.border}`,
        background: '#fff', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit', color: '#374151',
      }}>{ar ? 'مسح — حساب جديد' : 'אפס טופס - חישוב חדש'}</button>
    </div>
  );
}

// ── المكوّن الرئيسي: زر عائم + قائمة اختيار + لوحة ─────────
export default function FloatingCalculator() {
  const { lang } = useLang() || { lang: 'ar' };
  const ar = lang !== 'he';
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState(null); // null | 'basic' | 'vat'

  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') { setMenuOpen(false); setMode(null); } };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  const open = (m) => { setMode(m); setMenuOpen(false); };

  const menuBtn = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', border: 'none',
    background: 'transparent', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
    color: '#111827', borderRadius: 8, textAlign: 'start',
  };

  return (
    <>
      <style>{`
        .fcalc-fab { position: fixed; left: 18px; bottom: 18px; z-index: 900; opacity: .45; transition: opacity .2s, transform .2s; }
        .fcalc-fab:hover, .fcalc-fab.active { opacity: 1; transform: scale(1.05); }
        .fcalc-pop { position: fixed; left: 18px; bottom: 80px; z-index: 901; }
        .fcalc-menu-btn:hover { background: #f0fdf4 !important; }
        @media (max-width: 768px) {
          .fcalc-fab { bottom: 92px; left: 12px; }
          .fcalc-pop { bottom: 152px; left: 12px; right: 12px; }
          .fcalc-panel { width: auto !important; }
        }
        @media print { .fcalc-fab, .fcalc-pop { display: none !important; } }
      `}</style>

      <button type="button"
        className={`fcalc-fab${menuOpen || mode ? ' active' : ''}`}
        title={ar ? 'حاسبة' : 'מחשבון'}
        onClick={() => { if (mode) { setMode(null); } else { setMenuOpen(o => !o); } }}
        style={{
          width: 50, height: 50, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: COLORS.green, color: '#fff', fontSize: 24,
          boxShadow: '0 6px 18px rgba(22,101,52,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
        {mode ? '✕' : '🧮'}
      </button>

      {menuOpen && !mode && (
        <div className="fcalc-pop" style={{ background: '#fff', borderRadius: 12, padding: 6, boxShadow: '0 10px 30px rgba(0,0,0,.18)', border: `1px solid ${COLORS.border}`, minWidth: 210 }}>
          <button type="button" className="fcalc-menu-btn" style={menuBtn} onClick={() => open('basic')}>
            🔢 {ar ? 'آلة حاسبة عادية' : 'מחשבון רגיל'}
          </button>
          <button type="button" className="fcalc-menu-btn" style={menuBtn} onClick={() => open('vat')}>
            🧾 {ar ? 'حاسبة ضريبة (מע"מ)' : 'מחשבון מע"מ'}
          </button>
        </div>
      )}

      {mode && (
        <div className="fcalc-pop fcalc-panel" style={{
          width: 300, background: '#fff', borderRadius: 16, padding: 14,
          boxShadow: '0 16px 40px rgba(0,0,0,.22)', border: `1px solid ${COLORS.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[['basic', ar ? '🔢 عادية' : '🔢 רגיל'], ['vat', ar ? '🧾 ضريبة' : '🧾 מע"מ']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setMode(k)} style={{
                  padding: '5px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800, fontFamily: 'inherit',
                  border: 'none', background: mode === k ? COLORS.green : '#f3f4f6', color: mode === k ? '#fff' : '#374151',
                }}>{l}</button>
              ))}
            </div>
            <button type="button" onClick={() => setMode(null)} title={ar ? 'إغلاق' : 'סגור'} style={{
              border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: COLORS.muted,
            }}>✕</button>
          </div>
          {mode === 'basic' ? <BasicCalc ar={ar} /> : <VatCalc ar={ar} />}
        </div>
      )}
    </>
  );
}