import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  Kanban,
  Calendar,
  Clock,
  CalendarDays,
  CheckSquare,
  Users,
  Building2,
  Database,
  FileText,
  LayoutGrid,
  Package,
  Search,
  Sun,
  Moon,
  LogOut,
  Bell,
  ArrowLeft,
  Smartphone,
  BriefcaseBusiness,
} from 'lucide-react';
import type { User } from '../types';
import { useTheme } from '../theme/ThemeProvider';
import { supabase } from '../lib/supabase';
import { avatarUrl } from '../components/tasks/taskUtils';

interface AppItem {
  id: string;
  name: string;
  category: 'internal' | 'management';
  icon?: any;
  iconColor?: string;
  iconBg?: string;
  imageSrc?: string;
  imageClassName?: string;
  imageContainerClassName?: string;
  tileClassName?: string;
  route?: string;
  url?: string;
  isExternal?: boolean;
  adminOnly?: boolean;
}

interface BrandBanner {
  id: string;
  name: string;
  badge: string;
  accentBadge: string;
  description: string;
  domain: string;
  url: string;
  bannerImg: string;
  hoverBorder: string;
  hoverText: string;
  actionColor: string;
  actionHoverBg: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { resolvedTheme, toggleTheme } = useTheme();
  const { currentUser, notifications = [] } = useOutletContext<{
    currentUser: User | null;
    notifications?: any[];
  }>();
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<'all' | 'internal' | 'management' | 'brand'>('all');

  const isAdmin = currentUser?.role === 'admin';
  const profileAvatar = avatarUrl(currentUser?.avatar_url);
  const profileName = currentUser?.nickname || currentUser?.first_name || 'ผู้ใช้งาน';
  const profileInitial = currentUser?.first_name?.trim().charAt(0).toUpperCase() || 'U';

  const unreadNotifCount = useMemo(
    () => notifications.filter((n: any) => !n.is_read).length,
    [notifications]
  );

