import React, { useState } from 'react';
import { X, Plus, Trash2, Calendar, User, Tag, Folder, AlignLeft, CheckSquare } from 'lucide-react';
import type { User as UserType, Brand, TaskCategory, AdminTask } from '../../types';
import type { TaskStatus } from './taskUtils';

interface TaskCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultStatus?: TaskStatus;
  users: UserType[];
  brands: Brand[];
  categories: TaskCategory[];
  initialData?: AdminTask;
  onSubmit: (data: {
    title: string;
    description: string;
    due_date: string;
    assignee_ids: string[];
    brand_id?: string;
    category_id?: string;
    sub_items?: string[];
  }) => Promise<void>;
}

export const TaskCreateModal: React.FC<TaskCreateModalProps> = ({
  isOpen,
  onClose,
  users,
  brands,
  categories,
  initialData,
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
  const [subItems, setSubItems] = useState<string[]>(['']);
  const [loading, setLoading] = useState(false);

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
      // We don't populate subItems here because subItems edit should be in the drawer
      if (!initialData) {
        setSubItems(['']);
      } else {
        setSubItems([]); // Empty for edit mode since we edit sub-items elsewhere
      }
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleToggleAssignee = (userId: string) => {
    setSelectedAssignees(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleAddSubItem = () => setSubItems(prev => [...prev, '']);
  const handleUpdateSubItem = (index: number, value: string) => {
    setSubItems(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };
  const handleRemoveSubItem = (index: number) => {
    setSubItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || selectedAssignees.length === 0 || !dueDate) {
      alert('กรุณากรอกชื่องาน เลือกผู้รับผิดชอบอย่างน้อย 1 คน และกำหนดวันส่ง');
      return;
    }

    setLoading(true);
    try {
      const validSubItems = subItems.map(s => s.trim()).filter(Boolean);
      await onSubmit({
        title: title.trim(),
        description: desc.trim(),
        due_date: dueDate,
        assignee_ids: selectedAssignees,
        brand_id: brandId || undefined,
        category_id: categoryId || undefined,
        sub_items: validSubItems.length > 0 ? validSubItems : undefined,
      });

      // Reset form
      setTitle(''); setDesc(''); setDueDate('');
      setSelectedAssignees([]); setBrandId(''); setCategoryId('');
      setSubItems(['']);
      onClose();
    } catch (e: any) {
      alert(e.message || 'สร้างงานล้มเหลว');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={onClose} />

      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden transform transition-all">
          {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-800">
            {initialData ? 'แก้ไขรายละเอียดงาน' : 'มอบหมายงานใหม่ (Assign Task)'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
            {/* Title */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">ชื่องาน (Task Title) *</label>
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
                <span>รายละเอียดเพิ่มเติม (Description)</span>
              </label>
              <textarea
                rows={3}
                placeholder="รายละเอียดเพิ่มเติมของงาน..."
                value={desc}
                onChange={e => setDesc(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
              />
            </div>

            {/* Assignees Selector */}
            <div>
              <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>ผู้รับผิดชอบ (Assignees) *</span>
              </label>
              <div className="max-h-32 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                {users.map(u => {
                  const isChecked = selectedAssignees.includes(u.id);
                  return (
                    <label
                      key={u.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                        isChecked ? 'bg-indigo-50 text-indigo-900 font-semibold' : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleAssignee(u.id)}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                      />
                      <span>{u.first_name} {u.last_name} ({u.department})</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Grid Row: Due Date, Brand, Category */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Due Date */}
              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>วันส่ง *</span>
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
            {/* Checklist Items - Only show in create mode */}
            {!initialData && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <label className="font-bold text-slate-700 flex items-center gap-1">
                    <CheckSquare className="w-3.5 h-3.5 text-slate-400" />
                    <span>รายการย่อย (Checklist Subtasks)</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAddSubItem}
                    className="text-indigo-600 hover:underline flex items-center gap-0.5 font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>เพิ่มข้อ</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {subItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder={`ข้อย่อยที่ ${idx + 1}`}
                        value={item}
                        onChange={e => handleUpdateSubItem(idx, e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20"
                      />
                      {subItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSubItem(idx)}
                          className="text-slate-400 hover:text-red-600 p-1"
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
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
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
