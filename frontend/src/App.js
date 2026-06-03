import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LangProvider } from './contexts/LangContext';
import LoginPage       from './pages/LoginPage';
import FarmerDashboard from './pages/FarmerDashboard';
import AdminDashboard  from './pages/AdminDashboard';
import './styles/global.css';

const AppContent = () => {
  const { farmer, isAdmin, loading } = useAuth();
  const [view, setView] = useState('login');

  if (loading) return (
    <div className="loading-screen">
      <span className="emoji">🌿</span>
      <div className="spinner" />
    </div>
  );

  if (view === 'farmer' || farmer)  return <FarmerDashboard onLogout={() => setView('login')} />;
  if (view === 'admin'  || isAdmin) return <AdminDashboard  onLogout={() => setView('login')} />;

  return (
    <LoginPage
      onFarmer={() => setView('farmer')}
      onAdmin ={() => setView('admin')}
    />
  );
};

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </LangProvider>
  );
}
