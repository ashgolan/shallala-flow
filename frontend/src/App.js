import React, { useState } from 'react';
import { LangProvider } from './contexts/LangContext';
import LoginPage       from './pages/LoginPage';
import FarmerDashboard from './pages/FarmerDashboard';
import AdminDashboard  from './pages/AdminDashboard';
import './styles/global.css';

export default function App() {
  const [view,      setView]      = useState('login');
  const [farmer,    setFarmer]    = useState(null);
  const [adminRole, setAdminRole] = useState('admin');

  const handleFarmerLogin = (token, farmerData) => {
    localStorage.setItem('shl_token',  token);   // ما يقرأه الـ API
    localStorage.setItem('shl_farmer', JSON.stringify(farmerData));
    setFarmer(farmerData);
    setView('farmer');
  };

  const handleAdminLogin = (token, role = 'admin') => {
    localStorage.setItem('shl_token', token);    // ما يقرأه الـ API
    localStorage.setItem('shl_admin', role);
    setAdminRole(role);
    setView('admin');
  };

  const handleLogout = () => {
    localStorage.removeItem('shl_token');
    localStorage.removeItem('shl_farmer');
    localStorage.removeItem('shl_admin');
    setFarmer(null);
    setView('login');
  };

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
