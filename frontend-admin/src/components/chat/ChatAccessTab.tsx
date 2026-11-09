import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Shield,
  Trash2,
  Check,
  RefreshCw,
  X,
  UserPlus,
  UserCheck,
  Lock,
  Search,
} from 'lucide-react';
import { fetchUsers } from '../../services/adminApi';
import {
  fetchChatAccessUsers,
  saveChatAccessUsers,
} from '../../services/chatRoutingService';
import type { ChatAccessUser, User } from '../../types';
import { avatarUrl } from '../tasks/taskUtils';

function AvatarImg({ url, name, size = 36 }: { url?: string | null; name: string; size?: number }) {
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
        background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: size <= 24 ? '0.7rem' : size <= 32 ? '0.8rem' : '0.9rem',
        flexShrink: 0,
        boxShadow: '0 2px 6px rgba(59, 130, 246, 0.25)',
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
  const [tableSearch, setTableSearch] = useState('');
  const [modalSearch, setModalSearch] = useState('');
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
    setTimeout(() => setSuccessToast(null), 3000);
  };

  // Toggle enable/disable
  const handleToggleEnable = async (userId: string) => {
    const updated = accessUsers.map((u) =>
      u.user_id === userId ? { ...u, is_enabled: !u.is_enabled } : u
    );
    const ok = await saveChatAccessUsers(updated);
    if (ok) {
      setAccessUsers(updated);
      showNotification('อัปเดตสถานะสิทธิ์เรียบร้อย');
    }
  };

  // Revoke permission
  const handleRevoke = async (userId: string) => {
    const user = users.find((u) => u.id === userId);
    const name = user ? `${user.first_name} ${user.last_name}` : 'พนักงาน';
    if (!window.confirm(`ยืนยันการลบสิทธิ์เข้าใช้งานหน้ารวมแชทของ "${name}" ใช่หรือไม่?`)) return;

    const updated = accessUsers.filter((u) => u.user_id !== userId);
    const ok = await saveChatAccessUsers(updated);
    if (ok) {
      setAccessUsers(updated);
      showNotification(`ลบสิทธิ์ของ ${name} เรียบร้อยแล้ว`);
    }
  };

  // Open Add Modal
  const handleOpenAddModal = () => {
    setSelectedUserIds([]);
    setModalSearch('');
    setShowAddModal(true);
  };

  const toggleSelectUser = (id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((uId) => uId !== id) : [...prev, id]
    );
  };

  const selectAllAvailable = () => {
    if (selectedUserIds.length === availableToAdd.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(availableToAdd.map((u) => u.id));
    }
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
  const alreadyAddedIds = useMemo(() => new Set(accessUsers.map((u) => u.user_id)), [accessUsers]);
  const availableToAdd = useMemo(() => {
    return users.filter((u) => {
      if (alreadyAddedIds.has(u.id)) return false;
      if (u.role === 'admin') return false; // Admins already have automatic permission
      const query = modalSearch.toLowerCase().trim();
      if (!query) return true;
      const name = `${u.first_name} ${u.last_name} ${u.nickname || ''}`.toLowerCase();
      const email = (u.email || '').toLowerCase();
      const dept = (u.department || '').toLowerCase();
      return name.includes(query) || email.includes(query) || dept.includes(query);
    });
  }, [users, alreadyAddedIds, modalSearch]);

  // Filtered Whitelisted Users in table
  const filteredAccessUsers = useMemo(() => {
    return accessUsers.filter((item) => {
      if (!tableSearch.trim()) return true;
      const u = users.find((usr) => usr.id === item.user_id);
      if (!u) return false;
      const q = tableSearch.toLowerCase().trim();
      const name = `${u.first_name} ${u.last_name} ${u.nickname || ''}`.toLowerCase();
      const email = (u.email || '').toLowerCase();
      const dept = (u.department || '').toLowerCase();
      const pos = (u.position || '').toLowerCase();
      return name.includes(q) || email.includes(q) || dept.includes(q) || pos.includes(q);
    });
  }, [accessUsers, users, tableSearch]);

  const superAdmins = useMemo(() => users.filter((u) => u.role === 'admin'), [users]);

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
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="ค้นหาชื่อพนักงาน, อีเมล, ตำแหน่ง..."
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-xl text-xs text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-2xs transition-all"
          />
          {tableSearch && (
            <button
              onClick={() => setTableSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Action Button */}
        <button
          onClick={handleOpenAddModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-sm transition-all shrink-0 cursor-pointer"
        >
          <UserPlus size={15} />
          <span>เพิ่มผู้มีสิทธิ์เข้าใช้งาน</span>
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400">
          <RefreshCw size={22} className="animate-spin mx-auto mb-2 text-blue-500" />
          <p className="text-xs">กำลังโหลดรายชื่อผู้มีสิทธิ์...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Whitelisted Users Card */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
            {/* Table Header Bar */}
            <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-zinc-850/50 border-b border-slate-200/80 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-blue-600" />
                <span className="text-xs font-extrabold text-slate-800 dark:text-zinc-100">
                  รายชื่อผู้ได้รับสิทธิ์ ({accessUsers.length} คน)
                </span>
                {tableSearch && (
                  <span className="text-[11px] text-slate-400">
                    · พบ {filteredAccessUsers.length} คนจากการค้นหา
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                คลิกที่สถานะเพื่อเปิด/ปิดสิทธิ์ได้ทันที
              </span>
            </div>

            {filteredAccessUsers.length === 0 ? (
              <div className="py-16 px-4 text-center">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center mx-auto mb-3">
                  <Lock size={22} />
                </div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                  {tableSearch ? 'ไม่พบพนักงานตามคำค้นหา' : 'ยังไม่มีพนักงานในรายการสิทธิ์เฉพาะ'}
                </h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  {tableSearch
                    ? 'ลองพิมพ์ค้นหาด้วยคำอื่น หรือคลิกปุ่มเพื่อล้างการค้นหา'
                    : 'คลิกปุ่ม "เพิ่มผู้มีสิทธิ์เข้าใช้งาน" ด้านบนเพื่อเลือกพนักงานที่ต้องการให้อนุญาตเข้าดูแชท'}
                </p>
                {!tableSearch && (
                  <button
                    onClick={handleOpenAddModal}
                    className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-xs font-bold transition-all cursor-pointer"
                  >
                    <UserPlus size={14} />
                    <span>เพิ่มพนักงานคนแรก</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-zinc-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/40 dark:bg-zinc-850/20">
                      <th className="py-3 px-5">พนักงาน</th>
                      <th className="py-3 px-5">แผนก / ตำแหน่ง</th>
                      <th className="py-3 px-5">วันที่เพิ่ม</th>
                      <th className="py-3 px-5">สถานะการเข้าใช้งาน</th>
                      <th className="py-3 px-5 text-right">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
                    {filteredAccessUsers.map((item) => {
                      const userObj = users.find((u) => u.id === item.user_id);
                      if (!userObj) return null;

                      return (
                        <tr
                          key={item.user_id}
                          className="hover:bg-slate-50/60 dark:hover:bg-zinc-850/40 transition-colors"
                        >
                          {/* User Info */}
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-3">
                              <AvatarImg
                                url={userObj.avatar_url}
                                name={userObj.nickname || userObj.first_name}
                                size={36}
                              />
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                                    {userObj.first_name} {userObj.last_name}
                                  </span>
                                  {userObj.nickname && (
                                    <span className="px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-[10px] font-bold">
                                      {userObj.nickname}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-slate-400 block mt-0.5">
                                  {userObj.email}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Position / Department */}
                          <td className="py-3.5 px-5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                              {userObj.position || userObj.department || 'พนักงาน'}
                            </span>
                          </td>

                          {/* Date Added */}
                          <td className="py-3.5 px-5 text-xs text-slate-400">
                            {new Date(item.added_at).toLocaleDateString('th-TH', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>

                          {/* Status Toggle Switch */}
                          <td className="py-3.5 px-5">
                            <button
                              onClick={() => void handleToggleEnable(item.user_id)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                                item.is_enabled
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 hover:bg-emerald-100'
                                  : 'bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-slate-200'
                              }`}
                              title="คลิกเพื่อสลับสถานะ"
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  item.is_enabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                                }`}
                              />
                              <span>{item.is_enabled ? 'อนุญาตให้เข้าใช้งาน' : 'ระงับสิทธิ์ชั่วคราว'}</span>
                            </button>
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-5 text-right">
                            <button
                              onClick={() => void handleRevoke(item.user_id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold transition-all cursor-pointer"
                              title="ลบสิทธิ์"
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

          {/* Super Admin Subtle Notice */}
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-50 dark:bg-zinc-850/50 border border-slate-200/80 dark:border-zinc-800 text-xs text-slate-500 dark:text-zinc-400">
            <UserCheck size={16} className="text-emerald-600 shrink-0" />
            <span>
              <strong className="text-slate-700 dark:text-zinc-200">สิทธิ์ Super Admin:</strong>{' '}
              ผู้ที่มี Role Admin ({superAdmins.map((a) => a.nickname || a.first_name).join(', ') || 'Admin'})
              จะมีสิทธิ์เข้าใช้งานหน้ารวมแชทและหน้าตั้งค่านี้ได้โดยอัตโนมัติอยู่แล้ว
            </span>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD ACCESS USERS ================= */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddModal(false);
          }}
        >
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center">
                  <UserPlus size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                    เลือกพนักงานเพื่อมอบสิทธิ์
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    พนักงานที่เลือกจะสามารถมองเห็นเมนูและเข้าใช้งานหน้ารวมแชทได้
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Search Bar */}
            <div className="p-4 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-850/30">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อ, อีเมล, แผนก..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-750 rounded-xl text-xs text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>

              {availableToAdd.length > 0 && (
                <div className="flex items-center justify-between mt-2 pt-2 text-[11px] text-slate-500">
                  <span>พบพนักงาน {availableToAdd.length} คนที่ยังไม่ได้รับสิทธิ์</span>
                  <button
                    onClick={selectAllAvailable}
                    className="text-blue-600 font-bold hover:underline cursor-pointer"
                  >
                    {selectedUserIds.length === availableToAdd.length ? 'ยกเลิกการเลือกทั้งหมด' : 'เลือกทั้งหมด'}
                  </button>
                </div>
              )}
            </div>

            {/* Modal Users List */}
            <div className="p-3 overflow-y-auto flex-1 space-y-1.5 divide-y divide-slate-100/60 dark:divide-zinc-800/60">
              {availableToAdd.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  {modalSearch ? 'ไม่พบพนักงานตามคำค้นหา' : 'พนักงานทุกคนได้รับสิทธิ์แล้ว'}
                </div>
              ) : (
                availableToAdd.map((u) => {
                  const isSelected = selectedUserIds.includes(u.id);
                  return (
                    <div
                      key={u.id}
                      onClick={() => toggleSelectUser(u.id)}
                      className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-blue-50/80 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                          : 'hover:bg-slate-50 dark:hover:bg-zinc-800/50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <AvatarImg
                          url={u.avatar_url}
                          name={u.nickname || u.first_name}
                          size={32}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-900 dark:text-zinc-100 truncate">
                              {u.first_name} {u.last_name}
                            </span>
                            {u.nickname && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                                {u.nickname}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 block truncate">
                            {u.position || u.department || u.email}
                          </span>
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800'
                        }`}
                      >
                        {isSelected && <Check size={13} />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 bg-slate-50/80 dark:bg-zinc-850/50 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                เลือกแล้ว <strong className="text-blue-600 font-extrabold">{selectedUserIds.length}</strong> คน
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleSaveAddUsers}
                  disabled={saving || selectedUserIds.length === 0}
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
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
