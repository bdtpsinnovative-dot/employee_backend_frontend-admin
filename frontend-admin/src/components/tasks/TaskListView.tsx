import React, { useMemo, useState } from 'react';
import {
  Bell,
  X,
  Flame,
  Tag,
  Layers,
  CheckSquare,
  Link as LinkIcon,
  CheckCircle2,
  Edit3,
  Crown,
  Users,
  Star
} from 'lucide-react';
import type { AdminTask, User, Brand, TaskCategory } from '../../types';
import { formatRelativeDueDate, getTaskPriority, type TaskStatus, STATUS_CONFIG, avatarUrl } from './taskUtils';
import type { AppNotification } from '../../services/adminApi';
import { markNotificationRead } from '../../services/adminApi';

interface TaskListViewProps {
  tasks: AdminTask[];
  userMap: Record<string, User>;
  brandMap: Record<string, Brand>;
  categoryMap: Record<string, TaskCategory>;
  notifications?: AppNotification[];
  setNotifications?: React.Dispatch<React.SetStateAction<AppNotification[]>>;
  onSelectTask: (task: AdminTask) => void;
  onEditTask?: (task: AdminTask) => void;
  onSelectProjectSheet?: (task: AdminTask) => void;
  onStatusChange: (task: AdminTask, status: TaskStatus) => void;
  onOpenCreateModal: (defaultStatus?: TaskStatus) => void;
  onApproveSubmission?: (task: AdminTask) => void;
  currentUser: User | null;
  onToggleStar?: (taskId: string, isStarred: boolean) => void;
}