  const apps: AppItem[] = useMemo(
    () => [
      // ──── 1. ระบบงานภายใน (Internal Core Systems) ────
      {
        id: 'tasks',
        name: 'จัดการงาน',
        category: 'internal',
        icon: Kanban,
        iconColor: 'text-blue-600 dark:text-blue-400',
        iconBg: 'bg-blue-50 dark:bg-blue-950/60',
        route: '/tasks',
      },
      {
        id: 'sales-tasks',
        name: 'งาน Sales',
        category: 'internal',
        icon: BriefcaseBusiness,
        iconColor: 'text-amber-700 dark:text-amber-300',
        iconBg: 'bg-amber-50 dark:bg-amber-950/60',
        route: '/sales-tasks',
      },
      {
        id: 'content-calendar',
        name: 'ปฏิทินคอนเทนต์',
        category: 'internal',
        icon: Calendar,
        iconColor: 'text-rose-600 dark:text-rose-400',
        iconBg: 'bg-rose-50 dark:bg-rose-950/60',
        route: '/content-calendar',
      },
      {
        id: 'attendance',
        name: 'บันทึกเวลา',
        category: 'internal',
        icon: Clock,
        iconColor: 'text-sky-600 dark:text-sky-400',
        iconBg: 'bg-sky-50 dark:bg-sky-950/60',
        route: '/history',
      },
      {
        id: 'holidays',
        name: 'ปฏิทินวันหยุด',
        category: 'internal',
        icon: CalendarDays,
        iconColor: 'text-amber-600 dark:text-amber-400',
        iconBg: 'bg-amber-50 dark:bg-amber-950/60',
        route: '/holidays',
      },
      {
        id: 'requests',
        name: 'อนุมัติคำขอ',
        category: 'internal',
        icon: CheckSquare,
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        iconBg: 'bg-emerald-50 dark:bg-emerald-950/60',
        route: '/requests',
        adminOnly: true,
      },
      {
        id: 'employees',
        name: 'ข้อมูลพนักงาน',
        category: 'internal',
        icon: Users,
        iconColor: 'text-indigo-600 dark:text-indigo-400',
        iconBg: 'bg-indigo-50 dark:bg-indigo-950/60',
        route: '/employees',
        adminOnly: true,
      },
      {
        id: 'teams',
        name: 'ทีมและแบรนด์',
        category: 'internal',
        icon: Building2,
        iconColor: 'text-purple-600 dark:text-purple-400',
        iconBg: 'bg-purple-50 dark:bg-purple-950/60',
        route: '/teams',
        adminOnly: true,
      },
      {
        id: 'backups',
        name: 'สำรองข้อมูล',
        category: 'internal',
        icon: Database,
        iconColor: 'text-teal-600 dark:text-teal-400',
        iconBg: 'bg-teal-50 dark:bg-teal-950/60',
        route: '/backups',
        adminOnly: true,
      },
      {
        id: 'task-logs',
        name: 'กิจกรรมระบบ',
        category: 'internal',
        icon: FileText,
        iconColor: 'text-slate-600 dark:text-slate-300',
        iconBg: 'bg-slate-100 dark:bg-slate-800',
        route: '/task-logs',
        adminOnly: true,
      },

      // ──── 2. ระบบจัดการภายนอกและคลังสินค้า (Management Systems) ────
      {
        id: 'wallcraft-admin',
        name: 'แอดมิน Wallcraft',
        category: 'management',
        icon: LayoutGrid,
        iconBg: 'bg-black',
        imageSrc: '/brands/wallcraft.png',
        imageClassName: 'w-full h-full object-cover scale-[1.08]',
        imageContainerClassName: 'w-full h-full rounded-2xl sm:rounded-3xl flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#26211f] via-[#080808] to-[#3f342d] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_10px_20px_rgba(15,23,42,0.24)]',
        tileClassName: 'bg-gradient-to-br from-[#f9f5f1] to-[#eee4db] border-[#dfd0c3]',
        url: 'https://admin.wallcraftthailand.com/',
        isExternal: true,
      },
      {
        id: 'inventory-system',
        name: 'จัดการสินค้า Terra Home',
        category: 'management',
        icon: Package,
        iconBg: 'bg-black',
        imageSrc: '/brands/terrahome-logo.png',
        imageClassName: 'w-full h-full object-contain p-1.5 sm:p-2',
        imageContainerClassName: 'w-full h-full rounded-2xl sm:rounded-3xl flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_28%_20%,#ffd6c7_0%,#f49b7f_42%,#d8646d_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.42),0_10px_20px_rgba(190,85,86,0.3)]',
        tileClassName: 'bg-gradient-to-br from-[#fff5f0] to-[#f5d8d0] border-[#f0c1b5]',
        url: 'https://admin-and-manager-seven.vercel.app/',
        isExternal: true,
      },
      {
        id: 'download-app',
        name: 'ดาวน์โหลดแอป',
        category: 'management',
        icon: Smartphone,
        iconColor: 'text-violet-600 dark:text-violet-400',
        iconBg: 'bg-violet-50 dark:bg-violet-950/60',
        route: '/download-app',
      },
    ],
    []
  );

