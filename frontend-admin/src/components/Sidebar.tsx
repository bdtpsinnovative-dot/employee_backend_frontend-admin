import { NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchPendingRequests } from '../services/adminApi';
import type { User } from '../types';
import { avatarUrl } from './tasks/taskUtils';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
}

export default function Sidebar({ isOpen, onClose, currentUser }: SidebarProps) {
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const isAdmin = currentUser ? currentUser.role === 'admin' : true; // Default to true during initial load
  const profileAvatar = avatarUrl(currentUser?.avatar_url);
  const profileName = currentUser
    ? `${currentUser.first_name} ${currentUser.last_name}${currentUser.nickname ? ` (${currentUser.nickname})` : ''}`.trim()
    : 'กำลังโหลดข้อมูล...';
  const positionText = currentUser?.position || (isAdmin ? 'ผู้ดูแลระบบ' : 'พนักงาน');
  const roleBadgeText = currentUser?.department ? currentUser.department : (isAdmin ? 'ADMIN' : 'STAFF');
  const profileInitial = currentUser?.first_name?.trim().charAt(0).toUpperCase() || 'U';

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
      {/* Header: App Brand Logo & Close Action */}
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <i className="fa-solid fa-layer-group"></i>
          </div>
          <span className="sidebar-brand-title">HR System</span>
        </div>
        <button
          type="button"
          className="sidebar-close-btn"
          id="sidebar-close"
          onClick={onClose}
          aria-label="ปิดเมนูด้านข้าง"
          style={{ display: isOpen ? 'flex' : 'none' }}
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>

      {/* Top Profile Card: Avatar, Name, Position & Role Badge */}
      <NavLink
        to="/profile"
        className={({ isActive }) => `sidebar-profile ${isActive ? 'active' : ''}`}
        aria-label={`เปิดโปรไฟล์ของ ${profileName}`}
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
        <i className="fa-solid fa-chevron-right sidebar-profile-chevron" aria-hidden="true"></i>
      </NavLink>

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
      {isAdmin && (
        <NavLink to="/backups" className={navLinkClass}>
          <i className="fa-solid fa-database"></i> สำรองและกู้คืนข้อมูล
        </NavLink>
      )}
      <NavLink to="/tasks" className={navLinkClass}>
        <i className="fa-solid fa-clipboard-list"></i> จัดการงาน
      </NavLink>
      {isAdmin && (
        <NavLink to="/brand-responsibilities" className={navLinkClass}>
          <i className="fa-solid fa-sitemap"></i> ตั้งค่าแบรนด์และผู้รับผิดชอบ
        </NavLink>
      )}

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
