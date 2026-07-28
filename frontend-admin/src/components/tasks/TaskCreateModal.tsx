import React, { useState } from 'react';
import { X, Plus, Trash2, Calendar, User, Tag, Folder, AlignLeft, LayoutGrid } from 'lucide-react';
import type { User as UserType, Brand, TaskCategory, AdminTask } from '../../types';
import type { TaskStatus } from './taskUtils';
import { avatarUrl } from './taskUtils';

interface TaskCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultStatus?: TaskStatus;
  users: UserType[];
  brands: Brand[];
  categories: TaskCategory[];
  initialData?: AdminTask;
  currentUser?: UserType | null;
  onSubmit: (data: {
    title: string;
    description: string;
    due_date: string;
    assignee_ids: string[];
    brand_id?: string;
    category_id?: string;
    boards?: { name: string; description?: string }[];
  }) => Promise<void>;
}

interface BoardInput {
  name: string;
  due_date: string;
  priority: 'low' | 'medium' | 'high';
  description: string;
}

export const TaskCreateModal: React.FC<TaskCreateModalProps> = ({
  isOpen,
  onClose,
  users,
  brands,
  categories,
  initialData,
  currentUser,
  onSubmit,
}) => {
  const [title, setTitle] = useState(initialData?.title || '');
  const [desc, setDesc] = useState(initialData?.description || '');
  const [dueDate, setDueDate] = useState(
    initialData?.due_date ? initialData.due_date.split('T')[0] : ''
  );
  
  const initialAssignees = initialData?.assignee_ids && initialData.assignee_ids.length > 0
    ? initialData.assignee_ids
    : initialData?.assigned_to ? [initialData.assigned_to] : [];
    
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>(initialAssignees);
  const [brandId, setBrandId] = useState(initialData?.brand_id || '');
  const [categoryId, setCategoryId] = useState(initialData?.category_id || '');
  
  // Replace subItems with boards
  const [boards, setBoards] = useState<BoardInput[]>([{ name: '', due_date: '', priority: 'medium', description: '' }]);
  const [loading, setLoading] = useState(false);
  
  // Assignee Popover state
  const [showInvitePopover, setShowInvitePopover] = useState(false);
  
  // Custom Alert inside modal to avoid native alert
  const [modalAlert, setModalAlert] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setTitle(initialData?.title || '');
      setDesc(initialData?.description || '');
      setDueDate(initialData?.due_date ? initialData.due_date.split('T')[0] : '');
      const initAssignees = initialData?.assignee_ids && initialData.assignee_ids.length > 0
        ? initialData.assignee_ids
        : initialData?.assigned_to ? [initialData.assigned_to] : [];
      setSelectedAssignees(initAssignees);
      setBrandId(initialData?.brand_id || '');
      setCategoryId(initialData?.category_id || '');
      setModalAlert(null);
      
      if (!initialData) {
        setBoards([{ name: '', due_date: '', priority: 'medium', description: '' }]);
      } else {
        setBoards([]); 
      }
    }
  }, [isOpen, initialData]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) {
      setModalAlert('กรุณากรอกชื่องานและกำหนดวันส่ง');
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
      });

      // Reset form
      setTitle(''); setDesc(''); setDueDate('');
      setSelectedAssignees([]); setBrandId(''); setCategoryId('');
      setBoards([{ name: '', due_date: '', priority: 'medium', description: '' }]);
      onClose();
    } catch (e: any) {
      setModalAlert(e.message || 'สร้างงานล้มเหลว');
    } finally {
      setLoading(false);
    }
  };

  // Exclude current user from candidate list since they are the owner automatically
  const candidates = users
    .filter(u => u.id !== currentUser?.id)
    .filter(u => !selectedAssignees.includes(u.id));

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

          {/* Form */}
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
                  return (
                    <div key={u.id} className="relative group">
                      <img
                        src={avatarUrl(u.avatar_url) || undefined}
                        alt={u.nickname || u.first_name}
                        className="w-8 h-8 rounded-full object-cover border-2 border-white shadow-xs"
                        title={`${u.nickname || u.first_name} (${u.department})`}
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedAssignees(prev => prev.filter(id => id !== u.id))}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center text-rose-500 hover:text-rose-700 shadow-sm border border-slate-200 cursor-pointer"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  );
                })}

                {/* Add Assignee Button */}
                <button
                  type="button"
                  onClick={() => setShowInvitePopover(!showInvitePopover)}
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
                    เลือกมอบหมายผู้รับผิดชอบเพิ่มเติม (ไม่รวมตัวคุณเอง):
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
                          className="flex items-center gap-2 px-2.5 py-1 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-full text-[11px] font-semibold text-slate-700 hover:text-indigo-700 transition-all cursor-pointer active:scale-95 shadow-2xs"
                        >
                          <img
                            src={avatarUrl(u.avatar_url) || undefined}
                            alt={u.nickname || u.first_name}
                            className="w-4 h-4 rounded-full object-cover border border-white"
                          />
                          <span>{u.nickname || u.first_name}</span>
                        </button>
                      ))
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">
                        ไม่มีรายชื่อพนักงานอื่นให้เลือกเพิ่มเติม
                      </span>
                    )}
                  </div>
                </div>
              )}
              
              <p className="mt-1.5 text-[10px] text-slate-400 italic">
                ⓘ เจ้าของงานจะไม่สามารถเชิญตัวเองได้ และระบบจะตั้งคุณเป็นเจ้าของงานโดยอัตโนมัติ
              </p>
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
                  onChange={e => setBrandId(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
                >
                  <option value="">-- เลือกแบรนด์ --</option>
                  {brands.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
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
                              <option value="low">ความสำคัญ: ต่ำ</option>
                              <option value="medium">ความสำคัญ: ปานกลาง</option>
                              <option value="high">ความสำคัญ: สูง</option>
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
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
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
          </form>
        </div>
      </div>
    </div>
  );
};
