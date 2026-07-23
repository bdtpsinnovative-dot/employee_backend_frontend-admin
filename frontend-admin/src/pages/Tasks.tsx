import { useState, useEffect, useCallback } from 'react';
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
  approveSubmission,
  requestRevision,
} from '../services/adminApi';
import type { AdminTask, User, Brand, TaskCategory, TaskEvent } from '../types';
import { TaskToolbar } from '../components/tasks/TaskToolbar';
import { TaskListView } from '../components/tasks/TaskListView';
import { TaskBoardView } from '../components/tasks/TaskBoardView';
import { TaskDetailDrawer } from '../components/tasks/TaskDetailDrawer';
import { TaskCreateModal } from '../components/tasks/TaskCreateModal';
import { TaskBrandSettingsModal } from '../components/tasks/TaskBrandSettingsModal';
import { getTaskPriority, type TaskStatus } from '../components/tasks/taskUtils';

export default function Tasks() {
  // ─── Main Data State ───
  const [tasks, setTasks]           = useState<AdminTask[]>([]);
  const [users, setUsers]           = useState<User[]>([]);
  const [brands, setBrands]         = useState<Brand[]>([]);
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // ─── UI & View State ───
  const [viewMode, setViewMode]     = useState<'list' | 'board'>('board');

  // ─── Search & Filter State ───
  const [searchQuery, setSearchQuery]           = useState('');
  const [selectedBrand, setSelectedBrand]       = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('');

  // ─── Modals & Drawers ───
  const [showCreateModal, setShowCreateModal]       = useState(false);
  const [editingTask, setEditingTask]               = useState<AdminTask | null>(null);
  const [defaultCreateStatus, setDefaultCreateStatus] = useState<TaskStatus | undefined>();
  const [showSettingsModal, setShowSettingsModal]   = useState(false);

  // ─── Task Detail Drawer State ───
  const [selectedTask, setSelectedTask]   = useState<AdminTask | null>(null);
  const [taskEvents, setTaskEvents]       = useState<TaskEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [commentText, setCommentText]     = useState('');

  // ─── Load Initial Data ───
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, u, b, c] = await Promise.all([
        fetchAdminTasks(),
        fetchUsers(),
        fetchBrands(),
        fetchTaskCategories(),
      ]);
      setTasks(t);
      setUsers(u.filter((usr) => usr.status === 'active'));
      setBrands(b);
      setCategories(c);
    } catch (e: any) {
      setError(e.message || 'โหลดข้อมูลงานล้มเหลว');
    } finally {
      setLoading(false);
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

  const handleDeleteTask = async (id: string) => {
    if (!confirm('คุณต้องการลบงานนี้หรือไม่?')) return;
    try {
      await deleteAdminTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (selectedTask?.id === id) setSelectedTask(null);
    } catch (e: any) {
      alert(e.message || 'ลบงานล้มเหลว');
    }
  };

  const handleCreateTask = async (data: {
    title: string;
    description: string;
    due_date: string;
    assignee_ids: string[];
    brand_id?: string;
    category_id?: string;
    sub_items?: string[];
  }) => {
    await createAdminTask({
      title: data.title,
      description: data.description,
      due_date: data.due_date,
      assignee_ids: data.assignee_ids,
      brand_id: data.brand_id,
      category_id: data.category_id,
      sub_items: data.sub_items,
    });
    await loadAll();
  };

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
      await loadAll();
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
      await loadAll();
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

    return true;
  });

  const activeFilterCount = [
    searchQuery,
    selectedBrand,
    selectedCategory,
    selectedAssignee,
    selectedPriority,
  ].filter(Boolean).length;

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedBrand('');
    setSelectedCategory('');
    setSelectedAssignee('');
    setSelectedPriority('');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Asana Style Toolbar */}
      <TaskToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
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
        brands={brands}
        categories={categories}
        users={users}
        onOpenCreateModal={() => {
          setDefaultCreateStatus(undefined);
          setShowCreateModal(true);
        }}
        onOpenSettingsModal={() => setShowSettingsModal(true)}
        activeFilterCount={activeFilterCount}
        onClearFilters={handleClearFilters}
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
          {viewMode === 'board' ? (
            <TaskBoardView
              tasks={filteredTasks}
              userMap={userMap}
              brandMap={brandMap}
              onSelectTask={setSelectedTask}
              onStatusChange={handleStatusChange}
              onOpenCreateModal={(status) => {
                setDefaultCreateStatus(status);
                setShowCreateModal(true);
              }}
            />
          ) : (
            <TaskListView
              tasks={filteredTasks}
              userMap={userMap}
              brandMap={brandMap}
              categoryMap={categoryMap}
              onSelectTask={setSelectedTask}
              onStatusChange={handleStatusChange}
              onOpenCreateModal={(status) => {
                setDefaultCreateStatus(status);
                setShowCreateModal(true);
              }}
              onApproveSubmission={handleApproveSubmission}
              onRequestRevision={handleRequestRevision}
            />
          )}
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
          loadAll();
          // Also optionally reload the selected task if we have an endpoint for it.
          // Since loadAll fetches all tasks, it will refresh the data, but we might want to manually sync the selectedTask.
          // For now, loadAll() is okay if the user reopens the drawer or the drawer re-renders based on updated tasks array.
          // Let's also update selectedTask manually from the fetched list later if needed.
        }}
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
        onSubmit={editingTask ? handleUpdateTask : handleCreateTask}
      />

      {/* Task Brand Settings Modal */}
      <TaskBrandSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        brands={brands}
        categories={categories}
        onCreateBrand={handleCreateBrand}
        onDeleteBrand={handleDeleteBrand}
        onCreateCategory={handleCreateCategory}
        onDeleteCategory={handleDeleteCategory}
      />
    </div>
  );
}
