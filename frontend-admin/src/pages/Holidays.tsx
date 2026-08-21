import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchHolidays, createHoliday, deleteHoliday, fetchAdminTasks, fetchBrands, fetchUsers } from '../services/adminApi';
import type { Holiday, User, AdminTask, Brand } from '../types';
import { getTaskPriority, type TaskPriority } from '../components/tasks/taskUtils';
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
    enabled: Boolean(currentUser?.id && isAdmin),
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
    if (!isAdmin || taskPersonFilter === 'all') return tasks;
    return tasks.filter(task => isTaskAssignedTo(task, taskPersonFilter));
  }, [isAdmin, taskPersonFilter, tasks]);

  const monthNames = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
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

  // Find nearest upcoming holiday
  const upcomingHolidayInfo = useMemo(() => {
    const nowMs = today.getTime();

    // Filter holidays that end today or later
    const futureHolidays = holidays
      .map(h => {
        const startDate = new Date(h.date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(startDate.getTime() + ((h.num_days || 1) - 1) * 86400000);
        const diffMs = startDate.getTime() - nowMs;
        const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        return { holiday: h, startDate, endDate, daysLeft };
      })
      .filter(item => item.endDate.getTime() >= nowMs)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    return futureHolidays.length > 0 ? futureHolidays[0] : null;
  }, [holidays, today]);

  // Statistics calculation
  const stats = useMemo(() => {
    const totalDays = holidays.reduce((sum, h) => sum + (h.num_days || 1), 0);
    const longWeekends = holidays.filter(h => isLongWeekend(h.date, h.num_days)).length;

    // Remaining holidays this year
    const remainingCount = holidays.filter(h => {
      const d = new Date(h.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() >= today.getTime();
    }).length;

    return { totalHolidays: holidays.length, totalDays, longWeekends, remainingCount };
  }, [holidays, today]);

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
          assignedToName: task.assigned_to_name,
          dueDate: taskDueDate,
          completedAt: taskCompletedDate || (taskCompleted ? taskDueDate : undefined),
          rawTask: task,
          isSubItem: false,
        });
      }

      task.sub_items?.forEach(sub => {
        const subDueDate = datePart(sub.due_date) || taskDueDate;
        const isSubDone = sub.is_done || sub.status === 'completed';
        const subCompletedDate = isSubDone
          ? taskCompletedDate || subDueDate
          : undefined;

        if (!subDueDate && !subCompletedDate) return;
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
          assignedToName: task.assigned_to_name,
          dueDate: subDueDate,
          completedAt: subCompletedDate,
          rawTask: task,
          isSubItem: true,
        });
      });

      task.lists?.forEach(list => {
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
            assignedToName: task.assigned_to_name,
            dueDate: listDueDate,
            completedAt: listCompletedDate,
            rawTask: task,
            isSubItem: true,
          });
        }

        list.cards?.forEach(card => {
          const cardDueDate = datePart(card.due_date) || listDueDate;
          const isCardDone = card.status === 'completed' || isListDone;
          const cardCompletedDate = isCardDone ? listCompletedDate || cardDueDate : undefined;

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
              assignedToName: task.assigned_to_name,
              dueDate: cardDueDate,
              completedAt: cardCompletedDate,
              rawTask: task,
              isSubItem: true,
            });
          }

          card.sub_items?.forEach(sub => {
            const subDueDate = datePart(sub.due_date) || cardDueDate;
            const isSubDone = sub.is_done || sub.status === 'completed';
            const subCompletedDate = isSubDone
              ? cardCompletedDate || subDueDate
              : undefined;

            if (!subDueDate && !subCompletedDate) return;
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
              assignedToName: task.assigned_to_name,
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
  }, [visibleTasks]);

  const taskOverview = useMemo(() => {
    const todayKey = formatDateStr(today);
    const upcoming = taskItems
      .filter(item => !item.isCompleted && !!item.dueDate && item.dueDate >= todayKey)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    const completed = taskItems
      .filter(item => item.isCompleted && !!(item.completedAt || item.dueDate))
      .sort((a, b) => (b.completedAt || b.dueDate || '').localeCompare(a.completedAt || a.dueDate || ''));

    return {
      upcoming,
      completed,
      upcomingPreview: upcoming.slice(0, 5),
      completedPreview: completed.slice(0, 5),
    };
  }, [taskItems, today]);

  const upcomingTaskInfo = taskOverview.upcoming[0] ?? null;
  const upcomingTaskLabel = upcomingTaskInfo
    ? (upcomingTaskInfo.isSubItem && upcomingTaskInfo.parentTitle !== upcomingTaskInfo.displayTitle
      ? `${upcomingTaskInfo.parentTitle} › ${upcomingTaskInfo.displayTitle}`
      : upcomingTaskInfo.displayTitle)
    : '';

  // Calendar Grid builder for current month
  const calendarCells = useMemo(() => {
    const daysInMonth = new Date(year, currentMonth + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, currentMonth, 1).getDay(); // 0 = Sun
    const prevMonthDays = new Date(year, currentMonth, 0).getDate();

    // Map task items by due date and completed date
    const dueTaskItemsMap = new Map<string, CalendarTaskItem[]>();
    const completedTaskItemsMap = new Map<string, CalendarTaskItem[]>();

    taskItems.forEach(item => {
      if (item.isCompleted) {
        const cDate = item.completedAt || item.dueDate;
        if (cDate) {
          if (!completedTaskItemsMap.has(cDate)) completedTaskItemsMap.set(cDate, []);
          completedTaskItemsMap.get(cDate)!.push(item);
        }
      } else {
        const dDate = item.dueDate;
        if (dDate) {
          if (!dueTaskItemsMap.has(dDate)) dueTaskItemsMap.set(dDate, []);
          dueTaskItemsMap.get(dDate)!.push(item);
        }
      }
    });

    const cells: Array<{
      dayNumber: number;
      isCurrentMonth: boolean;
      dateStr: string;
      isToday: boolean;
      holidayMatches: Holiday[];
      dueTaskItems: CalendarTaskItem[];
      completedTaskItems: CalendarTaskItem[];
    }> = [];

    const createCellData = (dNum: number, isCurr: boolean, dateStr: string) => {
      const isToday = formatDateStr(today) === dateStr;

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

      return {
        dayNumber: dNum,
        isCurrentMonth: isCurr,
        dateStr,
        isToday,
        holidayMatches: matchedHolidays,
        dueTaskItems: dueTaskItemsMap.get(dateStr) || [],
        completedTaskItems: completedTaskItemsMap.get(dateStr) || [],
      };
    };

    // Previous month padding
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const prevM = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevY = currentMonth === 0 ? year - 1 : year;
      const dateStr = `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      cells.push(createCellData(dayNum, false, dateStr));
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push(createCellData(d, true, dateStr));
    }

    // Next month padding
    const totalCellsNeeded = cells.length > 35 ? 42 : 35;
    const remaining = totalCellsNeeded - cells.length;
    for (let i = 1; i <= remaining; i++) {
      const nextM = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextY = currentMonth === 11 ? year + 1 : year;
      const dateStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      cells.push(createCellData(i, false, dateStr));
    }

    return cells;
  }, [year, currentMonth, holidays, taskItems, today]);

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
    <div id="holidays" className="page-section active flex w-full min-w-0 flex-none flex-col overflow-x-hidden max-w-7xl mx-auto pb-12" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header Section */}
      <div className="order-1 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
              <span className="w-10 h-10 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20 flex items-center justify-center text-base">
                <i className="fa-solid fa-calendar-days"></i>
              </span>
              ปฏิทินวันหยุดบริษัท
            </h2>
            <span className="bg-slate-100 text-slate-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-slate-200">
              ปี {year + 543}
            </span>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            {isAdmin
              ? 'ตรวจสอบวันหยุดประจำปี เพิ่มหรือจัดการวันหยุดสำหรับพนักงานในระบบ'
              : ''}
          </p>
          {tasksQuery.isFetching ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-semibold text-blue-600" role="status" aria-live="polite">
              <i className="fa-solid fa-rotate fa-spin" aria-hidden="true"></i>
              กำลังซิงค์งานล่าสุด...
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Year Selector */}
          <div className="relative">
            <select
              className="appearance-none bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl px-4 py-2.5 pr-9 shadow-xs hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {[year - 1, year, year + 1].map(y => (
                <option key={y} value={y}>พ.ศ. {y + 543} ({y})</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
              <i className="fa-solid fa-chevron-down text-xs"></i>
            </div>
          </div>

          {/* View Mode Switcher */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200">
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${viewMode === 'calendar'
                ? 'bg-white text-blue-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
                }`}
            >
              <i className="fa-solid fa-calendar-days text-sm"></i>
              ปฏิทิน
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${viewMode === 'list'
                ? 'bg-white text-blue-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
                }`}
            >
              <i className="fa-solid fa-list-ul text-sm"></i>
              รายการ
            </button>
          </div>

          {/* Add Holiday Button (Admin only) */}
          {isAdmin && (
            <button
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm px-4 py-2.5 rounded-xl shadow-md shadow-blue-500/20 hover:shadow-blue-500/30 active:scale-98 transition-all flex items-center gap-2 cursor-pointer"
              onClick={() => setShowAddModal(true)}
            >
              <i className="fa-solid fa-plus text-xs"></i>
              เพิ่มวันหยุด
            </button>
          )}
        </div>
      </div>

      {/* Top Banner: Upcoming Holiday Spotlight */}
      {upcomingHolidayInfo ? (
        <div className="hidden order-3 mb-8 pb-6 border-b border-slate-200/60">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold border border-amber-200/70 shadow-2xs">
                <i className="fa-solid fa-sparkles text-[11px] text-amber-600"></i>
                วันหยุดที่จะถึงถัดไป
              </div>

              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                {upcomingHolidayInfo.holiday.name}
                {isLongWeekend(upcomingHolidayInfo.holiday.date, upcomingHolidayInfo.holiday.num_days) && (
                  <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2.5 py-0.5 rounded-full font-semibold inline-flex items-center gap-1.5 shadow-2xs">
                    <i className="fa-solid fa-plane text-[10px] text-emerald-600"></i> Long Weekend
                  </span>
                )}
              </h3>

              <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-slate-600 font-medium">
                <div className="flex items-center gap-2">
                  <i className="fa-regular fa-calendar-check text-blue-600"></i>
                  <span>{getWeekdayText(upcomingHolidayInfo.holiday.date)} {formatDateThai(upcomingHolidayInfo.holiday.date)}</span>
                </div>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                <div className="flex items-center gap-2">
                  <i className="fa-regular fa-clock text-indigo-600"></i>
                  <span>หยุดต่อเนื่อง {getConsecutiveDaysOff(upcomingHolidayInfo.holiday.date, upcomingHolidayInfo.holiday.num_days)} วัน</span>
                </div>
              </div>
            </div>

            {/* Countdown Badge */}
            <div className="w-full md:w-auto bg-amber-50/70 rounded-2xl px-6 py-3.5 border border-amber-200/60 flex items-center justify-between md:flex-col md:justify-center text-center shrink-0 min-w-[145px]">
              <span className="text-xs text-amber-800/80 font-bold">จะถึงในอีก</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                {upcomingHolidayInfo.daysLeft === 0 ? (
                  <span className="text-lg font-extrabold text-amber-600">วันนี้วันหยุด! 🎉</span>
                ) : (
                  <>
                    <span className="text-3xl sm:text-4xl font-black text-amber-600 tracking-tight">{upcomingHolidayInfo.daysLeft}</span>
                    <span className="text-xs font-bold text-amber-800">วัน</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden order-3 mb-8 py-3 flex items-center gap-4 border-b border-slate-200/60">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-base border border-blue-100 shadow-2xs">
            <i className="fa-solid fa-calendar-check"></i>
          </div>
          <div>
            <div className="font-bold text-slate-800 text-sm">ไม่มีวันหยุดคงเหลือในปี {year + 543}</div>
            <p className="text-xs text-slate-500">คุณสามารถเปลี่ยนปี พ.ศ. ด้านบนเพื่อตรวจสอบปฏิทินวันหยุดปีก่อนหน้าหรือปีถัดไป</p>
          </div>
        </div>
      )}

      {/* Quick Stats Grid */}
      <div className="hidden order-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-lg font-bold">
            <i className="fa-solid fa-calendar-days"></i>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">วันหยุดทั้งหมด</div>
            <div className="text-xl font-black text-slate-800 mt-0.5">{stats.totalDays} <span className="text-xs font-normal text-slate-500">วัน</span></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-lg font-bold">
            <i className="fa-solid fa-hourglass-half"></i>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">คงเหลือในปีนี้</div>
            <div className="text-xl font-black text-amber-600 mt-0.5">{stats.remainingCount} <span className="text-xs font-normal text-slate-500">รายการ</span></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-lg font-bold">
            <i className="fa-solid fa-plane"></i>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">วันหยุดยาว 3+ วัน</div>
            <div className="text-xl font-black text-purple-600 mt-0.5">{stats.longWeekends} <span className="text-xs font-normal text-slate-500">ครั้ง</span></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg font-bold">
            <i className="fa-solid fa-list-check"></i>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">งานใกล้ถึง</div>
            <div className="text-xl font-black text-indigo-600 mt-0.5">{taskOverview.upcoming.length} <span className="text-xs font-normal text-slate-500">รายการ</span></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg font-bold">
            <i className="fa-solid fa-circle-check"></i>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">งานเสร็จแล้ว</div>
            <div className="text-xl font-black text-emerald-600 mt-0.5">{taskOverview.completed.length} <span className="text-xs font-normal text-slate-500">รายการ</span></div>
          </div>
        </div>
      </div>

      {/* Assigned work overview */}
      {(taskOverview.upcoming.length > 0 || taskOverview.completed.length > 0) && (
        <section className="hidden order-5 grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8" aria-labelledby="assigned-work-heading">
          <h3 id="assigned-work-heading" className="sr-only">สรุปงานที่ได้รับมอบหมาย</h3>
          {[
            {
              title: 'งานใกล้ถึง',
              icon: 'fa-clock',
              iconClass: 'text-indigo-600 bg-indigo-50',
              itemClass: 'border-indigo-100 hover:border-indigo-300',
              items: taskOverview.upcomingPreview,
              emptyText: 'ไม่มีงานที่กำลังจะถึง',
              dateKey: 'dueDate' as const,
            },
            {
              title: 'งานที่เสร็จแล้ว',
              icon: 'fa-circle-check',
              iconClass: 'text-emerald-600 bg-emerald-50',
              itemClass: 'border-emerald-100 hover:border-emerald-300',
              items: taskOverview.completedPreview,
              emptyText: 'ยังไม่มีงานที่เสร็จแล้ว',
              dateKey: 'completedAt' as const,
            },
          ].map(group => (
            <div key={group.title} className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${group.iconClass}`}>
                    <i className={`fa-solid ${group.icon}`}></i>
                  </span>
                  <div>
                    <h4 className="font-bold text-slate-800">{group.title}</h4>
                    <p className="text-[11px] text-slate-500">{group.items.length > 0 ? `แสดง ${group.items.length} รายการล่าสุด` : 'อัปเดตจากงานที่ได้รับมอบหมาย'}</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-full">
                  {group.title === 'งานใกล้ถึง' ? taskOverview.upcoming.length : taskOverview.completed.length}
                </span>
              </div>
              <div className="p-3 space-y-2">
                {group.items.length === 0 ? (
                  <div className="py-6 text-center text-sm text-slate-400">{group.emptyText}</div>
                ) : group.items.map(item => {
                  const itemDate = item[group.dateKey] || item.dueDate;
                  return (
                    <div key={`${group.title}-${item.id}`} className={`p-3 rounded-xl border bg-slate-50/50 transition-colors ${group.itemClass}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {item.isSubItem && (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">งานย่อย</span>
                            )}
                            {item.brandId && brandsMap.get(item.brandId) && (
                              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-md">{brandsMap.get(item.brandId)}</span>
                            )}
                          </div>
                          <p className="font-semibold text-sm text-slate-800 truncate mt-1" title={item.displayTitle}>{item.displayTitle}</p>
                          {item.isSubItem && <p className="text-[11px] text-slate-500 truncate">งานหลัก: {item.parentTitle}</p>}
                        </div>
                        <span className="text-[11px] font-semibold text-slate-500 shrink-0">{itemDate ? formatDateThai(itemDate) : '-'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Main View: Calendar View */}
      {viewMode === 'calendar' && (
        <div className="order-2 mb-8 flex-none bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Month Header Controller */}
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2.5">
              <h3 className="text-lg font-bold text-slate-800">
                {monthNames[currentMonth]} {year + 543}
              </h3>
              <span className="text-xs bg-slate-200 text-slate-700 font-medium px-2.5 py-0.5 rounded-full">
                {holidays.filter(h => new Date(h.date).getMonth() === currentMonth).length} วันหยุด
              </span>
              {upcomingHolidayInfo && (
                <span
                  className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800"
                  title={`วันหยุดที่จะถึง: ${upcomingHolidayInfo.holiday.name}`}
                >
                  <i className="fa-solid fa-clock text-[10px] text-amber-600" aria-hidden="true"></i>
                  <span className="truncate">ถัดไป: {upcomingHolidayInfo.holiday.name} · {formatDateThai(upcomingHolidayInfo.holiday.date)}</span>
                </span>
              )}
              {upcomingTaskInfo && (
                <span
                  className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-800"
                  title={`งานใกล้ครบกำหนด: ${upcomingTaskLabel}`}
                >
                  <i className="fa-solid fa-list-check text-[10px] text-indigo-600" aria-hidden="true"></i>
                  <span className="truncate">งานใกล้ครบกำหนด: {upcomingTaskLabel} · {formatDateThai(upcomingTaskInfo.dueDate || '')}</span>
                  {upcomingTaskInfo.priority && upcomingTaskInfo.priority !== 'low' && (
                    <span className={`holiday-priority-pill shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold ${TASK_PRIORITY_META[upcomingTaskInfo.priority].className}`}>
                      {TASK_PRIORITY_META[upcomingTaskInfo.priority].label}
                    </span>
                  )}
                </span>
              )}
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {isAdmin && (
                <div className="flex min-w-0 max-w-full items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/70 px-2 py-1.5">
                  <label htmlFor="holiday-task-person-filter" className="hidden sm:inline text-[11px] font-bold text-indigo-700 whitespace-nowrap">
                    ดูงานของ
                  </label>
                  <i className="fa-regular fa-user text-[11px] text-indigo-500 sm:hidden" aria-hidden="true"></i>
                  <select
                    id="holiday-task-person-filter"
                    aria-label="กรองงานตามผู้รับผิดชอบ"
                    value={taskPersonFilter}
                    onChange={(event) => setTaskPersonFilter(event.target.value)}
                    className="w-[118px] max-w-full bg-transparent text-xs font-bold text-indigo-800 outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded-md sm:w-[150px]"
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
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-indigo-500 hover:bg-indigo-100 hover:text-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                    >
                      <i className="fa-solid fa-xmark text-[10px]" aria-hidden="true"></i>
                    </button>
                  )}
                </div>
              )}

              {/* Month Selector Tabs Dropdown */}
              <select
                className="w-[118px] bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg px-3 py-1.5 shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:w-auto"
                value={currentMonth}
                onChange={(e) => setCurrentMonth(Number(e.target.value))}
              >
                {monthNames.map((mName, idx) => (
                  <option key={idx} value={idx}>
                    เดือน{mName}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentMonth(prev => (prev === 0 ? 11 : prev - 1))}
                  aria-label="ไปเดือนก่อนหน้า"
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-all cursor-pointer shadow-2xs active:scale-95"
                  title="เดือนก่อนหน้า"
                >
                  <i className="fa-solid fa-chevron-left text-xs"></i>
                </button>
                <button
                  onClick={() => setCurrentMonth(today.getMonth())}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
                  title="ไปเดือนปัจจุบัน"
                >
                  เดือนนี้
                </button>
                <button
                  onClick={() => setCurrentMonth(prev => (prev === 11 ? 0 : prev + 1))}
                  aria-label="ไปเดือนถัดไป"
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-all cursor-pointer shadow-2xs active:scale-95"
                  title="เดือนถัดไป"
                >
                  <i className="fa-solid fa-chevron-right text-xs"></i>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Month Pills */}
          <div className="px-6 py-3 border-b border-slate-100 bg-white overflow-x-auto flex items-center gap-1.5 scrollbar-none">
            {monthNames.map((mName, idx) => {
              const countInMonth = holidays.filter(h => new Date(h.date).getMonth() === idx).length;
              const isSelected = currentMonth === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setCurrentMonth(idx)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${isSelected
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-100'
                    }`}
                >
                  {mName}
                  {countInMonth > 0 && (
                    <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold ${isSelected ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
                      }`}>
                      {countInMonth}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/70 text-center text-xs font-bold text-slate-500 py-3">
            {weekDayNamesShort.map((day, i) => (
              <div key={day} className={i === 0 || i === 6 ? 'text-rose-500' : ''}>
                {day}
              </div>
            ))}
          </div>



          {/* Monthly Calendar Grid */}
          <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-100 bg-slate-50/30">
            {loading ? (
              <div className="col-span-7 py-20 text-center text-slate-400">
                <i className="fa-solid fa-spinner fa-spin text-2xl mb-2 text-blue-500 block"></i>
                กำลังโหลดปฏิทินและข้อมูลงาน...
              </div>
            ) : (
              calendarCells.map((cell, index) => {
                const isWeekend = (index % 7 === 0) || (index % 7 === 6);
                const totalEvents = cell.holidayMatches.length + cell.dueTaskItems.length + cell.completedTaskItems.length;
                const hasEvents = totalEvents > 0;
                const urgentDueCount = cell.dueTaskItems.filter(item => item.priority === 'urgent' || item.priority === 'high').length;

                // Collect list of render items up to 2 items max in cell
                const renderItems: Array<{
                  key: string;
                  type: 'holiday' | 'due' | 'completed';
                  title: string;
                  parentTitle?: string;
                  isSubItem?: boolean;
                  brandName?: string;
                  priority?: TaskPriority;
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
                      priority: item.priority || 'low',
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
                    });
                  });

                const visibleItems = renderItems.slice(0, 2);
                const extraCount = totalEvents - visibleItems.length;

                return (
                  <div
                    key={index}
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
                    className={`min-h-[125px] p-2 transition-all relative flex flex-col justify-between ${!cell.isCurrentMonth ? 'bg-slate-50/50 opacity-40' : 'bg-white hover:bg-slate-50/80'
                      } ${hasEvents ? 'cursor-pointer group' : ''}`}
                  >
                    {/* Day Header */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-extrabold ${cell.isToday
                          ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-300'
                          : isWeekend
                            ? 'text-rose-500'
                            : 'text-slate-700'
                          }`}
                      >
                        {cell.dayNumber}
                      </span>

                      {cell.isToday ? (
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                          วันนี้
                        </span>
                      ) : urgentDueCount > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-extrabold text-rose-700 ring-1 ring-rose-200" title={`${urgentDueCount} งานเร่งด่วน`}>
                          <i className="fa-solid fa-fire text-[9px]" aria-hidden="true"></i>
                          ด่วน{urgentDueCount > 1 ? ` ${urgentDueCount}` : ''}
                        </span>
                      ) : hasEvents ? (
                        <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                      ) : null}
                    </div>

                    {/* Events Pills */}
                    {hasEvents && (
                      <div className="mt-1.5 space-y-1">
                        {visibleItems.map(item => {
                          if (item.type === 'holiday') {
                            return (
                              <div
                                key={item.key}
                                className="px-1.5 py-1 rounded-lg bg-rose-50 border border-rose-200/80 text-rose-800 text-[10px] font-bold truncate flex items-center gap-1 shadow-2xs group-hover:border-rose-300 transition-all"
                              >
                                <i className="fa-solid fa-sparkles text-[9px] text-rose-500 shrink-0"></i>
                                <span className="truncate">{item.title}</span>
                              </div>
                            );
                          }

                          if (item.type === 'due') {
                            const priorityMeta = TASK_PRIORITY_META[item.priority || 'low'];
                            return (
                              <div
                                key={item.key}
                                className={`holiday-task-priority px-1.5 py-1 rounded-lg border text-[10px] font-medium truncate flex items-center gap-1 shadow-2xs group-hover:brightness-95 transition-all ${priorityMeta.className}`}
                                title={`${priorityMeta.label}: ${item.isSubItem && item.parentTitle ? `งานหลัก ${item.parentTitle} › ` : ''}${item.title}`}
                              >
                                <span className="holiday-task-priority-label inline-flex shrink-0 items-center gap-1 rounded-md bg-white/70 px-1 py-0.5 text-[9px] font-extrabold">
                                  <i className={`fa-solid ${priorityMeta.icon} text-[9px]`} aria-hidden="true"></i>
                                  {priorityMeta.label}
                                </span>
                                <span className="min-w-0 truncate">
                                  {item.brandName ? <strong className="font-bold mr-1">[{item.brandName}]</strong> : null}
                                  {item.isSubItem && item.parentTitle && item.parentTitle !== item.title ? (
                                    <span className="block truncate text-[9px] font-extrabold opacity-80">งานหลัก: {item.parentTitle}</span>
                                  ) : null}
                                  <span className="block truncate">{item.isSubItem ? `งานย่อย: ${item.title}` : item.title}</span>
                                </span>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={item.key}
                              className="px-1.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200/80 text-emerald-900 text-[10px] font-medium truncate flex items-center gap-1 shadow-2xs group-hover:border-emerald-300 transition-all"
                              title={`${item.isSubItem && item.parentTitle ? `งานหลัก ${item.parentTitle} › ` : ''}${item.title}`}
                            >
                              <i className="fa-solid fa-circle-check text-[9px] text-emerald-600 shrink-0"></i>
                              <span className="min-w-0 truncate">
                                {item.brandName ? <strong className="font-bold text-emerald-700 mr-1">[{item.brandName}]</strong> : null}
                                {item.isSubItem && item.parentTitle && item.parentTitle !== item.title ? (
                                  <span className="block truncate text-[9px] font-extrabold text-emerald-800/80">งานหลัก: {item.parentTitle}</span>
                                ) : null}
                                <span className="block truncate">{item.isSubItem ? `งานย่อย: ${item.title}` : item.title}</span>
                              </span>
                            </div>
                          );
                        })}

                        {extraCount > 0 && (
                          <div className="text-[10px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 px-1.5 py-0.5 rounded-md inline-block transition-all">
                            +{extraCount} รายการเพิ่มเติม
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
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
          <div className="holiday-day-details-modal bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="bg-slate-900 p-6 text-white relative shrink-0">
              <button
                onClick={() => setSelectedDayDetails(null)}
                aria-label="ปิดรายละเอียดกิจกรรมประจำวัน"
                className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-semibold mb-2">
                <i className="fa-solid fa-calendar-day text-[10px]"></i>
                รายละเอียดกิจกรรมประจำวัน
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {getWeekdayText(selectedDayDetails.dateStr)} {formatDateThai(selectedDayDetails.dateStr)}
              </h3>
            </div>

            {/* Content List */}
            <div className="holiday-day-details-content p-6 space-y-5 overflow-y-auto custom-scrollbar">
              {/* Holidays section */}
              {selectedDayDetails.holidayMatches.length > 0 && (
                <div className="space-y-2.5">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <i className="fa-solid fa-sparkles text-rose-500"></i>
                    วันหยุดบริษัท
                  </div>
                  {selectedDayDetails.holidayMatches.map(h => (
                    <div key={h.id} className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200/80 flex items-center justify-between">
                      <div>
                        <div className="font-extrabold text-rose-900 text-base">{h.name}</div>
                        <div className="text-xs text-rose-700/80 mt-0.5">
                          วันหยุดประจำปีบริษัท ({h.num_days} วัน)
                        </div>
                      </div>
                      {isLongWeekend(h.date, h.num_days) && (
                        <span className="text-xs bg-rose-100 text-rose-800 border border-rose-300/80 px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1">
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
                    <i className="fa-solid fa-clock text-indigo-500"></i>
                    งานย่อยและกำหนดส่งวันนี้ ({selectedDayDetails.dueTaskItems.length} รายการ)
                  </div>
                  <div className="space-y-3">
                    {selectedDayDetails.dueTaskItems.map(item => {
                      const brandName = brandsMap.get(item.brandId || '');
                      const rawTask = item.rawTask;
                      const subItems = rawTask.sub_items || [];

                      return (
                        <div key={item.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 hover:border-indigo-300 transition-all space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {brandName && (
                                  <span className="inline-block text-[11px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                                    {brandName}
                                  </span>
                                )}
                                {item.isSubItem && (
                                  <span className="inline-block text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-md">
                                    งานย่อย (Sub-item)
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
                              item.priority === 'high' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                'bg-blue-50 text-blue-700 border-blue-200'
                              }`}>
                              {item.priority ? item.priority.toUpperCase() : 'NORMAL'}
                            </span>
                          </div>

                          {/* Raw task description */}
                          {rawTask.description && (
                            <p className="text-xs text-slate-600 line-clamp-2 bg-white/70 p-2.5 rounded-xl border border-slate-100">{rawTask.description}</p>
                          )}

                          {/* Sub-items Checklist breakdown if available */}
                          {subItems.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
                                <span>รายการงานย่อยทั้งหมดในโครงการ ({subItems.filter(s => s.is_done || s.status === 'completed').length}/{subItems.length})</span>
                              </div>
                              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                                {subItems.map(s => (
                                  <div
                                    key={s.id}
                                    className={`text-xs px-2.5 py-1.5 rounded-xl border flex items-center justify-between gap-2 ${s.is_done || s.status === 'completed' ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800' : 'bg-white border-slate-200/80 text-slate-700'
                                      }`}
                                  >
                                    <div className="flex items-center gap-2 truncate">
                                      <i className={`fa-solid ${s.is_done || s.status === 'completed' ? 'fa-square-check text-emerald-600' : 'fa-square text-slate-300'} text-sm`}></i>
                                      <span className={`truncate font-medium ${s.is_done || s.status === 'completed' ? 'line-through opacity-80' : ''}`}>{s.title}</span>
                                    </div>
                                    {s.due_date && (
                                      <span className="text-[10px] text-slate-400 shrink-0">{s.due_date.split('T')[0]}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Lists (Deliverables) breakdown if available */}
                          {rawTask.lists && rawTask.lists.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
                                <span>รายการงานย่อย (Deliverables) ({rawTask.lists.filter(l => l.status === 'completed').length}/{rawTask.lists.length})</span>
                              </div>
                              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                                {rawTask.lists.map(l => (
                                  <div
                                    key={l.id}
                                    className={`text-xs p-2 rounded-xl border flex items-center justify-between gap-2 ${l.status === 'completed' ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800' : 'bg-white border-slate-200/80 text-slate-800'
                                      }`}
                                  >
                                    <div className="flex items-center gap-2 truncate">
                                      <i className={`fa-solid ${l.status === 'completed' ? 'fa-circle-check text-emerald-600' : 'fa-list-check text-indigo-500'} text-sm`}></i>
                                      <span className={`truncate font-semibold ${l.status === 'completed' ? 'line-through opacity-80' : ''}`}>{l.name}</span>
                                    </div>
                                    {l.due_date && (
                                      <span className="text-[10px] text-slate-500 font-medium shrink-0 bg-slate-100 px-2 py-0.5 rounded-md">ส่ง: {l.due_date.split('T')[0]}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-xs text-slate-500">
                            {item.assignedToName && (
                              <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                                <i className="fa-regular fa-user text-slate-400"></i>
                                {item.assignedToName}
                              </span>
                            )}

                            <button
                              onClick={() => {
                                setSelectedDayDetails(null);
                                navigate('/tasks');
                              }}
                              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-all cursor-pointer ml-auto"
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
                        <div key={item.id} className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 flex items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {brandName && (
                                <span className="inline-block text-[11px] font-bold text-emerald-700 bg-emerald-100/80 border border-emerald-300/60 px-2 py-0.5 rounded-md">
                                  {brandName}
                                </span>
                              )}
                            </div>
                            <h4 className="font-bold text-slate-900 text-sm">{item.displayTitle}</h4>
                            {item.parentTitle && item.parentTitle !== item.displayTitle && (
                              <p className="text-xs text-slate-500">งานหลัก: {item.parentTitle}</p>
                            )}
                            {item.assignedToName && (
                              <div className="text-xs text-slate-500 flex items-center gap-1">
                                <i className="fa-regular fa-circle-user text-emerald-600"></i> {item.assignedToName}
                              </div>
                            )}
                          </div>
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 border border-emerald-300 px-3 py-1 rounded-full flex items-center gap-1 shrink-0">
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
            <div className="holiday-day-details-footer p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end shrink-0">
              <button
                onClick={() => setSelectedDayDetails(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer"
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
            <div className="bg-slate-900 p-6 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <i className="fa-solid fa-calendar-plus text-amber-400"></i>
                  เพิ่มวันหยุดใหม่
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">กำหนดวันหยุดบริษัทและบันทึกลงในระบบ</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                aria-label="ปิดฟอร์มเพิ่มวันหยุด"
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 transition-all cursor-pointer"
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
    </div>
  );
}
