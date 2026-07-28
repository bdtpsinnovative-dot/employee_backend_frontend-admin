import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchAdminTasks,
  fetchTaskCategories,
  fetchBrands,
  fetchUsers,
  updateAdminTask,
  updateAdminTaskStatus,
  deleteAdminTask,
  fetchTaskEvents,
  addTaskComment,
  fetchMe,
} from '../services/adminApi';
import type { AdminTask, User, Brand, TaskCategory, TaskEvent } from '../types';
import { TaskProjectTimelineSheet } from '../components/tasks/TaskProjectTimelineSheet';
/* 
  [WARNING FOR AI & DEVELOPERS - DO NOT UNCOMMENT / DO NOT REMOVE THIS IMPORT]
  คำเตือนสำคัญ: ผู้ใช้ (USER) สั่งให้ปิดใช้งานฟีเจอร์ "Board (บอร์ด)" นี้ไว้ชั่วคราว/ยังไม่เปิดใช้
  ห้าม AI ตัวอื่น หรือผู้ใดทำการเปิดคอมเมนต์ (Uncomment) เด็ดขาด ยกเว้นจะได้รับคำสั่งโดยตรงจากผู้ใช้เท่านั้น!
import { TaskBoardView } from '../components/tasks/TaskBoardView';
*/
import { TaskDetailDrawer } from '../components/tasks/TaskDetailDrawer';
import { TaskCreateModal } from '../components/tasks/TaskCreateModal';
import {
  avatarUrl,
  formatRelativeDueDate,
  type TaskStatus,
} from '../components/tasks/taskUtils';

