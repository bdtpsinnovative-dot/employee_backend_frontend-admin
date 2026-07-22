import React from 'react';
import {
  Flame,
  Plus,
  CheckCircle2,
  Circle,
  Tag,
  Layers,
  CheckSquare,
} from 'lucide-react';
import type { AdminTask, User, Brand, TaskCategory } from '../../types';
import { formatRelativeDueDate, getTaskPriority, type TaskStatus } from './taskUtils';

interface TaskListViewProps {
  tasks: AdminTask[];
  userMap: Record<string, User>;
  brandMap: Record<string, Brand>;
  categoryMap: Record<string, TaskCategory>;
  onSelectTask: (task: AdminTask) => void;
  onStatusChange: (task: AdminTask, status: TaskStatus) => void;
  onOpenCreateModal: (defaultStatus?: TaskStatus) => void;
}

export const TaskListView: React.FC<TaskListViewProps> = ({
  tasks,
  userMap,
  brandMap,
  categoryMap,
  onSelectTask,
  onStatusChange,
  onOpenCreateModal,
}) => {
  // Group tasks by Category (Phases)
  const categoryIds = Array.from(new Set(tasks.map((t) => t.category_id || 'unassigned')));

  const phaseGroups = categoryIds.map((cId, idx) => {
    const category = cId !== 'unassigned' ? categoryMap[cId] : null;
    const groupTasks = tasks.filter((t) => (t.category_id || 'unassigned') === cId);
    return {
      phaseNumber: idx + 1,
      categoryId: cId,
      categoryName: category ? category.name : 'ไม่มีหมวดหมู่ (Uncategorized)',
      tasks: groupTasks,
    };
  });

  return (
    <div className="p-6">
      {/* Minimalist Sheet Container (Clean Blue & Slate Theme) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <table className="w-full text-left border-collapse text-xs font-sans">
          {/* Clean Light Slate Header Bar */}
          <thead>
            <tr className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 select-none">
              <th className="px-2 py-2 w-32 border-r border-slate-200 text-center">
                <div className="flex flex-col items-center justify-center text-slate-700">
                  <Layers className="w-3.5 h-3.5 text-blue-600 mb-0.5" />
                  <span>GROUP</span>
                </div>
              </th>
              <th className="px-2 py-2 w-24 border-r border-slate-200 text-center">Priority</th>
              <th className="px-3 py-2 border-r border-slate-200 w-1/3">DETAILS</th>
              <th className="px-2 py-2 w-24 border-r border-slate-200 text-center">Status</th>
              <th className="px-2 py-2 w-24 border-r border-slate-200 text-center">Due Date</th>
              <th className="px-2 py-2 w-24 border-r border-slate-200 text-center">Assign</th>
              <th className="px-2 py-2 w-10 border-r border-slate-200 text-center">Done</th>
              <th className="px-2 py-2 w-28 border-r border-slate-200 text-center">Note / Remark</th>
              <th className="px-2 py-2 w-28 border-r border-slate-200 text-center">Progress</th>
              <th className="px-3 py-2 w-1/4 border-r border-slate-200">Sub-Items</th>
              <th className="px-2 py-2 w-28 text-center">Tags</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200/80 bg-white">
            {phaseGroups.map((group) => {
              if (group.tasks.length === 0) return null;

              return (
                <React.Fragment key={group.categoryId}>
                  {group.tasks.map((task, taskIdx) => {
                    const isFirstRowInPhase = taskIdx === 0;
                    const brand = task.brand_id ? brandMap[task.brand_id] : null;
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

                    return (
                      <tr
                        key={task.id}
                        onClick={() => onSelectTask(task)}
                        className={`group cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-200/80 ${isDone ? 'opacity-80 bg-slate-50/50' : ''}`}
                      >
                        {/* 1. Category Column (Group) */}
                        {isFirstRowInPhase ? (
                          <td
                            rowSpan={group.tasks.length}
                            className="w-32 border-r border-slate-200 align-top p-0 bg-slate-50/30"
                          >
                            <div className="flex h-full min-h-[4rem] items-center justify-center p-2 relative">
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 rounded-r" />
                              <div className="flex flex-col justify-center px-2">
                                <span className="font-bold text-slate-800 text-[11px] break-words">
                                  {group.categoryName}
                                </span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenCreateModal();
                                }}
                                className="mt-1 inline-flex items-center justify-center text-[10px] font-semibold text-blue-600 hover:text-blue-700 bg-white hover:bg-blue-50 p-1 rounded-md border border-slate-200 transition-all shadow-2xs"
                                title="เพิ่มงาน"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        ) : null}

                        {/* 2. Priority Column */}
                        <td
                          className="px-2 py-2 border-r border-slate-200/80 text-center align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {priority === 'high' && (
                            <div className="mx-auto inline-flex items-center justify-between w-full max-w-[70px] px-1.5 py-0.5 bg-red-50 text-red-700 border border-red-200 font-bold rounded-full text-[10px]">
                              <span className="flex items-center gap-0.5">
                                <Flame className="w-2.5 h-2.5 text-red-600 fill-red-100" />
                                <span>High</span>
                              </span>
                            </div>
                          )}
                          {priority === 'medium' && (
                            <div className="mx-auto inline-flex items-center justify-center w-full max-w-[70px] px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 font-semibold rounded-full text-[10px]">
                              <span>Medium</span>
                            </div>
                          )}
                          {priority === 'low' && (
                            <div className="mx-auto inline-flex items-center justify-center w-full max-w-[70px] px-1.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 font-medium rounded-full text-[10px]">
                              <span>Low</span>
                            </div>
                          )}
                        </td>

                        {/* 3. DETAILS Column */}
                        <td className="px-3 py-2 border-r border-slate-200/80 align-middle">
                          <div className={`font-semibold text-slate-800 group-hover:text-blue-600 transition-colors text-[11px] leading-tight line-clamp-1 ${isDone ? 'line-through text-slate-400' : ''}`}>
                            {task.title}
                          </div>
                          {task.description && (
                            <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">
                              {task.description}
                            </div>
                          )}
                        </td>

                        {/* 4. Status Column */}
                        <td
                          className="px-2 py-2 border-r border-slate-200/80 text-center align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            value={task.status}
                            onChange={(e) =>
                              onStatusChange(task, e.target.value as TaskStatus)
                            }
                            className={`w-full max-w-[85px] px-1.5 py-1 text-center font-bold text-[10px] rounded-full appearance-none cursor-pointer border transition-all ${
                              isDone
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : task.status === 'in_progress'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            <option value="pending" className="bg-white text-slate-900 font-medium">Todo</option>
                            <option value="in_progress" className="bg-white text-slate-900 font-medium">Doing</option>
                            <option value="completed" className="bg-white text-slate-900 font-medium">Done</option>
                          </select>
                        </td>

                        {/* 5. Due Date Column */}
                        <td className="px-2 py-2 border-r border-slate-200/80 text-center align-middle font-medium">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] border whitespace-nowrap ${
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

                        {/* 6. Assign Column */}
                        <td className="px-2 py-2 border-r border-slate-200/80 text-center align-middle">
                          {firstAssignee ? (
                            <div className="mx-auto inline-flex items-center justify-center px-2 py-0.5 bg-slate-100 hover:bg-slate-200/80 text-slate-800 border border-slate-200 rounded-full font-semibold text-[10px] max-w-[80px] transition-colors">
                              <span className="truncate">{firstAssignee.first_name}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[10px]">-</span>
                          )}
                        </td>

                        {/* 7. List Checkbox Column */}
                        <td
                          className="px-2 py-2 border-r border-slate-200/80 text-center align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() =>
                              onStatusChange(task, isDone ? 'pending' : 'completed')
                            }
                            className="text-slate-400 hover:text-emerald-600 transition-colors"
                          >
                            {isDone ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-100 mx-auto" />
                            ) : (
                              <Circle className="w-4 h-4 stroke-[1.75] mx-auto text-slate-400" />
                            )}
                          </button>
                        </td>

                        {/* 7c. Note / Remark Column */}
                        <td className="px-2 py-2 border-r border-slate-200/80 align-middle">
                          {task.description ? (
                            <span className="text-[10px] text-slate-600 line-clamp-2 leading-snug" title={task.description}>
                              {task.description}
                            </span>
                          ) : (
                            <span className="text-slate-300 italic text-[10px]">—</span>
                          )}
                        </td>

                        {/* 7b. Progress Column */}
                        <td className="px-2 py-2 border-r border-slate-200/80 align-middle">
                          {subItems.length > 0 ? (() => {
                            const done = subItems.filter(s => s.is_done).length;
                            const total = subItems.length;
                            const pct = Math.round((done / total) * 100);
                            return (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="flex items-center gap-0.5 text-slate-500">
                                    <CheckSquare className="w-3 h-3 text-indigo-500" />
                                    <span>{done}/{total}</span>
                                  </span>
                                  <span className={`font-bold ${pct === 100 ? 'text-emerald-600' : 'text-slate-600'}`}>{pct}%</span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })() : (
                            <span className="text-slate-300 text-[10px]">—</span>
                          )}
                        </td>

                        {/* 8. Sub-items Column */}
                        <td className="px-3 py-2 border-r border-slate-200/80 align-middle">
                          {subItems.length > 0 ? (
                            <ul className="space-y-0.5 text-[10px] text-slate-600">
                              {subItems.slice(0, 3).map((sub) => (
                                <li key={sub.id} className="flex items-center gap-1 min-w-0">
                                  <div className={`w-2.5 h-2.5 rounded-sm border shrink-0 flex items-center justify-center ${
                                    sub.is_done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'
                                  }`}>
                                    {sub.is_done && (
                                      <svg className="w-1.5 h-1.5 text-white" fill="none" viewBox="0 0 8 8"><path d="M1 4l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    )}
                                  </div>
                                  <span className={`truncate ${sub.is_done ? 'line-through text-slate-400' : ''}`}>
                                    {sub.title}
                                  </span>
                                </li>
                              ))}
                              {subItems.length > 3 && (
                                <li className="text-[9px] text-indigo-500 font-semibold pl-3">
                                  +{subItems.length - 3} รายการ
                                </li>
                              )}
                            </ul>
                          ) : (
                            <span className="text-slate-300 italic text-[10px]">ไม่มีรายการย่อย</span>
                          )}
                        </td>

                        {/* 9. Tags Column */}
                        <td className="px-2 py-2 align-middle text-center">
                          {brand ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-md whitespace-nowrap">
                              <Tag className="w-2 h-2 text-blue-600" />
                              <span className="truncate max-w-[50px]">{brand.name}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[10px]">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
