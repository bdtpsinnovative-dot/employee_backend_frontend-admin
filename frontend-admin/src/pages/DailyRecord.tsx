import { useState, useEffect } from 'react';
import { fetchAllAttendance, fetchUsers, manualAttendance, fetchAllRequests, fetchHolidays } from '../services/adminApi';
import type { User, Attendance, LeaveRequest, OffsiteRequest, Holiday } from '../types';
import DatePicker from '../components/DatePicker';

interface EmployeeRecord {
  user: User;
  attendance: Attendance | null;
  leave: LeaveRequest | null;
  offsite: OffsiteRequest | null;
  selectedStatus: string;
}

export default function DailyRecord() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [records, setRecords] = useState<EmployeeRecord[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [activePhotoUrl, setActivePhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [date]);

  async function loadData() {
    setLoading(true);
    setMessage('');
    try {
      const year = new Date(date).getFullYear();
      const [users, attendance, allReqs, holidaysData] = await Promise.all([
        fetchUsers(),
        fetchAllAttendance(date),
        fetchAllRequests(),
        fetchHolidays(year)
      ]);

      setHolidays(holidaysData ?? []);

      const activeUsers = (users ?? []).filter(u => u.status === 'active');
      const attMap = new Map<string, Attendance>();
      (attendance ?? []).forEach(a => attMap.set(a.user_id, a));

      const leaveMap = new Map<string, LeaveRequest>();
      (allReqs.leaves ?? []).forEach(l => {
        if (l.date.split('T')[0] === date && l.status === 'approved') {
          leaveMap.set(l.user_id, l);
        }
      });
      const offsiteMap = new Map<string, OffsiteRequest>();
      (allReqs.offsite ?? []).forEach(o => {
        if (o.date.split('T')[0] === date && o.status === 'approved') {
          offsiteMap.set(o.user_id, o);
        }
      });

      const recs: EmployeeRecord[] = activeUsers.map(user => {
        const att = attMap.get(user.id) ?? null;
        const leave = leaveMap.get(user.id) ?? null;
        const offsite = offsiteMap.get(user.id) ?? null;
        
        return {
          user,
          attendance: att,
          leave,
          offsite,
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

  function isHolidayOrWeekend(dateStr: string) {
    const d = new Date(dateStr);
    const day = d.getDay();
    if (day === 0 || day === 6) return true;
    if (holidays.some(h => h.date.split('T')[0] === dateStr)) return true;
    return false;
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
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-gray)', marginBottom: '8px' }}>
            เลือกวันที่ตรวจสอบ
          </label>
          <DatePicker selectedDate={date} onChange={setDate} />
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
              records.map((rec) => {
                const isOffDay = isHolidayOrWeekend(date);
                const hasApprovedLeave = rec.leave !== null;
                const hasApprovedOffsite = rec.offsite !== null;

                return (
                  <tr key={rec.user.id}>
                    <td data-label="ชื่อ-นามสกุล" style={{ fontWeight: 600 }}>{rec.user.first_name} {rec.user.last_name}</td>
                    <td data-label="แผนก">{rec.user.department || '-'}</td>
                    <td data-label="สถานะ">
                      {rec.attendance ? (
                        (() => {
                          let display = getStatusDisplay(rec.attendance.status);
                          // Override display if it's weekend/holiday work
                          if (isOffDay && (rec.attendance.status === 'on_time' || rec.attendance.status === 'late')) {
                            display = { text: 'ทำงานวันหยุด', color: '#D97706', bg: 'rgba(253, 230, 138, 0.75)' };
                          }
                          return (
                            <span className="status-badge" style={{ color: display.color, background: display.bg, border: '1px solid rgba(255,255,255,0.5)', display: 'inline-flex', alignItems: 'center' }}>
                              {display.text}
                              {rec.attendance.check_in_at && (
                                <span style={{ marginLeft: '8px', fontSize: '11px', opacity: 0.7 }}>
                                  เข้า {new Date(rec.attendance.check_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                              {rec.attendance.check_in_photo && (
                                <i
                                  className="fa-solid fa-image"
                                  style={{
                                    marginLeft: '8px',
                                    color: 'var(--primary)',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    transition: 'transform 0.1s'
                                  }}
                                  onClick={() => {
                                    const rawUrl = rec.attendance!.check_in_photo!;
                                    const httpUrl = rawUrl.startsWith('r2://')
                                      ? rawUrl.replace('r2://', 'https://pub-2a877f7cc07b481ca09dec82cb240465.r2.dev/')
                                      : rawUrl;
                                    setActivePhotoUrl(httpUrl);
                                  }}
                                  title="ดูรูปภาพเช็คอิน"
                                ></i>
                              )}
                            </span>
                          );
                        })()
                      ) : hasApprovedLeave ? (
                        <span className="status-badge" style={{ color: '#DC2626', background: 'rgba(254, 226, 226, 0.75)', border: '1px solid rgba(255,255,255,0.5)' }}>
                          {rec.leave?.leave_type} {rec.leave?.duration !== 'เต็มวัน' ? `(${rec.leave?.duration})` : ''}
                        </span>
                      ) : hasApprovedOffsite ? (
                        <span className="status-badge" style={{ color: '#0369A1', background: 'rgba(224, 242, 254, 0.75)', border: '1px solid rgba(255,255,255,0.5)' }}>
                          ออกหน้างาน (อนุมัติแล้ว)
                        </span>
                      ) : (
                        <select
                          className="form-control"
                          style={{ width: 'auto', margin: 0, padding: '5px 10px', fontSize: '13px' }}
                          value={rec.selectedStatus}
                          onChange={(e) => handleStatusChange(rec.user.id, e.target.value)}
                        >
                          <option value="no_record">— ไม่มีบันทึกเข้างาน —</option>
                          {date <= new Date().toISOString().split('T')[0] && (
                            <>
                              <option value="on_time">เข้างานปกติ</option>
                              <option value="late">มาสาย</option>
                            </>
                          )}
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
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {activePhotoUrl && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          animation: 'fadeIn 0.2s ease'
        }} onClick={() => setActivePhotoUrl(null)}>
          <div style={{
            background: 'white',
            padding: '12px',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
            maxWidth: '450px',
            width: '90%',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600 }}>รูปภาพการลงเวลาเข้างาน</h4>
            <img
              src={activePhotoUrl}
              alt="Check-in"
              style={{
                width: '100%',
                maxHeight: '350px',
                borderRadius: '8px',
                objectFit: 'cover'
              }}
            />
            <button
              onClick={() => setActivePhotoUrl(null)}
              style={{
                marginTop: '15px',
                padding: '8px 24px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--primary)',
                color: 'white',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
