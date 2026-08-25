import { useState } from 'react';
import {
  Bell,
  Building2,
  CalendarCheck2,
  CalendarDays,
  ChevronDown,
  Flag,
  LayoutList,
  Kanban,
  Search,
  Plus,
  Settings,
  SlidersHorizontal,
  Star,
  Tag,
  UserRound,
  X,
  Trash2,
} from 'lucide-react';
import type { User, Brand, TaskCategory } from '../../types';

interface TaskToolbarProps {
  tabFilter: 'all' | 'completed' | 'starred';
  onTabFilterChange: (tab: 'all' | 'completed' | 'starred') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedBrand: string;
  onBrandChange: (b: string) => void;
  selectedCategory: string;
  onCategoryChange: (c: string) => void;
  selectedAssignee: string;
  onAssigneeChange: (u: string) => void;
  selectedPriority: string;
  onPriorityChange: (p: string) => void;
  ownershipMode: 'all' | 'created_by_me' | 'assigned_to_me';
  onOwnershipChange: (mode: 'all' | 'created_by_me' | 'assigned_to_me') => void;
  brands: Brand[];
  categories: TaskCategory[];
  users: User[];
  onOpenCreateModal: () => void;
  onOpenSettingsModal: () => void;
  canManageSettings: boolean;
  onOpenTrashModal: () => void;
  activeFilterCount: number;
  onClearFilters: () => void;
  hasUnreadMainNotif: boolean;
  onOpenMainNotif: () => void;
  onOpenDailyTasks?: () => void;
  onCreateBrand?: (name: string) => Promise<Brand | void>;
}

