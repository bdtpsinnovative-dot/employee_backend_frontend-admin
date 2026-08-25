import React from 'react';
import {
  Tag,
  Layers,
  CheckSquare,
  ArrowRight,
} from 'lucide-react';
import type { AdminTask, User, Brand, TaskCategory } from '../../types';
import { avatarUrl, formatRelativeDueDate } from './taskUtils';

interface TaskProjectOverviewProps {
  tasks: AdminTask[];
  userMap: Record<string, User>;
  brandMap: Record<string, Brand>;
  categoryMap: Record<string, TaskCategory>;
  onSelectProjectSheet: (task: AdminTask) => void;
  onOpenCreateModal?: () => void;
}

export const TaskProjectOverview: React.FC<TaskProjectOverviewProps> = ({
  tasks,
  userMap,
  brandMap,
  categoryMap,
  onSelectProjectSheet,
}) => {
  return (
    <div className="p-4 md:p-6 space-y-6">


      {/* Topics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tasks.map((task) => {
          const brand = task.brand_id ? brandMap[task.brand_id] : null;
          const category = task.category_id ? categoryMap[task.category_id] : null;
          const isDone = task.status === 'completed';
          const dueInfo = formatRelativeDueDate(task.due_date, isDone, task.status, task.latest_submission?.submitted_at);

          const subItems = task.sub_items || [];
          const doneSubItems = subItems.filter((s) => s.is_done).length;
          const subPct = subItems.length > 0 ? Math.round((doneSubItems / subItems.length) * 100) : 0;

          // Assignees
          const assigneeIds =
            task.assignee_ids && task.assignee_ids.length > 0
              ? task.assignee_ids
              : task.assigned_to
              ? [task.assigned_to]
              : [];
          const assignees = assigneeIds.map((id) => userMap[id]).filter(Boolean);

          return (
            <div
              key={task.id}
              onClick={() => onSelectProjectSheet(task)}
              className="group cursor-pointer bg-white/80 hover:bg-white backdrop-blur-md border border-slate-200/90 hover:border-blue-400/80 rounded-2xl p-5 shadow-xs hover:shadow-lg transition-all duration-300 flex flex-col justify-between"
            >
              <div className="space-y-4">
                {/* Header Tag Badges */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {brand && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-md">
                        <Tag className="w-2.5 h-2.5 text-blue-600" />
                        <span>{brand.name}</span>
                      </span>
                    )}
                    {category && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200 rounded-full">
                        <Layers className="w-2.5 h-2.5" />
                        <span>{category.name}</span>
                      </span>
                    )}
                  </div>

                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] border font-bold ${
                      dueInfo.variant === 'overdue'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : dueInfo.variant === 'today'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {dueInfo.text}
                  </span>
                </div>

                {/* Project Title */}
                <div>
                  <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                    {task.title}
                  </h3>
                  {task.description && (
                    <p className="text-xs text-slate-500 line-clamp-2 mt-1 font-medium">
                      {task.description}
                    </p>
                  )}
                </div>

                {/* Progress Bar */}
                <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                      <span>ความคืบหน้ารายการย่อย</span>
                    </span>
                    <span className={subPct === 100 ? 'text-emerald-600 font-bold' : 'text-slate-700'}>
                      {doneSubItems}/{subItems.length} ({subPct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-200/70 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        subPct === 100 ? 'bg-emerald-500' : 'bg-blue-600'
                      }`}
                      style={{ width: `${subPct}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                {/* Assignees Avatars */}
                <div className="flex items-center -space-x-2">
                  {assignees.slice(0, 4).map((usr) => {
                    const dispName = usr.nickname ? `${usr.first_name} (${usr.nickname})` : usr.first_name;
                    return usr.avatar_url ? (
                      <img
                        key={usr.id}
                        src={avatarUrl(usr.avatar_url)!}
                        className="w-7 h-7 rounded-full object-cover border-2 border-white shadow-2xs"
                        alt={usr.first_name}
                        title={dispName}
                      />
                    ) : (
                      <div
                        key={usr.id}
                        className="w-7 h-7 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-blue-700 font-bold text-[10px]"
                        title={dispName}
                      >
                        {usr.first_name.charAt(0)}
                      </div>
                    );
                  })}
                  {assignees.length > 4 && (
                    <div className="w-7 h-7 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-slate-600 font-bold text-[10px]">
                      +{assignees.length - 4}
                    </div>
                  )}
                </div>

                {/* Open Sheet Action CTA */}
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 group-hover:bg-blue-600 group-hover:text-white rounded-xl transition-all duration-200">
                  <span>เปิดรายละเอียดงาน</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
