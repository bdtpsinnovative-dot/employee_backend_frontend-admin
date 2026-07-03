import { useState, useEffect } from 'react';
import { fetchAllRequests, fetchUserHistory } from '../services/adminApi';
import type { LeaveRequest, User } from '../types';

interface RightPanelProps {
  selectedUser: User | null;
}

export default function RightPanel({ selectedUser }: RightPanelProps) {
  const [todayLeaves, setTodayLeaves] = useState<LeaveRequest[]>([]);

  // สิทธิวันลาสะสมสำหรับพนักงานที่ถูกเลือก
  const [usedSick, setUsedSick] = useState(0);
  const [usedPersonal, setUsedPersonal] = useState(0);
  const [usedVacation, setUsedVacation] = useState(0);
  const [usedSwap, setUsedSwap] = useState(0);

  useEffect(() => {
    loadTodayData();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      loadEmployeeQuota(selectedUser.id);
    }
  }, [selectedUser]);

  async function loadTodayData() {
    const todayStr = new Date().toISOString().split('T')[0];
    try {
      const [allRequests] = await Promise.all([
        fetchAllRequests(),
      ]);

      const todaysLeaves = (allRequests.leaves ?? []).filter(l => {
        const leaveDate = l.date.split('T')[0];
        return leaveDate === todayStr && l.status === 'approved';
      });
      setTodayLeaves(todaysLeaves);
    } catch {
      // backend อาจยังไม่พร้อม
    }
  }

  async function loadEmployeeQuota(userId: string) {
    try {
      const history = await fetchUserHistory(userId);
      const currentYear = new Date().getFullYear();

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
    } catch (err) {
      console.error('โหลดโควตาวันลาล้มเหลว:', err);
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

  const maxSick = 30;
  const maxPersonal = 3;
  const maxVacation = 7;

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
            <div className="widget-title">สิทธิวันลาคงเหลือ (ปีปัจจุบัน)</div>
            <div id="quota-content">
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
            </div>
          </>
        ) : (
          <>
            <div className="widget-title">สิทธิวันลาคงเหลือ</div>
            <div id="quota-content" style={{ textAlign: 'center', color: 'var(--text-gray)', padding: '20px 10px' }}>
              <i className="fa-solid fa-magnifying-glass-user" style={{ fontSize: '24px', marginBottom: '10px' }}></i>
              <br />
              เลือกพนักงานเพื่อดูสิทธิ
            </div>
          </>
        )}
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
              เข้างานครบทุกคน
            </div>
          ) : (
            todayLeaves.map((l) => (
              <div key={l.id} className="list-item" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
                <div className="avatar-circle" style={{ width: '32px', height: '32px', fontSize: '12px' }}>
                  {l.user_id ? 'P' : 'A'}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>พนักงาน</div>
                  <div style={{ fontSize: '11px', color: 'var(--red)' }}>{l.leave_type}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
