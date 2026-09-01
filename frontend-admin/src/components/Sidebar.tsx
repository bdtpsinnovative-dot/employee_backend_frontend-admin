import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  Building2,
  Calendar,
  CalendarDays,
  CalendarCheck,
  Kanban,
  LogOut,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchPendingRequests } from '../services/adminApi';
import type { User } from '../types';
import { avatarUrl } from './tasks/taskUtils';

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
  const isAdmin = currentUser?.role === 'admin';
  const isOrganizationSettings = location.pathname === '/teams' || location.pathname === '/brand-responsibilities';
  const profileAvatar = avatarUrl(currentUser?.avatar_url);
  const profileName = currentUser
    ? (currentUser.nickname || currentUser.first_name || 'ผู้ใช้งาน')
    : 'กำลังโหลดข้อมูล...';
  const positionText = currentUser?.position || (isAdmin ? 'ผู้ดูแลระบบ' : 'พนักงาน');
  const roleBadgeText = isAdmin ? 'ADMIN' : 'STAFF';
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

  const handleNavClick = () => {
    if (window.innerWidth <= 768) {
      onClose();
    }
  };

  return (
    <div className={`sidebar ${isOpen ? 'active' : 'collapsed'}`} id="sidebar">
      {/* Top Profile Header: Avatar, Name, Position, Badge */}
      <div className="sidebar-profile-header relative w-full mb-3">
        <NavLink
          to="/profile"
          className={({ isActive }) => `sidebar-profile ${isActive ? 'active' : ''}`}
          title={`โปรไฟล์ของ ${profileName}`}
          onClick={handleNavClick}
        >
          <div className="sidebar-profile-avatar-wrapper">
            <span className={`sidebar-profile-avatar ${profileAvatar ? 'has-image' : 'has-initial'}`} aria-hidden="true">
              {profileAvatar ? <img src={profileAvatar} alt="" /> : profileInitial}
            </span>
            <span className="sidebar-status-dot" title="ออนไลน์" />
          </div>
          <div className="sidebar-profile-copy">
            <strong title={profileName}>{profileName}</strong>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="sidebar-position">{positionText}</span>
              <span className={`sidebar-profile-badge ${isAdmin ? 'admin' : 'staff'}`}>
                {roleBadgeText}
              </span>
            </div>
          </div>
        </NavLink>
      </div>

      {/* Navigation Sections */}
      <div className="sidebar-nav-list flex-1 space-y-4 pt-1" onClick={handleNavClick}>
        {/* 1. ภาพรวม & คำขอ (Admin) */}
        {isAdmin && (
          <div className="sidebar-nav-section space-y-1">
            <div className="menu-category">ภาพรวม & อนุมัติ</div>
            <NavLink to="/dashboard" className={navLinkClass}>
              <LayoutDashboard className="sidebar-nav-icon w-4.5 h-4.5 shrink-0" />
              <span>ภาพรวมระบบ</span>
            </NavLink>
            <NavLink to="/requests" className={navLinkClass}>
              <CheckSquare className="sidebar-nav-icon w-4.5 h-4.5 shrink-0" />
              <span>อนุมัติคำขอ</span>
              {pendingCount > 0 && (
                <span className="ml-auto min-w-[20px] h-5 px-1.5 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] font-extrabold shadow-xs">
                  {pendingCount}
                </span>
              )}
            </NavLink>
          </div>
        )}

        {/* 2. การจัดการงาน & ปฏิทิน */}
        <div className="sidebar-nav-section space-y-1">
          <div className="menu-category">การจัดการงาน</div>
          <NavLink to={`/tasks${tasksSearch}`} className={navLinkClass}>
            <Kanban className="sidebar-nav-icon w-4.5 h-4.5 shrink-0" />
            <span>จัดการงาน</span>
          </NavLink>
          <NavLink to="/content-calendar" className={navLinkClass}>
            <Calendar className="sidebar-nav-icon w-4.5 h-4.5 shrink-0" />
            <span>ปฏิทินคอนเทนต์</span>
          </NavLink>
          <NavLink to="/holidays" className={navLinkClass}>
            <CalendarDays className="sidebar-nav-icon w-4.5 h-4.5 shrink-0" />
            <span>ปฏิทินวันหยุด</span>
          </NavLink>
        </div>

        {/* 3. เวลา & การปฏิบัติงาน */}
        <div className="sidebar-nav-section space-y-1">
          <div className="menu-category">การปฏิบัติงาน</div>
          <NavLink to="/history" className={navLinkClass}>
            <CalendarCheck className="sidebar-nav-icon w-4.5 h-4.5 shrink-0" />
            <span>บันทึก & ประวัติเวลา</span>
          </NavLink>
        </div>

        {/* 4. การจัดการองค์กร (Admin Only) */}
        {isAdmin && (
          <div className="sidebar-nav-section space-y-1">
            <div className="menu-category">การจัดการองค์กร</div>
            <NavLink to="/employees" className={navLinkClass}>
              <Users className="sidebar-nav-icon w-4.5 h-4.5 shrink-0" />
              <span>ฐานข้อมูลพนักงาน</span>
            </NavLink>
            <NavLink to="/teams" className={`nav-item ${isOrganizationSettings ? 'active' : ''}`}>
              <Building2 className="sidebar-nav-icon w-4.5 h-4.5 shrink-0" />
              <span>จัดการทีมและแบรนด์</span>
            </NavLink>
          </div>
        )}
      </div>

      {/* Footer: Bottom Logout Action */}
      <div className="sidebar-footer mt-auto pt-2">
        <button
          type="button"
          className="sidebar-logout-btn nav-item"
          onClick={handleLogout}
          title="ออกจากระบบ"
          aria-label="ออกจากระบบ"
        >
          <LogOut className="sidebar-nav-icon logout-icon w-4.5 h-4.5 shrink-0" />
          <span className="logout-label">ออกจากระบบ</span>
        </button>
      </div>

    </div>
  );
}
