import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchHolidays, createHoliday, deleteHoliday, fetchAdminTasks, fetchBrands, fetchUsers } from '../services/adminApi';
import type { Holiday, User, AdminTask, Brand } from '../types';
import { getTaskPriority, type TaskPriority, avatarUrl } from '../components/tasks/taskUtils';
import { queryKeys } from '../lib/queryKeys';

interface LayoutContext {
  currentUser: User | null;
}

export interface CalendarTaskItem {
  id: string;
  taskId: string;
  parentTitle: string;
  subItemTitle?: string;
  displayTitle: string;
  brandId?: string;
  status: string;
  isCompleted: boolean;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assignedToName?: string;
  assignedToAvatarUrl?: string | null;
  assignedToInitial?: string;
  dueDate?: string;
  completedAt?: string;
  rawTask: AdminTask;
  isSubItem?: boolean;
}

function datePart(value?: string): string {
  return value ? value.split('T')[0] : '';
}

const TASK_PRIORITY_META: Record<TaskPriority, {
  label: string;
  icon: string;
  className: string;
}> = {
  urgent: {
    label: 'ด่วนมาก',
    icon: 'fa-fire',
    className: 'bg-rose-100 text-rose-800 border-rose-300',
  },
  high: {
    label: 'ด่วน',
    icon: 'fa-triangle-exclamation',
    className: 'bg-orange-100 text-orange-800 border-orange-300',
  },
  medium: {
    label: 'ปานกลาง',
    icon: 'fa-clock',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  low: {
    label: 'ไม่รีบ',
    icon: 'fa-leaf',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
  },
};

const TASK_PRIORITY_ORDER: Record<TaskPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  urgent: 3,
};

function isTaskVisibleToUser(task: AdminTask, userId?: string): boolean {
  if (!userId) return false;

  const isOwner = task.assigned_by === userId;
  const assigneeIds = task.assignee_ids && task.assignee_ids.length > 0
    ? task.assignee_ids
    : task.assigned_to
      ? [task.assigned_to]
      : [];

  return isOwner || assigneeIds.includes(userId);
}

function isTaskAssignedTo(task: AdminTask, userId: string): boolean {
  const assigneeIds = task.assignee_ids && task.assignee_ids.length > 0
    ? task.assignee_ids
    : task.assigned_to
      ? [task.assigned_to]
      : [];

  return assigneeIds.includes(userId);
}

