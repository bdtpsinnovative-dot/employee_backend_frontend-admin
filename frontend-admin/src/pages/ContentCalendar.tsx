import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Users,
  Sparkles,
  Video,
  Image as ImageIcon,
  FileText,
  Clock,
  ExternalLink,
  Edit3,
  Trash2,
  X,
  LayoutGrid,
  List,
  Flame,
  AlertTriangle,
} from 'lucide-react';
import { fetchAdminTasks, fetchBrands, fetchUsers, createAdminTask, updateAdminTask, deleteAdminTask } from '../services/adminApi';
import type { AdminTask, Brand, User } from '../types';
import { avatarUrl } from '../components/tasks/taskUtils';

export type PlatformType = 'facebook' | 'tiktok' | 'instagram' | 'youtube' | 'lemon8' | 'line' | 'x' | 'other';
export type ContentStatus = 'idea' | 'drafting' | 'in_review' | 'ready' | 'published';
export type ContentFormat = 'video' | 'reel' | 'graphic' | 'article' | 'story';

export interface ContentItem {
  id: string;
  taskId: string;
  title: string;
  description: string;
  brandId?: string;
  brandName?: string;
  platform: PlatformType;
  format: ContentFormat;
  status: ContentStatus;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime?: string; // HH:mm
  assigneeIds: string[];
  assigneeNames: string[];
  postUrl?: string;
  rawTask: AdminTask;
}

const PLATFORM_META: Record<PlatformType, { label: string; short: string; bg: string; text: string }> = {
  facebook: { label: 'Facebook', short: 'FB', bg: 'bg-blue-600', text: 'text-white' },
  tiktok: { label: 'TikTok', short: 'TikTok', bg: 'bg-slate-900', text: 'text-white' },
  instagram: { label: 'Instagram', short: 'IG', bg: 'bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600', text: 'text-white' },
  youtube: { label: 'YouTube', short: 'YT', bg: 'bg-red-600', text: 'text-white' },
  lemon8: { label: 'Lemon8', short: 'Lemon8', bg: 'bg-yellow-400', text: 'text-yellow-950' },
  line: { label: 'Line VOOM', short: 'Line', bg: 'bg-emerald-500', text: 'text-white' },
  x: { label: 'X (Twitter)', short: 'X', bg: 'bg-neutral-800', text: 'text-white' },
  other: { label: 'อื่นๆ', short: 'Other', bg: 'bg-slate-500', text: 'text-white' },
};

