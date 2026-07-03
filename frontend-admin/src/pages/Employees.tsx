import { useState, useEffect } from 'react';
import { fetchUsers, approveUser, disableUser, unbindDevice } from '../services/adminApi';
import type { User } from '../types';

export default function Employees() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

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

  function statusBadge(status: string) {
    const map: Record<string, { label: string; className: string }> = {
      active: { label: 'ใช้งาน', className: 'st-ontime' },
      pending: { label: 'รออนุมัติ', className: 'st-pending' },
      disabled: { label: 'ปิดบัญชี', className: 'st-disabled' },
    };
    const s = map[status] ?? { label: status, className: '' };
    return <span className={`status-badge ${s.className}`}>{s.label}</span>;
  }

  return (
    <div id="employees" className="page-section active">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', flexWrap: 'wrap', gap: '10px' }}>
        <h2>ฐานข้อมูลพนักงาน</h2>
        <button className="btn-primary" onClick={loadUsers}>
          <i className="fa-solid fa-rotate-right"></i> โหลดใหม่
        </button>
      </div>
      <div className="table-card glass-panel">
        <table>
          <thead>
            <tr>
              <th>ชื่อ-นามสกุล</th>
              <th>ตำแหน่ง</th>
              <th>แผนก</th>
              <th>สถานะ</th>
              <th>อุปกรณ์</th>
              <th style={{ textAlign: 'right' }}>จัดการ</th>
            </tr>
          </thead>
          <tbody id="emp-manage-table">
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '30px' }}>
                  กำลังโหลดข้อมูล...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-gray)' }}>
                  ไม่พบข้อมูลพนักงาน
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{user.first_name} {user.last_name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-gray)' }}>{user.email}</div>
                  </td>
                  <td>{user.position || '-'}</td>
                  <td>{user.department || '-'}</td>
                  <td>{statusBadge(user.status)}</td>
                  <td>
                    {user.device_id ? (
                      <span style={{ fontSize: '12px', color: 'var(--green)' }}>
                        <i className="fa-solid fa-mobile-screen"></i> ผูกแล้ว
                      </span>
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--text-gray)' }}>ยังไม่ผูก</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
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
                          <i className="fa-solid fa-ban"></i> ปิดบัญชี
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
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