export default function Holidays() {
  const navigate = useNavigate();
  const { currentUser } = useOutletContext<LayoutContext>() || {};
  const isAdmin = currentUser?.role === 'admin';
  const queryClient = useQueryClient();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [year, setYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [taskUsers, setTaskUsers] = useState<User[]>([]);
  const [taskPersonFilter, setTaskPersonFilter] = useState<string>('all');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isScrolledDown, setIsScrolledDown] = useState<boolean>(false);

  const taskScope = isAdmin ? 'all' : 'mine';
  const holidaysQuery = useQuery({
    queryKey: queryKeys.holidays(year),
    queryFn: () => fetchHolidays(year),
    staleTime: 30 * 60_000,
  });
  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks(taskScope),
    queryFn: () => fetchAdminTasks(taskScope),
    enabled: Boolean(currentUser?.id),
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const brandsQuery = useQuery({
    queryKey: queryKeys.brands,
    queryFn: () => fetchBrands(),
    staleTime: 15 * 60_000,
  });
  const usersQuery = useQuery({
    queryKey: queryKeys.users(),
    queryFn: () => fetchUsers(),
    enabled: Boolean(currentUser?.id),
    staleTime: 5 * 60_000,
  });

  // Modals state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [selectedHoliday, setSelectedHoliday] = useState<Holiday | null>(null);
  const [selectedDayDetails, setSelectedDayDetails] = useState<{
    dateStr: string;
    holidayMatches: Holiday[];
    dueTaskItems: CalendarTaskItem[];
    completedTaskItems: CalendarTaskItem[];
  } | null>(null);

  // Form state (Admin)
  const [formDate, setFormDate] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formDays, setFormDays] = useState<number>(1);
  const [formLoading, setFormLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (holidaysQuery.data) {
      setHolidays([...holidaysQuery.data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    }
    if (tasksQuery.data) {
      setTasks(tasksQuery.data.filter(task => isAdmin || isTaskVisibleToUser(task, currentUser?.id)));
    }
    if (usersQuery.data) setTaskUsers(usersQuery.data);
    if (brandsQuery.data) setBrands(brandsQuery.data);

    if (holidaysQuery.error) console.error('โหลดวันหยุดล้มเหลว:', holidaysQuery.error);
    if (tasksQuery.error) console.error('โหลดงานที่ได้รับมอบหมายล้มเหลว:', tasksQuery.error);
    if (brandsQuery.error) console.error('โหลดแบรนด์ล้มเหลว:', brandsQuery.error);
    if (usersQuery.error) console.error('โหลดรายชื่อผู้รับผิดชอบล้มเหลว:', usersQuery.error);

    // Holiday data controls the page shell. Tasks are allowed to arrive in
    // the background so the calendar can paint immediately from cache.
    setLoading(holidaysQuery.isPending);
  }, [
    brandsQuery.data,
    brandsQuery.error,
    currentUser?.id,
    holidaysQuery.data,
    holidaysQuery.error,
    holidaysQuery.isPending,
    isAdmin,
    tasksQuery.data,
    tasksQuery.error,
    tasksQuery.isPending,
    usersQuery.data,
    usersQuery.error,
  ]);

  async function loadHolidays() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.holidays(year) });
  }

  const brandsMap = useMemo(() => {
    const map = new Map<string, string>();
    brands.forEach(b => map.set(b.id, b.name));
    return map;
  }, [brands]);

  const usersMap = useMemo(() => {
    const map = new Map<string, User>();
    taskUsers.forEach(u => map.set(u.id, u));
    if (currentUser) {
      map.set(currentUser.id, currentUser);
    }
    return map;
  }, [taskUsers, currentUser]);

  const resolveAssigneeInfo = (
    explicitName?: string,
    userId?: string,
    assigneeIds?: string[],
    fallbackTask?: AdminTask
  ): { name?: string; avatarUrl?: string | null; initial?: string } => {
    if (userId && usersMap.has(userId)) {
      const u = usersMap.get(userId)!;
      const name = (u.nickname?.trim() || `${u.first_name} ${u.last_name}`).trim();
      const av = avatarUrl(u.avatar_url);
      const initial = (u.nickname || u.first_name || 'U').trim().charAt(0).toUpperCase();
      return { name, avatarUrl: av, initial };
    }
    if (assigneeIds && assigneeIds.length > 0) {
      const firstUser = usersMap.get(assigneeIds[0]);
      const names = assigneeIds
        .map(id => {
          const u = usersMap.get(id);
          return u ? (u.nickname?.trim() || u.first_name).trim() : '';
        })
        .filter(Boolean);
      return {
        name: names.length > 0 ? names.join(', ') : explicitName,
        avatarUrl: firstUser ? avatarUrl(firstUser.avatar_url) : null,
        initial: firstUser ? (firstUser.nickname || firstUser.first_name || 'U').trim().charAt(0).toUpperCase() : 'U',
      };
    }
    if (fallbackTask) {
      if (fallbackTask.assigned_to && usersMap.has(fallbackTask.assigned_to)) {
        const u = usersMap.get(fallbackTask.assigned_to)!;
        const name = fallbackTask.assigned_to_name?.trim() || (u.nickname?.trim() || `${u.first_name} ${u.last_name}`).trim();
        const av = avatarUrl(u.avatar_url);
        const initial = (u.nickname || u.first_name || 'U').trim().charAt(0).toUpperCase();
        return { name, avatarUrl: av, initial };
      }
      if (fallbackTask.assigned_to_name && fallbackTask.assigned_to_name.trim()) {
        const name = fallbackTask.assigned_to_name.trim();
        const matchedUser = taskUsers.find(
          u => `${u.first_name} ${u.last_name}`.trim() === name || u.nickname?.trim() === name
        );
        return {
          name,
          avatarUrl: matchedUser ? avatarUrl(matchedUser.avatar_url) : null,
          initial: name.charAt(0).toUpperCase(),
        };
      }
    }
    if (explicitName && explicitName.trim()) {
      const name = explicitName.trim();
      const matchedUser = taskUsers.find(
        u => `${u.first_name} ${u.last_name}`.trim() === name || u.nickname?.trim() === name
      );
      return {
        name,
        avatarUrl: matchedUser ? avatarUrl(matchedUser.avatar_url) : null,
        initial: name.charAt(0).toUpperCase(),
      };
    }
    return {};
  };

  const taskFilterUsers = useMemo(() => {
    const assignedUserIDs = new Set<string>();
    tasks.forEach(task => {
      const assigneeIDs = task.assignee_ids && task.assignee_ids.length > 0
        ? task.assignee_ids
        : task.assigned_to
          ? [task.assigned_to]
          : [];
      assigneeIDs.forEach(id => assignedUserIDs.add(id));
    });

    return taskUsers
      .filter(user => user.status === 'active' || assignedUserIDs.has(user.id))
      .sort((a, b) => {
        const aName = `${a.nickname || ''} ${a.first_name} ${a.last_name}`.trim();
        const bName = `${b.nickname || ''} ${b.first_name} ${b.last_name}`.trim();
        return aName.localeCompare(bName, 'th');
      });
  }, [taskUsers, tasks]);

  const visibleTasks = useMemo(() => {
    const activeTasks = tasks.filter(task => {
      if ((task as any).deleted_at) return false;
      const st = (task.status as string) || '';
      if (st === 'trash' || st === 'deleted') return false;
      return true;
    });

    if (!isAdmin || taskPersonFilter === 'all') return activeTasks;
    return activeTasks.filter(task => isTaskAssignedTo(task, taskPersonFilter));
  }, [isAdmin, taskPersonFilter, tasks]);

  const monthNames = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  const monthNamesShort = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
  ];

  const weekDayNamesShort = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  const weekDayNamesFull = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];

  // Calculate total consecutive days off (including preceding & following weekends)
  function getConsecutiveDaysOff(dateIso: string, numDays: number = 1): number {
    try {
      const start = new Date(dateIso);
      start.setHours(0, 0, 0, 0);

      let firstDay = new Date(start);
      while (true) {
        const prev = new Date(firstDay.getTime() - 86400000);
        const day = prev.getDay();
        if (day === 0 || day === 6) {
          firstDay = prev;
        } else {
          break;
        }
      }

      let lastDay = new Date(start.getTime() + (numDays - 1) * 86400000);
      while (true) {
        const next = new Date(lastDay.getTime() + 86400000);
        const day = next.getDay();
        if (day === 0 || day === 6) {
          lastDay = next;
        } else {
          break;
        }
      }

      return Math.round((lastDay.getTime() - firstDay.getTime()) / 86400000) + 1;
    } catch {
      return numDays;
    }
  }

  function isLongWeekend(dateIso: string, numDays: number = 1): boolean {
    return getConsecutiveDaysOff(dateIso, numDays) >= 3;
  }

  // Handle holiday creation (Admin only)
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    if (!formDate || !formName) return;

    setFormLoading(true);
    try {
      await createHoliday({
        date: formDate,
        name: formName,
        num_days: formDays,
      });
      setFormDate('');
      setFormName('');
      setFormDays(1);
      setShowAddModal(false);
      await loadHolidays();
    } catch (err) {
      console.error('เพิ่มวันหยุดล้มเหลว:', err);
      alert('เพิ่มวันหยุดล้มเหลว');
    }
    setFormLoading(false);
  }

  // Handle holiday deletion (Admin only)
  async function handleDelete(id: string) {
    if (!isAdmin) return;
    if (!confirm('คุณต้องการลบวันหยุดนี้ใช่หรือไม่?')) return;

    setActionLoading(id);
    try {
      await deleteHoliday(id);
      if (selectedHoliday?.id === id) {
        setSelectedHoliday(null);
      }
      await loadHolidays();
    } catch (err) {
      console.error('ลบวันหยุดล้มเหลว:', err);
      alert('ลบวันหยุดล้มเหลว');
    }
    setActionLoading(null);
  }

  function formatDateThai(dateIso: string): string {
    try {
      const d = new Date(dateIso);
      return d.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateIso;
    }
  }

  function getWeekdayText(dateIso: string): string {
    try {
      const d = new Date(dateIso);
      return weekDayNamesFull[d.getDay()];
    } catch {
      return '-';
    }
  }

  // Helper to format date object to YYYY-MM-DD
  const formatDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const taskItems = useMemo<CalendarTaskItem[]>(() => {
    const items: CalendarTaskItem[] = [];

    visibleTasks.forEach(task => {
      const taskDueDate = datePart(task.due_date);
      const taskCompletedDate = datePart(task.completed_at);
      const taskCompleted = task.status === 'completed';
      const taskPriority = getTaskPriority(task);
      const taskAssignee = resolveAssigneeInfo(task.assigned_to_name, task.assigned_to, task.assignee_ids);

      if (taskDueDate || taskCompletedDate) {
        items.push({
          id: `task-${task.id}`,
          taskId: task.id,
          parentTitle: task.title,
          displayTitle: task.title,
          brandId: task.brand_id,
          status: task.status,
          isCompleted: taskCompleted,
          priority: taskPriority,
          assignedToName: taskAssignee.name,
          assignedToAvatarUrl: taskAssignee.avatarUrl,
          assignedToInitial: taskAssignee.initial,
          dueDate: taskDueDate,
          completedAt: taskCompletedDate || (taskCompleted ? taskDueDate : undefined),
          rawTask: task,
          isSubItem: false,
        });
      }

      task.sub_items?.forEach(sub => {
        if ((sub as any).deleted_at || (sub as any).is_deleted || (sub as any).status === 'trash') return;
        const subDueDate = datePart(sub.due_date) || taskDueDate;
        const isSubDone = sub.is_done || sub.status === 'completed';
        const subCompletedDate = isSubDone
          ? taskCompletedDate || subDueDate
          : undefined;

        if (!subDueDate && !subCompletedDate) return;
        const subAssignee = resolveAssigneeInfo(undefined, sub.assigned_to, undefined, task);

        items.push({
          id: `sub-${sub.id}`,
          taskId: task.id,
          parentTitle: task.title,
          subItemTitle: sub.title,
          displayTitle: sub.title,
          brandId: task.brand_id,
          status: isSubDone ? 'completed' : (sub.status || task.status),
          isCompleted: isSubDone,
          priority: sub.priority || taskPriority,
          assignedToName: subAssignee.name,
          assignedToAvatarUrl: subAssignee.avatarUrl,
          assignedToInitial: subAssignee.initial,
          dueDate: subDueDate,
          completedAt: subCompletedDate,
          rawTask: task,
          isSubItem: true,
        });
      });

      task.lists?.forEach(list => {
        const listSt = (list.status as string) || '';
        if (list.deleted_at || listSt === 'trash' || listSt === 'deleted') return;
        const listDueDate = datePart(list.due_date) || taskDueDate;
        const isListDone = list.status === 'completed';
        const listCompletedDate = isListDone ? taskCompletedDate || listDueDate : undefined;

        if (list.name && (listDueDate || listCompletedDate)) {
          items.push({
            id: `list-${list.id}`,
            taskId: task.id,
            parentTitle: task.title,
            subItemTitle: list.name,
            displayTitle: list.name,
            brandId: task.brand_id,
            status: isListDone ? 'completed' : (list.status || task.status),
            isCompleted: isListDone,
            priority: (list.priority as any) || taskPriority,
            assignedToName: taskAssignee.name,
            assignedToAvatarUrl: taskAssignee.avatarUrl,
            assignedToInitial: taskAssignee.initial,
            dueDate: listDueDate,
            completedAt: listCompletedDate,
            rawTask: task,
            isSubItem: true,
          });
        }

        list.cards?.forEach(card => {
          const cardSt = (card.status as string) || '';
          if ((card as any).deleted_at || cardSt === 'trash' || cardSt === 'deleted') return;
          const cardDueDate = datePart(card.due_date) || listDueDate;
          const isCardDone = card.status === 'completed' || isListDone;
          const cardCompletedDate = isCardDone ? listCompletedDate || cardDueDate : undefined;
          const cardAssignee = resolveAssigneeInfo(undefined, card.assigned_to, card.assignee_ids, task);

          if (cardDueDate || cardCompletedDate) {
            items.push({
              id: `card-${card.id}`,
              taskId: task.id,
              parentTitle: `${task.title} (${list.name})`,
              subItemTitle: card.title,
              displayTitle: card.title,
              brandId: task.brand_id,
              status: isCardDone ? 'completed' : card.status,
              isCompleted: isCardDone,
              priority: card.priority || (list.priority as any) || taskPriority,
              assignedToName: cardAssignee.name,
              assignedToAvatarUrl: cardAssignee.avatarUrl,
              assignedToInitial: cardAssignee.initial,
              dueDate: cardDueDate,
              completedAt: cardCompletedDate,
              rawTask: task,
              isSubItem: true,
            });
          }

          card.sub_items?.forEach(sub => {
            if ((sub as any).deleted_at || (sub as any).is_deleted || (sub as any).status === 'trash') return;
            const subDueDate = datePart(sub.due_date) || cardDueDate;
            const isSubDone = sub.is_done || sub.status === 'completed';
            const subCompletedDate = isSubDone
              ? cardCompletedDate || subDueDate
              : undefined;

            if (!subDueDate && !subCompletedDate) return;
            const cardSubAssignee = resolveAssigneeInfo(undefined, sub.assigned_to, undefined, task);

            items.push({
              id: `card-sub-${sub.id}`,
              taskId: task.id,
              parentTitle: `${task.title} (${card.title})`,
              subItemTitle: sub.title,
              displayTitle: sub.title,
              brandId: task.brand_id,
              status: isSubDone ? 'completed' : (sub.status || task.status),
              isCompleted: isSubDone,
              priority: sub.priority || card.priority || (list.priority as any) || taskPriority,
              assignedToName: cardSubAssignee.name,
              assignedToAvatarUrl: cardSubAssignee.avatarUrl,
              assignedToInitial: cardSubAssignee.initial,
              dueDate: subDueDate,
              completedAt: subCompletedDate,
              rawTask: task,
              isSubItem: true,
            });
          });
        });
      });
    });

    return items.sort((a, b) => (a.dueDate || a.completedAt || '').localeCompare(b.dueDate || b.completedAt || ''));
  }, [visibleTasks, usersMap]);

  // Map task items by due date and completed date
  const { dueTaskItemsMap, completedTaskItemsMap } = useMemo(() => {
    const dueMap = new Map<string, CalendarTaskItem[]>();
    const compMap = new Map<string, CalendarTaskItem[]>();

    taskItems.forEach(item => {
      if (item.isCompleted) {
        const cDate = item.completedAt || item.dueDate;
        if (cDate) {
          if (!compMap.has(cDate)) compMap.set(cDate, []);
          compMap.get(cDate)!.push(item);
        }
      } else {
        const dDate = item.dueDate;
        if (dDate) {
          if (!dueMap.has(dDate)) dueMap.set(dDate, []);
          dueMap.get(dDate)!.push(item);
        }
      }
    });

    return { dueTaskItemsMap: dueMap, completedTaskItemsMap: compMap };
  }, [taskItems]);

  // Dynamic continuous months list for infinite scrolling
  const [visibleMonths, setVisibleMonths] = useState<Array<{ year: number; month: number }>>(() => {
    const curYear = today.getFullYear();
    const curMonth = today.getMonth();
    const nextMonth = curMonth === 11 ? 0 : curMonth + 1;
    const nextYear = curMonth === 11 ? curYear + 1 : curYear;
    return [
      { year: curYear, month: curMonth },
      { year: nextYear, month: nextMonth },
    ];
  });

  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);

  const loadNextMonth = useCallback(() => {
    setVisibleMonths(prev => {
      const last = prev[prev.length - 1];
      const nextM = last.month === 11 ? 0 : last.month + 1;
      const nextY = last.month === 11 ? last.year + 1 : last.year;
      if (prev.length >= 24) return prev;
      return [...prev, { year: nextY, month: nextM }];
    });
  }, []);

  // IntersectionObserver to auto-load next month on scrolling down
  useEffect(() => {
    const target = bottomSentinelRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          loadNextMonth();
        }
      },
      { threshold: 0.05, rootMargin: '400px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [loadNextMonth, visibleMonths.length]);

  // Seamless Continuous Calendar Days (Days flow naturally without duplicated padding dates)
  const continuousCalendarDays = useMemo(() => {
    if (visibleMonths.length === 0) return [];

    const firstM = visibleMonths[0];
    const lastM = visibleMonths[visibleMonths.length - 1];

    // Start from 1st of the first visible month
    const startMonthDate = new Date(firstM.year, firstM.month, 1);
    const startDayOfWeek = startMonthDate.getDay(); // 0 = Sun
    // Pad back to preceding Sunday
    const startDate = new Date(startMonthDate);
    startDate.setDate(startDate.getDate() - startDayOfWeek);

    // End at the last day of last visible month
    const endMonthDate = new Date(lastM.year, lastM.month + 1, 0);
    const endDayOfWeek = endMonthDate.getDay(); // 0 = Sun, 6 = Sat
    // Pad forward to succeeding Saturday
    const endDate = new Date(endMonthDate);
    endDate.setDate(endDate.getDate() + (6 - endDayOfWeek));

    const days: Array<{
      dayNumber: number;
      monthNumber: number;
      yearNumber: number;
      dateStr: string;
      isToday: boolean;
      isFirstDayOfMonth: boolean;
      holidayMatches: Holiday[];
      dueTaskItems: CalendarTaskItem[];
      completedTaskItems: CalendarTaskItem[];
    }> = [];

    const curr = new Date(startDate);
    while (curr <= endDate) {
      const dateStr = formatDateStr(curr);
      const isToday = formatDateStr(today) === dateStr;
      const isFirstDayOfMonth = curr.getDate() === 1;

      // Find matching holidays
      const matchedHolidays: Holiday[] = [];
      for (const h of holidays) {
        const hStartStr = h.date.split('T')[0];
        const hStart = new Date(hStartStr + 'T00:00:00');
        const hEnd = new Date(hStart.getTime() + ((h.num_days || 1) - 1) * 86400000);
        const cellDate = new Date(dateStr + 'T00:00:00');

        if (cellDate.getTime() >= hStart.getTime() && cellDate.getTime() <= hEnd.getTime()) {
          matchedHolidays.push(h);
        }
      }

      days.push({
        dayNumber: curr.getDate(),
        monthNumber: curr.getMonth(),
        yearNumber: curr.getFullYear(),
        dateStr,
        isToday,
        isFirstDayOfMonth,
        holidayMatches: matchedHolidays,
        dueTaskItems: dueTaskItemsMap.get(dateStr) || [],
        completedTaskItems: completedTaskItemsMap.get(dateStr) || [],
      });

      curr.setDate(curr.getDate() + 1);
    }

    return days;
  }, [visibleMonths, dueTaskItemsMap, completedTaskItemsMap, holidays, today]);

  const isProgrammaticScrollRef = useRef(false);

  // Keep the selected month in sync with the month currently in view.
  useEffect(() => {
    const handleScroll = () => {
      const contentArea = document.querySelector('.content-area');
      const scrollY = contentArea ? contentArea.scrollTop : (window.scrollY || document.documentElement.scrollTop || 0);
      setIsScrolledDown(scrollY > 220);

      if (isProgrammaticScrollRef.current) return;
      const elAtCenter = document.elementFromPoint(window.innerWidth / 2, window.innerHeight * 0.45);
      const dayCell = elAtCenter?.closest<HTMLElement>('[data-month]');
      if (dayCell) {
        const mAttr = dayCell.getAttribute('data-month');
        const yAttr = dayCell.getAttribute('data-year');
        if (mAttr !== null && yAttr !== null) {
          const activeM = parseInt(mAttr, 10);
          const activeY = parseInt(yAttr, 10);
          if (!isNaN(activeM) && !isNaN(activeY)) {
            if (activeM !== currentMonth) setCurrentMonth(activeM);
            if (activeY !== year) setYear(activeY);
          }
        }
      }
    };

    document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      document.removeEventListener('scroll', handleScroll, { capture: true });
      window.removeEventListener('scroll', handleScroll);
    };
  }, [currentMonth, year, continuousCalendarDays.length]);

  const handleSelectMonth = (targetMonth: number, targetYear: number = year) => {
    setCurrentMonth(targetMonth);
    isProgrammaticScrollRef.current = true;
    const existingIndex = visibleMonths.findIndex(m => m.year === targetYear && m.month === targetMonth);
    if (existingIndex === -1) {
      const nextM = targetMonth === 11 ? 0 : targetMonth + 1;
      const nextY = targetMonth === 11 ? targetYear + 1 : targetYear;
      setVisibleMonths([
        { year: targetYear, month: targetMonth },
        { year: nextY, month: nextM },
      ]);
    }
    setTimeout(() => {
      const padM = String(targetMonth + 1).padStart(2, '0');
      const targetDateStr = `${targetYear}-${padM}-01`;
      const el = document.getElementById(`day-cell-${targetDateStr}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 700);
    }, 60);
  };

  // Grouped Holidays by Month for List View
  const filteredGroupedHolidays = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const filtered = holidays.filter(h => {
      if (!query) return true;
      const nameMatch = h.name.toLowerCase().includes(query);
      const dateMatch = formatDateThai(h.date).toLowerCase().includes(query);
      return nameMatch || dateMatch;
    });

    const groups: Record<number, Holiday[]> = {};
    filtered.forEach(h => {
      const m = new Date(h.date).getMonth();
      if (!groups[m]) groups[m] = [];
      groups[m].push(h);
    });

    return groups;
  }, [holidays, searchTerm]);

  return (
    <div id="holidays" className="page-section active flex w-full min-w-0 flex-none flex-col pb-12 content-area-flush px-4 sm:px-6 md:px-8 pt-0" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Consolidated Master Toolbar: Sticky at Top-0 with Zero Gap */}
      <div className="holiday-master-toolbar sticky z-30 bg-white border-b border-slate-200 shadow-xs -mx-4 sm:-mx-6 md:-mx-8 px-4 sm:px-6 md:px-8 divide-y divide-slate-100">
        {/* Deck 1: Page Title, Year Selector, View Mode, Add Holiday */}
        <div className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20 flex items-center justify-center text-base">
                <i className="fa-solid fa-calendar-days"></i>
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight">
                ปฏิทินวันหยุดบริษัท
              </h2>
            </div>
            <span className="bg-slate-100 text-slate-700 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-slate-200">
              ปี {year + 543}
            </span>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Year Selector */}
            <div className="relative">
              <select
                className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-3 py-1.5 pr-8 shadow-xs hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {[year - 1, year, year + 1].map(y => (
                  <option key={y} value={y}>พ.ศ. {y + 543} ({y})</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400">
                <i className="fa-solid fa-chevron-down text-[10px]"></i>
              </div>
            </div>

            {/* View Mode Switcher */}
            <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200">
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'calendar'
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <i className="fa-solid fa-calendar-days text-xs"></i>
                ปฏิทิน
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <i className="fa-solid fa-list-ul text-xs"></i>
                รายการ
              </button>
            </div>

            {/* Add Holiday Button */}
            {isAdmin && (
              <button
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs px-3.5 py-1.5 rounded-xl shadow-md shadow-blue-500/20 hover:shadow-blue-500/30 active:scale-98 transition-all flex items-center gap-1.5 cursor-pointer"
                onClick={() => setShowAddModal(true)}
              >
                <i className="fa-solid fa-plus text-[10px]"></i>
                เพิ่มวันหยุด
              </button>
            )}
          </div>
        </div>

        {/* Deck 2: Calendar Controller (Month name + Pills + Filter) */}
        {viewMode === 'calendar' && (
          <div className="py-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Left: Month title & Nav buttons */}
            <div className="flex items-center gap-2.5">
              <h3 className="text-base font-extrabold text-slate-800 tracking-tight flex items-center gap-1.5">
                <i className="fa-regular fa-calendar text-blue-600 text-sm"></i>
                เดือน{monthNames[currentMonth]} {year + 543}
              </h3>
              <span className="text-[11px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full border border-slate-200">
                {holidays.filter(h => new Date(h.date).getMonth() === currentMonth).length} วันหยุด
              </span>

              <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200 ml-1">
                <button
                  type="button"
                  onClick={() => handleSelectMonth(currentMonth === 0 ? 11 : currentMonth - 1, currentMonth === 0 ? year - 1 : year)}
                  aria-label="ไปเดือนก่อนหน้า"
                  className="w-6 h-6 rounded-md hover:bg-white text-slate-600 hover:text-slate-900 flex items-center justify-center transition-all cursor-pointer text-[10px]"
                  title="เดือนก่อนหน้า"
                >
                  <i className="fa-solid fa-chevron-left"></i>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectMonth(today.getMonth(), today.getFullYear())}
                  className="px-2 py-0.5 rounded-md hover:bg-white text-slate-700 font-bold text-[11px] transition-all cursor-pointer"
                  title="ไปเดือนปัจจุบัน"
                >
                  วันนี้
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectMonth(currentMonth === 11 ? 0 : currentMonth + 1, currentMonth === 11 ? year + 1 : year)}
                  aria-label="ไปเดือนถัดไป"
                  className="w-6 h-6 rounded-md hover:bg-white text-slate-600 hover:text-slate-900 flex items-center justify-center transition-all cursor-pointer text-[10px]"
                  title="เดือนถัดไป"
                >
                  <i className="fa-solid fa-chevron-right"></i>
                </button>
              </div>
            </div>

            {/* Center: Month Pills */}
            <div className="overflow-x-auto flex items-center gap-1 scrollbar-none py-0.5">
              {monthNamesShort.map((mShort, idx) => {
                const isSelected = currentMonth === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectMonth(idx)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 bg-slate-50 border border-slate-200/60'
                    }`}
                  >
                    {mShort}
                  </button>
                );
              })}
            </div>

            {/* Right: Assignee Filter */}
            <div className="flex items-center gap-2">
              {isAdmin && (
                <div className="flex items-center gap-1.5 rounded-xl border border-indigo-200/80 bg-indigo-50/70 px-2.5 py-1 shadow-2xs">
                  <i className="fa-solid fa-user-check text-[11px] text-indigo-600"></i>
                  <span className="text-xs font-bold text-indigo-700 hidden xl:inline">ดูงานของ:</span>
                  <select
                    id="holiday-task-person-filter"
                    aria-label="กรองงานตามผู้รับผิดชอบ"
                    value={taskPersonFilter}
                    onChange={(event) => setTaskPersonFilter(event.target.value)}
                    className="bg-transparent text-xs font-bold text-indigo-900 outline-none cursor-pointer max-w-[140px]"
                  >
                    <option value="all">ทุกคน ({tasks.length})</option>
                    {taskFilterUsers.map(user => {
                      const displayName = user.nickname?.trim() || `${user.first_name} ${user.last_name}`.trim();
                      const taskCount = tasks.filter(task => isTaskAssignedTo(task, user.id)).length;
                      return (
                        <option key={user.id} value={user.id}>
                          {displayName || user.email} ({taskCount})
                        </option>
                      );
                    })}
                  </select>
                  {taskPersonFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setTaskPersonFilter('all')}
                      aria-label="ล้างตัวกรองผู้รับผิดชอบ"
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-indigo-400 hover:bg-indigo-200/80 hover:text-indigo-800"
                    >
                      <i className="fa-solid fa-xmark text-[9px]" aria-hidden="true"></i>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main View: Calendar View */}
      {viewMode === 'calendar' && (
        <div className="order-2 mb-8 flex-none bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {/* Weekday Row Header */}
          <div className="grid grid-cols-7 bg-slate-50/80 border-b border-slate-200 text-center text-xs font-bold text-slate-500 py-3">
            {weekDayNamesShort.map((day, i) => (
              <div key={day} className={i === 0 || i === 6 ? 'text-rose-500' : ''}>
                {day}
              </div>
            ))}
          </div>

          {/* Seamless Unified Continuous Calendar Grid */}
          {loading ? (
            <div className="py-20 text-center text-slate-400">
              <i className="fa-solid fa-spinner fa-spin text-2xl mb-2 text-blue-500 block"></i>
              กำลังโหลดปฏิทินและข้อมูลงาน...
            </div>
          ) : (
            <div>
              {/* Unified Calendar Grid */}
              <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-200 bg-slate-200/50">
                {continuousCalendarDays.map((cell, index) => {
                  const isWeekend = (index % 7 === 0) || (index % 7 === 6);
                  const urgentDueCount = cell.dueTaskItems.filter(item => item.priority === 'urgent' || item.priority === 'high').length;

                  // Collect list of render items
                  const renderItems: Array<{
                    key: string;
                    type: 'holiday' | 'due' | 'completed';
                    title: string;
                    parentTitle?: string;
                    isSubItem?: boolean;
                    brandName?: string;
                    status?: string;
                    priority?: TaskPriority;
                    assignedToName?: string;
                    assignedToAvatarUrl?: string | null;
                    assignedToInitial?: string;
                  }> = [];

                  cell.holidayMatches.forEach(h => {
                    renderItems.push({
                      key: `h-${h.id}`,
                      type: 'holiday',
                      title: h.name,
                    });
                  });

                  [...cell.dueTaskItems]
                    .sort((a, b) => {
                      const parentFirst = Number(Boolean(a.isSubItem)) - Number(Boolean(b.isSubItem));
                      return parentFirst || TASK_PRIORITY_ORDER[b.priority || 'low'] - TASK_PRIORITY_ORDER[a.priority || 'low'];
                    })
                    .forEach(item => {
                      renderItems.push({
                        key: `due-${item.id}`,
                        type: 'due',
                        title: item.displayTitle,
                        parentTitle: item.parentTitle,
                        isSubItem: item.isSubItem,
                        brandName: brandsMap.get(item.brandId || ''),
                        status: item.status,
                        priority: item.priority || 'low',
                        assignedToName: item.assignedToName,
                        assignedToAvatarUrl: item.assignedToAvatarUrl,
                        assignedToInitial: item.assignedToInitial,
                      });
                    });

                  [...cell.completedTaskItems]
                    .sort((a, b) => Number(Boolean(a.isSubItem)) - Number(Boolean(b.isSubItem)))
                    .forEach(item => {
                      renderItems.push({
                        key: `comp-${item.id}`,
                        type: 'completed',
                        title: item.displayTitle,
                        parentTitle: item.parentTitle,
                        isSubItem: item.isSubItem,
                        brandName: brandsMap.get(item.brandId || ''),
                        status: 'completed',
                        assignedToName: item.assignedToName,
                        assignedToAvatarUrl: item.assignedToAvatarUrl,
                        assignedToInitial: item.assignedToInitial,
                      });
                    });

                  const totalEvents = renderItems.length;
                  const hasEvents = totalEvents > 0;
                  const visibleItems = renderItems.slice(0, 2);
                  const extraCount = renderItems.length - visibleItems.length;

                  return (
                    <div
                      key={cell.dateStr}
                      id={`day-cell-${cell.dateStr}`}
                      data-is-day-one={cell.isFirstDayOfMonth ? 'true' : 'false'}
                      data-month={cell.monthNumber}
                      data-year={cell.yearNumber}
                      role={hasEvents ? 'button' : undefined}
                      tabIndex={hasEvents ? 0 : undefined}
                      aria-label={hasEvents ? `ดูรายละเอียดกิจกรรม ${getWeekdayText(cell.dateStr)} ${formatDateThai(cell.dateStr)}` : undefined}
                      onClick={() => {
                        if (hasEvents) {
                          setSelectedDayDetails({
                            dateStr: cell.dateStr,
                            holidayMatches: cell.holidayMatches,
                            dueTaskItems: cell.dueTaskItems,
                            completedTaskItems: cell.completedTaskItems,
                          });
                        }
                      }}
                      onKeyDown={(event) => {
                        if (hasEvents && (event.key === 'Enter' || event.key === ' ')) {
                          event.preventDefault();
                          setSelectedDayDetails({
                            dateStr: cell.dateStr,
                            holidayMatches: cell.holidayMatches,
                            dueTaskItems: cell.dueTaskItems,
                            completedTaskItems: cell.completedTaskItems,
                          });
                        }
                      }}
                      className={`min-h-[135px] p-2 transition-all relative flex flex-col justify-between ${
                        cell.monthNumber === currentMonth && cell.yearNumber === year
                          ? 'bg-white hover:bg-slate-50/90'
                          : 'bg-slate-50/70 opacity-35 hover:opacity-70'
                      } ${cell.isToday ? 'ring-2 ring-blue-500/40 bg-blue-50/20 opacity-100' : ''} ${hasEvents ? 'cursor-pointer group' : ''}`}
                    >
                      {/* Day Header */}
                      <div className="flex items-center justify-between mb-1">
                        {cell.isFirstDayOfMonth ? (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black shadow-xs ring-2 ${
                              cell.isToday
                                ? 'bg-blue-700 text-white ring-blue-300'
                                : 'bg-blue-600 text-white ring-blue-200'
                            }`}
                          >
                            <i className="fa-regular fa-calendar text-[10px]"></i>
                            1 {monthNamesShort[cell.monthNumber]}
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${cell.isToday
                              ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-300'
                              : isWeekend
                                ? 'text-rose-500'
                                : 'text-slate-700'
                              }`}
                          >
                            {cell.dayNumber}
                          </span>
                        )}

                        {cell.isToday ? (
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                            วันนี้
                          </span>
                        ) : urgentDueCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-extrabold text-rose-700 ring-1 ring-rose-200" title={`${urgentDueCount} งานเร่งด่วน`}>
                            <i className="fa-solid fa-fire text-[9px]" aria-hidden="true"></i>
                            ด่วน{urgentDueCount > 1 ? ` ${urgentDueCount}` : ''}
                          </span>
                        ) : hasEvents ? (
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        ) : null}
                      </div>

                      {/* Events Cards Container */}
                      {hasEvents && (
                        <div className="space-y-1.5 flex-1 flex flex-col justify-start">
                          {visibleItems.map(item => {
                            if (item.type === 'holiday') {
                              return (
                                <div
                                  key={item.key}
                                  className="p-2 rounded-xl border border-rose-200 bg-rose-50/80 text-rose-900 shadow-2xs hover:shadow-xs transition-all"
                                >
                                  <div className="flex items-center justify-between gap-1 mb-0.5">
                                    <span className="px-1.5 py-0.5 rounded-md font-extrabold text-[9px] bg-rose-500 text-white flex items-center gap-1">
                                      <i className="fa-solid fa-sparkles text-[8px]"></i> วันหยุด
                                    </span>
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 border border-rose-200">
                                      บริษัท
                                    </span>
                                  </div>
                                  <div className="font-bold text-rose-900 text-xs line-clamp-1 leading-tight">
                                    {item.title}
                                  </div>
                                </div>
                              );
                            }

                            const isComp = item.type === 'completed';
                            const statusLabel = isComp
                              ? 'เสร็จสิ้น'
                              : item.status === 'in_review'
                              ? 'รอตรวจ'
                              : item.status === 'in_progress'
                              ? 'กำลังผลิต'
                              : 'ไอเดีย';
                            const statusStyle = isComp
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : item.status === 'in_review'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : item.status === 'in_progress'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-purple-50 text-purple-700 border-purple-200';

                            const priorityMeta = TASK_PRIORITY_META[item.priority || 'low'];

                            return (
                              <div
                                key={item.key}
                                className={`p-2 rounded-xl border text-xs transition-all hover:scale-[1.01] hover:shadow-xs bg-white ${
                                  isComp
                                    ? 'border-emerald-200 hover:border-emerald-300'
                                    : item.priority === 'urgent'
                                    ? 'border-rose-200 hover:border-rose-300'
                                    : item.priority === 'high'
                                    ? 'border-amber-200 hover:border-amber-300'
                                    : 'border-slate-200 hover:border-blue-300'
                                } shadow-2xs flex flex-col justify-between gap-1`}
                                title={`${isComp ? 'เสร็จสิ้น' : priorityMeta.label}: ${item.isSubItem && item.parentTitle ? `งานหลัก ${item.parentTitle} › ` : ''}${item.title}${item.assignedToName ? ` (ผู้รับผิดชอบ: ${item.assignedToName})` : ''}`}
                              >
                                {/* Top Bar: Left Priority/Type + Right Status */}
                                <div className="flex items-center justify-between gap-1">
                                  <span
                                    className={`px-1.5 py-0.5 rounded-md font-extrabold text-[9px] flex items-center gap-1 ${
                                      isComp
                                        ? 'bg-blue-600 text-white'
                                        : item.priority === 'urgent'
                                        ? 'bg-rose-600 text-white'
                                        : item.priority === 'high'
                                        ? 'bg-orange-500 text-white'
                                        : item.priority === 'medium'
                                        ? 'bg-amber-500 text-white'
                                        : 'bg-blue-600 text-white'
                                    }`}
                                  >
                                    {isComp ? (
                                      'งาน'
                                    ) : (
                                      <>
                                        <i className={`fa-solid ${priorityMeta.icon} text-[8px]`}></i> {priorityMeta.label}
                                      </>
                                    )}
                                  </span>
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${statusStyle}`}>
                                    {statusLabel}
                                  </span>
                                </div>

                                {/* Title */}
                                <div className="my-0.5">
                                  {item.isSubItem && item.parentTitle && item.parentTitle !== item.title && (
                                    <div className="text-[10px] font-semibold text-slate-400 truncate leading-tight">
                                      {item.parentTitle}
                                    </div>
                                  )}
                                  <div className="font-bold text-slate-800 line-clamp-1 leading-tight text-xs">
                                    {item.title}
                                  </div>
                                </div>

                                {/* Footer: Brand on Left + Avatar on Right */}
                                <div className="flex items-center justify-between gap-1 text-[11px] pt-1 border-t border-slate-100 mt-0.5">
                                  {item.brandName ? (
                                    <span className="font-bold text-amber-600 truncate max-w-[80px] flex items-center gap-0.5 text-[10px]">
                                      🔥 {item.brandName}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 font-medium truncate">
                                      {item.isSubItem ? 'งานย่อย' : 'งานหลัก'}
                                    </span>
                                  )}

                                  {/* Avatar */}
                                  {item.assignedToName && (
                                    <div className="flex items-center gap-1 shrink-0" title={item.assignedToName}>
                                      <span className="w-5 h-5 rounded-full overflow-hidden bg-slate-100 ring-1 ring-white shadow-2xs flex items-center justify-center text-[9px] font-bold text-slate-700 shrink-0">
                                        {item.assignedToAvatarUrl ? (
                                          <img src={item.assignedToAvatarUrl} alt={item.assignedToName} className="w-full h-full object-cover" />
                                        ) : (
                                          item.assignedToInitial || <i className="fa-solid fa-user text-[7px]" aria-hidden="true"></i>
                                        )}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {extraCount > 0 && (
                            <div className="text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-1 rounded-lg flex items-center justify-between transition-all mt-auto shadow-2xs">
                              <span>+{extraCount} รายการเพิ่มเติม</span>
                              <i className="fa-solid fa-arrow-right text-[9px]"></i>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Bottom Infinite Scroll Trigger & Manual Load Button */}
              <div ref={bottomSentinelRef} className="p-6 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={loadNextMonth}
                  className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs text-xs font-bold flex items-center gap-2 transition-all cursor-pointer active:scale-95"
                >
                  <i className="fa-solid fa-angles-down text-blue-600 text-sm"></i>
                  <span>เลื่อนลงเพื่อดูเดือนถัดไปต่อเนื่อง (หรือคลิกโหลดเพิ่ม)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main View: List View */}
      {viewMode === 'list' && (
        <div className="order-2 space-y-6">
          {/* Search Bar */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex items-center gap-3">
            <i className="fa-solid fa-magnifying-glass text-slate-400 text-sm"></i>
            <input
              type="text"
              placeholder="ค้นหาชื่อวันหยุด หรือ วันที่..."
              className="w-full text-sm bg-transparent border-none outline-none text-slate-700 placeholder-slate-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1"
              >
                ล้างคำค้น
              </button>
            )}
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl p-12 text-center text-slate-400 border border-slate-200">
              <i className="fa-solid fa-spinner fa-spin text-2xl mb-2 text-blue-500 block"></i>
              กำลังโหลดรายการวันหยุด...
            </div>
          ) : Object.keys(filteredGroupedHolidays).length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center text-slate-500 border border-slate-200">
              <i className="fa-solid fa-calendar-xmark text-3xl mb-3 text-slate-300 block"></i>
              ไม่พบข้อมูลวันหยุดในเงื่อนไขที่ค้นหา
            </div>
          ) : (
            Object.keys(filteredGroupedHolidays).map((monthStr) => {
              const m = Number(monthStr);
              const items = filteredGroupedHolidays[m];
              return (
                <div key={m} className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                  <div className="bg-slate-50 px-6 py-3.5 border-b border-slate-100 flex items-center justify-between">
                    <h4 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                      <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                      เดือน{monthNames[m]}
                    </h4>
                    <span className="text-xs text-slate-500 font-semibold bg-white border border-slate-200 px-2.5 py-1 rounded-full">
                      {items.length} วันหยุด
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {items.map((h) => {
                      const isLW = isLongWeekend(h.date, h.num_days);
                      const consecDays = getConsecutiveDaysOff(h.date, h.num_days);
                      return (
                        <div
                          key={h.id}
                          className="p-4 sm:p-5 hover:bg-slate-50/70 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        >
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/60 text-amber-600 flex flex-col items-center justify-center shrink-0">
                              <span className="text-[10px] font-bold uppercase tracking-wider">{monthNames[m].substring(0, 3)}</span>
                              <span className="text-lg font-black leading-none">{new Date(h.date).getDate()}</span>
                            </div>

                            <div className="space-y-1">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <h5 className="font-bold text-slate-800 text-base">{h.name}</h5>
                                {isLW && (
                                  <span className="text-xs bg-amber-100 text-amber-800 border border-amber-200 font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                                    <i className="fa-solid fa-plane text-[10px]"></i> Long Weekend ({consecDays} วันติด)
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 flex items-center gap-3">
                                <span>{getWeekdayText(h.date)}ที่ {formatDateThai(h.date)}</span>
                                <span>•</span>
                                <span>จำนวน {h.num_days} วัน</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            <button
                              onClick={() => setSelectedHoliday(h)}
                              className="px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-all border border-blue-200/80 cursor-pointer"
                            >
                              รายละเอียด
                            </button>

                            {isAdmin && (
                              <button
                                disabled={actionLoading === h.id}
                                onClick={() => handleDelete(h.id)}
                                className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-all border border-rose-200/80 cursor-pointer disabled:opacity-50"
                              >
                                {actionLoading === h.id ? 'กำลังลบ...' : 'ลบ'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Day Activity Details Modal */}
      {selectedDayDetails && (
        <div className="holiday-day-details-overlay fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="holiday-day-details-modal bg-white rounded-3xl max-w-2xl sm:max-w-3xl w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="bg-white px-6 py-5 border-b border-slate-100 relative shrink-0 flex items-center justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/80 text-[11px] font-bold mb-1.5">
                  <i className="fa-solid fa-calendar-day text-[10px] text-blue-600"></i>
                  รายละเอียดกิจกรรมประจำวัน
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
                  <span className="text-blue-600">{getWeekdayText(selectedDayDetails.dateStr)}</span> {formatDateThai(selectedDayDetails.dateStr)}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDayDetails(null)}
                aria-label="ปิดรายละเอียดกิจกรรมประจำวัน"
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-all cursor-pointer shrink-0"
              >
                <i className="fa-solid fa-xmark text-base"></i>
              </button>
            </div>

            {/* Content List */}
            <div className="holiday-day-details-content p-6 space-y-5 overflow-y-auto custom-scrollbar bg-slate-50/50">
              {/* Holidays section */}
              {selectedDayDetails.holidayMatches.length > 0 && (
                <div className="space-y-2.5">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <i className="fa-solid fa-sparkles text-rose-500"></i>
                    วันหยุดบริษัท
                  </div>
                  {selectedDayDetails.holidayMatches.map(h => (
                    <div key={h.id} className="p-4 rounded-2xl bg-white border border-rose-200 shadow-xs flex items-center justify-between">
                      <div>
                        <div className="font-extrabold text-rose-900 text-base">{h.name}</div>
                        <div className="text-xs text-rose-600/80 mt-0.5">
                          วันหยุดประจำปีบริษัท ({h.num_days} วัน)
                        </div>
                      </div>
                      {isLongWeekend(h.date, h.num_days) && (
                        <span className="text-xs bg-rose-50 text-rose-700 border border-rose-200 px-3 py-1 rounded-full font-bold inline-flex items-center gap-1.5">
                          <i className="fa-solid fa-plane text-[10px]"></i> Long Weekend
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Due Tasks Section */}
              {selectedDayDetails.dueTaskItems.length > 0 && (
                <div className="space-y-2.5">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <i className="fa-solid fa-clock text-blue-600"></i>
                    งานย่อยและกำหนดส่งวันนี้ ({selectedDayDetails.dueTaskItems.length} รายการ)
                  </div>
                  <div className="space-y-3">
                    {selectedDayDetails.dueTaskItems.map(item => {
                      const brandName = brandsMap.get(item.brandId || '');
                      const rawTask = item.rawTask;
                      const subItems = (rawTask.sub_items || []).filter(s => !(s as any).deleted_at && !(s as any).is_deleted && ((s as any).status as string) !== 'trash');
                      const deliverableLists = (rawTask.lists || []).filter(l => {
                        const st = (l.status as string) || '';
                        return !l.deleted_at && st !== 'trash' && st !== 'deleted';
                      });

                      return (
                        <div key={item.id} className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-blue-300 transition-all space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1.5 flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {item.assignedToName && (
                                  <div className="text-xs text-slate-700 font-bold flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200 shadow-2xs">
                                    {item.assignedToAvatarUrl ? (
                                      <img
                                        src={item.assignedToAvatarUrl}
                                        alt={item.assignedToName}
                                        className="w-4 h-4 rounded-full object-cover shrink-0 border border-slate-300 shadow-2xs"
                                      />
                                    ) : (
                                      <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 font-bold text-[8px] flex items-center justify-center shrink-0">
                                        {item.assignedToInitial || <i className="fa-solid fa-user text-[7px]" aria-hidden="true"></i>}
                                      </span>
                                    )}
                                    <span>{item.assignedToName}</span>
                                  </div>
                                )}
                                {brandName && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 rounded-full">
                                    🔥 {brandName}
                                  </span>
                                )}
                                {item.isSubItem && (
                                  <span className="inline-block text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-full">
                                    งานย่อย
                                  </span>
                                )}
                              </div>
                              <h4 className="font-extrabold text-slate-900 text-base leading-snug">{item.displayTitle}</h4>
                              {item.parentTitle && item.parentTitle !== item.displayTitle && (
                                <p className="text-xs text-slate-500 font-medium">
                                  งานหลัก: <span className="text-slate-700 font-semibold">{item.parentTitle}</span>
                                </p>
                              )}
                            </div>

                            <span className={`holiday-priority-status text-[10px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${item.priority === 'urgent' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                              item.priority === 'high' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                              item.priority === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                'bg-slate-100 text-slate-600 border-slate-200'
                              }`}>
                              {item.priority ? item.priority.toUpperCase() : 'NORMAL'}
                            </span>
                          </div>

                          {/* Raw task description */}
                          {rawTask.description && (
                            <p className="text-xs text-slate-600 line-clamp-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100">{rawTask.description}</p>
                          )}

                          {/* Sub-items Checklist breakdown if available */}
                          {subItems.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
                                <span>รายการงานย่อยทั้งหมด ({subItems.filter(s => s.is_done || s.status === 'completed').length}/{subItems.length})</span>
                              </div>
                              <div className="space-y-1 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
                                {subItems.map(s => {
                                  const isDone = s.is_done || s.status === 'completed';
                                  return (
                                    <div
                                      key={s.id}
                                      className={`text-xs px-3 py-1.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                                        isDone
                                          ? 'bg-emerald-50/50 border-emerald-100 text-slate-700'
                                          : 'bg-slate-50/70 border-slate-100 text-slate-700 hover:bg-slate-100/70'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 truncate">
                                        <i className={`fa-solid ${isDone ? 'fa-circle-check text-emerald-600 text-sm' : 'fa-circle text-slate-300 text-xs'}`}></i>
                                        <span className={`truncate font-medium ${isDone ? 'line-through text-slate-400' : 'text-slate-700'}`}>{s.title}</span>
                                      </div>
                                      {s.due_date && (
                                        <span className="text-[10px] text-slate-400 font-medium shrink-0 bg-white border border-slate-100 px-2 py-0.5 rounded-md">ส่ง: {s.due_date.split('T')[0]}</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Lists (Deliverables) breakdown if available */}
                          {deliverableLists.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
                                <span>รายการงานย่อย (Deliverables) ({deliverableLists.filter(l => l.status === 'completed').length}/{deliverableLists.length})</span>
                              </div>
                              <div className="space-y-1 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                                {deliverableLists.map(l => {
                                  const isDone = l.status === 'completed';
                                  return (
                                    <div
                                      key={l.id}
                                      className={`text-xs px-3 py-2 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                                        isDone
                                          ? 'bg-emerald-50/50 border-emerald-100 text-slate-700'
                                          : 'bg-slate-50/70 border-slate-100 text-slate-700 hover:bg-slate-100/70'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 truncate">
                                        <i className={`fa-solid ${isDone ? 'fa-circle-check text-emerald-600 text-sm' : 'fa-list-check text-indigo-500 text-sm'}`}></i>
                                        <span className={`truncate font-medium ${isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>{l.name}</span>
                                      </div>
                                      {l.due_date && (
                                        <span className="text-[10px] text-slate-400 font-medium shrink-0 bg-white border border-slate-100 px-2 py-0.5 rounded-md">ส่ง: {l.due_date.split('T')[0]}</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-end pt-2 border-t border-slate-100 text-xs">
                            <button
                              onClick={() => {
                                setSelectedDayDetails(null);
                                navigate('/tasks');
                              }}
                              className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                            >
                              จัดการงานในโครงการ <i className="fa-solid fa-arrow-right text-[10px]"></i>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Completed Tasks Section */}
              {selectedDayDetails.completedTaskItems.length > 0 && (
                <div className="space-y-2.5">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <i className="fa-solid fa-circle-check text-emerald-500"></i>
                    งานที่เสร็จสมบูรณ์วันนี้ ({selectedDayDetails.completedTaskItems.length} รายการ)
                  </div>
                  <div className="space-y-2.5">
                    {selectedDayDetails.completedTaskItems.map(item => {
                      const brandName = brandsMap.get(item.brandId || '');
                      return (
                        <div key={item.id} className="p-4 rounded-2xl bg-white border border-emerald-200/80 shadow-xs flex items-center justify-between gap-3">
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {item.assignedToName && (
                                <div className="text-xs text-slate-700 font-bold flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200 shadow-2xs">
                                  {item.assignedToAvatarUrl ? (
                                    <img
                                      src={item.assignedToAvatarUrl}
                                      alt={item.assignedToName}
                                      className="w-4 h-4 rounded-full object-cover shrink-0 border border-slate-300 shadow-2xs"
                                    />
                                  ) : (
                                    <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[8px] flex items-center justify-center shrink-0">
                                      {item.assignedToInitial || <i className="fa-solid fa-user text-[7px] text-emerald-600" aria-hidden="true"></i>}
                                    </span>
                                  )}
                                  <span>{item.assignedToName}</span>
                                </div>
                              )}
                              {brandName && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 rounded-full">
                                  🔥 {brandName}
                                </span>
                              )}
                            </div>
                            <h4 className="font-bold text-slate-900 text-sm">{item.displayTitle}</h4>
                            {item.parentTitle && item.parentTitle !== item.displayTitle && (
                              <p className="text-xs text-slate-500">งานหลัก: {item.parentTitle}</p>
                            )}
                          </div>
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full flex items-center gap-1.5 shrink-0">
                            <i className="fa-solid fa-check text-[10px]"></i> เสร็จสิ้น
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="holiday-day-details-footer p-4 bg-white border-t border-slate-100 flex items-center justify-end shrink-0">
              <button
                onClick={() => setSelectedDayDetails(null)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200/80 transition-all cursor-pointer shadow-2xs"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Holiday Detail Modal */}
      {selectedHoliday && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-blue-600 p-6 text-white relative">
              <button
                onClick={() => setSelectedHoliday(null)}
                aria-label="ปิดรายละเอียดวันหยุด"
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
              <div className="text-xs font-semibold text-blue-100 uppercase tracking-wider mb-1">รายละเอียดวันหยุด</div>
              <h3 className="text-xl font-extrabold">{selectedHoliday.name}</h3>
            </div>

            <div className="p-6 space-y-4 text-slate-700">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-xs text-slate-500 font-semibold">วันที่หยุด</span>
                <span className="text-sm font-bold text-slate-800">{getWeekdayText(selectedHoliday.date)} {formatDateThai(selectedHoliday.date)}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-xs text-slate-500 font-semibold">จำนวนวันหยุดบริษัท</span>
                <span className="text-sm font-bold text-amber-600">{selectedHoliday.num_days} วัน</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-xs text-slate-500 font-semibold">หยุดต่อเนื่องสุทธิ (รวม ส.-อา.)</span>
                <span className="text-sm font-bold text-purple-600">
                  {getConsecutiveDaysOff(selectedHoliday.date, selectedHoliday.num_days)} วัน
                </span>
              </div>

              {isLongWeekend(selectedHoliday.date, selectedHoliday.num_days) && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-2xl text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <i className="fa-solid fa-plane text-amber-600"></i> วันหยุดยาว (Long Weekend)
                  </div>
                  <p className="text-amber-700/90 leading-relaxed">
                    วันหยุดนี้ติดกับวันเสาร์-อาทิตย์ เหมาะสำหรับวางแผนพักผ่อน หรือจัดทริปท่องเที่ยวล่วงหน้า
                  </p>
                </div>
              )}
            </div>

            <div className={`p-4 bg-slate-50 border-t border-slate-100 flex items-center ${isAdmin ? 'justify-between' : 'justify-end'}`}>
              {isAdmin && (
                <button
                  onClick={() => handleDelete(selectedHoliday.id)}
                  className="px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-100/60 rounded-xl transition-all border border-rose-200 cursor-pointer"
                >
                  <i className="fa-solid fa-trash mr-1.5"></i> ลบวันหยุดนี้
                </button>
              )}

              <button
                onClick={() => setSelectedHoliday(null)}
                className="px-5 py-2 bg-slate-800 text-white hover:bg-slate-900 text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Holiday Modal (Admin Only) */}
      {showAddModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-white p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-sm border border-blue-100">
                    <i className="fa-solid fa-calendar-plus"></i>
                  </span>
                  เพิ่มวันหยุดใหม่
                </h3>
                <p className="text-xs text-slate-500 mt-1">กำหนดวันหยุดบริษัทและบันทึกลงในระบบ</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                aria-label="ปิดฟอร์มเพิ่มวันหยุด"
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-all cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">วันที่เริ่มต้น</label>
                <input
                  type="date"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ชื่อวันหยุด</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  placeholder="เช่น วันสงกรานต์, วันแรงงานแห่งชาติ"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">จำนวนวันหยุด (วัน)</label>
                <input
                  type="number"
                  min={1}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  value={formDays}
                  onChange={(e) => setFormDays(Number(e.target.value))}
                  required
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {formLoading ? (
                    <span className="flex items-center gap-2">
                      <i className="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...
                    </span>
                  ) : (
                    'บันทึกวันหยุด'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Quick Action Filter Dock (Appears smoothly when scrolling down) */}
      {isScrolledDown && viewMode === 'calendar' && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 hover:bg-slate-900 text-white backdrop-blur-xl px-4 py-2.5 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 transition-all">
          {/* Current Month & Year Badge */}
          <div className="flex items-center gap-1.5 font-bold text-xs text-white pr-2.5 border-r border-slate-700">
            <i className="fa-regular fa-calendar-days text-blue-400"></i>
            <span>{monthNamesShort[currentMonth]} {year + 543}</span>
          </div>

          {/* Quick Month Dropdown */}
          <select
            value={currentMonth}
            onChange={(e) => handleSelectMonth(Number(e.target.value))}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-2.5 py-1.5 rounded-xl border border-slate-700 outline-none cursor-pointer"
          >
            {monthNames.map((mName, idx) => (
              <option key={idx} value={idx}>
                เดือน{mName}
              </option>
            ))}
          </select>

          {/* Assignee Filter Dropdown */}
          {isAdmin && (
            <div className="flex items-center gap-1.5 pl-1 border-l border-slate-700">
              <i className="fa-solid fa-user-check text-xs text-indigo-400"></i>
              <select
                id="floating-task-person-filter"
                aria-label="กรองงานตามผู้รับผิดชอบ"
                value={taskPersonFilter}
                onChange={(event) => setTaskPersonFilter(event.target.value)}
                className="bg-slate-800 hover:bg-slate-700 text-indigo-200 text-xs font-bold px-2.5 py-1.5 rounded-xl border border-slate-700 outline-none cursor-pointer max-w-[150px]"
              >
                <option value="all">ทุกคน ({tasks.length})</option>
                {taskFilterUsers.map(user => {
                  const displayName = user.nickname?.trim() || `${user.first_name} ${user.last_name}`.trim();
                  const taskCount = tasks.filter(task => isTaskAssignedTo(task, user.id)).length;
                  return (
                    <option key={user.id} value={user.id}>
                      {displayName || user.email} ({taskCount})
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Scroll to Top Action Button */}
          <button
            type="button"
            onClick={() => {
              const contentArea = document.querySelector('.content-area');
              if (contentArea) {
                contentArea.scrollTo({ top: 0, behavior: 'smooth' });
              } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            className="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center text-xs transition-all shadow-md active:scale-95 ml-1 cursor-pointer"
            title="กลับขึ้นบนสุด"
          >
            <i className="fa-solid fa-arrow-up"></i>
          </button>
        </div>
      )}
    </div>
  );
}
