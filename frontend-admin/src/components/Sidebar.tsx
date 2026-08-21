import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchPendingRequests } from '../services/adminApi';
import type { User } from '../types';
import { avatarUrl } from './tasks/taskUtils';
import { useTheme } from '../theme/ThemeProvider';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  tasksSearch?: string;
}

export default function Sidebar({ isOpen, onClose, currentUser, tasksSearch = '' }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const { mode, resolvedTheme, toggleTheme } = useTheme();
  const isAdmin = currentUser?.role === 'admin';
  const isOrganizationSettings = location.pathname === '/teams' || location.pathname === '/brand-responsibilities';
  const profileAvatar = avatarUrl(currentUser?.avatar_url);
  const profileName = currentUser
    ? `${currentUser.first_name} ${currentUser.last_name}${currentUser.nickname ? ` (${currentUser.nickname})` : ''}`.trim()
    : 'กำลังโหลดข้อมูล...';
  const positionText = currentUser?.position || (isAdmin ? 'ผู้ดูแลระบบ' : 'พนักงาน');
  const roleBadgeText = currentUser?.department ? currentUser.department : (isAdmin ? 'ADMIN' : 'STAFF');
  const profileInitial = currentUser?.first_name?.trim().charAt(0).toUpperCase() || 'U';

  useEffect(() => {
    if (isAdmin) void loadPendingCount();
  }, [isAdmin]);

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
      {/* Header: App Brand Logo & Close Action */}
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <img src="/app_icon_v2.svg" alt="HR System Logo" className="w-8 h-8 rounded-xl object-contain shadow-xs" />
          <span className="sidebar-brand-title">HR System</span>
        </div>
        <button
          type="button"
          className="sidebar-close-btn"
          id="sidebar-close"
          onClick={() => {
            setProfileMenuOpen(false);
            onClose();
          }}
          aria-label="ปิดเมนูด้านข้าง"
          style={{ display: isOpen ? 'flex' : 'none' }}
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>

      {/* Top Profile Card: Avatar, Name, Position & Role Badge */}
      <button
        type="button"
        className={`sidebar-profile ${profileMenuOpen ? 'active open' : ''}`}
        aria-label={`${profileMenuOpen ? 'ปิด' : 'เปิด'}เมนูโปรไฟล์ของ ${profileName}`}
        aria-haspopup="menu"
        aria-expanded={profileMenuOpen}
        aria-controls="sidebar-profile-menu"
        onClick={() => setProfileMenuOpen((previous) => !previous)}
      >
        <div className="sidebar-profile-avatar-wrapper">
          <span className="sidebar-profile-avatar" aria-hidden="true">
            {profileAvatar ? <img src={profileAvatar} alt="" /> : profileInitial}
          </span>
          <span className="sidebar-status-dot" title="ออนไลน์" />
        </div>
        <div className="sidebar-profile-copy">
          <strong>{profileName}</strong>
          <span className="sidebar-position">{positionText}</span>
          <span className={`sidebar-profile-badge ${isAdmin ? 'admin' : 'staff'}`}>
            {roleBadgeText}
          </span>
        </div>
        <i
          className={`fa-solid fa-chevron-right sidebar-profile-chevron ${profileMenuOpen ? 'open' : ''}`}
          aria-hidden="true"
        ></i>
      </button>

      {profileMenuOpen && (
        <div className="sidebar-profile-menu" id="sidebar-profile-menu">
          <NavLink
            to="/profile"
            className={({ isActive }) => `sidebar-profile-action ${isActive ? 'active' : ''}`}
            onClick={() => setProfileMenuOpen(false)}
          >
            <span className="sidebar-profile-action-icon" aria-hidden="true">
              <i className="fa-solid fa-user"></i>
            </span>
            <span>โปรไฟล์</span>
          </NavLink>
          <button
            type="button"
            className="sidebar-profile-action"
            onClick={toggleTheme}
            aria-label={`เปลี่ยนเป็นโหมด${resolvedTheme === 'dark' ? 'สว่าง' : 'มืด'}`}
          >
            <span className="sidebar-profile-action-icon" aria-hidden="true">
              <i className={`fa-solid ${resolvedTheme === 'dark' ? 'fa-sun' : 'fa-moon'}`}></i>
            </span>
            <span>{resolvedTheme === 'dark' ? 'โหมดสว่าง' : 'โหมดมืด'}</span>
            <small className="theme-mode-hint">{mode === 'system' ? 'อัตโนมัติ' : 'จำค่าไว้'}</small>
          </button>
          <button
            type="button"
            className="sidebar-profile-action sidebar-profile-action-danger"
            onClick={handleLogout}
          >
            <span className="sidebar-profile-action-icon" aria-hidden="true">
              <i className="fa-solid fa-right-from-bracket"></i>
            </span>
            <span>ออกจากระบบ</span>
          </button>
        </div>
      )}

      {isAdmin && (
        <NavLink to="/dashboard" className={navLinkClass}>
          <i className="fa-solid fa-chart-pie"></i> ภาพรวมระบบ
        </NavLink>
      )}

      {isAdmin && (
        <NavLink to="/requests" className={navLinkClass}>
          <i className="fa-solid fa-envelope-open-text"></i> อนุมัติ
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
        <NavLink to="/teams" className={`nav-item ${isOrganizationSettings ? 'active' : ''}`}>
          <i className="fa-solid fa-users-gear"></i> จัดการทีมและแบรนด์
        </NavLink>
      )}
      <NavLink to="/holidays" className={navLinkClass}>
        <i className="fa-solid fa-calendar-days"></i> ปฏิทินวันหยุด
      </NavLink>
      <NavLink to={`/tasks${tasksSearch}`} className={navLinkClass}>
        <i className="fa-solid fa-clipboard-list"></i> จัดการงาน
      </NavLink>
      <div className="menu-category">การปฏิบัติงาน</div>
      <NavLink to="/daily-record" className={navLinkClass}>
        <i className="fa-solid fa-calendar-check"></i> บันทึกเวลา & การลา
      </NavLink>
      <NavLink to="/history" className={navLinkClass}>
        <i className="fa-solid fa-clock-rotate-left"></i> ประวัติย้อนหลัง
      </NavLink>

    </div>
  );
}
