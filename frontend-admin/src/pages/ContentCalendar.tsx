import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar as CalendarIcon,
  ChevronDown,
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
  MessageCircle,
  MoreHorizontal,
  Music2,
  ExternalLink,
  Edit3,
  Trash2,
  X,
  LayoutGrid,
  List,
} from 'lucide-react';
import { fetchContentTasks, fetchBrands, fetchUsers, fetchTaskCategories, createAdminTask, updateAdminTask, deleteAdminTask } from '../services/adminApi';

import type { AdminTask, Brand, User, TaskCategory } from '../types';
import { queryKeys } from '../lib/queryKeys';
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
  categoryId?: string;
  categoryName?: string;
  platforms: PlatformType[];   // multi-select — อ่านจาก DB column
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

function PlatformLogo({ platform, className = 'w-3.5 h-3.5' }: { platform: PlatformType; className?: string }) {
  switch (platform) {
    case 'facebook':
      return <span className={`${className} flex items-center justify-center rounded-full bg-[#1877F2] text-[11px] font-black leading-none text-white`}>f</span>;
    case 'tiktok':
      return <span className={`${className} flex items-center justify-center rounded-full bg-slate-950 text-white`}><Music2 className="w-2.5 h-2.5" /></span>;
    case 'instagram':
      return <span className={`${className} flex items-center justify-center rounded-[4px] bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white`}><svg viewBox="0 0 24 24" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.75" fill="currentColor" stroke="none" /></svg></span>;
    case 'youtube':
      return <span className={`${className} flex items-center justify-center rounded-[4px] bg-red-600 text-white`}><svg viewBox="0 0 24 24" className="w-2.5 h-2.5" fill="currentColor"><path d="M21.6 7.2a2.9 2.9 0 0 0-2-2C17.8 4.7 12 4.7 12 4.7s-5.8 0-7.6.5a2.9 2.9 0 0 0-2 2C2 9 2 12 2 12s0 3 .4 4.8a2.9 2.9 0 0 0 2 2c1.8.5 7.6.5 7.6.5s5.8 0 7.6-.5a2.9 2.9 0 0 0 2-2C22 15 22 12 22 12s0-3-.4-4.8ZM10 15.5v-7l6 3.5-6 3.5Z" /></svg></span>;
    case 'lemon8':
      return <span className={`${className} flex items-center justify-center rounded-full bg-yellow-300 text-[9px] font-black leading-none text-yellow-950`}>8</span>;
    case 'line':
      return <span className={`${className} flex items-center justify-center rounded-full bg-[#06C755] text-white`}><MessageCircle className="w-2.5 h-2.5" /></span>;
    case 'x':
      return <span className={`${className} flex items-center justify-center rounded-full bg-black text-[10px] font-black leading-none text-white`}>𝕏</span>;
    default:
      return <span className={`${className} flex items-center justify-center rounded-full bg-slate-500 text-white`}><MoreHorizontal className="w-2.5 h-2.5" /></span>;
  }
}

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
function parseContentTask(
  task: AdminTask,
  brandsMap: Map<string, Brand>,
  usersMap: Map<string, User>,
  categoriesMap: Map<string, TaskCategory>
): ContentItem {
  let format: ContentFormat = 'graphic';
  let status: ContentStatus = 'drafting';
  let scheduledTime = '18:00';
  let postUrl = '';

  const rawDesc = task.description || '';

  // ── Platforms: อ่านจาก DB column task.platforms ก่อน ──────────────────
  // ถ้าไม่มีให้ fallback ตรวจจากชื่องาน/description tag
  let platforms: PlatformType[] = [];
  if (task.platforms && task.platforms.length > 0) {
    platforms = task.platforms as PlatformType[];
  } else {
    // Fallback: ตรวจจาก description tag [platform:...]
    const platformMatch = rawDesc.match(/\[platform:(.*?)\]/i);
    if (platformMatch && platformMatch[1]) {
      const tagPlatforms = platformMatch[1].split(',').map(p => p.trim().toLowerCase() as PlatformType);
      platforms = tagPlatforms;
    } else {
      // Fallback: ตรวจจากชื่องาน
      const titleLower = task.title.toLowerCase();
      if (titleLower.includes('tiktok')) platforms.push('tiktok');
      if (titleLower.includes('ig') || titleLower.includes('instagram')) platforms.push('instagram');
      if (titleLower.includes('yt') || titleLower.includes('youtube')) platforms.push('youtube');
      if (titleLower.includes('lemon8')) platforms.push('lemon8');
      if (titleLower.includes('facebook') || titleLower.includes('fb')) platforms.push('facebook');
      if (platforms.length === 0) platforms = ['other'];
    }
  }

  const formatMatch = rawDesc.match(/\[format:(.*?)\]/i);
  if (formatMatch && formatMatch[1]) {
    format = formatMatch[1].toLowerCase().trim() as ContentFormat;
  } else if (platforms.includes('tiktok') || task.title.toLowerCase().includes('reel') || task.title.toLowerCase().includes('short')) {
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
  const categoryObj = task.category_id ? categoriesMap.get(task.category_id) : undefined;

  return {
    id: task.id,
    taskId: task.id,
    title: task.title,
    description: cleanDescription,
    brandId: task.brand_id,
    brandName: brandObj?.name,
    categoryId: task.category_id,
    categoryName: categoryObj?.name,
    platforms,
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
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isAssigneeMenuOpen, setIsAssigneeMenuOpen] = useState(false);

  // Modals & Drawers
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContent, setEditingContent] = useState<ContentItem | null>(null);
  const [viewingDetail, setViewingDetail] = useState<ContentItem | null>(null);

  // Form State for Create/Edit
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    brandId: '',
    categoryId: '',
    platforms: ['facebook'] as PlatformType[],
    format: 'graphic' as ContentFormat,
    status: 'drafting' as ContentStatus,
    scheduledDate: new Date().toISOString().split('T')[0],
    scheduledTime: '18:00',
    assignedTo: '',
    postUrl: '',
  });


  // Queries
  const { data: tasks = [] } = useQuery<AdminTask[]>({
    queryKey: ['tasks', 'content'],
    queryFn: () => fetchContentTasks(),
  });


  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: queryKeys.brands,
    queryFn: () => fetchBrands(),
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: queryKeys.users('all'),
    queryFn: () => fetchUsers(),
  });

  const { data: categories = [] } = useQuery<TaskCategory[]>({
    queryKey: queryKeys.taskCategories,
    queryFn: () => fetchTaskCategories(),
  });

  const brandsMap = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  const usersMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const categoriesMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // Categories belonging to "Content" (e.g. Content Branding, Content For sale, Content Knowledge)
  const contentCategories = useMemo(() => {
    return categories.filter(
      (c) => c.name.toLowerCase().includes('content') || c.name.includes('คอนเทนต์')
    );
  }, [categories]);

  const contentCategoryIds = useMemo(() => {
    return new Set(contentCategories.map((c) => c.id));
  }, [contentCategories]);

  // Convert and filter tasks to real Content items
  const allContents: ContentItem[] = useMemo(() => {
    const contentTasks = tasks.filter((t) => {
      // 1. มี platforms กำหนดไว้ → ถือว่าเป็น content task ทันที
      if (t.platforms && t.platforms.length > 0) {
        return true;
      }
      // 2. Task category has "Content" (Content Branding, Content For sale, Content Knowledge, etc.)
      if (t.category_id && contentCategoryIds.has(t.category_id)) {
        return true;
      }
      // 3. Title contains "content" or "คอนเทนต์"
      const titleLower = (t.title || '').toLowerCase();
      if (titleLower.includes('content') || titleLower.includes('คอนเทนต์')) {
        return true;
      }
      // 4. Description contains "content" / "คอนเทนต์" or has content metadata tags
      const descLower = (t.description || '').toLowerCase();
      if (descLower.includes('content') || descLower.includes('คอนเทนต์')) {
        return true;
      }
      if (/\[platform:|\[format:|\[content_status:/i.test(t.description || '')) {
        return true;
      }
      return false;
    });



    return contentTasks.map((t) => parseContentTask(t, brandsMap, usersMap, categoriesMap));
  }, [tasks, brandsMap, usersMap, categoriesMap, contentCategoryIds, contentCategories]);

  // Apply filters
  const filteredContents = useMemo(() => {
    return allContents.filter((item) => {
      if (selectedUserId !== 'all' && !item.assigneeIds.includes(selectedUserId)) {
        return false;
      }
      if (selectedBrandId !== 'all' && item.brandId !== selectedBrandId) {
        return false;
      }
      if (selectedCategoryId !== 'all' && item.categoryId !== selectedCategoryId) {
        return false;
      }
      if (selectedPlatform !== 'all' && !item.platforms.includes(selectedPlatform as PlatformType)) {
        return false;
      }
      if (selectedStatus !== 'all' && item.status !== selectedStatus) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchBrand = item.brandName?.toLowerCase().includes(q) ?? false;
        const matchCategory = item.categoryName?.toLowerCase().includes(q) ?? false;
        const matchAssignee = item.assigneeNames.some((n) => n.toLowerCase().includes(q));
        if (!matchTitle && !matchBrand && !matchCategory && !matchAssignee) return false;
      }
      return true;
    });
  }, [allContents, selectedUserId, selectedBrandId, selectedCategoryId, selectedPlatform, selectedStatus, searchQuery]);

  const selectedUser = selectedUserId === 'all' ? undefined : users.find((user) => user.id === selectedUserId);
  const selectedUserAvatar = selectedUser ? avatarUrl(selectedUser.avatar_url) : undefined;

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
      categoryId: contentCategories[0]?.id || categories[0]?.id || '',
      platforms: ['facebook'],
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
      categoryId: item.categoryId || contentCategories[0]?.id || categories[0]?.id || '',
      platforms: item.platforms.length > 0 ? item.platforms : ['facebook'],
      format: item.format,
      status: item.status,
      scheduledDate: item.scheduledDate,
      scheduledTime: item.scheduledTime || '18:00',
      assignedTo: item.assigneeIds[0] || '',
      postUrl: item.postUrl || '',
    });
    setIsModalOpen(true);
  };

  // Toggle platform selection in multi-select
  const togglePlatform = (p: PlatformType) => {
    setFormData(prev => ({
      ...prev,
      platforms: prev.platforms.includes(p)
        ? prev.platforms.filter(x => x !== p)
        : [...prev.platforms, p],
    }));
  };

  const handleSaveContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    // Pack remaining metadata tags into description (platform stored in DB column)
    const fullDescription = [
      formData.description.trim(),
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
          category_id: formData.categoryId || undefined,
          assigned_to: formData.assignedTo || undefined,
          due_date: `${formData.scheduledDate}T${formData.scheduledTime}:00Z`,
          status: taskStatus,
          platforms: formData.platforms,
        });
      } else {
        await createAdminTask({
          title: formData.title,
          description: fullDescription,
          brand_id: formData.brandId || undefined,
          category_id: formData.categoryId || undefined,
          assigned_to: formData.assignedTo || undefined,
          due_date: `${formData.scheduledDate}T${formData.scheduledTime}:00Z`,
          status: taskStatus,
          platforms: formData.platforms,
        });
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['adminTasks'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks', 'content'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks('all') }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks('mine') }),
      ]);
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['adminTasks'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks('all') }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks('mine') }),
      ]);
      setViewingDetail(null);
    } catch (err) {
      console.error('Failed to delete content:', err);
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="content-calendar-page space-y-5 pb-12">
      {/* ── Top Header Bar ── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <CalendarIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              ปฏิทินคอนเทนต์ (Content Calendar)
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                {filteredContents.length} โพสต์
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              วางแผน จัดการคิวโพสต์ และติดตามคอนเทนต์ของทุกแบรนด์ร่วมกันทั้งทีม (ดึงข้อมูลงานคอนเทนต์จริงจาก Tasks)
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

      {/* ── Compact filters: long lists belong in dropdowns, not a horizontal rail ── */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex flex-col xl:flex-row xl:items-center gap-3">
          <div className="flex items-center justify-between xl:justify-start gap-2 shrink-0">
            <div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">ตัวกรองคอนเทนต์</p>
              <p className="text-[11px] text-slate-400">{filteredContents.length} จาก {allContents.length} รายการ</p>
            </div>
            {(selectedUserId !== 'all' || selectedBrandId !== 'all' || selectedCategoryId !== 'all' || selectedPlatform !== 'all' || selectedStatus !== 'all' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedUserId('all');
                  setSelectedBrandId('all');
                  setSelectedCategoryId('all');
                  setSelectedPlatform('all');
                  setSelectedStatus('all');
                  setSearchQuery('');
                }}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 whitespace-nowrap"
              >
                ล้างตัวกรอง
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:flex xl:items-center gap-2 flex-1">
            <div className="relative min-w-0 xl:w-48">
              <button
                type="button"
                onClick={() => setIsAssigneeMenuOpen((open) => !open)}
                aria-haspopup="listbox"
                aria-expanded={isAssigneeMenuOpen}
                className="w-full h-9 px-2.5 flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <span className="w-5 h-5 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 flex items-center justify-center text-[10px] font-bold shrink-0">
                  {selectedUser ? (
                    selectedUserAvatar ? <img src={selectedUserAvatar} alt="" className="w-full h-full object-cover" /> : selectedUser.first_name.charAt(0)
                  ) : (
                    <Users className="w-3.5 h-3.5" />
                  )}
                </span>
                <span className="truncate flex-1 text-left">
                  {selectedUser ? (selectedUser.nickname || `${selectedUser.first_name} ${selectedUser.last_name}`) : 'ผู้รับผิดชอบทั้งหมด'}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform ${isAssigneeMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isAssigneeMenuOpen && (
                <div className="absolute z-30 mt-1.5 w-full min-w-52 max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 shadow-lg shadow-slate-900/10" role="listbox" aria-label="เลือกผู้รับผิดชอบ">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedUserId === 'all'}
                    onClick={() => {
                      setSelectedUserId('all');
                      setIsAssigneeMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold transition-colors ${selectedUserId === 'all' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                  >
                    <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 flex items-center justify-center shrink-0"><Users className="w-3.5 h-3.5" /></span>
                    <span className="flex-1">ผู้รับผิดชอบทั้งหมด</span>
                    <span className="text-[10px] text-slate-400">{allContents.length}</span>
                  </button>
                  {users.map((user) => {
                    const userAvatar = avatarUrl(user.avatar_url);
                    const userCount = allContents.filter((content) => content.assigneeIds.includes(user.id)).length;
                    const isSelected = selectedUserId === user.id;
                    return (
                      <button
                        key={user.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          setSelectedUserId(user.id);
                          setIsAssigneeMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold transition-colors ${isSelected ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                      >
                        <span className="w-6 h-6 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                          {userAvatar ? <img src={userAvatar} alt="" className="w-full h-full object-cover" /> : user.first_name.charAt(0)}
                        </span>
                        <span className="truncate flex-1">{user.nickname || `${user.first_name} ${user.last_name}`}</span>
                        <span className="text-[10px] text-slate-400">{userCount}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <select
              value={selectedBrandId}
              onChange={(e) => setSelectedBrandId(e.target.value)}
              aria-label="กรองตามแบรนด์"
              className="min-w-0 xl:w-40 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              <option value="all">ทุกแบรนด์</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>{brand.name}</option>
              ))}
            </select>

          {/* Category Filter */}
          <select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="min-w-0 xl:w-40 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="all">ทุกหมวดคอนเทนต์</option>
            {(contentCategories.length > 0 ? contentCategories : categories).map((cat) => (
              <option key={cat.id} value={cat.id}>
                📁 {cat.name}
              </option>
            ))}
          </select>

          {/* Platform Filter */}
          <select
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
            className="min-w-0 xl:w-40 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
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
            className="min-w-0 xl:w-40 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="all">ทุกสถานะ</option>
            <option value="idea">💡 ไอเดีย</option>
            <option value="drafting">✍️ กำลังผลิต</option>
            <option value="in_review">👀 รอตรวจ</option>
            <option value="ready">🚀 พร้อมโพสต์</option>
            <option value="published">✅ โพสต์แล้ว</option>
          </select>

          {/* Search Box */}
          <div className="relative min-w-0 xl:ml-auto">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหาชื่อคอนเทนต์..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full xl:w-52 pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
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
                      const statusInfo = STATUS_META[content.status];

                      return (
                        <div
                          key={content.id}
                          onClick={() => setViewingDetail(content)}
                          className={`p-1.5 rounded-xl border text-[11px] cursor-pointer transition-all hover:scale-[1.01] hover:shadow-sm bg-white dark:bg-slate-800/90 ${statusInfo.border}`}
                        >
                          {/* Platform Badges & Status */}
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <div className="flex gap-0.5 flex-wrap">
                              {content.platforms.map(p => {
                                const pInfo = PLATFORM_META[p] || PLATFORM_META.other;
                                return (
                                  <span key={p} className={`px-1.5 py-0.5 rounded font-extrabold text-[9px] ${pInfo.bg} ${pInfo.text}`}>
                                    {pInfo.short}
                                  </span>
                                );
                              })}
                            </div>

                            <span className={`text-[9px] font-bold px-1 rounded ${statusInfo.text} ${statusInfo.bg}`}>
                              {statusInfo.label.split(' ')[0]}
                            </span>
                          </div>

                          {/* Category Tag if present */}
                          {content.categoryName && (
                            <div className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 truncate mb-0.5">
                              📁 {content.categoryName}
                            </div>
                          )}

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
                  <th className="py-3 px-4">หมวดหมู่งาน</th>
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
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      ไม่พบรายการคอนเทนต์ตามเงื่อนไขที่เลือก
                    </td>
                  </tr>
                ) : (
                  filteredContents.map((content) => {
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
                          <div className="flex gap-1 flex-wrap">
                            {content.platforms.map(p => {
                              const pInfo = PLATFORM_META[p] || PLATFORM_META.other;
                              return (
                                <span key={p} className={`px-2 py-0.5 rounded text-[10px] font-bold ${pInfo.bg} ${pInfo.text}`}>
                                  {pInfo.label}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {content.categoryName ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              📁 {content.categoryName}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">-</span>
                          )}
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
              <div className="flex items-center gap-2 flex-wrap">
                {viewingDetail.platforms.map(p => {
                  const pInfo = PLATFORM_META[p] || PLATFORM_META.other;
                  return (
                    <span key={p} className={`px-2 py-0.5 rounded font-bold text-xs ${pInfo.bg} ${pInfo.text}`}>
                      {pInfo.label}
                    </span>
                  );
                })}
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
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {viewingDetail.categoryName && (
                    <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      📁 {viewingDetail.categoryName}
                    </span>
                  )}
                  {viewingDetail.brandName && (
                    <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                      🔥 แบรนด์: {viewingDetail.brandName}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {viewingDetail.title}
                </h3>
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
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap bg-slate-50/50 dark:bg-slate-800/50">
              <button
                type="button"
                onClick={() => handleDeleteContent(viewingDetail.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>ลบคอนเทนต์</span>
              </button>

              <div className="flex items-center gap-2">
                <a
                  href={`/tasks?search=${encodeURIComponent(viewingDetail.title)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
                  title="เปิดดูในหน้ารวมงาน"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>ดูในหน้ารวมงาน (Tasks)</span>
                </a>

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
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
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

              {/* Category & Brand */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    หมวดหมู่งานคอนเทนต์ <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    required
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    <option value="">-- เลือกหมวดหมู่ --</option>
                    {(contentCategories.length > 0 ? contentCategories : categories).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

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
              </div>

              {/* Platform — Multi-Select */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  แพลตฟอร์ม <span className="font-normal text-slate-400">(เลือกได้มากกว่า 1)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(PLATFORM_META) as [PlatformType, typeof PLATFORM_META.facebook][]).map(([key, meta]) => {
                    const selected = formData.platforms.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => togglePlatform(key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                          selected
                            ? `${meta.bg} ${meta.text} border-transparent scale-105 shadow-sm`
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <PlatformLogo platform={key} />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
                {formData.platforms.length === 0 && (
                  <p className="text-[10px] text-red-500 mt-1">กรุณาเลือกอย่างน้อย 1 แพลตฟอร์ม</p>
                )}
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
