import { useEffect, useState } from 'react';
import { Check, GripVertical, Plus, Save, UsersRound } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { fetchBrands, fetchUsers, reorderBrands, updateBrandResponsibilities } from '../services/adminApi';
import type { Brand, BrandResponsibility, BrandResponsibilityType, User } from '../types';
import { avatarUrl } from '../components/tasks/taskUtils';
import OrganizationSettingsNav from '../components/OrganizationSettingsNav';

const RESPONSIBILITY_TYPES: Array<{ type: BrandResponsibilityType; label: string }> = [
  { type: 'bd', label: 'BD' },
  { type: 'mkt', label: 'MKT' },
  { type: 'graphic', label: 'Graphic' },
];
const BRAND_ORDER_STORAGE_KEY = 'brand-responsibility-order-v1';

type EditingCell = { brandId: string; responsibilityType: BrandResponsibilityType };
type LayoutContext = { currentUser?: User | null };
const displayName = (user: User) => user.nickname || user.first_name || user.email;

export default function BrandResponsibilities() {
  const { currentUser } = useOutletContext<LayoutContext>();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [draftUserIds, setDraftUserIds] = useState<string[]>([]);
  const [draggingBrandId, setDraggingBrandId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeUsers = users.filter(user => user.status === 'active');

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [brandData, userData] = await Promise.all([fetchBrands(), fetchUsers()]);
      const orderedBrands = applyStoredOrder(brandData);
      setBrands(orderedBrands);
      setUsers(userData);
      if (hasStoredOrder()) void syncBrandOrder(orderedBrands);
    } catch (err: any) {
      setError(err.message || 'โหลดข้อมูลความสัมพันธ์ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, []);

  useEffect(() => {
    const syncWhenOnline = () => {
      if (brands.length > 0) void syncBrandOrder(brands);
    };
    window.addEventListener('online', syncWhenOnline);
    return () => window.removeEventListener('online', syncWhenOnline);
  }, [brands]);

  function hasStoredOrder() {
    try {
      return Boolean(localStorage.getItem(BRAND_ORDER_STORAGE_KEY));
    } catch {
      return false;
    }
  }

  function applyStoredOrder(brandData: Brand[]) {
    try {
      const stored = JSON.parse(localStorage.getItem(BRAND_ORDER_STORAGE_KEY) || '[]') as string[];
      if (!Array.isArray(stored) || stored.length === 0) return brandData;
      const byId = new Map(brandData.map(brand => [brand.id, brand]));
      const ordered = stored.flatMap(id => {
        const brand = byId.get(id);
        if (!brand) return [];
        byId.delete(id);
        return [brand];
      });
      return [...ordered, ...byId.values()];
    } catch {
      return brandData;
    }
  }

  function storeBrandOrder(orderedBrands: Brand[]) {
    try {
      localStorage.setItem(BRAND_ORDER_STORAGE_KEY, JSON.stringify(orderedBrands.map(brand => brand.id)));
    } catch {
      // The UI still keeps the order for this render when storage is unavailable.
    }
  }

  async function syncBrandOrder(orderedBrands: Brand[]) {
    setOrderStatus('กำลังบันทึกลำดับ...');
    try {
      await reorderBrands(orderedBrands.map(brand => brand.id));
      setOrderStatus('บันทึกลำดับออนไลน์แล้ว');
    } catch {
      setOrderStatus('ออฟไลน์: เก็บลำดับไว้ในเครื่องแล้ว');
    }
  }

  function handleBrandDrop(targetBrandId: string) {
    if (!draggingBrandId || draggingBrandId === targetBrandId) return;
    const nextBrands = [...brands];
    const fromIndex = nextBrands.findIndex(brand => brand.id === draggingBrandId);
    const targetIndex = nextBrands.findIndex(brand => brand.id === targetBrandId);
    if (fromIndex < 0 || targetIndex < 0) return;
    const [movedBrand] = nextBrands.splice(fromIndex, 1);
    nextBrands.splice(targetIndex, 0, movedBrand);
    setBrands(nextBrands);
    setDraggingBrandId(null);
    storeBrandOrder(nextBrands);
    void syncBrandOrder(nextBrands);
  }

  function openEditor(brand: Brand, responsibilityType: BrandResponsibilityType) {
    setEditingCell({ brandId: brand.id, responsibilityType });
    setDraftUserIds(
      (brand.responsibilities ?? [])
        .filter(item => item.responsibility_type === responsibilityType)
        .map(item => item.user_id),
    );
    setError(null);
    setSuccess(null);
  }

  async function saveResponsibilities() {
    if (!editingCell) return;
    const brand = brands.find(item => item.id === editingCell.brandId);
    if (!brand) return;

    const selectedIds = new Set(draftUserIds);
    const nextResponsibilities: BrandResponsibility[] = [
      ...(brand.responsibilities ?? []).filter(item => (
        item.responsibility_type !== editingCell.responsibilityType && !selectedIds.has(item.user_id)
      )),
      ...draftUserIds.map(userId => ({
        user_id: userId,
        responsibility_type: editingCell.responsibilityType,
      })),
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
  }

  if (currentUser && currentUser.role !== 'admin') return null;

  return (
    <main className="min-h-full bg-slate-50 p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <OrganizationSettingsNav activeTab="brands" />

        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>}
        {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">{success}</div>}
        {orderStatus && <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-semibold text-sky-700">{orderStatus}</div>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs md:p-6">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900"><UsersRound className="h-5 w-5 text-indigo-600" />ความสัมพันธ์แบรนด์กับผู้รับผิดชอบ</h2>
              <p className="mt-1 text-xs text-slate-500">กดปุ่มวงกลม + ในแต่ละช่องเพื่อเลือกพนักงานได้มากกว่า 1 คน</p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-[11px] font-bold text-indigo-700">ลากแถวเพื่อจัดลำดับ</span>
          </div>

          {loading ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center text-xs text-slate-400">กำลังโหลดข้อมูล...</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[760px] w-full border-collapse text-left">
                <thead><tr className="bg-slate-50">
                  <th className="sticky left-0 z-10 w-48 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-xs font-extrabold text-slate-700">แบรนด์</th>
                  {RESPONSIBILITY_TYPES.map(item => <th key={item.type} className="min-w-52 border-b border-slate-200 px-4 py-3 text-xs font-extrabold text-slate-700">{item.label}</th>)}
                </tr></thead>
                <tbody>
                  {brands.map(brand => <tr key={brand.id} draggable onDragStart={() => setDraggingBrandId(brand.id)} onDragEnd={() => setDraggingBrandId(null)} onDragOver={event => event.preventDefault()} onDrop={() => handleBrandDrop(brand.id)} className={`border-b border-slate-100 last:border-b-0 ${draggingBrandId === brand.id ? 'opacity-40' : ''}`}>
                    <th className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-800"><span className="inline-flex items-center gap-2"><GripVertical className="h-4 w-4 cursor-grab text-slate-300" />{brand.name}</span></th>
                    {RESPONSIBILITY_TYPES.map(item => {
                      const memberIds = new Set((brand.responsibilities ?? []).filter(responsibility => responsibility.responsibility_type === item.type).map(responsibility => responsibility.user_id));
                      const members = activeUsers.filter(user => memberIds.has(user.id));
                      return <td key={item.type} className="px-3 py-3 align-top">
                        <div className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-transparent p-1.5 transition hover:border-indigo-200 hover:bg-indigo-50/60">
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                            {members.map(member => {
                              const imageUrl = avatarUrl(member.avatar_url);
                              return <span key={member.id} title={displayName(member)} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2 text-[10px] font-bold text-slate-700 shadow-2xs">
                                <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-100 text-[10px] font-extrabold text-indigo-700 ring-1 ring-slate-200">
                                  {imageUrl ? <img src={imageUrl} alt={displayName(member)} className="h-full w-full object-cover" /> : displayName(member).charAt(0).toUpperCase()}
                                </span>
                                <span className="max-w-[120px] truncate">{displayName(member)}</span>
                              </span>;
                            })}
                            {members.length === 0 && <span className="text-[10px] text-slate-400">ยังไม่มีผู้รับผิดชอบ</span>}
                          </div>
                          <button type="button" onClick={() => openEditor(brand, item.type)} aria-label={`เพิ่มผู้รับผิดชอบ ${item.label} ของ ${brand.name}`} title="เพิ่มผู้รับผิดชอบ" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-white text-slate-400 transition hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"><Plus className="h-4 w-4" /></button>
                        </div>
                      </td>;
                    })}
                  </tr>)}
                  {brands.length === 0 && <tr><td colSpan={RESPONSIBILITY_TYPES.length + 1} className="px-4 py-12 text-center text-xs text-slate-400">ยังไม่มีแบรนด์ในระบบ</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {editingCell && (() => {
            const brand = brands.find(item => item.id === editingCell.brandId);
            const type = RESPONSIBILITY_TYPES.find(item => item.type === editingCell.responsibilityType);
            if (!brand || !type) return null;
            return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]" onClick={() => setEditingCell(null)}>
              <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl md:p-6" onClick={event => event.stopPropagation()}>
                <div className="mb-5 flex items-start justify-between gap-3"><div><p className="m-0 text-sm font-extrabold text-slate-900">{brand.name} · {type.label}</p><p className="m-0 mt-1 text-xs text-slate-500">เลือกผู้รับผิดชอบที่เกี่ยวข้องกับแบรนด์นี้</p></div><button type="button" onClick={() => setEditingCell(null)} className="rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800">ปิด</button></div>
                <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex flex-wrap gap-2">
                  {activeUsers.map(member => { const selected = draftUserIds.includes(member.id); return <button key={member.id} type="button" onClick={() => setDraftUserIds(current => selected ? current.filter(id => id !== member.id) : [...current, member.id])} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] font-bold transition ${selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'}`}>{selected && <Check className="h-3.5 w-3.5" />}{displayName(member)}{member.team && <span className={selected ? 'text-indigo-100' : 'text-slate-400'}>({member.team})</span>}</button>; })}
                  {activeUsers.length === 0 && <span className="text-xs text-slate-500">ยังไม่มีพนักงาน Active</span>}
                </div></div>
                <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-200 pt-4"><button type="button" onClick={() => setEditingCell(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">ยกเลิก</button><button type="button" onClick={() => void saveResponsibilities()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'กำลังบันทึก...' : 'บันทึกผู้รับผิดชอบ'}</button></div>
              </div>
            </div>;
          })()}
        </section>
      </div>
    </main>
  );
}
