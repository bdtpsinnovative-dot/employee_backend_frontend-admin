import React, { useState } from 'react';
import { X, Plus, Trash2, Tag, Folder, UsersRound, Check, Save } from 'lucide-react';
import type {
  Brand,
  BrandResponsibility,
  BrandResponsibilityType,
  TaskCategory,
  User,
} from '../../types';

interface TaskBrandSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  brands: Brand[];
  users: User[];
  categories: TaskCategory[];
  onCreateBrand: (name: string) => Promise<void>;
  onDeleteBrand: (id: string) => Promise<void>;
  onUpdateBrandResponsibilities: (
    id: string,
    responsibilities: BrandResponsibility[],
  ) => Promise<void>;
  onCreateCategory: (name: string) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
}

export const TaskBrandSettingsModal: React.FC<TaskBrandSettingsModalProps> = ({
  isOpen,
  onClose,
  brands,
  users,
  categories,
  onCreateBrand,
  onDeleteBrand,
  onUpdateBrandResponsibilities,
  onCreateCategory,
  onDeleteCategory,
}) => {
  const [newBrand, setNewBrand] = useState('');
  const [newCat, setNewCat] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingCell, setEditingCell] = useState<{
    brandId: string;
    responsibilityType: BrandResponsibilityType;
  } | null>(null);
  const [draftUserIds, setDraftUserIds] = useState<string[]>([]);
  const [mappingError, setMappingError] = useState<string | null>(null);

  const activeUsers = users.filter(user => user.status === 'active');
  const responsibilityTypes: Array<{
    type: BrandResponsibilityType;
    label: string;
  }> = [
    { type: 'bd', label: 'BD' },
    { type: 'mkt', label: 'MKT' },
    { type: 'graphic', label: 'Graphic' },
  ];

  const openResponsibilityEditor = (
    brand: Brand,
    responsibilityType: BrandResponsibilityType,
  ) => {
    setEditingCell({ brandId: brand.id, responsibilityType });
    setDraftUserIds(
      (brand.responsibilities ?? [])
        .filter(item => item.responsibility_type === responsibilityType)
        .map(item => item.user_id),
    );
    setMappingError(null);
  };

  const saveResponsibilities = async () => {
    if (!editingCell) return;
    const brand = brands.find(item => item.id === editingCell.brandId);
    if (!brand) return;

    const selectedIDs = new Set(draftUserIds);
    const otherResponsibilities = (brand.responsibilities ?? []).filter(item => (
      item.responsibility_type !== editingCell.responsibilityType
      && !selectedIDs.has(item.user_id)
    ));
    const nextResponsibilities: BrandResponsibility[] = [
      ...otherResponsibilities,
      ...draftUserIds.map(userId => ({
        user_id: userId,
        responsibility_type: editingCell.responsibilityType,
      })),
    ];

    setLoading(true);
    setMappingError(null);
    try {
      await onUpdateBrandResponsibilities(
        brand.id,
        nextResponsibilities,
      );
      setEditingCell(null);
      setDraftUserIds([]);
    } catch (error: any) {
      setMappingError(error.message || 'บันทึกผู้รับผิดชอบไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

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
        <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
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
                      onClick={() => {
                        if (window.confirm(`คุณต้องการลบแบรนด์ "${b.name}" ใช่หรือไม่?`)) {
                          onDeleteBrand(b.id);
                        }
                      }}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Brand responsibility matrix */}
            <div className="space-y-3 border-t border-slate-200 pt-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="m-0 flex items-center gap-1.5 text-sm font-bold text-slate-800">
                    <UsersRound className="h-4 w-4 text-indigo-600" />
                    <span>ผู้รับผิดชอบแต่ละแบรนด์</span>
                  </h3>
                  <p className="mt-1 text-[10px] text-slate-500">
                    เลือกแบรนด์ตอนสร้างงาน ระบบจะเพิ่มสมาชิกทีม BD ที่กำหนดไว้ให้อัตโนมัติ
                  </p>
                </div>
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-700">
                  กดช่องในตารางเพื่อแก้ไข
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-[720px] w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="sticky left-0 z-10 w-40 border-b border-r border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-bold text-slate-700">
                        แบรนด์
                      </th>
                      {responsibilityTypes.map(item => (
                        <th key={item.type} className="min-w-40 border-b border-slate-200 px-3 py-2.5 text-[11px] font-bold text-slate-700">
                          {item.label}
                          {item.type === 'bd' && (
                            <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[8px] font-bold text-emerald-700">
                              AUTO
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {brands.map(brand => (
                      <tr key={brand.id} className="border-b border-slate-100 last:border-b-0">
                        <th className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-2.5 text-[11px] font-bold text-slate-800">
                          {brand.name}
                        </th>
                        {responsibilityTypes.map(item => {
                          const responsibilityUserIDs = new Set(
                            (brand.responsibilities ?? [])
                              .filter(responsibility => (
                                responsibility.responsibility_type === item.type
                              ))
                              .map(responsibility => responsibility.user_id),
                          );
                          const members = activeUsers.filter(user =>
                            responsibilityUserIDs.has(user.id)
                          );
                          return (
                            <td key={item.type} className="px-2 py-2 align-top">
                              <button
                                type="button"
                                onClick={() => openResponsibilityEditor(brand, item.type)}
                                className="flex min-h-9 w-full flex-wrap items-center gap-1 rounded-lg border border-transparent px-1.5 py-1 text-left transition hover:border-indigo-200 hover:bg-indigo-50/70 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                              >
                                {members.length > 0 ? members.map(member => (
                                  <span key={member.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">
                                    <span className="grid h-4 w-4 place-items-center rounded-full bg-indigo-100 text-[8px] font-bold text-indigo-700">
                                      {(member.nickname || member.first_name || '?').charAt(0)}
                                    </span>
                                    {member.nickname || member.first_name}
                                  </span>
                                )) : (
                                  <span className="text-[10px] text-slate-400">+ เลือกคน</span>
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {brands.length === 0 && (
                      <tr>
                        <td colSpan={responsibilityTypes.length + 1} className="px-4 py-8 text-center text-[11px] text-slate-400">
                          เพิ่มแบรนด์ก่อนกำหนดผู้รับผิดชอบ
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {editingCell && (() => {
                const brand = brands.find(item => item.id === editingCell.brandId);
                const responsibility = responsibilityTypes.find(
                  item => item.type === editingCell.responsibilityType,
                );
                return (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="m-0 text-[11px] font-bold text-slate-800">
                          {brand?.name} · {responsibility?.label}
                        </p>
                        <p className="m-0 mt-0.5 text-[9px] text-slate-500">เลือกได้มากกว่า 1 คน</p>
                      </div>
                      <button type="button" onClick={() => setEditingCell(null)} className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-600">
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {activeUsers.map(member => {
                        const selected = draftUserIds.includes(member.id);
                        return (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => setDraftUserIds(current => selected
                              ? current.filter(id => id !== member.id)
                              : [...current, member.id]
                            )}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-bold transition ${
                              selected
                                ? 'border-indigo-600 bg-indigo-600 text-white'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
                            }`}
                          >
                            {selected && <Check className="h-3 w-3" />}
                            {member.nickname || member.first_name}
                          </button>
                        );
                      })}
                      {activeUsers.length === 0 && (
                        <span className="text-[10px] text-slate-500">ยังไม่มีพนักงาน Active</span>
                      )}
                    </div>

                    {mappingError && <p className="mb-0 mt-2 text-[10px] font-semibold text-rose-600">{mappingError}</p>}
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={saveResponsibilities}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        <Save className="h-3.5 w-3.5" />
                        บันทึกผู้รับผิดชอบ
                      </button>
                    </div>
                  </div>
                );
              })()}
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
                      onClick={() => {
                        if (window.confirm(`คุณต้องการลบหมวดหมู่ "${c.name}" ใช่หรือไม่?`)) {
                          onDeleteCategory(c.id);
                        }
                      }}
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
