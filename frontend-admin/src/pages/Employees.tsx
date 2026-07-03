import { useState, useEffect, useMemo } from 'react';
import { fetchUsers, approveUser, disableUser, unbindDevice, updateUser, fetchMe } from '../services/adminApi';
import type { User } from '../types';

export default function Employees() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);

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
  }, []);

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
    } catch (err) {
      console.error('ปิดบัญชีล้มเหลว:', err);
      alert('ปิดบัญชีล้มเหลว');
    }
    setActionLoading(null);
  }

  async function handleUnbind(id: string) {
    if (!confirm('ต้องการปลดล็อคเครื่องมือถือของพนักงานนี้หรือไม่?')) return;
    setActionLoading(id);
    try {
      await unbindDevice(id);
      await loadUsers();
    } catch (err) {
      console.error('ปลดล็อคเครื่องล้มเหลว:', err);
      alert('ปลดล็อคเครื่องล้มเหลว');
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

  // --- FILTERING & PAGINATION ---
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchSearch = (u.first_name + ' ' + u.last_name + ' ' + u.email).toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = filterStatus === 'all' || u.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [users, searchTerm, filterStatus]);

  const pendingUsers = useMemo(() => {
    return filteredUsers.filter(u => u.status === 'pending');
  }, [filteredUsers]);

  const activeUsers = useMemo(() => {
    return filteredUsers.filter(u => u.status !== 'pending');
  }, [filteredUsers]);

  const totalPages = Math.max(1, Math.ceil(activeUsers.length / PAGE_SIZE));
  
  // Auto-correct page if filtering reduces total pages
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const pagedUsers = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return activeUsers.slice(start, start + PAGE_SIZE);
  }, [activeUsers, page]);

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
        <table>
          <thead>
            <tr>
              <th>ชื่อ-นามสกุล</th>
              <th>ตำแหน่ง</th>
              <th>แผนก</th>
              <th>สิทธิ์</th>
              <th>สถานะ</th>
              <th>อุปกรณ์</th>
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
                    <div style={{ fontWeight: 600 }}>{user.first_name} {user.last_name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-gray)' }}>{user.email}</div>
                  </td>
                  <td data-label="ตำแหน่ง">{user.position || '-'}</td>
                  <td data-label="แผนก">{user.department || '-'}</td>
                  <td data-label="สิทธิ์">{roleBadge(user.role)}</td>
                  <td data-label="สถานะ">{statusBadge(user.status)}</td>
                  <td data-label="อุปกรณ์">
                    {user.device_id ? (
                      <span style={{ fontSize: '12px', color: 'var(--green)' }}>
                        <i className="fa-solid fa-mobile-screen"></i> ผูกแล้ว
                      </span>
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--text-gray)' }}>ยังไม่ผูก</span>
                    )}
                  </td>
                  <td data-label="จัดการ" style={{ textAlign: 'right' }}>
                    {user.id === currentAdminId ? (
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
                            department: user.department,
                            position: user.position,
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
                      {user.status === 'active' && (
                        <button
                          className="btn-reject"
                          disabled={actionLoading === user.id}
                          onClick={() => handleDisable(user.id)}
                          style={{ fontSize: '12px', padding: '4px 10px' }}
                        >
                          <i className="fa-solid fa-ban"></i> ปิด
                        </button>
                      )}
                      {user.device_id && (
                        <button
                          className="btn-secondary"
                          disabled={actionLoading === user.id}
                          onClick={() => handleUnbind(user.id)}
                          style={{ fontSize: '12px', padding: '4px 10px' }}
                        >
                          <i className="fa-solid fa-mobile-screen-button"></i> ปลดล็อค
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
        <h2>ฐานข้อมูลพนักงาน</h2>
        
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
          <div className="search-input-wrapper" style={{ flex: '1 1 200px', maxWidth: '300px', position: 'relative' }}>
            <i className="fa-solid fa-search" style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-gray)' }}></i>
            <input
              type="text"
              placeholder="ค้นหาชื่อ หรือ อีเมล..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
              style={{ width: '100%', padding: '10px 15px 10px 40px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'white' }}
            />
          </div>

          <select
            value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
            style={{ padding: '10px 15px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)', background: 'var(--bg-dark)', color: 'white', cursor: 'pointer' }}
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

      {pendingUsers.length > 0 && (
        <div className="table-card glass-panel" style={{ marginBottom: '30px', border: '1px solid var(--gold)', boxShadow: '0 4px 15px rgba(251, 191, 36, 0.15)' }}>
          <h3 style={{ color: 'var(--gold)', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-user-clock"></i> บัญชีรอการอนุมัติ ({pendingUsers.length})
          </h3>
          {renderTable(pendingUsers, 'ไม่มีบัญชีรออนุมัติ')}
        </div>
      )}

      <div className="table-card glass-panel">
        {renderTable(pagedUsers, 'ไม่พบข้อมูลพนักงาน')}
        
        {/* Pagination Controls */}
        {!loading && activeUsers.length > PAGE_SIZE && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', padding: '15px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <button
              className="btn-page"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{ padding: '6px 14px', fontSize: '13px', cursor: 'pointer', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '8px' }}
            >
              ‹ ก่อนหน้า
            </button>
            <span style={{ fontSize: '13px', color: 'var(--text-gray)' }}>หน้า {page} / {totalPages}</span>
            <button
              className="btn-page"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              style={{ padding: '6px 14px', fontSize: '13px', cursor: 'pointer', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '8px' }}
            >
              ถัดไป ›
            </button>
          </div>
        )}
      </div>

      {/* Edit User Modal */}
      {editUser && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, padding: '20px' }}>
          <div className="modal-content glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '25px', borderRadius: '16px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}>แก้ไขข้อมูลพนักงาน</h3>
            
            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-gray)', marginBottom: '5px' }}>ชื่อ</label>
                <input 
                  type="text" 
                  value={editForm.first_name || ''} 
                  onChange={e => setEditForm({...editForm, first_name: e.target.value})}
                  className="form-control"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-gray)', marginBottom: '5px' }}>นามสกุล</label>
                <input 
                  type="text" 
                  value={editForm.last_name || ''} 
                  onChange={e => setEditForm({...editForm, last_name: e.target.value})}
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
                onChange={e => setEditForm({...editForm, department: e.target.value})}
                className="form-control"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-gray)', marginBottom: '5px' }}>ตำแหน่ง</label>
              <input 
                type="text" 
                value={editForm.position || ''} 
                onChange={e => setEditForm({...editForm, position: e.target.value})}
                className="form-control"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-gray)', marginBottom: '5px' }}>สิทธิ์การใช้งาน (Role)</label>
              <select 
                value={editForm.role || 'employee'} 
                onChange={e => setEditForm({...editForm, role: e.target.value as 'employee' | 'admin'})}
                className="form-control"
                style={{ width: '100%', boxSizing: 'border-box' }}
              >
                <option value="employee">พนักงาน (Employee)</option>
                <option value="admin">ผู้ดูแลระบบ (Admin)</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
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
        </div>
      )}
    </div>
  );
}
