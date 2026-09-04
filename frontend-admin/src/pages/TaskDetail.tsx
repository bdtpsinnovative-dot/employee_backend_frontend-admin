import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, FileText, ExternalLink, X } from 'lucide-react';
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
  createBrand,
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
import { AttachmentLightbox } from '../components/tasks/AttachmentLightbox';
import {
  avatarUrl,
  formatRelativeDueDate,
  toPublicAttachmentUrl,
  isImageUrl,
  parseTaskAttachments,
  type TaskStatus,
} from '../components/tasks/taskUtils';
import { queryKeys } from '../lib/queryKeys';

export default function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const tasksListPath = `/tasks${location.search}`;
  const { notifications = [], setNotifications } = useOutletContext<{ notifications?: any[], setNotifications?: React.Dispatch<React.SetStateAction<any[]>> }>() || {};

  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks('mine'),
    queryFn: () => fetchAdminTasks(),
    staleTime: 60_000,
    refetchOnMount: 'always',
  });
  const usersQuery = useQuery({
    queryKey: queryKeys.users(),
    queryFn: () => fetchUsers(),
    staleTime: 5 * 60_000,
  });
  const brandsQuery = useQuery({
    queryKey: queryKeys.brands,
    queryFn: () => fetchBrands(),
    staleTime: 15 * 60_000,
  });
  const categoriesQuery = useQuery({
    queryKey: queryKeys.taskCategories,
    queryFn: () => fetchTaskCategories(),
    staleTime: 15 * 60_000,
  });
  const meQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => fetchMe(),
    staleTime: 5 * 60_000,
  });

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
  const [editTaskEvents, setEditTaskEvents] = useState<TaskEvent[]>([]);
  const [editEventsLoading, setEditEventsLoading] = useState(false);
  const [showPreviewLightbox, setShowPreviewLightbox] = useState(false);
  const [lightboxInitialIndex, setLightboxInitialIndex] = useState(0);
  const [showAttachmentsListModal, setShowAttachmentsListModal] = useState(false);

  useEffect(() => {
    if (!editingTask) {
      setEditTaskEvents([]);
      return;
    }
    setEditEventsLoading(true);
    fetchTaskEvents(editingTask.id, { taskOnly: true })
      .then((evts) => setEditTaskEvents(evts || []))
      .catch(() => setEditTaskEvents([]))
      .finally(() => setEditEventsLoading(false));
  }, [editingTask?.id]);

  useEffect(() => {
    if (tasksQuery.data) setTasks(tasksQuery.data);
    if (usersQuery.data) setUsers(usersQuery.data.filter((usr) => usr.status === 'active'));
    if (brandsQuery.data) setBrands(brandsQuery.data);
    if (categoriesQuery.data) setCategories(categoriesQuery.data);
    if (meQuery.data) setCurrentUser(meQuery.data);

    if (taskId === 'daily' && meQuery.data) {
      setTask({
        id: 'daily',
        title: 'กระดานงานรายวันรวม',
        description: 'รวมรายการงานที่ยังไม่เสร็จจากทุกโปรเจกต์ของคุณ',
        status: 'in_progress',
        due_date: new Date().toISOString(),
        assigned_to: meQuery.data.id,
        created_at: new Date().toISOString(),
      });
    } else if (taskId && taskId !== 'daily' && tasksQuery.data) {
      const found = tasksQuery.data.find((item) => item.id === taskId);
      setTask(found || null);
      if (!found) setError('ไม่พบงานที่ระบุ');
    }

    const queryError = tasksQuery.error || usersQuery.error || brandsQuery.error || categoriesQuery.error || meQuery.error;
    if (queryError) setError(queryError instanceof Error ? queryError.message : 'โหลดข้อมูลงานล้มเหลว');

    setLoading(
      tasksQuery.isPending || usersQuery.isPending || brandsQuery.isPending || categoriesQuery.isPending || meQuery.isPending,
    );
  }, [
    brandsQuery.data,
    brandsQuery.error,
    brandsQuery.isPending,
    categoriesQuery.data,
    categoriesQuery.error,
    categoriesQuery.isPending,
    meQuery.data,
    meQuery.error,
    meQuery.isPending,
    taskId,
    tasksQuery.data,
    tasksQuery.error,
    tasksQuery.isPending,
    usersQuery.data,
    usersQuery.error,
    usersQuery.isPending,
  ]);

  const refreshTaskData = useCallback(async (_silent?: boolean) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.tasks('mine') });
  }, [queryClient]);

  // ─── Sync task with tasks list ───
  useEffect(() => {
    if (taskId && taskId !== 'daily' && tasks.length > 0) {
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
      queryClient.setQueryData<AdminTask[]>(queryKeys.tasks('mine'), (current) =>
        current?.map((x) => (x.id === t.id ? { ...x, status } : x)),
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
      await refreshTaskData();
      navigate(tasksListPath);
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
      await refreshTaskData();
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
    priority?: string;
    status?: string;
    attachment_url?: string;
  }) => {
    if (!editingTask) return;
    await updateAdminTask(editingTask.id, {
      title: data.title,
      description: data.description,
      due_date: data.due_date,
      assignee_ids: data.assignee_ids,
      brand_id: data.brand_id,
      category_id: data.category_id,
      priority: data.priority,
      status: data.status,
      attachment_url: data.attachment_url,
    });
    setEditingTask(null);
    await refreshTaskData();
  };

  // ─── Derived data for header ───
  const brand    = task?.brand_id ? brandMap[task.brand_id] : null;
  const category = task?.category_id ? categoryMap[task.category_id] : null;
  const dueInfo  = task ? formatRelativeDueDate(task.due_date, task.status === 'completed', task.status, task.latest_submission?.submitted_at) : null;
  const assigneeIds =
    task?.assignee_ids && task.assignee_ids.length > 0
      ? task.assignee_ids
      : task?.assigned_to
      ? [task.assigned_to]
      : [];
  const assignees = assigneeIds.map((id) => userMap[id]).filter(Boolean);
  const taskAttachments = parseTaskAttachments(task?.attachment_url);
  const imageAttachments = taskAttachments.filter(a => isImageUrl(a.url));

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
            onClick={() => navigate(tasksListPath)}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all active:scale-95"
          >
            ← กลับไปรายการงาน
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="task-detail-page min-h-screen bg-slate-100 flex flex-col font-sans content-area-flush">
      {/* ═══════════ Header Bar ═══════════ */}
      <div className="task-detail-header bg-white border-b border-slate-200 px-4 md:px-6 py-4 shadow-2xs">
        {/* Top Row: Back + Task Info */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Back Button */}
            <button
              onClick={() => navigate(tasksListPath)}
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
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] border font-bold ${
                      dueInfo.variant === 'overdue'
                        ? 'bg-red-50 text-red-700 border-red-200 shadow-xs'
                        : dueInfo.variant === 'today'
                        ? 'bg-amber-50 text-amber-800 border-amber-200 shadow-xs'
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

          {/* Right: Action Buttons (View Example + Edit Task) */}
          {taskId !== 'daily' && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* ปุ่มดูตัวอย่างงาน */}
              {taskAttachments.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const allImages = taskAttachments.every(a => isImageUrl(a.url));
                    if (allImages) {
                      setLightboxInitialIndex(0);
                      setShowPreviewLightbox(true);
                    } else if (taskAttachments.length === 1) {
                      window.open(toPublicAttachmentUrl(taskAttachments[0].url), '_blank', 'noopener,noreferrer');
                    } else {
                      setShowAttachmentsListModal(true);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all border text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-200 shadow-2xs cursor-pointer active:scale-95"
                  title={`คลิกเพื่อดูตัวอย่างงาน (${taskAttachments.length} ไฟล์)`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{taskAttachments.length > 1 ? `ดูตัวอย่าง (${taskAttachments.length})` : 'ดูตัวอย่าง'}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse shrink-0" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-400 bg-slate-100/70 cursor-not-allowed select-none opacity-60"
                  title="งานนี้ไม่มีตัวอย่างงาน"
                >
                  <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                  <span>ไม่มีตัวอย่าง</span>
                </button>
              )}

              {/* ปุ่มแก้ไขงาน */}
              <button
                onClick={() => setEditingTask(task)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all border border-slate-200 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
                <span>แก้ไขงาน</span>
              </button>
            </div>
          )}
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
            tasks={tasks}
            userMap={userMap}
            brandMap={brandMap}
            categoryMap={categoryMap}
            notifications={notifications}
            setNotifications={setNotifications}
    onRefreshTask={(silent) => refreshTaskData(silent)}
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
            onRefreshTask={(silent) => refreshTaskData(silent)}
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
        onRefresh={() => void refreshTaskData(true)}
        currentUser={currentUser}
      />

      {/* ═══════════ Edit Modal ═══════════ */}
      <TaskCreateModal
        isOpen={editingTask !== null}
        onClose={() => setEditingTask(null)}
        users={users}
        brands={brands}
        categories={categories}
        initialData={editingTask || undefined}
        currentUser={currentUser}
        taskEvents={editTaskEvents}
        eventsLoading={editEventsLoading}
        onCreateBrand={async (name: string) => {
          const created = await createBrand(name);
          queryClient.invalidateQueries({ queryKey: queryKeys.brands });
          setBrands((prev) => [...prev, created]);
          return created;
        }}
        onSubmit={handleUpdateTask}
      />

      {/* Lightbox for Previewing Example Images */}
      {showPreviewLightbox && imageAttachments.length > 0 && (
        <AttachmentLightbox
          images={imageAttachments.map(a => ({ name: a.name, src: toPublicAttachmentUrl(a.url) }))}
          initialIndex={lightboxInitialIndex}
          onClose={() => setShowPreviewLightbox(false)}
        />
      )}

      {/* Modal for Multiple Attachments List */}
      {showAttachmentsListModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setShowAttachmentsListModal(false)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-5 space-y-4 animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-indigo-600" />
                  <span>ไฟล์ตัวอย่างงาน ({taskAttachments.length} ไฟล์)</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAttachmentsListModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {taskAttachments.map((att, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isImageUrl(att.url) ? (
                        <img
                          src={toPublicAttachmentUrl(att.url)}
                          alt={att.name}
                          className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate max-w-[180px]" title={att.name}>
                          {att.name}
                        </p>
                        <span className="text-[10px] text-slate-400">
                          {isImageUrl(att.url) ? 'รูปภาพ' : 'เอกสาร/ไฟล์'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (isImageUrl(att.url)) {
                          const imgIdx = imageAttachments.findIndex(img => img.url === att.url);
                          setLightboxInitialIndex(Math.max(0, imgIdx));
                          setShowAttachmentsListModal(false);
                          setShowPreviewLightbox(true);
                        } else {
                          window.open(toPublicAttachmentUrl(att.url), '_blank', 'noopener,noreferrer');
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
                    >
                      <span>เปิดดู</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
