import { useState, useEffect, useMemo } from 'react';
import { BriefcaseBusiness, Plus, UsersRound, X } from 'lucide-react';
import { createPosition, createTeam, fetchPositions, fetchTeams, fetchUsers, approveUser, disableUser, updateUser, fetchMe } from '../services/adminApi';
import type { Position, Team, User } from '../types';
import { avatarUrl } from '../components/tasks/taskUtils';

export default function Employees() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [approvalMenuOpen, setApprovalMenuOpen] = useState(false);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamShortName, setNewTeamShortName] = useState('');
  const [newPositionName, setNewPositionName] = useState('');
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [showCreatePositionModal, setShowCreatePositionModal] = useState(false);
  const [addingTeam, setAddingTeam] = useState(false);
  const [addingPosition, setAddingPosition] = useState(false);

  // Search & Filter & Pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  // Edit Modal State
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<Partial<User>>({});

  useEffect(() => {
    loadUsers();
    loadMe();
    loadTeams();
    loadPositions();
  }, []);

  async function loadTeams() {
    try {
      const data = await fetchTeams();
      setTeams(data);
    } catch (err) {
      console.error('โหลดรายชื่อทีมล้มเหลว', err);
    }
  }

  async function loadPositions(teamId?: string) {
    try {
      const data = await fetchPositions(teamId);
      setPositions(data);
    } catch (err) {
      console.error('โหลดรายการตำแหน่งล้มเหลว', err);
    }
  }

  async function loadMe() {
    try {
      const me = await fetchMe();
      setCurrentAdminId(me.id);
    } catch (err) {
      console.error('โหลดข้อมูลตัวเองล้มเหลว', err);
    }
  }

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await fetchUsers();
      setUsers(data ?? []);
    } catch (err) {
      console.error('โหลดข้อมูลพนักงานล้มเหลว:', err);
    }
    setLoading(false);
  }

  // --- ACTIONS ---
  async function handleApprove(id: string) {
    setActionLoading(id);
    try {
      await approveUser(id);
      await loadUsers();
    } catch (err) {
      console.error('อนุมัติบัญชีล้มเหลว:', err);
      alert('อนุมัติบัญชีล้มเหลว');
    }
    setActionLoading(null);
  }

  async function handleDisable(id: string) {
    if (!confirm('ต้องการปิดบัญชีพนักงานนี้หรือไม่?')) return;
    setActionLoading(id);
    try {
      await disableUser(id);
      await loadUsers();
      if (editUser?.id === id) setEditUser(null);
    } catch (err) {
      console.error('ปิดบัญชีล้มเหลว:', err);
      alert('ปิดบัญชีล้มเหลว');
    }
    setActionLoading(null);
  }


  async function handleSaveEdit() {
    if (!editUser) return;
    setActionLoading(editUser.id);
    try {
      await updateUser(editUser.id, editForm);
      await loadUsers();
      setEditUser(null);
    } catch (err) {
      console.error('อัปเดตข้อมูลล้มเหลว:', err);
      alert('อัปเดตข้อมูลล้มเหลว');
    }
    setActionLoading(null);
  }

  async function handleAddTeam() {
    const name = newTeamName.trim();
    const shortName = newTeamShortName.trim();
    if (!name || !shortName) return;
    setAddingTeam(true);
    try {
      const team = await createTeam(name, shortName);
      setTeams(current => [...current, team]);
      setEditForm(current => ({ ...current, team_id: team.id, position_id: null, position: '', team: team.name }));
      setNewTeamName('');
      setNewTeamShortName('');
      setShowCreateTeamModal(false);
      await loadPositions(team.id);
    } catch (err) {
      console.error('เพิ่มทีมล้มเหลว:', err);
      alert('เพิ่มทีมไม่สำเร็จ');
    } finally {
      setAddingTeam(false);
    }
  }

  async function handleAddPosition() {
    const name = newPositionName.trim();
    const teamID = editForm.team_id;
    if (!name || !teamID) return;
    setAddingPosition(true);
    try {
      const position = await createPosition(teamID, name);
      setPositions(current => [...current, position]);
      setEditForm(current => ({ ...current, position_id: position.id, position: position.name }));
      setNewPositionName('');
      setShowCreatePositionModal(false);
    } catch (err) {
      console.error('เพิ่มตำแหน่งล้มเหลว:', err);
      alert('เพิ่มตำแหน่งไม่สำเร็จ');
    } finally {
      setAddingPosition(false);
    }
  }

  // --- FILTERING & PAGINATION ---
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchSearch = (u.first_name + ' ' + u.last_name + ' ' + (u.nickname || '') + ' ' + u.email).toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = filterStatus === 'all' || u.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [users, searchTerm, filterStatus]);

  const pendingUsers = useMemo(() => users.filter(user => user.status === 'pending'), [users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));

  // Auto-correct page if filtering reduces total pages
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  useEffect(() => {
    if (!approvalMenuOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setApprovalMenuOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [approvalMenuOpen]);

  const pagedUsers = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredUsers.slice(start, start + PAGE_SIZE);
  }, [filteredUsers, page]);

  function statusBadge(status: string) {
    const map: Record<string, { label: string; className: string }> = {
      active: { label: 'ใช้งาน', className: 'st-ontime' },
      pending: { label: 'รออนุมัติ', className: 'st-pending' },
      disabled: { label: 'ปิดบัญชี', className: 'st-disabled' },
    };
    const s = map[status] ?? { label: status, className: '' };
    return <span className={`status-badge ${s.className}`}>{s.label}</span>;
  }

  function roleBadge(role: string) {
    if (role === 'admin') {
      return <span style={{ color: 'var(--gold)', fontWeight: 'bold', fontSize: '13px' }}><i className="fa-solid fa-crown"></i> Admin</span>;
    }
    return <span style={{ color: 'var(--text-gray)', fontSize: '13px' }}>Employee</span>;
  }

  function renderTable(userList: User[], emptyMsg: string) {
    return (
      <table className="employee-table">
        <thead>
          <tr>
            <th>ชื่อ-นามสกุล</th>
            <th>ตำแหน่ง</th>
            <th>ทีม</th>
            <th>แผนก</th>
            <th>สิทธิ์</th>
            <th>สถานะ</th>
            <th style={{ textAlign: 'right' }}>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', padding: '30px' }}>
                กำลังโหลดข้อมูล...
              </td>
            </tr>
          ) : userList.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-gray)' }}>
                {emptyMsg}
              </td>
            </tr>
          ) : (
            userList.map((user) => (
              <tr key={user.id}>
                <td data-label="ชื่อ-นามสกุล">
                  <div className="employee-person">
                    <span className="employee-avatar" aria-hidden={avatarUrl(user.avatar_url) ? undefined : true}>
                      {avatarUrl(user.avatar_url) ? (
                        <img src={avatarUrl(user.avatar_url) || undefined} alt="" loading="lazy" />
                      ) : (
                        <span>{user.first_name?.trim().charAt(0).toUpperCase() || 'U'}</span>
                      )}
                    </span>
                    <span className="employee-person-copy">
                      <span className="employee-person-name">
                        {user.first_name} {user.last_name} {user.nickname ? `(${user.nickname})` : ''}
                      </span>
                      <span className="employee-person-email">{user.email}</span>
                    </span>
                  </div>
                </td>
                <td data-label="ตำแหน่ง">{user.position || '-'}</td>
                <td data-label="ทีม">{user.team || '-'}</td>
                <td data-label="แผนก">{user.department || '-'}</td>
                <td data-label="สิทธิ์">{roleBadge(user.role)}</td>
                <td data-label="สถานะ">{statusBadge(user.status)}</td>
                <td data-label="จัดการ" style={{ textAlign: 'right' }}>
                  {user.id === '' ? (
                    <span style={{ fontSize: '12px', color: 'var(--text-gray)', fontStyle: 'italic' }}>
                      (บัญชีของคุณ)
                    </span>
                  ) : (
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          setEditUser(user);
                          setEditForm({
                            first_name: user.first_name,
                            last_name: user.last_name,
                            nickname: user.nickname || '',
                            department: user.department,
                            position: user.position,
                            position_id: user.position_id || null,
                            team_id: user.team_id || null,
                            team: user.team || '',
                            role: user.role
                          });
                        }}
                        style={{ fontSize: '12px', padding: '4px 10px' }}
                      >
                        <i className="fa-solid fa-pen-to-square"></i> แก้ไข
                      </button>

                      {user.status === 'pending' && (
                        <button
                          className="btn-approve"
                          disabled={actionLoading === user.id}
                          onClick={() => handleApprove(user.id)}
                          style={{ fontSize: '12px', padding: '4px 10px' }}
                        >
                          <i className="fa-solid fa-check"></i> อนุมัติ
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    );
  }

  return (
    <div id="employees" className="page-section active">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
        <div className="employees-title-group">
          <h2>ฐานข้อมูลพนักงาน</h2>
          <div className="employee-approval-anchor">
            <button
              type="button"
              className={`employee-approval-button ${approvalMenuOpen ? 'active' : ''}`}
              onClick={() => setApprovalMenuOpen(previous => !previous)}
              aria-label={`บัญชีรออนุมัติ${pendingUsers.length > 0 ? ` ${pendingUsers.length} คน` : ''}`}
              aria-haspopup="dialog"
              aria-expanded={approvalMenuOpen}
              aria-controls="employee-approval-menu"
              title="บัญชีรออนุมัติ"
            >
              <i className="fa-solid fa-bell" aria-hidden="true"></i>
              {pendingUsers.length > 0 && <span className="employee-approval-badge">{pendingUsers.length > 99 ? '99+' : pendingUsers.length}</span>}
            </button>

            {approvalMenuOpen && (
              <div className="employee-approval-menu" id="employee-approval-menu" role="dialog" aria-label="บัญชีรอการอนุมัติ">
                <div className="employee-approval-menu-header">
                  <div>
                    <strong>บัญชีรอการอนุมัติ</strong>
                    <span>{pendingUsers.length > 0 ? `${pendingUsers.length} คน` : 'ไม่มีรายการใหม่'}</span>
                  </div>
                  <i className="fa-solid fa-user-clock" aria-hidden="true"></i>
                </div>

                {pendingUsers.slice(0, 5).map(user => (
                  <div className="employee-approval-item" key={user.id}>
                    <span className="employee-approval-avatar" aria-hidden="true">
                      {avatarUrl(user.avatar_url) ? (
                        <img src={avatarUrl(user.avatar_url) || undefined} alt="" />
                      ) : (
                        user.first_name?.trim().charAt(0).toUpperCase() || 'U'
                      )}
                    </span>
                    <span className="employee-approval-copy">
                      <strong>{user.first_name} {user.last_name}</strong>
                      <span>{user.email}</span>
                    </span>
                    <button
                      type="button"
                      className="employee-approval-action"
                      disabled={actionLoading === user.id}
                      onClick={() => handleApprove(user.id)}
                    >
                      <i className="fa-solid fa-check" aria-hidden="true"></i>
                      อนุมัติ
                    </button>
                  </div>
                ))}

                {pendingUsers.length > 5 && <p className="employee-approval-more">ยังมีอีก {pendingUsers.length - 5} คนในรายการสถานะ “รออนุมัติ”</p>}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
          <div className="search-input-wrapper" style={{ flex: '1 1 200px', maxWidth: '300px', position: 'relative' }}>
            <i className="fa-solid fa-search" style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-gray)' }}></i>
            <input
              type="text"
              placeholder="ค้นหาชื่อ หรือ อีเมล..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
              className="form-control"
              style={{ width: '100%', paddingLeft: '40px', margin: 0 }}
            />
          </div>

          <select
            value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
            className="form-control"
            style={{ width: 'auto', margin: 0, cursor: 'pointer' }}
          >
            <option value="all">สถานะทั้งหมด</option>
            <option value="active">ใช้งานปกติ</option>
            <option value="pending">รออนุมัติ</option>
            <option value="disabled">ปิดบัญชี</option>
          </select>

          <button className="btn-primary" onClick={loadUsers} style={{ borderRadius: '20px' }}>
            <i className="fa-solid fa-rotate-right"></i> โหลดใหม่
          </button>
        </div>
      </div>

      <div className="table-card glass-panel">
        {renderTable(pagedUsers, 'ไม่พบข้อมูลพนักงาน')}

        {/* Pagination Controls */}
        {!loading && filteredUsers.length > PAGE_SIZE && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
            <div className="text-xs font-semibold text-slate-500">
              แสดง {((page - 1) * PAGE_SIZE) + 1} - {Math.min(page * PAGE_SIZE, filteredUsers.length)} จากทั้งหมด {filteredUsers.length} รายการ
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-slate-700 disabled:cursor-not-allowed transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <i className="fa-solid fa-chevron-left text-[10px]"></i>
                ก่อนหน้า
              </button>

              <div className="px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl shadow-2xs">
                หน้า {page} / {totalPages}
              </div>

              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-slate-700 disabled:cursor-not-allowed transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                ถัดไป
                <i className="fa-solid fa-chevron-right text-[10px]"></i>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit User Modal */}
      {editUser && (
        <div
          className="modal-overlay"
          onMouseDown={event => {
            if (event.target === event.currentTarget && actionLoading !== editUser.id) {
              setShowCreateTeamModal(false);
              setShowCreatePositionModal(false);
              setEditUser(null);
            }
          }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, padding: '20px' }}
        >
          <div className="modal-content glass-panel employee-edit-modal" style={{ width: '100%', maxWidth: '680px', padding: '24px', borderRadius: '20px' }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e0ecff', color: '#2563eb', fontWeight: 800 }}>
                {avatarUrl(editUser.avatar_url) ? (
                  <img src={avatarUrl(editUser.avatar_url) || undefined} alt={`รูปโปรไฟล์ ${editUser.first_name}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  editUser.first_name?.trim().charAt(0).toUpperCase() || 'U'
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0 }}>แก้ไขข้อมูลพนักงาน</h3>
                <div style={{ marginTop: '3px', fontSize: '12px', color: 'var(--text-gray)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {editUser.nickname || editUser.first_name} · {editUser.email}
                </div>
              </div>
            </header>

            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div style={{ flex: 2 }}>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-gray)', marginBottom: '5px' }}>ชื่อ</label>
                <input
                  type="text"
                  value={editForm.first_name || ''}
                  onChange={e => setEditForm({ ...editForm, first_name: e.target.value })}
                  className="form-control"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: 2 }}>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-gray)', marginBottom: '5px' }}>นามสกุล</label>
                <input
                  type="text"
                  value={editForm.last_name || ''}
                  onChange={e => setEditForm({ ...editForm, last_name: e.target.value })}
                  className="form-control"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-gray)', marginBottom: '5px' }}>ชื่อเล่น</label>
                <input
                  type="text"
                  value={editForm.nickname || ''}
                  onChange={e => setEditForm({ ...editForm, nickname: e.target.value })}
                  className="form-control"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-gray)', marginBottom: '5px' }}>แผนก</label>
              <input
                type="text"
                value={editForm.department || ''}
                onChange={e => setEditForm({ ...editForm, department: e.target.value })}
                className="form-control"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-gray)', marginBottom: '5px' }}>ทีม</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  value={editForm.team_id || ''}
                  onChange={e => {
                    const selectedTeam = teams.find(team => team.id === e.target.value);
                    setEditForm({
                      ...editForm,
                      team_id: selectedTeam?.id || null,
                      position_id: null,
                      position: '',
                      team: selectedTeam?.name || '',
                    });
                    void loadPositions(selectedTeam?.id);
                  }}
                  className="form-control"
                  style={{ flex: 1, boxSizing: 'border-box' }}
                >
                  <option value="">ยังไม่ระบุทีม</option>
                  {teams.map(team => <option key={team.id} value={team.id}>{team.name} ({team.short_name})</option>)}
                </select>
                <button className="btn-secondary" type="button" onClick={() => setShowCreateTeamModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <UsersRound size={15} /> <span>เพิ่มทีม</span>
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-gray)', marginBottom: '5px' }}>ตำแหน่ง</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  value={editForm.position_id || ''}
                  onChange={e => {
                    const selectedPosition = positions.find(position => position.id === e.target.value);
                    setEditForm({
                      ...editForm,
                      position_id: selectedPosition?.id || null,
                      position: selectedPosition?.name || '',
                    });
                  }}
                  className="form-control"
                  style={{ flex: 1, boxSizing: 'border-box' }}
                  disabled={!editForm.team_id}
                >
                  <option value="">ยังไม่ระบุตำแหน่ง</option>
                  {positions.filter(position => position.team_id === editForm.team_id).map(position => (
                    <option key={position.id} value={position.id}>{position.name}</option>
                  ))}
                </select>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setShowCreatePositionModal(true)}
                  disabled={!editForm.team_id}
                  title={editForm.team_id ? 'เพิ่มตำแหน่งใหม่' : 'กรุณาเลือกทีมก่อน'}
                >
                  <Plus size={15} /> <span>เพิ่มตำแหน่ง</span>
                </button>
              </div>
              {!editForm.team_id && <div style={{ marginTop: '5px', fontSize: '12px', color: 'var(--text-gray)' }}>เลือกทีมก่อน แล้วจึงเพิ่มตำแหน่งได้</div>}
            </div>

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-gray)', marginBottom: '5px' }}>สิทธิ์การใช้งาน (Role)</label>
              <select
                value={editForm.role || 'employee'}
                onChange={e => setEditForm({ ...editForm, role: e.target.value as 'employee' | 'admin' })}
                disabled={editUser.id === currentAdminId}
                className="form-control"
                style={{ width: '100%', boxSizing: 'border-box' }}
              >
                <option value="employee">พนักงาน (Employee)</option>
                <option value="admin">ผู้ดูแลระบบ (Admin)</option>
              </select>
            </div>

            <div className="employee-edit-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              {editUser.status === 'active' && editUser.id !== currentAdminId && (
                <button
                  className="btn-reject"
                  type="button"
                  onClick={() => void handleDisable(editUser.id)}
                  disabled={actionLoading === editUser.id}
                  style={{ padding: '8px 16px', marginRight: 'auto' }}
                >
                  <i className="fa-solid fa-ban"></i> ปิดบัญชี
                </button>
              )}
              <button
                className="btn-secondary"
                onClick={() => setEditUser(null)}
                disabled={actionLoading === editUser.id}
                style={{ padding: '8px 16px' }}
              >
                ยกเลิก
              </button>
              <button
                className="btn-primary"
                onClick={handleSaveEdit}
                disabled={actionLoading === editUser.id}
                style={{ padding: '8px 16px' }}
              >
                {actionLoading === editUser.id ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
              </button>
            </div>
          </div>

          {showCreateTeamModal && (
            <div onMouseDown={event => { if (event.target === event.currentTarget && !addingTeam) setShowCreateTeamModal(false); }} style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: 'rgba(15, 23, 42, 0.52)' }}>
              <div role="dialog" aria-modal="true" aria-label="สร้างทีมใหม่" style={{ width: '100%', maxWidth: '440px', overflow: 'hidden', borderRadius: '20px', background: '#fff', boxShadow: '0 28px 72px rgba(15, 23, 42, 0.32)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '20px 20px 16px', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'grid', width: '42px', height: '42px', flexShrink: 0, placeItems: 'center', borderRadius: '13px', background: '#eff6ff', color: '#2563eb' }}><UsersRound size={21} /></div>
                  <div style={{ flex: 1 }}><h3 style={{ margin: 0, color: '#0f172a' }}>สร้างทีมใหม่</h3><p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>สร้างเสร็จ ระบบจะเลือกทีมนี้ให้พนักงานทันที</p></div>
                  <button type="button" aria-label="ปิด" onClick={() => setShowCreateTeamModal(false)} disabled={addingTeam} style={{ display: 'grid', width: '32px', height: '32px', placeItems: 'center', border: 0, borderRadius: '9px', background: 'transparent', color: '#64748b', cursor: 'pointer' }}><X size={18} /></button>
                </div>
                <div style={{ display: 'grid', gap: '14px', padding: '20px' }}>
                  <label style={{ display: 'grid', gap: '7px', fontSize: '13px', fontWeight: 700, color: '#334155' }}>ชื่อทีม<input autoFocus type="text" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="เช่น Sales" maxLength={50} style={{ width: '100%', boxSizing: 'border-box', minHeight: '46px', padding: '0 13px', border: '1px solid #cbd5e1', borderRadius: '11px', outline: 'none', background: '#f8fafc', color: '#0f172a', fontSize: '14px' }} /></label>
                  <label style={{ display: 'grid', gap: '7px', fontSize: '13px', fontWeight: 700, color: '#334155' }}>ชื่อย่อ<input type="text" value={newTeamShortName} onChange={e => setNewTeamShortName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleAddTeam(); } }} placeholder="เช่น SAL" maxLength={12} style={{ width: '100%', boxSizing: 'border-box', minHeight: '46px', padding: '0 13px', border: '1px solid #cbd5e1', borderRadius: '11px', outline: 'none', background: '#f8fafc', color: '#0f172a', fontSize: '14px' }} /></label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '16px 20px 20px', borderTop: '1px solid #e2e8f0' }}>
                  <button className="btn-secondary" type="button" onClick={() => setShowCreateTeamModal(false)} disabled={addingTeam}>ยกเลิก</button>
                  <button className="btn-primary" type="button" onClick={handleAddTeam} disabled={addingTeam || !newTeamName.trim() || !newTeamShortName.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Plus size={16} />{addingTeam ? 'กำลังสร้าง...' : 'สร้างทีม'}</button>
                </div>
              </div>
            </div>
          )}

          {showCreatePositionModal && (
            <div onMouseDown={event => { if (event.target === event.currentTarget && !addingPosition) setShowCreatePositionModal(false); }} style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: 'rgba(15, 23, 42, 0.52)' }}>
              <div role="dialog" aria-modal="true" aria-label="เพิ่มตำแหน่ง" style={{ width: '100%', maxWidth: '440px', overflow: 'hidden', borderRadius: '20px', background: '#fff', boxShadow: '0 28px 72px rgba(15, 23, 42, 0.32)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '20px 20px 16px', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'grid', width: '42px', height: '42px', flexShrink: 0, placeItems: 'center', borderRadius: '13px', background: '#f0fdf4', color: '#16a34a' }}><BriefcaseBusiness size={21} /></div>
                  <div style={{ flex: 1 }}><h3 style={{ margin: 0, color: '#0f172a' }}>เพิ่มตำแหน่ง</h3><p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>สำหรับทีม {teams.find(team => team.id === editForm.team_id)?.name || ''}</p></div>
                  <button type="button" aria-label="ปิด" onClick={() => setShowCreatePositionModal(false)} disabled={addingPosition} style={{ display: 'grid', width: '32px', height: '32px', placeItems: 'center', border: 0, borderRadius: '9px', background: 'transparent', color: '#64748b', cursor: 'pointer' }}><X size={18} /></button>
                </div>
                <div style={{ padding: '20px' }}><label style={{ display: 'grid', gap: '7px', fontSize: '13px', fontWeight: 700, color: '#334155' }}>ชื่อตำแหน่ง<input autoFocus type="text" value={newPositionName} onChange={e => setNewPositionName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleAddPosition(); } }} placeholder="เช่น Sales" maxLength={80} style={{ width: '100%', boxSizing: 'border-box', minHeight: '46px', padding: '0 13px', border: '1px solid #cbd5e1', borderRadius: '11px', outline: 'none', background: '#f8fafc', color: '#0f172a', fontSize: '14px' }} /></label></div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '16px 20px 20px', borderTop: '1px solid #e2e8f0' }}>
                  <button className="btn-secondary" type="button" onClick={() => setShowCreatePositionModal(false)} disabled={addingPosition}>ยกเลิก</button>
                  <button className="btn-primary" type="button" onClick={handleAddPosition} disabled={addingPosition || !newPositionName.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Plus size={16} />{addingPosition ? 'กำลังเพิ่ม...' : 'เพิ่มตำแหน่ง'}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