const STATUS_META: Record<ContentStatus, { label: string; bg: string; text: string; border: string }> = {
  idea: { label: 'ไอเดีย / แผนงาน', bg: 'bg-purple-50 dark:bg-purple-950/40', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800' },
  drafting: { label: 'กำลังผลิต (Drafting)', bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800' },
  in_review: { label: 'รอตรวจ (In Review)', bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
  ready: { label: 'พร้อมโพสต์ (Ready)', bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
  published: { label: 'โพสต์แล้ว (Published)', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400', border: 'border-slate-200 dark:border-slate-700' },
};

const FORMAT_META: Record<ContentFormat, { label: string; icon: typeof Video }> = {
  video: { label: 'วิดีโอ (Video)', icon: Video },
  reel: { label: 'Reel / Short / TikTok', icon: Sparkles },
  graphic: { label: 'รูปภาพ / กราฟิก', icon: ImageIcon },
  article: { label: 'บทความ / แคปชัน', icon: FileText },
  story: { label: 'Story', icon: Clock },
};

// Helper: parse content metadata from task description or title
function parseContentTask(task: AdminTask, brandsMap: Map<string, Brand>, usersMap: Map<string, User>): ContentItem {
  let platform: PlatformType = 'facebook';
  let format: ContentFormat = 'graphic';
  let status: ContentStatus = 'drafting';
  let scheduledTime = '18:00';
  let postUrl = '';

  const rawDesc = task.description || '';

  // Extract metadata if exists in tags
  const platformMatch = rawDesc.match(/\[platform:(.*?)\]/i);
  if (platformMatch && platformMatch[1]) {
    platform = platformMatch[1].toLowerCase().trim() as PlatformType;
  } else if (task.title.toLowerCase().includes('tiktok')) {
    platform = 'tiktok';
  } else if (task.title.toLowerCase().includes('ig') || task.title.toLowerCase().includes('instagram')) {
    platform = 'instagram';
  } else if (task.title.toLowerCase().includes('yt') || task.title.toLowerCase().includes('youtube')) {
    platform = 'youtube';
  } else if (task.title.toLowerCase().includes('lemon8')) {
    platform = 'lemon8';
  }

  const formatMatch = rawDesc.match(/\[format:(.*?)\]/i);
  if (formatMatch && formatMatch[1]) {
    format = formatMatch[1].toLowerCase().trim() as ContentFormat;
  } else if (platform === 'tiktok' || task.title.toLowerCase().includes('reel') || task.title.toLowerCase().includes('short')) {
    format = 'reel';
  } else if (task.title.toLowerCase().includes('video') || task.title.toLowerCase().includes('คลิป')) {
    format = 'video';
  }

  const statusMatch = rawDesc.match(/\[content_status:(.*?)\]/i);
  if (statusMatch && statusMatch[1]) {
    status = statusMatch[1].toLowerCase().trim() as ContentStatus;
  } else if (task.status === 'completed') {
    status = 'published';
  } else if (task.status === 'in_review') {
    status = 'in_review';
  } else if (task.status === 'in_progress') {
    status = 'drafting';
  } else {
    status = 'idea';
  }

  const timeMatch = rawDesc.match(/\[time:(.*?)\]/i);
  if (timeMatch && timeMatch[1]) {
    scheduledTime = timeMatch[1].trim();
  }

  const urlMatch = rawDesc.match(/\[url:(.*?)\]/i);
  if (urlMatch && urlMatch[1]) {
    postUrl = urlMatch[1].trim();
  }

  // Clean description of tags
  const cleanDescription = rawDesc
    .replace(/\[platform:.*?\]/gi, '')
    .replace(/\[format:.*?\]/gi, '')
    .replace(/\[content_status:.*?\]/gi, '')
    .replace(/\[time:.*?\]/gi, '')
    .replace(/\[url:.*?\]/gi, '')
    .trim();

  // Determine assignees
  const assigneeIds = task.assignee_ids && task.assignee_ids.length > 0 ? task.assignee_ids : (task.assigned_to ? [task.assigned_to] : []);
  const assigneeNames = assigneeIds.map((id) => {
    const u = usersMap.get(id);
    return u ? `${u.first_name}${u.nickname ? ` (${u.nickname})` : ''}` : 'ผู้รับผิดชอบ';
  });

  const scheduledDate = task.due_date ? task.due_date.split('T')[0] : new Date().toISOString().split('T')[0];
  const brandObj = task.brand_id ? brandsMap.get(task.brand_id) : undefined;

  return {
    id: task.id,
    taskId: task.id,
    title: task.title,
    description: cleanDescription,
    brandId: task.brand_id,
    brandName: brandObj?.name,
    platform,
    format,
    status,
    scheduledDate,
    scheduledTime,
    assigneeIds,
    assigneeNames,
    postUrl,
    rawTask: task,
  };
}

export default function ContentCalendar() {
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'list'>('month');

  // Filters
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [selectedBrandId, setSelectedBrandId] = useState<string>('all');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals & Drawers
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContent, setEditingContent] = useState<ContentItem | null>(null);
  const [viewingDetail, setViewingDetail] = useState<ContentItem | null>(null);

  // Form State for Create/Edit
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    brandId: '',
    platform: 'facebook' as PlatformType,
    format: 'graphic' as ContentFormat,
    status: 'drafting' as ContentStatus,
    scheduledDate: new Date().toISOString().split('T')[0],
    scheduledTime: '18:00',
    assignedTo: '',
    postUrl: '',
  });

  // Queries
  const { data: tasks = [] } = useQuery<AdminTask[]>({
    queryKey: ['adminTasks'],
    queryFn: () => fetchAdminTasks('all'),
  });

  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ['brands'],
    queryFn: () => fetchBrands(),
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => fetchUsers(),
  });

  const brandsMap = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  const usersMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  // Convert tasks to content items
  const allContents: ContentItem[] = useMemo(() => {
    return tasks.map((t) => parseContentTask(t, brandsMap, usersMap));
  }, [tasks, brandsMap, usersMap]);

  // Apply filters
  const filteredContents = useMemo(() => {
    return allContents.filter((item) => {
      if (selectedUserId !== 'all' && !item.assigneeIds.includes(selectedUserId)) {
        return false;
      }
      if (selectedBrandId !== 'all' && item.brandId !== selectedBrandId) {
        return false;
      }
      if (selectedPlatform !== 'all' && item.platform !== selectedPlatform) {
        return false;
      }
      if (selectedStatus !== 'all' && item.status !== selectedStatus) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchBrand = item.brandName?.toLowerCase().includes(q) ?? false;
        const matchAssignee = item.assigneeNames.some((n) => n.toLowerCase().includes(q));
        if (!matchTitle && !matchBrand && !matchAssignee) return false;
      }
      return true;
    });
  }, [allContents, selectedUserId, selectedBrandId, selectedPlatform, selectedStatus, searchQuery]);

  // Calendar Helpers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sunday
  const prevMonthDays = new Date(year, month, 0).getDate();

  // Calendar Grid Array
  const calendarCells = useMemo(() => {
    const cells: { dateStr: string; dayNumber: number; isCurrentMonth: boolean }[] = [];

    // Prev month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = month === 0 ? 11 : month - 1;
      const y = month === 0 ? year - 1 : year;
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ dateStr, dayNumber: d, isCurrentMonth: false });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ dateStr, dayNumber: d, isCurrentMonth: true });
    }

    // Next month padding to fill complete weeks (multiples of 7)
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const m = month === 11 ? 0 : month + 1;
      const y = month === 11 ? year + 1 : year;
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ dateStr, dayNumber: d, isCurrentMonth: false });
    }

    return cells;
  }, [year, month, firstDayIndex, daysInMonth, prevMonthDays]);

  // Group contents by date string
  const contentsByDate = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    for (const item of filteredContents) {
      const list = map.get(item.scheduledDate) || [];
      list.push(item);
      map.set(item.scheduledDate, list);
    }
    return map;
  }, [filteredContents]);

  // Handlers
  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const openCreateModal = (dateStr?: string) => {
    const targetDate = dateStr || new Date().toISOString().split('T')[0];
    setEditingContent(null);
    setFormData({
      title: '',
      description: '',
      brandId: brands[0]?.id || '',
      platform: 'facebook',
      format: 'graphic',
      status: 'drafting',
      scheduledDate: targetDate,
      scheduledTime: '18:00',
      assignedTo: users[0]?.id || '',
      postUrl: '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (item: ContentItem) => {
    setEditingContent(item);
    setFormData({
      title: item.title,
      description: item.description,
      brandId: item.brandId || '',
      platform: item.platform,
      format: item.format,
      status: item.status,
      scheduledDate: item.scheduledDate,
      scheduledTime: item.scheduledTime || '18:00',
      assignedTo: item.assigneeIds[0] || '',
      postUrl: item.postUrl || '',
    });
    setIsModalOpen(true);
  };

  const handleSaveContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    // Pack metadata tags into description
    const fullDescription = [
      formData.description.trim(),
      `[platform:${formData.platform}]`,
      `[format:${formData.format}]`,
      `[content_status:${formData.status}]`,
      `[time:${formData.scheduledTime}]`,
      formData.postUrl ? `[url:${formData.postUrl}]` : '',
    ].filter(Boolean).join('\n\n');

    // Map content status to AdminTask status
    let taskStatus: 'pending' | 'in_progress' | 'in_review' | 'completed' = 'in_progress';
    if (formData.status === 'published') taskStatus = 'completed';
    else if (formData.status === 'in_review') taskStatus = 'in_review';
    else if (formData.status === 'idea') taskStatus = 'pending';

    try {
      if (editingContent) {
        await updateAdminTask(editingContent.id, {
          title: formData.title,
          description: fullDescription,
          brand_id: formData.brandId || undefined,
          assigned_to: formData.assignedTo || undefined,
          due_date: `${formData.scheduledDate}T${formData.scheduledTime}:00Z`,
          status: taskStatus,
        });
      } else {
        await createAdminTask({
          title: formData.title,
          description: fullDescription,
          brand_id: formData.brandId || undefined,
          assigned_to: formData.assignedTo || undefined,
          due_date: `${formData.scheduledDate}T${formData.scheduledTime}:00Z`,
          status: taskStatus,
        });
      }

      await queryClient.invalidateQueries({ queryKey: ['adminTasks'] });
      setIsModalOpen(false);
      setViewingDetail(null);
    } catch (err) {
      console.error('Failed to save content item:', err);
    }
  };

  const handleDeleteContent = async (id: string) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบรายการคอนเทนต์นี้?')) return;
    try {
      await deleteAdminTask(id);
      await queryClient.invalidateQueries({ queryKey: ['adminTasks'] });
      setViewingDetail(null);
    } catch (err) {
      console.error('Failed to delete content:', err);
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="content-calendar-page space-y-5 pb-12">
      {/* ── Mockup / Preview Warning Banner ── */}
      <div className="flex items-center gap-3 p-4 bg-amber-500/10 dark:bg-amber-500/15 border-2 border-amber-500/30 dark:border-amber-500/40 rounded-2xl text-amber-900 dark:text-amber-200 shadow-xs">
        <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-amber-500/20">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500 text-white">
              Mockup / Preview Only
            </span>
            <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
              หน้านี้เป็นเพียงตัวอย่างการออกแบบ (ยังไม่เปิดใช้งานจริง)
            </span>
          </div>
          <p className="text-[11px] text-amber-700/90 dark:text-amber-300/80 mt-0.5 leading-relaxed">
            ระบบปฏิทินคอนเทนต์นี้จัดทำขึ้นเพื่อแสดงแนวคิด UI และรูปแบบการทำงานสำหรับการทดลองดูตัวอย่างเท่านั้น ยังไม่สามารถบันทึกข้อมูลเพื่อนำไปใช้งานจริงในระบบ Production ได้
          </p>
        </div>
      </div>

      {/* ── Top Header Bar ── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <CalendarIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              ปฏิทินคอนเทนต์ (Content Calendar)
              <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
                MOCKUP
              </span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                {filteredContents.length} โพสต์
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              วางแผน จัดการคิวโพสต์ และติดตามคอนเทนต์ของทุกแบรนด์ร่วมกันทั้งทีม
            </p>
          </div>
        </div>

        {/* View mode & Action Buttons */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Month / List Switcher */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200/70 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'month'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>เดือน</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>รายการ</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => openCreateModal()}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm shadow-blue-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>สร้างคอนเทนต์ใหม่</span>
          </button>
        </div>
      </div>

      {/* ── Team Member Avatars Rail (Filter by Person or View All) ── */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
            <Users className="w-4 h-4 text-blue-600" />
            <span>พนักงาน & ผู้รับผิดชอบ (Team Visibility)</span>
          </div>
          <span className="text-[11px] text-slate-400">
            {selectedUserId === 'all' ? 'กำลังแสดงคอนเทนต์ของทุกคนในทีม' : 'กำลังแสดงเฉพาะคอนเทนต์ของคนที่เลือก'}
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {/* "All" button */}
          <button
            type="button"
            onClick={() => setSelectedUserId('all')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 border ${
              selectedUserId === 'all'
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs shadow-blue-500/20'
                : 'bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>ทุกคน (ทั้งหมด)</span>
          </button>

          {/* User Avatars */}
          {users.map((u) => {
            const isSelected = selectedUserId === u.id;
            const userAvatar = avatarUrl(u.avatar_url);
            const userCount = allContents.filter((c) => c.assigneeIds.includes(u.id)).length;

            return (
              <button
                key={u.id}
                type="button"
                onClick={() => setSelectedUserId(isSelected ? 'all' : u.id)}
                title={`${u.first_name} ${u.last_name}`}
                className={`flex items-center gap-2 px-2.5 py-1 rounded-xl text-xs font-medium transition-all shrink-0 border ${
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/30'
                    : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                }`}
              >
                <span className="w-6 h-6 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                  {userAvatar ? (
                    <img src={userAvatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    u.first_name.charAt(0)
                  )}
                </span>
                <span className="font-semibold">{u.nickname || u.first_name}</span>
                {userCount > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                    {userCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Brand, Platform & Status Filter Toolbar ── */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Brand chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-thin">
          <button
            type="button"
            onClick={() => setSelectedBrandId('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 border ${
              selectedBrandId === 'all'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            ทุกแบรนด์
          </button>
          {brands.map((b) => {
            const isSelected = selectedBrandId === b.id;
            const count = allContents.filter((c) => c.brandId === b.id).length;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedBrandId(isSelected ? 'all' : b.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 border ${
                  isSelected
                    ? 'bg-amber-500 text-white border-amber-500 shadow-xs shadow-amber-500/20'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                }`}
              >
                <Flame className="w-3 h-3" />
                <span>{b.name}</span>
                {count > 0 && <span className="opacity-80 text-[10px]">({count})</span>}
              </button>
            );
          })}
        </div>

        {/* Dropdowns & Search */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Platform Filter */}
          <select
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="all">ทุกแพลตฟอร์ม</option>
            <option value="facebook">Facebook</option>
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram</option>
            <option value="youtube">YouTube</option>
            <option value="lemon8">Lemon8</option>
            <option value="line">Line VOOM</option>
            <option value="x">X (Twitter)</option>
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="all">ทุกสถานะ</option>
            <option value="idea">💡 ไอเดีย</option>
            <option value="drafting">✍️ กำลังผลิต</option>
            <option value="in_review">👀 รอตรวจ</option>
            <option value="ready">🚀 พร้อมโพสต์</option>
            <option value="published">✅ โพสต์แล้ว</option>
          </select>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหาชื่อคอนเทนต์..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-44 md:w-48"
            />
          </div>
        </div>
      </div>

      {/* ── Main Content Area: Monthly Calendar or List View ── */}
      {viewMode === 'month' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          {/* Calendar Month Navigator */}
          <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {monthNames[month]} {year + 543}
              </h2>
              <button
                type="button"
                onClick={handleToday}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
              >
                วันนี้
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                aria-label="เดือนก่อนหน้า"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                aria-label="เดือนถัดไป"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 text-center text-xs font-bold text-slate-500 py-2.5">
            <div className="text-rose-500">อา.</div>
            <div>จ.</div>
            <div>อ.</div>
            <div>พ.</div>
            <div>พฤ.</div>
            <div>ศ.</div>
            <div className="text-blue-500">ส.</div>
          </div>

          {/* Calendar Grid Cells */}
          <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-100 dark:divide-slate-800/60">
            {calendarCells.map((cell, idx) => {
              const dateContents = contentsByDate.get(cell.dateStr) || [];
              const isToday = cell.dateStr === todayStr;

              return (
                <div
                  key={idx}
                  className={`min-h-[125px] p-2 flex flex-col transition-colors group relative ${
                    cell.isCurrentMonth
                      ? 'bg-white dark:bg-slate-900'
                      : 'bg-slate-50/50 dark:bg-slate-950/40 text-slate-400 dark:text-slate-600'
                  } ${isToday ? 'ring-2 ring-blue-500/30 bg-blue-50/20 dark:bg-blue-950/20' : ''}`}
                >
                  {/* Date Header */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                        isToday
                          ? 'bg-blue-600 text-white shadow-xs'
                          : cell.isCurrentMonth
                          ? 'text-slate-800 dark:text-slate-200'
                          : 'text-slate-400'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>

                    {/* Quick Add Button */}
                    <button
                      type="button"
                      onClick={() => openCreateModal(cell.dateStr)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-md transition-opacity"
                      title={`เพิ่มคอนเทนต์วันที่ ${cell.dateStr}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Content Cards */}
                  <div className="space-y-1.5 overflow-y-auto max-h-[140px] pr-0.5 scrollbar-thin flex-1">
                    {dateContents.map((content) => {
                      const platformInfo = PLATFORM_META[content.platform] || PLATFORM_META.other;
                      const statusInfo = STATUS_META[content.status];

                      return (
                        <div
                          key={content.id}
                          onClick={() => setViewingDetail(content)}
                          className={`p-1.5 rounded-xl border text-[11px] cursor-pointer transition-all hover:scale-[1.01] hover:shadow-sm bg-white dark:bg-slate-800/90 ${statusInfo.border}`}
                        >
                          {/* Platform & Status Badge */}
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span
                              className={`px-1.5 py-0.2 rounded font-extrabold text-[9px] ${platformInfo.bg} ${platformInfo.text}`}
                            >
                              {platformInfo.short}
                            </span>
                            <span className={`text-[9px] font-bold px-1 rounded ${statusInfo.text} ${statusInfo.bg}`}>
                              {statusInfo.label.split(' ')[0]}
                            </span>
                          </div>

                          {/* Title */}
                          <div className="font-bold text-slate-800 dark:text-slate-100 line-clamp-1 leading-tight mb-1">
                            {content.title}
                          </div>

                          {/* Brand & Assignee Footer */}
                          <div className="flex items-center justify-between gap-1 text-[10px] text-slate-500">
                            {content.brandName ? (
                              <span className="font-semibold text-amber-600 dark:text-amber-400 truncate max-w-[70px]">
                                🔥 {content.brandName}
                              </span>
                            ) : (
                              <span></span>
                            )}

                            {/* Assignee Avatar */}
                            <div className="flex -space-x-1 overflow-hidden">
                              {content.assigneeIds.slice(0, 2).map((uid) => {
                                const u = usersMap.get(uid);
                                const avatar = avatarUrl(u?.avatar_url);
                                return (
                                  <span
                                    key={uid}
                                    className="inline-block w-4 h-4 rounded-full ring-1 ring-white bg-slate-200 overflow-hidden text-[8px] font-bold text-center"
                                  >
                                    {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : u?.first_name?.charAt(0)}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── List / Table View ── */}
      {viewMode === 'list' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold">
                <tr>
                  <th className="py-3 px-4">วันที่ & เวลา</th>
                  <th className="py-3 px-4">แพลตฟอร์ม</th>
                  <th className="py-3 px-4">แบรนด์</th>
                  <th className="py-3 px-4">หัวข้อคอนเทนต์</th>
                  <th className="py-3 px-4">รูปแบบ</th>
                  <th className="py-3 px-4">ผู้รับผิดชอบ</th>
                  <th className="py-3 px-4">สถานะ</th>
                  <th className="py-3 px-4 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredContents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      ไม่พบรายการคอนเทนต์ตามเงื่อนไขที่เลือก
                    </td>
                  </tr>
                ) : (
                  filteredContents.map((content) => {
                    const platformInfo = PLATFORM_META[content.platform] || PLATFORM_META.other;
                    const statusInfo = STATUS_META[content.status];
                    const formatInfo = FORMAT_META[content.format];
                    const FormatIcon = formatInfo.icon;

                    return (
                      <tr
                        key={content.id}
                        onClick={() => setViewingDetail(content)}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {content.scheduledDate} <span className="text-slate-400 font-normal">{content.scheduledTime}</span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${platformInfo.bg} ${platformInfo.text}`}>
                            {platformInfo.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                          {content.brandName ? `🔥 ${content.brandName}` : '-'}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900 dark:text-white max-w-xs truncate">
                          {content.title}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <FormatIcon className="w-3.5 h-3.5 text-slate-400" />
                            <span>{formatInfo.label.split(' ')[0]}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {content.assigneeNames.join(', ') || '-'}
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] border ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}>
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditModal(content)}
                              className="p-1 text-slate-500 hover:text-blue-600 rounded"
                              title="แก้ไข"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteContent(content.id)}
                              className="p-1 text-slate-500 hover:text-rose-600 rounded"
                              title="ลบ"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Detail Drawer / Modal ── */}
      {viewingDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded font-bold text-xs ${PLATFORM_META[viewingDetail.platform].bg} ${PLATFORM_META[viewingDetail.platform].text}`}>
                  {PLATFORM_META[viewingDetail.platform].label}
                </span>
                <span className={`px-2 py-0.5 rounded-full font-bold text-xs border ${STATUS_META[viewingDetail.status].bg} ${STATUS_META[viewingDetail.status].text} ${STATUS_META[viewingDetail.status].border}`}>
                  {STATUS_META[viewingDetail.status].label}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setViewingDetail(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                  {viewingDetail.title}
                </h3>
                {viewingDetail.brandName && (
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                    🔥 แบรนด์: {viewingDetail.brandName}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5">กำหนดการโพสต์</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    📅 {viewingDetail.scheduledDate} ({viewingDetail.scheduledTime} น.)
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">รูปแบบคอนเทนต์</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {FORMAT_META[viewingDetail.format].label}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block mb-0.5">ผู้รับผิดชอบ</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    👤 {viewingDetail.assigneeNames.join(', ') || 'ไม่ได้ระบุ'}
                  </span>
                </div>
              </div>

              {viewingDetail.description && (
                <div>
                  <h4 className="text-xs font-bold text-slate-500 mb-1">รายละเอียด / สคริปต์ / แคปชัน:</h4>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {viewingDetail.description}
                  </div>
                </div>
              )}

              {viewingDetail.postUrl && (
                <div>
                  <h4 className="text-xs font-bold text-slate-500 mb-1">ลิงก์โพสต์ / ไฟล์งาน:</h4>
                  <a
                    href={viewingDetail.postUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline font-semibold"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{viewingDetail.postUrl}</span>
                  </a>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <button
                type="button"
                onClick={() => handleDeleteContent(viewingDetail.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>ลบคอนเทนต์</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const item = viewingDetail;
                  setViewingDetail(null);
                  openEditModal(item);
                }}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>แก้ไขข้อมูล</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit Content Modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>{editingContent ? 'แก้ไขคอนเทนต์' : 'สร้างคอนเทนต์ใหม่บนปฏิทิน'}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-bold">MOCKUP</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 mx-5 mt-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>แบบฟอร์มนี้เป็นตัวอย่าง Mockup สำหรับทดสอบรูปแบบการแสดงผล</span>
            </div>

            <form onSubmit={handleSaveContent} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  หัวข้อคอนเทนต์ <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น แนะนำสินค้าใหม่ Ember, คลิปสั้น TikTok..."
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              {/* Brand & Platform */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    แบรนด์
                  </label>
                  <select
                    value={formData.brandId}
                    onChange={(e) => setFormData({ ...formData, brandId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    <option value="">-- ไม่ระบุแบรนด์ --</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    แพลตฟอร์ม
                  </label>
                  <select
                    value={formData.platform}
                    onChange={(e) => setFormData({ ...formData, platform: e.target.value as PlatformType })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    <option value="facebook">Facebook</option>
                    <option value="tiktok">TikTok</option>
                    <option value="instagram">Instagram</option>
                    <option value="youtube">YouTube</option>
                    <option value="lemon8">Lemon8</option>
                    <option value="line">Line VOOM</option>
                    <option value="x">X (Twitter)</option>
                    <option value="other">อื่นๆ</option>
                  </select>
                </div>
              </div>

              {/* Format & Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    รูปแบบคอนเทนต์
                  </label>
                  <select
                    value={formData.format}
                    onChange={(e) => setFormData({ ...formData, format: e.target.value as ContentFormat })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    <option value="graphic">รูปภาพ / แบนเนอร์ (Graphic)</option>
                    <option value="video">วิดีโอ (Video / Short)</option>
                    <option value="reel">Reel / TikTok</option>
                    <option value="article">บทความ (Article / Post)</option>
                    <option value="story">Story</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    สถานะงาน
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as ContentStatus })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    <option value="idea">💡 ไอเดีย / แผนงาน</option>
                    <option value="drafting">✍️ กำลังผลิต (Drafting)</option>
                    <option value="in_review">👀 รอตรวจ (In Review)</option>
                    <option value="ready">🚀 พร้อมโพสต์ (Ready)</option>
                    <option value="published">✅ โพสต์แล้ว (Published)</option>
                  </select>
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    วันที่กำหนดโพสต์
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.scheduledDate}
                    onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    เวลาที่โพสต์
                  </label>
                  <input
                    type="time"
                    value={formData.scheduledTime}
                    onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              </div>

              {/* Assignee */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ผู้รับผิดชอบ
                </label>
                <select
                  value={formData.assignedTo}
                  onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  <option value="">-- เลือกผู้รับผิดชอบ --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.first_name} {u.last_name} {u.nickname ? `(${u.nickname})` : ''} - {u.department || u.position || ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description / Caption */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  รายละเอียด / แคปชัน / โน้ต
                </label>
                <textarea
                  rows={3}
                  placeholder="เขียนแคปชัน บรีฟงาน หรือแนวทางการทำคอนเทนต์..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
                />
              </div>

              {/* Post URL */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ลิงก์โพสต์ / ไดรฟ์ไฟล์งาน (ถ้ามี)
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={formData.postUrl}
                  onChange={(e) => setFormData({ ...formData, postUrl: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              {/* Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-all"
                >
                  {editingContent ? 'บันทึกการแก้ไข' : 'สร้างคอนเทนต์'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
