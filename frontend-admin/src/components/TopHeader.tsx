import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Search,
  Plus,
  Bell,
  HelpCircle,
  Sun,
  Moon,
} from 'lucide-react';
import type { User } from '../types';
import { type AppNotification, fetchUsers, markNotificationRead, markAllNotificationsRead } from '../services/adminApi';
import { useTheme } from '../theme/ThemeProvider';
import { avatarUrl } from './tasks/taskUtils';
import { getNotificationSender, getNotificationTargetUrl, formatNotificationBody } from '../utils/notificationHelpers';
import { NotificationAvatar } from './common/NotificationAvatar';

interface TopHeaderProps {
  currentUser: User | null;
  notifications: AppNotification[];
  setNotifications?: React.Dispatch<React.SetStateAction<AppNotification[]>>;
  onOpenSearch: () => void;
  onToggleSidebar: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  currentUser,
  notifications = [],
  setNotifications,
  onOpenSearch,
  onToggleSidebar,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [notifOpen, setNotifOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);

  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    fetchUsers().then(setUsers).catch(() => {});
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const profileAvatar = avatarUrl(currentUser?.avatar_url);
  const profileInitial = currentUser?.first_name?.trim().charAt(0).toUpperCase() || 'U';

  const handleNotificationClick = async (notif: AppNotification) => {
    if (!notif.is_read) {
      try {
        await markNotificationRead(notif.id);
        if (setNotifications) {
          setNotifications((prev) =>
            prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
          );
        }
      } catch (err) {
        console.error('Failed to mark notification read:', err);
      }
    }

    setNotifOpen(false);

    const targetUrl = getNotificationTargetUrl(notif);
    navigate(targetUrl);
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      if (setNotifications) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      }
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  // Click outside handlers
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
      if (helpRef.current && !helpRef.current.contains(event.target as Node)) {
        setHelpOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Quick Action: Create Task
  const handleQuickCreate = () => {
    if (location.pathname.startsWith('/tasks')) {
      // If already on tasks page, append search param to open modal
      navigate('/tasks?create=true');
    } else {
      navigate('/tasks?create=true');
    }
  };

  return (
    <header className="top-header-bar sticky top-0 z-40 w-full flex items-center justify-between px-4 sm:px-6 transition-colors">
      {/* Left: Mobile Toggle & Mini Brand / Page Hint */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="md:hidden p-2 rounded-xl top-header-icon-btn transition-colors"
          onClick={onToggleSidebar}
          aria-label="เปิดเมนูด้านข้าง"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="hidden sm:flex items-center gap-2.5">
          <img src="/app_icon_v2.svg" alt="HR System Logo" className="w-8 h-8 object-contain shrink-0 drop-shadow-xs" />
          <span className="font-black text-[16px] text-blue-600 tracking-tight">
            HR Studio
          </span>
        </div>
      </div>

      {/* Center: YouTube Studio-style Pill Search Bar (Global Spotlight Trigger) */}
      <div className="flex-1 max-w-xl mx-4">
        <button
          type="button"
          onClick={onOpenSearch}
          className="top-search-pill w-full flex items-center justify-between gap-3 px-4 py-2 transition-all text-sm group shadow-2xs hover:shadow-xs cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Search className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors shrink-0" />
            <span className="truncate text-[13px]">
              ค้นหาพนักงาน, งาน, คำขอลา...
            </span>
          </div>
          <span className="top-search-kbd hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-bold rounded-full shadow-2xs">
            Ctrl + K
          </span>
        </button>
      </div>

      {/* Right: Quick Actions (Create Task, AI, Notification, Help, Theme, Avatar) */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* + สร้างงานใหม่ Button */}
        <button
          type="button"
          onClick={handleQuickCreate}
          className="top-header-btn-create hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>สร้างงานใหม่</span>
        </button>

        {/* 🔔 Notifications Bell */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((prev) => !prev)}
            className="top-header-icon-btn relative p-2 transition-colors cursor-pointer"
            title="การแจ้งเตือน"
            aria-label="การแจ้งเตือน"
          >
            <Bell className="w-4.5 h-4.5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] font-extrabold shadow-xs">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Popover */}
          {notifOpen && (
            <div className="top-header-popover absolute right-0 mt-2 w-84 sm:w-96 rounded-2xl overflow-hidden z-50 shadow-xl border border-slate-200/80 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150">
              <div className="top-header-popover-header flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <strong className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    การแจ้งเตือน
                  </strong>
                  {unreadCount > 0 && (
                    <span className="notif-badge-pill">
                      {unreadCount} ใหม่
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2.5">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="text-xs text-slate-500 hover:text-blue-600 font-medium cursor-pointer transition-colors"
                    >
                      อ่านทั้งหมด
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-xs text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
                    onClick={() => setNotifOpen(false)}
                  >
                    ปิด
                  </button>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                {notifications.length > 0 ? (
                  notifications.slice(0, 10).map((notif) => {
                    const sender = getNotificationSender(notif, users);
                    return (
                      <div
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className={`top-notif-item p-3.5 flex items-start gap-3 transition-all cursor-pointer group hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                          !notif.is_read ? 'top-notif-unread' : ''
                        }`}
                      >
                        {/* Profile Picture with Action Badge */}
                        <NotificationAvatar
                          notification={notif}
                          sender={sender}
                          size="md"
                          className="mt-0.5"
                        />

                        {/* Notification content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {notif.title}
                            </span>
                            <span className="text-[10px] text-slate-400 shrink-0">
                              {new Date(notif.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-[11.5px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2 leading-relaxed">
                            {formatNotificationBody(notif.body, users)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-8 text-center opacity-60 text-xs">
                    ไม่มีการแจ้งเตือนใหม่ในขณะนี้
                  </div>
                )}
              </div>

              {/* View all notifications footer */}
              <div className="p-2 border-t border-slate-100 dark:border-slate-800 text-center bg-slate-50/50 dark:bg-slate-900/50">
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen(false);
                    navigate('/notifications');
                  }}
                  className="w-full py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-slate-800/80 rounded-xl transition-all cursor-pointer"
                >
                  ดูการแจ้งเตือนทั้งหมด
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ❓ Help / Shortcuts Modal */}
        <div className="relative" ref={helpRef}>
          <button
            type="button"
            onClick={() => setHelpOpen((prev) => !prev)}
            className="top-header-icon-btn p-2 transition-colors cursor-pointer"
            title="คู่มือ & ปุ่มลัด"
          >
            <HelpCircle className="w-4.5 h-4.5" />
          </button>

          {/* Help Popover */}
          {helpOpen && (
            <div className="top-header-popover absolute right-0 mt-2 w-72 rounded-2xl p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
              <strong className="text-xs font-bold uppercase tracking-wider block mb-2">
                คีย์ลัดที่ใช้บ่อย
              </strong>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="opacity-80">ค้นหาด่วน</span>
                  <kbd className="top-search-kbd px-2 py-0.5 rounded text-[10px] font-mono">
                    Ctrl + K
                  </kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="opacity-80">สลับเมนูด้านข้าง</span>
                  <kbd className="top-search-kbd px-2 py-0.5 rounded text-[10px] font-mono">
                    Hover / Click
                  </kbd>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 🌓 Quick Theme Switch */}
        <button
          type="button"
          onClick={toggleTheme}
          className="top-header-icon-btn p-2 transition-colors cursor-pointer"
          title={`เปลี่ยนเป็นโหมด${resolvedTheme === 'dark' ? 'สว่าง' : 'มืด'}`}
          aria-label="เปลี่ยนธีม"
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="w-4.5 h-4.5 text-amber-400" />
          ) : (
            <Moon className="w-4.5 h-4.5 text-slate-600" />
          )}
        </button>

        {/* Top Right Mini User Avatar */}
        <div
          className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all ml-1 shrink-0"
          onClick={() => navigate('/profile')}
          title={currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : 'โปรไฟล์'}
        >
          {profileAvatar ? (
            <img src={profileAvatar} alt="" className="w-full h-full object-cover" />
          ) : (
            profileInitial
          )}
        </div>
      </div>
    </header>
  );
};
export default TopHeader;
