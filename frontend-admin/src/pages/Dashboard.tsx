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
  ExternalLink,
  Search,
  Sparkles,
  ArrowRight,
  Globe,
} from 'lucide-react';
import type { User } from '../types';

interface AppItem {
  id: string;
  name: string;
  category: 'internal' | 'management' | 'brand';
  description: string;
  icon: any;
  gradient: string;
  iconColor?: string;
  badge: string;
  badgeColor: string;
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
      // ──── 1. ระบบงานภายใน (Core Internal Systems) ────
      {
        id: 'tasks',
        name: 'จัดการงาน',
        category: 'internal',
        description: 'บอร์ดมอบหมายงาน ติดตามสถานะ และ Trello Kanban',
        icon: Kanban,
        gradient: 'from-blue-600 to-indigo-600',
        badge: 'ระบบภายใน',
        badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
        route: '/tasks',
      },
      {
        id: 'content-calendar',
        name: 'ปฏิทินคอนเทนต์',
        category: 'internal',
        description: 'วางแผนและจัดตารางเผยแพร่สื่อออนไลน์และคอนเทนต์',
        icon: Calendar,
        gradient: 'from-rose-500 to-pink-600',
        badge: 'ระบบภายใน',
        badgeColor: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300',
        route: '/content-calendar',
      },
      {
        id: 'attendance',
        name: 'บันทึก & ประวัติเวลา',
        category: 'internal',
        description: 'ดูประวัติการเข้างาน คำนวณชั่วโมง และบันทึกเวลาทำงาน',
        icon: Clock,
        gradient: 'from-sky-500 to-cyan-600',
        badge: 'ระบบภายใน',
        badgeColor: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
        route: '/history',
      },
      {
        id: 'holidays',
        name: 'ปฏิทินวันหยุด',
        category: 'internal',
        description: 'ตารางวันหยุดประจำปี วันหยุดนักขัตฤกษ์ และวันหยุดบริษัท',
        icon: CalendarDays,
        gradient: 'from-amber-500 to-yellow-600',
        badge: 'ระบบภายใน',
        badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
        route: '/holidays',
      },
      {
        id: 'requests',
        name: 'อนุมัติคำขอ',
        category: 'internal',
        description: 'พิจารณาอนุมัติใบลา ปฏิบัติงานนอกสถานที่ และคำขอต่างๆ',
        icon: CheckSquare,
        gradient: 'from-emerald-500 to-green-600',
        badge: 'เฉพาะแอดมิน',
        badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
        route: '/requests',
        adminOnly: true,
      },
      {
        id: 'employees',
        name: 'ฐานข้อมูลพนักงาน',
        category: 'internal',
        description: 'โครงสร้างองค์กร รายชื่อพนักงาน และข้อมูลติดต่อทีมงาน',
        icon: Users,
        gradient: 'from-cyan-500 to-blue-600',
        badge: 'เฉพาะแอดมิน',
        badgeColor: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300',
        route: '/employees',
        adminOnly: true,
      },
      {
        id: 'teams',
        name: 'จัดการทีมและแบรนด์',
        category: 'internal',
        description: 'กำหนดโครงสร้างแผนก ตำแหน่ง และผู้รับผิดชอบแบรนด์',
        icon: Building2,
        gradient: 'from-purple-500 to-indigo-600',
        badge: 'เฉพาะแอดมิน',
        badgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
        route: '/teams',
        adminOnly: true,
      },
      {
        id: 'backups',
        name: 'สำรองและกู้คืนข้อมูล',
        category: 'internal',
        description: 'ระบบสำรองฐานข้อมูล Cloud R2 และเครื่องมือ Restore',
        icon: Database,
        gradient: 'from-teal-600 to-emerald-700',
        badge: 'เฉพาะแอดมิน',
        badgeColor: 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300',
        route: '/backups',
        adminOnly: true,
      },
      {
        id: 'task-logs',
        name: 'บันทึกกิจกรรมระบบ',
        category: 'internal',
        description: 'ตรวจสอบ Timeline และบันทึกการทำงานในระบบทั้งหมด',
        icon: FileText,
        gradient: 'from-slate-600 to-zinc-700',
        badge: 'เฉพาะแอดมิน',
        badgeColor: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
        route: '/task-logs',
        adminOnly: true,
      },

