import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  Kanban,
  Users,
  Calendar,
  CalendarDays,
  CalendarCheck,
  History,
  LayoutDashboard,
  CheckSquare,
  Building2,
  Sparkles,
  ArrowRight,
  Command,
} from 'lucide-react';
import type { User } from '../../types';

interface CommandSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
}

interface NavCommand {
  id: string;
  title: string;
  category: 'หน้าหลัก' | 'การจัดการงาน' | 'การปฏิบัติงาน' | 'การจัดการองค์กร' | 'การดำเนินการ';
  path?: string;
  action?: () => void;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  badge?: string;
}

export const CommandSearchModal: React.FC<CommandSearchModalProps> = ({
  isOpen,
  onClose,
  currentUser,
}) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const isAdmin = currentUser?.role === 'admin';

  const commands: NavCommand[] = [
    {
      id: 'dashboard',
      title: 'ภาพรวมระบบ (Dashboard)',
      category: 'หน้าหลัก',
      path: '/dashboard',
      icon: LayoutDashboard,
      adminOnly: true,
    },
    {
      id: 'requests',
      title: 'อนุมัติคำขอลา & ทำงานนอกสถานที่',
      category: 'หน้าหลัก',
      path: '/requests',
      icon: CheckSquare,
      adminOnly: true,
    },
    {
      id: 'tasks',
      title: 'จัดการงาน (Task Board)',
      category: 'การจัดการงาน',
      path: '/tasks',
      icon: Kanban,
    },
    {
      id: 'content-calendar',
      title: 'ปฏิทินคอนเทนต์ (Content Calendar)',
      category: 'การจัดการงาน',
      path: '/content-calendar',
      icon: Calendar,
    },
    {
      id: 'holidays',
      title: 'ปฏิทินวันหยุดบริษัท',
      category: 'การจัดการงาน',
      path: '/holidays',
      icon: CalendarDays,
    },
    {
      id: 'daily-record',
      title: 'บันทึกเวลาปฏิบัติงาน & การลา',
      category: 'การปฏิบัติงาน',
      path: '/daily-record',
      icon: CalendarCheck,
    },
    {
      id: 'history',
      title: 'ประวัติเวลาปฏิบัติงานย้อนหลัง',
      category: 'การปฏิบัติงาน',
      path: '/history',
      icon: History,
    },
    {
      id: 'employees',
      title: 'ฐานข้อมูลพนักงาน (Employees)',
      category: 'การจัดการองค์กร',
      path: '/employees',
      icon: Users,
      adminOnly: true,
    },
    {
      id: 'teams',
      title: 'จัดการทีมและแบรนด์ (Teams & Brands)',
      category: 'การจัดการองค์กร',
      path: '/teams',
      icon: Building2,
      adminOnly: true,
    },
    {
      id: 'create-task',
      title: 'สร้างงานใหม่ (Create Task)',
      category: 'การดำเนินการ',
      path: '/tasks?create=true',
      icon: Sparkles,
      badge: 'ACTION',
    },
  ];

  const filteredCommands = commands.filter((cmd) => {
    if (cmd.adminOnly && !isAdmin) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      cmd.title.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = filteredCommands[selectedIndex];
        if (selected) {
          handleSelect(selected);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands]);

  const handleSelect = (cmd: NavCommand) => {
    if (cmd.action) {
      cmd.action();
    } else if (cmd.path) {
      navigate(cmd.path);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-20 px-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Spotlight Command Modal */}
      <div className="spotlight-modal relative w-full max-w-2xl rounded-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="spotlight-input-row flex items-center gap-3 px-4 py-3.5">
          <Search className="w-5 h-5 opacity-60 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="spotlight-input flex-1 bg-transparent placeholder:opacity-50 outline-none text-base"
            placeholder="ค้นหาหน้า, งาน, พนักงาน, หรือคำสั่ง... (เช่น จัดการงาน, สร้างงาน, สรุปเวลา)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="p-1 rounded-md opacity-60 hover:opacity-100 hover:bg-slate-500/10 cursor-pointer"
              onClick={() => setQuery('')}
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <span className="top-search-kbd hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-md">
            ESC
          </span>
        </div>

        {/* Results List */}
        <div className="max-h-[380px] overflow-y-auto p-2 divide-y divide-transparent space-y-1">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((cmd, idx) => {
              const Icon = cmd.icon;
              const isSelected = idx === selectedIndex;

              return (
                <button
                  key={cmd.id}
                  type="button"
                  className={`spotlight-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                    isSelected ? 'selected' : ''
                  }`}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => handleSelect(cmd)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-500/10 opacity-80'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-[13.5px] truncate">
                        {cmd.title}
                      </div>
                      <div
                        className={`text-[11px] font-medium ${
                          isSelected ? 'text-blue-100' : 'opacity-60'
                        }`}
                      >
                        {cmd.category}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {cmd.badge && (
                      <span
                        className={`px-2 py-0.5 text-[10px] font-extrabold rounded-md uppercase tracking-wider ${
                          isSelected
                            ? 'bg-white text-blue-700'
                            : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-900/60'
                        }`}
                      >
                        {cmd.badge}
                      </span>
                    )}
                    <ArrowRight
                      className={`w-4 h-4 transition-transform ${
                        isSelected ? 'translate-x-0.5 text-white' : 'opacity-40'
                      }`}
                    />
                  </div>
                </button>
              );
            })
          ) : (
            <div className="py-12 text-center opacity-60">
              <Command className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">ไม่พบผลลัพธ์ที่ตรงกับ "{query}"</p>
              <p className="text-xs opacity-75 mt-1">ลองค้นหาด้วยคำอื่น เช่น จัดการงาน, พนักงาน หรือ ปฏิทิน</p>
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="spotlight-footer px-4 py-2.5 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-3">
            <span>↑↓ เพื่อเลือก</span>
            <span>↵ เพื่อเปิด</span>
          </div>
          <span>HR System Spotlight Search</span>
        </div>
      </div>
    </div>
  );
};
