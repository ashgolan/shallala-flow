import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LangProvider } from './contexts/LangContext';
import LoginPage       from './pages/LoginPage';
import FarmerDashboard from './pages/FarmerDashboard';
import AdminDashboard  from './pages/AdminDashboard';
import './styles/global.css';

// ✅ مدة الخمول قبل تسجيل الخروج التلقائي (8 ساعات)
const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;

export default function App() {
  const [view,      setView]      = useState('loading');
  const [farmer,    setFarmer]    = useState(null);
  const [adminRole, setAdminRole] = useState('admin');
  const idleTimer = useRef(null);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('shl_token');
    localStorage.removeItem('shl_farmer');
    localStorage.removeItem('shl_admin');
    setFarmer(null);
    setAdminRole('admin');
    setView('login');
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }, []);

  // ✅ إعادة ضبط مؤقت الخمول عند أي نشاط
  const resetIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      handleLogout();
    }, IDLE_TIMEOUT_MS);
  }, [handleLogout]);

  // ✅ تفعيل مراقبة النشاط عند تسجيل الدخول
  const startIdleWatch = useCallback(() => {
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(e => window.addEventListener(e, resetIdleTimer));
    resetIdleTimer(); // ابدأ العد فوراً
    return () => {
      events.forEach(e => window.removeEventListener(e, resetIdleTimer));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [resetIdleTimer]);

  // ✅ استعادة الجلسة عند تحديث الصفحة
  useEffect(() => {
    const token       = localStorage.getItem('shl_token');
    const savedAdmin  = localStorage.getItem('shl_admin');
    const savedFarmer = localStorage.getItem('shl_farmer');

    if (!token) { setView('login'); return; }

    if (savedAdmin) {
      setAdminRole(savedAdmin);
      setView('admin');
    } else if (savedFarmer) {
      try {
        setFarmer(JSON.parse(savedFarmer));
        setView('farmer');
      } catch {
        handleLogout();
      }
    } else {
      setView('login');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ✅ تشغيل/إيقاف مراقبة الخمول حسب حالة الـ view
  useEffect(() => {
    if (view === 'admin' || view === 'farmer') {
      return startIdleWatch();
    }
  }, [view, startIdleWatch]);

  const handleFarmerLogin = (token, farmerData) => {
    localStorage.setItem('shl_token',  token);
    localStorage.setItem('shl_farmer', JSON.stringify(farmerData));
    localStorage.removeItem('shl_admin');
    setFarmer(farmerData);
    setView('farmer');
  };

  const handleAdminLogin = (token, role = 'admin') => {
    localStorage.setItem('shl_token', token);
    localStorage.setItem('shl_admin', role);
    localStorage.removeItem('shl_farmer');
    setAdminRole(role);
    setView('admin');
  };

  if (view === 'loading') return (
    <div className="loading-screen">
      <div className="emoji">🌿</div>
      <div className="spinner" />
    </div>
  );

  if (view === 'farmer') return (
    <LangProvider>
      <FarmerDashboard farmer={farmer} onLogout={handleLogout} />
    </LangProvider>
  );

  if (view === 'admin') return (
    <LangProvider>
      <AdminDashboard adminRole={adminRole} onLogout={handleLogout} />
    </LangProvider>
  );

  return (
    <LangProvider>
      <LoginPage
        onFarmerLogin={handleFarmerLogin}
        onAdminLogin={handleAdminLogin}
      />
    </LangProvider>
  );
}
