import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import RightPanel from './RightPanel';
import type { User } from '../types';

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 900);
  const [time, setTime] = useState(new Date());
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const location = useLocation();
  const isDashboard = location.pathname === '/dashboard' || location.pathname === '/dashboard/';

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isDashboard) {
      setSelectedUser(null);
    }
  }, [location.pathname, isDashboard]);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div id="app-section" style={{ display: 'flex', opacity: 1 }}>
      {/* Sidebar Overlay (Mobile) */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
        id="sidebar-overlay"
        onClick={toggleSidebar}
      ></div>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="main-container">
        <div className="content-area">
          {!sidebarOpen && (
            <div className="desktop-menu-toggle" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center' }}>
              <button
                onClick={toggleSidebar}
                style={{
                  background: 'var(--glass-bg)',
                  backdropFilter: 'var(--glass-blur)',
                  border: 'var(--glass-border-base)',
                  boxShadow: 'var(--glass-shadow)',
                  padding: '10px 16px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--text-main)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: '0.2s',
                }}
              >
                <i className="fa-solid fa-bars"></i>
                <span>แสดงเมนู</span>
              </button>
            </div>
          )}

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

          <div className="banner">
            <div className="banner-text">
              <h1>สวัสดี, ผู้ดูแลระบบ</h1>
              <span id="live-clock-banner">
                {time.toLocaleDateString('th-TH', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
            </div>
            <i className="fa-solid fa-user-tie fa-6x" style={{ opacity: 0.3 }}></i>
          </div>

          {/* Child Routes Render Here */}
          <Outlet context={{ selectedUser, setSelectedUser }} />
        </div>

        {isDashboard && <RightPanel selectedUser={selectedUser} />}
      </div>
    </div>
  );
}
