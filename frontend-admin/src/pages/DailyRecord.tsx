import { useCallback, useEffect, useState } from 'react';
import {
  fetchAllAttendance,
  fetchUsers,
  manualAttendance,
  fetchAllRequests,
  fetchHolidays,
  fetchMe,
  fetchTeamMembers,
} from '../services/adminApi';
import type { User, Attendance, LeaveRequest, OffsiteRequest, Holiday, TeamMember } from '../types';
import DatePicker from '../components/DatePicker';
import { avatarUrl } from '../components/tasks/taskUtils';

interface EmployeeRecord {
  user: User;
  attendance: Attendance | null;
  leave: LeaveRequest | null;
  offsite: OffsiteRequest | null;
  selectedStatus: string;
}

interface ProfileIdentity {
  first_name: string;
  last_name: string;
  nickname?: string;
  avatar_url?: string;
}

function ProfileCell({ member }: { member: ProfileIdentity }) {
  const fullName = `${member.first_name} ${member.last_name}`.trim();
  const profileAvatar = avatarUrl(member.avatar_url);
  const initial = member.first_name.trim().charAt(0).toUpperCase()
    || member.last_name.trim().charAt(0).toUpperCase()
    || 'U';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span style={{
        width: '38px',
        height: '38px',
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#e0e7ff',
        color: '#4338ca',
        fontWeight: 700,
        fontSize: '14px',
      }}>
        {profileAvatar ? (
          <img
            src={profileAvatar}
            alt={`รูปโปรไฟล์ของ ${fullName}`}
            loading="lazy"
            decoding="async"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : initial}
      </span>
      <span style={{ fontWeight: 600 }}>
        {fullName}
        {member.nickname ? ` (${member.nickname})` : ''}
      </span>
    </div>
  );
}

