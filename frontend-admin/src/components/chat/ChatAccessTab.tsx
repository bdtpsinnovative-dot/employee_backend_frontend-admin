import { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Trash2,
  Check,
  RefreshCw,
  X,
  UserPlus,
  UserCheck,
  Lock,
} from 'lucide-react';
import { fetchUsers } from '../../services/adminApi';
import {
  fetchChatAccessUsers,
  saveChatAccessUsers,
} from '../../services/chatRoutingService';
import type { ChatAccessUser, User } from '../../types';
import { avatarUrl } from '../tasks/taskUtils';

function AvatarImg({ url, name, size = 32 }: { url?: string | null; name: string; size?: number }) {
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
        fontSize: size <= 22 ? '0.65rem' : size <= 28 ? '0.75rem' : '0.85rem',
        flexShrink: 0,
      }}
    >
      {(name || 'U').charAt(0).toUpperCase()}
    </div>
  );
}

export default function ChatAccessTab() {
  const [accessUsers, setAccessUsers] = useState<ChatAccessUser[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [accessList, userList] = await Promise.all([
        fetchChatAccessUsers(),
        fetchUsers().catch(() => []),
      ]);
      setAccessUsers(accessList);
      setUsers(userList);
    } catch (err: any) {
      console.error('Failed to load access users:', err);
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

  // Toggle user permission enable/disable
  const handleToggleEnable = async (userId: string) => {
    const updated = accessUsers.map((u) =>
      u.user_id === userId ? { ...u, is_enabled: !u.is_enabled } : u
    );
    const ok = await saveChatAccessUsers(updated);
    if (ok) {
      setAccessUsers(updated);
      const targetUser = users.find((u) => u.id === userId);
      const name = targetUser ? targetUser.nickname || targetUser.first_name : '';
      showNotification(`อัปเดตสิทธิ์ของ ${name} เรียบร้อยแล้ว`);
    }
  };

  // Delete / Revoke user permission
  const handleRevoke = async (userId: string) => {
    const targetUser = users.find((u) => u.id === userId);
    const name = targetUser ? targetUser.nickname || targetUser.first_name : 'ผู้ใช้นี้';
    if (!window.confirm(`คุณต้องการยกเลิกสิทธิ์เข้าใช้งานหน้ารวมแชทของ ${name} ใช่หรือไม่?`)) {
      return;
    }

    const updated = accessUsers.filter((u) => u.user_id !== userId);
    const ok = await saveChatAccessUsers(updated);
    if (ok) {
      setAccessUsers(updated);
      showNotification(`ยกเลิกสิทธิ์ของ ${name} เรียบร้อยแล้ว`);
    }
  };

  // Open Add Modal
  const handleOpenAddModal = () => {
    setSelectedUserIds([]);
    setSearchQuery('');
    setShowAddModal(true);
  };

  // Toggle select in add modal
  const toggleSelectUser = (id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((uId) => uId !== id) : [...prev, id]
    );
  };

  // Save Added Users
  const handleSaveAddUsers = async () => {
    if (selectedUserIds.length === 0) return;

    try {
      setSaving(true);
      const newEntries: ChatAccessUser[] = selectedUserIds.map((id) => ({
        user_id: id,
        added_at: new Date().toISOString(),
        is_enabled: true,
      }));

      const updated = [...accessUsers, ...newEntries];
      const ok = await saveChatAccessUsers(updated);
      if (!ok) throw new Error('บันทึกสิทธิ์ไม่สำเร็จ');

      setAccessUsers(updated);
      setShowAddModal(false);
      showNotification(`เพิ่มสิทธิ์พนักงาน ${selectedUserIds.length} คน เรียบร้อยแล้ว!`);
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Available users not yet in whitelist
  const alreadyAddedIds = new Set(accessUsers.map((u) => u.user_id));
  const availableToAdd = users.filter((u) => {
    if (alreadyAddedIds.has(u.id)) return false;
    if (u.role === 'admin') return false; // Admins already have automatic permission
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    const name = `${u.first_name} ${u.last_name} ${u.nickname || ''}`.toLowerCase();
    const email = (u.email || '').toLowerCase();
    const dept = (u.department || '').toLowerCase();
    return name.includes(query) || email.includes(query) || dept.includes(query);
  });

  const superAdmins = users.filter((u) => u.role === 'admin');

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

      {/* Header */}
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
            สิทธิ์การเข้าใช้งานหน้ารวมแชท (Chat Inbox Permissions)
          </h2>
          <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            กำหนดว่าพนักงานคนไหนสามารถมองเห็นเมนูและเข้าใช้งานหน้ารวมแชท LINE, FB, IG ได้บ้าง
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
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
          <UserPlus size={16} />
          <span>+ เพิ่มผู้มีสิทธิ์เข้าใช้งาน</span>
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <RefreshCw size={22} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
          <p style={{ margin: 0, fontSize: '0.85rem' }}>กำลังโหลดรายชื่อผู้มีสิทธิ์...</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Whitelisted Users Table */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '14px',
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={16} style={{ color: 'var(--blue)' }} />
                <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  พนักงานที่ได้รับสิทธิ์เฉพาะ ({accessUsers.length} คน)
                </span>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                พนักงานที่แอดมินกดเพิ่มสิทธิ์ให้ด้วยตัวเอง
              </span>
            </div>

            {accessUsers.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <Lock size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>ยังไม่มีการเพิ่มพนักงานในรายการสิทธิ์เฉพาะ</p>
                <p style={{ margin: '4px 0 14px', fontSize: '0.78rem' }}>
                  กดปุ่ม "+ เพิ่มผู้มีสิทธิ์เข้าใช้งาน" เพื่ออนุญาตให้เซลล์หรือแอดมินเข้าถึงหน้ารวมแชท
                </p>
                <button
                  onClick={handleOpenAddModal}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'var(--blue)',
                    color: '#fff',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  + เพิ่มพนักงานคนแรก
                </button>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'var(--surface)' }}>
                      <th style={{ padding: '10px 18px', fontWeight: 700 }}>พนักงาน</th>
                      <th style={{ padding: '10px 18px', fontWeight: 700 }}>แผนก / ตำแหน่ง</th>
                      <th style={{ padding: '10px 18px', fontWeight: 700 }}>วันที่เพิ่มสิทธิ์</th>
                      <th style={{ padding: '10px 18px', fontWeight: 700 }}>สถานะสิทธิ์</th>
                      <th style={{ padding: '10px 18px', fontWeight: 700, textAlign: 'right' }}>การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessUsers.map((item) => {
                      const userObj = users.find((u) => u.id === item.user_id);
                      if (!userObj) return null;

                      return (
                        <tr
                          key={item.user_id}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            transition: 'background 0.1s ease',
                          }}
                        >
                          <td style={{ padding: '12px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <AvatarImg
                                url={userObj.avatar_url}
                                name={userObj.nickname || userObj.first_name}
                                size={32}
                              />
                              <div>
                                <span style={{ fontWeight: 800, color: 'var(--text-primary)', display: 'block' }}>
                                  {userObj.first_name} {userObj.last_name} {userObj.nickname ? `(${userObj.nickname})` : ''}
                                </span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                  {userObj.email}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td style={{ padding: '12px 18px', color: 'var(--text-secondary)' }}>
                            <span style={{ fontWeight: 600 }}>{userObj.position || '-'}</span>
                            <span style={{ fontSize: '0.72rem', display: 'block', opacity: 0.8 }}>{userObj.department || ''}</span>
                          </td>

                          <td style={{ padding: '12px 18px', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                            {new Date(item.added_at).toLocaleDateString('th-TH', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>

                          <td style={{ padding: '12px 18px' }}>
                            <button
                              onClick={() => handleToggleEnable(item.user_id)}
                              style={{
                                border: 'none',
                                background: item.is_enabled ? '#DEF7EC' : 'var(--surface-muted)',
                                color: item.is_enabled ? '#03543F' : 'var(--text-secondary)',
                                padding: '3px 10px',
                                borderRadius: '12px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <span
                                style={{
                                  width: '6px',
                                  height: '6px',
                                  borderRadius: '50%',
                                  background: item.is_enabled ? '#059669' : '#9CA3AF',
                                }}
                              />
                              <span>{item.is_enabled ? 'อนุญาตให้เข้าใช้งาน' : 'ระงับสิทธิ์ชั่วคราว'}</span>
                            </button>
                          </td>

                          <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                            <button
                              onClick={() => handleRevoke(item.user_id)}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '6px',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                background: 'rgba(239, 68, 68, 0.08)',
                                color: '#EF4444',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                              title="ยกเลิกสิทธิ์"
                            >
                              <Trash2 size={13} />
                              <span>ลบสิทธิ์</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Super Admins Note Box */}
          <div
            style={{
              padding: '14px 18px',
              borderRadius: '12px',
              background: 'var(--surface-muted)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <UserCheck size={20} style={{ color: '#059669', flexShrink: 0 }} />
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>ผู้ดูแลระบบระดับสูง (Super Admin):</strong>{' '}
              ผู้ที่มี Role Admin ({superAdmins.map((a) => a.nickname || a.first_name).join(', ') || 'Admin'})
              จะได้รับสิทธิ์เข้าใช้งานหน้ารวมแชทและหน้าตั้งค่านี้โดยอัตโนมัติตลอดเวลา ไม่จำเป็นต้องกดเพิ่มในตารางครับ
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD ACCESS USERS ================= */}
      {showAddModal && (
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
            if (e.target === e.currentTarget) setShowAddModal(false);
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '520px',
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
              padding: '22px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserPlus size={20} style={{ color: 'var(--blue)' }} />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  เลือกพนักงานที่ต้องการให้สิทธิ์เข้าหน้ารวมแชท
                </h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={18} />
              </button>
            </div>

            <input
              type="text"
              placeholder="🔍 ค้นหาชื่อ, อีเมล, แผนก..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--surface-muted)',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
                marginBottom: '12px',
                boxSizing: 'border-box',
              }}
            />

            <div
              style={{
                maxHeight: '320px',
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
              {availableToAdd.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                  {searchQuery ? 'ไม่พบพนักงานตามคำค้นหา' : 'พนักงานทุกคนได้รับสิทธิ์แล้ว'}
                </div>
              ) : (
                availableToAdd.map((u) => {
                  const isSelected = selectedUserIds.includes(u.id);
                  return (
                    <div
                      key={u.id}
                      onClick={() => toggleSelectUser(u.id)}
                      style={{
                        padding: '8px 12px',
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <AvatarImg
                          url={u.avatar_url}
                          name={u.nickname || u.first_name}
                          size={28}
                        />
                        <div>
                          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)', display: 'block' }}>
                            {u.first_name} {u.last_name} {u.nickname ? `(${u.nickname})` : ''}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            {u.position || u.department || u.email}
                          </span>
                        </div>
                      </div>

                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '5px',
                          border: isSelected ? '1px solid #3B82F6' : '1px solid var(--border)',
                          background: isSelected ? '#3B82F6' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                        }}
                      >
                        {isSelected && <Check size={14} />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                เลือกแล้ว: <strong style={{ color: 'var(--text-primary)' }}>{selectedUserIds.length}</strong> คน
              </span>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setShowAddModal(false)}
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
                  onClick={handleSaveAddUsers}
                  disabled={saving || selectedUserIds.length === 0}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--blue)',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: saving || selectedUserIds.length === 0 ? 'not-allowed' : 'pointer',
                    fontSize: '0.82rem',
                    opacity: selectedUserIds.length === 0 ? 0.6 : 1,
                  }}
                >
                  {saving ? 'กำลังเพิ่ม...' : `เพิ่มผู้มีสิทธิ์ (${selectedUserIds.length})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
