import React, { useState, useEffect } from 'react';
import { LangProvider } from './contexts/LangContext';
import LoginPage       from './pages/LoginPage';
import FarmerDashboard from './pages/FarmerDashboard';
import AdminDashboard  from './pages/AdminDashboard';
import './styles/global.css';

export default function App() {
  const [view,      setView]      = useState('loading'); // ✅ loading أولاً ريثما نتحقق
  const [farmer,    setFarmer]    = useState(null);
  const [adminRole, setAdminRole] = useState('admin');

  // ✅ استعادة الجلسة عند تحديث الصفحة
  useEffect(() => {
    const token      = localStorage.getItem('shl_token');
    const savedAdmin = localStorage.getItem('shl_admin');   // 'admin' | 'viewer' | null
    const savedFarmer= localStorage.getItem('shl_farmer');

    if (!token) {
      setView('login');
      return;
    }

    if (savedAdmin) {
      // كان مدير أو مراقب
      setAdminRole(savedAdmin);
      setView('admin');
    } else if (savedFarmer) {
      // كان مزارع
      try {
        const farmerData = JSON.parse(savedFarmer);
        setFarmer(farmerData);
        setView('farmer');
      } catch {
        // بيانات تالفة → تسجيل خروج
        handleLogout();
      }
    } else {
      setView('login');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleLogout = () => {
    localStorage.removeItem('shl_token');
    localStorage.removeItem('shl_farmer');
    localStorage.removeItem('shl_admin');
    setFarmer(null);
    setAdminRole('admin');
    setView('login');
  };

  // ✅ شاشة تحميل صغيرة أثناء التحقق من الجلسة
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
