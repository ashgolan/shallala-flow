import React from 'react';
import { useLang } from '../../contexts/LangContext';

// Dark version - for dark nav bars
export default function LangToggle({ style = {} }) {
  const { lang, toggleLang } = useLang();
  return (
    <button onClick={toggleLang}
      style={{
        display:'inline-flex', alignItems:'center', gap:6,
        padding:'6px 14px', borderRadius:20,
        border:'1.5px solid rgba(255,255,255,0.3)',
        background:'rgba(255,255,255,0.12)', color:'#fff',
        cursor:'pointer', fontFamily:'Tajawal, Heebo, sans-serif',
        fontSize:13, fontWeight:700, transition:'all 0.2s',
        ...style,
      }}>
      <span style={{ fontSize:15 }}>{lang === 'ar' ? '🇮🇱' : '🇵🇸'}</span>
      <span>{lang === 'ar' ? 'עברית' : 'عربي'}</span>
    </button>
  );
}

// Light version - for white/light backgrounds
export function LangToggleLight({ style = {} }) {
  const { lang, toggleLang } = useLang();
  return (
    <button onClick={toggleLang}
      style={{
        display:'inline-flex', alignItems:'center', gap:6,
        padding:'6px 14px', borderRadius:20,
        border:'1.5px solid var(--border)',
        background:'var(--surface-2)', color:'var(--primary)',
        cursor:'pointer', fontFamily:'Tajawal, Heebo, sans-serif',
        fontSize:13, fontWeight:700, transition:'all 0.2s',
        ...style,
      }}>
      <span style={{ fontSize:15 }}>{lang === 'ar' ? '🇮🇱' : '🇵🇸'}</span>
      <span>{lang === 'ar' ? 'עברית' : 'عربي'}</span>
    </button>
  );
}
