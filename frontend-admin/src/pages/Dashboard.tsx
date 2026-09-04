import { useState, useMemo } from 'react';
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
  Briefcase,
  Trees,
  Layers,
  Palette,
  Armchair,
  Search,
  Globe,
} from 'lucide-react';
import type { User } from '../types';

interface AppItem {
  id: string;
  name: string;
  category: 'internal' | 'management' | 'brand';
  icon: any;
  iconColor: string;
  iconBg: string;
  route?: string;
  url?: string;
  isExternal?: boolean;
  adminOnly?: boolean;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { currentUser } = useOutletContext<{ currentUser: User | null }>();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | 'internal' | 'management' | 'brand'>('all');

  const isAdmin = currentUser?.role === 'admin';

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
        name: 'แอพ Wallcraft',
        category: 'management',
        icon: LayoutGrid,
        iconColor: 'text-orange-600 dark:text-orange-400',
        iconBg: 'bg-orange-50 dark:bg-orange-950/60',
        url: 'https://admin.wallcraftthailand.com/',
        isExternal: true,
      },
      {
        id: 'inventory-system',
        name: 'จัดการสินค้า',
        category: 'management',
        icon: Package,
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        iconBg: 'bg-emerald-50 dark:bg-emerald-950/60',
        url: 'https://admin-and-manager-seven.vercel.app/',
        isExternal: true,
      },
      {
        id: 'tms-system',
        name: 'จัดการงาน TMS',
        category: 'management',
        icon: Briefcase,
        iconColor: 'text-cyan-600 dark:text-cyan-400',
        iconBg: 'bg-cyan-50 dark:bg-cyan-950/60',
        url: 'https://taskmanagementsystem.wallcraftthailand.com/',
        isExternal: true,
      },

      // ──── 3. เว็บไซต์และแบรนด์ในเครือบริษัท (Company Brands) ────
      {
        id: 'zen-slab',
        name: 'Zen Slab',
        category: 'brand',
        icon: Trees,
        iconColor: 'text-emerald-700 dark:text-emerald-400',
        iconBg: 'bg-emerald-50 dark:bg-emerald-950/60',
        url: 'https://www.zen-slab.com',
        isExternal: true,
      },
      {
        id: 'wallcraft-thailand',
        name: 'Wallcraft',
        category: 'brand',
        icon: Layers,
        iconColor: 'text-amber-600 dark:text-amber-400',
        iconBg: 'bg-amber-50 dark:bg-amber-950/60',
        url: 'https://wallcraftthailand.com',
        isExternal: true,
      },
      {
        id: 'terra-home',
        name: 'Terra Home',
        category: 'brand',
        icon: Palette,
        iconColor: 'text-stone-700 dark:text-stone-300',
        iconBg: 'bg-stone-100 dark:bg-stone-800',
        url: 'https://terrahome-studio.com',
        isExternal: true,
      },
      {
        id: 'ember-ash',
        name: 'Ember & Ash',
        category: 'brand',
        icon: Armchair,
        iconColor: 'text-violet-600 dark:text-violet-400',
        iconBg: 'bg-violet-50 dark:bg-violet-950/60',
        url: 'https://emberandashliving.vercel.app/',
        isExternal: true,
      },
    ],
    []
  );

  // Filter apps by category, search, and admin permissions
  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      if (app.adminOnly && !isAdmin) {
        return false;
      }
      if (activeCategory !== 'all' && app.category !== activeCategory) {
        return false;
      }
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        return app.name.toLowerCase().includes(query);
      }
      return true;
    });
  }, [apps, activeCategory, searchTerm, isAdmin]);

  const handleOpenApp = (app: AppItem) => {
    if (app.isExternal && app.url) {
      window.open(app.url, '_blank', 'noopener,noreferrer');
    } else if (app.route) {
      navigate(app.route);
    }
  };

  return (
    <div id="dashboard" className="page-section active p-4 md:p-8 max-w-6xl mx-auto">
      {/* ──── Minimalist Top Controls (Category Tabs & Search) ──── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8 pb-3 border-b border-slate-200/80 dark:border-slate-800/80">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 ${
              activeCategory === 'all'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            ทั้งหมด ({apps.filter((a) => !a.adminOnly || isAdmin).length})
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('internal')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 ${
              activeCategory === 'internal'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            ระบบงานภายใน
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('management')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 ${
              activeCategory === 'management'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            ระบบหลังบ้าน
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('brand')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 ${
              activeCategory === 'brand'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            เว็บไซต์ในเครือ
          </button>
        </div>

        {/* Search & Counter */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="ค้นหา..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 bg-slate-100/80 dark:bg-slate-800/70 border border-transparent focus:border-blue-500 rounded-full text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none text-xs transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            )}
          </div>
          <div className="text-[11px] text-slate-400 hidden lg:flex items-center gap-1 shrink-0">
            <Globe className="w-3 h-3" />
            <span>{filteredApps.length}</span>
          </div>
        </div>
      </div>

      {/* ──── Pure Odoo-Style App Launcher Grid (No Cards/Blocks) ──── */}
      {filteredApps.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Search className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-xs">ไม่พบแอปพลิเคชัน</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10 justify-items-center py-2">
          {filteredApps.map((app) => {
            const Icon = app.icon;
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => handleOpenApp(app)}
                className="group flex flex-col items-center justify-start p-2 rounded-2xl hover:bg-slate-100/60 dark:hover:bg-slate-800/40 transition-all duration-150 cursor-pointer focus:outline-none w-24 sm:w-28"
              >
                {/* Clean Squircle Icon Tile */}
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl bg-white dark:bg-[#182035] border border-slate-200/60 dark:border-slate-700/60 shadow-[0_6px_16px_-4px_rgba(0,0,0,0.07)] dark:shadow-[0_8px_20px_-4px_rgba(0,0,0,0.4)] flex items-center justify-center group-hover:scale-105 group-hover:shadow-lg group-hover:-translate-y-1 transition-all duration-200 mb-2">
                  <div className={`w-11 h-11 sm:w-13 sm:h-13 rounded-xl sm:rounded-2xl flex items-center justify-center ${app.iconBg}`}>
                    <Icon className={`w-6 h-6 sm:w-7 sm:h-7 ${app.iconColor}`} />
                  </div>
                  {app.isExternal && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 group-hover:text-blue-500 shadow-2xs text-[9px]">
                      ↗
                    </span>
                  )}
                </div>

                {/* App Name Only */}
                <span className="font-medium text-xs sm:text-[13px] text-slate-700 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors text-center tracking-tight line-clamp-1 leading-snug">
                  {app.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
