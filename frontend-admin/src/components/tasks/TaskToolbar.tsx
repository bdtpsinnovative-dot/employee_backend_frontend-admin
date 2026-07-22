import React from 'react';
import {
  LayoutList,
  Kanban,
  Search,
  Plus,
  Settings,
  X,
} from 'lucide-react';
import type { User, Brand, TaskCategory } from '../../types';

interface TaskToolbarProps {
  viewMode: 'list' | 'board';
  onViewModeChange: (mode: 'list' | 'board') => void;
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
  brands: Brand[];
  categories: TaskCategory[];
  users: User[];
  onOpenCreateModal: () => void;
  onOpenSettingsModal: () => void;
  activeFilterCount: number;
  onClearFilters: () => void;
}

export const TaskToolbar: React.FC<TaskToolbarProps> = ({
  viewMode,
  onViewModeChange,
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
  brands,
  categories,
  users,
  onOpenCreateModal,
  onOpenSettingsModal,
  activeFilterCount,
  onClearFilters,
}) => {
  return (
    <div className="bg-white border-b border-slate-200 px-6 py-4 shadow-2xs space-y-4">
      {/* Top Row: Title + Main Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-semibold shadow-xs">
            <Kanban className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">การจัดการงาน (Task Management)</h1>
            <p className="text-xs text-slate-500 font-medium">ติดตามและมอบหมายงานประจำวันสไตล์ Sheet & Board</p>
          </div>
        </div>

        {/* Right Header Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenSettingsModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all border border-slate-200"
          >
            <Settings className="w-4 h-4 text-slate-500" />
            <span>จัดการ แบรนด์ & หมวดหมู่</span>
          </button>

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
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-medium w-fit">
          <button
            onClick={() => onViewModeChange('list')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all ${
              viewMode === 'list'
                ? 'bg-blue-600 text-white shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900 font-medium'
            }`}
          >
            <LayoutList className="w-4 h-4" />
            <span>List (ตาราง Sheet)</span>
          </button>
          <button
            onClick={() => onViewModeChange('board')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all ${
              viewMode === 'board'
                ? 'bg-blue-600 text-white shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900 font-medium'
            }`}
          >
            <Kanban className="w-4 h-4" />
            <span>Board (บอร์ด)</span>
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

          {/* Priority Filter */}
          <select
            value={selectedPriority}
            onChange={(e) => onPriorityChange(e.target.value)}
            className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-700"
          >
            <option value="">ทุก Priority</option>
            <option value="high">🔥 ด่วนมาก (High)</option>
            <option value="medium">⚡ ปกติ (Medium)</option>
            <option value="low">🌱 ทั่วไป (Low)</option>
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
                {u.first_name} {u.last_name}
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
