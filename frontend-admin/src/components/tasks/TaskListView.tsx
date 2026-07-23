import React from 'react';
import {
  Flame,
  Plus,
  Tag,
  Layers,
  CheckSquare,
  Link as LinkIcon,
  CheckCircle2,
  AlertCircle,
  MoreVertical
} from 'lucide-react';
import type { AdminTask, User, Brand, TaskCategory } from '../../types';
import { formatRelativeDueDate, getTaskPriority, type TaskStatus, STATUS_CONFIG, avatarUrl } from './taskUtils';

interface TaskListViewProps {
  tasks: AdminTask[];
  userMap: Record<string, User>;
  brandMap: Record<string, Brand>;
  categoryMap: Record<string, TaskCategory>;
  onSelectTask: (task: AdminTask) => void;
  onStatusChange: (task: AdminTask, status: TaskStatus) => void;
  onOpenCreateModal: (defaultStatus?: TaskStatus) => void;
  onApproveSubmission?: (task: AdminTask) => void;
  onRequestRevision?: (task: AdminTask) => void;
}

export const TaskListView: React.FC<TaskListViewProps> = ({
  tasks,
  userMap,
  brandMap,
  categoryMap,
  onSelectTask,
  onStatusChange,
  onOpenCreateModal,
  onApproveSubmission,
  onRequestRevision,
}) => {
  // Flatten and sort all tasks (no grouping)
  const sortedTasks = [...tasks].sort((a, b) => {
    // 1. Completed goes to bottom
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (b.status === 'completed' && a.status !== 'completed') return -1;
    if (a.status === 'completed' && b.status === 'completed') {
      const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0;
      const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      return bTime - aTime;
    }
    // 2. Overdue > Today > Upcoming > No Date
    const aDue = a.due_date && !a.due_date.startsWith('0001-01-01') ? new Date(a.due_date).getTime() : Infinity;
    const bDue = b.due_date && !b.due_date.startsWith('0001-01-01') ? new Date(b.due_date).getTime() : Infinity;
    return aDue - bDue;
  });

  return (
    <div className="p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <table className="w-full text-left border-collapse text-xs font-sans">
          <thead>
            <tr className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 select-none">
              <th className="px-3 py-2 w-28 border-r border-slate-200 text-center">Due Date</th>
              <th className="px-4 py-2 border-r border-slate-200 w-1/4">รายละเอียดงาน</th>
              <th className="px-3 py-2 w-32 border-r border-slate-200 text-center">หมวดหมู่</th>
              <th className="px-3 py-2 w-28 border-r border-slate-200 text-center">Assigned To</th>
              <th className="px-2 py-2 w-28 border-r border-slate-200 text-center">Status</th>
              <th className="px-2 py-2 w-24 border-r border-slate-200 text-center">Priority</th>
              <th className="px-3 py-2 w-32 border-r border-slate-200 text-center">Progress</th>
              <th className="px-3 py-2 w-28 border-r border-slate-200 text-center">Submission</th>
              <th className="px-2 py-2 w-32 text-center">Review Action</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200/80 bg-white">
            {sortedTasks.map((task) => {
              const brand = task.brand_id ? brandMap[task.brand_id] : null;
              const category = task.category_id ? categoryMap[task.category_id] : null;
              const isDone = task.status === 'completed';
              const dueInfo = formatRelativeDueDate(task.due_date, isDone);
              const priority = getTaskPriority(task);

              // Assignees
              const assigneeIds =
                task.assignee_ids && task.assignee_ids.length > 0
                  ? task.assignee_ids
                  : task.assigned_to
                  ? [task.assigned_to]
                  : [];
              const assignees = assigneeIds.map((id) => userMap[id]).filter(Boolean);
              const firstAssignee = assignees[0];

              const subItems = task.sub_items || [];
              const doneSubItems = subItems.filter(s => s.is_done).length;
              const subPct = subItems.length > 0 ? Math.round((doneSubItems / subItems.length) * 100) : 0;

              return (
                <tr
                  key={task.id}
                  onClick={() => onSelectTask(task)}
                  className={`group cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-200/80 ${isDone ? 'opacity-80 bg-slate-50/50' : ''}`}
                >
                  {/* 1. Due Date Column */}
                  <td className="px-3 py-2 border-r border-slate-200/80 text-center align-middle font-medium">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] border whitespace-nowrap ${
                        dueInfo.variant === 'overdue'
                          ? 'bg-red-50 text-red-700 border-red-200 font-bold'
                          : dueInfo.variant === 'today'
                          ? 'bg-amber-50 text-amber-800 border-amber-200 font-bold'
                          : dueInfo.variant === 'tomorrow'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {dueInfo.text}
                    </span>
                  </td>

                  {/* 2. Task Details Column */}
                  <td className="px-4 py-2 border-r border-slate-200/80 align-middle">
                    <div className={`font-semibold text-slate-800 group-hover:text-blue-600 transition-colors text-xs leading-tight line-clamp-2 ${isDone ? 'line-through text-slate-400' : ''}`} title={task.title}>
                      {task.title}
                    </div>
                    {brand && (
                      <span className="inline-flex items-center gap-1 mt-1.5 px-1.5 py-0.5 text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-md whitespace-nowrap">
                        <Tag className="w-2.5 h-2.5 text-blue-600" />
                        <span className="truncate max-w-[80px]">{brand.name}</span>
                      </span>
                    )}
                  </td>

                  {/* 3. Category Column */}
                  <td className="px-3 py-2 border-r border-slate-200/80 text-center align-middle">
                    {category ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 rounded-full whitespace-nowrap">
                        <Layers className="w-2.5 h-2.5 flex-shrink-0" />
                        <span className="truncate max-w-[80px]">{category.name}</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 italic text-[10px]">-</span>
                    )}
                  </td>

                  {/* 4. Assigned To Column */}
                  <td className="px-3 py-2 border-r border-slate-200/80 text-center align-middle">
                    {firstAssignee ? (
                      <div className="flex items-center justify-center gap-1.5">
                        {firstAssignee.avatar_url ? (
                          <img src={avatarUrl(firstAssignee.avatar_url)!} className="w-6 h-6 rounded-full object-cover border border-slate-200" alt="avatar" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-[10px]">
                            {firstAssignee.first_name.charAt(0)}
                          </div>
                        )}
                        <span className="text-[11px] font-medium text-slate-700 truncate max-w-[60px]" title={firstAssignee.first_name}>
                          {firstAssignee.first_name}
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

                  {/* 5. Status Column */}
                  <td
                    className="px-2 py-2 border-r border-slate-200/80 text-center align-middle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <select
                        value={task.status}
                        onChange={(e) =>
                          onStatusChange(task, e.target.value as TaskStatus)
                        }
                        className={`w-full max-w-[85px] px-1.5 py-1 text-center font-bold text-[10px] rounded-full appearance-none cursor-pointer border transition-all ${
                          STATUS_CONFIG[task.status as TaskStatus]?.badgeBg || 'bg-slate-100'
                        } ${STATUS_CONFIG[task.status as TaskStatus]?.badgeText || 'text-slate-700'} ${STATUS_CONFIG[task.status as TaskStatus]?.badgeBorder || 'border-slate-300'}`}
                      >
                        <option value="pending" className="bg-white text-slate-900 font-medium">Todo</option>
                        <option value="in_progress" className="bg-white text-slate-900 font-medium">Doing</option>
                        <option value="in_review" className="bg-white text-slate-900 font-medium">Review</option>
                        <option value="completed" className="bg-white text-slate-900 font-medium">Done</option>
                      </select>
                      {task.needs_revision && task.status === 'in_progress' && (
                        <span className="text-[9px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 rounded-sm">
                          ต้องแก้ไข
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 6. Priority Column */}
                  <td className="px-2 py-2 border-r border-slate-200/80 text-center align-middle">
                    {priority === 'high' && (
                      <div className="mx-auto inline-flex items-center justify-between w-full max-w-[65px] px-1.5 py-0.5 bg-red-50 text-red-700 border border-red-200 font-bold rounded-full text-[10px]">
                        <span className="flex items-center gap-0.5">
                          <Flame className="w-2.5 h-2.5 text-red-600 fill-red-100" />
                          <span>High</span>
                        </span>
                      </div>
                    )}
                    {priority === 'medium' && (
                      <div className="mx-auto inline-flex items-center justify-center w-full max-w-[65px] px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 font-semibold rounded-full text-[10px]">
                        <span>Medium</span>
                      </div>
                    )}
                    {priority === 'low' && (
                      <div className="mx-auto inline-flex items-center justify-center w-full max-w-[65px] px-1.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 font-medium rounded-full text-[10px]">
                        <span>Low</span>
                      </div>
                    )}
                  </td>

                  {/* 7. Progress Column */}
                  <td className="px-3 py-2 border-r border-slate-200/80 align-middle">
                    {subItems.length > 0 ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="flex items-center gap-1 text-slate-500">
                            <CheckSquare className="w-3.5 h-3.5 text-indigo-500" />
                            <span>{doneSubItems}/{subItems.length}</span>
                          </span>
                          <span className={`font-bold ${subPct === 100 ? 'text-emerald-600' : 'text-slate-600'}`}>{subPct}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${subPct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                            style={{ width: `${subPct}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-slate-300 text-[10px]">—</div>
                    )}
                  </td>

                  {/* 8. Submission Link Column */}
                  <td className="px-3 py-2 border-r border-slate-200/80 text-center align-middle" onClick={(e) => e.stopPropagation()}>
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

                  {/* 9. Review Action Column */}
                  <td
                    className="px-2 py-2 text-center align-middle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {task.status === 'in_review' ? (
                      <div className="flex flex-col gap-1 items-center justify-center">
                        <button
                          onClick={() => onApproveSubmission?.(task)}
                          className="w-full max-w-[80px] inline-flex justify-center items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded px-1 py-1 transition-colors"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          อนุมัติ
                        </button>
                        <button
                          onClick={() => onRequestRevision?.(task)}
                          className="w-full max-w-[80px] inline-flex justify-center items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded px-1 py-1 transition-colors"
                        >
                          <AlertCircle className="w-3 h-3" />
                          ขอแก้ไข
                        </button>
                      </div>
                    ) : (
                      <div className="text-slate-300 flex justify-center">
                        <MoreVertical className="w-4 h-4" />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
