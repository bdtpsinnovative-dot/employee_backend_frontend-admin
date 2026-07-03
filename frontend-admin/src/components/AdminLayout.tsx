import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import RightPanel from './RightPanel';
import type { User } from '../types';

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [time, setTime] = useState(new Date());
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div id="app-section" style={{ display: 'flex', opacity: 1 }}>
      {/* Sidebar Overlay (Mobile) */}
      <div
        className="sidebar-overlay"
        id="sidebar-overlay"
        onClick={toggleSidebar}
        style={{ display: sidebarOpen ? 'block' : 'none' }}
      ></div>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="main-container">
        <div className="content-area">
          <div className="mobile-header">
            <button className="btn-hamburger" onClick={toggleSidebar}>
              <i className="fa-solid fa-bars"></i>
            </button>
            <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>NexHR</div>
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

        <RightPanel selectedUser={selectedUser} />
      </div>
    </div>
  );
}
