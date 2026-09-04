import { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import Sidebar from './Sidebar';
import RightPanel from './RightPanel';
import TopHeader from './TopHeader';
import { CommandSearchModal } from './common/CommandSearchModal';
import type { User } from '../types';
import { fetchMe, fetchNotifications, type AppNotification } from '../services/adminApi';
import { queryKeys } from '../lib/queryKeys';
import { supabase } from '../lib/supabase';

const SIDEBAR_STORAGE_KEY = 'hr_sidebar_open';
const ADMIN_ONLY_ROUTES = [
  '/dashboard',
  '/requests',
  '/employees',
  '/backups',
  '/brand-responsibilities',
  '/teams',
  '/task-logs'
];

function getInitialSidebarOpen(): boolean {
  try {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (saved !== null) {
      return saved === 'true';
    }
  } catch { }
  return true;
}

function saveSidebarPref(open: boolean) {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open));
  } catch { }

  try {
    const request = indexedDB.open('hr_preferences_db', 1);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
    };
    request.onsuccess = (e: any) => {
      const db = e.target.result;
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put(open, SIDEBAR_STORAGE_KEY);
    };
  } catch { }
}
export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(getInitialSidebarOpen);
  const [lastTasksSearch, setLastTasksSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentUserLoaded, setCurrentUserLoaded] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const previousNotificationIdsRef = useRef<Set<string> | null>(null);
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const isDashboard = location.pathname === '/dashboard' || location.pathname === '/dashboard/';
  const isTasksPage = location.pathname === '/tasks'
    || location.pathname === '/tasks/'
    || (location.pathname.startsWith('/tasks/') && location.pathname !== '/tasks/daily');

  // Global Ctrl + K / Cmd + K Shortcut to open Search
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    if (isTasksPage) {
      setLastTasksSearch(location.search);
    }
  }, [isTasksPage, location.search]);

  // Realtime Notifications via Supabase WebSocket (0 Polling, 0 unnecessary Egress)
  // New notifications trigger UI updates and invalidate task queries immediately.
  useEffect(() => {
    let stopped = false;
    let requestInFlight = false;

    async function loadNotifications() {
      if (requestInFlight || stopped) return;
      requestInFlight = true;
      try {
        const data = await fetchNotifications();
        if (stopped) return;

        setNotifications((prev) => {
          if (
            prev.length === data.length &&
            prev.every((item, idx) => item.id === data[idx].id && item.is_read === data[idx].is_read)
          ) {
            return prev;
          }
          return data;
        });

        const previousIds = previousNotificationIdsRef.current;
        if (previousIds) {
          const hasNewTaskNotification = data.some((notification) => {
            if (previousIds.has(notification.id) || !notification.metadata) return false;
            const metadata = typeof notification.metadata === 'string'
              ? (() => {
                try { return JSON.parse(notification.metadata as string); } catch { return null; }
              })()
              : notification.metadata;
            return Boolean(metadata && typeof metadata === 'object' && (metadata.task_id || metadata.list_id));
          });

          if (hasNewTaskNotification) {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: queryKeys.tasks('mine') }),
              queryClient.invalidateQueries({ queryKey: queryKeys.tasks('all') }),
            ]);
          }
        }

        previousNotificationIdsRef.current = new Set(data.map((notification) => notification.id));
      } catch { }
      finally {
        requestInFlight = false;
      }
    }

    // 1. Initial load on mount
    void loadNotifications();

    // 2. Refetch when user returns to this browser tab
    const handleFocus = () => {
      if (!document.hidden) {
        void loadNotifications();
      }
    };
    window.addEventListener('focus', handleFocus);

    // 3. Supabase Realtime subscription (Instant push on INSERT, UPDATE, DELETE)
    const channel = supabase
      .channel('realtime_admin_notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
        },
        (payload) => {
          if (stopped) return;

          if (payload.eventType === 'INSERT') {
            const newNotif = payload.new as AppNotification;
            if (currentUser?.id && newNotif.user_id && newNotif.user_id !== currentUser.id) {
              return;
            }
            setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)]);

            // If notification is related to tasks, immediately invalidate task queries
            if (newNotif.metadata) {
              const metadata = typeof newNotif.metadata === 'string'
                ? (() => {
                  try { return JSON.parse(newNotif.metadata as string); } catch { return null; }
                })()
                : newNotif.metadata;
              if (metadata && typeof metadata === 'object' && (metadata.task_id || metadata.list_id)) {
                void queryClient.invalidateQueries({ queryKey: queryKeys.tasks('mine') });
                void queryClient.invalidateQueries({ queryKey: queryKeys.tasks('all') });
              }
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedNotif = payload.new as AppNotification;
            setNotifications((prev) => prev.map((n) => n.id === updatedNotif.id ? updatedNotif : n));
          } else if (payload.eventType === 'DELETE') {
            const oldNotif = payload.old as { id?: string };
            if (oldNotif.id) {
              setNotifications((prev) => prev.filter((n) => n.id !== oldNotif.id));
            }
          }
        }
      )
      .subscribe();

    return () => {
      stopped = true;
      window.removeEventListener('focus', handleFocus);
      supabase.removeChannel(channel);
    };
  }, [queryClient, currentUser]);



  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const user = await fetchMe();
        setCurrentUser(user);
      } catch (err) {
        console.error('ไม่สามารถโหลดข้อมูลผู้ใช้:', err);
      } finally {
        setCurrentUserLoaded(true);
      }
    }
    loadCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUser && currentUser.role !== 'admin') {
      const isAdminRoute = ADMIN_ONLY_ROUTES.some(route =>
        location.pathname === route || location.pathname.startsWith(route + '/')
      );
      if (isAdminRoute) {
        navigate('/history', { replace: true });
      }
    }
  }, [currentUser, location.pathname, navigate]);

  useEffect(() => {
    try {
      const request = indexedDB.open('hr_preferences_db', 1);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
      };
      request.onsuccess = (e: any) => {
        const db = e.target.result;
        const tx = db.transaction('settings', 'readonly');
        const getReq = tx.objectStore('settings').get(SIDEBAR_STORAGE_KEY);
        getReq.onsuccess = () => {
          if (typeof getReq.result === 'boolean') {
            setSidebarOpen(getReq.result);
            try {
              localStorage.setItem(SIDEBAR_STORAGE_KEY, String(getReq.result));
            } catch { }
          }
        };
      };
    } catch { }
  }, []);

  useEffect(() => {
    if (!isDashboard) {
      setSelectedUser(null);
    }
  }, [location.pathname, isDashboard]);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      saveSidebarPref(next);
      return next;
    });
  };

  const handleCloseSidebar = () => {
    setSidebarOpen(false);
    saveSidebarPref(false);
  };

  return (
    <div id="app-section" style={{ display: 'flex', opacity: 1 }}>
      {/* Sidebar Overlay (Mobile) */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
        id="sidebar-overlay"
        onClick={toggleSidebar}
      ></div>

      <Sidebar
        currentUser={currentUser}
        isOpen={sidebarOpen}
        onClose={handleCloseSidebar}
        tasksSearch={lastTasksSearch}
      />

      <div className="main-container flex flex-col flex-1 h-screen overflow-hidden">
        {/* Modern Top Header Bar (YouTube Studio / Linear style) */}
        <TopHeader
          currentUser={currentUser}
          notifications={notifications}
          setNotifications={setNotifications}
          onOpenSearch={() => setIsSearchOpen(true)}
          onToggleSidebar={toggleSidebar}
        />

        <div className="flex-1 flex overflow-hidden w-full relative">
          <div className="content-area flex-1 overflow-y-auto">
            {/* Child Routes Render Here */}
            <Outlet context={{ selectedUser, setSelectedUser, currentUser, currentUserLoaded, notifications, setNotifications }} />
          </div>

          {isDashboard && <RightPanel selectedUser={selectedUser} onSelectUser={setSelectedUser} />}
        </div>
      </div>

      {/* Global Spotlight Search Modal (Ctrl + K) */}
      <CommandSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        currentUser={currentUser}
      />
    </div>
  );
}
