import React, { useState } from 'react';
import { Plus, CheckCircle2, Clock, ListTodo } from 'lucide-react';
import type { AdminTask, User, Brand } from '../../types';
import { TaskCard } from './TaskCard';
import { type TaskStatus } from './taskUtils';

interface TaskBoardViewProps {
  tasks: AdminTask[];
  userMap: Record<string, User>;
  brandMap: Record<string, Brand>;
  onSelectTask: (task: AdminTask) => void;
  onStatusChange: (task: AdminTask, status: TaskStatus) => void;
  onOpenCreateModal: (defaultStatus?: TaskStatus) => void;
}

const COLUMNS: { id: TaskStatus; title: string; icon: React.ReactNode; colorDot: string }[] = [
  {
    id: 'pending',
    title: 'รอทำ (Todo)',
    icon: <ListTodo className="w-4 h-4 text-slate-500" />,
    colorDot: 'bg-slate-400',
  },
  {
    id: 'in_progress',
    title: 'กำลังทำ (Doing)',
    icon: <Clock className="w-4 h-4 text-amber-500" />,
    colorDot: 'bg-amber-500',
  },
  {
    id: 'completed',
    title: 'เสร็จสิ้น (Done)',
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
    colorDot: 'bg-emerald-500',
  },
];

export const TaskBoardView: React.FC<TaskBoardViewProps> = ({
  tasks,
  userMap,
  brandMap,
  onSelectTask,
  onStatusChange,
  onOpenCreateModal,
}) => {
  const [activeDragColumn, setActiveDragColumn] = useState<string | null>(null);

  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    setActiveDragColumn(null);
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== status) {
      onStatusChange(task, status);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 items-start">
      {COLUMNS.map((col) => {
        const columnTasks = tasks.filter((t) => t.status === col.id);
        const isHovered = activeDragColumn === col.id;

        return (
          <div
            key={col.id}
            onDragOver={(e) => {
              e.preventDefault();
              if (activeDragColumn !== col.id) setActiveDragColumn(col.id);
            }}
            onDragLeave={() => {
              setActiveDragColumn(null);
            }}
            onDrop={(e) => handleDrop(e, col.id)}
            className={`flex flex-col bg-slate-50/80 rounded-2xl border transition-all p-4 min-h-[500px] shadow-2xs ${
              isHovered
                ? 'border-indigo-400 bg-indigo-50/30 ring-2 ring-indigo-400/20'
                : 'border-slate-200/80'
            }`}
          >
            {/* Column Header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${col.colorDot}`} />
                <h2 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
                  {col.title}
                </h2>
                <span className="px-2 py-0.5 text-xs font-semibold bg-white border border-slate-200 text-slate-600 rounded-full shadow-2xs">
                  {columnTasks.length}
                </span>
              </div>

              {/* Inline Add Button */}
              <button
                onClick={() => onOpenCreateModal(col.id)}
                className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-md transition-all border border-transparent hover:border-slate-200"
                title="เพิ่มงานในคอลัมน์นี้"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Column Content Cards */}
            <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
              {columnTasks.length > 0 ? (
                columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    userMap={userMap}
                    brandMap={brandMap}
                    onClick={() => onSelectTask(task)}
                  />
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-white/40">
                  <p className="text-xs font-medium">ไม่มีงานในคอลัมน์นี้</p>
                  <button
                    onClick={() => onOpenCreateModal(col.id)}
                    className="mt-2 text-xs font-semibold text-indigo-600 hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>สร้างงานใหม่</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
