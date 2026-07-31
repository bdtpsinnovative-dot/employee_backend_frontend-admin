import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate, NavLink } from 'react-router-dom';
import Sidebar from './Sidebar';
import RightPanel from './RightPanel';
import type { User } from '../types';
import { fetchMe, fetchPendingRequests, fetchNotifications, type AppNotification } from '../services/adminApi';
import { supabase } from '../lib/supabase';

const SIDEBAR_STORAGE_KEY = 'hr_sidebar_open';
const ADMIN_ONLY_ROUTES = [
  '/dashboard',
  '/requests',
  '/employees',
  '/holidays',
  '/backups',
  '/history',
  '/task-logs'
];

function getInitialSidebarOpen(): boolean {
  try {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (saved !== null) {
      return saved === 'true';
    }
  } catch {}
  return window.innerWidth > 900;
}

function saveSidebarPref(open: boolean) {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open));
  } catch {}

  try {
    const request = indexedDB.open('hr_preferences_db', 1);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
    };
    request.onsuccess = (e: any) => {
      const db = e.target.result;
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put(open, SIDEBAR_STORAGE_KEY);
    };
  } catch {}
}
export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(getInitialSidebarOpen);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const location = useLocation();
  const navigate = useNavigate();
  const isDashboard = location.pathname === '/dashboard' || location.pathname === '/dashboard/';
  const isAdmin = currentUser ? currentUser.role === 'admin' : true;

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  useEffect(() => {
    async function loadPendingCount() {
      try {
        const data = await fetchPendingRequests();
        const count = (data.leaves?.length ?? 0) + (data.offsite?.length ?? 0);
        setPendingCount(count);
      } catch {}
    }
    if (isAdmin) {
      loadPendingCount();
    }
  }, [currentUser, isAdmin]);

  // Fetch notifications and poll every 30 seconds
  useEffect(() => {
    async function loadNotifications() {
      try {
        const data = await fetchNotifications();
        setNotifications(data);
      } catch {}
    }
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);



  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const user = await fetchMe();
        setCurrentUser(user);
      } catch (err) {
        console.error('ไม่สามารถโหลดข้อมูลผู้ใช้:', err);
      }
    }
    loadCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUser && currentUser.role !== 'admin') {
      const isAdminRoute = ADMIN_ONLY_ROUTES.some(route => 
        location.pathname === route || location.pathname.startsWith(route + '/')
      );
      if (isAdminRoute) {
        navigate('/daily-record', { replace: true });
      }
    }
  }, [currentUser, location.pathname, navigate]);

  useEffect(() => {
    try {
      const request = indexedDB.open('hr_preferences_db', 1);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
      };
      request.onsuccess = (e: any) => {
        const db = e.target.result;
        const tx = db.transaction('settings', 'readonly');
        const getReq = tx.objectStore('settings').get(SIDEBAR_STORAGE_KEY);
        getReq.onsuccess = () => {
          if (typeof getReq.result === 'boolean') {
            setSidebarOpen(getReq.result);
            try {
              localStorage.setItem(SIDEBAR_STORAGE_KEY, String(getReq.result));
            } catch {}
          }
        };
      };
    } catch {}
  }, []);

  useEffect(() => {
    if (!isDashboard) {
      setSelectedUser(null);
    }
  }, [location.pathname, isDashboard]);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      saveSidebarPref(next);
      return next;
    });
  };

  const handleCloseSidebar = () => {
    setSidebarOpen(false);
    saveSidebarPref(false);
  };

  return (
    <div id="app-section" style={{ display: 'flex', opacity: 1 }}>
      {/* Sidebar Overlay (Mobile) */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
        id="sidebar-overlay"
        onClick={toggleSidebar}
      ></div>

      <Sidebar currentUser={currentUser} isOpen={sidebarOpen} onClose={handleCloseSidebar} />

      {/* Collapsed Left Rail for Desktop */}
      {!sidebarOpen && (
        <div className="hidden md:flex flex-col items-center py-5 bg-white border-r border-slate-200 w-[56px] shrink-0 z-30 shadow-2xs select-none transition-all duration-300 h-screen sticky top-0 overflow-y-auto">
          {/* Hamburger toggle button */}
          <button
            onClick={toggleSidebar}
            title="ขยายเมนูด้านข้าง (Expand Sidebar)"
            className="w-10 h-10 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-600 hover:text-blue-600 flex items-center justify-center transition-all shadow-2xs active:scale-95 cursor-pointer mb-6"
          >
            <i className="fa-solid fa-bars text-sm"></i>
          </button>

          {/* Navigation Icons list */}
          <div className="flex-1 flex flex-col items-center gap-4 w-full">
            {isAdmin && (
              <NavLink
                to="/dashboard"
                title="ภาพรวมระบบ (Dashboard)"
                className={({ isActive }) =>
                  `w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 border border-transparent'
                  }`
                }
              >
                <i className="fa-solid fa-chart-pie text-sm"></i>
              </NavLink>
            )}

            {isAdmin && (
              <NavLink
                to="/requests"
                title="อนุมัติคำขอ (Requests)"
                className={({ isActive }) =>
                  `w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 border border-transparent'
                  }`
                }
              >
                <i className="fa-solid fa-envelope-open-text text-sm"></i>
                {pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 text-white rounded-full flex items-center justify-center text-[9px] font-extrabold shadow-2xs border border-white">
                    {pendingCount}
                  </span>
                )}
              </NavLink>
            )}

            {isAdmin && (
              <NavLink
                to="/employees"
                title="ฐานข้อมูลพนักงาน (Employees)"
                className={({ isActive }) =>
                  `w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 border border-transparent'
                  }`
                }
              >
                <i className="fa-solid fa-user-plus text-sm"></i>
              </NavLink>
            )}

            {isAdmin && (
              <NavLink
                to="/holidays"
                title="ปฏิทินวันหยุด (Holidays)"
                className={({ isActive }) =>
                  `w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 border border-transparent'
                  }`
                }
              >
                <i className="fa-solid fa-calendar-days text-sm"></i>
              </NavLink>
            )}

            <NavLink
              to="/tasks"
              title="จัดการงาน (Tasks)"
              className={({ isActive }) =>
                `w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 border border-transparent'
                }`
              }
            >
              <i className="fa-solid fa-clipboard-list text-sm"></i>
            </NavLink>

            <NavLink
              to="/daily-record"
              title="บันทึกเวลา & การลา (Daily Record)"
              className={({ isActive }) =>
                `w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 border border-transparent'
                }`
              }
            >
              <i className="fa-solid fa-calendar-check text-sm"></i>
            </NavLink>

            {isAdmin && (
              <NavLink
                to="/history"
                title="ประวัติย้อนหลัง (History)"
                className={({ isActive }) =>
                  `w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 border border-transparent'
                  }`
                }
              >
                <i className="fa-solid fa-clock-rotate-left text-sm"></i>
              </NavLink>
            )}


          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            title="ออกจากระบบ (Logout)"
            className="w-10 h-10 rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center transition-all cursor-pointer border border-transparent active:scale-95 mt-auto"
          >
            <i className="fa-solid fa-right-from-bracket text-sm"></i>
          </button>
        </div>
      )}

      <div className="main-container">
        <div className="content-area">
          <div className="mobile-header">
            <button className="btn-hamburger" onClick={toggleSidebar}>
              <i className="fa-solid fa-bars"></i>
            </button>
            <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>HR</div>
            <div
              className="avatar-circle"
              style={{
                background: 'var(--primary-gradient)',
                color: 'white',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold'
              }}
            >
              {currentUser?.first_name ? currentUser.first_name[0].toUpperCase() : 'U'}
            </div>
          </div>

          {/* Child Routes Render Here */}
          <Outlet context={{ selectedUser, setSelectedUser, currentUser, notifications, setNotifications }} />
        </div>

        {isDashboard && <RightPanel selectedUser={selectedUser} />}
      </div>
    </div>
  );
}
