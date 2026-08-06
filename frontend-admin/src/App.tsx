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
const TaskDetail = lazy(() => import('./pages/TaskDetail'));
const Notifications = lazy(() => import('./pages/Notifications'));
const TaskLogs = lazy(() => import('./pages/TaskLogs'));
const BackupCenter = lazy(() => import('./pages/BackupCenter'));
const Profile = lazy(() => import('./pages/Profile'));
const BrandResponsibilities = lazy(() => import('./pages/BrandResponsibilities'));
const TeamManagement = lazy(() => import('./pages/TeamManagement'));

import { fetchMe } from './services/adminApi';

import PrivacyPolicy from './pages/legal/PrivacyPolicy';
import TermsOfService from './pages/legal/TermsOfService';
import DataCollection from './pages/legal/DataCollection';
import DataDeletion from './pages/legal/DataDeletion';
function RequireAuth({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);

  useEffect(() => {
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setAuthenticated(false);
        setHasProfile(false);
        setChecking(false);
        return;
      }
      setAuthenticated(true);

      try {
        await fetchMe();
        setHasProfile(true);
      } catch (err: any) {
        console.error('ไม่พบข้อมูลโปรไฟล์พนักงาน:', err);
        // หากเกิดข้อผิดพลาดจากเครือข่าย หรือ Server Offline (เช่น 502, Network Error)
        // เราจะไม่ดีดผู้ใช้ออกจากระบบ (เพื่อป้องกันไม่ให้ต้องล็อกอินใหม่ตอนรีสตาร์ท API)
        const isOfflineOrServerError =
          err.message?.includes('Network Error') ||
          err.message?.includes('status code 5') ||
          err.message?.includes('Request failed') ||
          (err.response && err.response.status >= 500);

        if (isOfflineOrServerError) {
          setHasProfile(true); // อนุญาตให้มีโปรไฟล์ไปก่อน ป้องกันการดีดไปหน้า Login
        } else {
          setHasProfile(false);
        }
      }
      setChecking(false);
    }

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setAuthenticated(false);
        setHasProfile(false);
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
        กำลังตรวจสอบสิทธิ์เข้าใช้งาน...
      </div>
    );
  }

  if (!authenticated || !hasProfile) {
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
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/data-collection" element={<DataCollection />} />
          <Route path="/data-deletion" element={<DataDeletion />} />
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
            <Route path="backups" element={<BackupCenter />} />
            <Route path="profile" element={<Profile />} />
            <Route path="daily-record" element={<DailyRecord />} />
            <Route path="history" element={<History />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="brand-responsibilities" element={<BrandResponsibilities />} />
            <Route path="teams" element={<TeamManagement />} />
            <Route path="tasks/:taskId" element={<TaskDetail />} />
            <Route path="task-logs" element={<TaskLogs />} />
            <Route path="notifications" element={<Notifications />} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}
