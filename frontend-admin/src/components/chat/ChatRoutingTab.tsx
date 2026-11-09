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
  autoAssignConversations,
  BRAND_OPTIONS,
} from '../../services/chatRoutingService';
import type { ChatRoutingGroup, User, ChatConversation } from '../../types';

export default function ChatRoutingTab() {
  const [groups, setGroups] = useState<ChatRoutingGroup[]>([]);
  const [users, setUsers] = useState<User[]>([]);
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

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [routingGroups, userList, countRes] = await Promise.all([
        fetchChatRoutingGroups(),
        fetchUsers().catch(() => []),
        supabase
          .from('chat_conversations')
          .select('id', { count: 'exact', head: true })
          .is('assigned_to', null),
      ]);

      setGroups(routingGroups);
      setUsers(userList);
      setUnassignedCount(countRes.count || 0);
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

  const filteredUsers = users.filter((u) => {
    const query = agentSearch.toLowerCase().trim();
    if (!query) return true;
    const name = `${u.first_name} ${u.last_name} ${u.nickname || ''}`.toLowerCase();
    const email = (u.email || '').toLowerCase();
    const dept = (u.department || '').toLowerCase();
    return name.includes(query) || email.includes(query) || dept.includes(query);
  });

  return (
    <div>
      {/* Toast Notification */}
      {successToast && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            background: '#059669',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.85rem',
            fontWeight: 700,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <Check size={16} />
          <span>{successToast}</span>
        </div>
      )}

      {/* Header & Actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            กลุ่มผู้ดูแล & ระบบสุ่มจ่ายงานลูกค้า
          </h2>
          <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            จัดทีมแอดมินดูแลลูกค้าแต่ละแบรนด์ และกำหนดระบบสุ่มหรือหมุนเวียนจ่ายงานอัตโนมัติ
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleBulkAutoAssign}
            disabled={autoAssigning || unassignedCount === 0}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #F59E0B',
              background: 'rgba(245, 158, 11, 0.1)',
              color: '#D97706',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: autoAssigning || unassignedCount === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: unassignedCount === 0 ? 0.6 : 1,
            }}
            title={unassignedCount > 0 ? `สุ่มจ่ายลูกค้า ${unassignedCount} คน` : 'ไม่มีลูกค้าที่ยังไม่มีผู้ดูแล'}
          >
            <Dices size={15} />
            <span>
              {autoAssigning
                ? 'กำลังสุ่มจ่ายงาน...'
                : `สุ่มจ่ายลูกค้าค้างอยู่ (${unassignedCount} คน)`}
            </span>
          </button>

          <button
            onClick={handleOpenCreate}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--blue)',
              color: '#fff',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Plus size={16} />
            <span>+ สร้างกลุ่มดูแลลูกค้า</span>
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
        <div
          style={{
            padding: '48px 20px',
            background: 'var(--surface)',
            borderRadius: '14px',
            border: '1px dashed var(--border)',
            textAlign: 'center',
          }}
        >
          <Users size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
          <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: 'var(--text-primary)' }}>
            ยังไม่มีกลุ่มดูแลลูกค้า
          </h3>
          <p style={{ margin: '0 0 16px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            สร้างกลุ่มแรก เช่น "ทีมขาย Wallcraft" แล้วเลือกแอดมินที่ต้องการให้ระบบสุ่มจ่ายลูกค้าให้
          </p>
          <button
            onClick={handleOpenCreate}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--blue)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            + สร้างกลุ่มแรก
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '16px' }}>
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
                          {m.avatar_url ? (
                            <img
                              src={m.avatar_url}
                              alt=""
                              style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover' }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '18px',
                                height: '18px',
                                borderRadius: '50%',
                                background: '#3B82F6',
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.65rem',
                                fontWeight: 800,
                              }}
                            >
                              {(m.nickname || m.first_name).charAt(0)}
                            </div>
                          )}
                          <span>{m.nickname || m.first_name}</span>
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
                    maxHeight: '180px',
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
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                      ไม่พบพนักงานตามคำค้นหา
                    </div>
                  ) : (
                    filteredUsers.map((u) => {
                      const isSelected = formAgentIds.includes(u.id);
                      return (
                        <div
                          key={u.id}
                          onClick={() => toggleAgent(u.id)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                            border: isSelected ? '1px solid #3B82F6' : '1px solid transparent',
                            transition: 'all 0.1s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {u.avatar_url ? (
                              <img
                                src={u.avatar_url}
                                alt=""
                                style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover' }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: '22px',
                                  height: '22px',
                                  borderRadius: '50%',
                                  background: '#3B82F6',
                                  color: '#fff',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.65rem',
                                  fontWeight: 800,
                                }}
                              >
                                {(u.nickname || u.first_name).charAt(0)}
                              </div>
                            )}
                            <div>
                              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {u.first_name} {u.last_name} {u.nickname ? `(${u.nickname})` : ''}
                              </span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginLeft: '6px' }}>
                                {u.position || u.department || ''}
                              </span>
                            </div>
                          </div>

                          <div
                            style={{
                              width: '18px',
                              height: '18px',
                              borderRadius: '4px',
                              border: isSelected ? '1px solid #3B82F6' : '1px solid var(--border)',
                              background: isSelected ? '#3B82F6' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#fff',
                            }}
                          >
                            {isSelected && <Check size={12} />}
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
