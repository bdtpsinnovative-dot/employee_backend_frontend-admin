import { useState, useEffect } from 'react';
import { fetchAllAttendance, fetchAllRequests, fetchUserHistory, fetchUserQuota, updateUserQuota, fetchUsers } from '../services/adminApi';
import type { Attendance, LeaveRequest, User } from '../types';
import { avatarUrl } from './tasks/taskUtils';

interface RightPanelProps {
  selectedUser: User | null;
  onSelectUser: (user: User) => void;
}

export default function RightPanel({ selectedUser, onSelectUser }: RightPanelProps) {
  const [todayLeaves, setTodayLeaves] = useState<LeaveRequest[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<Attendance[]>([]);
  const [todayOffsiteCount, setTodayOffsiteCount] = useState(0);
  const [employees, setEmployees] = useState<User[]>([]);

  // สิทธิวันลาสะสมสำหรับพนักงานที่ถูกเลือก
  const [usedSick, setUsedSick] = useState(0);
  const [usedPersonal, setUsedPersonal] = useState(0);
  const [usedVacation, setUsedVacation] = useState(0);
  const [usedSwap, setUsedSwap] = useState(0);

  // โควต้าสูงสุด (State ดึงจาก Database)
  const [maxSick, setMaxSick] = useState(30);
  const [maxPersonal, setMaxPersonal] = useState(6);
  const [maxVacation, setMaxVacation] = useState(6);

  // การแก้ไขโควต้า
  const [isEditingQuota, setIsEditingQuota] = useState(false);
  const [editSick, setEditSick] = useState(30);
  const [editPersonal, setEditPersonal] = useState(6);
  const [editVacation, setEditVacation] = useState(6);

  useEffect(() => {
    loadTodayData();
    fetchUsers()
      .then(users => setEmployees(users.filter(user => user.status === 'active')))
      .catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    if (!selectedUser) return;
    let cancelled = false;
    setIsEditingQuota(false);
    void loadEmployeeQuota(selectedUser.id, () => !cancelled);
    return () => {
      cancelled = true;
    };
  }, [selectedUser]);

  async function loadTodayData() {
    const now = new Date();
    const todayStr = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    try {
      const [allRequests, attendance] = await Promise.all([
        fetchAllRequests(),
        fetchAllAttendance(todayStr),
      ]);

      const todaysLeaves = (allRequests.leaves ?? []).filter(l => {
        const leaveDate = l.date.split('T')[0];
        return leaveDate === todayStr && l.status === 'approved';
      });
      setTodayLeaves(todaysLeaves);
      setTodayAttendance(attendance);
      setTodayOffsiteCount((allRequests.offsite ?? []).filter(request => {
        return request.date.split('T')[0] === todayStr && request.status === 'approved';
      }).length);
    } catch {
      // backend อาจยังไม่พร้อม
    }
  }

  async function loadEmployeeQuota(userId: string, isCurrent = () => true) {
    try {
      const currentYear = new Date().getFullYear();
      const [history, quota] = await Promise.all([
        fetchUserHistory(userId),
        fetchUserQuota(userId, currentYear)
      ]);
      if (!isCurrent()) return;

      let sick = 0;
      let personal = 0;
      let vacation = 0;
      let swap = 0;

      // กรองใบลาที่ได้รับอนุมัติของปีปัจจุบันมาคำนวณสะสม
      (history.leaves ?? []).forEach(l => {
        const leaveDateObj = new Date(l.date);
        if (leaveDateObj.getFullYear() === currentYear && l.status === 'approved') {
          const amount = l.duration.includes('ครึ่ง') ? 0.5 : 1;
          if (l.leave_type === 'ลาป่วย') sick += amount;
          else if (l.leave_type === 'ลากิจ') personal += amount;
          else if (l.leave_type === 'ลาพักร้อน') vacation += amount;
          else if (l.leave_type === 'สลับวันหยุด') swap++;
        }
      });

      setUsedSick(sick);
      setUsedPersonal(personal);
      setUsedVacation(vacation);
      setUsedSwap(swap);

      if (quota) {
        setMaxSick(quota.sick_leave);
        setMaxPersonal(quota.personal_leave);
        setMaxVacation(quota.annual_leave);
      } else {
        // Fallback default
        setMaxSick(30);
        setMaxPersonal(6);
        setMaxVacation(6);
      }
    } catch (err) {
      if (isCurrent()) console.error('โหลดโควตาวันลาล้มเหลว:', err);
    }
  }

  async function handleSaveQuota() {
    if (!selectedUser) return;
    try {
      const currentYear = new Date().getFullYear();
      await updateUserQuota(selectedUser.id, currentYear, {
        sick_leave: editSick,
        personal_leave: editPersonal,
        annual_leave: editVacation,
      });
      setMaxSick(editSick);
      setMaxPersonal(editPersonal);
      setMaxVacation(editVacation);
      setIsEditingQuota(false);
    } catch (err) {
      console.error('บันทึกโควต้าล้มเหลว:', err);
      alert('บันทึกโควต้าล้มเหลว');
    }
  }

  // Calendar strip — สร้างจากวันจริง
  const today = new Date();
  const dayNames = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const calDays = [];
  for (let i = -2; i <= 2; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    calDays.push({
      name: dayNames[d.getDay()],
      date: d.getDate(),
      isToday: i === 0,
    });
  }

  const todayOnTimeCount = todayAttendance.filter(item => item.status === 'on_time').length;
  const todayLateCount = todayAttendance.filter(item => item.status === 'late').length;
  const todayAwayCount = todayLeaves.length + todayOffsiteCount;

  function renderQuotaBar(label: string, iconClass: string, used: number, max: number, gradient: string) {
    const percent = Math.min((used / max) * 100, 100);
    const isExceeded = used > max;
    const finalBg = isExceeded ? 'var(--red)' : gradient;
    const textStyle = isExceeded ? { color: 'var(--red)' } : { color: 'var(--text-main)' };

    return (
      <div className="quota-item" style={{ marginBottom: '12px' }}>
        <div className="quota-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
          <span style={{ display: 'flex', alignItems: 'center', fontWeight: 500, fontSize: '13px' }}>
            <i className={`fa-solid ${iconClass}`} style={{ marginRight: '8px', width: '18px' }}></i> {label}
          </span>
          <span style={{ fontWeight: 700, fontSize: '13px', ...textStyle }}>
            {used} <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-gray)' }}>/ {max} วัน</span>
          </span>
        </div>
        <div className="progress-bg" style={{ height: '6px', background: 'rgba(0,0,0,0.06)', borderRadius: '10px', overflow: 'hidden' }}>
          <div className="progress-fill" style={{ width: `${percent}%`, background: finalBg, height: '100%', borderRadius: '10px', transition: 'width 0.5s ease' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="right-panel" id="main-right-panel">
      {/* วิดเจ็ตสิทธิคงเหลือ / สรุปวันนี้ */}
      <div className="widget" id="quota-widget">
        {selectedUser ? (
          <>
            <div className="right-panel-selected-user">
              <span className="right-panel-selected-avatar" aria-hidden="true">
                {avatarUrl(selectedUser.avatar_url) ? (
                  <img src={avatarUrl(selectedUser.avatar_url) || undefined} alt="" />
                ) : (
                  selectedUser.first_name?.trim().charAt(0).toUpperCase() || 'U'
                )}
              </span>
              <span className="right-panel-selected-copy">
                <strong>{selectedUser.first_name} {selectedUser.last_name}</strong>
                <span>{selectedUser.nickname ? `ชื่อเล่น: ${selectedUser.nickname}` : (selectedUser.position || 'พนักงาน')}</span>
              </span>
            </div>
            <div className="widget-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>สิทธิวันลาคงเหลือ (ปีปัจจุบัน)</span>
              {!isEditingQuota && (
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary-color)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}
                  onClick={() => {
                    setEditSick(maxSick);
                    setEditPersonal(maxPersonal);
                    setEditVacation(maxVacation);
                    setIsEditingQuota(true);
                  }}
                >
                  <i className="fa-solid fa-pen-to-square" style={{ marginRight: '4px' }}></i> แก้ไข
                </button>
              )}
            </div>
            <div id="quota-content">
              {isEditingQuota ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(255, 255, 255, 0.4)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}><i className="fa-solid fa-notes-medical" style={{ marginRight: '6px', color: 'var(--blue)' }}></i> ลาป่วย (วัน)</span>
                    <input
                      type="number"
                      className="form-control"
                      style={{ width: '70px', padding: '6px 8px', fontSize: '13px', margin: 0, textAlign: 'center' }}
                      value={editSick}
                      onChange={(e) => setEditSick(Math.max(0, parseInt(e.target.value) || 0))}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}><i className="fa-solid fa-briefcase" style={{ marginRight: '6px', color: 'var(--blue)' }}></i> ลากิจ (วัน)</span>
                    <input
                      type="number"
                      className="form-control"
                      style={{ width: '70px', padding: '6px 8px', fontSize: '13px', margin: 0, textAlign: 'center' }}
                      value={editPersonal}
                      onChange={(e) => setEditPersonal(Math.max(0, parseInt(e.target.value) || 0))}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}><i className="fa-solid fa-plane-departure" style={{ marginRight: '6px', color: 'var(--blue)' }}></i> พักร้อน (วัน)</span>
                    <input
                      type="number"
                      className="form-control"
                      style={{ width: '70px', padding: '6px 8px', fontSize: '13px', margin: 0, textAlign: 'center' }}
                      value={editVacation}
                      onChange={(e) => setEditVacation(Math.max(0, parseInt(e.target.value) || 0))}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '5px' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ flex: 1, padding: '8px', fontSize: '12px' }}
                      onClick={handleSaveQuota}
                    >
                      บันทึก
                    </button>
                    <button
                      type="button"
                      className="btn-reset"
                      style={{ flex: 1, padding: '8px', fontSize: '12px', margin: 0 }}
                      onClick={() => setIsEditingQuota(false)}
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {renderQuotaBar('ลาป่วย (ใช้ไป)', 'fa-notes-medical', usedSick, maxSick, 'linear-gradient(90deg, #93C5FD, #2563EB)')}
                  {renderQuotaBar('ลากิจ (ใช้ไป)', 'fa-briefcase', usedPersonal, maxPersonal, 'linear-gradient(90deg, #67E8F9, #0EA5E9)')}
                  {renderQuotaBar('พักร้อน (ใช้ไป)', 'fa-plane-departure', usedVacation, maxVacation, 'linear-gradient(90deg, #A5B4FC, #4F46E5)')}
                  
                  <div className="quota-item" style={{ marginTop: '15px', borderTop: '1px dashed rgba(0,0,0,0.1)', paddingTop: '15px' }}>
                    <div className="quota-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
                      <span style={{ color: '#595959', display: 'flex', alignItems: 'center', fontSize: '13px' }}>
                        <i className="fa-solid fa-rotate" style={{ marginRight: '8px', color: 'var(--text-gray)' }}></i> สลับวันหยุด (ใช้ไป)
                      </span>
                      <span style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '13px' }}>{usedSwap} ครั้ง</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="widget-title">สิทธิวันลาคงเหลือ</div>
            <div id="quota-content" className="right-panel-employee-picker">
              <div className="right-panel-picker-heading">
                <i className="fa-solid fa-user-check" aria-hidden="true"></i>
                <span>เลือกพนักงานเพื่อดูสิทธิ</span>
              </div>
              {employees.length > 0 ? (
                <div className="right-panel-employee-grid" aria-label="รายชื่อพนักงาน">
                  {employees.map(user => (
                    <button
                      type="button"
                      key={user.id}
                      className="right-panel-employee-option"
                      title={`${user.first_name} ${user.last_name}${user.nickname ? ` (${user.nickname})` : ''}`}
                      aria-label={`เลือก ${user.first_name} ${user.last_name}${user.nickname ? ` ชื่อเล่น ${user.nickname}` : ''}`}
                      onClick={() => onSelectUser(user)}
                    >
                      <span className="right-panel-picker-avatar" aria-hidden="true">
                        {avatarUrl(user.avatar_url) ? <img src={avatarUrl(user.avatar_url) || undefined} alt="" /> : (user.first_name?.trim().charAt(0).toUpperCase() || 'U')}
                      </span>
                      <span>{user.nickname || user.first_name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="right-panel-picker-empty">ไม่พบรายชื่อพนักงานที่ใช้งานอยู่</p>
              )}
            </div>
          </>
        )}
      </div>

      <div className="widget">
        <div className="widget-title">สรุปวันนี้</div>
        <div className="right-panel-today-summary" aria-label="สรุปการทำงานวันนี้">
          <div className="right-panel-today-metric right-panel-today-metric-success">
            <i className="fa-solid fa-user-check right-panel-today-metric-icon" aria-hidden="true"></i>
            <strong>{todayOnTimeCount}</strong>
            <span>เข้างานแล้ว</span>
          </div>
          <div className="right-panel-today-metric right-panel-today-metric-warning">
            <i className="fa-solid fa-clock right-panel-today-metric-icon" aria-hidden="true"></i>
            <strong>{todayLateCount}</strong>
            <span>มาสาย</span>
          </div>
          <div className="right-panel-today-metric right-panel-today-metric-danger">
            <i className="fa-solid fa-calendar-xmark right-panel-today-metric-icon" aria-hidden="true"></i>
            <strong>{todayAwayCount}</strong>
            <span>ลา/นอกสถานที่</span>
          </div>
        </div>
      </div>

      <div className="widget">
        <div className="widget-title">ปฏิทิน</div>
        <div className="calendar-strip" id="calendar-strip">
          {calDays.map((d, i) => (
            <div key={i} className={`cal-item ${d.isToday ? 'active' : ''}`}>
              <div style={{ fontSize: '10px' }}>{d.name}</div>
              <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{d.date}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="widget">
        <div className="widget-title">สรุปการลาวันนี้</div>
        <div id="today-activity">
          {todayLeaves.length === 0 ? (
            <div style={{ color: 'var(--text-gray)', fontSize: '13px', textAlign: 'center' }}>
              ไม่มีรายการลาวันนี้
            </div>
          ) : (
            todayLeaves.map((l) => {
              const leaveUser = employees.find(user => user.id === l.user_id);
              const leaveName = leaveUser
                ? `${leaveUser.first_name} ${leaveUser.last_name}${leaveUser.nickname ? ` (${leaveUser.nickname})` : ''}`
                : 'พนักงาน';
              return (
                <div key={l.id} className="list-item" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
                  <span className="right-panel-activity-avatar" aria-hidden="true">
                    {leaveUser && avatarUrl(leaveUser.avatar_url) ? <img src={avatarUrl(leaveUser.avatar_url) || undefined} alt="" /> : (leaveUser?.first_name?.trim().charAt(0).toUpperCase() || 'U')}
                  </span>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{leaveName}</div>
                    <div style={{ fontSize: '11px', color: '#DC2626', fontWeight: 600 }}>{l.leave_type}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
