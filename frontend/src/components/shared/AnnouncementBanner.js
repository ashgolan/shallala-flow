import React, { useState, useEffect } from 'react';
import { publicAPI } from '../../api';
import { format } from 'date-fns';
import { ar, he } from 'date-fns/locale';

export default function AnnouncementBanner({ lang = 'ar' }) {
  const [ann, setAnn] = useState(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    publicAPI.getSettings()
      .then(d => { if (d.announcement?.text) setAnn(d.announcement); })
      .catch(() => {});
  }, []);

  if (!ann?.text || !visible) return null;

  const locale = lang === 'he' ? he : ar;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
      borderBottom: '2px solid #fcd34d',
      padding: '10px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      position: 'sticky',
      top: 60,
      zIndex: 98,
    }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>📢</span>
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 700, color: '#78350f', fontSize: 14 }}>{ann.text}</span>
        {ann.updatedAt && (
          <span style={{ fontSize: 11, color: '#b45309', marginRight: 10 }}>
            — {format(new Date(ann.updatedAt), 'dd MMM yyyy HH:mm', { locale })}
          </span>
        )}
      </div>
      <button
        onClick={() => setVisible(false)}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: '#b45309', fontSize: 18, flexShrink: 0, lineHeight: 1,
          padding: '0 4px',
        }}
        title={lang === 'ar' ? 'إغلاق' : 'סגור'}
      >✕</button>
    </div>
  );
}
