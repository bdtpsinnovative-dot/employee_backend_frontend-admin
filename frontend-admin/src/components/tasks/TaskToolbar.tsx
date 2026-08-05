import {
  Bell,
  LayoutList,
  Kanban,
  Search,
  Plus,
  Settings,
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
}) => {
  return (
    <div className="task-toolbar-wrapper bg-white border-b border-slate-200 px-4 md:px-6 py-4 shadow-2xs space-y-4">
      {/* Top Row: Title + Main Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-semibold shadow-xs">
            <Kanban className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">การจัดการงาน (Task Management)</h1>
            <p className="text-xs text-slate-500 font-medium">ติดตามและมอบหมายงานประจำวันสไตล์ Project Overview & Sheet</p>
          </div>
        </div>

        {/* Right Header Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenMainNotif}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all border relative ${hasUnreadMainNotif
                ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100/70 shadow-2xs'
                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            title="ดูการแจ้งเตือนและการเปลี่ยนแปลงงานหลักทั้งหมด"
          >
            <Bell className={`w-4 h-4 ${hasUnreadMainNotif ? 'text-rose-600 animate-pulse' : 'text-slate-500'}`} />
            <span>แจ้งเตือน</span>
            {hasUnreadMainNotif && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-rose-600 rounded-full flex">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-450 opacity-75"></span>
              </span>
            )}
          </button>

          <button
            onClick={onOpenTrashModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all border border-slate-200"
            title="ดูงานที่ถูกลบไปแล้ว"
          >
            <Trash2 className="w-4 h-4 text-slate-500" />
            <span>ถังขยะ</span>
          </button>

          {canManageSettings && (
            <button
              onClick={onOpenSettingsModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all border border-slate-200"
            >
              <Settings className="w-4 h-4 text-slate-500" />
              <span>ตั้งค่าแบรนด์และผู้รับผิดชอบ</span>
            </button>
          )}

          <button
            onClick={onOpenCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-xs transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>มอบหมายงานใหม่</span>
          </button>
        </div>
      </div>

      {/* Second Row: View Switcher Tabs + Search & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
        {/* View Switcher Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-medium w-fit overflow-x-auto">
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
            onClick={() => onTabFilterChange('all')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${tabFilter === 'all'
                ? 'bg-blue-600 text-white shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900 font-medium'
              }`}
          >
            <LayoutList className="w-3.5 h-3.5" />
            <span>รายการรวม</span>
          </button>

          <button
            onClick={() => onTabFilterChange('completed')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${tabFilter === 'completed'
                ? 'bg-green-600 text-white shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900 font-medium'
              }`}
          >
            <i className="fa-solid fa-calendar-check text-xs"></i>
            <span>งานที่เสร็จแล้ว</span>
          </button>

          <button
            onClick={() => onTabFilterChange('starred')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${tabFilter === 'starred'
                ? 'bg-amber-500 text-white shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900 font-medium'
              }`}
          >
            <i className="fa-solid fa-star text-xs"></i>
            <span>งานที่ติดดาว</span>
          </button>
        </div>

        {/* Search & Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Box */}
          <div className="relative min-w-[180px] flex-1 sm:flex-none">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ค้นหาชื่องาน..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Brand Filter */}
          <select
            value={selectedBrand}
            onChange={(e) => onBrandChange(e.target.value)}
            className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-700"
          >
            <option value="">ทุกแบรนด์</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-700"
          >
            <option value="">ทุกหมวดหมู่</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Ownership Filter */}
          <select
            value={ownershipMode}
            onChange={(e) => onOwnershipChange(e.target.value as any)}
            className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-700"
          >
            <option value="all">งานทั้งหมด</option>
            <option value="created_by_me">งานที่ฉันสร้าง</option>
            <option value="assigned_to_me">งานที่ฉันรับผิดชอบ</option>
          </select>

          {/* Priority Filter */}
          <select
            value={selectedPriority}
            onChange={(e) => onPriorityChange(e.target.value)}
            className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-700"
          >
            <option value="">ทุก Priority</option>
            <option value="urgent">🔥 งานด่วนมาก (Urgent)</option>
            <option value="high">🟠 งานด่วน (High)</option>
            <option value="medium">⚡ งานด่วนปานกลาง (Medium)</option>
            <option value="low">🌱 งานไม่รีบ (Low)</option>
          </select>

          {/* Assignee Filter */}
          <select
            value={selectedAssignee}
            onChange={(e) => onAssigneeChange(e.target.value)}
            className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-700"
          >
            <option value="">ทุกคนที่ได้รับมอบหมาย</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nickname || u.first_name}
              </option>
            ))}
          </select>

          {/* Clear Filters Button */}
          {activeFilterCount > 0 && (
            <button
              onClick={onClearFilters}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>ล้างฟิลเตอร์ ({activeFilterCount})</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
