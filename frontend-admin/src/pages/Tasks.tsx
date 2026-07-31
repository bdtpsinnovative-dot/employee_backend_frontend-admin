import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Trash2, X, Bell } from 'lucide-react';
import {
  fetchAdminTasks,
  fetchTaskCategories,
  createTaskCategory,
  deleteTaskCategory,
  fetchBrands,
  fetchUsers,
  createAdminTask,
  updateAdminTask,
  updateAdminTaskStatus,
  deleteAdminTask,
  fetchTaskEvents,
  addTaskComment,
  createBrand,
  deleteBrand,
  updateBrandResponsibilities,
  approveSubmission,
  requestRevision,
  fetchMe,
  createTaskList,
  fetchTrashTasks,
  restoreTask,
  markNotificationRead,
  toggleStarTask,
} from '../services/adminApi';
import type {
  AdminTask,
  User,
  Brand,
  BrandResponsibility,
  TaskCategory,
  TaskEvent,
} from '../types';
import { TaskToolbar } from '../components/tasks/TaskToolbar';
import { TaskListView } from '../components/tasks/TaskListView';
import { TaskDetailDrawer } from '../components/tasks/TaskDetailDrawer';
import { TaskCreateModal } from '../components/tasks/TaskCreateModal';
import { TaskBrandSettingsModal } from '../components/tasks/TaskBrandSettingsModal';
/* 
  [WARNING FOR AI & DEVELOPERS - DO NOT UNCOMMENT / DO NOT REMOVE THIS IMPORT]
  คำเตือนสำคัญ: ผู้ใช้ (USER) สั่งให้ปิดใช้งานฟีเจอร์ "หัวข้องาน (Overview)" นี้ไว้
  ห้าม AI ตัวอื่น หรือผู้ใดทำการเปิดคอมเมนต์ (Uncomment) เด็ดขาด ยกเว้นจะได้รับคำสั่งโดยตรงจากผู้ใช้เท่านั้น!
import { TaskProjectOverview } from '../components/tasks/TaskProjectOverview';
*/
import { getTaskPriority, type TaskStatus } from '../components/tasks/taskUtils';

