import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Plus,
  Trash2,
  Edit2,
  Check,
  Dices,
  RefreshCw,
  X,
  AlertCircle,
  Shuffle,
  RotateCcw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchUsers } from '../../services/adminApi';
import {
  fetchChatRoutingGroups,
  saveChatRoutingGroups,
  fetchChatAccessUsers,
  saveChatAccessUsers,
  autoAssignConversations,
  BRAND_OPTIONS,
} from '../../services/chatRoutingService';
import type { ChatRoutingGroup, User, ChatConversation, ChatAccessUser } from '../../types';
import { avatarUrl } from '../tasks/taskUtils';

function AvatarImg({ url, name, size = 20 }: { url?: string | null; name: string; size?: number }) {
  const [error, setError] = useState(false);
  const src = avatarUrl(url);

  if (src && !error) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setError(true)}
        style={{ width: `${size}px`, height: `${size}px`, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: '#3B82F6',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: size <= 20 ? '0.65rem' : '0.75rem',
        flexShrink: 0,
      }}
    >
      {(name || 'U').charAt(0).toUpperCase()}
    </div>
  );
}

export default function ChatRoutingTab() {
  const [groups, setGroups] = useState<ChatRoutingGroup[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [accessUsers, setAccessUsers] = useState<ChatAccessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unassignedCount, setUnassignedCount] = useState<number>(0);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Group Modal
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formBrand, setFormBrand] = useState('all');
  const [formMode, setFormMode] = useState<'random' | 'round_robin'>('random');
  const [formAgentIds, setFormAgentIds] = useState<string[]>([]);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState<'all' | 'ready' | 'admin' | 'selected'>('all');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [routingGroups, userList, countRes, accessList] = await Promise.all([
        fetchChatRoutingGroups(),
        fetchUsers().catch(() => []),
        supabase
          .from('chat_conversations')
          .select('id', { count: 'exact', head: true })
          .is('assigned_to', null),
        fetchChatAccessUsers().catch(() => []),
      ]);

      setGroups(routingGroups);
      setUsers(userList);
      setUnassignedCount(countRes.count || 0);
      setAccessUsers(accessList);
    } catch (err: any) {
      console.error('Failed to load routing data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const showNotification = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  // Open Create Modal
  const handleOpenCreate = () => {
    setModalMode('create');
    setEditingGroupId(null);
    setFormName('');
    setFormBrand('all');
    setFormMode('random');
    setFormAgentIds([]);
    setFormIsActive(true);
    setFormError('');
    setAgentSearch('');
    setAgentFilter('all');
    setAgentFilter('all');
    setShowModal(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (group: ChatRoutingGroup) => {
    setModalMode('edit');
    setEditingGroupId(group.id);
    setFormName(group.name);
    setFormBrand(group.brand);
    setFormMode(group.mode);
    setFormAgentIds(group.agent_ids || []);
    setFormIsActive(group.is_active);
    setFormError('');
    setAgentSearch('');
    setShowModal(true);
  };

  // Toggle user in agentIds
  const toggleAgent = (userId: string) => {
    setFormAgentIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  // Save Group
  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('กรุณากรอกชื่อกลุ่ม');
      return;
    }
    if (formAgentIds.length === 0) {
      setFormError('กรุณาเลือกสมาชิกผู้ดูแลอย่างน้อย 1 คน');
      return;
    }

    try {
      setFormSaving(true);
      setFormError('');

      let updatedList: ChatRoutingGroup[];
      if (modalMode === 'create') {
        const newGroup: ChatRoutingGroup = {
          id: 'grp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          name: formName.trim(),
          brand: formBrand,
          mode: formMode,
          agent_ids: formAgentIds,
          is_active: formIsActive,
          created_at: new Date().toISOString(),
        };
        updatedList = [...groups, newGroup];
      } else {
        updatedList = groups.map((g) =>
          g.id === editingGroupId
            ? {
                ...g,
                name: formName.trim(),
                brand: formBrand,
                mode: formMode,
                agent_ids: formAgentIds,
                is_active: formIsActive,
              }
            : g
        );
      }

      const ok = await saveChatRoutingGroups(updatedList);
      if (!ok) throw new Error('บันทึกข้อมูลไม่สำเร็จ');

      // ⚡ Auto-grant chat access whitelist for all selected agents
      try {
        const currentAccess = await fetchChatAccessUsers();
        const existingMap = new Map(currentAccess.map((u) => [u.user_id, u]));
        let accessChanged = false;
        const updatedAccess = [...currentAccess];

        for (const agentId of formAgentIds) {
          const existing = existingMap.get(agentId);
          if (!existing) {
            updatedAccess.push({
              user_id: agentId,
              added_at: new Date().toISOString(),
              is_enabled: true,
            });
            accessChanged = true;
          } else if (!existing.is_enabled) {
            existing.is_enabled = true;
            accessChanged = true;
          }
        }

        if (accessChanged) {
          await saveChatAccessUsers(updatedAccess);
          setAccessUsers(updatedAccess);
        }
      } catch (permErr) {
        console.warn('Auto-grant chat access error:', permErr);
      }

      setGroups(updatedList);
      setShowModal(false);
      showNotification(modalMode === 'create' ? 'สร้างกลุ่มดูแลลูกค้าเรียบร้อย!' : 'บันทึกการแก้ไขเรียบร้อย!');
    } catch (err: any) {
      setFormError(err.message || 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setFormSaving(false);
    }
  };

  // Delete Group
  const handleDeleteGroup = async (groupId: string) => {
    if (!window.confirm('คุณต้องการลบกลุ่มนี้ใช่หรือไม่?')) return;
    try {
      const updatedList = groups.filter((g) => g.id !== groupId);
      const ok = await saveChatRoutingGroups(updatedList);
      if (ok) {
        setGroups(updatedList);
        showNotification('ลบกลุ่มเรียบร้อยแล้ว');
      }
    } catch (err: any) {
      alert('ไม่สามารถลบได้: ' + err.message);
    }
  };

  // Toggle Group Active
  const handleToggleActive = async (group: ChatRoutingGroup) => {
    const updated = groups.map((g) =>
      g.id === group.id ? { ...g, is_active: !g.is_active } : g
    );
    const ok = await saveChatRoutingGroups(updated);
    if (ok) {
      setGroups(updated);
      showNotification(group.is_active ? 'ปิดการใช้งานกลุ่มแล้ว' : 'เปิดการใช้งานกลุ่มแล้ว');
    }
  };

  // Bulk Auto-assign
  const handleBulkAutoAssign = async () => {
    if (unassignedCount === 0) {
      alert('ไม่มีลูกค้าที่ยังไม่มีคนดูแลครับ ทุกเคสมีผู้รับผิดชอบแล้ว');
      return;
    }
    if (groups.filter((g) => g.is_active && g.agent_ids.length > 0).length === 0) {
      alert('กรุณาสร้างและเปิดใช้งานกลุ่มดูแลลูกค้าที่มีสมาชิกก่อนครับ');
      return;
    }

    if (!window.confirm(`ต้องการสุ่มกระจายลูกค้าที่ยังไม่มีคนดูแลจำนวน ${unassignedCount} คน ให้กับแอดมินในกลุ่มทันทีใช่หรือไม่?`)) {
      return;
    }

    try {
      setAutoAssigning(true);
      const { data: convs, error } = await supabase
        .from('chat_conversations')
        .select('*')
        .is('assigned_to', null);

      if (error) throw error;
      if (!convs || convs.length === 0) {
        alert('ไม่พบเคสที่ยังไม่มีคนดูแล');
        return;
      }

      const res = await autoAssignConversations(convs as ChatConversation[], groups, users);
      setGroups(res.updatedGroups);
      showNotification(`สุ่มจ่ายงานให้แอดมินเรียบร้อยแล้วทั้งหมด ${res.assignedCount} เคส!`);
      await loadData();
    } catch (err: any) {
      alert('เกิดข้อผิดพลาดในการสุ่มจ่ายงาน: ' + err.message);
    } finally {
      setAutoAssigning(false);
    }
  };

  const chatReadyCount = users.filter(
    (u) =>
      u.role === 'admin' ||
      accessUsers.some((a) => (a.user_id === u.id || (u.auth_id && a.user_id === u.auth_id)) && a.is_enabled)
  ).length;
  const adminCount = users.filter((u) => u.role === 'admin').length;

  const filteredUsers = users.filter((u) => {
    const isAdmin = u.role === 'admin';
    const hasDirectAccess = accessUsers.some(
      (a) => (a.user_id === u.id || (u.auth_id && a.user_id === u.auth_id)) && a.is_enabled
    );
    const isSelected = formAgentIds.includes(u.id);

    if (agentFilter === 'ready' && !hasDirectAccess && !isAdmin) return false;
    if (agentFilter === 'admin' && !isAdmin) return false;
    if (agentFilter === 'selected' && !isSelected) return false;

    const query = agentSearch.toLowerCase().trim();
    if (!query) return true;
    const name = `${u.first_name} ${u.last_name} ${u.nickname || ''}`.toLowerCase();
    const email = (u.email || '').toLowerCase();
    const dept = (u.department || u.position || '').toLowerCase();
    return name.includes(query) || email.includes(query) || dept.includes(query);
  });

  return (
    <div className="space-y-5">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-5 right-5 z-[9999] bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-xs font-bold animate-fadeIn">
          <Check size={16} />
          <span>{successToast}</span>
        </div>
      )}

      {/* Top Utility & Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5 text-xs text-slate-500">
          <span className="font-extrabold text-slate-800 dark:text-zinc-100">
            กลุ่มแอดมินดูแลลูกค้า ({groups.length} กลุ่ม)
          </span>
          {unassignedCount > 0 && (
            <span className="px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-bold text-[11px] border border-amber-200 dark:border-amber-800 inline-flex items-center gap-1">
              <span>⚠️ ลูกค้ายังไม่มีผู้ดูแล {unassignedCount} คน</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleBulkAutoAssign}
            disabled={autoAssigning || unassignedCount === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs font-bold shadow-2xs hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
            title={unassignedCount > 0 ? `สุ่มจ่ายลูกค้า ${unassignedCount} คน` : 'ไม่มีลูกค้าที่ยังไม่มีผู้ดูแล'}
          >
            <Dices size={14} className={autoAssigning ? 'animate-spin' : ''} />
            <span>
              {autoAssigning ? 'กำลังสุ่ม...' : `สุ่มจ่ายลูกค้าค้างอยู่ (${unassignedCount})`}
            </span>
          </button>

          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-sm transition-all cursor-pointer"
          >
            <Plus size={15} />
            <span>สร้างกลุ่มใหม่</span>
          </button>
        </div>
      </div>

      {/* Group List */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <RefreshCw size={22} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
          <p style={{ margin: 0, fontSize: '0.85rem' }}>กำลังโหลดข้อมูลกลุ่ม...</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="py-16 px-4 text-center bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-2xl shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center mx-auto mb-3">
            <Users size={22} />
          </div>
          <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-200">
            ยังไม่มีกลุ่มแอดมินดูแลลูกค้า
          </h4>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            สร้างกลุ่มแรก เช่น "ทีมดูแลลูกค้า Wallcraft" และเลือกแอดมินที่จะให้ระบบสุ่มจ่ายลูกค้าให้
          </p>
          <button
            onClick={handleOpenCreate}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <Plus size={14} />
            <span>สร้างกลุ่มแรก</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {groups.map((grp) => {
            const brandLabel =
              BRAND_OPTIONS.find((b) => b.slug === grp.brand)?.label || grp.brand;
            const assignedMembers = users.filter((u) => (grp.agent_ids || []).includes(u.id));

            return (
              <div
                key={grp.id}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '14px',
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  opacity: grp.is_active ? 1 : 0.6,
                }}
              >
                {/* Card Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {grp.name}
                      </h3>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '10px',
                          background: grp.is_active ? '#DEF7EC' : 'var(--surface-muted)',
                          color: grp.is_active ? '#03543F' : 'var(--text-secondary)',
                        }}
                      >
                        {grp.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {brandLabel}
                      </span>
                      <span style={{ color: 'var(--border)' }}>•</span>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '6px',
                          background: grp.mode === 'random' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                          color: grp.mode === 'random' ? '#2563EB' : '#059669',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        {grp.mode === 'random' ? <Shuffle size={11} /> : <RotateCcw size={11} />}
                        <span>{grp.mode === 'random' ? 'สุ่ม (Random)' : 'วนรอบ (Round-Robin)'}</span>
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      onClick={() => handleToggleActive(grp)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        color: 'var(--text-secondary)',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                      title={grp.is_active ? 'กดเพื่อปิดกลุ่มนี้' : 'กดเพื่อเปิดกลุ่มนี้'}
                    >
                      {grp.is_active ? 'ปิด' : 'เปิด'}
                    </button>
                    <button
                      onClick={() => handleOpenEdit(grp)}
                      style={{
                        padding: '5px',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                      title="แก้ไขกลุ่ม"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteGroup(grp.id)}
                      style={{
                        padding: '5px',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'transparent',
                        color: '#EF4444',
                        cursor: 'pointer',
                      }}
                      title="ลบกลุ่ม"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Member Avatars */}
                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    แอดมินผู้ดูแลในกลุ่ม ({assignedMembers.length} คน):
                  </span>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    {assignedMembers.length === 0 ? (
                      <span style={{ fontSize: '0.75rem', color: '#EF4444', fontStyle: 'italic' }}>
                        ⚠️ ยังไม่มีสมาชิกในกลุ่ม (จะไม่สามารถสุ่มจ่ายงานได้)
                      </span>
                    ) : (
                      assignedMembers.map((m) => (
                        <div
                          key={m.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 8px',
                            borderRadius: '20px',
                            background: 'var(--surface-muted)',
                            border: '1px solid var(--border)',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                          }}
                        >
                          <AvatarImg
                            url={m.avatar_url}
                            name={m.nickname || m.first_name}
                            size={18}
                          />
                          <span>{m.nickname || m.first_name}</span>
                          <span style={{ fontSize: '0.65rem' }}>
                            {m.role === 'admin' ? '🛡️' : '💬'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================= MODAL: CREATE / EDIT GROUP ================= */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={20} style={{ color: 'var(--blue)' }} />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {modalMode === 'create' ? 'สร้างกลุ่มดูแลลูกค้าใหม่' : 'แก้ไขกลุ่มดูแลลูกค้า'}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#EF4444',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px',
                }}
              >
                <AlertCircle size={15} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveGroup} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Group Name */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                  ชื่อกลุ่ม <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="เช่น ทีมดูแลลูกค้า Wallcraft, ทีมขายพรีเมียม"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                  }}
                  required
                />
              </div>

              {/* Brand Responsible */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                  แบรนด์ที่รับผิดชอบ
                </label>
                <select
                  value={formBrand}
                  onChange={(e) => setFormBrand(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                  }}
                >
                  {BRAND_OPTIONS.map((opt) => (
                    <option key={opt.slug} value={opt.slug}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                  เมื่อมีแชทลูกค้าของแบรนด์นี้เข้ามา ระบบจะส่งต่อให้แอดมินในกลุ่มนี้
                </span>
              </div>

              {/* Distribution Mode */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                  รูปแบบการกระจายงาน (Distribution Mode)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <label
                    style={{
                      border: formMode === 'random' ? '2px solid var(--blue)' : '1px solid var(--border)',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      background: formMode === 'random' ? 'rgba(59, 130, 246, 0.05)' : 'var(--surface)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="radio"
                        name="routing_mode"
                        checked={formMode === 'random'}
                        onChange={() => setFormMode('random')}
                      />
                      <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        🎲 สุ่มอัตโนมัติ (Random)
                      </span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', paddingLeft: '20px' }}>
                      สุ่มเลือกระหว่างคนที่อยู่ในกลุ่ม
                    </span>
                  </label>

                  <label
                    style={{
                      border: formMode === 'round_robin' ? '2px solid var(--blue)' : '1px solid var(--border)',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      background: formMode === 'round_robin' ? 'rgba(59, 130, 246, 0.05)' : 'var(--surface)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="radio"
                        name="routing_mode"
                        checked={formMode === 'round_robin'}
                        onChange={() => setFormMode('round_robin')}
                      />
                      <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        🔄 วนรอบตามคิว (Round-Robin)
                      </span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', paddingLeft: '20px' }}>
                      จ่ายวนสลับกันอย่างเท่าเทียม
                    </span>
                  </label>
                </div>
              </div>

              {/* Members Selection */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    เลือกแอดมินในกลุ่มนี้ ({formAgentIds.length} คนเลือกแล้ว) <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    (คลิกเพื่อเลือกหรือนำออก)
                  </span>
                </div>

                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 text-[11px] text-blue-700 dark:text-blue-300 mb-2">
                  <span className="font-bold shrink-0">💡 สิทธิ์อัตโนมัติ:</span>
                  <span>พนักงานทุกคนที่เลือกเข้ากลุ่ม จะได้รับสิทธิ์เข้าใช้งานหน้ารวมแชท (LINE/FB/IG) ทันที</span>
                </div>

                {/* Quick Filter Pills with Symbols */}
                <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-0.5">
                  <button
                    type="button"
                    onClick={() => setAgentFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                      agentFilter === 'all'
                        ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                        : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200'
                    }`}
                  >
                    👥 ทั้งหมด ({users.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentFilter('ready')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                      agentFilter === 'ready'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 hover:bg-emerald-100'
                    }`}
                  >
                    💬 มีสิทธิ์แชท ({chatReadyCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentFilter('admin')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                      agentFilter === 'admin'
                        ? 'bg-purple-600 text-white shadow-2xs'
                        : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200/50 hover:bg-purple-100'
                    }`}
                  >
                    🛡️ แอดมิน ({adminCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentFilter('selected')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                      agentFilter === 'selected'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/50 hover:bg-blue-100'
                    }`}
                  >
                    ✓ เลือกแล้ว ({formAgentIds.length})
                  </button>
                </div>

                <input
                  type="text"
                  placeholder="🔍 ค้นหาชื่อพนักงาน, ตำแหน่ง..."
                  value={agentSearch}
                  onChange={(e) => setAgentSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-muted)',
                    color: 'var(--text-primary)',
                    fontSize: '0.78rem',
                    marginBottom: '8px',
                    boxSizing: 'border-box',
                  }}
                />

                <div
                  style={{
                    maxHeight: '210px',
                    overflowY: 'auto',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    background: 'var(--surface)',
                  }}
                >
                  {filteredUsers.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                      ไม่พบพนักงานตามเงื่อนไขที่เลือก
                    </div>
                  ) : (
                    filteredUsers.map((u) => {
                      const isSelected = formAgentIds.includes(u.id);
                      const isAdmin = u.role === 'admin';
                      const hasDirectAccess = accessUsers.some(
                        (a) => (a.user_id === u.id || (u.auth_id && a.user_id === u.auth_id)) && a.is_enabled
                      );

                      return (
                        <div
                          key={u.id}
                          onClick={() => toggleAgent(u.id)}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                            border: isSelected ? '1px solid #3B82F6' : '1px solid transparent',
                            transition: 'all 0.1s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            {/* Avatar with Corner Status Emoji Badge */}
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                              <AvatarImg
                                url={u.avatar_url}
                                name={u.nickname || u.first_name}
                                size={26}
                              />
                              <span
                                style={{
                                  position: 'absolute',
                                  bottom: '-4px',
                                  right: '-4px',
                                  fontSize: '11px',
                                  lineHeight: 1,
                                }}
                                title={isAdmin ? 'ผู้ดูแลระบบ' : hasDirectAccess ? 'มีสิทธิ์แชทพร้อมตอบ' : isSelected ? 'จะเปิดสิทธิ์ให้อัตโนมัติ' : 'พนักงานทั่วไป'}
                              >
                                {isAdmin ? '🛡️' : hasDirectAccess ? '💬' : isSelected ? '⚡' : '👤'}
                              </span>
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                                  {u.first_name} {u.last_name} {u.nickname ? `(${u.nickname})` : ''}
                                </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                  {u.position || u.department || 'พนักงาน'}
                                </span>

                                {/* Clear visual badges with symbols */}
                                {isAdmin ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                    🛡️ Super Admin
                                  </span>
                                ) : hasDirectAccess ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                    💬 มีสิทธิ์แชทแล้ว
                                  </span>
                                ) : isSelected ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                    ⚡ จะเปิดสิทธิ์ให้อัตโนมัติ
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
                                    ⚪ ทั่วไป
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '6px',
                              border: isSelected ? '1px solid #3B82F6' : '1px solid var(--border)',
                              background: isSelected ? '#3B82F6' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#fff',
                              flexShrink: 0,
                            }}
                          >
                            {isSelected && <Check size={13} />}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Is Active */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="group_active_toggle"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                />
                <label htmlFor="group_active_toggle" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  เปิดใช้งานกลุ่มนี้ (Active)
                </label>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                  }}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--blue)',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: formSaving ? 'not-allowed' : 'pointer',
                    fontSize: '0.82rem',
                    opacity: formSaving ? 0.7 : 1,
                  }}
                >
                  {formSaving ? 'กำลังบันทึก...' : modalMode === 'create' ? 'สร้างกลุ่ม' : 'บันทึกการแก้ไข'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