  // ──── 3. เว็บไซต์และแบรนด์ในเครือบริษัท (Affiliated Brand Websites) ────
  const brandBanners: BrandBanner[] = useMemo(
    () => [
      {
        id: 'zen-slab',
        name: 'Zen Slab',
        badge: 'Wood Slabs',
        accentBadge: 'text-emerald-400 border-emerald-500/30',
        description: 'ไม้แผ่นเดียวและเฟอร์นิเจอร์ไม้แท้ธรรมชาติระดับพรีเมียม',
        domain: 'zen-slab.com',
        url: 'https://www.zen-slab.com',
        bannerImg: '/banners/zenslab.webp',
        hoverBorder: 'hover:border-emerald-500/50 dark:hover:border-emerald-500/50',
        hoverText: 'group-hover:text-emerald-500 dark:group-hover:text-emerald-400',
        actionColor: 'text-emerald-500 dark:text-emerald-400',
        actionHoverBg: 'group-hover:bg-emerald-500',
      },
      {
        id: 'wallcraft-thailand',
        name: 'Wallcraft',
        badge: 'Wallcovering',
        accentBadge: 'text-amber-400 border-amber-500/30',
        description: 'วอลเปเปอร์นำเข้าและวัสดุปิดผิวตกแต่งผนังระดับลักชัวรี่',
        domain: 'wallcraftthailand.com',
        url: 'https://wallcraftthailand.com',
        bannerImg: '/banners/wallcraft.webp',
        hoverBorder: 'hover:border-amber-500/50 dark:hover:border-amber-500/50',
        hoverText: 'group-hover:text-amber-500 dark:group-hover:text-amber-400',
        actionColor: 'text-amber-500 dark:text-amber-400',
        actionHoverBg: 'group-hover:bg-amber-500',
      },
      {
        id: 'terra-home',
        name: 'Terra Home',
        badge: 'Home Studio',
        accentBadge: 'text-stone-300 border-stone-400/30',
        description: 'ของแต่งบ้านและงานออกแบบสถาปัตยกรรมสไตล์อบอุ่น',
        domain: 'terrahome-studio.com',
        url: 'https://terrahome-studio.com',
        bannerImg: '/banners/terrahome.webp',
        hoverBorder: 'hover:border-amber-600/50 dark:hover:border-amber-600/50',
        hoverText: 'group-hover:text-amber-600 dark:group-hover:text-amber-400',
        actionColor: 'text-amber-600 dark:text-amber-400',
        actionHoverBg: 'group-hover:bg-amber-600',
      },
      {
        id: 'ember-ash',
        name: 'Ember & Ash',
        badge: 'Luxury Living',
        accentBadge: 'text-violet-400 border-violet-500/30',
        description: 'เฟอร์นิเจอร์สไตล์โมเดิร์นลักชัวรี่ ผสานหินอ่อนและไม้ธรรมชาติ',
        domain: 'emberandashliving.com',
        url: 'https://emberandashliving.vercel.app/',
        bannerImg: '/banners/emberash.webp',
        hoverBorder: 'hover:border-violet-500/50 dark:hover:border-violet-500/50',
        hoverText: 'group-hover:text-violet-500 dark:group-hover:text-violet-400',
        actionColor: 'text-violet-500 dark:text-violet-400',
        actionHoverBg: 'group-hover:bg-violet-500',
      },
    ],
    []
  );

