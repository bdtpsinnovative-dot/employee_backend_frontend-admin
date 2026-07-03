import { useState, useEffect } from 'react';
import { fetchAllAttendance, fetchUsers, manualAttendance } from '../services/adminApi';
import type { User, Attendance } from '../types';

interface EmployeeRecord {
  user: User;
  attendance: Attendance | null;
  selectedStatus: string;
}

export default function DailyRecord() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [records, setRecords] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadData();
  }, [date]);

  async function loadData() {
    setLoading(true);
    setMessage('');
    try {
      const [users, attendance] = await Promise.all([
        fetchUsers(),
        fetchAllAttendance(date),
      ]);

      const activeUsers = (users ?? []).filter(u => u.status === 'active');
      const attMap = new Map<string, Attendance>();
      (attendance ?? []).forEach(a => attMap.set(a.user_id, a));

      const recs: EmployeeRecord[] = activeUsers.map(user => {
        const att = attMap.get(user.id) ?? null;
        return {
          user,
          attendance: att,
          selectedStatus: att?.status ?? 'no_record',
        };
      });

      setRecords(recs);
    } catch (err) {
      console.error('โหลดข้อมูลล้มเหลว:', err);
    }
    setLoading(false);
  }

  function handleStatusChange(userId: string, status: string) {
    setRecords(prev => prev.map(r =>
      r.user.id === userId ? { ...r, selectedStatus: status } : r
    ));
  }

  async function handleSave() {
    setSaving(true);
    setMessage('');

    // บันทึกเฉพาะคนที่สถานะเปลี่ยนจาก no_record เป็นอย่างอื่น
    const toSave = records.filter(r =>
      !r.attendance && r.selectedStatus !== 'no_record'
    );

    if (toSave.length === 0) {
      setMessage('ไม่มีรายการที่ต้องบันทึก');
      setSaving(false);
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const rec of toSave) {
      try {
        await manualAttendance({
          user_id: rec.user.id,
          date,
          status: rec.selectedStatus,
        });
        successCount++;
      } catch (err) {
        console.error(`บันทึกล้มเหลว: ${rec.user.first_name}`, err);
        failCount++;
      }
    }

    setMessage(
      `บันทึกสำเร็จ ${successCount} รายการ` +
      (failCount > 0 ? ` (ล้มเหลว ${failCount} รายการ)` : '')
    );

    await loadData();
    setSaving(false);
  }

  function formatThaiDate(dateStr: string) {
    try {
      return new Date(dateStr).toLocaleDateString('th-TH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  function getStatusDisplay(status: string) {
    switch (status) {
      case 'on_time': return { text: 'มาทำงาน (ตรงเวลา)', color: '#15803D', bg: 'rgba(220, 252, 231, 0.75)' };
      case 'late': return { text: 'มาทำงาน (สาย)', color: '#B45309', bg: 'rgba(254, 243, 199, 0.75)' };
      case 'offsite': return { text: 'ออกหน้างาน', color: '#0369A1', bg: 'rgba(224, 242, 254, 0.75)' };
      case 'sick_leave_full': return { text: 'ลาป่วย (เต็มวัน)', color: '#DC2626', bg: 'rgba(254, 226, 226, 0.75)' };
      case 'sick_leave_morning': return { text: 'ลาป่วย (ครึ่งเช้า)', color: '#DC2626', bg: 'rgba(254, 226, 226, 0.75)' };
      case 'sick_leave_afternoon': return { text: 'ลาป่วย (ครึ่งบ่าย)', color: '#DC2626', bg: 'rgba(254, 226, 226, 0.75)' };
      case 'personal_leave_full': return { text: 'ลากิจ (เต็มวัน)', color: '#6D28D9', bg: 'rgba(237, 233, 254, 0.75)' };
      case 'personal_leave_morning': return { text: 'ลากิจ (ครึ่งเช้า)', color: '#6D28D9', bg: 'rgba(237, 233, 254, 0.75)' };
      case 'personal_leave_afternoon': return { text: 'ลากิจ (ครึ่งบ่าย)', color: '#6D28D9', bg: 'rgba(237, 233, 254, 0.75)' };
      case 'annual_leave': return { text: 'ลาพักร้อน', color: '#0D9488', bg: 'rgba(204, 251, 241, 0.75)' };
      case 'shift_swap': return { text: 'สลับวัน', color: '#64748B', bg: 'rgba(226, 232, 240, 0.7)' };
      case 'unknown': return { text: 'ไม่ทราบสาเหตุ', color: '#B91C1C', bg: '#fee2e2' };
      case 'no_record': return { text: 'ไม่มีบันทึกเข้างาน', color: 'var(--text-gray)', bg: '#f1f5f9' };
      default: return { text: status, color: '#64748B', bg: 'rgba(226, 232, 240, 0.7)' };
    }
  }

  return (
    <div id="daily-record" className="page-section active">
      <h2 style={{ marginBottom: '20px' }}>บันทึกเวลา</h2>
      <div className="record-controls glass-panel">
        <div style={{ width: '100%' }}>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-gray)', marginBottom: '5px' }}>
            เลือกวันที่ตรวจสอบ
          </label>
          <input
            type="date"
            id="record-date"
            className="date-picker-large"
            style={{ width: '100%' }}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div id="record-date-display" style={{ fontSize: '16px', color: 'var(--text-main)', fontWeight: 700, display: 'flex', alignItems: 'center' }}>
            {formatThaiDate(date)}
          </div>
        </div>
        {message && (
          <div style={{ width: '100%', fontSize: '13px', color: message.includes('ล้มเหลว') ? 'var(--red)' : 'var(--green)', fontWeight: 500 }}>
            {message}
          </div>
        )}
        <button className="btn-save" onClick={handleSave} disabled={saving}>
          <i className="fa-solid fa-save"></i> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
      <div className="table-card glass-panel">
        <table>
          <thead>
            <tr>
              <th style={{ width: '30%' }}>ชื่อ-นามสกุล</th>
              <th style={{ width: '15%' }}>แผนก</th>
              <th style={{ width: '55%' }}>สถานะ</th>
            </tr>
          </thead>
          <tbody id="record-table">
            {loading ? (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', padding: '30px' }}>
                  กำลังโหลดข้อมูล...
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-gray)' }}>
                  ไม่พบข้อมูลพนักงาน
                </td>
              </tr>
            ) : (
              records.map((rec) => (
                <tr key={rec.user.id}>
                  <td style={{ fontWeight: 600 }}>{rec.user.first_name} {rec.user.last_name}</td>
                  <td>{rec.user.department || '-'}</td>
                  <td>
                    {rec.attendance ? (
                      (() => {
                        const display = getStatusDisplay(rec.attendance.status);
                        return (
                          <span className="status-badge" style={{ color: display.color, background: display.bg, border: '1px solid rgba(255,255,255,0.5)' }}>
                            {display.text}
                            {rec.attendance.check_in_at && (
                              <span style={{ marginLeft: '8px', fontSize: '11px', opacity: 0.7 }}>
                                เข้า {new Date(rec.attendance.check_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </span>
                        );
                      })()
                    ) : (
                      <select
                        className="form-control"
                        style={{ width: 'auto', margin: 0, padding: '5px 10px', fontSize: '13px' }}
                        value={rec.selectedStatus}
                        onChange={(e) => handleStatusChange(rec.user.id, e.target.value)}
                      >
                        <option value="no_record">— ไม่มีบันทึกเข้างาน —</option>
                        <option value="on_time">เข้างานปกติ</option>
                        <option value="late">มาสาย</option>
                        <option value="offsite">ออกหน้างาน</option>
                        <optgroup label="ลาป่วย">
                          <option value="sick_leave_full">ลาป่วย (เต็มวัน)</option>
                          <option value="sick_leave_morning">ลาป่วย (ครึ่งเช้า)</option>
                          <option value="sick_leave_afternoon">ลาป่วย (ครึ่งบ่าย)</option>
                        </optgroup>
                        <optgroup label="ลากิจ">
                          <option value="personal_leave_full">ลากิจ (เต็มวัน)</option>
                          <option value="personal_leave_morning">ลากิจ (ครึ่งเช้า)</option>
                          <option value="personal_leave_afternoon">ลากิจ (ครึ่งบ่าย)</option>
                        </optgroup>
                        <option value="annual_leave">ลาพักร้อน</option>
                        <option value="shift_swap">สลับวัน</option>
                        <option value="unknown">ไม่ทราบสาเหตุ</option>
                      </select>
                    )}
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