export default function DailyRecord() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [records, setRecords] = useState<EmployeeRecord[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamAssigned, setTeamAssigned] = useState(true);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [activePhotoUrl, setActivePhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      try {
        const user = await fetchMe();
        if (!cancelled) setCurrentUser(user);
      } catch (err) {
        console.error('โหลดข้อมูลผู้ใช้ล้มเหลว:', err);
        if (!cancelled) setLoading(false);
      }
    }

    void loadCurrentUser();
    return () => { cancelled = true; };
  }, []);

  const loadAdminData = useCallback(async () => {
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
  }, [date]);

  const loadEmployeeTeam = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTeamMembers();
      setTeamAssigned(data.team_assigned);
      setTeamMembers(data.members ?? []);
    } catch (err) {
      console.error('โหลดสมาชิกทีมล้มเหลว:', err);
      setTeamMembers([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role === 'admin') {
      void loadAdminData();
    } else {
      void loadEmployeeTeam();
    }
  }, [currentUser, loadAdminData, loadEmployeeTeam]);

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

    await loadAdminData();
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
      case 'on_time': return { text: 'มาทำงาน (ตรงเวลา)', color: 'var(--green-text)', bg: 'var(--green-bg)' };
      case 'late': return { text: 'มาทำงาน (สาย)', color: 'var(--gold)', bg: 'var(--gold-bg)' };
      case 'offsite': return { text: 'ออกหน้างาน', color: 'var(--blue)', bg: 'var(--blue-light)' };
      case 'sick_leave_full': return { text: 'ลาป่วย (เต็มวัน)', color: 'var(--red-text)', bg: 'var(--red-bg)' };
      case 'sick_leave_morning': return { text: 'ลาป่วย (ครึ่งเช้า)', color: 'var(--red-text)', bg: 'var(--red-bg)' };
      case 'sick_leave_afternoon': return { text: 'ลาป่วย (ครึ่งบ่าย)', color: 'var(--red-text)', bg: 'var(--red-bg)' };
      case 'personal_leave_full': return { text: 'ลากิจ (เต็มวัน)', color: 'var(--purple)', bg: 'rgba(109, 40, 217, 0.14)' };
      case 'personal_leave_morning': return { text: 'ลากิจ (ครึ่งเช้า)', color: 'var(--purple)', bg: 'rgba(109, 40, 217, 0.14)' };
      case 'personal_leave_afternoon': return { text: 'ลากิจ (ครึ่งบ่าย)', color: 'var(--purple)', bg: 'rgba(109, 40, 217, 0.14)' };
      case 'annual_leave': return { text: 'ลาพักร้อน', color: 'var(--teal)', bg: 'rgba(13, 148, 136, 0.14)' };
      case 'shift_swap': return { text: 'สลับวัน', color: 'var(--text-secondary)', bg: 'var(--surface-muted)' };
      case 'unknown': return { text: 'ไม่ทราบสาเหตุ', color: 'var(--red-text)', bg: 'var(--red-bg)' };
      case 'no_record': return { text: 'ไม่มีบันทึกเข้างาน', color: 'var(--text-gray)', bg: 'var(--surface-muted)' };
      default: return { text: status, color: 'var(--text-secondary)', bg: 'var(--surface-muted)' };
    }
  }

  if (!currentUser) {
    return (
      <div id="daily-record" className="page-section active">
        <h2 style={{ marginBottom: '20px' }}>บันทึกเวลา</h2>
        <div className="table-card glass-panel" style={{ padding: '36px', textAlign: 'center', color: 'var(--text-gray)' }}>
          {loading ? 'กำลังโหลดข้อมูล...' : 'โหลดข้อมูลผู้ใช้ไม่สำเร็จ'}
        </div>
      </div>
    );
  }

  if (currentUser.role === 'employee') {
    if (!loading && !teamAssigned) {
      return (
        <div id="daily-record" className="page-section active" style={{ textAlign: 'center', color: 'var(--text-gray)' }}>
          ยังไม่ได้กำหนดทีม
        </div>
      );
    }

    return (
      <div id="daily-record" className="page-section active">
        <h2 style={{ marginBottom: '20px' }}>สมาชิกในทีม</h2>
        <div className="table-card glass-panel">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '50%' }}>สมาชิก</th>
                  <th style={{ width: '25%' }}>ทีม</th>
                  <th style={{ width: '25%' }}>ตำแหน่ง</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', padding: '30px' }}>กำลังโหลดข้อมูล...</td>
                  </tr>
                ) : teamMembers.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-gray)' }}>ไม่พบสมาชิกในทีม</td>
                  </tr>
                ) : teamMembers.map(member => (
                  <tr key={member.id}>
                    <td data-label="สมาชิก"><ProfileCell member={member} /></td>
                    <td data-label="ทีม">{member.team || '-'}</td>
                    <td data-label="ตำแหน่ง">{member.position || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
      </div>
    );
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
              <th style={{ width: '25%' }}>ชื่อ-นามสกุล</th>
              <th style={{ width: '15%' }}>ทีม</th>
              <th style={{ width: '15%' }}>ตำแหน่ง</th>
              <th style={{ width: '45%' }}>สถานะ</th>
            </tr>
          </thead>
          <tbody id="record-table">
            {loading ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '30px' }}>
                  กำลังโหลดข้อมูล...
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-gray)' }}>
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
                    <td data-label="ชื่อ-นามสกุล"><ProfileCell member={rec.user} /></td>
                    <td data-label="ทีม">{rec.user.team || '-'}</td>
                    <td data-label="ตำแหน่ง">{rec.user.position || '-'}</td>
                    <td data-label="สถานะ">
                      {rec.attendance ? (
                        (() => {
                          let display = getStatusDisplay(rec.attendance.status);
                          // Override display if it's weekend/holiday work
                          if (isOffDay && (rec.attendance.status === 'on_time' || rec.attendance.status === 'late')) {
                            display = { text: 'ทำงานวันหยุด', color: 'var(--gold)', bg: 'var(--gold-bg)' };
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
                        <span className="status-badge" style={{ color: 'var(--red-text)', background: 'var(--red-bg)', border: '1px solid var(--red-border)' }}>
                          {rec.leave?.leave_type} {rec.leave?.duration !== 'เต็มวัน' ? `(${rec.leave?.duration})` : ''}
                        </span>
                      ) : hasApprovedOffsite ? (
                        <span className="status-badge" style={{ color: 'var(--blue)', background: 'var(--blue-light)', border: '1px solid var(--blue-mid)' }}>
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
