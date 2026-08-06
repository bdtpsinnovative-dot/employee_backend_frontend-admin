import { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { fetchUsers, fetchAllAttendance, fetchAllRequests, fetchHolidays, fetchUserHistory, fetchCheckInMode, updateCheckInMode } from '../services/adminApi';
import type { User, Attendance, LeaveRequest, OffsiteRequest, Holiday } from '../types';
import { avatarUrl } from '../components/tasks/taskUtils';

export default function Dashboard() {
  const { selectedUser, setSelectedUser, currentUser } = useOutletContext<{
    selectedUser: User | null;
    setSelectedUser: (u: User | null) => void;
    currentUser: User | null;
  }>();
  const navigate = useNavigate();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [offsite, setOffsite] = useState<OffsiteRequest[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkInMode, setCheckInMode] = useState<string>('face');
  const [updatingMode, setUpdatingMode] = useState<boolean>(false);

  // ประวัติของพนักงานรายบุคคลที่ถูกเลือก
  const [selectedUserHistory, setSelectedUserHistory] = useState<{
    attendance: Attendance[];
    leaves: LeaveRequest[];
    offsite: OffsiteRequest[];
  } | null>(null);

  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === 'admin') {
        loadData();
      } else {
        navigate('/daily-record', { replace: true });
      }
    }
  }, [currentUser, navigate]);

  useEffect(() => {
    if (currentUser && currentUser.role === 'admin' && !selectedUser) {
      loadAttendance();
    }
  }, [date, selectedUser, currentUser]);

  async function loadData() {
    setLoading(true);
    try {
      const currentYear = new Date().getFullYear();
      const [usersData, allRequestsData, holidaysData, modeData] = await Promise.all([
        fetchUsers(),
        fetchAllRequests(),
        fetchHolidays(currentYear),
        fetchCheckInMode(),
      ]);
      setUsers(usersData ?? []);
      setLeaves(allRequestsData.leaves ?? []);
      setOffsite(allRequestsData.offsite ?? []);
      setHolidays(holidaysData ?? []);
      setCheckInMode(modeData ?? 'face');
    } catch (err) {
      console.error('โหลดข้อมูล Dashboard ล้มเหลว:', err);
    }
    if (!selectedUser) {
      await loadAttendance();
    }
    setLoading(false);
  }

  async function handleToggleCheckInMode(mode: 'face' | 'selfie') {
    setUpdatingMode(true);
    try {
      await updateCheckInMode(mode);
      setCheckInMode(mode);
    } catch (err) {
      alert('อัปเดตโหมดลงเวลาล้มเหลว: ' + err);
    } finally {
      setUpdatingMode(false);
    }
  }

  async function loadAttendance() {
    try {
      const data = await fetchAllAttendance(date);
      setAttendance(data);
    } catch (err) {
      console.error('โหลด attendance ล้มเหลว:', err);
      setAttendance([]);
    }
  }

  // เรียกโหลดประวัติพนักงานเมื่อถูกเลือก
  async function handleSelectEmployee(u: User) {
    setHistoryPage(1);
    setSearchTerm(`${u.first_name} ${u.last_name}`);
    setSelectedUser(u);
  }

  useEffect(() => {
    if (!selectedUser) {
      setSelectedUserHistory(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setHistoryPage(1);
    setSearchTerm(`${selectedUser.first_name} ${selectedUser.last_name}`);
    fetchUserHistory(selectedUser.id)
      .then(history => {
        if (!cancelled) setSelectedUserHistory(history);
      })
      .catch(err => {
        console.error('โหลดประวัติพนักงานรายบุคคลล้มเหลว:', err);
        if (!cancelled) setSelectedUserHistory(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedUser]);

  function handleClearSearch() {
    setSearchTerm('');
    setSelectedUser(null);
    setSelectedUserHistory(null);
    setLoading(false);
    setHistoryPage(1);
  }

  const activeUsers = users.filter(u => u.status === 'active');

  const HISTORY_PAGE_SIZE = 30;

  const isWeekend = (d: Date) => {
    const day = d.getDay();
    return day === 0 || day === 6; // 0 = อาทิตย์, 6 = เสาร์
  };

  const getHolidayName = (ymdStr: string) => {
    const hol = holidays.find(h => h.date.split('T')[0] === ymdStr);
    return hol ? hol.name : null;
  };

  const getYmd = (d: Date) => {
    return d.toISOString().split('T')[0];
  };

  // ──── 1. โหมดภาพรวม (เมื่อ selectedUser === null) ────
  // จำนวนพนักงานทั้งหมด
  const totalEmployees = activeUsers.length;

  // กรองใบลา/ออกหน้างานที่ได้รับการอนุมัติของวันนี้
  const approvedLeavesToday = leaves.filter(l => {
    const leaveDate = l.date.split('T')[0];
    return leaveDate === date && l.status === 'approved';
  });

  const offsiteTodayCount = offsite.filter(o => {
    const offDate = o.date.split('T')[0];
    return offDate === date && o.status === 'approved';
  }).length;

  // นับสถิติรายวันจากใบลาที่อนุมัติวันนี้
  const sickCountToday = approvedLeavesToday.filter(l => l.leave_type === 'ลาป่วย').length;
  const personalCountToday = approvedLeavesToday.filter(l => l.leave_type === 'ลากิจ').length;
  const vacationCountToday = approvedLeavesToday.filter(l => l.leave_type === 'ลาพักร้อน').length;

  // นับจำนวนคนที่มาทำงานและมาสาย
  const attendedCount = attendance.length;
  const lateCount = attendance.filter(a => a.status === 'late').length;

  // พนักงานที่ไม่ทราบสาเหตุ (ไม่มีการลงเวลา + ไม่มีใบลา/ออกหน้างานที่ได้รับการอนุมัติในวันนี้)
  const attendedUserIdsToday = new Set(attendance.map(a => a.user_id));
  const leaveUserIdsToday = new Set(approvedLeavesToday.map(l => l.user_id));
  const offsiteUserIdsToday = new Set(offsite.filter(o => o.date.split('T')[0] === date && o.status === 'approved').map(o => o.user_id));
  const unknownCountToday = activeUsers.filter(u =>
    !attendedUserIdsToday.has(u.id) && !leaveUserIdsToday.has(u.id) && !offsiteUserIdsToday.has(u.id)
  ).length;

  // ──── 2. โหมดรายบุคคล (เมื่อ selectedUser !== null) ────
  // คำนวณประวัติและสะสมสถิติย้อนหลังตั้งแต่เริ่มงาน (WORK_START_DATE) จนถึงวันนี้
  const personalHistoryRows = useMemo(() => {
    if (!selectedUser || !selectedUserHistory) return [];

    const rows: { dateStr: string; displayDate: string; status: string; statusClass: string; timestamp: string }[] = [];
    const attList = selectedUserHistory.attendance ?? [];
    const leaveList = selectedUserHistory.leaves ?? [];
    const offList = selectedUserHistory.offsite ?? [];

    let todayObj = new Date();
    todayObj.setHours(0,0,0,0);
    let startDateObj = new Date(selectedUser.created_at);
    startDateObj.setHours(0,0,0,0);

    // วนลูปย้อนหลังจากวันนี้กลับไปวันเริ่มงาน
    let loopDate = new Date(todayObj);
    while (loopDate >= startDateObj) {
      const ymd = getYmd(loopDate);
      const displayDate = loopDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
      
      const att = attList.find(a => a.date.split('T')[0] === ymd);
      const leave = leaveList.find(l => l.date.split('T')[0] === ymd && l.status === 'approved');
      const off = offList.find(o => o.date.split('T')[0] === ymd && o.status === 'approved');
      const holidayName = getHolidayName(ymd);
      const isWknd = isWeekend(loopDate);

      let status = 'ขาดงาน';
      let statusClass = 'st-unknown';
      let timestamp = '-';

      if (att) {
        switch (att.status) {
          case 'on_time': status = 'ปกติ'; statusClass = 'st-ontime'; break;
          case 'late': status = 'มาสาย'; statusClass = 'st-late'; break;
          case 'offsite': status = 'ออกหน้างาน'; statusClass = 'st-offsite'; break;
          case 'sick_leave_full': status = 'ลาป่วย (เต็มวัน)'; statusClass = 'st-leave'; break;
          case 'sick_leave_morning': status = 'ลาป่วย (ครึ่งเช้า)'; statusClass = 'st-leave'; break;
          case 'sick_leave_afternoon': status = 'ลาป่วย (ครึ่งบ่าย)'; statusClass = 'st-leave'; break;
          case 'personal_leave_full': status = 'ลากิจ (เต็มวัน)'; statusClass = 'st-leave'; break;
          case 'personal_leave_morning': status = 'ลากิจ (ครึ่งเช้า)'; statusClass = 'st-leave'; break;
          case 'personal_leave_afternoon': status = 'ลากิจ (ครึ่งบ่าย)'; statusClass = 'st-leave'; break;
          case 'annual_leave': status = 'ลาพักร้อน'; statusClass = 'st-leave'; break;
          case 'shift_swap': status = 'สลับวันหยุด'; statusClass = 'st-weekend'; break;
          case 'unknown': status = 'ไม่ทราบสาเหตุ'; statusClass = 'st-unknown'; break;
          default: status = 'ไม่ทราบสาเหตุ'; statusClass = 'st-unknown'; break;
        }
        
        // Override for holiday/weekend work
        if ((isWknd || holidayName) && (att.status === 'on_time' || att.status === 'late')) {
          status = 'ทำงานวันหยุด';
          statusClass = 'st-weekend';
        }

        if (att.check_in_at) {
          timestamp = new Date(att.check_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
        }
      } else if (leave) {
        status = leave.leave_type + (leave.duration !== 'เต็มวัน' ? ` (${leave.duration})` : '');
        statusClass = 'st-leave';
        timestamp = 'ลาพัก';
      } else if (off) {
        status = 'ออกหน้างาน';
        statusClass = 'st-offsite';
        timestamp = 'ปฏิบัติงานนอกสถานที่';
      } else if (holidayName) {
        status = `วันหยุด: ${holidayName}`;
        statusClass = 'st-holiday';
      } else if (isWknd) {
        status = 'วันหยุดประจำสัปดาห์';
        statusClass = 'st-weekend';
      }

      rows.push({ dateStr: ymd, displayDate, status, statusClass, timestamp });

      // เลื่อนวันย้อนหลัง
      loopDate.setDate(loopDate.getDate() - 1);
    }

    return rows;
  }, [selectedUser, selectedUserHistory, holidays]);

  // คำนวณสะสมย้อนหลังสำหรับรายบุคคลการ์ด 8 ใบ
  const personalStats = useMemo(() => {
    let stats = { total_leave: 0, attended: 0, late: 0, offsite: 0, unknown: 0, sick: 0, personal: 0, vacation: 0 };
    if (!personalHistoryRows.length) return stats;

    personalHistoryRows.forEach(row => {
      const status = row.status;
      if (status === 'ปกติ') {
        stats.attended++;
      } else if (status === 'มาสาย') {
        stats.attended++;
        stats.late++;
      } else if (status === 'ออกหน้างาน') {
        stats.offsite++;
      } else if (status === 'ไม่ทราบสาเหตุ') {
        stats.unknown++;
      } else if (status.startsWith('ลาป่วย')) {
        const amt = status.includes('ครึ่ง') ? 0.5 : 1;
        stats.sick += amt;
        stats.total_leave += amt;
      } else if (status.startsWith('ลากิจ')) {
        const amt = status.includes('ครึ่ง') ? 0.5 : 1;
        stats.personal += amt;
        stats.total_leave += amt;
      } else if (status.startsWith('ลาพักร้อน')) {
        const amt = status.includes('ครึ่ง') ? 0.5 : 1;
        stats.vacation += amt;
        stats.total_leave += amt;
      }
    });

    return stats;
  }, [personalHistoryRows]);

  const filteredUsers = searchTerm
    ? activeUsers.filter(u =>
        `${u.first_name} ${u.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : activeUsers;

  // ตรวจสอบวันหยุดวันนี้เพื่อเปลี่ยนหัวข้อแดชบอร์ด
  const holidayNameToday = getHolidayName(date);
  const isWkndToday = isWeekend(new Date(date));

  // Pagination สำหรับโหมดรายบุคคล
  const totalHistoryPages = Math.max(1, Math.ceil(personalHistoryRows.length / HISTORY_PAGE_SIZE));
  const pagedHistory = personalHistoryRows.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE);

  let dashboardTitle = 'สรุปภาพรวม';
  let titleColor = 'var(--text-main)';

  if (selectedUser) {
    dashboardTitle = `ข้อมูล: ${selectedUser.first_name} ${selectedUser.last_name}`;
  } else if (holidayNameToday) {
    dashboardTitle = `สรุปภาพรวม (วันหยุด: ${holidayNameToday})`;
    titleColor = 'var(--gold)';
  } else if (isWkndToday) {
    dashboardTitle = `สรุปภาพรวม (วันหยุดประจำสัปดาห์)`;
    titleColor = 'var(--grad-color-1)';
  }

  // การ์ด 8 ใบแสดงผลต่างกันตามโหมด
  const cardData = selectedUser
    ? {
        total: { label: 'วันลาสะสม', value: personalStats.total_leave, icon: 'fa-calendar-check', colorClass: 'c-blue' },
        attended: { label: 'มาทำงาน (วัน)', value: personalStats.attended, icon: 'fa-user-check', colorClass: 'c-green' },
        late: { label: 'มาสาย (วัน)', value: personalStats.late, icon: 'fa-clock', colorClass: 'c-yellow' },
        unknown: { label: 'ไม่ทราบสาเหตุ', value: personalStats.unknown, icon: 'fa-question', colorClass: 'c-red' },
        sick: { label: 'ป่วย (วัน)', value: personalStats.sick, icon: 'fa-bed-pulse', colorClass: 'c-red' },
        personal: { label: 'กิจ (วัน)', value: personalStats.personal, icon: 'fa-briefcase', colorClass: 'c-purple' },
        offsite: { label: 'หน้างาน (ครั้ง)', value: personalStats.offsite, icon: 'fa-map-location-dot', colorClass: 'c-cyan' },
        vacation: { label: 'พักร้อน (วัน)', value: personalStats.vacation, icon: 'fa-umbrella-beach', colorClass: 'c-green' },
      }
    : {
        total: { label: 'พนักงานทั้งหมด', value: totalEmployees, icon: 'fa-users', colorClass: 'c-blue' },
        attended: { label: 'มาทำงาน', value: attendedCount, icon: 'fa-user-check', colorClass: 'c-green' },
        late: { label: 'มาสาย', value: lateCount, icon: 'fa-clock', colorClass: 'c-yellow' },
        unknown: { label: 'ไม่ทราบสาเหตุ', value: unknownCountToday, icon: 'fa-question', colorClass: 'c-red' },
        sick: { label: 'ลาป่วย', value: sickCountToday, icon: 'fa-bed-pulse', colorClass: 'c-red' },
        personal: { label: 'ลากิจ', value: personalCountToday, icon: 'fa-briefcase', colorClass: 'c-purple' },
        offsite: { label: 'ออกหน้างาน', value: offsiteTodayCount, icon: 'fa-map-location-dot', colorClass: 'c-cyan' },
        vacation: { label: 'พักร้อน', value: vacationCountToday, icon: 'fa-umbrella-beach', colorClass: 'c-green' },
      };

  return (
    <div id="dashboard" className="page-section active">
      <div
        className="dashboard-filter-wrap"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '25px',
          flexWrap: 'wrap',
          gap: '15px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {selectedUser && (
            <button 
              className="btn-outline" 
              style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-main)' }}
              onClick={handleClearSearch}
            >
              <i className="fa-solid fa-arrow-left"></i> ย้อนกลับ
            </button>
          )}
          <h3 style={{ color: titleColor, margin: 0 }} id="dashboard-title">
            {dashboardTitle}
          </h3>
        </div>

        <div className="filter-bar">
          <div className="custom-search-dropdown" id="empSearchDropdown">
            <div className="search-input-wrapper">
              <i className="fa-solid fa-search"></i>
              <input
                type="text"
                id="empSearchInput"
                placeholder="ค้นหาชื่อพนักงาน..."
                autoComplete="off"
                role="combobox"
                aria-label="ค้นหาพนักงาน"
                aria-expanded={dropdownOpen}
                aria-controls="empDropdownList"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  if (!e.target.value) {
                    handleClearSearch();
                  }
                }}
                onFocus={() => setDropdownOpen(true)}
                onBlur={() => setTimeout(() => setDropdownOpen(false), 200)}
              />
              <div className="search-actions">
                <i
                  className="fa-solid fa-caret-down"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                ></i>
                {searchTerm && (
                  <i
                    className="fa-solid fa-circle-xmark"
                    id="clear-search"
                    style={{ opacity: 0.7, marginLeft: '5px', cursor: 'pointer' }}
                    onClick={handleClearSearch}
                  ></i>
                )}
              </div>
            </div>
            <div
              className={`dropdown-menu-dark ${dropdownOpen ? 'show' : ''}`}
              id="empDropdownList"
              role="listbox"
            >
              {filteredUsers.map((u) => (
                <div
                  key={u.id}
                  className="dropdown-item"
                  role="option"
                  tabIndex={0}
                  onMouseDown={() => handleSelectEmployee(u)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') handleSelectEmployee(u);
                  }}
                >
                  <span className="dashboard-employee-avatar dashboard-employee-avatar-small" aria-hidden="true">
                    {avatarUrl(u.avatar_url) ? (
                      <img src={avatarUrl(u.avatar_url) || undefined} alt="" />
                    ) : (
                      u.first_name?.trim().charAt(0).toUpperCase() || 'U'
                    )}
                  </span>
                  <span className="dashboard-employee-option-copy">
                    <strong>{u.first_name} {u.last_name}</strong>
                    <span>{u.nickname ? `(${u.nickname})` : (u.position || 'พนักงาน')}</span>
                  </span>
                </div>
              ))}
              {filteredUsers.length === 0 && (
                <div className="dropdown-item" style={{ color: 'var(--text-gray)' }}>
                  ไม่พบพนักงาน
                </div>
              )}
            </div>
          </div>

          <div className="custom-date-pill" style={{ visibility: selectedUser ? 'hidden' : 'visible' }}>
            <input
              type="date"
              id="dashboard-date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <i className="fa-regular fa-calendar"></i>
          </div>
        </div>
      </div>

      {!selectedUser && (
        <section className="checkin-mode-panel" aria-labelledby="checkin-mode-title">
          <div className="checkin-mode-heading">
            <div className="checkin-mode-icon" aria-hidden="true"><i className="fa-solid fa-fingerprint"></i></div>
            <div>
              <h3 id="checkin-mode-title">วิธีลงเวลาเข้างาน</h3>
              <p>กำหนดวิธีที่พนักงานใช้ยืนยันตัวตนตอนเข้างาน</p>
            </div>
            <span className={`checkin-mode-status ${updatingMode ? 'is-saving' : ''}`} aria-live="polite">
              <i className="fa-solid fa-circle" aria-hidden="true"></i>
              {updatingMode ? 'กำลังบันทึก' : `เปิดใช้: ${checkInMode === 'face' ? 'สแกนใบหน้า' : 'เซลฟี่'}`}
            </span>
          </div>

          <div className="checkin-mode-options" role="group" aria-label="เลือกวิธีลงเวลาเข้างาน">
            <button
              type="button"
              className={`checkin-mode-option ${checkInMode === 'face' ? 'active' : ''}`}
              onClick={() => handleToggleCheckInMode('face')}
              disabled={updatingMode}
              aria-pressed={checkInMode === 'face'}
            >
              <span className="checkin-mode-option-icon"><i className="fa-solid fa-user-shield" aria-hidden="true"></i></span>
              <span className="checkin-mode-option-copy"><strong>สแกนใบหน้า</strong><small>Face Recognition</small></span>
              {checkInMode === 'face' && <i className="fa-solid fa-circle-check checkin-mode-check" aria-hidden="true"></i>}
            </button>
            <button
              type="button"
              className={`checkin-mode-option ${checkInMode === 'selfie' ? 'active' : ''}`}
              onClick={() => handleToggleCheckInMode('selfie')}
              disabled={updatingMode}
              aria-pressed={checkInMode === 'selfie'}
            >
              <span className="checkin-mode-option-icon"><i className="fa-solid fa-camera-retro" aria-hidden="true"></i></span>
              <span className="checkin-mode-option-copy"><strong>เซลฟี่กล้องหน้า</strong><small>Selfie Photo</small></span>
              {checkInMode === 'selfie' && <i className="fa-solid fa-circle-check checkin-mode-check" aria-hidden="true"></i>}
            </button>
          </div>
        </section>
      )}

      <div className="dashboard-grid">
        {/* การ์ด 1: พนักงานทั้งหมด / ลาสะสม */}
        <div
          className="stat-card glass-panel"
          style={selectedUser ? {} : { background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', color: 'white', borderColor: 'transparent' }}
        >
          <div className="stat-icon" style={selectedUser ? { color: 'var(--blue)' } : { background: 'rgba(255, 255, 255, 0.2)', color: 'white' }}>
            <i className={`fa-solid ${cardData.total.icon}`}></i>
          </div>
          <div className="stat-info">
            <h4 style={selectedUser ? {} : { color: 'rgba(255, 255, 255, 0.9)' }}>{cardData.total.label}</h4>
            <h2 style={selectedUser ? {} : { color: '#ffffff' }}>{cardData.total.value}</h2>
          </div>
        </div>

        {/* การ์ด 2: มาทำงาน */}
        <div className="stat-card glass-panel">
          <div className={`stat-icon ${cardData.attended.colorClass}`}>
            <i className={`fa-solid ${cardData.attended.icon}`}></i>
          </div>
          <div className="stat-info">
            <h4>{cardData.attended.label}</h4>
            <h2>{cardData.attended.value}</h2>
          </div>
        </div>

        {/* การ์ด 3: มาสาย */}
        <div className="stat-card glass-panel">
          <div className={`stat-icon ${cardData.late.colorClass}`}>
            <i className={`fa-solid ${cardData.late.icon}`}></i>
          </div>
          <div className="stat-info">
            <h4>{cardData.late.label}</h4>
            <h2>{cardData.late.value}</h2>
          </div>
        </div>

        {/* การ์ด 4: ไม่ทราบสาเหตุ */}
        <div className="stat-card glass-panel">
          <div className={`stat-icon ${cardData.unknown.colorClass}`} style={selectedUser ? {} : { background: '#fee2e2' }}>
            <i className={`fa-solid ${cardData.unknown.icon}`}></i>
          </div>
          <div className="stat-info">
            <h4>{cardData.unknown.label}</h4>
            <h2>{cardData.unknown.value}</h2>
          </div>
        </div>

        {/* การ์ด 5: ลาป่วย */}
        <div className="stat-card glass-panel">
          <div className={`stat-icon ${cardData.sick.colorClass}`}>
            <i className={`fa-solid ${cardData.sick.icon}`}></i>
          </div>
          <div className="stat-info">
            <h4>{cardData.sick.label}</h4>
            <h2>{cardData.sick.value}</h2>
          </div>
        </div>

        {/* การ์ด 6: ลากิจ */}
        <div className="stat-card glass-panel">
          <div className={`stat-icon ${cardData.personal.colorClass}`}>
            <i className={`fa-solid ${cardData.personal.icon}`}></i>
          </div>
          <div className="stat-info">
            <h4>{cardData.personal.label}</h4>
            <h2>{cardData.personal.value}</h2>
          </div>
        </div>

        {/* การ์ด 7: ออกหน้างาน */}
        <div className="stat-card glass-panel">
          <div className={`stat-icon ${cardData.offsite.colorClass}`}>
            <i className={`fa-solid ${cardData.offsite.icon}`}></i>
          </div>
          <div className="stat-info">
            <h4>{cardData.offsite.label}</h4>
            <h2>{cardData.offsite.value}</h2>
          </div>
        </div>

        {/* การ์ด 8: ลาพักร้อน */}
        <div className="stat-card glass-panel">
          <div className={`stat-icon ${cardData.vacation.colorClass}`}>
            <i className={`fa-solid ${cardData.vacation.icon}`}></i>
          </div>
          <div className="stat-info">
            <h4>{cardData.vacation.label}</h4>
            <h2>{cardData.vacation.value}</h2>
          </div>
        </div>
      </div>

      {selectedUser && (
        <div className="table-card glass-panel">
          <h3 id="dash-table-header" style={{ marginBottom: '15px', color: 'var(--text-main)' }}>
            ประวัติการทำงาน
          </h3>
          <table>
            <thead id="dash-table-head">
              <tr>
                <th>วันที่</th>
                <th>สถานะ</th>
                <th>เวลาเข้างาน</th>
              </tr>
            </thead>
            <tbody id="dash-table">
              {loading ? (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', padding: '20px' }}>กำลังโหลดข้อมูล...</td>
                </tr>
              ) : personalHistoryRows.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-gray)' }}>
                    ไม่พบประวัติการทำงานของพนักงานท่านนี้
                  </td>
                </tr>
              ) : (
                pagedHistory.map((row, idx) => (
                  <tr key={idx}>
                    <td data-label="วันที่">{row.displayDate}</td>
                    <td data-label="สถานะ"><span className={`status-badge ${row.statusClass}`}>{row.status}</span></td>
                    <td data-label="เวลาเข้างาน" style={{ color: 'var(--text-gray)', fontSize: '12px' }}>{row.timestamp}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {personalHistoryRows.length > HISTORY_PAGE_SIZE && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', padding: '15px' }}>
            <button
              className="btn-page"
              disabled={historyPage <= 1}
              onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
              style={{ padding: '6px 14px', fontSize: '13px', cursor: 'pointer' }}
            >
              ‹ ก่อนหน้า
            </button>
            <span style={{ fontSize: '13px', color: 'var(--text-gray)' }}>หน้า {historyPage} / {totalHistoryPages}</span>
            <button
              className="btn-page"
              disabled={historyPage >= totalHistoryPages}
              onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))}
              style={{ padding: '6px 14px', fontSize: '13px', cursor: 'pointer' }}
            >
              ถัดไป ›
            </button>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
