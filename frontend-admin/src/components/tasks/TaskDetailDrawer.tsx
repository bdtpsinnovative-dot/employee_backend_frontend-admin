import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  Trash2,
  Calendar,
  User as UserIcon,
  Tag,
  Send,
  MessageSquare,
  Clock,
  CheckSquare,
  Copy,
  Check,
  Plus,
} from 'lucide-react';
import type { AdminTask, User, Brand, TaskCategory, TaskEvent, TaskSubItem } from '../../types';
import { avatarUrl, formatRelativeDueDate, type TaskStatus } from './taskUtils';

interface TaskDetailDrawerProps {
  task: AdminTask | null;
  userMap: Record<string, User>;
  brandMap: Record<string, Brand>;
  categoryMap: Record<string, TaskCategory>;
  taskEvents: TaskEvent[];
  eventsLoading: boolean;
  commentText: string;
  onCommentTextChange: (text: string) => void;
  onAddComment: () => void;
  onClose: () => void;
  onStatusChange: (task: AdminTask, status: TaskStatus) => void;
  onDeleteTask: (id: string) => void;
  onEditTask?: (task: AdminTask) => void;
  onRefresh?: () => void;
}

export const TaskDetailDrawer: React.FC<TaskDetailDrawerProps> = ({
  task,
  userMap,
  brandMap,
  categoryMap,
  taskEvents,
  eventsLoading,
  commentText,
  onCommentTextChange,
  onAddComment,
  onClose,
  onStatusChange,
  onDeleteTask,
  onEditTask,
  onRefresh,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);

  const isCompleted = (task?.status ?? '') === 'completed';
  const brand = task?.brand_id ? brandMap[task.brand_id] : null;
  const category = task?.category_id ? categoryMap[task.category_id] : null;
  const dueInfo = formatRelativeDueDate(task?.due_date ?? '', isCompleted);

  // Assignees
  const assigneeIds = task && task.assignee_ids && task.assignee_ids.length > 0
    ? task.assignee_ids
    : task?.assigned_to
    ? [task.assigned_to]
    : [];
  const assignees = assigneeIds.map((id) => userMap[id]).filter(Boolean);

  // Subtasks
  const [subItems, setSubItems] = useState<TaskSubItem[]>([]);

  useEffect(() => {
    if (!task?.id) return;
    let isMounted = true;
    const fetchItems = async () => {
      try {
        const { fetchTaskSubItems } = await import('../../services/adminApi');
        const items = await fetchTaskSubItems(task.id);
        if (isMounted) {
          setSubItems(items);
        }
      } catch (err) {
        console.error('Failed to load sub items', err);
      }
    };
    fetchItems();
    return () => { isMounted = false; };
  }, [task?.id]);

  if (!task) return null;

  const completedSubCount = subItems.filter((s) => s.is_done).length;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-2xl bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out">
          
          {/* Top Asana Action Bar */}
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
            {/* Mark Complete Toggle Button */}
            <button
              onClick={() => onStatusChange(task, isCompleted ? 'pending' : 'completed')}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-2xs border ${
                isCompleted
                  ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 hover:border-slate-400'
              }`}
            >
              <CheckCircle2 className={`w-4 h-4 ${isCompleted ? 'text-white' : 'text-emerald-600'}`} />
              <span>{isCompleted ? 'ทำเสร็จเรียบร้อย (Completed)' : 'ทำเสร็จ (Mark Complete)'}</span>
            </button>

            {/* Right Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyLink}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors"
                title="คัดลอกลิงก์งาน"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>

              {onEditTask && (
                <button
                  onClick={() => onEditTask(task)}
                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  title="แก้ไขรายละเอียดงาน"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                </button>
              )}

              <button
                onClick={() => onDeleteTask(task.id)}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="ลบงานนี้"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <div className="w-px h-5 bg-slate-200 mx-1" />

              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Drawer Body Scrollable */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Title */}
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-snug">
                {task.title}
              </h1>
            </div>

            {/* Metadata Fields Grid */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50/80 rounded-xl border border-slate-200/80 text-xs">
              {/* Assignees */}
              <div className="space-y-1">
                <span className="text-slate-400 font-medium flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5" />
                  <span>ผู้รับผิดชอบ (Assignees)</span>
                </span>
                <div className="flex items-center gap-2 pt-1">
                  {assignees.length > 0 ? (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {assignees.map((user) => {
                        const url = avatarUrl(user.avatar_url);
                        return (
                          <div key={user.id} className="inline-flex items-center gap-1.5 bg-white px-2 py-1 rounded-md border border-slate-200 shadow-2xs">
                            {url ? (
                              <img src={url} alt={user.first_name} className="w-4 h-4 rounded-full object-cover" />
                            ) : (
                              <div className="w-4 h-4 rounded-full bg-indigo-600 text-white font-bold text-[9px] flex items-center justify-center">
                                {user.first_name?.[0] || 'U'}
                              </div>
                            )}
                            <span className="font-semibold text-slate-700">{user.first_name} {user.last_name}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-slate-400 italic">ไม่ได้ระบุ</span>
                  )}
                </div>
              </div>

              {/* Due Date */}
              <div className="space-y-1">
                <span className="text-slate-400 font-medium flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>วันกำหนดส่ง (Due Date)</span>
                </span>
                <div className="pt-1">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border font-medium ${
                    dueInfo.variant === 'overdue' ? 'bg-red-50 text-red-700 border-red-200' :
                    dueInfo.variant === 'today' ? 'bg-amber-50 text-amber-800 border-amber-300' :
                    'bg-white text-slate-700 border-slate-200'
                  }`}>
                    {dueInfo.text}
                  </span>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1">
                <span className="text-slate-400 font-medium flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>สถานะ (Status)</span>
                </span>
                <select
                  value={task.status}
                  onChange={(e) => onStatusChange(task, e.target.value as TaskStatus)}
                  className="w-full mt-1 bg-white border border-slate-200 rounded-md px-2 py-1 font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="pending">รอทำ (Pending)</option>
                  <option value="in_progress">กำลังทำ (In Progress)</option>
                  <option value="completed">เสร็จสิ้น (Completed)</option>
                </select>
              </div>

              {/* Brand & Category */}
              <div className="space-y-1">
                <span className="text-slate-400 font-medium flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  <span>แบรนด์ / หมวดหมู่</span>
                </span>
                <div className="flex items-center gap-1.5 pt-1">
                  {brand && (
                    <span className="px-2 py-0.5 font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md">
                      {brand.name}
                    </span>
                  )}
                  {category && (
                    <span className="px-2 py-0.5 font-semibold bg-slate-100 text-slate-600 border border-slate-200 rounded-md">
                      {category.name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">รายละเอียดงาน (Description)</h3>
              <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-200 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {task.description ? task.description : <span className="text-slate-400 italic">ไม่มีรายละเอียดเพิ่มเติม</span>}
              </div>
            </div>

            {/* Checklist Subtasks */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckSquare className="w-4 h-4 text-indigo-600" />
                  <span>รายการย่อย (Checklist {completedSubCount}/{subItems.length})</span>
                </h3>
              </div>

              <div className="space-y-2 bg-slate-50/50 p-3 rounded-xl border border-slate-200">
                {subItems.map((sub) => (
                  <div key={sub.id} className="space-y-1 text-xs text-slate-700 group">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={sub.is_done}
                        onChange={async () => {
                          const nextDone = !sub.is_done;
                          setSubItems(prev => prev.map(s => s.id === sub.id ? { ...s, is_done: nextDone } : s));
                          try {
                            const { toggleTaskSubItem } = await import('../../services/adminApi');
                            await toggleTaskSubItem(sub.id, nextDone);
                            if (onRefresh) onRefresh();
                          } catch (e: any) {
                            setSubItems(prev => prev.map(s => s.id === sub.id ? { ...s, is_done: !nextDone } : s));
                          }
                        }}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 cursor-pointer"
                      />
                      <span className={`flex-1 ${sub.is_done ? 'line-through text-slate-400' : 'font-medium'}`}>
                        {sub.title}
                      </span>
                      <button
                        onClick={async () => {
                          setSubItems(prev => prev.filter(s => s.id !== sub.id));
                          try {
                            const { deleteTaskSubItem } = await import('../../services/adminApi');
                            await deleteTaskSubItem(sub.id);
                            if (onRefresh) onRefresh();
                          } catch (e: any) {
                            const { fetchTaskSubItems } = await import('../../services/adminApi');
                            const items = await fetchTaskSubItems(task.id);
                            setSubItems(items);
                          }
                        }}
                        className="text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <input
                      type="text"
                      defaultValue={sub.admin_comment || ''}
                      placeholder="Note / Remark..."
                      onClick={(e) => e.stopPropagation()}
                      onBlur={async (e) => {
                        const note = e.target.value.trim();
                        if (note === (sub.admin_comment || '')) return;
                        try {
                          const { updateTaskSubItemNote } = await import('../../services/adminApi');
                          await updateTaskSubItemNote(sub.id, note);
                          setSubItems(prev => prev.map(s => s.id === sub.id ? { ...s, admin_comment: note } : s));
                        } catch (err) {
                          console.error('Failed to save note', err);
                        }
                      }}
                      className="w-full ml-6 max-w-[calc(100%-1.5rem)] px-2 py-1 bg-white border border-slate-200 rounded-md text-[10px] text-slate-600 placeholder-slate-400 focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-400"
                    />
                  </div>
                ))}
                
                {/* Add Sub-item Form */}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.target as HTMLFormElement;
                    const input = form.elements.namedItem('title') as HTMLInputElement;
                    if (!input.value.trim()) return;
                    try {
                      const { createTaskSubItem } = await import('../../services/adminApi');
                      const newSubItem = await createTaskSubItem(task.id, input.value.trim());
                      setSubItems(prev => [...prev, newSubItem]);
                      input.value = '';
                      if (onRefresh) onRefresh();
                    } catch (err: any) {
                      alert(err.message || 'Error creating sub-item');
                    }
                  }}
                  className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200"
                >
                  <Plus className="w-4 h-4 text-slate-400" />
                  <input
                    name="title"
                    type="text"
                    placeholder="เพิ่มรายการย่อยใหม่..."
                    className="flex-1 bg-transparent border-none focus:ring-0 text-xs px-1 placeholder-slate-400"
                  />
                  <button type="submit" className="text-xs font-bold text-indigo-600 hover:text-indigo-700">
                    เพิ่ม
                  </button>
                </form>
              </div>
            </div>

            {/* Timeline & Discussion Feed */}
            <div className="space-y-4 pt-4 border-t border-slate-200">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                <span>การพูดคุยและประวัติกิจกรรม (Activity & Comments)</span>
              </h3>

              {/* Event Feed */}
              <div className="space-y-3">
                {eventsLoading ? (
                  <div className="py-4 text-center text-xs text-slate-400">กำลังโหลดประวัติ...</div>
                ) : taskEvents.length > 0 ? (
                  taskEvents.map((evt) => {
                    const avatar = avatarUrl(evt.user_avatar_url);
                    return (
                      <div key={evt.id} className="flex items-start gap-3 text-xs bg-slate-50/60 p-3 rounded-xl border border-slate-100">
                        {avatar ? (
                          <img src={avatar} alt="User" className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                            {evt.user_first_name?.[0] || 'U'}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800">
                              {evt.user_first_name} {evt.user_last_name}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(evt.created_at).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                            </span>
                          </div>
                          {evt.content && (
                            <p className="text-slate-700 mt-1 whitespace-pre-wrap leading-normal font-medium bg-white p-2 rounded-md border border-slate-200/60">
                              {evt.content}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-4 text-center text-xs text-slate-400 italic">ยังไม่มีการพูดคุยในงานนี้</div>
                )}
              </div>

              {/* Comment Input Box */}
              <div className="flex items-start gap-2 pt-2">
                <textarea
                  rows={2}
                  value={commentText}
                  onChange={(e) => onCommentTextChange(e.target.value)}
                  placeholder="พิมพ์คอมเมนต์หรืออัปเดตงานที่นี่..."
                  className="flex-1 p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                />
                <button
                  onClick={onAddComment}
                  disabled={!commentText.trim() || eventsLoading}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>ส่ง</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
