import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
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

      {/* ================= MODAL: CREATE / EDIT GROUP (WIDESCREEN 2-PANE LAYOUT) ================= */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '24px',
              width: '95vw',
              maxWidth: '1180px',
              maxHeight: '92vh',
              boxShadow: '0 25px 70px rgba(0,0,0,0.4)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Modal Top Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 dark:border-zinc-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center font-bold">
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-zinc-100">
                    {modalMode === 'create' ? 'สร้างกลุ่มดูแลลูกค้าใหม่' : 'แก้ไขกลุ่มดูแลลูกค้า'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    ตั้งค่าการกระจายแชท และเลือกสมาชิกแอดมินผู้ดูแล
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body Form: 2-Column Split Layout */}
            <form onSubmit={handleSaveGroup} className="flex-1 flex flex-col md:flex-row overflow-hidden">
              {/* LEFT COLUMN: Settings & Config (Width: 340px) */}
              <div className="w-full md:w-[340px] p-6 border-b md:border-b-0 md:border-r border-slate-200/80 dark:border-zinc-800 flex flex-col justify-between shrink-0 overflow-y-auto bg-slate-50/40 dark:bg-zinc-900/30">
                <div className="space-y-4">
                  {formError && (
                    <div className="p-3 rounded-xl bg-red-50 text-red-600 border border-red-200 text-xs flex items-center gap-2">
                      <AlertCircle size={15} className="shrink-0" />
                      <span>{formError}</span>
                    </div>
                  )}

                  {/* Group Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-zinc-200 mb-1.5">
                      ชื่อกลุ่ม <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น ทีมดูแล Wallcraft, ทีมขายพรีเมียม"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-blue-500 font-medium text-slate-900 dark:text-zinc-100"
                      required
                    />
                  </div>

                  {/* Brand */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-zinc-200 mb-1.5">
                      แบรนด์ที่รับผิดชอบ
                    </label>
                    <select
                      value={formBrand}
                      onChange={(e) => setFormBrand(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-blue-500 font-medium text-slate-900 dark:text-zinc-100 cursor-pointer"
                    >
                      {BRAND_OPTIONS.map((opt) => (
                        <option key={opt.slug} value={opt.slug}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      เมื่อมีแชทลูกค้าของแบรนด์นี้เข้ามา ระบบจะส่งต่อให้คนในกลุ่มนี้
                    </span>
                  </div>

                  {/* Distribution Mode */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-zinc-200 mb-1.5">
                      รูปแบบการกระจายงาน (Mode)
                    </label>
                    <div className="space-y-2">
                      <label
                        onClick={() => setFormMode('random')}
                        className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                          formMode === 'random'
                            ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200'
                            : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="routing_mode"
                          checked={formMode === 'random'}
                          onChange={() => setFormMode('random')}
                          className="cursor-pointer"
                        />
                        <div>
                          <span className="text-xs font-extrabold block">🎲 สุ่มอัตโนมัติ (Random)</span>
                          <span className="text-[10px] text-slate-400 block">สุ่มเลือกระหว่างคนที่อยู่ในกลุ่ม</span>
                        </div>
                      </label>

                      <label
                        onClick={() => setFormMode('round_robin')}
                        className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                          formMode === 'round_robin'
                            ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200'
                            : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="routing_mode"
                          checked={formMode === 'round_robin'}
                          onChange={() => setFormMode('round_robin')}
                          className="cursor-pointer"
                        />
                        <div>
                          <span className="text-xs font-extrabold block">🔄 วนรอบตามคิว (Round-Robin)</span>
                          <span className="text-[10px] text-slate-400 block">จ่ายวนสลับกันอย่างเท่าเทียม</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Is Active Toggle */}
                  <div className="pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formIsActive}
                        onChange={(e) => setFormIsActive(e.target.checked)}
                        className="w-4 h-4 rounded cursor-pointer text-blue-600"
                      />
                      <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                        เปิดใช้งานกลุ่มนี้ (Active)
                      </span>
                    </label>
                  </div>

                  {/* Smart Auto-grant Notice */}
                  <div className="p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 text-[11px] text-blue-700 dark:text-blue-300">
                    <span className="font-extrabold block mb-0.5">💡 ระบบสิทธิ์อัตโนมัติ:</span>
                    <span>พนักงานทุกคนที่ถูกเลือกในฝั่งขวา จะได้รับสิทธิ์เข้าใช้งานหน้ารวมแชท (LINE/FB/IG) ทันที</span>
                  </div>
                </div>

                {/* Bottom Actions inside Left Panel */}
                <div className="pt-4 border-t border-slate-200/80 dark:border-zinc-800 flex items-center gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={formSaving}
                    className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {formSaving ? 'กำลังบันทึก...' : modalMode === 'create' ? 'สร้างกลุ่ม' : 'บันทึก'}
                  </button>
                </div>
              </div>

              {/* RIGHT COLUMN: Huge Employee Directory (Flex-1) */}
              <div className="flex-1 p-6 flex flex-col overflow-hidden bg-white dark:bg-zinc-900">
                {/* Top Directory Bar */}
                <div className="pb-3 border-b border-slate-100 dark:border-zinc-800 shrink-0">
                  <div className="flex items-center justify-between gap-3 mb-2.5 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-slate-900 dark:text-zinc-100">
                        เลือกพนักงานผู้ดูแลในกลุ่มนี้
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        เลือกแล้ว {formAgentIds.length} คน
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          const allFilteredIds = filteredUsers.map((u) => u.id);
                          setFormAgentIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])));
                        }}
                        className="text-blue-600 hover:text-blue-700 font-bold hover:underline cursor-pointer"
                      >
                        + เลือกทั้งหมดตามตัวกรอง ({filteredUsers.length})
                      </button>
                      {formAgentIds.length > 0 && (
                        <>
                          <span className="text-slate-300 dark:text-zinc-700">|</span>
                          <button
                            type="button"
                            onClick={() => setFormAgentIds([])}
                            className="text-slate-400 hover:text-red-500 font-semibold cursor-pointer"
                          >
                            ล้างการเลือก
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Quick Filter Pills & Search in One Row */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="ค้นหาชื่อพนักงาน, ตำแหน่ง, แผนก..."
                        value={agentSearch}
                        onChange={(e) => setAgentSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-zinc-850/60 border border-slate-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-blue-500 font-medium text-slate-800 dark:text-zinc-100"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto pb-0.5">
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
                  </div>
                </div>

                {/* THE HUGE EMPLOYEE GRID: 2 to 3 Columns */}
                <div className="flex-1 overflow-y-auto py-3">
                  {filteredUsers.length === 0 ? (
                    <div className="py-20 text-center text-slate-400 text-xs">
                      ไม่พบพนักงานตามเงื่อนไขที่เลือก
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                      {filteredUsers.map((u) => {
                        const isSelected = formAgentIds.includes(u.id);
                        const isAdmin = u.role === 'admin';
                        const hasDirectAccess = accessUsers.some(
                          (a) => (a.user_id === u.id || (u.auth_id && a.user_id === u.auth_id)) && a.is_enabled
                        );

                        return (
                          <div
                            key={u.id}
                            onClick={() => toggleAgent(u.id)}
                            className={`p-2.5 rounded-xl cursor-pointer flex items-center justify-between transition-all border ${
                              isSelected
                                ? 'bg-blue-50/90 dark:bg-blue-950/40 border-blue-400 dark:border-blue-600 shadow-2xs'
                                : 'bg-white dark:bg-zinc-850 hover:bg-slate-50 dark:hover:bg-zinc-800 border-slate-200/80 dark:border-zinc-750'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="relative shrink-0">
                                <AvatarImg
                                  url={u.avatar_url}
                                  name={u.nickname || u.first_name}
                                  size={30}
                                />
                                <span
                                  className="absolute -bottom-1 -right-1 text-[11px] leading-none"
                                  title={isAdmin ? 'ผู้ดูแลระบบ' : hasDirectAccess ? 'มีสิทธิ์แชทพร้อมตอบ' : isSelected ? 'จะเปิดสิทธิ์ให้อัตโนมัติ' : 'พนักงานทั่วไป'}
                                >
                                  {isAdmin ? '🛡️' : hasDirectAccess ? '💬' : isSelected ? '⚡' : '👤'}
                                </span>
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center gap-1 truncate">
                                  <span className="text-xs font-bold text-slate-900 dark:text-zinc-100 truncate">
                                    {u.first_name} {u.nickname ? `(${u.nickname})` : ''}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                  <span className="text-[10px] text-slate-400 truncate max-w-[75px]">
                                    {u.position || u.department || 'พนักงาน'}
                                  </span>

                                  {isAdmin ? (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
                                      🛡️ Admin
                                    </span>
                                  ) : hasDirectAccess ? (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                      💬 มีสิทธิ์แชท
                                    </span>
                                  ) : isSelected ? (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                                      ⚡ สิทธิ์อัตโนมัติ
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            <div
                              className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition-all ${
                                isSelected
                                  ? 'bg-blue-600 text-white'
                                  : 'border border-slate-300 dark:border-zinc-600 bg-white dark:bg-zinc-800'
                              }`}
                            >
                              {isSelected && <Check size={11} />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
