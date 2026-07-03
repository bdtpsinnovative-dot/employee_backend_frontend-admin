import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import AdminLayout from './components/AdminLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Requests from './pages/Requests';
import Employees from './pages/Employees';
import Holidays from './pages/Holidays';
import DailyRecord from './pages/DailyRecord';
import History from './pages/History';

import { fetchMe } from './services/adminApi';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setAuthenticated(false);
        setIsAdmin(false);
        setChecking(false);
        return;
      }
      setAuthenticated(true);
      
      try {
        const user = await fetchMe();
        setIsAdmin(user.role === 'admin');
      } catch (err) {
        console.error('สิทธิ์แอดมินไม่ถูกต้อง:', err);
        setIsAdmin(false);
      }
      setChecking(false);
    }

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setAuthenticated(false);
        setIsAdmin(false);
        setChecking(false);
      } else {
        checkUser();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (checking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-gray)' }}>
        กำลังตรวจสอบสิทธิ์แอดมิน...
      </div>
    );
  }

  if (!authenticated || !isAdmin) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route
          path="/"
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="requests" element={<Requests />} />
          <Route path="employees" element={<Employees />} />
          <Route path="holidays" element={<Holidays />} />
          <Route path="daily-record" element={<DailyRecord />} />
          <Route path="history" element={<History />} />
        </Route>
      </Routes>
    </Router>
  );
}
