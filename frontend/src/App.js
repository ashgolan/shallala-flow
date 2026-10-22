import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LangProvider } from './contexts/LangContext';
import LoginPage       from './pages/LoginPage';
import FarmerDashboard from './pages/FarmerDashboard';
import AdminDashboard  from './pages/AdminDashboard';
import ReaderPage      from './pages/ReaderPage'; // ✅ صفحة إدخال القراءات (الناطور)
import FloatingCalculator from './components/shared/FloatingCalculator'; // ✅ حاسبة عائمة (عادية + ضريبة) بكل التطبيق
import './styles/global.css';

// ✅ مدة الخمول قبل تسجيل الخروج التلقائي (8 ساعات)
const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;

export default function App() {
  const [view,      setView]      = useState('loading');
  const [farmer,    setFarmer]    = useState(null);
  const [adminRole, setAdminRole] = useState('admin');
  // ✅ قائمة المشاريع المسموح للمراقب بإدارتها بالكامل (فارغة للمدير الرئيسي أو المراقب العادي)
  const [allowedProjectIds, setAllowedProjectIds] = useState([]);
  // ✅ مراقب وناطور معاً — يظهر له تبويب "إدخال قراءات" بلوحة الإدارة
  const [canEnterReadings, setCanEnterReadings] = useState(false);
  const idleTimer = useRef(null);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('shl_token');
    localStorage.removeItem('shl_farmer');
    localStorage.removeItem('shl_admin');
    localStorage.removeItem('shl_allowed_projects');
    localStorage.removeItem('shl_can_read');
    setFarmer(null);
    setAdminRole('admin');
    setAllowedProjectIds([]);
    setCanEnterReadings(false);
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
    const savedAllowed = localStorage.getItem('shl_allowed_projects');

    if (!token) { setView('login'); return; }

    // ✅ الناطور: صفحة إدخال القراءات فقط
    if (savedAdmin === 'reader') { setView('reader'); return; }

    if (savedAdmin) {
      setAdminRole(savedAdmin);
      if (savedAllowed) {
        try { setAllowedProjectIds(JSON.parse(savedAllowed)); } catch { setAllowedProjectIds([]); }
      }
      setCanEnterReadings(localStorage.getItem('shl_can_read') === '1');
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
    if (view === 'admin' || view === 'farmer' || view === 'reader') {
      return startIdleWatch();
    }
  }, [view, startIdleWatch]);

  const handleFarmerLogin = (token, farmerData) => {
    localStorage.setItem('shl_token',  token);
    localStorage.setItem('shl_farmer', JSON.stringify(farmerData));
    localStorage.removeItem('shl_admin');
    localStorage.removeItem('shl_allowed_projects');
    setFarmer(farmerData);
    setView('farmer');
  };

  // ✅ يستقبل الآن allowedProjectIds كمان (فارغة افتراضياً)
  const handleAdminLogin = (token, role = 'admin', projectIds = [], canRead = false) => {
    localStorage.setItem('shl_token', token);
    localStorage.setItem('shl_admin', role);
    localStorage.setItem('shl_allowed_projects', JSON.stringify(projectIds || []));
    localStorage.setItem('shl_can_read', canRead ? '1' : '0');
    setCanEnterReadings(!!canRead);
    localStorage.removeItem('shl_farmer');
    // ✅ الناطور ما بيدخل لوحة الإدارة إطلاقاً — صفحته لحالها
    if (role === 'reader') { setView('reader'); return; }
    setAdminRole(role);
    setAllowedProjectIds(projectIds || []);
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
      <FloatingCalculator />
    </LangProvider>
  );

  if (view === 'reader') return (
    <LangProvider>
      <ReaderPage onLogout={handleLogout} />
    </LangProvider>
  );

  if (view === 'admin') return (
    <LangProvider>
      <AdminDashboard adminRole={adminRole} allowedProjectIds={allowedProjectIds} canEnterReadings={canEnterReadings} onLogout={handleLogout} />
      <FloatingCalculator />
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