  // Filter launcher apps by category, search, and admin permissions
  const filteredApps = useMemo(() => {
    if (activeCategory === 'brand') {
      return [];
    }
    return apps.filter((app) => {
      if (app.adminOnly && !isAdmin) {
        return false;
      }
      if (activeCategory !== 'all' && app.category !== activeCategory) {
        return false;
      }
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        return (
          app.name.toLowerCase().includes(query) ||
          app.id.toLowerCase().includes(query) ||
          (app.url && app.url.toLowerCase().includes(query))
        );
      }
      return true;
    });
  }, [apps, activeCategory, searchTerm, isAdmin]);

  // Filter brand banners by search and category
  const filteredBrands = useMemo(() => {
    if (activeCategory === 'internal' || activeCategory === 'management') {
      return [];
    }
    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase();
      return brandBanners.filter(
        (b) =>
          b.name.toLowerCase().includes(query) ||
          b.description.toLowerCase().includes(query) ||
          b.badge.toLowerCase().includes(query) ||
          b.domain.toLowerCase().includes(query)
      );
    }
    return brandBanners;
  }, [brandBanners, activeCategory, searchTerm]);

  const handleOpenApp = (app: AppItem) => {
    if (app.isExternal && app.url) {
      window.open(app.url, '_blank', 'noopener,noreferrer');
    } else if (app.route) {
      navigate(app.route);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div id="dashboard" className="page-section active min-h-screen bg-[var(--page-bg)] flex flex-col relative">
      {/* Subtle Luxury Ambient Radial Glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-50/50 via-transparent to-transparent dark:from-blue-950/20 dark:via-transparent dark:to-transparent" />

      {/* ──── Executive Luxury Floating Rounded Header ──── */}
      <div className="sticky top-0 z-30 w-full px-2.5 sm:px-6 pt-2 sm:pt-3 pb-1 pointer-events-none">
        <header className="pointer-events-auto max-w-7xl mx-auto bg-white/95 dark:bg-[#0c1222]/95 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 rounded-xl sm:rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.4)] px-3 sm:px-6 h-14 sm:h-15 flex items-center justify-between gap-2 sm:gap-4 transition-all">
          {isMobileSearchOpen ? (
            /* Mobile Full-Width Search Mode */
            <div className="w-full flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150">
              <button
                type="button"
                onClick={() => setIsMobileSearchOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer shrink-0"
                aria-label="ย้อนกลับ"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="ค้นหาระบบงานหรือแบรนด์..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoFocus
                  className="w-full pl-9 pr-8 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none text-xs sm:text-sm focus:ring-2 focus:ring-blue-500/20"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-md bg-slate-200 dark:bg-slate-700 text-[10px] text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* 1. Left: Brand & Pure Original Logo */}
              <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
                <img
                  src="/app_icon_v2.svg"
                  alt="HR Studio"
                  className="w-8 h-8 sm:w-9 sm:h-9 object-contain cursor-pointer transition-transform hover:scale-105 shrink-0"
                  onClick={() => {
                    setActiveCategory('all');
                    setSearchTerm('');
                  }}
                />
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="font-extrabold text-base sm:text-[18px] tracking-tight text-slate-800 dark:text-white font-['Prompt'] whitespace-nowrap select-none">
                    HR Studio
                  </span>
                  <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60 shadow-2xs whitespace-nowrap select-none">
                    Portal
                  </span>
                </div>
              </div>

              {/* 2. Right: Search Box + Action Cluster */}
              <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
                {/* Mobile Search Icon Trigger (< sm) */}
                <button
                  type="button"
                  onClick={() => setIsMobileSearchOpen(true)}
                  className="sm:hidden w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                  title="ค้นหาระบบงาน..."
                  aria-label="ค้นหา"
                >
                  <Search className="w-4 h-4" />
                </button>

                {/* Tablet & Desktop Search Box (>= sm) */}
                <div className="relative hidden sm:block w-48 sm:w-56 md:w-64 lg:w-72 group shrink-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none shrink-0" />
                  <input
                    type="text"
                    placeholder="ค้นหาระบบงานหรือแบรนด์..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-7 py-1.5 bg-slate-100/90 dark:bg-slate-850/90 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-750 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none text-xs transition-all shadow-2xs focus:ring-2 focus:ring-blue-500/20"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-[10px] text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block shrink-0" />

                {/* Theme Toggle Button */}
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-amber-50/80 dark:hover:bg-amber-950/30 border border-transparent hover:border-amber-200/50 dark:hover:border-amber-900/30 transition-all cursor-pointer shrink-0"
                  title={`เปลี่ยนเป็นโหมด${resolvedTheme === 'dark' ? 'สว่าง' : 'มืด'}`}
                >
                  {resolvedTheme === 'dark' ? (
                    <Sun className="w-4 h-4 text-amber-400 transition-transform duration-300 hover:rotate-45 shrink-0" />
                  ) : (
                    <Moon className="w-4 h-4 transition-transform duration-300 hover:-rotate-12 shrink-0" />
                  )}
                </button>

                {/* Notification Bell */}
                <button
                  type="button"
                  onClick={() => navigate('/notifications')}
                  className="relative w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/80 dark:hover:bg-blue-950/30 border border-transparent hover:border-blue-200/50 dark:hover:border-blue-900/30 transition-all cursor-pointer shrink-0"
                  title="การแจ้งเตือน"
                >
                  <Bell className="w-4 h-4 shrink-0" />
                  {unreadNotifCount > 0 && (
                    <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center ring-2 ring-white dark:ring-[#0c1222] animate-pulse">
                      {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                    </span>
                  )}
                </button>

                {/* User Profile Chip */}
                <button
                  type="button"
                  onClick={() => navigate('/profile')}
                  className="group flex items-center gap-2 p-1 sm:pl-1.5 sm:pr-3 sm:py-1 rounded-xl bg-slate-100/90 dark:bg-slate-850/90 hover:bg-slate-200/80 dark:hover:bg-slate-750 border border-slate-200/70 dark:border-slate-700/60 shadow-2xs hover:shadow-xs transition-all cursor-pointer shrink-0"
                  title={`โปรไฟล์: ${profileName}`}
                >
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg overflow-hidden bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center text-xs font-bold ring-1 ring-white/60 dark:ring-slate-700 shrink-0">
                    {profileAvatar ? (
                      <img src={profileAvatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      profileInitial
                    )}
                  </div>
                  <div className="hidden sm:flex flex-col items-start text-left leading-none">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors max-w-[90px] truncate">
                      {profileName}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium capitalize mt-0.5">
                      {isAdmin ? 'Admin' : 'Staff'}
                    </span>
                  </div>
                </button>

                {/* Logout Button */}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200/50 dark:hover:border-rose-900/30 transition-all cursor-pointer shrink-0"
                  title="ออกจากระบบ"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                </button>
              </div>
            </>
          )}
        </header>
      </div>

      {/* ──── Full-Screen App Launcher & Brand Banners ──── */}
      <main className="flex-1 px-3 sm:px-6 lg:px-8 py-6 sm:py-12 max-w-6xl mx-auto w-full flex flex-col justify-center">
        {filteredApps.length === 0 && filteredBrands.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Search className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-3 opacity-60" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">ไม่พบแอปพลิเคชันหรือเว็บไซต์ที่ค้นหา</p>
            <p className="text-xs text-slate-400 mt-1">ลองค้นหาด้วยคำสำคัญอื่น หรือเปลี่ยนหมวดหมู่</p>
          </div>
        ) : (
          <div className="space-y-10 sm:space-y-14 w-full">
            {/* Section 1: ระบบงานและเครื่องมือ (Systems & Tools) */}
            {filteredApps.length > 0 && (
              <section className="w-full">
                {activeCategory === 'all' && (
                  <div className="flex items-center justify-between mb-5 sm:mb-6">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500 shadow-xs shadow-blue-500/50" />
                      <h2 className="text-xs sm:text-sm font-bold tracking-tight text-slate-700 dark:text-slate-200 font-['Prompt']">
                        ระบบงานและเครื่องมือ
                      </h2>
                      <span className="text-[11px] text-slate-400 font-medium">({filteredApps.length})</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-2 xs:gap-x-4 sm:gap-x-8 gap-y-6 sm:gap-y-10 justify-items-center py-2">
                  {filteredApps.map((app) => {
                    const Icon = app.icon;
                    return (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => handleOpenApp(app)}
                        className="group flex flex-col items-center justify-start p-1.5 sm:p-2 rounded-2xl hover:bg-slate-100/60 dark:hover:bg-slate-800/40 transition-all duration-150 cursor-pointer focus:outline-none w-20 xs:w-24 sm:w-28"
                      >
                        {/* Clean Squircle Icon Tile */}
                        <div className={`relative w-14 h-14 xs:w-16 xs:h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-[0_6px_16px_-4px_rgba(0,0,0,0.07)] dark:shadow-[0_8px_20px_-4px_rgba(0,0,0,0.4)] flex items-center justify-center group-hover:scale-105 group-hover:shadow-lg group-hover:-translate-y-1 transition-all duration-200 mb-1.5 sm:mb-2 ${app.tileClassName || 'bg-white dark:bg-[#182035]'}`}>
                          {app.imageSrc ? (
                            <div className={`${app.imageContainerClassName || 'w-9 h-9 xs:w-11 xs:h-11 sm:w-13 sm:h-13 rounded-xl sm:rounded-2xl flex items-center justify-center overflow-hidden shadow-2xs'} ${app.iconBg || 'bg-black'}`}>
                              <img
                                src={app.imageSrc}
                                alt={app.name}
                                className={app.imageClassName || 'w-full h-full object-cover'}
                              />
                            </div>
                          ) : Icon ? (
                            <div className={`w-9 h-9 xs:w-11 xs:h-11 sm:w-13 sm:h-13 rounded-xl sm:rounded-2xl flex items-center justify-center ${app.iconBg}`}>
                              <Icon className={`w-5 h-5 xs:w-6 xs:h-6 sm:w-7 sm:h-7 ${app.iconColor}`} />
                            </div>
                          ) : null}
                        </div>

                        {/* App Name Only */}
                        <span className="font-medium text-[11px] xs:text-xs sm:text-[13px] text-slate-700 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors text-center tracking-tight line-clamp-2 leading-tight px-0.5 break-words">
                          {app.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Section 2: เว็บไซต์และแบรนด์ในเครือ (Affiliated Brand Banners) */}
            {filteredBrands.length > 0 && (
              <section className={`w-full ${filteredApps.length > 0 ? 'pt-8 sm:pt-10 border-t border-slate-200/60 dark:border-slate-800/80' : ''}`}>
                <div className="flex items-center justify-between mb-5 sm:mb-6">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500/50" />
                    <h2 className="text-xs sm:text-sm font-bold tracking-tight text-slate-700 dark:text-slate-200 font-['Prompt']">
                      เว็บไซต์และแบรนด์ในเครือ
                    </h2>
                    <span className="text-[11px] text-slate-400 font-medium">({filteredBrands.length})</span>
                  </div>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium hidden sm:inline-block">
                    Official Brand Websites
                  </span>
                </div>

                {/* Luxury Brand Banner Cards Grid (Pure Visual Banners) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6 py-2">
                  {filteredBrands.map((brand) => (
                    <a
                      key={brand.id}
                      href={brand.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${brand.name} - ${brand.description}`}
                      className={`group relative z-0 hover:z-30 flex flex-col rounded-xl overflow-hidden bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-[0_6px_24px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_30px_-6px_rgba(0,0,0,0.5)] transform-gpu hover:scale-[1.25] sm:hover:scale-[1.8] hover:-translate-y-3.5 hover:shadow-[0_28px_55px_-12px_rgba(0,0,0,0.35)] dark:hover:shadow-[0_28px_55px_-12px_rgba(0,0,0,0.95)] ${brand.hoverBorder} transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] [backface-visibility:hidden] [transform:translateZ(0)] cursor-pointer`}
                    >
                      <LiveBrandPreview brand={brand} />
                    </a>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function LiveBrandPreview({ brand }: { brand: BrandBanner }) {
  const [iframeReady, setIframeReady] = useState(false);
  const [showLivePreview, setShowLivePreview] = useState(false);

  useEffect(() => {
    if (!iframeReady) return;

    const animationTimer = window.setTimeout(() => setShowLivePreview(true), 180);
    return () => window.clearTimeout(animationTimer);
  }, [iframeReady]);

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100 dark:bg-slate-800 [backface-visibility:hidden]">
      <img
        src={brand.bannerImg}
        alt={brand.name}
        className={`absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-700 ease-out [backface-visibility:hidden] ${showLivePreview ? 'opacity-0' : 'opacity-100'}`}
      />

      <iframe
        src={brand.url}
        title={`ตัวอย่างเว็บไซต์ ${brand.name}`}
        loading="lazy"
        tabIndex={-1}
        scrolling="no"
        onLoad={() => setIframeReady(true)}
        className={`pointer-events-none absolute left-0 top-0 h-[500%] w-[500%] origin-top-left scale-[0.2] border-0 transition-opacity duration-700 ease-out ${showLivePreview ? 'opacity-100' : 'opacity-0'}`}
      />

      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent transition-opacity duration-700 ${showLivePreview ? 'opacity-0' : 'opacity-100'}`} />
    </div>
  );
}