      // ──── 2. ระบบจัดการภายนอกและคลังสินค้า (Management Systems) ────
      {
        id: 'wallcraft-admin',
        name: 'ระบบจัดการ แอพ Wallcraft',
        category: 'management',
        description: 'ระบบหลังบ้านสำหรับบริหารจัดการแอปพลิเคชัน Wallcraft',
        icon: LayoutGrid,
        gradient: 'from-orange-500 to-red-600',
        badge: 'External Admin',
        badgeColor: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
        url: 'https://admin.wallcraftthailand.com/',
        isExternal: true,
      },
      {
        id: 'inventory-system',
        name: 'ระบบจัดการสินค้า & ยอดขาย',
        category: 'management',
        description: 'ระบบจัดการสต็อกสินค้าทั้งหมด ตรวจสอบคลัง และรายงานยอดขาย',
        icon: Package,
        gradient: 'from-emerald-600 to-teal-700',
        badge: 'Inventory & Sales',
        badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
        url: 'https://admin-and-manager-seven.vercel.app/',
        isExternal: true,
      },
      {
        id: 'tms-system',
        name: 'ระบบจัดการงาน (TMS)',
        category: 'management',
        description: 'ระบบบริหารจัดการงานภายนอกและบันทึกเวลาพนักงาน',
        icon: Briefcase,
        gradient: 'from-sky-600 to-blue-700',
        badge: 'Task Management',
        badgeColor: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
        url: 'https://taskmanagementsystem.wallcraftthailand.com/',
        isExternal: true,
      },

