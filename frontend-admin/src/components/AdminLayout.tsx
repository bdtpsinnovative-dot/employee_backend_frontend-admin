import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import RightPanel from './RightPanel';
import type { User } from '../types';

const SIDEBAR_STORAGE_KEY = 'hr_sidebar_open';

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
  const location = useLocation();
  const isDashboard = location.pathname === '/dashboard' || location.pathname === '/dashboard/';

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

      <Sidebar isOpen={sidebarOpen} onClose={handleCloseSidebar} />

      {/* Collapsed Left Rail for Desktop (Enterprise SaaS style like VS Code, Slack, Jira) */}
      {!sidebarOpen && (
        <div className="hidden md:flex flex-col items-center py-5 bg-white border-r border-slate-200 w-[56px] shrink-0 z-30 shadow-2xs select-none transition-all duration-300">
          <button
            onClick={toggleSidebar}
            title="ขยายเมนูด้านข้าง (Expand Sidebar)"
            className="w-10 h-10 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-600 hover:text-blue-600 flex items-center justify-center transition-all shadow-2xs active:scale-95 cursor-pointer"
          >
            <i className="fa-solid fa-bars text-sm"></i>
          </button>
          <div className="mt-10 text-[10px] font-mono font-bold tracking-[0.3em] text-slate-400 [writing-mode:vertical-lr] rotate-180 uppercase select-none pointer-events-none">
            HR SYSTEM
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
              }}
            >
              A
            </div>
          </div>

          {/* Child Routes Render Here */}
          <Outlet context={{ selectedUser, setSelectedUser }} />
        </div>

        {isDashboard && <RightPanel selectedUser={selectedUser} />}
      </div>
    </div>
  );
}
