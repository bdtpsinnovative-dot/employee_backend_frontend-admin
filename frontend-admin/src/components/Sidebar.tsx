import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  Building2,
  Calendar,
  CalendarDays,
  CalendarCheck,
  History,
  Kanban,
  User as UserIcon,
  Sun,
  Moon,
  LogOut,
  Settings,
} from 'lucide-react';
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
  const profileMenuRef = useRef<HTMLDivElement>(null);
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

  // Click outside to close profile popup
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    if (profileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [profileMenuOpen]);

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
      {/* Top Profile Header: Avatar, Name, Position, Badge & Gear Settings Icon */}
      <div className="sidebar-profile-header relative w-full mb-3" ref={profileMenuRef}>
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
          <div
            className={`sidebar-profile-gear-icon ${profileMenuOpen ? 'active' : ''}`}
            title="การตั้งค่าและโปรไฟล์"
          >
            <Settings className="w-4 h-4" />
          </div>
        </button>

        {/* Premium Floating Profile Dropdown Card */}
        {profileMenuOpen && (
          <div className="sidebar-profile-popover" id="sidebar-profile-menu">
            {/* Header info inside popover */}
            <div className="popover-user-header">
              <div className={`popover-avatar ${profileAvatar ? 'has-image' : 'has-initial'}`}>
                {profileAvatar ? <img src={profileAvatar} alt="" /> : profileInitial}
              </div>
              <div className="popover-user-info">
                <div className="popover-name" title={profileName}>{profileName}</div>
                <div className="popover-meta">
                  <span>{positionText}</span>
                  <span className={`popover-badge ${isAdmin ? 'admin' : 'staff'}`}>
                    {roleBadgeText}
                  </span>
                </div>
              </div>
            </div>

            <div className="popover-divider" />

            {/* Menu options */}
            <div className="popover-actions">
              <NavLink
                to="/profile"
                className={({ isActive }) => `popover-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setProfileMenuOpen(false);
                  onClose();
                }}
              >
                <div className="popover-item-icon blue">
                  <UserIcon className="w-4 h-4" />
                </div>
                <span className="popover-item-label">โปรไฟล์ของฉัน</span>
              </NavLink>

              <button
                type="button"
                className="popover-item"
                onClick={toggleTheme}
                aria-label={`เปลี่ยนเป็นโหมด${resolvedTheme === 'dark' ? 'สว่าง' : 'มืด'}`}
              >
                <div className="popover-item-icon purple">
                  {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </div>
                <div className="flex-1 text-left">
                  <span className="popover-item-label">{resolvedTheme === 'dark' ? 'โหมดสว่าง' : 'โหมดมืด'}</span>
                </div>
                <span className="popover-tag">{mode === 'system' ? 'อัตโนมัติ' : resolvedTheme === 'dark' ? 'มืด' : 'สว่าง'}</span>
              </button>

              <div className="popover-divider" />

              <button
                type="button"
                className="popover-item danger"
                onClick={handleLogout}
              >
                <div className="popover-item-icon red">
                  <LogOut className="w-4 h-4" />
                </div>
                <span className="popover-item-label">ออกจากระบบ</span>
              </button>
            </div>
          </div>
        )}
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
          <NavLink to="/daily-record" className={navLinkClass}>
            <CalendarCheck className="sidebar-nav-icon w-4.5 h-4.5 shrink-0" />
            <span>บันทึกเวลา & การลา</span>
          </NavLink>
          <NavLink to="/history" className={navLinkClass}>
            <History className="sidebar-nav-icon w-4.5 h-4.5 shrink-0" />
            <span>ประวัติย้อนหลัง</span>
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
