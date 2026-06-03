import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export const AuthProvider = ({ children }) => {
  const [farmer, setFarmer]   = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tok    = localStorage.getItem('shl_token');
    const saved  = localStorage.getItem('shl_farmer');
    const admin  = localStorage.getItem('shl_admin');
    if (tok) {
      if (saved)           try { setFarmer(JSON.parse(saved)); } catch {}
      if (admin === 'true') setIsAdmin(true);
    }
    setLoading(false);
  }, []);

  const loginFarmer = async (idNumber, code) => {
    const f = await authAPI.farmerLogin(idNumber, code);
    setFarmer(f);
    localStorage.setItem('shl_farmer', JSON.stringify(f));
    return f;
  };

  const loginAdmin = async (password) => {
    await authAPI.adminLogin(password);
    setIsAdmin(true);
    localStorage.setItem('shl_admin', 'true');
  };

  const logout = () => {
    authAPI.logout();
    setFarmer(null);
    setIsAdmin(false);
  };

  return (
    <Ctx.Provider value={{ farmer, isAdmin, loading, loginFarmer, loginAdmin, logout }}>
      {children}
    </Ctx.Provider>
  );
};
