import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchNotifications, fetchUsers, markNotificationRead, markAllNotificationsRead, type AppNotification } from '../services/adminApi';
import type { User } from '../types';
import { getNotificationSender, getNotificationTargetUrl } from '../utils/notificationHelpers';
import { NotificationAvatar } from '../components/common/NotificationAvatar';

function groupByDate(notifications: AppNotification[]) {
  const groups: Record<string, AppNotification[]> = {};
  for (const n of notifications) {
    const d = new Date(n.created_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    let label: string;
    if (d.toDateString() === today.toDateString()) {
      label = 'วันนี้';
    } else if (d.toDateString() === yesterday.toDateString()) {
      label = 'เมื่อวาน';
    } else {
      label = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
    }
    if (!groups[label]) groups[label] = [];
    groups[label].push(n);
  }
  return groups;
}

export default function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setLoading(true);
      const [notifData, userData] = await Promise.all([
        fetchNotifications().catch(() => []),
        fetchUsers().catch(() => []),
      ]);
      setNotifications(notifData);
      setUsers(userData);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  async function handleMarkOne(id: string) {
    await markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  async function handleNotificationClick(notif: AppNotification) {
    if (!notif.is_read) {
      await handleMarkOne(notif.id);
    }
    const targetUrl = getNotificationTargetUrl(notif);
    navigate(targetUrl);
  }

  const groups = groupByDate(notifications);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
              <i className="fa-solid fa-bell text-white text-base"></i>
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 leading-tight">การแจ้งเตือน</h1>
              <p className="text-xs text-slate-500">
                {unreadCount > 0 ? `${unreadCount} รายการที่ยังไม่ได้อ่าน` : 'อ่านทั้งหมดแล้ว'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors cursor-pointer"
              title="รีเฟรช"
            >
              <i className="fa-solid fa-rotate text-sm"></i>
            </button>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors cursor-pointer"
              >
                <i className="fa-solid fa-check-double text-xs"></i>
                อ่านทั้งหมด
              </button>
            )}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-16 text-center">
            <i className="fa-solid fa-spinner fa-spin text-2xl text-slate-300 mb-3 block"></i>
            <p className="text-sm text-slate-400">กำลังโหลด...</p>
          </div>
        )}

        {/* Empty */}
        {!loading && notifications.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-16 text-center">
            <i className="fa-regular fa-bell-slash text-4xl text-slate-200 mb-4 block"></i>
            <p className="text-sm font-semibold text-slate-400">ยังไม่มีการแจ้งเตือน</p>
            <p className="text-xs text-slate-300 mt-1">การแจ้งเตือนจะปรากฏที่นี่เมื่อมีการอัปเดตงาน</p>
          </div>
        )}

        {/* Grouped List */}
        {!loading && notifications.length > 0 && (
          <div className="space-y-5">
            {Object.entries(groups).map(([label, items]) => (
              <div key={label}>
                {/* Date label */}
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">{label}</span>
                  <div className="flex-1 h-px bg-slate-200"></div>
                </div>

                {/* Notifications */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
                  {items.map(n => {
                    const sender = getNotificationSender(n, users);
                    return (
                      <div
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        className={`flex gap-3.5 px-4 py-3.5 hover:bg-slate-50 transition-colors group cursor-pointer ${!n.is_read ? 'bg-blue-50/50' : ''}`}
                      >
                        {/* Avatar with Action Badge / Fallback Icon */}
                        <NotificationAvatar
                          notification={n}
                          sender={sender}
                          size="lg"
                          className="mt-0.5"
                        />

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-sm leading-snug group-hover:text-blue-600 transition-colors ${!n.is_read ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>
                              {n.title}
                            </p>
                            {!n.is_read && (
                              <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5 flex-shrink-0"></span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 leading-snug">{n.body}</p>
                          <p className="text-[10px] text-slate-400 mt-1.5">
                            {new Date(n.created_at).toLocaleString('th-TH', {
                              hour: '2-digit',
                              minute: '2-digit',
                              day: 'numeric',
                              month: 'short',
                            })}
                          </p>
                        </div>

                        {/* Mark Read button (shows on hover) */}
                        {!n.is_read && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkOne(n.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 shrink-0 self-center w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-indigo-100 hover:text-indigo-600 transition-all cursor-pointer"
                            title="ทำเครื่องหมายว่าอ่านแล้ว"
                          >
                            <i className="fa-solid fa-check text-xs"></i>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

