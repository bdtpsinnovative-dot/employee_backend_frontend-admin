import React, { useState } from 'react';
import {
  Calendar,
  CheckSquare,
  Flame,
  User as UserIcon,
  GripVertical,
} from 'lucide-react';
import type { AdminTask, User, Brand } from '../../types';
import { avatarUrl, formatRelativeDueDate, getTaskPriority } from './taskUtils';

interface TaskCardProps {
  task: AdminTask;
  userMap: Record<string, User>;
  brandMap: Record<string, Brand>;
  onClick: () => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  userMap,
  brandMap,
  onClick,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const brand = task.brand_id ? brandMap[task.brand_id] : null;
  const isCompleted = task.status === 'completed';
  const dueInfo = formatRelativeDueDate(task.due_date, isCompleted);
  const priority = getTaskPriority(task);

  // Collect assignees
  const assigneeIds = task.assignee_ids && task.assignee_ids.length > 0
    ? task.assignee_ids
    : task.assigned_to
    ? [task.assigned_to]
    : [];

  const assignees = assigneeIds.map(id => userMap[id]).filter(Boolean);
  const maxVisibleAvatars = 3;
  const overflowCount = assignees.length > maxVisibleAvatars ? assignees.length - maxVisibleAvatars : 0;
  const visibleAssignees = assignees.slice(0, maxVisibleAvatars);

  // Subtask progress
  const subItems = task.sub_items || [];
  const completedSubItems = subItems.filter(s => s.is_done).length;
  const subItemsCount = subItems.length;

  // Due date styling
  let dueBg = 'bg-slate-50 text-slate-600 border-slate-200';
  if (dueInfo.variant === 'overdue') {
    dueBg = 'bg-red-50 text-red-700 border-red-200 font-semibold';
  } else if (dueInfo.variant === 'today') {
    dueBg = 'bg-amber-50 text-amber-800 border-amber-300 font-semibold';
  } else if (dueInfo.variant === 'tomorrow') {
    dueBg = 'bg-blue-50 text-blue-700 border-blue-200';
  } else if (dueInfo.variant === 'completed') {
    dueBg = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        setIsDragging(true);
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => setIsDragging(false)}
      onClick={onClick}
      className={`group relative bg-white rounded-xl border border-slate-200/90 shadow-xs hover:shadow-md hover:border-indigo-300 transition-all p-4 cursor-grab active:cursor-grabbing flex flex-col justify-between gap-3 ${
        isDragging ? 'opacity-40 scale-95 border-indigo-400 ring-2 ring-indigo-400/30' : ''
      }`}
    >
      {/* Top Header Row: Brand Badge + Priority + Drag Grip */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <GripVertical className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
          {brand ? (
            <span className="px-2 py-0.5 text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md truncate max-w-[130px]">
              {brand.name}
            </span>
          ) : (
            <span className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-500 rounded-md">
              ทั่วไป
            </span>
          )}
        </div>

        {/* Priority Badge */}
        {priority === 'high' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 rounded-md">
            <Flame className="w-3 h-3 text-red-600" />
            <span>High</span>
          </span>
        )}
        {priority === 'medium' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200 rounded-md">
            <span>Medium</span>
          </span>
        )}
      </div>

      {/* Title */}
      <div>
        <h3 className={`text-sm font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors line-clamp-2 leading-snug ${isCompleted ? 'line-through text-slate-400' : ''}`}>
          {task.title}
        </h3>
      </div>

      {/* Subtasks Progress Bar (Render if subtasks exist) */}
      {subItemsCount > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span className="inline-flex items-center gap-1">
              <CheckSquare className="w-3 h-3 text-indigo-500" />
              <span>Checklist</span>
            </span>
            <span>
              {completedSubItems}/{subItemsCount}
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${(completedSubItems / subItemsCount) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer Meta Row: Due Date + Assignees + Metrics */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-500">
        {/* Due Date Pill */}
        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] ${dueBg}`}>
          <Calendar className="w-3 h-3" />
          <span>{dueInfo.text}</span>
        </div>

        {/* Assignees Avatars Stack */}
        <div className="flex items-center">
          {visibleAssignees.length > 0 ? (
            <div className="flex -space-x-2 overflow-hidden">
              {visibleAssignees.map((user) => {
                const url = avatarUrl(user.avatar_url);
                return url ? (
                  <img
                    key={user.id}
                    src={url}
                    alt={`${user.first_name} ${user.last_name}`}
                    title={`${user.first_name} ${user.last_name}`}
                    className="inline-block h-6 w-6 rounded-full ring-2 ring-white object-cover"
                  />
                ) : (
                  <div
                    key={user.id}
                    title={`${user.first_name} ${user.last_name}`}
                    className="inline-flex h-6 w-6 rounded-full bg-indigo-600 text-white font-bold text-[10px] items-center justify-center ring-2 ring-white"
                  >
                    {user.first_name?.[0] || 'U'}
                  </div>
                );
              })}
              {overflowCount > 0 && (
                <div className="inline-flex h-6 w-6 rounded-full bg-slate-200 text-slate-700 font-semibold text-[10px] items-center justify-center ring-2 ring-white">
                  +{overflowCount}
                </div>
              )}
            </div>
          ) : (
            <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <UserIcon className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