export const TaskListView: React.FC<TaskListViewProps> = ({
  tasks,
  userMap,
  brandMap,
  categoryMap,
  notifications = [],
  setNotifications,
  onSelectTask,
  onEditTask,
  onSelectProjectSheet,
  onStatusChange,
  // onOpenCreateModal,
  onApproveSubmission,
  currentUser,
  onToggleStar,
}) => {
  const [notifTask, setNotifTask] = useState<AdminTask | null>(null);

  const handleOpenNotifModule = async (task: AdminTask) => {
    setNotifTask(task);
    // Find all unread notifications matching this task ID for sub-task updates
    const unreadMatching = notifications.filter(n => {
      if (n.is_read) return false;
      let tId: string | null = null;
      let lId: string | null = null;
      if (n.metadata) {
        let meta = n.metadata;
        if (typeof meta === 'string') {
          try {
            meta = JSON.parse(meta);
          } catch {}
        }
        if (meta && typeof meta === 'object') {
          tId = meta.task_id || null;
          lId = meta.list_id || null;
        }
      }
      return tId === task.id && lId !== null;
    });

    if (unreadMatching.length > 0 && setNotifications) {
      // Mark them as read locally in state immediately
      setNotifications(prev =>
        prev.map(n => unreadMatching.some(m => m.id === n.id) ? { ...n, is_read: true } : n)
      );

      // Call API in background to mark them as read in DB
      for (const n of unreadMatching) {
        try {
          await markNotificationRead(n.id);
        } catch {}
      }
    }
  };

  const unreadSubTaskTaskIds = useMemo(() => {
    const taskIds = new Set<string>();

    notifications.forEach((notification) => {
      if (notification.is_read) return;

      let taskId: string | null = null;
      let listId: unknown = null;
      if (notification.metadata) {
        let metadata = notification.metadata;
        if (typeof metadata === 'string') {
          try {
            metadata = JSON.parse(metadata);
          } catch {}
        }
        if (metadata && typeof metadata === 'object') {
          taskId = metadata.task_id || null;
          listId = metadata.list_id || null;
        }
      }

      if (taskId !== null && listId !== null) {
        taskIds.add(taskId);
      }
    });

    return taskIds;
  }, [notifications]);

  // Flatten and sort all tasks chronologically by due date ascending
  const sortedTasks = useMemo(() => [...tasks].sort((a, b) => {
    const aDue = a.due_date && !a.due_date.startsWith('0001-01-01') ? new Date(a.due_date).getTime() : Infinity;
    const bDue = b.due_date && !b.due_date.startsWith('0001-01-01') ? new Date(b.due_date).getTime() : Infinity;
    
    if (aDue !== bDue) {
      return aDue - bDue;
    }
    
    // Default fallback: sort by created_at descending (latest first)
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  }), [tasks]);

  return (
    <div className="task-list-view p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <table className="w-full text-left border-collapse text-xs font-sans">
          <thead>
            <tr className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 select-none">
              <th className="px-3 py-2 w-28 border-r border-slate-200 text-center">Due Date</th>
              <th className="px-3 py-2 w-28 border-r border-slate-200 text-center">Assigned</th>
              <th className="px-3 py-2 border-r border-slate-200 w-[20%]">รายละเอียดงาน</th>
              <th className="px-3 py-2 w-32 border-r border-slate-200 text-center">หมวดหมู่</th>
              <th className="px-3 py-2 w-28 border-r border-slate-200 text-center">Assigned To</th>
              <th className="px-2 py-2 w-28 border-r border-slate-200 text-center">Status</th>
              <th className="px-2 py-2 w-24 border-r border-slate-200 text-center">Priority</th>
              <th className="px-3 py-2 w-32 border-r border-slate-200 text-center">Progress</th>
              <th className="px-3 py-2 w-28 border-r border-slate-200 text-center">Submission</th>
              <th className="px-2 py-2 w-44 border-r border-slate-200 text-center">จัดการงาน (Actions)</th>
              <th className="px-2 py-2 w-32 text-center">บทบาทของคุณ</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200/80 bg-white">
            {sortedTasks.map((task) => {
              const brand = task.brand_id ? brandMap[task.brand_id] : null;
              const category = task.category_id ? categoryMap[task.category_id] : null;
              const isDone = task.status === 'completed';
              const dueInfo = formatRelativeDueDate(
                task.due_date,
                isDone,
                task.status,
                task.latest_submission?.submitted_at
              );
              const priority = getTaskPriority(task);
              const isCreator = task.assigned_by === currentUser?.id;
              const isAdmin = currentUser?.role === 'admin';
              const canEdit = isAdmin || isCreator;

              // Assignees
              const assigneeIds =
                task.assignee_ids && task.assignee_ids.length > 0
                  ? task.assignee_ids
                  : task.assigned_to
                    ? [task.assigned_to]
                    : [];
              const isAssignee = assigneeIds.includes(currentUser?.id || '');
              const assignees = assigneeIds.map((id) => userMap[id]).filter(Boolean);
              const firstAssignee = assignees[0];

              const hasUnreadSubTaskNotif = unreadSubTaskTaskIds.has(task.id);

              return (
                <tr
                  key={task.id}
                  onClick={() => {
                    if (onSelectProjectSheet) {
                      onSelectProjectSheet(task);
                    } else {
                      onSelectTask(task);
                    }
                  }}
                  className={`group cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-200/80 ${isDone ? 'opacity-80 bg-slate-50/50' : ''}`}
                >
                  {/* 1. Due Date Column */}
                  <td data-label="Due Date" className="px-3 py-2 border-r border-slate-200/80 text-center align-middle font-medium">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] border whitespace-nowrap ${
                        dueInfo.variant === 'overdue'
                          ? 'bg-red-50 text-red-700 border-red-200 font-extrabold shadow-xs'
                          : dueInfo.variant === 'in_review'
                            ? 'bg-blue-50 text-blue-700 border-blue-200 font-bold shadow-xs'
                            : dueInfo.variant === 'today'
                              ? 'bg-amber-50 text-amber-800 border-amber-200 font-bold shadow-xs'
                              : dueInfo.variant === 'tomorrow'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {dueInfo.variant === 'overdue' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                      )}
                      {dueInfo.variant === 'today' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                      )}
                      <span>{dueInfo.text}</span>
                    </span>
                  </td>

                  {/* 1.5 Assigned Date */}
                  <td data-label="Assigned" className="px-3 py-2 border-r border-slate-200/80 text-center align-middle font-medium">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] border whitespace-nowrap bg-slate-100 text-slate-600 border-slate-200">
                      {task.created_at ? new Date(task.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '-'}
                    </span>
                  </td>

                  {/* 2. Task Details Column */}
                  <td data-label="รายละเอียดงาน" className="px-3 py-2 border-r border-slate-200/80 align-middle max-w-[240px]">
                    <div className="flex items-start gap-2.5">
                      {/* Star Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onToggleStar) {
                            onToggleStar(task.id, !task.is_starred);
                          }
                        }}
                        className="transition-all p-0.5 mt-0.5 cursor-pointer shrink-0 focus:outline-none flex items-center justify-center"
                        title={task.is_starred ? "ถอนการติดดาว" : "ติดดาวงานนี้"}
                      >
                        <Star 
                          className={`w-3.5 h-3.5 transition-all ${
                            task.is_starred 
                              ? "text-amber-400 fill-amber-400 filter drop-shadow-[0_1px_1px_rgba(245,158,11,0.2)]" 
                              : "text-slate-300 hover:text-amber-300"
                          }`} 
                        />
                      </button>

                      <div className="flex flex-col gap-1 min-w-0">
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectProjectSheet) {
                              onSelectProjectSheet(task);
                            } else {
                              onSelectTask(task);
                            }
                          }}
                          className={`font-semibold text-slate-850 hover:text-blue-600 cursor-pointer transition-colors text-xs leading-snug break-words ${isDone ? 'line-through text-slate-400' : ''}`} 
                          title={`${task.title} (คลิกเพื่อเปิดเข้าจัดการในโครงการ)`}
                        >
                          {task.title}
                        </span>

                        {brand ? (
                          <span className="inline-flex items-center gap-1 w-fit rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                            <Tag className="h-2.5 w-2.5 shrink-0 text-blue-600" aria-hidden="true" />
                            <span className="truncate max-w-[160px]" title={brand.name}>{brand.name}</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </td>

                  {/* 4. Category Column */}
                  <td data-label="หมวดหมู่" className="px-3 py-2 border-r border-slate-200/80 text-center align-middle">
                    {category ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 rounded-full whitespace-nowrap">
                        <Layers className="w-2.5 h-2.5 flex-shrink-0" />
                        <span className="truncate max-w-[80px]">{category.name}</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 italic text-[10px]">-</span>
                    )}
                  </td>

                  {/* 5. Assigned To Column */}
                  <td data-label="Assigned To" className="px-3 py-2 border-r border-slate-200/80 text-center align-middle">
                    {firstAssignee ? (
                      <div className="flex items-center justify-center gap-1.5">
                        {firstAssignee.avatar_url ? (
                          <img src={avatarUrl(firstAssignee.avatar_url)!} className="w-6 h-6 rounded-full object-cover border border-slate-200" alt="avatar" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-[10px]">
                            {firstAssignee.first_name.charAt(0)}
                          </div>
                        )}
                        <span className="text-[11px] font-medium text-slate-700 truncate max-w-[65px]" title={firstAssignee.nickname ? `${firstAssignee.first_name} (${firstAssignee.nickname})` : firstAssignee.first_name}>
                          {firstAssignee.nickname || firstAssignee.first_name}
                        </span>
                        {assignees.length > 1 && (
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1 rounded-sm">
                            +{assignees.length - 1}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-[10px]">-</span>
                    )}
                  </td>

                  {/* 6. Status Column */}
                  <td
                    data-label="Status"
                    className="px-2 py-2 border-r border-slate-200/80 text-center align-middle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <select
                        value={task.status}
                        onChange={(e) =>
                          onStatusChange(task, e.target.value as TaskStatus)
                        }
                        className={`w-full max-w-[85px] px-1.5 py-1 text-center font-bold text-[10px] rounded-full appearance-none cursor-pointer border transition-all ${STATUS_CONFIG[task.status as TaskStatus]?.badgeBg || 'bg-slate-100'
                          } ${STATUS_CONFIG[task.status as TaskStatus]?.badgeText || 'text-slate-700'} ${STATUS_CONFIG[task.status as TaskStatus]?.badgeBorder || 'border-slate-300'}`}
                      >
                        <option value="pending" className="bg-white text-slate-900 font-medium">รอทำ</option>
                        <option value="in_progress" className="bg-white text-slate-900 font-medium">กำลังทำ</option>
                        <option value="in_review" className="bg-white text-slate-900 font-medium">รอตรวจ</option>
                        <option value="completed" className="bg-white text-slate-900 font-medium">เสร็จสิ้น</option>
                      </select>
                      {task.needs_revision && task.status === 'in_progress' && (
                        <span className="text-[9px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 rounded-sm">
                          ต้องแก้ไข
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 7. Priority Column */}
                  <td data-label="Priority" className="px-2 py-2 border-r border-slate-200/80 text-center align-middle">
                    {priority === 'urgent' && (
                      <div className="mx-auto inline-flex items-center justify-center w-full max-w-[95px] px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 font-extrabold rounded-full text-[10px] animate-pulse">
                        <span className="flex items-center gap-0.5">
                          <Flame className="w-2.5 h-2.5 text-rose-600 fill-rose-100" />
                          <span>🔥 งานด่วนมาก</span>
                        </span>
                      </div>
                    )}
                    {priority === 'high' && (
                      <div className="mx-auto inline-flex items-center justify-center w-full max-w-[95px] px-1.5 py-0.5 bg-red-50 text-red-700 border border-red-200 font-bold rounded-full text-[10px]">
                        <span>🟠 งานด่วน</span>
                      </div>
                    )}
                    {priority === 'medium' && (
                      <div className="mx-auto inline-flex items-center justify-center w-full max-w-[95px] px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 font-semibold rounded-full text-[10px]">
                        <span>⚡ งานด่วนปานกลาง</span>
                      </div>
                    )}
                    {priority === 'low' && (
                      <div className="mx-auto inline-flex items-center justify-center w-full max-w-[95px] px-1.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 font-medium rounded-full text-[10px]">
                        <span>🌱 งานไม่รีบ</span>
                      </div>
                    )}
                  </td>

                  {/* 7. Progress Column — based on task_lists (card_total / card_done) */}
                  {(() => {
                    const total = task.card_total ?? 0;
                    const done  = task.card_done  ?? 0;
                    const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
                    const isComplete = total > 0 && done === total;
                    return (
                      <td data-label="Progress" className="px-3 py-2 border-r border-slate-200/80 align-middle">
                        <div className="flex items-center gap-3">
                          {total > 0 ? (
                            <div className="space-y-1 min-w-[80px] flex-1">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="flex items-center gap-1 text-slate-500">
                                  <CheckSquare className={`w-3 h-3 ${isComplete ? 'text-emerald-500' : 'text-indigo-400'}`} />
                                  <span className={`font-semibold ${isComplete ? 'text-emerald-600' : 'text-slate-600'}`}>
                                    {done}/{total}
                                  </span>
                                </span>
                                <span className={`font-extrabold text-[10px] ${isComplete ? 'text-emerald-600' : pct >= 50 ? 'text-indigo-650' : 'text-slate-500'}`}>
                                  {pct}%
                                </span>
                              </div>
                              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    isComplete
                                      ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                                      : pct >= 50
                                      ? 'bg-gradient-to-r from-indigo-400 to-blue-500'
                                      : 'bg-gradient-to-r from-slate-300 to-indigo-400'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              {isComplete && (
                                <p className="text-[9px] font-bold text-emerald-600 text-center">✓ ครบทุกงานย่อย</p>
                              )}
                            </div>
                          ) : (
                            <div className="text-center text-slate-300 text-[10px] flex-1">—</div>
                          )}

                          {/* Bell Icon Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenNotifModule(task);
                            }}
                            className={`p-1.5 rounded-lg transition-all relative cursor-pointer shrink-0 ${
                              hasUnreadSubTaskNotif
                                ? 'text-rose-500 bg-rose-50/50 hover:bg-rose-55 hover:scale-105'
                                : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                            }`}
                            title="ดูการแจ้งเตือนของงานนี้"
                          >
                            <Bell className={`w-3.5 h-3.5 ${hasUnreadSubTaskNotif ? 'animate-pulse' : ''}`} />
                            {hasUnreadSubTaskNotif && (
                              <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full flex">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                              </span>
                            )}
                          </button>
                        </div>
                      </td>
                    );
                  })()}

                  {/* 8. Submission Link Column */}
                  <td data-label="Submission" className="px-3 py-2 border-r border-slate-200/80 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                    {task.latest_submission && task.latest_submission.url ? (
                      <div className="flex flex-col items-center gap-1">
                        <a
                          href={task.latest_submission.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-1 rounded-md transition-colors whitespace-nowrap"
                          title={task.latest_submission.url}
                        >
                          <LinkIcon className="w-3 h-3" />
                          เปิดผลงาน
                        </a>
                        <span className="text-[9px] text-slate-500">
                          {new Date(task.latest_submission.submitted_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center justify-center px-2 py-1 text-[10px] font-medium text-slate-400 bg-slate-50 rounded-md border border-slate-200 border-dashed">
                        รอส่งงาน
                      </span>
                    )}
                  </td>

                  {/* 9. Review Action / Actions Column */}
                  <td
                    data-label="จัดการงาน"
                    className="px-2 py-2 border-r border-slate-200 text-center align-middle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      {/* ปุ่มเปิดหน้าต่างโมดูลแก้ไข (Edit Modal) */}
                      {onEditTask && canEdit && (
                        <button
                          onClick={() => onEditTask(task)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 active:scale-95 border border-slate-200 rounded-lg shadow-2xs transition-all cursor-pointer"
                          title="คลิกเพื่อแก้ไขรายละเอียดงาน"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                          <span>แก้ไข</span>
                        </button>
                      )}


                      {/* ถ้างานรอตรวจสอบ ให้แสดงปุ่มอนุมัติแทนปุ่มลบ */}
                      {task.status === 'in_review' && onApproveSubmission && (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => onApproveSubmission(task)}
                            className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded px-2 py-0.5 transition-colors"
                          >
                            <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                            <span>อนุมัติ</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </td>

                  {/* 10. Role / Involvement Column */}
                  <td
                    data-label="บทบาทของคุณ"
                    className="px-2 py-2 text-center align-middle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-col items-center justify-center gap-1 select-none">
                      {isCreator && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold bg-yellow-50 text-yellow-800 border border-yellow-350 rounded-md shadow-2xs" title="คุณคือผู้สร้างงานนี้">
                          <Crown className="w-2.5 h-2.5 text-yellow-600 fill-yellow-400" />
                          <span>งานที่สร้าง</span>
                        </span>
                      )}
                      {isAssignee && !isCreator && (
                        <div className="flex flex-col items-center justify-center select-none">
                          {task.assigned_by && userMap[task.assigned_by] ? (
                            <div 
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full shadow-3xs" 
                              title={`งานนี้มอบหมายโดย ${userMap[task.assigned_by].nickname || userMap[task.assigned_by].first_name}`}
                            >
                              <div className="relative w-5 h-5 flex-shrink-0">
                                <img
                                  src={avatarUrl(userMap[task.assigned_by].avatar_url) || undefined}
                                  alt={userMap[task.assigned_by].nickname || userMap[task.assigned_by].first_name}
                                  className="w-5 h-5 rounded-full object-cover border border-white"
                                />
                                <Crown className="absolute -top-1.5 -right-1 w-2.5 h-2.5 text-yellow-600 fill-yellow-400 drop-shadow-xs" />
                              </div>
                              <span className="font-extrabold text-emerald-800 truncate max-w-[65px]">
                                {userMap[task.assigned_by].nickname || userMap[task.assigned_by].first_name}
                              </span>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md shadow-2xs">
                              <Users className="w-2.5 h-2.5 text-emerald-600" />
                              <span>งานที่เข้าร่วม</span>
                            </span>
                          )}
                        </div>
                      )}
                      {!isCreator && !isAssignee && (
                        <span className="text-[10px] text-slate-450 italic">-</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Task Notifications Modal */}
      {notifTask && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 text-left">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm">การแจ้งเตือนงานย่อย</h3>
                  <p className="text-[10px] text-slate-500 font-semibold truncate max-w-[280px]">
                    โครงการ: {notifTask.title}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNotifTask(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {(() => {
                const listNotifs = notifications.filter(n => {
                  let tId: string | null = null;
                  let lId: string | null = null;
                  if (n.metadata) {
                    let meta = n.metadata;
                    if (typeof meta === 'string') {
                      try {
                        meta = JSON.parse(meta);
                      } catch {}
                    }
                    if (meta && typeof meta === 'object') {
                      tId = meta.task_id || null;
                      lId = meta.list_id || null;
                    }
                  }
                  return tId === notifTask.id && lId !== null;
                });

                if (listNotifs.length === 0) {
                  return (
                    <div className="py-12 text-center text-slate-400 text-xs font-semibold">
                      <Bell className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-350" />
                      ยังไม่มีประวัติการแจ้งเตือนงานย่อยของโครงการนี้
                    </div>
                  );
                }

                return listNotifs.map(n => (
                  <div key={n.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <p className="text-xs font-bold text-slate-855 leading-snug">{n.title}</p>
                      <span className="text-[9px] text-slate-455 font-semibold shrink-0">
                        {new Date(n.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-605 leading-snug">{n.body}</p>
                    <p className="text-[9px] text-slate-405 font-medium pt-0.5">
                      {new Date(n.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                ));
              })()}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setNotifTask(null)}
                className="w-full sm:w-auto px-5 py-2 text-xs font-bold text-slate-700 bg-slate-200 hover:bg-slate-355 rounded-xl transition-all cursor-pointer text-center"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
