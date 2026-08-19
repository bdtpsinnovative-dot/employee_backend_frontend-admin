import React, { useState } from 'react';
import { X, Plus, Trash2, Calendar, User, Check, Lock, Tag, Folder, AlignLeft, LayoutGrid, Clock, Activity, Flame, CheckCircle2 } from 'lucide-react';
import type { User as UserType, Brand, TaskCategory, AdminTask, TaskEvent } from '../../types';
import type { TaskStatus } from './taskUtils';
import { avatarUrl } from './taskUtils';
import {
  getVisibleBrandResponsibilityGroups,
  getAutoBrandAssigneeIDs,
} from './brandResponsibility';

interface TaskCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultStatus?: TaskStatus;
  users: UserType[];
  brands: Brand[];
  categories: TaskCategory[];
  initialData?: AdminTask;
  currentUser?: UserType | null;
  onRefreshUsers?: () => Promise<void>;
  taskEvents?: TaskEvent[];
  eventsLoading?: boolean;
  onDelete?: (id: string) => void;
  onSubmit: (data: {
    title: string;
    description: string;
    due_date: string;
    assignee_ids: string[];
    brand_id?: string;
    category_id?: string;
    boards?: { name: string; description?: string }[];
    priority?: string;
    status?: string;
  }) => Promise<void>;
}

interface BoardInput {
  name: string;
  due_date: string;
  priority: 'low' | 'medium' | 'high';
  description: string;
}

