import type { AdminTask } from '../../types';

export function avatarUrl(url?: string | null): string | null {
  if (!url || !url.trim()) return null;
  if (url.startsWith('r2://')) {
    return url.replace('r2://', 'https://pub-2a877f7cc07b481ca09dec82cb240465.r2.dev/');
  }
  return url;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed';
export type TaskPriority = 'high' | 'medium' | 'low';

export const STATUS_CONFIG: Record<TaskStatus, {
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  dotColor: string;
}> = {
  pending: {
    label: 'รอทำ',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
    badgeBorder: 'border-slate-300',
    dotColor: 'bg-slate-400',
  },
  in_progress: {
    label: 'กำลังทำ',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-700',
    badgeBorder: 'border-amber-200',
    dotColor: 'bg-amber-500',
  },
  completed: {
    label: 'เสร็จสิ้น',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    badgeBorder: 'border-emerald-200',
    dotColor: 'bg-emerald-500',
  },
};

export function formatRelativeDueDate(dueIso: string, isCompleted: boolean = false): {
  text: string;
  variant: 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'completed';
} {
  if (isCompleted) {
    const d = new Date(dueIso);
    const dateStr = isNaN(d.getTime()) ? dueIso : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    return { text: dateStr, variant: 'completed' };
  }

  const dueDate = new Date(dueIso);
  if (isNaN(dueDate.getTime())) {
    return { text: dueIso, variant: 'upcoming' };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  
  const diffTime = targetDay.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

  const formattedDate = dueDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

  if (diffDays < 0) {
    const daysAgo = Math.abs(diffDays);
    return { text: `เลยกำหนด ${daysAgo} วัน`, variant: 'overdue' };
  } else if (diffDays === 0) {
    return { text: `วันนี้ (${formattedDate})`, variant: 'today' };
  } else if (diffDays === 1) {
    return { text: `พรุ่งนี้ (${formattedDate})`, variant: 'tomorrow' };
  } else {
    return { text: formattedDate, variant: 'upcoming' };
  }
}

export function getTaskPriority(task: AdminTask): TaskPriority {
  if (task.due_date && task.status !== 'completed') {
    const due = new Date(task.due_date);
    const now = new Date();
    const diffHours = (due.getTime() - now.getTime()) / (1000 * 3600);
    if (diffHours < 24) return 'high';
    if (diffHours < 72) return 'medium';
  }
  return 'low';
}