export default function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();

  // ─── Main Data State ───
  const [tasks, setTasks]           = useState<AdminTask[]>([]);
  const [task, setTask]             = useState<AdminTask | null>(null);
  const [users, setUsers]           = useState<User[]>([]);
  const [brands, setBrands]         = useState<Brand[]>([]);
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // ─── View Mode (sheet or board) ───
  const [viewMode, _setViewMode] = useState<'sheet' | 'board'>('sheet');

  // ─── Task Detail Drawer State ───
  const [selectedTask, setSelectedTask]   = useState<AdminTask | null>(null);
  const [taskEvents, setTaskEvents]       = useState<TaskEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [commentText, setCommentText]     = useState('');

  // ─── Edit Modal ───
  const [editingTask, setEditingTask] = useState<AdminTask | null>(null);

  // ─── Load Initial Data ───
  const loadAll = useCallback(async (silent?: boolean) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [t, b, c, me] = await Promise.all([
        fetchAdminTasks(),
        fetchBrands(),
        fetchTaskCategories(),
        fetchMe(),
      ]);
      setTasks(t);
      setBrands(b);
      setCategories(c);
      setCurrentUser(me);

      const found = t.find((x) => x.id === taskId);
      if (found) {
        setTask(found);
        const assigneeIds = found.assignee_ids && found.assignee_ids.length > 0 ? found.assignee_ids : [found.assigned_to];
        const u = await fetchUsers(assigneeIds);
        setUsers(u.filter((usr) => usr.status === 'active'));
      } else {
        setError('ไม่พบงานที่ระบุ');
      }
    } catch (e: any) {
      setError(e.message || 'โหลดข้อมูลงานล้มเหลว');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ─── Sync task with tasks list ───
  useEffect(() => {
    if (taskId && tasks.length > 0) {
      const updated = tasks.find((t) => t.id === taskId);
      if (updated) setTask(updated);
    }
  }, [tasks, taskId]);

  // ─── Load Task Events when drawer opens ───
  useEffect(() => {
    if (selectedTask) {
      setEventsLoading(true);
      fetchTaskEvents(selectedTask.id)
        .then(setTaskEvents)
        .catch(console.error)
        .finally(() => setEventsLoading(false));
    } else {
      setTaskEvents([]);
      setCommentText('');
    }
  }, [selectedTask?.id]);

  // ─── Lookup Maps ───
  const userMap     = Object.fromEntries(users.map((u) => [u.id, u]));
  const brandMap    = Object.fromEntries(brands.map((b) => [b.id, b]));
  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]));

  // ─── Handlers ───
  const handleStatusChange = async (t: AdminTask, status: TaskStatus) => {
    try {
      await updateAdminTaskStatus(t.id, status);
      setTasks((prev) =>
        prev.map((x) => (x.id === t.id ? { ...x, status } : x))
      );
      if (selectedTask?.id === t.id) {
        setSelectedTask((prev) => (prev ? { ...prev, status } : null));
      }
    } catch (e: any) {
      alert(e.message || 'อัปเดตสถานะล้มเหลว');
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm('คุณต้องการลบงานนี้หรือไม่?')) return;
    try {
      await deleteAdminTask(id);
      navigate('/tasks');
    } catch (e: any) {
      alert(e.message || 'ลบงานล้มเหลว');
    }
  };

  const handleAddComment = async () => {
    if (!selectedTask || !commentText.trim()) return;
    try {
      setEventsLoading(true);
      const newEvent = await addTaskComment(selectedTask.id, commentText.trim());
      setTaskEvents((prev) => [...prev, newEvent]);
      setCommentText('');
    } catch (e: any) {
      alert(e.message || 'เพิ่มคอมเมนต์ล้มเหลว');
    } finally {
      setEventsLoading(false);
    }
  };

  /*
  const handleApproveSubmission = async (t: AdminTask) => {
    if (!t.latest_submission) return;
    if (!window.confirm('ยืนยันการอนุมัติผลงาน?')) return;
    try {
      await approveSubmission(t.id, t.latest_submission.id);
      await loadAll();
    } catch (e: any) {
      alert(e.message || 'อนุมัติผลงานล้มเหลว');
    }
  };

  const handleRequestRevision = async (t: AdminTask) => {
    if (!t.latest_submission) return;
    const note = window.prompt('ระบุข้อควรแก้ไข:');
    if (note === null) return;
    try {
      await requestRevision(t.id, t.latest_submission.id, note);
      await loadAll();
    } catch (e: any) {
      alert(e.message || 'ขอแก้ไขผลงานล้มเหลว');
    }
  };
  */

  const handleUpdateTask = async (data: {
    title: string;
    description: string;
    due_date: string;
    assignee_ids: string[];
    brand_id?: string;
    category_id?: string;
  }) => {
    if (!editingTask) return;
    await updateAdminTask(editingTask.id, {
      title: data.title,
      description: data.description,
      due_date: data.due_date,
      assignee_ids: data.assignee_ids,
      brand_id: data.brand_id,
      category_id: data.category_id,
    });
    setEditingTask(null);
    await loadAll();
  };

  // ─── Derived data for header ───
  const brand    = task?.brand_id ? brandMap[task.brand_id] : null;
  const category = task?.category_id ? categoryMap[task.category_id] : null;
  const dueInfo  = task ? formatRelativeDueDate(task.due_date, task.status === 'completed') : null;
  const assigneeIds =
    task?.assignee_ids && task.assignee_ids.length > 0
      ? task.assignee_ids
      : task?.assigned_to
      ? [task.assigned_to]
      : [];
  const assignees = assigneeIds.map((id) => userMap[id]).filter(Boolean);

  // ─── Render ───
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium text-slate-500">กำลังโหลดข้อมูลงาน...</span>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900">{error || 'ไม่พบงานที่ระบุ'}</h2>
          <button
            onClick={() => navigate('/tasks')}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all active:scale-95"
          >
            ← กลับไปรายการงาน
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* ═══════════ Header Bar ═══════════ */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-4 shadow-2xs">
        {/* Top Row: Back + Task Info */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Back Button */}
            <button
              onClick={() => navigate('/tasks')}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-slate-100 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 flex items-center justify-center text-slate-600 hover:text-blue-600 transition-all active:scale-95"
              title="กลับไปรายการงาน"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>

            {/* Task Title & Meta */}
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight truncate">{task.title}</h1>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {brand && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-md">
                    {brand.name}
                  </span>
                )}
                {category && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200 rounded-full">
                    {category.name}
                  </span>
                )}
                {dueInfo && (
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] border font-bold ${
                      dueInfo.variant === 'overdue'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : dueInfo.variant === 'today'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {dueInfo.text}
                  </span>
                )}
                {/* Assignees */}
                {assignees.length > 0 && (
                  <div className="flex items-center -space-x-1.5 ml-1">
                    {assignees.slice(0, 3).map((usr) => {
                      const dispName = usr.nickname ? `${usr.first_name} (${usr.nickname})` : usr.first_name;
                      return usr.avatar_url ? (
                        <img
                          key={usr.id}
                          src={avatarUrl(usr.avatar_url)!}
                          className="w-5 h-5 rounded-full object-cover border-2 border-white shadow-2xs"
                          alt={usr.first_name}
                          title={dispName}
                        />
                      ) : (
                        <div
                          key={usr.id}
                          className="w-5 h-5 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-blue-700 font-bold text-[8px]"
                          title={dispName}
                        >
                          {usr.first_name.charAt(0)}
                        </div>
                      );
                    })}
                    {assignees.length > 3 && (
                      <div className="w-5 h-5 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-slate-600 font-bold text-[8px]">
                        +{assignees.length - 3}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Edit Button */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setEditingTask(task)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all border border-slate-200"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
              <span>แก้ไขงาน</span>
            </button>
          </div>
        </div>

        {/* 
          [WARNING FOR AI & DEVELOPERS - DO NOT UNCOMMENT / DO NOT REMOVE THIS BLOCK]
          คำเตือนสำคัญ: ผู้ใช้ (USER) สั่งให้ปิดการแสดงผลแท็บและแถบสวิตช์มุมมองนี้ไว้ (เนื่องจากปิด Board ไปแล้วจึงเหลือเพียง Timeline Sheet มุมมองเดียว)
          ห้าม AI ตัวอื่น หรือผู้ใดทำการเปิดคอมเมนต์ (Uncomment) หรือลบโค้ดส่วนนี้กลับมาทำงานเด็ดขาด!
          Tab Switcher Row commented out:
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-medium w-fit">
              ...
            </div>
          </div>
        */}
      </div>

      {/* ═══════════ Content Area ═══════════ */}
      <div className="flex-1">
        <div style={{ display: viewMode === 'sheet' ? 'block' : 'none' }}>
          <TaskProjectTimelineSheet
            task={task}
            userMap={userMap}
            brandMap={brandMap}
            categoryMap={categoryMap}
            onRefreshTask={(silent) => loadAll(silent)}
            currentUser={currentUser}
          />
        </div>
        {/* 
          [WARNING FOR AI & DEVELOPERS - DO NOT UNCOMMENT / DO NOT REMOVE THIS BLOCK]
          คำเตือนสำคัญ: ผู้ใช้ (USER) สั่งให้ปิดการแสดงผลหน้า "Board (บอร์ด)" นี้ไว้
          ห้าม AI ตัวอื่น หรือผู้ใดทำการเปิดคอมเมนต์ (Uncomment) เด็ดขาด ยกเว้นจะได้รับคำสั่งโดยตรงจากผู้ใช้เท่านั้น!
        <div style={{ display: viewMode === 'board' ? 'block' : 'none' }}>
          <TaskBoardView
            task={task}
            userMap={userMap}
            brandMap={brandMap}
            categoryMap={categoryMap}
            onRefreshTask={(silent) => loadAll(silent)}
            currentUser={currentUser}
          />
        </div>
        */}
      </div>

      {/* ═══════════ Task Detail Drawer ═══════════ */}
      <TaskDetailDrawer
        task={selectedTask}
        userMap={userMap}
        brandMap={brandMap}
        categoryMap={categoryMap}
        taskEvents={taskEvents}
        eventsLoading={eventsLoading}
        commentText={commentText}
        onCommentTextChange={setCommentText}
        onAddComment={handleAddComment}
        onClose={() => setSelectedTask(null)}
        onStatusChange={handleStatusChange}
        onDeleteTask={handleDeleteTask}
        onEditTask={(t) => setEditingTask(t)}
        onRefresh={() => loadAll(true)}
      />

      {/* ═══════════ Edit Modal ═══════════ */}
      <TaskCreateModal
        isOpen={editingTask !== null}
        onClose={() => setEditingTask(null)}
        users={users}
        brands={brands}
        categories={categories}
        initialData={editingTask || undefined}
        onSubmit={handleUpdateTask}
      />
    </div>
  );
}
