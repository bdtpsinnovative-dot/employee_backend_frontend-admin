import { NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchPendingRequests } from '../services/adminApi';
import type { User } from '../types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
}

export default function Sidebar({ isOpen, onClose, currentUser }: SidebarProps) {
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const isAdmin = currentUser ? currentUser.role === 'admin' : true; // Default to true during initial load

  useEffect(() => {
    loadPendingCount();
  }, []);

  async function loadPendingCount() {
    try {
      const data = await fetchPendingRequests();
      const count = (data.leaves?.length ?? 0) + (data.offsite?.length ?? 0);
      setPendingCount(count);
    } catch {
      // backend อาจยังไม่พร้อม
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  // Utility for NavLink styling
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `nav-item ${isActive ? 'active' : ''}`;

  return (
    <div className={`sidebar ${isOpen ? 'active' : 'collapsed'}`} id="sidebar">
      <div
        style={{
          fontSize: '22px',
          fontWeight: 700,
          color: 'var(--text-main)',
          marginBottom: '30px',
          textAlign: 'center',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        HR System
        <i
          className="fa-solid fa-times"
          style={{
            fontSize: '20px',
            color: '#aaa',
            cursor: 'pointer',
            display: isOpen ? 'block' : 'none',
          }}
          id="sidebar-close"
          onClick={onClose}
        ></i>
      </div>

      {isAdmin && (
        <NavLink to="/dashboard" className={navLinkClass}>
          <i className="fa-solid fa-chart-pie"></i> ภาพรวมระบบ
        </NavLink>
      )}

      {isAdmin && (
        <NavLink to="/requests" className={navLinkClass}>
          <i className="fa-solid fa-envelope-open-text"></i> อนุมัติคำขอ
          {pendingCount > 0 && (
            <span
              id="noti-badge"
              style={{
                background: 'var(--red)',
                color: 'white',
                borderRadius: '50%',
                padding: '2px 7px',
                fontSize: '11px',
                marginLeft: 'auto',
                fontWeight: 'bold',
              }}
            >
              {pendingCount}
            </span>
          )}
        </NavLink>
      )}

      {isAdmin && <div className="menu-category">การจัดการ</div>}
      {isAdmin && (
        <NavLink to="/employees" className={navLinkClass}>
          <i className="fa-solid fa-user-plus"></i> ฐานข้อมูลพนักงาน
        </NavLink>
      )}
      {isAdmin && (
        <NavLink to="/holidays" className={navLinkClass}>
          <i className="fa-solid fa-calendar-days"></i> ปฏิทินวันหยุด
        </NavLink>
      )}
      <NavLink to="/tasks" className={navLinkClass}>
        <i className="fa-solid fa-clipboard-list"></i> จัดการงาน
      </NavLink>

      <div className="menu-category">การปฏิบัติงาน</div>
      <NavLink to="/daily-record" className={navLinkClass}>
        <i className="fa-solid fa-calendar-check"></i> บันทึกเวลา & การลา
      </NavLink>
      {isAdmin && (
        <NavLink to="/history" className={navLinkClass}>
          <i className="fa-solid fa-clock-rotate-left"></i> ประวัติย้อนหลัง
        </NavLink>
      )}


      <div
        className="nav-item logout"
        style={{ marginTop: 'auto', color: '#718096', cursor: 'pointer' }}
        onClick={handleLogout}
      >
        <i className="fa-solid fa-right-from-bracket"></i> ออกจากระบบ
      </div>
    </div>
  );
}
