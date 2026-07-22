import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchAdminTasks,
  createAdminTask,
  deleteAdminTask,
  updateAdminTaskStatus,
  fetchUsers,
  fetchBrands,
  fetchTaskCategories,
  createBrand,
  deleteBrand,
  createTaskCategory,
  deleteTaskCategory,
  fetchTaskEvents,
  addTaskComment,
} from '../services/adminApi';
import type { AdminTask, User, Brand, TaskCategory, TaskEvent } from '../types';

// ─── Status Config ───────────────────────────────────────────
const STATUS_CONFIG = {
  pending:     { label: 'รอทำ',      color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1', dot: '#94A3B8' },
  in_progress: { label: 'กำลังทำ',   color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA', dot: '#FB923C' },
  completed:   { label: 'เสร็จสิ้น', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', dot: '#4ADE80' },
} as const;
type TaskStatus = keyof typeof STATUS_CONFIG;

// ─── Helper ──────────────────────────────────────────────────
function avatarUrl(url?: string | null): string | null {
  if (!url || !url.trim()) return null;
  if (url.startsWith('r2://')) return url.replace('r2://', 'https://pub-2a877f7cc07b481ca09dec82cb240465.r2.dev/');
  return url;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  } catch { return iso; }
}

function isOverdue(iso: string): boolean {
  return new Date(iso) < new Date() && new Date(iso).toDateString() !== new Date().toDateString();
}

export default function Tasks() {
  // ─── Data state ──
  const [tasks, setTasks]               = useState<AdminTask[]>([]);
  const [users, setUsers]               = useState<User[]>([]);
  const [brands, setBrands]             = useState<Brand[]>([]);
  const [categories, setCategories]     = useState<TaskCategory[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  // ─── UI state ──
  const [showForm, setShowForm]         = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [viewMode, setViewMode]         = useState<'list' | 'board'>('list');

  // ─── Form state ──
  const [formTitle, setFormTitle]       = useState('');
  const [formDesc, setFormDesc]         = useState('');
  const [formAssignees, setFormAssignees] = useState<string[]>([]);
  const [formBrand, setFormBrand]       = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formDue, setFormDue]           = useState('');
  const [formSubItems, setFormSubItems] = useState<string[]>(['']);
  const [formLoading, setFormLoading]   = useState(false);
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);

  // ─── Settings panel ──
  const [showSettings, setShowSettings] = useState(false);
  const [newBrandName, setNewBrandName]         = useState('');
  const [newCategoryName, setNewCategoryName]   = useState('');
  const [settingLoading, setSettingLoading]     = useState<string | null>(null);

  // ─── Card detail modal ──
  const [selectedTask, setSelectedTask] = useState<AdminTask | null>(null);
  const [taskEvents, setTaskEvents] = useState<TaskEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');

  // ─── Load events when task selected ──
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
  }, [selectedTask]);

  const handleAddComment = async () => {
    if (!selectedTask || !commentText.trim()) return;
    try {
      setEventsLoading(true);
      const newEvent = await addTaskComment(selectedTask.id, commentText);
      setTaskEvents(prev => [...prev, newEvent]);
      setCommentText('');
    } catch (e: any) {
      alert(e.message || 'เพิ่มคอมเมนต์ล้มเหลว');
    } finally {
      setEventsLoading(false);
    }
  };

  // ─── Load data ──────────────────────────────────────────────
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
      setUsers(u.filter(u => u.status === 'active'));
      setBrands(b);
      setCategories(c);
    } catch (e: unknown) {
      setError((e as Error).message || 'โหลดข้อมูลล้มเหลว');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ─── User map ────────────────────────────────────────────────
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));
  const brandMap = Object.fromEntries(brands.map(b => [b.id, b]));
  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c]));

  // ─── Kanban columns ──────────────────────────────────────────
  const columns: TaskStatus[] = ['pending', 'in_progress', 'completed'];

  // ─── Create task ─────────────────────────────────────────────
  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim() || formAssignees.length === 0 || !formDue) return;
    setFormLoading(true);
    try {
      const subItems = formSubItems.filter(s => s.trim() !== '');
      await createAdminTask({
        assignee_ids: formAssignees,
        title: formTitle.trim(),
        description: formDesc.trim(),
        due_date: formDue,
        brand_id: formBrand || undefined,
        category_id: formCategory || undefined,
        sub_items: subItems.length > 0 ? subItems : undefined,
      });
      setFormTitle(''); setFormDesc(''); setFormAssignees([]);
      setFormBrand(''); setFormCategory(''); setFormDue('');
      setFormSubItems(['']);
      setShowForm(false);
      await loadAll();
    } catch (e: unknown) {
      alert('สร้างงานล้มเหลว: ' + (e as Error).message);
    } finally {
      setFormLoading(false);
    }
  }

  // ─── Delete task ─────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm('ต้องการลบงานนี้หรือไม่?')) return;
    setActionLoading(id);
    try {
      await deleteAdminTask(id);
      setSelectedTask(null);
      await loadAll();
    } catch { alert('ลบงานล้มเหลว'); }
    finally { setActionLoading(null); }
  }

  // ─── Change status ───────────────────────────────────────────
  async function handleStatusChange(task: AdminTask, status: TaskStatus) {
    setActionLoading(task.id);
    try {
      await updateAdminTaskStatus(task.id, status);
      if (selectedTask?.id === task.id) setSelectedTask({ ...selectedTask, status });
      await loadAll();
    } catch { alert('เปลี่ยนสถานะล้มเหลว'); }
    finally { setActionLoading(null); }
  }

  // ─── SubItem helpers ─────────────────────────────────────────
  function addSubItem() { setFormSubItems(prev => [...prev, '']); }
  function updateSubItem(i: number, v: string) {
    setFormSubItems(prev => { const n = [...prev]; n[i] = v; return n; });
  }
  function removeSubItem(i: number) {
    setFormSubItems(prev => prev.filter((_, idx) => idx !== i));
  }

  // ─── Brand/Category management ───────────────────────────────
  async function handleAddBrand() {
    if (!newBrandName.trim()) return;
    setSettingLoading('brand');
    try { await createBrand(newBrandName.trim()); setNewBrandName(''); await loadAll(); }
    catch { alert('เพิ่ม Brand ล้มเหลว'); }
    finally { setSettingLoading(null); }
  }
  async function handleDeleteBrand(id: string) {
    if (!confirm('ลบ Brand นี้?')) return;
    setSettingLoading('brand-' + id);
    try { await deleteBrand(id); await loadAll(); }
    catch { alert('ลบ Brand ล้มเหลว'); }
    finally { setSettingLoading(null); }
  }
  async function handleAddCategory() {
    if (!newCategoryName.trim()) return;
    setSettingLoading('cat');
    try { await createTaskCategory(newCategoryName.trim()); setNewCategoryName(''); await loadAll(); }
    catch { alert('เพิ่มหมวดหมู่ล้มเหลว'); }
    finally { setSettingLoading(null); }
  }
  async function handleDeleteCategory(id: string) {
    if (!confirm('ลบหมวดหมู่นี้?')) return;
    setSettingLoading('cat-' + id);
    try { await deleteTaskCategory(id); await loadAll(); }
    catch { alert('ลบหมวดหมู่ล้มเหลว'); }
    finally { setSettingLoading(null); }
  }

  // ─── Drag & Drop ─────────────────────────────────────────────
  function handleDragStart(e: React.DragEvent, taskId: string) {
    e.dataTransfer.setData('text/plain', taskId);
  }

  async function handleDrop(e: React.DragEvent, status: TaskStatus) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;
    setActionLoading(taskId);
    try {
      await updateAdminTaskStatus(taskId, status);
      await loadAll();
    } catch {
      alert('ย้ายสถานะงานล้มเหลว');
    } finally {
      setActionLoading(null);
    }
  }

  // Toggle selected user in multi-select form state
  const toggleAssignee = (userId: string) => {
    setFormAssignees(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  // ─── Render ──────────────────────────────────────────────────
  return (
    <div id="tasks" className="page-section active">
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <h2 style={{ margin: 0 }}>จัดการงาน (Tasks)</h2>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.8)', borderRadius: 12, padding: 4, backdropFilter: 'blur(10px)' }}>
            <button 
              onClick={() => setViewMode('list')} 
              style={{ background: viewMode === 'list' ? '#fff' : 'transparent', color: viewMode === 'list' ? 'var(--blue)' : 'var(--text-gray)', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', gap: 6, boxShadow: viewMode === 'list' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none' }}>
              <i className="fa-solid fa-list"></i> List
            </button>
            <button 
              onClick={() => setViewMode('board')} 
              style={{ background: viewMode === 'board' ? '#fff' : 'transparent', color: viewMode === 'board' ? 'var(--blue)' : 'var(--text-gray)', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', gap: 6, boxShadow: viewMode === 'board' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none' }}>
              <i className="fa-solid fa-border-all"></i> Board
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn-primary"
            style={{ background: 'rgba(255,255,255,0.7)', color: 'var(--text-main)', border: '1px solid rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowSettings(!showSettings)}
          >
            <i className="fa-solid fa-gear" style={{ color: 'var(--blue)', marginRight: 6 }}></i>
            จัดการ Brand / หมวดหมู่
          </button>
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            <i className="fa-solid fa-plus"></i> มอบหมายงานใหม่
          </button>
        </div>
      </div>

      {/* ── Settings panel: Brand + Category ── */}
      {showSettings && (
        <div className="glass-panel" style={{ padding: 20, marginBottom: 20, borderRadius: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {/* Brand section */}
            <div>
              <h4 style={{ marginBottom: 12, color: 'var(--text-main)' }}>
                <i className="fa-solid fa-tag" style={{ color: 'var(--blue)', marginRight: 8 }}></i>
                จัดการ Brand
              </h4>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  className="form-control" style={{ margin: 0, flex: 1 }}
                  placeholder="ชื่อ Brand ใหม่"
                  value={newBrandName}
                  onChange={e => setNewBrandName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddBrand()}
                />
                <button className="btn-save" disabled={settingLoading === 'brand'} onClick={handleAddBrand}>
                  <i className="fa-solid fa-plus"></i>
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {brands.length === 0 && <span style={{ color: 'var(--text-gray)', fontSize: 13 }}>ยังไม่มี Brand</span>}
                {brands.map(b => (
                  <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--blue-light)', color: 'var(--blue)', border: '1px solid var(--blue-mid)', borderRadius: 20, padding: '4px 12px', fontSize: 13, fontWeight: 600 }}>
                    {b.name}
                    <button onClick={() => handleDeleteBrand(b.id)} disabled={settingLoading === 'brand-' + b.id}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 0, lineHeight: 1, fontSize: 13 }}>
                      <i className="fa-solid fa-times"></i>
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Category section */}
            <div>
              <h4 style={{ marginBottom: 12, color: 'var(--text-main)' }}>
                <i className="fa-solid fa-folder-open" style={{ color: 'var(--blue)', marginRight: 8 }}></i>
                จัดการหมวดหมู่งาน
              </h4>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  className="form-control" style={{ margin: 0, flex: 1 }}
                  placeholder="ชื่อหมวดหมู่ใหม่"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                />
                <button className="btn-save" disabled={settingLoading === 'cat'} onClick={handleAddCategory}>
                  <i className="fa-solid fa-plus"></i>
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {categories.length === 0 && <span style={{ color: 'var(--text-gray)', fontSize: 13 }}>ยังไม่มีหมวดหมู่</span>}
                {categories.map(cat => (
                  <span key={cat.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A', borderRadius: 20, padding: '4px 12px', fontSize: 13, fontWeight: 600 }}>
                    {cat.name}
                    <button onClick={() => handleDeleteCategory(cat.id)} disabled={settingLoading === 'cat-' + cat.id}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 0, lineHeight: 1, fontSize: 13 }}>
                      <i className="fa-solid fa-times"></i>
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Task Dialog Modal ── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: 32, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h4 style={{ margin: 0, color: 'var(--text-main)', fontSize: 18, fontWeight: 700 }}>
                <i className="fa-solid fa-square-plus" style={{ color: 'var(--blue)', marginRight: 10 }}></i>
                มอบหมายงานใหม่
              </h4>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-gray)' }}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleCreateTask}>
              {/* Row 1: Brand + Category */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>แบรนด์</label>
                  <select className="form-control" style={{ margin: 0 }} value={formBrand} onChange={e => setFormBrand(e.target.value)}>
                    <option value="">— ไม่ระบุแบรนด์ —</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>หมวดหมู่งาน</label>
                  <select className="form-control" style={{ margin: 0 }} value={formCategory} onChange={e => setFormCategory(e.target.value)}>
                    <option value="">— ไม่ระบุหมวดหมู่ —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Row 2: Multi-select Assignees with Photos */}
              <div style={{ marginBottom: 16, position: 'relative' }}>
                <label style={labelStyle}>ผู้รับผิดชอบ * (เลือกได้หลายคน)</label>
                <div
                  onClick={() => setShowAssigneeDropdown(!showAssigneeDropdown)}
                  style={{
                    minHeight: 46,
                    padding: '8px 12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: 10,
                    cursor: 'pointer',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    alignItems: 'center',
                    background: '#fff'
                  }}
                >
                  {formAssignees.length === 0 ? (
                    <span style={{ color: 'var(--text-gray)', fontSize: 14 }}>— คลิกเพื่อเลือกผู้รับผิดชอบ —</span>
                  ) : (
                    formAssignees.map(id => {
                      const u = userMap[id];
                      return u ? (
                        <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--blue-light)', color: 'var(--blue)', padding: '4px 10px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
                          <img src={avatarUrl(u.avatar_url) || '/placeholder.png'} style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} alt="" />
                          <span>{u.first_name}</span>
                          <span onClick={(e) => { e.stopPropagation(); toggleAssignee(id); }} style={{ cursor: 'pointer', marginLeft: 4, color: '#EF4444' }}>&times;</span>
                        </div>
                      ) : null;
                    })
                  )}
                  <i className="fa-solid fa-chevron-down" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-gray)' }}></i>
                </div>

                {showAssigneeDropdown && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--border-color)', borderRadius: 10, boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 200, overflowY: 'auto', marginTop: 4 }}>
                    {users.map(u => {
                      const isSelected = formAssignees.includes(u.id);
                      return (
                        <div
                          key={u.id}
                          onClick={() => toggleAssignee(u.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', background: isSelected ? 'var(--blue-light)' : '#fff', borderBottom: '1px solid #f1f5f9' }}
                        >
                          <input type="checkbox" checked={isSelected} readOnly style={{ pointerEvents: 'none' }} />
                          <img src={avatarUrl(u.avatar_url) || '/placeholder.png'} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} alt="" />
                          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{u.first_name} {u.last_name} ({u.position})</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Row 3: Due Date */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>กำหนดส่งงาน *</label>
                <input type="date" className="form-control" style={{ margin: 0 }} value={formDue} onChange={e => setFormDue(e.target.value)} required min={new Date().toISOString().split('T')[0]} />
              </div>

              {/* Row 4: Title */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>ชื่องาน *</label>
                <input type="text" className="form-control" style={{ margin: 0 }} placeholder="กรอกชื่องาน / หัวข้อ" value={formTitle} onChange={e => setFormTitle(e.target.value)} required />
              </div>

              {/* Row 5: Description */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>รายละเอียดงาน</label>
                <textarea className="form-control" style={{ margin: 0, minHeight: 80, resize: 'vertical' }} placeholder="อธิบายรายละเอียดงาน..." value={formDesc} onChange={e => setFormDesc(e.target.value)} />
              </div>

              {/* Row 6: Sub-items */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <label style={{ ...labelStyle, margin: 0 }}>รายการงานย่อย (Checklist)</label>
                  <button type="button" onClick={addSubItem}
                    style={{ background: 'var(--blue-light)', color: 'var(--blue)', border: '1px solid var(--blue-mid)', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    + เพิ่มรายการย่อย
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {formSubItems.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-gray)', fontSize: 13 }}>{idx + 1}.</span>
                      <input
                        className="form-control" style={{ margin: 0, flex: 1 }}
                        placeholder={`รายละเอียดรายการย่อยที่ ${idx + 1}`}
                        value={item}
                        onChange={e => updateSubItem(idx, e.target.value)}
                      />
                      {formSubItems.length > 1 && (
                        <button type="button" onClick={() => removeSubItem(idx)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 16 }}>
                          <i className="fa-solid fa-trash-can"></i>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
                <button type="button" onClick={() => setShowForm(false)}
                  style={{ background: 'rgba(0,0,0,0.05)', border: 'none', borderRadius: 10, padding: '10px 20px', cursor: 'pointer', fontSize: 14 }}>
                  ยกเลิก
                </button>
                <button type="submit" className="btn-primary" disabled={formLoading}>
                  {formLoading ? 'กำลังบันทึก...' : 'มอบหมายงาน'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Loading / Error ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-gray)' }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 32, marginBottom: 12 }}></i>
          <div>กำลังโหลดข้อมูล...</div>
        </div>
      )}
      {error && !loading && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <i className="fa-solid fa-cloud-xmark" style={{ fontSize: 40, color: '#EF4444', marginBottom: 12 }}></i>
          <div style={{ color: '#EF4444', marginBottom: 12 }}>{error}</div>
          <button className="btn-primary" onClick={loadAll}>ลองอีกครั้ง</button>
        </div>
      )}

            {/* ── Views (List / Board) ── */}
      {!loading && !error && viewMode === 'list' && (
        <div className="table-card" style={{ padding: 0, background: '#fff', boxShadow: '0 15px 35px rgba(0,0,0,0.03)' }}>
          <table style={{ minWidth: 1000, margin: 0 }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr>
                <th style={{ width: 120 }}>PHASE</th>
                <th style={{ width: 100 }}>Priority</th>
                <th>DETAILS</th>
                <th style={{ width: 120 }}>Status</th>
                <th style={{ width: 120 }}>Due Date</th>
                <th style={{ width: 150 }}>Assignment</th>
                <th style={{ width: 100 }}>List</th>
                <th style={{ width: 100 }}>Note / Remark</th>
                <th style={{ width: 60, textAlign: 'center' }}>Link</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-gray)' }}>ไม่มีข้อมูลงาน</td>
                </tr>
              )}
              {tasks.map(task => {
                const category = task.category_id ? categoryMap[task.category_id] : null;
                const brand = task.brand_id ? brandMap[task.brand_id] : null;
                const overdue = task.status !== 'completed' && isOverdue(task.due_date);
                const assignees = task.assignee_ids
                  ? task.assignee_ids.map(id => userMap[id]).filter(Boolean)
                  : (task.assigned_to ? [userMap[task.assigned_to]].filter(Boolean) : []);
                
                // Mock priority based on due date closeness
                let priorityLabel = 'Low';
                let priorityColor = '#10B981';
                let priorityBg = '#D1FAE5';
                if (overdue) { priorityLabel = 'High'; priorityColor = '#EF4444'; priorityBg = '#FEE2E2'; }
                else if (new Date(task.due_date).getTime() - new Date().getTime() < 3 * 24 * 60 * 60 * 1000) { priorityLabel = 'Medium'; priorityColor = '#F59E0B'; priorityBg = '#FEF3C7'; }

                return (
                  <tr key={task.id} style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer', transition: '0.2s' }} 
                      onClick={() => setSelectedTask(task)}
                      onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 13 }}>
                      {category ? category.name : (brand ? brand.name : '-')}
                    </td>
                    <td>
                      <span style={{ background: priorityBg, color: priorityColor, padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                        {priorityLabel}
                      </span>
                    </td>
                    <td style={{ maxWidth: 300 }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.title}</div>
                      {task.description && (
                        <div style={{ fontSize: 12, color: 'var(--text-gray)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.description}</div>
                      )}
                    </td>
                    <td>
                      <span style={{ background: STATUS_CONFIG[task.status as TaskStatus].bg, color: STATUS_CONFIG[task.status as TaskStatus].color, border: `1px solid ${STATUS_CONFIG[task.status as TaskStatus].border}`, padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                        {STATUS_CONFIG[task.status as TaskStatus].label}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, fontWeight: 600, color: overdue ? '#EF4444' : 'var(--text-main)' }}>
                      {formatDate(task.due_date)} {overdue ? '⚠️' : ''}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {assignees.slice(0, 3).map((u, i) => (
                          <div key={u.id} style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--blue-light)', border: '2px solid #fff', overflow: 'hidden', marginLeft: i > 0 ? -8 : 0, zIndex: 3 - i, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {u.avatar_url ? <img src={avatarUrl(u.avatar_url)!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)' }}>{u.first_name[0]}</span>}
                          </div>
                        ))}
                        {assignees.length > 3 && (
                          <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#E2E8F0', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: -8, zIndex: 0, fontSize: 10, fontWeight: 700, color: 'var(--text-main)' }}>
                            +{assignees.length - 3}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-gray)', fontWeight: 600 }}>{STATUS_CONFIG[task.status as TaskStatus].label}</td>
                    <td style={{ fontSize: 13, color: 'var(--text-gray)' }}>-</td>
                    <td style={{ textAlign: 'center' }}>
                      <i className="fa-solid fa-link" style={{ color: '#CBD5E1', cursor: 'pointer' }} onClick={e => { e.stopPropagation(); alert('ยังไม่มีข้อมูล Link'); }}></i>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Kanban Board (Trello-Style Drag and Drop) ── */}
      {!loading && !error && viewMode === 'board' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, alignItems: 'start', overflowX: 'auto', paddingBottom: 20 }}>
          {columns.map(col => {
            const cfg = STATUS_CONFIG[col];
            const colTasks = tasks.filter(t => t.status === col);
            return (
              <div
                key={col}
                onDragOver={e => e.preventDefault()}
                onDrop={e => handleDrop(e, col)}
                className="glass-panel"
                style={{ borderRadius: 20, padding: 0, overflow: 'hidden', border: `1px solid rgba(255,255,255,0.8)`, background: 'rgba(255,255,255,0.5)', minWidth: 300 }}
              >
                {/* Column Header */}
                <div style={{ background: 'rgba(255,255,255,0.7)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid rgba(255,255,255,0.9)` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }}></span>
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-main)' }}>{cfg.label}</span>
                  </div>
                  <span style={{ background: '#F1F5F9', color: 'var(--text-gray)', borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                    {colTasks.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 400 }}>
                  {colTasks.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-gray)', fontSize: 13, border: '2px dashed #E2E8F0', borderRadius: 14 }}>
                      ลากการ์ดมาวางที่นี่
                    </div>
                  )}
                  {colTasks.map(task => {
                    const brand = task.brand_id ? brandMap[task.brand_id] : null;
                    const category = task.category_id ? categoryMap[task.category_id] : null;
                    const overdue = col !== 'completed' && isOverdue(task.due_date);

                    const assignees = task.assignee_ids
                      ? task.assignee_ids.map(id => userMap[id]).filter(Boolean)
                      : (task.assigned_to ? [userMap[task.assigned_to]].filter(Boolean) : []);

                    let priorityColor = 'transparent';
                    if (overdue) priorityColor = '#EF4444';
                    else if (new Date(task.due_date).getTime() - new Date().getTime() < 3 * 24 * 60 * 60 * 1000) priorityColor = '#F59E0B';
                    else priorityColor = '#10B981';

                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={e => handleDragStart(e, task.id)}
                        onClick={() => setSelectedTask(task)}
                        style={{
                          background: '#fff',
                          borderRadius: 16,
                          padding: '16px',
                          cursor: 'grab',
                          border: '1px solid #F1F5F9',
                          borderLeft: `4px solid ${priorityColor}`,
                          boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
                          transition: 'transform 0.15s, box-shadow 0.15s',
                          opacity: actionLoading === task.id ? 0.5 : 1
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.08)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.transform = '';
                          e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.03)';
                        }}
                      >
                        {/* Tags */}
                        {(brand || category) && (
                          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                            {brand && (
                              <span style={{ background: 'var(--blue-light)', color: 'var(--blue)', border: '1px solid var(--blue-mid)', borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                                {brand.name}
                              </span>
                            )}
                            {category && (
                              <span style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A', borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                                {category.name}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Title */}
                        <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--text-main)', marginBottom: 6, lineHeight: 1.4 }}>
                          {task.title}
                        </div>
                        {task.description && (
                          <div style={{ fontSize: 12.5, color: 'var(--text-gray)', marginBottom: 12, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {task.description}
                          </div>
                        )}
                        
                        {/* Sub-item count */}
                        {task.sub_items && task.sub_items.length > 0 && (
                          <div style={{ fontSize: 11.5, color: 'var(--text-gray)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <i className="fa-solid fa-list-check"></i>
                            {task.sub_items.filter(s => s.is_done).length} / {task.sub_items.length} 
                          </div>
                        )}

                        {/* Footer */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px dashed #E2E8F0' }}>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div style={{ display: 'flex' }}>
                              {assignees.slice(0, 3).map((u, i) => (
                                <div key={u.id} title={`${u.first_name} ${u.last_name}`}
                                  style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--blue-light)', border: '2px solid #fff', overflow: 'hidden', marginLeft: i > 0 ? -8 : 0, zIndex: 3 - i, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {u.avatar_url ? <img src={avatarUrl(u.avatar_url)!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--blue)' }}>{u.first_name[0]}</span>}
                                </div>
                              ))}
                              {assignees.length > 3 && (
                                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#E2E8F0', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: -8, zIndex: 0, fontSize: 9, fontWeight: 700, color: 'var(--text-main)' }}>
                                  +{assignees.length - 3}
                                </div>
                              )}
                            </div>
                          </div>

                          <span style={{ fontSize: 12, fontWeight: 600, color: overdue ? '#EF4444' : 'var(--text-gray)' }}>
                            <i className={`fa-solid fa-calendar-${overdue ? 'xmark' : 'check'}`} style={{ marginRight: 4 }}></i>
                            {formatDate(task.due_date)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      
{/* ── Task Detail Modal ── */}
      {selectedTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setSelectedTask(null); }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: 28, width: '100%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 30px 60px rgba(0,0,0,0.2)' }}>
            {/* Tags */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {selectedTask.brand_id && brandMap[selectedTask.brand_id] && (
                <span style={{ background: 'var(--blue-light)', color: 'var(--blue)', border: '1px solid var(--blue-mid)', borderRadius: 12, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                  <i className="fa-solid fa-tag" style={{ marginRight: 4 }}></i>
                  {brandMap[selectedTask.brand_id].name}
                </span>
              )}
              {selectedTask.category_id && categoryMap[selectedTask.category_id] && (
                <span style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A', borderRadius: 12, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                  <i className="fa-solid fa-folder-open" style={{ marginRight: 4 }}></i>
                  {categoryMap[selectedTask.category_id].name}
                </span>
              )}
              <span style={{ background: STATUS_CONFIG[selectedTask.status as TaskStatus].bg, color: STATUS_CONFIG[selectedTask.status as TaskStatus].color, border: `1px solid ${STATUS_CONFIG[selectedTask.status as TaskStatus].border}`, borderRadius: 12, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                {STATUS_CONFIG[selectedTask.status as TaskStatus].label}
              </span>
            </div>

            {/* Title */}
            <h3 style={{ margin: '0 0 10px', color: 'var(--text-main)', fontSize: 18 }}>{selectedTask.title}</h3>
            {selectedTask.description && (
              <p style={{ color: 'var(--text-gray)', fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>{selectedTask.description}</p>
            )}

            {/* Assignees + Due */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ background: '#F8FAFC', borderRadius: 12, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-gray)', marginBottom: 6 }}>ผู้รับผิดชอบ</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {((selectedTask.assignee_ids && selectedTask.assignee_ids.length > 0)
                    ? selectedTask.assignee_ids.map(id => userMap[id]).filter(Boolean)
                    : (selectedTask.assigned_to ? [userMap[selectedTask.assigned_to]].filter(Boolean) : [])
                  ).map(u => (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                      <img src={avatarUrl(u.avatar_url) || '/placeholder.png'} style={{ width: 16, height: 16, borderRadius: '50%' }} alt="" />
                      <span>{u.first_name}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: isOverdue(selectedTask.due_date) && selectedTask.status !== 'completed' ? '#FEF2F2' : '#F8FAFC', borderRadius: 12, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-gray)', marginBottom: 4 }}>กำหนดส่ง</div>
                <div style={{ fontWeight: 600, fontSize: 13, color: isOverdue(selectedTask.due_date) && selectedTask.status !== 'completed' ? '#EF4444' : 'var(--text-main)' }}>
                  {formatDate(selectedTask.due_date)}
                  {isOverdue(selectedTask.due_date) && selectedTask.status !== 'completed' && ' ⚠️'}
                </div>
              </div>
            </div>

            {/* Sub-items Checklist */}
            {selectedTask.sub_items && selectedTask.sub_items.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: 'var(--text-gray)', fontWeight: 600, marginBottom: 10 }}>CHECKLIST</div>
                {selectedTask.sub_items.map((item, i) => (
                  <div key={item.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#F8FAFC', borderRadius: 10, marginBottom: 6 }}>
                    <i className={`fa-solid fa-${item.is_done ? 'circle-check' : 'circle'}`}
                      style={{ color: item.is_done ? '#22C55E' : '#CBD5E1', fontSize: 16 }}></i>
                    <span style={{ fontSize: 13, color: item.is_done ? 'var(--text-gray)' : 'var(--text-main)', textDecoration: item.is_done ? 'line-through' : 'none' }}>
                      {item.title}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Status Change Buttons */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-gray)', fontWeight: 600, marginBottom: 8 }}>เปลี่ยนสถานะ</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {columns.filter(s => s !== selectedTask.status).map(s => (
                  <button key={s} disabled={actionLoading === selectedTask.id}
                    onClick={() => handleStatusChange(selectedTask, s)}
                    style={{ background: STATUS_CONFIG[s].bg, color: STATUS_CONFIG[s].color, border: `1.5px solid ${STATUS_CONFIG[s].border}`, borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                    → {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Timeline & Comments */}
            <div style={{ marginBottom: 20, paddingTop: 16, borderTop: '1px solid #F1F5F9' }}>
              <div style={{ fontSize: 12, color: 'var(--text-gray)', fontWeight: 600, marginBottom: 12 }}>TIMELINE & COMMENTS</div>
              {eventsLoading ? (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-gray)' }}>กำลังโหลดประวัติ...</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 200, overflowY: 'auto', marginBottom: 12, paddingRight: 4 }}>
                  {taskEvents.map(ev => (
                    <div key={ev.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: ev.event_type === 'system' ? '#E2E8F0' : 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                        {ev.event_type === 'system' ? (
                          <i className="fa-solid fa-robot" style={{ fontSize: 12, color: '#64748B' }}></i>
                        ) : (
                          ev.user_avatar_url ? <img src={avatarUrl(ev.user_avatar_url)!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)' }}>{ev.user_first_name?.[0] || '?'}</span>
                        )}
                      </div>
                      <div style={{ flex: 1, background: ev.event_type === 'system' ? 'transparent' : '#F8FAFC', padding: ev.event_type === 'system' ? '4px 0' : '8px 12px', borderRadius: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-main)' }}>
                            {ev.event_type === 'system' ? 'ระบบ' : ev.user_first_name}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-gray)' }}>{new Date(ev.created_at).toLocaleString('th-TH')}</span>
                        </div>
                        <div style={{ fontSize: 13, color: ev.event_type === 'system' ? 'var(--text-gray)' : 'var(--text-main)', fontStyle: ev.event_type === 'system' ? 'italic' : 'normal' }}>
                          {ev.content}
                        </div>
                      </div>
                    </div>
                  ))}
                  {taskEvents.length === 0 && <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-gray)', padding: '10px 0' }}>ยังไม่มีประวัติการพูดคุย</div>}
                </div>
              )}
              
              <div style={{ display: 'flex', gap: 8 }}>
                <input 
                  type="text" 
                  value={commentText} 
                  onChange={e => setCommentText(e.target.value)} 
                  placeholder="พิมพ์คอมเมนต์หรืออัปเดตงาน..." 
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 13, outline: 'none' }} 
                  onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                />
                <button 
                  onClick={handleAddComment} 
                  disabled={!commentText.trim() || eventsLoading}
                  style={{ background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 12, padding: '0 16px', cursor: 'pointer', fontWeight: 600, opacity: !commentText.trim() ? 0.5 : 1 }}>
                  <i className="fa-solid fa-paper-plane"></i>
                </button>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 16, borderTop: '1px solid #F1F5F9' }}>
              <button disabled={actionLoading === selectedTask.id}
                onClick={() => handleDelete(selectedTask.id)}
                style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA', borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                <i className="fa-solid fa-trash" style={{ marginRight: 6 }}></i>
                ลบงาน
              </button>
              <button onClick={() => setSelectedTask(null)}
                style={{ background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: 'var(--text-gray)',
  fontWeight: 600,
  marginBottom: 6,
};