const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const TaskCreateModal: React.FC<TaskCreateModalProps> = ({
  isOpen,
  onClose,
  defaultStatus,
  users,
  brands,
  categories,
  initialData,
  currentUser,
  onRefreshUsers,
  taskEvents = [],
  eventsLoading = false,
  onDelete,
  onSubmit,
}) => {
  const [title, setTitle] = useState(initialData?.title || '');
  const [desc, setDesc] = useState(initialData?.description || '');
  const [dueDate, setDueDate] = useState(
    initialData?.due_date ? initialData.due_date.split('T')[0] : getTodayStr()
  );
  
  const initialAssignees = initialData?.assignee_ids && initialData.assignee_ids.length > 0
    ? initialData.assignee_ids
    : initialData?.assigned_to ? [initialData.assigned_to] : [];
    
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>(initialAssignees);
  const [autoBrandAssigneeIds, setAutoBrandAssigneeIds] = useState<string[]>([]);
  const [lockedAssigneeIds, setLockedAssigneeIds] = useState<string[]>([]);
  const [brandId, setBrandId] = useState(initialData?.brand_id || '');
  const [categoryId, setCategoryId] = useState(initialData?.category_id || '');
  const [priority, setPriority] = useState<string>(initialData?.priority || 'low');
  const [status, setStatus] = useState<string>(initialData?.status || defaultStatus || 'pending');
  
  // Replace subItems with boards
  const [boards, setBoards] = useState<BoardInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form');
  
  // Assignee Popover state
  const [showInvitePopover, setShowInvitePopover] = useState(false);
  const [refreshingUsers, setRefreshingUsers] = useState(false);
  
  // Custom Alert inside modal to avoid native alert
  const [modalAlert, setModalAlert] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setTitle(initialData?.title || '');
      setDesc(initialData?.description || '');
      setDueDate(initialData?.due_date ? initialData.due_date.split('T')[0] : getTodayStr());
      const initAssignees = initialData?.assignee_ids && initialData.assignee_ids.length > 0
        ? initialData.assignee_ids
        : initialData?.assigned_to ? [initialData.assigned_to] : [];
      const currentUserAssigneeIds = !initialData && currentUser?.id ? [currentUser.id] : [];
      setSelectedAssignees(Array.from(new Set([...currentUserAssigneeIds, ...initAssignees])));
      setAutoBrandAssigneeIds([]);
      setLockedAssigneeIds(currentUserAssigneeIds);
      setBrandId(initialData?.brand_id || '');
      setCategoryId(initialData?.category_id || '');
      setPriority(initialData?.priority || 'low');
      setStatus(initialData?.status || defaultStatus || 'pending');
      setModalAlert(null);
      setActiveTab('form');
      
      if (!initialData) {
        setBoards([]);
      } else {
        setBoards([]); 
      }
    }
  }, [isOpen, initialData, defaultStatus, currentUser?.id]);

  if (!isOpen) return null;

  const handleAddBoard = () => setBoards(prev => [...prev, { name: '', due_date: '', priority: 'medium', description: '' }]);
  
  const handleUpdateBoard = (index: number, field: keyof BoardInput, value: string) => {
    setBoards(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleRemoveBoard = (index: number) => {
    setBoards(prev => prev.filter((_, i) => i !== index));
  };

  const handleBrandChange = (nextBrandId: string) => {
    if (initialData) {
      setBrandId(nextBrandId);
      return;
    }
    const nextBrand = brands.find(brand => brand.id === nextBrandId);
    const activeMappedAssigneeIds = getAutoBrandAssigneeIDs(nextBrand, users, currentUser);

    const manualAssigneeIds = selectedAssignees.filter(
      id => !autoBrandAssigneeIds.includes(id),
    );
    const newlyAutoAddedIds = activeMappedAssigneeIds.filter(
      id => !manualAssigneeIds.includes(id),
    );
    setSelectedAssignees(Array.from(new Set([
      ...manualAssigneeIds,
      ...newlyAutoAddedIds,
    ])));
    setAutoBrandAssigneeIds(newlyAutoAddedIds);
    setBrandId(nextBrandId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) {
      setModalAlert('กรุณากรอกชื่องานและกำหนดวันส่ง');
      return;
    }
    if (selectedAssignees.length === 0) {
      setModalAlert('กรุณาเลือกผู้รับผิดชอบอย่างน้อย 1 คน หรือเลือกมอบหมายให้ทีม');
      return;
    }

    setLoading(true);
    try {
      const validBoards = boards
        .map(b => ({
          name: b.name.trim(),
          due_date: b.due_date || undefined,
          priority: b.priority,
          description: b.description.trim() || undefined
        }))
        .filter(b => b.name);

      await onSubmit({
        title: title.trim(),
        description: desc.trim(),
        due_date: dueDate,
        assignee_ids: selectedAssignees,
        brand_id: brandId || undefined,
        category_id: categoryId || undefined,
        boards: validBoards.length > 0 ? validBoards : undefined,
        priority: priority,
        status: status,
      });

      // Reset form
      setTitle(''); setDesc(''); setDueDate('');
      setSelectedAssignees([]); setBrandId(''); setCategoryId('');
      setLockedAssigneeIds([]);
      setPriority('low'); setStatus('pending');
      setBoards([{ name: '', due_date: '', priority: 'medium', description: '' }]);
      onClose();
    } catch (e: any) {
      setModalAlert(e.message || 'สร้างงานล้มเหลว');
    } finally {
      setLoading(false);
    }
  };

  // Candidates are all users that are not already selected
  const candidates = users
    .filter(u => !selectedAssignees.includes(u.id));

  const handleOpenAssigneePicker = async () => {
    setShowInvitePopover(true);
    if (!onRefreshUsers) return;

    setRefreshingUsers(true);
    try {
      await onRefreshUsers();
    } catch (error: any) {
      setModalAlert(error?.message || 'โหลดรายชื่อพนักงานล้มเหลว');
    } finally {
      setRefreshingUsers(false);
    }
  };

  const selectedBrand = brands.find(brand => brand.id === brandId);
  const brandResponsibilityGroups = getVisibleBrandResponsibilityGroups(selectedBrand, users, currentUser);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={onClose} />

      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden transform transition-all animate-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h2 className="text-sm font-bold text-slate-800">
              {initialData ? 'แก้ไขรายละเอียดงาน' : 'มอบหมายงานใหม่'}
            </h2>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-full transition-colors text-slate-500 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tabs - only when editing */}
          {initialData && (
            <div className="flex border-b border-slate-200 bg-slate-50 px-4">
              <button
                type="button"
                onClick={() => setActiveTab('form')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  activeTab === 'form'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <AlignLeft className="w-3.5 h-3.5" />
                รายละเอียด
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  activeTab === 'history'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                ประวัติกิจกรรม
                {taskEvents.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-bold">{taskEvents.length}</span>
                )}
              </button>
            </div>
          )}

          {/* Form (hidden when history tab is active) */}
          {(!initialData || activeTab === 'form') && (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
            {/* Modal Error Alert */}
            {modalAlert && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-semibold flex items-center justify-between">
                <span>{modalAlert}</span>
                <button type="button" onClick={() => setModalAlert(null)} className="text-rose-400 hover:text-rose-600 font-bold">✕</button>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">ชื่องาน *</label>
              <input
                type="text"
                required
                placeholder="เช่น ทำรายงานสรุปยอดขายประจำสัปดาห์..."
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                <AlignLeft className="w-3.5 h-3.5 text-slate-400" />
                <span>รายละเอียดเพิ่มเติม</span>
              </label>
              <textarea
                rows={2}
                placeholder="รายละเอียดเพิ่มเติมของงาน..."
                value={desc}
                onChange={e => setDesc(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
              />
            </div>

            {/* Assignees Selector (Circular Avatars) */}
            <div>
              <label className="block font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>ผู้รับผิดชอบ</span>
              </label>

              <div className="flex flex-wrap items-center gap-2">
                {/* Selected Avatars */}
                {selectedAssignees.map(uid => {
                  const u = users.find(usr => usr.id === uid);
                  if (!u) return null;
                  const isAutoAssigned = autoBrandAssigneeIds.includes(u.id);
                  const isLocked = isAutoAssigned || lockedAssigneeIds.includes(u.id);
                  return (
                    <div key={u.id} className="relative group">
                      <img
                        src={avatarUrl(u.avatar_url) || undefined}
                        alt={u.nickname || u.first_name}
                        className="w-8 h-8 rounded-full object-cover border-2 border-white shadow-xs"
                        title={isAutoAssigned ? `${u.nickname || u.first_name} (ผู้เกี่ยวข้องอัตโนมัติ)` : (u.nickname || u.first_name)}
                      />
                      {isLocked ? (
                        <span
                          className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 text-indigo-600 shadow-sm"
                          title="ผู้เกี่ยวข้องอัตโนมัติ ลบไม่ได้"
                        >
                          <Lock className="h-2.5 w-2.5" />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAssignees(prev => prev.filter(id => id !== u.id));
                            setAutoBrandAssigneeIds(prev => prev.filter(id => id !== u.id));
                          }}
                          className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-slate-200 bg-white text-rose-500 shadow-sm hover:text-rose-700 cursor-pointer"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Add Assignee Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (showInvitePopover) {
                      setShowInvitePopover(false);
                      return;
                    }
                    void handleOpenAssigneePicker();
                  }}
                  disabled={refreshingUsers}
                  className="w-8 h-8 rounded-full border-2 border-dashed border-slate-300 hover:border-indigo-500 hover:bg-indigo-50 flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-all cursor-pointer"
                  title="เลือกผู้รับผิดชอบ"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Popover list of candidates */}
              {showInvitePopover && (
                <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 max-h-40 overflow-y-auto">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    {refreshingUsers ? 'กำลังโหลดรายชื่อพนักงาน...' : 'เลือกมอบหมายผู้รับผิดชอบงาน:'}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {candidates.length > 0 ? (
                      candidates.map(u => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setSelectedAssignees(prev => [...prev, u.id]);
                          }}
                          className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 shadow-2xs transition-all hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 active:scale-95 cursor-pointer"
                        >
                          <img
                            src={avatarUrl(u.avatar_url) || undefined}
                            alt={u.nickname || u.first_name}
                            className="h-8 w-8 rounded-full border border-white object-cover shadow-sm"
                          />
                          <span>{u.nickname || u.first_name}</span>
                        </button>
                      ))
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">
                        ไม่พบรายชื่อพนักงานเพิ่มเติม
                      </span>
                    )}
                  </div>
                </div>
              )}
              

            </div>

            {/* Grid Row: Due Date, Brand, Category */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Due Date */}
              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>วันครบกำหนด *</span>
                </label>
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
                />
              </div>

              {/* Brand */}
              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-slate-400" />
                  <span>แบรนด์</span>
                </label>
                <select
                  value={brandId}
                  onChange={e => handleBrandChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
                >
                  <option value="">-- เลือกแบรนด์ --</option>
                  {brands.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                {!initialData && autoBrandAssigneeIds.length > 0 && (
                  <p className="mt-1 text-[9px] font-medium text-emerald-600">
                    เพิ่มผู้เกี่ยวข้องกับแบรนด์แล้ว {autoBrandAssigneeIds.length} คน
                  </p>
                )}
              </div>

              {/* Category */}
              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Folder className="w-3.5 h-3.5 text-slate-400" />
                  <span>หมวดหมู่</span>
                </label>
                <select
                  value={categoryId}
                  onChange={e => setCategoryId(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
                >
                  <option value="">-- เลือกหมวดหมู่ --</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {!initialData && brandId && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="m-0 text-[11px] font-bold text-slate-700">ผู้เกี่ยวข้องกับแบรนด์</p>
                    <p className="m-0 mt-0.5 text-[9px] text-slate-400">ระบบเลือกทีมก่อนหน้าทีมของคุณอัตโนมัติ ส่วนทีมของคุณเลือกเพิ่มเองได้</p>
                  </div>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700">
                    เฉพาะบัญชีที่ใช้งานอยู่
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {brandResponsibilityGroups.map(group => (
                    <div key={group.type} className="rounded-lg border border-slate-200 bg-white p-2.5">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-extrabold ${
                          group.type === 'bd'
                            ? 'bg-blue-50 text-blue-700'
                            : group.type === 'mkt'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-violet-50 text-violet-700'
                        }`}>
                          {group.label}
                        </span>
                        <span className="text-[9px] font-medium text-slate-400">{group.users.length} คน</span>
                      </div>
                      {group.users.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {group.users.map(user => {
                            const imageURL = avatarUrl(user.avatar_url);
                            const isSelected = selectedAssignees.includes(user.id);
                            return (
                              <button
                                key={user.id}
                                type="button"
                                onClick={() => {
                                  const isLocked = autoBrandAssigneeIds.includes(user.id) || lockedAssigneeIds.includes(user.id);
                                  if (isSelected && isLocked) return;
                                  setSelectedAssignees(current => current.includes(user.id)
                                    ? current.filter(id => id !== user.id)
                                    : [...current, user.id]);
                                  if (isSelected) {
                                    setAutoBrandAssigneeIds(current => current.filter(id => id !== user.id));
                                  }
                                }}
                                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border py-1 pl-1 pr-2 text-[9px] font-semibold transition-colors ${
                                  isSelected
                                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/60'
                                } ${isSelected && (autoBrandAssigneeIds.includes(user.id) || lockedAssigneeIds.includes(user.id)) ? 'cursor-not-allowed opacity-90' : ''}`}
                                aria-pressed={isSelected}
                                title={isSelected && (autoBrandAssigneeIds.includes(user.id) || lockedAssigneeIds.includes(user.id))
                                  ? `${user.nickname || user.first_name} (ผู้เกี่ยวข้องอัตโนมัติ ลบไม่ได้)`
                                  : isSelected ? `ยกเลิก ${user.nickname || user.first_name}` : `เลือก ${user.nickname || user.first_name}`}
                              >
                                {imageURL ? (
                                  <img src={imageURL} alt="" className="h-4 w-4 rounded-full object-cover" />
                                ) : (
                                  <span className="grid h-4 w-4 place-items-center rounded-full bg-slate-200 text-[8px] font-bold text-slate-600">
                                    {(user.nickname || user.first_name || '?').charAt(0).toUpperCase()}
                                  </span>
                                )}
                                {user.nickname || user.first_name}
                                {isSelected && <Check className="h-3 w-3" aria-hidden="true" />}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-[9px] text-slate-400">ยังไม่มีผู้รับผิดชอบในระบบ</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Grid Row 2: Priority, Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {/* Priority */}
              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-slate-400" />
                  <span>ความสำคัญ (Priority)</span>
                </label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-bold"
                >
                  <option value="urgent">🔥 งานด่วนมาก (Urgent)</option>
                  <option value="high">🟠 งานด่วน (High)</option>
                  <option value="medium">⚡ งานด่วนปานกลาง (Medium)</option>
                  <option value="low">🌱 งานไม่รีบ (Low)</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>สถานะ (Status)</span>
                </label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-bold"
                >
                  <option value="pending">รอทำ (Pending)</option>
                  <option value="in_progress">กำลังทำ (In Progress)</option>
                  <option value="in_review">รอตรวจ (In Review)</option>
                  <option value="completed">เสร็จสิ้น (Completed)</option>
                </select>
              </div>
            </div>

            {/* Board Items (บอร์ดงาน) - Only show in create mode */}
            {!initialData && (
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 flex items-center gap-1">
                    <LayoutGrid className="w-3.5 h-3.5 text-slate-400" />
                    <span>บอร์ดงานเริ่มต้น</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAddBoard}
                    className="text-indigo-600 hover:underline flex items-center gap-0.5 font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>เพิ่มบอร์ดงาน</span>
                  </button>
                </div>

                <div className="space-y-3 max-h-40 overflow-y-auto pr-1">
                  {boards.map((board, idx) => (
                    <div key={idx} className="flex gap-2 items-start bg-slate-50 p-2.5 rounded-xl border border-slate-150 relative">
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          placeholder={`ชื่อบอร์ดงานที่ ${idx + 1}`}
                          value={board.name}
                          onChange={e => handleUpdateBoard(idx, 'name', e.target.value)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 font-bold"
                        />
                        <textarea
                          rows={2}
                          placeholder="รายละเอียดเพิ่มเติมของบอร์ดงาน..."
                          value={board.description}
                          onChange={e => handleUpdateBoard(idx, 'description', e.target.value)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 text-xs font-normal"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <input
                              type="date"
                              value={board.due_date}
                              onChange={e => handleUpdateBoard(idx, 'due_date', e.target.value)}
                              className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 text-[11px]"
                            />
                          </div>
                          <div>
                            <select
                              value={board.priority}
                              onChange={e => handleUpdateBoard(idx, 'priority', e.target.value as any)}
                              className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 text-[11px]"
                            >
                              <option value="urgent">🔥 งานด่วนมาก (Urgent)</option>
                              <option value="high">🟠 งานด่วน (High)</option>
                              <option value="medium">⚡ งานด่วนปานกลาง (Medium)</option>
                              <option value="low">🌱 งานไม่รีบ (Low)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      {boards.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveBoard(idx)}
                          className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer self-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-200">
              {initialData && onDelete ? (
                <button
                  type="button"
                  onClick={() => onDelete(initialData.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  ลบงาน
                </button>
              ) : <span />}
              <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs cursor-pointer"
              >
                {loading ? 'กำลังบันทึก...' : initialData ? 'บันทึกการแก้ไข' : 'สร้างงาน'}
              </button>
              </div>
            </div>
          </form>
          )}

          {/* Activity History Tab */}
          {initialData && activeTab === 'history' && (
            <div className="p-5 max-h-[480px] overflow-y-auto">
              {eventsLoading ? (
                <div className="flex items-center justify-center py-12 text-slate-400">
                  <div className="w-5 h-5 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin mr-2" />
                  <span className="text-xs">กำลังโหลดประวัติ...</span>
                </div>
              ) : taskEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Activity className="w-10 h-10 mb-2 opacity-30" />
                  <p className="text-xs font-medium">ยังไม่มีประวัติกิจกรรม</p>
                </div>
              ) : (
                <ol className="relative border-l-2 border-slate-100 ml-2 space-y-4">
                  {taskEvents.map((ev) => {
                    const actionLabel: Record<string, { label: string; color: string; dot: string }> = {
                      task_created:       { label: 'สร้างงาน',              color: 'text-emerald-700 bg-emerald-50 border-emerald-200',   dot: 'bg-emerald-400' },
                      task_updated:       { label: 'แก้ไขงาน',              color: 'text-blue-700 bg-blue-50 border-blue-200',           dot: 'bg-blue-400' },
                      task_status_changed:{ label: 'เปลี่ยนสถานะ',         color: 'text-violet-700 bg-violet-50 border-violet-200',     dot: 'bg-violet-400' },
                      task_deleted:       { label: 'ย้ายไปถังขยะ',         color: 'text-red-700 bg-red-50 border-red-200',             dot: 'bg-red-400' },
                      task_restored:      { label: 'กู้คืนจากถังขยะ',     color: 'text-amber-700 bg-amber-50 border-amber-200',       dot: 'bg-amber-400' },
                      comment:            { label: 'ความคิดเห็น',           color: 'text-slate-700 bg-slate-50 border-slate-200',       dot: 'bg-slate-400' },
                    };
                    const meta = actionLabel[ev.action] ?? { label: ev.action, color: 'text-slate-600 bg-slate-50 border-slate-200', dot: 'bg-slate-300' };
                    const displayName = [ev.user_first_name, ev.user_last_name].filter(Boolean).join(' ') || 'ระบบ';
                    const avatarSrc = ev.user_avatar_url || '';
                    const dt = new Date(ev.created_at);
                    const dateStr = dt.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
                    const timeStr = dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                    return (
                      <li key={ev.id} className="ml-4 pb-1">
                        <span className={`absolute -left-[9px] w-4 h-4 rounded-full border-2 border-white ${meta.dot}`} />
                        <div className={`border rounded-xl px-4 py-3 ${meta.color}`}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              {avatarSrc ? (
                                <img src={avatarSrc} alt={displayName} className="w-5 h-5 rounded-full object-cover" />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center text-[9px] font-bold text-white">
                                  {displayName.charAt(0)}
                                </div>
                              )}
                              <span className="font-bold text-xs">{displayName}</span>
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${meta.color}`}>{meta.label}</span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] opacity-60">
                              <Clock className="w-3 h-3" />
                              <span>{dateStr} {timeStr}</span>
                            </div>
                          </div>
                          {ev.content && (
                            <p className="text-xs mt-1 leading-relaxed opacity-80">{ev.content}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
