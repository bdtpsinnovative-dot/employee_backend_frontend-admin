import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Folder, Plus, Save, Tag, Trash2, UsersRound } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  createBrand,
  createTaskCategory,
  deleteBrand,
  deleteTaskCategory,
  fetchBrands,
  fetchTaskCategories,
  fetchUsers,
  updateBrandResponsibilities,
} from '../services/adminApi';
import type { Brand, BrandResponsibility, BrandResponsibilityType, TaskCategory, User } from '../types';
import { avatarUrl } from '../components/tasks/taskUtils';

const RESPONSIBILITY_TYPES: Array<{ type: BrandResponsibilityType; label: string }> = [
  { type: 'bd', label: 'BD' },
  { type: 'mkt', label: 'MKT' },
  { type: 'graphic', label: 'Graphic' },
];

type EditingCell = { brandId: string; responsibilityType: BrandResponsibilityType };
type LayoutContext = { currentUser?: User | null };
const displayName = (user: User) => user.nickname || user.first_name || user.email;

export default function BrandResponsibilities() {
  const navigate = useNavigate();
  const { currentUser } = useOutletContext<LayoutContext>();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [newBrand, setNewBrand] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [draftUserIds, setDraftUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeUsers = users.filter(user => user.status === 'active');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [brandData, userData, categoryData] = await Promise.all([
        fetchBrands(),
        fetchUsers(),
        fetchTaskCategories(),
      ]);
      setBrands(brandData);
      setUsers(userData);
      setCategories(categoryData);
    } catch (err: any) {
      setError(err.message || 'โหลดข้อมูลการตั้งค่าไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const openEditor = (brand: Brand, responsibilityType: BrandResponsibilityType) => {
    setEditingCell({ brandId: brand.id, responsibilityType });
    setDraftUserIds(
      (brand.responsibilities ?? [])
        .filter(item => item.responsibility_type === responsibilityType)
        .map(item => item.user_id),
    );
    setError(null);
    setSuccess(null);
  };

  const saveResponsibilities = async () => {
    if (!editingCell) return;
    const brand = brands.find(item => item.id === editingCell.brandId);
    if (!brand) return;
    const selectedIds = new Set(draftUserIds);
    const nextResponsibilities: BrandResponsibility[] = [
      ...(brand.responsibilities ?? []).filter(item => (
        item.responsibility_type !== editingCell.responsibilityType && !selectedIds.has(item.user_id)
      )),
      ...draftUserIds.map(userId => ({ user_id: userId, responsibility_type: editingCell.responsibilityType })),
    ];

    setSaving(true);
    setError(null);
    try {
      const updated = await updateBrandResponsibilities(brand.id, nextResponsibilities);
      setBrands(current => current.map(item => item.id === brand.id
        ? { ...item, responsible_user_ids: updated.responsibleUserIds, responsibilities: updated.responsibilities }
        : item));
      setEditingCell(null);
      setDraftUserIds([]);
      setSuccess(`บันทึกผู้รับผิดชอบของ ${brand.name} แล้ว`);
    } catch (err: any) {
      setError(err.message || 'บันทึกผู้รับผิดชอบไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const handleAddBrand = async () => {
    if (!newBrand.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const brand = await createBrand(newBrand.trim());
      setBrands(current => [...current, brand]);
      setNewBrand('');
      setSuccess(`เพิ่มแบรนด์ ${brand.name} แล้ว`);
    } catch (err: any) {
      setError(err.message || 'เพิ่มแบรนด์ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBrand = async (brand: Brand) => {
    if (!window.confirm(`ต้องการลบแบรนด์ "${brand.name}" ใช่หรือไม่?`)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteBrand(brand.id);
      setBrands(current => current.filter(item => item.id !== brand.id));
      if (editingCell?.brandId === brand.id) setEditingCell(null);
      setSuccess(`ลบแบรนด์ ${brand.name} แล้ว`);
    } catch (err: any) {
      setError(err.message || 'ลบแบรนด์ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategory.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const category = await createTaskCategory(newCategory.trim());
      setCategories(current => [...current, category]);
      setNewCategory('');
      setSuccess(`เพิ่มหมวดหมู่ ${category.name} แล้ว`);
    } catch (err: any) {
      setError(err.message || 'เพิ่มหมวดหมู่ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (category: TaskCategory) => {
    if (!window.confirm(`ต้องการลบหมวดหมู่ "${category.name}" ใช่หรือไม่?`)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteTaskCategory(category.id);
      setCategories(current => current.filter(item => item.id !== category.id));
      setSuccess(`ลบหมวดหมู่ ${category.name} แล้ว`);
    } catch (err: any) {
      setError(err.message || 'ลบหมวดหมู่ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  if (currentUser && currentUser.role !== 'admin') return null;

  return (
    <main className="min-h-full bg-slate-50 p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <button type="button" onClick={() => navigate('/tasks')} className="mt-1 rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-2xs transition hover:border-indigo-300 hover:text-indigo-600" aria-label="กลับไปหน้าจัดการงาน">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600">Task settings</p>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">ตั้งค่าแบรนด์และผู้รับผิดชอบ</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">กำหนดความสัมพันธ์ของแต่ละแบรนด์กับทีม BD, MKT และ Graphic ด้วยตัวเอง</p>
            </div>
          </div>
          <button type="button" onClick={() => navigate('/tasks')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700">
            <ArrowLeft className="h-3.5 w-3.5" />กลับไปจัดการงาน
          </button>
        </div>

        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>}
        {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">{success}</div>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs md:p-6">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900"><UsersRound className="h-5 w-5 text-indigo-600" />ความสัมพันธ์แบรนด์กับผู้รับผิดชอบ</h2>
              <p className="mt-1 text-xs text-slate-500">คลิกช่องในตารางเพื่อเลือกพนักงานได้มากกว่า 1 คนต่อทีม</p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-[11px] font-bold text-indigo-700">ตั้งค่าด้วยตนเอง</span>
          </div>

          <div className="mb-5 flex flex-col gap-2 sm:flex-row">
            <input value={newBrand} onChange={event => setNewBrand(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void handleAddBrand(); }} placeholder="ชื่อแบรนด์ใหม่..." className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
            <button type="button" onClick={() => void handleAddBrand()} disabled={saving || !newBrand.trim()} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-3.5 w-3.5" />เพิ่มแบรนด์</button>
          </div>

          {loading ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center text-xs text-slate-400">กำลังโหลดข้อมูล...</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[820px] w-full border-collapse text-left">
                <thead><tr className="bg-slate-50">
                  <th className="sticky left-0 z-10 w-48 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-xs font-extrabold text-slate-700">แบรนด์</th>
                  {RESPONSIBILITY_TYPES.map(item => <th key={item.type} className="min-w-52 border-b border-slate-200 px-4 py-3 text-xs font-extrabold text-slate-700">{item.label}</th>)}
                  <th className="w-14 border-b border-slate-200 px-2 py-3" />
                </tr></thead>
                <tbody>
                  {brands.map(brand => <tr key={brand.id} className="border-b border-slate-100 last:border-b-0">
                    <th className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-800">{brand.name}</th>
                    {RESPONSIBILITY_TYPES.map(item => {
                      const memberIds = new Set((brand.responsibilities ?? []).filter(responsibility => responsibility.responsibility_type === item.type).map(responsibility => responsibility.user_id));
                      const members = activeUsers.filter(user => memberIds.has(user.id));
                      return <td key={item.type} className="px-3 py-3 align-top">
                        <div className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-transparent p-1.5 transition hover:border-indigo-200 hover:bg-indigo-50/60">
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                            {members.map(member => {
                              const imageUrl = avatarUrl(member.avatar_url);
                              return <span key={member.id} title={displayName(member)} className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-indigo-100 text-[10px] font-extrabold text-indigo-700 shadow-sm ring-1 ring-slate-200">
                                {imageUrl ? <img src={imageUrl} alt={displayName(member)} className="h-full w-full object-cover" /> : displayName(member).charAt(0).toUpperCase()}
                              </span>;
                            })}
                            {members.length === 0 && <span className="text-[10px] text-slate-400">ยังไม่มีผู้รับผิดชอบ</span>}
                          </div>
                          <button type="button" onClick={() => openEditor(brand, item.type)} aria-label={`เพิ่มผู้รับผิดชอบ ${item.label} ของ ${brand.name}`} title="เพิ่มผู้รับผิดชอบ" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-white text-slate-400 transition hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </td>;
                    })}
                    <td className="px-2 py-3 text-right align-top"><button type="button" onClick={() => void handleDeleteBrand(brand)} className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" title="ลบแบรนด์"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>)}
                  {brands.length === 0 && <tr><td colSpan={RESPONSIBILITY_TYPES.length + 2} className="px-4 py-12 text-center text-xs text-slate-400">ยังไม่มีแบรนด์ กรุณาเพิ่มแบรนด์ก่อนกำหนดผู้รับผิดชอบ</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {editingCell && (() => {
            const brand = brands.find(item => item.id === editingCell.brandId);
            const type = RESPONSIBILITY_TYPES.find(item => item.type === editingCell.responsibilityType);
            if (!brand || !type) return null;
            return <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
              <div className="mb-4 flex items-start justify-between gap-3"><div><p className="m-0 text-sm font-extrabold text-slate-900">{brand.name} · {type.label}</p><p className="m-0 mt-1 text-[11px] text-slate-500">เลือกผู้รับผิดชอบที่เกี่ยวข้องกับแบรนด์นี้</p></div><button type="button" onClick={() => setEditingCell(null)} className="text-xs font-bold text-slate-500 hover:text-slate-800">ปิด</button></div>
              <div className="flex flex-wrap gap-2">
                {activeUsers.map(member => { const selected = draftUserIds.includes(member.id); return <button key={member.id} type="button" onClick={() => setDraftUserIds(current => selected ? current.filter(id => id !== member.id) : [...current, member.id])} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] font-bold transition ${selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'}`}>{selected && <Check className="h-3.5 w-3.5" />}{displayName(member)}{member.team && <span className={selected ? 'text-indigo-100' : 'text-slate-400'}>({member.team})</span>}</button>; })}
                {activeUsers.length === 0 && <span className="text-xs text-slate-500">ยังไม่มีพนักงานที่มีสถานะ Active</span>}
              </div>
              <div className="mt-4 flex justify-end"><button type="button" onClick={() => void saveResponsibilities()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'กำลังบันทึก...' : 'บันทึกผู้รับผิดชอบ'}</button></div>
            </div>;
          })()}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs md:p-6">
          <div className="mb-4 flex items-center gap-2"><Folder className="h-5 w-5 text-indigo-600" /><h2 className="text-base font-extrabold text-slate-900">หมวดหมู่งาน</h2></div>
          <div className="flex flex-col gap-2 sm:flex-row"><input value={newCategory} onChange={event => setNewCategory(event.target.value)} placeholder="ชื่อหมวดหมู่ใหม่..." className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /><button type="button" onClick={() => void handleAddCategory()} disabled={saving || !newCategory.trim()} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"><Plus className="h-3.5 w-3.5" />เพิ่มหมวดหมู่</button></div>
          <div className="mt-4 flex flex-wrap gap-2">{categories.map(category => <span key={category.id} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">{category.name}<button type="button" onClick={() => void handleDeleteCategory(category)} className="text-slate-400 hover:text-rose-600" title="ลบหมวดหมู่"><Trash2 className="h-3.5 w-3.5" /></button></span>)}{categories.length === 0 && <span className="text-xs text-slate-400">ยังไม่มีหมวดหมู่งาน</span>}</div>
        </section>

        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800"><Tag className="h-4 w-4 shrink-0" /><span>หน้านี้เป็นหน้าสำหรับตั้งค่าความสัมพันธ์เท่านั้น ลำดับและกฎการมอบหมายอัตโนมัติจะกำหนดเพิ่มเติมตามข้อมูลจริงของคุณ</span></div>
      </div>
    </main>
  );
}
