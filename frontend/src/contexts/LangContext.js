import React, { createContext, useContext, useState, useEffect } from 'react';

const LangContext = createContext(null);
export const useLang = () => useContext(LangContext);

export const LangProvider = ({ children }) => {
  const [lang, setLang] = useState(() => localStorage.getItem('shl_lang') || 'ar');

  useEffect(() => {
    localStorage.setItem('shl_lang', lang);
    // Both Arabic and Hebrew are RTL
    document.documentElement.dir  = 'rtl';
    document.documentElement.lang = lang;
    // Switch font: Tajawal for Arabic, Heebo for Hebrew
    document.body.style.fontFamily = lang === 'he'
      ? "'Heebo', 'Tajawal', sans-serif"
      : "'Tajawal', 'Heebo', sans-serif";
  }, [lang]);

  const toggleLang = () => setLang(l => l === 'ar' ? 'he' : 'ar');

  return (
    <LangContext.Provider value={{ lang, setLang, toggleLang }}>
      {children}
    </LangContext.Provider>
  );
};