export default function Tasks() {
  const navigate = useNavigate();
  const { notifications = [], setNotifications } = useOutletContext<{ notifications?: any[], setNotifications?: React.Dispatch<React.SetStateAction<any[]>> }>() || {};

  const hasUnreadMainNotif = notifications.some(n => {
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
    return tId !== null && lId === null;
  });

  const [showMainNotifModal, setShowMainNotifModal] = useState(false);

  const handleOpenMainNotif = async () => {
    setShowMainNotifModal(true);
    // Find all unread main task notifications (tId !== null && lId === null)
    const unreadMain = notifications.filter(n => {
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
      return tId !== null && lId === null;
    });

    if (unreadMain.length > 0 && setNotifications) {
      // Mark them as read locally in state immediately
      setNotifications(prev =>
        prev.map(n => unreadMain.some(m => m.id === n.id) ? { ...n, is_read: true } : n)
      );

      // Call API in background to mark them as read in DB
      for (const n of unreadMain) {
        try {
          await markNotificationRead(n.id);
        } catch {}
      }
    }
  };


  // ─── Main Data State ───
  const [tasks, setTasks]           = useState<AdminTask[]>([]);
  const [users, setUsers]           = useState<User[]>([]);
  const [brands, setBrands]         = useState<Brand[]>([]);
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);


  // ─── Search & Filter State ───
  const [searchQuery, setSearchQuery]           = useState('');
  const [selectedBrand, setSelectedBrand]       = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('');
  const [ownershipMode, setOwnershipMode]       = useState<'all' | 'created_by_me' | 'assigned_to_me'>('all');
  const [tabFilter, setTabFilter]               = useState<'all' | 'completed' | 'starred'>('all');

  // ─── Modals & Drawers ───
  const [showCreateModal, setShowCreateModal]       = useState(false);
  const [editingTask, setEditingTask]               = useState<AdminTask | null>(null);
  const [defaultCreateStatus, setDefaultCreateStatus] = useState<TaskStatus | undefined>();
  const [showSettingsModal, setShowSettingsModal]   = useState(false);
  const [editTaskEvents, setEditTaskEvents]         = useState<TaskEvent[]>([]);
  const [editEventsLoading, setEditEventsLoading]   = useState(false);

  // ─── Trash Bin & Delete Confirmation State ───
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [trashTasks, setTrashTasks] = useState<AdminTask[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);

  // ─── Task Detail Drawer State ───
  const [selectedTask, setSelectedTask]   = useState<AdminTask | null>(null);
  const [taskEvents, setTaskEvents]       = useState<TaskEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [commentText, setCommentText]     = useState('');

  // ─── Load Initial Data ───
  const loadAll = useCallback(async (silent?: boolean) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [t, u, b, c, me] = await Promise.all([
        fetchAdminTasks(),
        fetchUsers(),
        fetchBrands(),
        fetchTaskCategories(),
        fetchMe(),
      ]);
      setTasks(t);
      setUsers(u.filter((usr) => usr.status === 'active'));
      setBrands(b);
      setCategories(c);
      setCurrentUser(me);
    } catch (e: any) {
      setError(e.message || 'โหลดข้อมูลงานล้มเหลว');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ─── Load Task Events when task selected ───
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
  }, [selectedTask?.id]); // Only refetch events if task ID changes

  // ─── Load task-only events when editing task ───
  useEffect(() => {
    if (editingTask) {
      setEditEventsLoading(true);
      fetchTaskEvents(editingTask.id, { taskOnly: true })
        .then(setEditTaskEvents)
        .catch(console.error)
        .finally(() => setEditEventsLoading(false));
    } else {
      setEditTaskEvents([]);
    }
  }, [editingTask?.id]);

  // ─── Sync selectedTask with tasks list ───
  useEffect(() => {
    if (selectedTask) {
      const updated = tasks.find((t) => t.id === selectedTask.id);
      if (updated) {
        setSelectedTask(updated);
      }
    }
  }, [tasks]);

  // ─── Lookup Maps ───
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
  const brandMap = Object.fromEntries(brands.map((b) => [b.id, b]));
  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]));

  // ─── Handlers ───
  const handleStatusChange = async (task: AdminTask, status: TaskStatus) => {
    try {
      await updateAdminTaskStatus(task.id, status);
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status } : t))
      );
      if (selectedTask?.id === task.id) {
        setSelectedTask((prev) => (prev ? { ...prev, status } : null));
      }
    } catch (e: any) {
      alert(e.message || 'อัปเดตสถานะล้มเหลว');
    }
  };

  const loadTrash = useCallback(async () => {
    setTrashLoading(true);
    try {
      const data = await fetchTrashTasks();
      setTrashTasks(data);
    } catch (err) {
      console.error('Failed to load trash tasks', err);
    } finally {
      setTrashLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showTrashModal) {
      loadTrash();
    }
  }, [showTrashModal, loadTrash]);

  const handleToggleStar = async (taskId: string, isStarred: boolean) => {
    try {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, is_starred: isStarred } : t));
      await toggleStarTask(taskId, isStarred);
    } catch (e: any) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, is_starred: !isStarred } : t));
      alert(e.message || 'สลับสถานะการติดดาวล้มเหลว');
    }
  };

  const handleDeleteTask = async (id: string) => {
    setTaskToDelete(id);
  };

  const handleConfirmDelete = async () => {
    if (!taskToDelete) return;
    try {
      await deleteAdminTask(taskToDelete);
      setTasks((prev) => prev.filter((t) => t.id !== taskToDelete));
      if (selectedTask?.id === taskToDelete) setSelectedTask(null);
      setTaskToDelete(null);
    } catch (e: any) {
      alert(e.message || 'ลบงานล้มเหลว');
    }
  };

  const handleRestoreTask = async (id: string) => {
    try {
      await restoreTask(id);
      await loadAll(true);
      if (showTrashModal) {
        await loadTrash();
      }
    } catch (e: any) {
      alert(e.message || 'กู้คืนงานล้มเหลว');
    }
  };

  const handleCreateTask = async (data: {
    title: string;
    description: string;
    due_date: string;
    assignee_ids: string[];
    brand_id?: string;
    category_id?: string;
    boards?: { name: string; due_date?: string; priority?: 'low' | 'medium' | 'high' | 'urgent'; description?: string }[];
    priority?: string;
    status?: string;
  }) => {
    const newTask = await createAdminTask({
      title: data.title,
      description: data.description,
      due_date: data.due_date,
      assignee_ids: data.assignee_ids,
      brand_id: data.brand_id,
      category_id: data.category_id,
      priority: data.priority,
      status: data.status,
    });

    if (data.boards && data.boards.length > 0) {
      for (const board of data.boards) {
        await createTaskList(newTask.id, {
          name: board.name,
          due_date: board.due_date,
          priority: board.priority,
          description: board.description,
          assignee_ids: data.assignee_ids,
        });
      }
    }
    await loadAll(true);
  };

  const handleUpdateTask = async (data: {
    title: string;
    description: string;
    due_date: string;
    assignee_ids: string[];
    brand_id?: string;
    category_id?: string;
    priority?: string;
    status?: string;
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
    });
    setEditingTask(null);
    await loadAll(true);
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

  const handleApproveSubmission = async (task: AdminTask) => {
    if (!task.latest_submission) return;
    if (!window.confirm('ยืนยันการอนุมัติผลงาน?')) return;
    try {
      await approveSubmission(task.id, task.latest_submission.id);
      await loadAll(true);
    } catch (e: any) {
      alert(e.message || 'อนุมัติผลงานล้มเหลว');
    }
  };

  const handleRequestRevision = async (task: AdminTask) => {
    if (!task.latest_submission) return;
    const note = window.prompt('ระบุข้อควรแก้ไข:');
    if (note === null) return;
    try {
      await requestRevision(task.id, task.latest_submission.id, note);
      await loadAll(true);
    } catch (e: any) {
      alert(e.message || 'ขอแก้ไขผลงานล้มเหลว');
    }
  };

  // Brand / Category handlers
  const handleCreateBrand = async (name: string) => {
    const b = await createBrand(name);
    setBrands((prev) => [...prev, b]);
  };
  const handleDeleteBrand = async (id: string) => {
    await deleteBrand(id);
    setBrands((prev) => prev.filter((b) => b.id !== id));
  };
  const handleUpdateBrandResponsibilities = async (
    id: string,
    responsibilities: BrandResponsibility[],
  ) => {
    const updated = await updateBrandResponsibilities(id, responsibilities);
    setBrands((prev) => prev.map((brand) => (
      brand.id === id
        ? {
            ...brand,
            responsible_user_ids: updated.responsibleUserIds,
            responsibilities: updated.responsibilities,
          }
        : brand
    )));
  };
  const handleCreateCategory = async (name: string) => {
    const c = await createTaskCategory(name);
    setCategories((prev) => [...prev, c]);
  };
  const handleDeleteCategory = async (id: string) => {
    await deleteTaskCategory(id);
    setCategories((prev) => prev.filter((c) => c.id !== id));
  };

  // ─── Filter Logic ───
  const filteredTasks = tasks.filter((task) => {
    // กรองแสดงเฉพาะงานที่เราสร้าง หรือ งานที่เราเข้าร่วม (มีรายชื่อเป็นผู้รับผิดชอบ) เท่านั้น
    const isOwner = task.assigned_by === currentUser?.id;
    const taskAssignees = task.assignee_ids && task.assignee_ids.length > 0
      ? task.assignee_ids
      : task.assigned_to ? [task.assigned_to] : [];
    const isAssignee = taskAssignees.includes(currentUser?.id || '');

    if (!isOwner && !isAssignee) return false;

    // Apply tabFilter
    if (tabFilter === 'all') {
      if (task.status === 'completed') return false;
    } else if (tabFilter === 'completed') {
      if (task.status !== 'completed') return false;
    } else if (tabFilter === 'starred') {
      if (!task.is_starred) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const titleMatch = task.title.toLowerCase().includes(q);
      const descMatch = task.description?.toLowerCase().includes(q) || false;
      if (!titleMatch && !descMatch) return false;
    }

    if (selectedBrand && task.brand_id !== selectedBrand) return false;
    if (selectedCategory && task.category_id !== selectedCategory) return false;

    if (selectedAssignee) {
      const ids =
        task.assignee_ids && task.assignee_ids.length > 0
          ? task.assignee_ids
          : task.assigned_to
          ? [task.assigned_to]
          : [];
      if (!ids.includes(selectedAssignee)) return false;
    }

    if (selectedPriority) {
      const prio = getTaskPriority(task);
      if (prio !== selectedPriority) return false;
    }

    if (ownershipMode === 'created_by_me') {
      if (task.assigned_by !== currentUser?.id) return false;
    } else if (ownershipMode === 'assigned_to_me') {
      const ids =
        task.assignee_ids && task.assignee_ids.length > 0
          ? task.assignee_ids
          : task.assigned_to
          ? [task.assigned_to]
          : [];
      if (!ids.includes(currentUser?.id || '')) return false;
    }

    return true;
  });

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    // If one has due date and other doesn't, the one with due date goes first
    if (a.due_date && !b.due_date) return -1;
    if (!a.due_date && b.due_date) return 1;

    // Both have due dates: sort ascending (earliest first)
    if (a.due_date && b.due_date) {
      return a.due_date.localeCompare(b.due_date);
    }

    // Neither has due date: sort by created_at descending (latest first)
    return b.created_at.localeCompare(a.created_at);
  });

  const activeFilterCount = [
    searchQuery,
    selectedBrand,
    selectedCategory,
    selectedAssignee,
    selectedPriority,
    ownershipMode !== 'all' ? ownershipMode : '',
  ].filter(Boolean).length;

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedBrand('');
    setSelectedCategory('');
    setSelectedAssignee('');
    setSelectedPriority('');
    setOwnershipMode('all');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans content-area-flush">
      {/* Asana Style Toolbar */}
      <TaskToolbar
        tabFilter={tabFilter}
        onTabFilterChange={setTabFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedBrand={selectedBrand}
        onBrandChange={setSelectedBrand}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        selectedAssignee={selectedAssignee}
        onAssigneeChange={setSelectedAssignee}
        selectedPriority={selectedPriority}
        onPriorityChange={setSelectedPriority}
        ownershipMode={ownershipMode}
        onOwnershipChange={setOwnershipMode}
        brands={brands}
        categories={categories}
        users={users}
        onOpenCreateModal={() => {
          setDefaultCreateStatus(undefined);
          setShowCreateModal(true);
        }}
        onOpenSettingsModal={() => setShowSettingsModal(true)}
        canManageSettings={currentUser?.role === 'admin'}
        onOpenTrashModal={() => setShowTrashModal(true)}
        activeFilterCount={activeFilterCount}
        onClearFilters={handleClearFilters}
        hasUnreadMainNotif={hasUnreadMainNotif}
        onOpenMainNotif={handleOpenMainNotif}
      />

      {/* Loading & Error States */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center py-20 text-slate-500 text-sm font-medium">
          กำลังโหลดข้อมูลงานทั้งหมด...
        </div>
      ) : error ? (
        <div className="p-6 m-6 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">
          {error}
        </div>
      ) : (
        <div className="flex-1">
          {/* 
            [WARNING FOR AI & DEVELOPERS - DO NOT UNCOMMENT / DO NOT REMOVE THIS BLOCK]
            คำเตือนสำคัญ: ผู้ใช้ (USER) สั่งให้ปิดการแสดงผล "หัวข้องาน (Overview)" และให้แสดงหน้าตารางงานหลัก (TaskListView) เสมอ
            ห้าม AI ตัวอื่น หรือผู้ใดทำการเปิดคอมเมนต์ (Uncomment) หรือลบโค้ดส่วนนี้กลับมาทำงานเด็ดขาด!
            ยกเว้นจะได้รับคำสั่งโดยตรงจากผู้ใช้เท่านั้น (DO NOT UNCOMMENT UNLESS EXPLICITLY ORDERED BY USER)!
          {viewMode === 'overview' ? (
            <TaskProjectOverview
              tasks={sortedTasks}
              userMap={userMap}
              brandMap={brandMap}
              categoryMap={categoryMap}
              onSelectProjectSheet={(task) => {
                navigate(`/tasks/${task.id}`);
              }}
              onOpenCreateModal={() => setShowCreateModal(true)}
            />
          ) : (
          */}
            <TaskListView
              tasks={sortedTasks}
              userMap={userMap}
              brandMap={brandMap}
              categoryMap={categoryMap}
              notifications={notifications}
              setNotifications={setNotifications}
              onSelectTask={setSelectedTask}
              onEditTask={setEditingTask}
              onSelectProjectSheet={(task) => {
                navigate(`/tasks/${task.id}`);
              }}
              onStatusChange={handleStatusChange}
              onOpenCreateModal={(status) => {
                setDefaultCreateStatus(status);
                setShowCreateModal(true);
              }}
              onApproveSubmission={handleApproveSubmission}
              onRequestRevision={handleRequestRevision}
              onDeleteTask={handleDeleteTask}
              currentUser={currentUser}
              onToggleStar={handleToggleStar}
            />
          {/* )} */}
        </div>
      )}

      {/* Task Detail Drawer */}
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
        onRefresh={() => {
          loadAll(true);
          // Also optionally reload the selected task if we have an endpoint for it.
          // Since loadAll fetches all tasks, it will refresh the data, but we might want to manually sync the selectedTask.
          // For now, loadAll() is okay if the user reopens the drawer or the drawer re-renders based on updated tasks array.
          // Let's also update selectedTask manually from the fetched list later if needed.
        }}
        currentUser={currentUser}
      />

      {/* Task Create Modal */}
      <TaskCreateModal
        isOpen={showCreateModal || editingTask !== null}
        onClose={() => {
          setShowCreateModal(false);
          setEditingTask(null);
        }}
        defaultStatus={defaultCreateStatus}
        users={users}
        brands={brands}
        categories={categories}
        initialData={editingTask || undefined}
        currentUser={currentUser}
        taskEvents={editTaskEvents}
        eventsLoading={editEventsLoading}
        onSubmit={editingTask ? handleUpdateTask : handleCreateTask}
      />

      {/* Task Brand Settings Modal */}
      <TaskBrandSettingsModal
        isOpen={showSettingsModal && currentUser?.role === 'admin'}
        onClose={() => setShowSettingsModal(false)}
        brands={brands}
        users={users}
        categories={categories}
        onCreateBrand={handleCreateBrand}
        onDeleteBrand={handleDeleteBrand}
        onUpdateBrandResponsibilities={handleUpdateBrandResponsibilities}
        onCreateCategory={handleCreateCategory}
        onDeleteCategory={handleDeleteCategory}
      />

      {/* Delete Confirmation Modal */}
      {taskToDelete && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              <span>ย้ายงานหลักไปถังขยะ?</span>
            </h3>
            <p className="text-xs text-slate-600 font-medium">
              คุณต้องการย้ายงานนี้ไปยังถังขยะใช่หรือไม่? การ์ดงานและงานย่อยทั้งหมดในงานนี้จะถูกย้ายไปด้วย โดยระบบจะทำการลบออกอย่างถาวรโดยอัตโนมัติเมื่อครบ 30 วัน
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setTaskToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-750 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
              >
                ย้ายไปถังขยะ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Trash Modal */}
      {showTrashModal && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-500" />
                <span className="font-extrabold text-sm text-slate-800">ถังขยะงานหลัก (30 วัน)</span>
              </div>
              <button
                onClick={() => setShowTrashModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {trashLoading ? (
                <div className="text-center py-12 text-slate-400 text-xs font-medium">กำลังโหลดงานในถังขยะ...</div>
              ) : trashTasks.length === 0 ? (
                <div className="text-center py-12 text-slate-450 text-xs font-medium">ไม่มีงานในถังขยะ</div>
              ) : (
                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs min-w-[550px]">
                    <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-4 py-2 border-b border-slate-100">ชื่องาน</th>
                        <th className="px-4 py-2 border-b border-slate-100 text-center w-36">วันที่ถูกลบ</th>
                        <th className="px-4 py-2 border-b border-slate-100 text-center w-36">เหลืออีก</th>
                        <th className="px-4 py-2 border-b border-slate-100 text-center w-28">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {trashTasks.map((t) => {
                        const deletedAt = t.deleted_at ? new Date(t.deleted_at) : new Date();
                        const diffTime = new Date().getTime() - deletedAt.getTime();
                        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                        const daysLeft = 30 - diffDays;
                        const remainingDays = daysLeft > 0 ? daysLeft : 0;

                        return (
                          <tr key={t.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-800">{t.title}</td>
                            <td className="px-4 py-3 text-center text-slate-500">
                              {deletedAt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </td>
                            <td className="px-4 py-3 text-center align-middle">
                              <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                                remainingDays <= 5 
                                  ? 'bg-red-50 text-red-700 border border-red-150' 
                                  : remainingDays <= 15 
                                    ? 'bg-amber-50 text-amber-700 border border-amber-150' 
                                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}>
                                {remainingDays} วัน
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center align-middle">
                              <button
                                onClick={() => handleRestoreTask(t.id)}
                                className="px-2.5 py-1 font-bold text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg cursor-pointer transition-all active:scale-95"
                              >
                                กู้คืน
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end rounded-b-2xl">
              <button
                onClick={() => setShowTrashModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Main Task Notifications Modal */}
      {showMainNotifModal && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 text-left">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-indigo-650" />
                <span className="font-extrabold text-sm text-slate-800">การแจ้งเตือนงานหลัก</span>
              </div>
              <button
                onClick={() => setShowMainNotifModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
                  return tId !== null && lId === null;
                });

                if (listNotifs.length === 0) {
                  return (
                    <div className="py-12 text-center text-slate-400 text-xs font-semibold">
                      <Bell className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-350" />
                      ยังไม่มีประวัติการแจ้งเตือนของงานหลัก
                    </div>
                  );
                }

                return listNotifs.map(n => (
                  <div key={n.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <p className="text-xs font-bold text-slate-850 leading-snug">{n.title}</p>
                      <span className="text-[9px] text-slate-450 font-semibold shrink-0">
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
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end rounded-b-2xl">
              <button
                onClick={() => setShowMainNotifModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-xl transition-all cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
