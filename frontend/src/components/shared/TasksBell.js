import React, { useState, useEffect, useCallback } from 'react';
import { tasksAPI } from '../../api';

// ============================================================
//  TasksBell.js — رمز شفاف بشارة عددية لطلبات "المهام والاستفسارات"
//  المفتوحة والموجّهة للمستخدم الحالي. يظهر بكل تبويبات لوحة
//  الإدارة، ويحدّث نفسه دورياً + عند فتح/العودة للتطبيق.
//  props:
//    onClick     — يُستدعى عند الضغط (عادةً يفتح تبويب المهام)
//    refreshKey  — أي تغيّر بقيمته يفرض إعادة جلب العدد فوراً
// ============================================================
export default function TasksBell({ onClick, refreshKey }) {
  const [count, setCount] = useState(0);

  const load = useCallback(() => {
    tasksAPI.getPendingCount().then(d => setCount(d.count || 0)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  useEffect(() => { if (refreshKey !== undefined) load(); }, [refreshKey, load]);

  return (
    <button onClick={onClick} title="المهام والاستفسارات" style={{
      position: 'relative', width: 36, height: 36, borderRadius: '50%',
      border: '1.5px solid var(--border)', background: 'rgba(20,83,45,0.06)',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 17, flexShrink: 0, transition: 'all 0.2s',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(20,83,45,0.14)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(20,83,45,0.06)'; }}
    >
      🔔
      {count > 0 && (
        <span style={{
          position: 'absolute', top: -4, left: -4, minWidth: 18, height: 18, padding: '0 4px',
          borderRadius: 9, background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 900,
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #fff',
        }}>
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );
}