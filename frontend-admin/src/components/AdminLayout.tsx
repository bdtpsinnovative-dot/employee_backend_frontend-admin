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
  '/backups',
  '/brand-responsibilities',
  '/teams',
  '/task-logs'
];

function getInitialSidebarOpen(): boolean {
  try {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (saved !== null) {
      return saved === 'true';
    }
  } catch { }
  return window.innerWidth > 900;
}

function saveSidebarPref(open: boolean) {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open));
  } catch { }

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
  } catch { }
}
export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(getInitialSidebarOpen);
  const [lastTasksSearch, setLastTasksSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentUserLoaded, setCurrentUserLoaded] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const location = useLocation();
  const navigate = useNavigate();
  const isDashboard = location.pathname === '/dashboard' || location.pathname === '/dashboard/';
  const isAdmin = currentUser?.role === 'admin';
  const isOrganizationSettings = location.pathname === '/teams' || location.pathname === '/brand-responsibilities';
  const isTasksPage = location.pathname === '/tasks'
    || location.pathname === '/tasks/'
    || (location.pathname.startsWith('/tasks/') && location.pathname !== '/tasks/daily');

  useEffect(() => {
    if (isTasksPage) {
      setLastTasksSearch(location.search);
    }
  }, [isTasksPage, location.search]);

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
      } catch { }
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
      } catch { }
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
      } finally {
        setCurrentUserLoaded(true);
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
            } catch { }
          }
        };
      };
    } catch { }
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

      <Sidebar currentUser={currentUser} isOpen={sidebarOpen} onClose={handleCloseSidebar} tasksSearch={lastTasksSearch} />

      {/* Collapsed Left Rail for Desktop */}
      {/* Collapsed Left Rail for Desktop */}
      {!sidebarOpen && (
        <div className="collapsed-sidebar-rail hidden md:flex flex-col items-center py-3 bg-white border-r border-slate-200/80 w-[88px] shrink-0 z-30 shadow-2xs select-none transition-all duration-300 h-screen sticky top-0 overflow-y-auto overflow-x-hidden scrollbar-none">
          {/* Top Brand & Hamburger toggle button */}
          <div className="flex flex-col items-center gap-2 mb-3 w-full px-1">
            <button
              onClick={toggleSidebar}
              title="ขยายเมนูด้านข้าง (Expand Sidebar)"
              aria-label="ขยายเมนูด้านข้าง"
              aria-expanded={false}
              aria-controls="sidebar"
              className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-all shadow-xs active:scale-95 cursor-pointer group"
            >
              <i className="fa-solid fa-bars text-sm group-hover:scale-110 transition-transform"></i>
            </button>
            <span className="text-[9px] font-black text-slate-400 tracking-wider uppercase">เมนู</span>
          </div>

          <div className="w-6 border-t border-slate-100 mb-2"></div>

          {/* Navigation Icons list */}
          <div className="flex-1 flex flex-col items-center gap-1 w-full px-1">
            {isAdmin && (
              <NavLink
                to="/dashboard"
                title="ภาพรวมระบบ (Dashboard)"
                className={({ isActive }) =>
                  `collapsed-nav-link ${isActive
                    ? 'active'
                    : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-900'
                  }`
                }
              >
                <i className="fa-solid fa-chart-pie"></i>
                <span className="collapsed-nav-label">ภาพรวม</span>
              </NavLink>
            )}

            {isAdmin && (
              <NavLink
                to="/requests"
                title="อนุมัติคำขอ (Requests)"
                className={({ isActive }) =>
                  `collapsed-nav-link ${isActive
                    ? 'active'
                    : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-900'
                  }`
                }
              >
                <i className="fa-solid fa-envelope-open-text"></i>
                <span className="collapsed-nav-label">อนุมัติ</span>
                {pendingCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-[18px] h-4 px-1 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] font-black shadow-xs ring-2 ring-white">
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
                  `collapsed-nav-link ${isActive
                    ? 'active'
                    : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-900'
                  }`
                }
              >
                <i className="fa-solid fa-user-plus"></i>
                <span className="collapsed-nav-label">พนักงาน</span>
              </NavLink>
            )}

            {isAdmin && (
              <NavLink
                to="/teams"
                title="จัดการทีมและแบรนด์ (Organization settings)"
                className={({ isActive }) =>
                  `collapsed-nav-link ${isActive || isOrganizationSettings
                    ? 'active'
                    : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-900'
                  }`
                }
              >
                <i className="fa-solid fa-users-gear"></i>
                <span className="collapsed-nav-label">แบรนด์</span>
              </NavLink>
            )}

            <NavLink
              to="/holidays"
              title="ปฏิทินวันหยุด (Holidays)"
              className={({ isActive }) =>
                `collapsed-nav-link ${isActive
                  ? 'active'
                  : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-900'
                }`
              }
            >
              <i className="fa-solid fa-calendar-days"></i>
              <span className="collapsed-nav-label">ปฏิทิน</span>
            </NavLink>

            <NavLink
                to={`/tasks${lastTasksSearch}`}
              title="จัดการงาน (Tasks)"
              className={({ isActive }) =>
                `collapsed-nav-link ${isActive
                  ? 'active'
                  : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-900'
                }`
              }
            >
              <i className="fa-solid fa-clipboard-list"></i>
              <span className="collapsed-nav-label">งาน</span>
            </NavLink>

            <div className="collapsed-nav-divider" aria-hidden="true"></div>
            <span className="collapsed-nav-section-label">งานประจำวัน</span>

            <NavLink
              to="/daily-record"
              title="บันทึกเวลา & การลา (Daily Record)"
              className={({ isActive }) =>
                `collapsed-nav-link ${isActive
                  ? 'active'
                  : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-900'
                }`
              }
            >
              <i className="fa-solid fa-calendar-check"></i>
              <span className="collapsed-nav-label">บันทึกเวลา</span>
            </NavLink>

            <NavLink
              to="/history"
              title="ประวัติย้อนหลัง (History)"
              className={({ isActive }) =>
                `collapsed-nav-link ${isActive
                  ? 'active'
                  : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-900'
                }`
              }
            >
              <i className="fa-solid fa-clock-rotate-left"></i>
              <span className="collapsed-nav-label">ประวัติ</span>
            </NavLink>
          </div>

          {/* Logout Button */}
          <div className="flex flex-col items-center gap-1 w-full px-1 mt-auto">
            <button
              onClick={handleLogout}
              title="ออกจากระบบ (Logout)"
              className="collapsed-nav-link text-slate-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200/60 active:scale-95 transition-all cursor-pointer"
            >
              <i className="fa-solid fa-right-from-bracket"></i>
              <span className="collapsed-nav-label">ออกจากระบบ</span>
            </button>
          </div>
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
          <Outlet context={{ selectedUser, setSelectedUser, currentUser, currentUserLoaded, notifications, setNotifications }} />
        </div>

        {isDashboard && <RightPanel selectedUser={selectedUser} onSelectUser={setSelectedUser} />}
      </div>
    </div>
  );
}
