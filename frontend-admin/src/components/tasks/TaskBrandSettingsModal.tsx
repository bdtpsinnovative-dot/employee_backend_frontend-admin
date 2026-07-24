import React, { useState } from 'react';
import { X, Plus, Trash2, Tag, Folder } from 'lucide-react';
import type { Brand, TaskCategory } from '../../types';

interface TaskBrandSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  brands: Brand[];
  categories: TaskCategory[];
  onCreateBrand: (name: string) => Promise<void>;
  onDeleteBrand: (id: string) => Promise<void>;
  onCreateCategory: (name: string) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
}

export const TaskBrandSettingsModal: React.FC<TaskBrandSettingsModalProps> = ({
  isOpen,
  onClose,
  brands,
  categories,
  onCreateBrand,
  onDeleteBrand,
  onCreateCategory,
  onDeleteCategory,
}) => {
  const [newBrand, setNewBrand] = useState('');
  const [newCat, setNewCat] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleAddBrand = async () => {
    if (!newBrand.trim()) return;
    setLoading(true);
    try {
      await onCreateBrand(newBrand.trim());
      setNewBrand('');
    } catch (e: any) {
      alert(e.message || 'เพิ่มแบรนด์ล้มเหลว');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCat = async () => {
    if (!newCat.trim()) return;
    setLoading(true);
    try {
      await onCreateCategory(newCat.trim());
      setNewCat('');
    } catch (e: any) {
      alert(e.message || 'เพิ่มหมวดหมู่ล้มเหลว');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={onClose} />

      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">จัดการแบรนด์และหมวดหมู่งาน</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-6 text-xs">
            {/* Brands Section */}
            <div className="space-y-3">
              <h3 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm">
                <Tag className="w-4 h-4 text-indigo-600" />
                <span>แบรนด์ทั้งหมด (Brands)</span>
              </h3>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="ชื่อแบรนด์ใหม่..."
                  value={newBrand}
                  onChange={e => setNewBrand(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
                <button
                  onClick={handleAddBrand}
                  disabled={loading || !newBrand.trim()}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-lg flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>เพิ่ม</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200">
                {brands.map(b => (
                  <div key={b.id} className="inline-flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded-md">
                    <span className="font-medium text-slate-700">{b.name}</span>
                    <button
                      onClick={() => onDeleteBrand(b.id)}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Categories Section */}
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <h3 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm">
                <Folder className="w-4 h-4 text-indigo-600" />
                <span>หมวดหมู่งานทั้งหมด (Task Categories)</span>
              </h3>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="ชื่อหมวดหมู่ใหม่..."
                  value={newCat}
                  onChange={e => setNewCat(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
                <button
                  onClick={handleAddCat}
                  disabled={loading || !newCat.trim()}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-lg flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>เพิ่ม</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200">
                {categories.map(c => (
                  <div key={c.id} className="inline-flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded-md">
                    <span className="font-medium text-slate-700">{c.name}</span>
                    <button
                      onClick={() => onDeleteCategory(c.id)}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-200">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
