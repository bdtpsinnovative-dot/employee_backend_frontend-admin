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
  const [isHovered, setIsHovered] = useState(false);
  const isAdmin = currentUser?.role === 'admin';
  const isOrganizationSettings = location.pathname === '/teams' || location.pathname === '/brand-responsibilities';
  const profileAvatar = avatarUrl(currentUser?.avatar_url);
  const profileName = currentUser
    ? (currentUser.nickname || currentUser.first_name || 'ผู้ใช้งาน')
    : 'ผู้ใช้งาน';
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

  const handleNavClick = () => {
    if (window.innerWidth <= 768) {
      onClose();
    }
  };

  const navItems = [
    {
      to: '/dashboard',
      icon: LayoutDashboard,
      label: 'ภาพรวมระบบ',
      adminOnly: false,
    },
    {
      to: '/requests',
      icon: CheckSquare,
      label: 'อนุมัติคำขอ',
      adminOnly: true,
      badge: pendingCount,
    },
    {
      to: `/tasks${tasksSearch}`,
      icon: Kanban,
      label: 'จัดการงาน',
      adminOnly: false,
    },
    {
      to: '/content-calendar',
      icon: Calendar,
      label: 'ปฏิทินคอนเทนต์',
      adminOnly: false,
    },
    {
      to: '/holidays',
      icon: CalendarDays,
      label: 'ปฏิทินวันหยุด',
      adminOnly: false,
    },
    {
      to: '/history',
      icon: CalendarCheck,
      label: 'บันทึก & ประวัติเวลา',
      adminOnly: false,
    },
    {
      to: '/employees',
      icon: Users,
      label: 'ฐานข้อมูลพนักงาน',
      adminOnly: true,
    },
    {
      to: '/teams',
      icon: Building2,
      label: 'จัดการทีมและแบรนด์',
      adminOnly: true,
      isActiveOverride: isOrganizationSettings,
    },
  ];

  return (
    <aside
      className={`sidebar ${isOpen ? 'active' : 'collapsed'} fixed top-0 left-0 bottom-0 h-screen bg-white dark:bg-[#0c1222] border-r border-slate-200/80 dark:border-slate-800/80 flex flex-col py-4 z-40 select-none transition-all duration-200 ease-out ${
        isHovered
          ? 'w-[240px] shadow-2xl dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)]'
          : 'w-[68px] shadow-xs'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      id="sidebar"
    >
      {/* 1. Profile Avatar (Strictly Centered when collapsed, user info slides in on hover) */}
      <div className="w-full px-3 mb-3 shrink-0">
        <NavLink
          to="/profile"
          onClick={handleNavClick}
          className="flex items-center w-full rounded-2xl group cursor-pointer focus:outline-none transition-colors hover:bg-slate-100/80 dark:hover:bg-slate-800/60 p-0"
          title={`โปรไฟล์: ${profileName} (${roleBadgeText})`}
        >
          <div className="w-11 h-11 shrink-0 flex items-center justify-center relative">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-xs border border-white dark:border-slate-700 transition-transform group-hover:scale-105">
              {profileAvatar ? (
                <img src={profileAvatar} alt="" className="w-full h-full object-cover" />
              ) : (
                profileInitial
              )}
            </div>
            {/* Status Dot */}
            <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-[#0c1222]" />
          </div>

          <div
            className={`ml-2.5 flex flex-col justify-center overflow-hidden whitespace-nowrap transition-all duration-200 ${
              isHovered ? 'opacity-100 max-w-[160px]' : 'opacity-0 max-w-0 pointer-events-none'
            }`}
          >
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
              {profileName}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-md ${
                  isAdmin
                    ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/80 dark:text-rose-400'
                    : 'bg-blue-100 text-blue-600 dark:bg-blue-950/80 dark:text-blue-400'
                }`}
              >
                {roleBadgeText}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500 truncate">
                {currentUser?.position || (isAdmin ? 'ผู้ดูแลระบบ' : 'พนักงาน')}
              </span>
            </div>
          </div>
        </NavLink>
      </div>

      {/* Centered Divider */}
      <div className="w-full px-3 mb-2 shrink-0">
        <div
          className={`h-[1px] bg-slate-200/80 dark:bg-slate-800 transition-all duration-200 ${
            isHovered ? 'w-full' : 'w-8 mx-auto'
          }`}
        />
      </div>

      {/* 2. Nav Icons (Centered on exact same axis at 34px, labels expand on hover) */}
      <nav className="flex-1 flex flex-col gap-1.5 w-full px-3 overflow-y-auto no-scrollbar">
        {navItems
          .filter((item) => !item.adminOnly || isAdmin)
          .map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={handleNavClick}
                className={({ isActive }) => {
                  const active = item.isActiveOverride !== undefined ? item.isActiveOverride : isActive;
                  return `group flex items-center w-full h-11 rounded-2xl transition-all duration-200 shrink-0 ${
                    active
                      ? 'bg-blue-600 text-white shadow-[0_4px_14px_-2px_rgba(37,99,235,0.45)]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
                  }`;
                }}
              >
                {({ isActive }) => {
                  const active = item.isActiveOverride !== undefined ? item.isActiveOverride : isActive;
                  return (
                    <>
                      <div className="w-11 h-11 shrink-0 flex items-center justify-center relative">
                        <Icon
                          className={`w-5 h-5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                            active ? 'text-white' : ''
                          }`}
                        />

                        {/* Notification Badge */}
                        {Boolean(item.badge && item.badge > 0) && (
                          <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center shadow-xs border-2 border-white dark:border-[#0c1222]">
                            {(item.badge ?? 0) > 99 ? '99+' : item.badge}
                          </span>
                        )}
                      </div>

                      {/* Label Text */}
                      <span
                        className={`ml-1 text-[13px] font-semibold tracking-tight whitespace-nowrap overflow-hidden transition-all duration-200 ${
                          active ? 'text-white font-bold' : ''
                        } ${
                          isHovered
                            ? 'opacity-100 max-w-[160px]'
                            : 'opacity-0 max-w-0 pointer-events-none'
                        }`}
                      >
                        {item.label}
                      </span>

                      {/* Floating Tooltip only when collapsed */}
                      {!isHovered && (
                        <span className="pointer-events-none absolute left-full ml-3 px-2.5 py-1 bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-xs text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 shadow-lg scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50">
                          {item.label}
                        </span>
                      )}
                    </>
                  );
                }}
              </NavLink>
            );
          })}
      </nav>

      {/* Centered Divider */}
      <div className="w-full px-3 my-2 shrink-0">
        <div
          className={`h-[1px] bg-slate-200/80 dark:bg-slate-800 transition-all duration-200 ${
            isHovered ? 'w-full' : 'w-8 mx-auto'
          }`}
        />
      </div>

      {/* 3. Logout Action */}
      <div className="w-full px-3 shrink-0">
        <button
          type="button"
          onClick={handleLogout}
          className="group flex items-center w-full h-11 rounded-2xl text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors focus:outline-none cursor-pointer"
          title="ออกจากระบบ"
          aria-label="ออกจากระบบ"
        >
          <div className="w-11 h-11 shrink-0 flex items-center justify-center">
            <LogOut className="w-5 h-5 shrink-0 transition-transform duration-200 group-hover:scale-110" />
          </div>
          <span
            className={`ml-1 text-[13px] font-semibold tracking-tight text-rose-500 whitespace-nowrap overflow-hidden transition-all duration-200 ${
              isHovered
                ? 'opacity-100 max-w-[160px]'
                : 'opacity-0 max-w-0 pointer-events-none'
            }`}
          >
            ออกจากระบบ
          </span>

          {!isHovered && (
            <span className="pointer-events-none absolute left-full ml-3 px-2.5 py-1 bg-rose-950/95 backdrop-blur-xs text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 shadow-lg scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50">
              ออกจากระบบ
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}