      // ──── 3. เว็บไซต์และแบรนด์ในเครือบริษัท (Company Brands) ────
      {
        id: 'zen-slab',
        name: 'Zen Slab',
        category: 'brand',
        description: 'ไม้แผ่นเดียวพรีเมียมจากแก่นแท้ธรรมชาติ คุณค่าแห่งความงาม',
        icon: Trees,
        gradient: 'from-emerald-700 to-green-800',
        badge: 'Brand Website',
        badgeColor: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
        url: 'https://www.zen-slab.com',
        isExternal: true,
      },
      {
        id: 'wallcraft-thailand',
        name: 'Wallcraft Thailand',
        category: 'brand',
        description: 'ศูนย์รวมสินค้าผนังและระแนงไม้คุณภาพสูงสำหรับงานตกแต่ง',
        icon: Layers,
        gradient: 'from-amber-600 to-orange-700',
        badge: 'Brand Website',
        badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
        url: 'https://wallcraftthailand.com',
        isExternal: true,
      },
      {
        id: 'terra-home',
        name: 'Terra Home Studio',
        category: 'brand',
        description: 'ของตกแต่งบ้าน ดีไซน์มินิมอล สไตล์ Wabi-Sabi เรียบง่ายอบอุ่น',
        icon: Palette,
        gradient: 'from-amber-700 to-stone-800',
        badge: 'Studio Web',
        badgeColor: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
        url: 'https://terrahome-studio.com',
        isExternal: true,
      },
      {
        id: 'ember-ash',
        name: 'Ember & Ash Living',
        category: 'brand',
        description: 'เฟอร์นิเจอร์ดีไซน์พรีเมียม สไตล์โมเดิร์นร่วมสมัยเพื่อการอยู่อาศัย',
        icon: Armchair,
        gradient: 'from-violet-700 to-purple-800',
        badge: 'Living Web',
        badgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
        url: 'https://emberandashliving.vercel.app/',
        isExternal: true,
      },
    ],
    []
  );

  // Filter apps by category, search, and admin permissions
  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      // Hide admin-only apps for non-admin users
      if (app.adminOnly && !isAdmin) {
        return false;
      }
      // Filter by category tab
      if (activeCategory !== 'all' && app.category !== activeCategory) {
        return false;
      }
      // Filter by search query
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        return (
          app.name.toLowerCase().includes(query) ||
          app.description.toLowerCase().includes(query) ||
          app.badge.toLowerCase().includes(query)
        );
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
    <div id="dashboard" className="page-section active p-4 md:p-8 max-w-7xl mx-auto">
      {/* ──── Hero Header Banner ──── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 shadow-2xl p-6 sm:p-10 mb-8 text-center text-white">
        {/* Glow ambient lights */}
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold tracking-wider uppercase text-blue-200 mb-4 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
            <span>NEXHR ECOSYSTEM & PLATFORM HUB</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-3 text-white leading-tight font-['Prompt']">
            All your business on{' '}
            <span className="relative inline-block text-amber-400">
              one platform.
              <span className="absolute left-0 bottom-0 w-full h-1.5 bg-amber-400/40 rounded-full -mb-1" />
            </span>
          </h1>

          <p className="text-xl sm:text-2xl font-semibold text-slate-200 mb-3 tracking-wide">
            Simple, efficient, yet{' '}
            <span className="text-sky-400 underline decoration-sky-400/80 decoration-wavy decoration-2">
              powerful!
            </span>
          </p>

          <p className="text-sm sm:text-base text-slate-300 max-w-xl text-center leading-relaxed">
            ศูนย์รวมทุกระบบงานขององค์กรในที่เดียว เข้าถึงระบบจัดการงาน สถิติเวลา และเว็บไซต์ในเครือได้ทันที
          </p>

          {/* Live Search Bar inside hero */}
          <div className="w-full max-w-md mt-6 relative">
            <div className="relative flex items-center">
              <Search className="absolute left-4 w-4.5 h-4.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="ค้นหาระบบงาน, บริการ, หรือเว็บไซต์..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white/10 hover:bg-white/15 focus:bg-white/20 border border-white/20 focus:border-sky-400 rounded-2xl text-white placeholder-slate-400 outline-none backdrop-blur-md transition-all text-sm shadow-inner"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3.5 text-xs bg-white/20 hover:bg-white/30 text-white rounded-full px-2 py-0.5"
                >
                  ล้าง
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ──── Category Filter Tabs ──── */}
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all shrink-0 ${
              activeCategory === 'all'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            ทั้งหมด ({apps.filter((a) => !a.adminOnly || isAdmin).length})
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('internal')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all shrink-0 ${
              activeCategory === 'internal'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            ระบบงานภายใน
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('management')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all shrink-0 ${
              activeCategory === 'management'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            ระบบจัดการหลังบ้าน
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('brand')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all shrink-0 ${
              activeCategory === 'brand'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            เว็บไซต์แบรนด์ในเครือ
          </button>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5" />
          <span>แสดง {filteredApps.length} รายการ</span>
        </div>
      </div>

      {/* ──── App Tiles Grid (Odoo Style) ──── */}
      {filteredApps.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 dark:bg-slate-900/40 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
          <Search className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">ไม่พบระบบงานที่ค้นหา</h3>
          <p className="text-sm text-slate-500 mt-1">ลองเปลี่ยนคำค้นหา หรือเลือกหมวดหมู่อื่นดูนะครับ</p>
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setActiveCategory('all');
            }}
            className="mt-4 px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-xl shadow-sm hover:bg-blue-700"
          >
            แสดงทั้งหมด
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 sm:gap-6">
          {filteredApps.map((app) => {
            const Icon = app.icon;
            return (
              <div
                key={app.id}
                onClick={() => handleOpenApp(app)}
                className="group relative flex flex-col items-center text-center p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#161c2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm hover:shadow-xl hover:-translate-y-1.5 hover:border-blue-400/40 dark:hover:border-blue-500/40 transition-all duration-200 cursor-pointer overflow-hidden"
              >
                {/* External Indicator Pin */}
                {app.isExternal && (
                  <div className="absolute top-3 right-3 text-slate-400 group-hover:text-blue-500 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </div>
                )}

                {/* Squircle App Icon Box */}
                <div
                  className={`w-16 h-16 sm:w-18 sm:h-18 rounded-2xl sm:rounded-3xl bg-gradient-to-br ${app.gradient} flex items-center justify-center text-white shadow-md group-hover:scale-105 group-hover:shadow-lg transition-transform duration-200 mb-3.5`}
                >
                  <Icon className="w-8 h-8 sm:w-9 sm:h-9 drop-shadow-sm" />
                </div>

                {/* App Name */}
                <h3 className="font-bold text-sm sm:text-base text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1 mb-1 font-['Prompt']">
                  {app.name}
                </h3>

                {/* App Short Description */}
                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-3 px-1">
                  {app.description}
                </p>

                {/* Badge Tag */}
                <div className="mt-auto pt-1">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${app.badgeColor}`}
                  >
                    {app.badge}
                    {app.isExternal && <ArrowRight className="w-2.5 h-2.5 opacity-60" />}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