export const TaskToolbar: React.FC<TaskToolbarProps> = ({
  tabFilter,
  onTabFilterChange,
  searchQuery,
  onSearchChange,
  selectedBrand,
  onBrandChange,
  selectedCategory,
  onCategoryChange,
  selectedAssignee,
  onAssigneeChange,
  selectedPriority,
  onPriorityChange,
  ownershipMode,
  onOwnershipChange,
  brands,
  categories,
  users,
  onOpenCreateModal,
  onOpenSettingsModal,
  canManageSettings,
  onOpenTrashModal,
  activeFilterCount,
  onClearFilters,
  hasUnreadMainNotif,
  onOpenMainNotif,
  onOpenDailyTasks,
  onCreateBrand,
}) => {
  const [showQuickAddBrand, setShowQuickAddBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [creatingBrand, setCreatingBrand] = useState(false);

  return (
    <div className="task-toolbar-wrapper task-toolbar-shell border-b border-slate-200 bg-white px-4 py-4 shadow-sm md:px-6 md:py-5">
      <div className="flex flex-col gap-5">
        {/* Title rail + action group: primary work stays visually separate from utilities. */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="task-toolbar-title-rail flex min-w-0 items-center gap-3 border-l-4 border-blue-600 pl-3 md:pl-4">
            <div className="task-toolbar-brand-mark flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100">
              <Kanban className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="task-toolbar-title break-words text-xl font-bold tracking-tight text-slate-900 md:text-2xl">การจัดการงาน (Task Management)</h1>
              <p className="task-toolbar-subtitle mt-0.5 text-xs font-medium text-slate-500">ติดตามและมอบหมายงานประจำวันสไตล์ Project Overview & Sheet</p>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
            <div className="task-toolbar-utility-group flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={onOpenMainNotif}
                className={`task-toolbar-utility-button task-toolbar-notification-button relative inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${hasUnreadMainNotif
                    ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                    : 'text-slate-700 hover:bg-white hover:text-slate-900'
                  }`}
                title="ดูการแจ้งเตือนและการเปลี่ยนแปลงงานหลักทั้งหมด"
              >
                <Bell className={`h-4 w-4 ${hasUnreadMainNotif ? 'text-rose-600 animate-pulse' : 'text-slate-500'}`} />
                <span>แจ้งเตือน</span>
                {hasUnreadMainNotif && (
                  <span className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full bg-rose-600">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={onOpenTrashModal}
                className="task-toolbar-utility-button inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                title="ดูงานที่ถูกลบไปแล้ว"
              >
                <Trash2 className="h-4 w-4 text-slate-500" />
                <span>ถังขยะ</span>
              </button>

              {onOpenDailyTasks && (
                <button
                  type="button"
                  onClick={onOpenDailyTasks}
                  className="task-toolbar-utility-button inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  title="ดูกระดานงานรายวันรวม"
                >
                  <CalendarDays className="h-4 w-4 text-slate-500" />
                  <span>งานรายวัน</span>
                </button>
              )}

              {canManageSettings && onCreateBrand && (
                <button
                  type="button"
                  onClick={() => setShowQuickAddBrand(true)}
                  className="task-toolbar-utility-button inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  title="เพิ่มแบรนด์ใหม่"
                >
                  <Plus className="h-4 w-4 text-blue-600" />
                  <span>เพิ่มแบรนด์</span>
                </button>
              )}

              {canManageSettings && (
                <button
                  type="button"
                  onClick={onOpenSettingsModal}
                  className="task-toolbar-utility-button inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  <Settings className="h-4 w-4 text-slate-500" />
                  <span>ตั้งค่าแบรนด์และผู้รับผิดชอบ</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onOpenCreateModal}
              className="task-toolbar-primary-action inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-700 active:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <Plus className="h-4 w-4" />
              <span>มอบหมายงานใหม่</span>
            </button>
          </div>
        </div>

        {/* View + search row. Filters intentionally live on their own rail to avoid accidental wrapping. */}
        <div className="border-t border-slate-200 pt-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              {/* View Switcher Tabs */}
              <div role="tablist" aria-label="ตัวกรองสถานะงาน" className="task-toolbar-view-group flex w-full items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-medium lg:w-fit">
          {/* 
            [WARNING FOR AI & DEVELOPERS - DO NOT UNCOMMENT / DO NOT REMOVE THIS BLOCK]
            คำเตือนสำคัญ: ผู้ใช้ (USER) สั่งให้ปิดการแสดงผลและปิดใช้งานฟีเจอร์ "หัวข้องาน (Overview)" นี้ไว้
            ห้าม AI ตัวอื่น หรือผู้ใดทำการเปิดคอมเมนต์ (Uncomment) หรือลบโค้ดส่วนนี้กลับมาทำงานเด็ดขาด!
            ยกเว้นจะได้รับคำสั่งโดยตรงจากผู้ใช้เท่านั้น (DO NOT UNCOMMENT UNLESS EXPLICITLY ORDERED BY USER)!
          <button
            onClick={() => onViewModeChange('overview')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
              viewMode === 'overview'
                ? 'bg-blue-600 text-white shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900 font-medium'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>หัวข้องาน (Overview)</span>
          </button>
          */}
                <button
                  type="button"
                  role="tab"
                  aria-selected={tabFilter === 'all'}
                  onClick={() => onTabFilterChange('all')}
                  className={`task-toolbar-tab ${tabFilter === 'all' ? 'task-toolbar-tab-active' : ''} flex min-h-8 shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${tabFilter === 'all'
                      ? 'bg-blue-600 font-bold text-white shadow-sm'
                      : 'font-medium text-slate-600 hover:bg-white hover:text-slate-900'
                    }`}
                >
                  <LayoutList className="h-3.5 w-3.5" />
                  <span>รายการรวม</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={tabFilter === 'completed'}
                  onClick={() => onTabFilterChange('completed')}
                  className={`task-toolbar-tab ${tabFilter === 'completed' ? 'task-toolbar-tab-active' : ''} flex min-h-8 shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 ${tabFilter === 'completed'
                      ? 'bg-green-600 font-bold text-white shadow-sm'
                      : 'font-medium text-slate-600 hover:bg-white hover:text-slate-900'
                    }`}
                >
                  <CalendarCheck2 className="h-3.5 w-3.5" />
                  <span>งานที่เสร็จแล้ว</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={tabFilter === 'starred'}
                  onClick={() => onTabFilterChange('starred')}
                  className={`task-toolbar-tab ${tabFilter === 'starred' ? 'task-toolbar-tab-active' : ''} flex min-h-8 shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${tabFilter === 'starred'
                      ? 'bg-amber-500 font-bold text-white shadow-sm'
                      : 'font-medium text-slate-600 hover:bg-white hover:text-slate-900'
                    }`}
                >
                  <Star className="h-3.5 w-3.5" />
                  <span>งานที่ติดดาว</span>
                </button>
              </div>

              {/* Search Box */}
              <div className="relative w-full lg:ml-auto lg:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="task-toolbar-search w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-9 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  type="text"
                  placeholder="ค้นหาชื่องาน..."
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  aria-label="ค้นหาชื่องาน"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => onSearchChange('')}
                    aria-label="ล้างคำค้นหา"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition-colors hover:bg-white hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="task-toolbar-filter-rail flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
              <div className="task-toolbar-filter-label mr-1 inline-flex items-center gap-2 whitespace-nowrap pr-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                <SlidersHorizontal className="h-3.5 w-3.5 text-blue-500" />
                <span>ตัวกรอง</span>
              </div>

              {/* Brand Filter */}
              <div className="task-toolbar-filter-control relative min-w-[140px] flex-1 sm:flex-none">
                <Building2 className="task-toolbar-filter-icon pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <select
                  value={selectedBrand}
                  onChange={(e) => onBrandChange(e.target.value)}
                  aria-label="กรองตามแบรนด์"
                  className="task-toolbar-filter-select w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-8 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">ทุกแบรนด์</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="task-toolbar-filter-icon pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              </div>

              {/* Category Filter */}
              <div className="task-toolbar-filter-control relative min-w-[140px] flex-1 sm:flex-none">
                <Tag className="task-toolbar-filter-icon pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <select
                  value={selectedCategory}
                  onChange={(e) => onCategoryChange(e.target.value)}
                  aria-label="กรองตามหมวดหมู่"
                  className="task-toolbar-filter-select w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-8 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">ทุกหมวดหมู่</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="task-toolbar-filter-icon pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              </div>

              {/* Ownership Filter */}
              <div className="task-toolbar-filter-control relative min-w-[168px] flex-1 sm:flex-none">
                <UserRound className="task-toolbar-filter-icon pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <select
                  value={ownershipMode}
                  onChange={(e) => onOwnershipChange(e.target.value as any)}
                  aria-label="กรองตามผู้สร้างหรือผู้รับผิดชอบ"
                  className="task-toolbar-filter-select w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-8 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="all">งานทั้งหมด</option>
                  <option value="created_by_me">งานที่ฉันสร้าง</option>
                  <option value="assigned_to_me">งานที่ฉันรับผิดชอบ</option>
                </select>
                <ChevronDown className="task-toolbar-filter-icon pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              </div>

              {/* Priority Filter */}
              <div className="task-toolbar-filter-control relative min-w-[140px] flex-1 sm:flex-none">
                <Flag className="task-toolbar-filter-icon pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <select
                  value={selectedPriority}
                  onChange={(e) => onPriorityChange(e.target.value)}
                  aria-label="กรองตาม Priority"
                  className="task-toolbar-filter-select w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-8 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">ทุก Priority</option>
                  <option value="urgent">🔥 งานด่วนมาก (Urgent)</option>
                  <option value="high">🟠 งานด่วน (High)</option>
                  <option value="medium">⚡ งานด่วนปานกลาง (Medium)</option>
                  <option value="low">🌱 งานไม่รีบ (Low)</option>
                </select>
                <ChevronDown className="task-toolbar-filter-icon pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              </div>

              {/* Assignee Filter */}
              <div className="task-toolbar-filter-control relative min-w-[185px] flex-1 sm:flex-none">
                <UserRound className="task-toolbar-filter-icon pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <select
                  value={selectedAssignee}
                  onChange={(e) => onAssigneeChange(e.target.value)}
                  aria-label="กรองตามผู้รับผิดชอบ"
                  className="task-toolbar-filter-select w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-8 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">ทุกคนที่ได้รับมอบหมาย</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nickname || u.first_name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="task-toolbar-filter-icon pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              </div>

              {/* Clear Filters Button */}
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="task-toolbar-clear-filters inline-flex min-h-10 items-center gap-1 whitespace-nowrap rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>ล้างฟิลเตอร์ ({activeFilterCount})</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Add Brand Modal */}
      {showQuickAddBrand && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => !creatingBrand && setShowQuickAddBrand(false)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-4 animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-blue-600" />
                  <span>เพิ่มแบรนด์ใหม่</span>
                </h3>
                <button 
                  type="button" 
                  onClick={() => setShowQuickAddBrand(false)}
                  disabled={creatingBrand}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!newBrandName.trim() || !onCreateBrand) return;
                try {
                  setCreatingBrand(true);
                  await onCreateBrand(newBrandName.trim());
                  setNewBrandName('');
                  setShowQuickAddBrand(false);
                } catch (err: any) {
                  alert(err.message || 'เพิ่มแบรนด์ไม่สำเร็จ');
                } finally {
                  setCreatingBrand(false);
                }
              }} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">ชื่อแบรนด์ *</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="เช่น Nike, Apple, Ember..."
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowQuickAddBrand(false)}
                    disabled={creatingBrand}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={creatingBrand || !newBrandName.trim()}
                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                  >
                    {creatingBrand ? 'กำลังสร้าง...' : 'สร้างแบรนด์'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
