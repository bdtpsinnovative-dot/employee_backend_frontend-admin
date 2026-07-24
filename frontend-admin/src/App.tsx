import React, { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import AdminLayout from './components/AdminLayout';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Requests = lazy(() => import('./pages/Requests'));
const Employees = lazy(() => import('./pages/Employees'));
const Holidays = lazy(() => import('./pages/Holidays'));
const DailyRecord = lazy(() => import('./pages/DailyRecord'));
const History = lazy(() => import('./pages/History'));
const Tasks = lazy(() => import('./pages/Tasks'));
const TaskLogs = lazy(() => import('./pages/TaskLogs'));

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
      <Suspense
        fallback={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-gray)' }}>
            กำลังโหลดข้อมูล...
          </div>
        }
      >
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
            <Route path="tasks" element={<Tasks />} />
            <Route path="task-logs" element={<TaskLogs />} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}
