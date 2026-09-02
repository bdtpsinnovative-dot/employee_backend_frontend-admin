import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Download, FileText, BarChart, Search, CheckCircle, MapPin, UserCheck } from 'lucide-react';
import {
  fetchAttendanceHistory,
  fetchHolidays,
  fetchMonthlyHistory,
  fetchMyLeaves,
  fetchMyOffsite,
  fetchUsers,
  manualAttendance,
} from '../services/adminApi';
import type { Attendance, HistoryRecord, Holiday, LeaveRequest, OffsiteRequest, User } from '../types';
import MonthPicker from '../components/MonthPicker';
import { avatarUrl } from '../components/tasks/taskUtils';
import {
  parseCompactDateParts,
  formatTime,
  translateType,
  translateStatus,
  getStatusClass,
  computeLateMinutes,
  computeWorkHours
} from '../utils/attendanceHelpers';

const PAGE_SIZE = 20;

interface UserSummary {
  email: string;
  name: string;
  avatar_url?: string;
  department: string;
  scheduledDays: number;
  presentCount: number;
  lateCount: number;
  lateMinutes: number;
  absentDays: number;
  sickLeave: number;
  personalLeave: number;
  annualLeave: number;
  offsite: number;
  totalWorkHours: number;
  onTimeRate: number; // %
}

function getDatePart(value: string | undefined): string {
  return value ? value.split('T')[0] : '';
}

function isInMonth(value: string | undefined, year: number, month: number): boolean {
  const datePart = getDatePart(value);
  return datePart.startsWith(`${year}-${String(month).padStart(2, '0')}-`);
}

function getEmployeeDisplayName(user: User): string {
  return [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
    || user.nickname
    || user.email;
}

function mapEmployeeHistory(
  user: User,
  attendance: Attendance[],
  leaves: LeaveRequest[],
  offsite: OffsiteRequest[],
  year: number,
  month: number,
): HistoryRecord[] {
  const userName = getEmployeeDisplayName(user);
  const userFields = {
    user_name: userName,
    email: user.email || '',
    avatar_url: user.avatar_url,
    department: user.department || '',
    position: user.position || '',
  };

  const records: HistoryRecord[] = [
    ...attendance
      .filter(record => record.user_id === user.id && isInMonth(record.date, year, month))
      .map(record => ({
        ...userFields,
        date: record.date,
        status: record.status || 'unknown',
        type: 'attendance',
        reason: '',
        check_in_at: record.check_in_at,
        check_out_at: record.check_out_at,
        check_in_photo: record.check_in_photo,
        check_out_photo: record.check_out_photo,
        check_in_lat: record.check_in_lat,
        check_in_lng: record.check_in_lng,
        check_out_lat: record.check_out_lat,
        check_out_lng: record.check_out_lng,
        created_at: record.created_at || record.check_in_at || record.date,
      })),
    ...leaves
      .filter(record => record.user_id === user.id && isInMonth(record.date, year, month))
      .map(record => ({
        ...userFields,
        date: record.date,
        status: `${record.leave_type} ${record.duration} (${record.status})`,
        type: 'leave',
        reason: record.reason || '',
        check_in_photo: record.medical_cert_url,
        created_at: record.created_at || record.date,
      })),
    ...offsite
      .filter(record => record.user_id === user.id && isInMonth(record.date, year, month))
      .map(record => ({
        ...userFields,
        date: record.date,
        status: `offsite (${record.status})`,
        type: 'offsite',
        reason: record.reason || '',
        created_at: record.created_at || record.date,
      })),
  ];

  records.sort((a, b) => {
    const dateOrder = b.date.localeCompare(a.date);
    if (dateOrder !== 0) return dateOrder;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  return records;
}

export default function History() {
  const { currentUser, currentUserLoaded } = useOutletContext<{
    currentUser: User | null;
    currentUserLoaded: boolean;
  }>();
  const [allRows, setAllRows] = useState<HistoryRecord[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchName, setSearchName] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [filterMonth, setFilterMonth] = useState(
    new Date().toISOString().slice(0, 7) // YYYY-MM
  );
  const [filterDay, setFilterDay] = useState(
    String(new Date().getDate()).padStart(2, '0')
  );
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'log' | 'summary'>('log');
  const [activePhotoUrl, setActivePhotoUrl] = useState<string | null>(null);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualUser, setManualUser] = useState<User | null>(null);
  const [manualDate, setManualDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [manualStatus, setManualStatus] = useState<string>('on_time');
  const [savingManual, setSavingManual] = useState(false);
  const [manualError, setManualError] = useState('');
  const loadSequence = useRef(0);

  const [selectedYear, selectedMonth] = useMemo(() => {
    const [y, m] = filterMonth.split('-');
    return [parseInt(y, 10), parseInt(m, 10)];
  }, [filterMonth]);

  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth, 0).getDate();
  }, [selectedYear, selectedMonth]);

  const loadData = useCallback(async () => {
    if (!currentUser) return;

    const sequence = ++loadSequence.current;
    setLoading(true);
    try {
      const [year, month] = filterMonth.split('-').map(Number);
      let records: HistoryRecord[];
      let holidaysData: Holiday[];
      let usersData: User[] = [];

      if (currentUser.role === 'admin') {
        // Keep the admin report on its existing all-users endpoint.
        [records, holidaysData, usersData] = await Promise.all([
          fetchMonthlyHistory(filterMonth),
          fetchHolidays(year),
          fetchUsers(),
        ]);
      } else {
        // Self-scoped endpoints are intentionally requested in parallel. The
        // current user's id also guards the mapping against accidental leakage.
        const [attendance, leaves, offsite, employeeHolidays] = await Promise.all([
          fetchAttendanceHistory(year, month),
          fetchMyLeaves(),
          fetchMyOffsite(),
          fetchHolidays(year),
        ]);
        records = mapEmployeeHistory(currentUser, attendance, leaves, offsite, year, month);
        holidaysData = employeeHolidays;
        usersData = [currentUser];
      }

      if (sequence === loadSequence.current) {
        setAllRows(records);
        setHolidays(holidaysData ?? []);
        setUsers(usersData ?? []);
        setPage(1);
      }
    } catch (err) {
      if (sequence === loadSequence.current) {
        console.error('โหลดประวัติล้มเหลว:', err);
      }
    } finally {
      if (sequence === loadSequence.current) {
        setLoading(false);
      }
    }
  }, [currentUser, filterMonth]);

  useEffect(() => {
    if (!currentUser) {
      if (currentUserLoaded) {
        loadSequence.current += 1;
        setAllRows([]);
        setLoading(false);
      }
      return;
    }

    void loadData();
    const currentMonthStr = new Date().toISOString().slice(0, 7);
    if (filterMonth === currentMonthStr) {
      setFilterDay(String(new Date().getDate()).padStart(2, '0'));
    } else {
      setFilterDay('All');
    }
  }, [currentUser, currentUserLoaded, filterMonth, loadData]);

  // ──── คำนวณวันทำการเฉลี่ยของแผนก (ไม่รวม ส-อา และวันหยุดราชการ) ────
  const { scheduledWorkDays, scheduledYMDs } = useMemo(() => {
    const [y, m] = filterMonth.split('-').map(Number);
    const totalDays = new Date(y, m, 0).getDate();
    let count = 0;
    const ymds: string[] = [];

    const holidaySet = new Set(
      holidays.map(h => h.date.split('T')[0])
    );

    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(y, m - 1, day);
      const wd = d.getDay();
      const isWeekend = wd === 0 || wd === 6;
      const ymdStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isHoliday = holidaySet.has(ymdStr);

      if (!isWeekend && !isHoliday) {
        count++;
        ymds.push(ymdStr);
      }
    }
    return { scheduledWorkDays: count, scheduledYMDs: ymds };
  }, [filterMonth, holidays]);

  // ดึงวันลาที่อนุมัติแล้วเพื่อเช็คซ้ำซ้อน
  const approvedLeaveMap = useMemo(() => {
    const map = new Map<string, string>();
    allRows.forEach(r => {
      if (r.type === 'leave' && r.status.includes('approved')) {
        map.set(`${r.user_name}_${r.date.split('T')[0]}`, r.status);
      }
    });
    return map;
  }, [allRows]);

  // ดึงวันลาครึ่งเช้าเพื่อขยับเวลาคำนวณสาย
  const morningLeaveMap = useMemo(() => {
    const map = new Map<string, boolean>();
    allRows.forEach(r => {
      if (r.type === 'leave' && r.status.includes('approved') && r.status.includes('ครึ่งเช้า')) {
        map.set(`${r.user_name}_${r.date.split('T')[0]}`, true);
      }
    });
    return map;
  }, [allRows]);

  // ดึงออกนอกสถานที่ที่อนุมัติแล้วเพื่อเช็คซ้ำซ้อน
  const approvedOffsiteMap = useMemo(() => {
    const set = new Set<string>();
    allRows.forEach(r => {
      if (r.type === 'offsite' && r.status.includes('approved')) {
        set.add(`${r.user_name}_${r.date.split('T')[0]}`);
      }
    });
    return set;
  }, [allRows]);

  // ดึง Avatar ของพนักงาน
  const userAvatarMap = useMemo(() => {
    const map = new Map<string, string | undefined>();
    users.forEach(u => {
      if (u.email) {
        map.set(u.email, u.avatar_url);
        map.set(u.email.toLowerCase(), u.avatar_url);
      }
      const displayName = getEmployeeDisplayName(u);
      if (displayName) map.set(displayName, u.avatar_url);
      if (u.first_name) map.set(u.first_name, u.avatar_url);
      if (u.nickname) map.set(u.nickname, u.avatar_url);
    });
    return map;
  }, [users]);

  // ──── รวมรายการบันทึกกับพนักงานที่ยังไม่มาทำงาน (ในวันทำการย้อนหลังจนถึงวันนี้) ────
  const combinedRows = useMemo(() => {
    const activeEmployees = users.filter(u => u.status === 'active');
    if (activeEmployees.length === 0) return allRows;

    const todayStr = new Date().toISOString().split('T')[0];
    const newRows = [...allRows];

    // สร้าง Set เพื่อเช็คว่าใครมีบันทึกอะไรในวันไหนแล้วบ้าง
    const hasRecordMap = new Set<string>();
    allRows.forEach(r => {
      const d = r.date.split('T')[0];
      hasRecordMap.add(`${r.email}_${d}`);
      hasRecordMap.add(`${r.user_name}_${d}`);
    });

    // วนลูปวันทำงานที่ผ่านมา (ไม่เกินวันปัจจุบัน)
    scheduledYMDs.forEach(ymd => {
      if (ymd > todayStr) return; // ไม่สร้างล่วงหน้าสำหรับวันในอนาคต

      activeEmployees.forEach(u => {
        const userName = getEmployeeDisplayName(u);
        const keyByEmail = `${u.email}_${ymd}`;
        const keyByName = `${userName}_${ymd}`;
        if (!hasRecordMap.has(keyByEmail) && !hasRecordMap.has(keyByName)) {
          newRows.push({
            date: ymd,
            user_name: userName,
            email: u.email,
            avatar_url: u.avatar_url,
            department: u.department || '',
            position: u.position || '',
            status: 'not_checked_in',
            type: 'not_checked_in',
            reason: '',
            created_at: `${ymd}T09:00:00Z`,
          });
        }
      });
    });

    newRows.sort((a, b) => {
      const dateOrder = b.date.localeCompare(a.date);
      if (dateOrder !== 0) return dateOrder;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return newRows;
  }, [allRows, users, scheduledYMDs]);

  // ──── Filtering สำหรับ Log ────
  const filteredRows = useMemo(() => {
    return combinedRows.filter(r => {
      if (searchName && !r.user_name.toLowerCase().includes(searchName.toLowerCase())) return false;
      
      // ฟิลเตอร์เฉพาะวัน
      if (filterDay !== 'All') {
        const datePart = r.date.split('T')[0]; // "YYYY-MM-DD"
        const dayPart = datePart.split('-')[2]; // "DD"
        if (dayPart !== filterDay) return false;
      }

      const thStatus = translateStatus(r.status, r.date);
      const thType = translateType(r.type);
      if (filterType !== 'All') {
        if (!thStatus.includes(filterType) && !thType.includes(filterType)) return false;
      }
      return true;
    });
  }, [combinedRows, searchName, filterType, filterDay]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ──── คำนวณสรุปรายเดือนต่อพนักงาน ────
  const summaryData = useMemo(() => {
    const map = new Map<string, UserSummary>();
    const coveredDaysByUser = new Map<string, Set<string>>();

    const getUserSummary = (name: string, email: string, dept: string, avatarUrlParam?: string) => {
      if (!map.has(name)) {
        map.set(name, {
          email,
          name,
          avatar_url: avatarUrlParam || userAvatarMap.get(email) || userAvatarMap.get(name),
          department: dept,
          scheduledDays: scheduledWorkDays,
          presentCount: 0, lateCount: 0, lateMinutes: 0,
          absentDays: 0, sickLeave: 0, personalLeave: 0, annualLeave: 0,
          offsite: 0, totalWorkHours: 0, onTimeRate: 0,
        });
        coveredDaysByUser.set(name, new Set());
      }
      return map.get(name)!;
    };

    // แสดงรายชื่อพนักงาน Active ทุกคนพร้อมรูปภาพในสรุปประจำเดือน
    users.filter(u => u.status === 'active').forEach(u => {
      const displayName = getEmployeeDisplayName(u);
      getUserSummary(displayName, u.email, u.department || '', u.avatar_url);
    });

    allRows.forEach(r => {
      const stat = getUserSummary(r.user_name, r.email, r.department, r.avatar_url);
      const ymd = r.date.split('T')[0];
      const covered = coveredDaysByUser.get(r.user_name)!;

      if (r.type === 'attendance') {
        if (r.status === 'on_time' || r.status === 'late') {
          const isWeekend = new Date(r.date).getDay() === 0 || new Date(r.date).getDay() === 6;
          if (!isWeekend) {
            stat.presentCount += 1;
            covered.add(ymd); // วันที่มาทำงานปกติ ถือว่าไม่ขาด
          }
        }

        // นับการลา/ออกหน้างานที่บันทึกด้วยมือ (type = attendance)
        const key = `${r.user_name}_${ymd}`;
        if (!approvedLeaveMap.has(key)) {
          if (r.status.includes('sick_leave')) {
            const val = r.status.includes('morning') || r.status.includes('afternoon') ? 0.5 : 1.0;
            stat.sickLeave += val;
            if (val === 1.0) covered.add(ymd);
          } else if (r.status.includes('personal_leave')) {
            const val = r.status.includes('morning') || r.status.includes('afternoon') ? 0.5 : 1.0;
            stat.personalLeave += val;
            if (val === 1.0) covered.add(ymd);
          } else if (r.status === 'annual_leave') {
            stat.annualLeave += 1.0;
            covered.add(ymd);
          }
        }

        if (r.status === 'offsite') {
          if (!approvedOffsiteMap.has(key)) {
            stat.offsite += 1;
          }
          covered.add(ymd);
        }

        if (r.check_in_at) {
          const isMorningLeave = !!morningLeaveMap.get(`${r.user_name}_${ymd}`);
          const targetHour = isMorningLeave ? 13 : 9;
          const targetMin = isMorningLeave ? 0 : 0;
          const checkIn = new Date(r.check_in_at);
          const target = new Date(checkIn);
          target.setHours(targetHour, targetMin, 0, 0);
          const diffMs = checkIn.getTime() - target.getTime();
          const late = diffMs > 0 ? Math.floor(diffMs / 60000) : 0;
          if (late > 0) {
            stat.lateCount += 1;
            stat.lateMinutes += late;
          }
        }
        stat.totalWorkHours += computeWorkHours(r.check_in_at, r.check_out_at);
      } else if (r.type === 'leave' && r.status.includes('approved')) {
        const val = r.status.includes('ครึ่ง') ? 0.5 : 1.0;
        if (r.status.includes('ลาป่วย')) stat.sickLeave += val;
        else if (r.status.includes('ลากิจ')) stat.personalLeave += val;
        else if (r.status.includes('ลาพักร้อน')) stat.annualLeave += val;
        if (val === 1.0) covered.add(ymd); // ลาเต็มวัน ถือว่าไม่ขาด
      } else if (r.type === 'offsite' && r.status.includes('approved')) {
        stat.offsite += 1;
        covered.add(ymd);
      }
    });

    // คำนวณวันขาดงาน + % ตรงเวลา
    map.forEach((stat, name) => {
      const covered = coveredDaysByUser.get(name)!;
      let absent = 0;
      scheduledYMDs.forEach(ymd => {
        if (!covered.has(ymd)) absent += 1;
      });
      stat.absentDays = absent;
      stat.totalWorkHours = Math.round(stat.totalWorkHours * 100) / 100;
      const onTimeDays = stat.presentCount - stat.lateCount;
      stat.onTimeRate = stat.presentCount > 0
        ? Math.round((onTimeDays / stat.presentCount) * 1000) / 10
        : 0;
    });

    let result = Array.from(map.values());
    if (searchName) {
      result = result.filter(s => s.name.toLowerCase().includes(searchName.toLowerCase()));
    }
    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [allRows, users, userAvatarMap, searchName, scheduledWorkDays, scheduledYMDs, approvedLeaveMap, approvedOffsiteMap, morningLeaveMap]);

  // Pagination สำหรับ Summary
  const summaryTotalPages = Math.max(1, Math.ceil(summaryData.length / PAGE_SIZE));
  const pagedSummary = summaryData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleReset() {
    setSearchName('');
    setFilterType('All');
    setFilterMonth(new Date().toISOString().slice(0, 7));
    setFilterDay(String(new Date().getDate()).padStart(2, '0'));
    setPage(1);
  }

  async function handleExport() {
    try {
      const excelExportModule = import('../utils/excelExport');
      const mLeaveMap = new Map<string, boolean>();
      allRows.forEach(r => {
        if (r.type === 'leave' && r.status.includes('approved') && r.status.includes('ครึ่งเช้า')) {
          mLeaveMap.set(`${r.user_name}_${r.date.split('T')[0]}`, true);
        }
      });
      const { exportXLSX } = await excelExportModule;
      exportXLSX(filteredRows, summaryData, scheduledWorkDays, filterMonth, mLeaveMap);
    } catch (err) {
      console.error('ส่งออก Excel ล้มเหลว:', err);
    }
  }

  const inactiveTabStyle = {
    backgroundColor: 'transparent',
    color: 'var(--text-color)',
    border: '1px solid var(--border-color)',
    cursor: 'pointer'
  };

  return (
    <div id="history" className="page-section active">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <h2>รายงานการเข้างาน</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {currentUser?.role === 'admin' && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                const firstUser = users.find(u => u.status === 'active') || null;
                setManualUser(firstUser);
                const todayYMD = new Date().toISOString().split('T')[0];
                setManualDate(filterDay !== 'All' ? `${filterMonth}-${filterDay}` : todayYMD);
                setManualStatus('on_time');
                setManualError('');
                setManualModalOpen(true);
              }}
              style={{ backgroundColor: '#4F46E5', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <UserCheck size={18} /> บันทึกลงเวลาแทน
            </button>
          )}
          <button className="btn-primary" onClick={handleExport} style={{ backgroundColor: '#217346', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Download size={18} /> Export Excel
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
        <button
          className={activeTab === 'log' ? 'btn-primary' : ''}
          style={{ ...(activeTab === 'log' ? {} : inactiveTabStyle), display: 'flex', alignItems: 'center', gap: '8px' }}
          onClick={() => { setActiveTab('log'); setPage(1); }}
        >
          <FileText size={18} /> รายละเอียดรายวัน
        </button>
        <button
          className={activeTab === 'summary' ? 'btn-primary' : ''}
          style={{ ...(activeTab === 'summary' ? {} : inactiveTabStyle), display: 'flex', alignItems: 'center', gap: '8px' }}
          onClick={() => { setActiveTab('summary'); setPage(1); }}
        >
          <BarChart size={18} /> สรุปประจำเดือน
        </button>
      </div>

      <div className="history-filters glass-panel" style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', padding: '15px', borderRadius: '12px', alignItems: 'center', position: 'relative', zIndex: 10 }}>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-gray)' }} />
          <input
            type="text"
            className="form-control"
            placeholder="ค้นหาชื่อ..."
            style={{ width: '200px', margin: 0, paddingLeft: '35px' }}
            value={searchName}
            onChange={(e) => { setSearchName(e.target.value); setPage(1); }}
          />
        </div>
        {activeTab === 'log' && (
          <select
            className="form-control"
            style={{ width: '160px', margin: 0 }}
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
          >
            <option value="All">ทุกประเภท</option>
            <option value="มาทำงาน (ตรงเวลา)">มาทำงาน (ตรงเวลา)</option>
            <option value="มาทำงาน (สาย)">มาทำงาน (สาย)</option>
            <option value="ยังไม่มาทำงาน">ยังไม่มาทำงาน</option>
            <option value="ลาป่วย">ลาป่วย</option>
            <option value="ลากิจ">ลากิจ</option>
            <option value="ลาพักร้อน">ลาพักร้อน</option>
            <option value="ออกหน้างาน">ออกหน้างาน</option>
            <option value="สลับวันหยุด">สลับวันหยุด</option>
          </select>
        )}
        <MonthPicker filterMonth={filterMonth} setFilterMonth={setFilterMonth} />
        {activeTab === 'log' && (
          <select
            className="form-control"
            style={{ width: '110px', margin: 0 }}
            value={filterDay}
            onChange={(e) => { setFilterDay(e.target.value); setPage(1); }}
          >
            <option value="All">ทุกวัน</option>
            {Array.from({ length: daysInMonth }, (_, i) => {
              const dVal = String(i + 1).padStart(2, '0');
              return (
                <option key={dVal} value={dVal}>
                  วันที่ {i + 1}
                </option>
              );
            })}
          </select>
        )}
        <button className="btn-reset" onClick={handleReset}>รีเซ็ต</button>
      </div>

      <div className="table-card glass-panel">
        {activeTab === 'log' ? (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>วันที่</th>
                  <th style={{ whiteSpace: 'nowrap' }}>พนักงาน</th>
                  <th style={{ whiteSpace: 'nowrap' }}>ตำแหน่ง</th>
                  <th className="hide-type" style={{ whiteSpace: 'nowrap' }}>ประเภท</th>
                  <th style={{ whiteSpace: 'nowrap' }}>สถานะ</th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>เข้า</th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>ออก</th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>สาย<br/><small>(นาที)</small></th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>ชม.<br/>ทำงาน</th>
                  <th style={{ whiteSpace: 'nowrap' }}>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody id="history-table">
                {loading ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '30px' }}>
                      กำลังโหลดข้อมูล...
                    </td>
                  </tr>
                ) : pagedRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-gray)' }}>
                      ไม่พบข้อมูล
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((row, idx) => {
                    const ymd = row.date.split('T')[0];
                    const late = row.type === 'attendance' ? computeLateMinutes(row.check_in_at, row.user_name, ymd, morningLeaveMap) : 0;
                    const wh = row.type === 'attendance' ? computeWorkHours(row.check_in_at, row.check_out_at) : 0;
                    const avatar = row.avatar_url || userAvatarMap.get(row.email);
                    const statusText = translateStatus(row.status, row.date);
                    const typeText = translateType(row.type);
                    const isAbsent = statusText === 'ยังไม่มาทำงาน' || typeText === 'ยังไม่มาทำงาน';

                    return (
                      <tr key={`${row.date}-${row.user_name}-${idx}`}>
                        {/* 1. วันที่ กระชับขึ้น พร้อมชื่อวันในสัปดาห์ */}
                        {/* 1. วันที่: บรรทัดบนบอกวัน (จ), บรรทัดล่างบอกวันที่ (31 ส.ค. 69) */}
                        <td data-label="วันที่" style={{ whiteSpace: 'nowrap' }}>
                          {(() => {
                            const { weekdayClean, dateStr, isWeekend } = parseCompactDateParts(row.date);
                            return (
                              <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '1px',
                                lineHeight: '1.25',
                              }}>
                                <span style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: isWeekend ? '#DC2626' : '#4F46E5',
                                }}>
                                  {weekdayClean}
                                </span>
                                <span style={{
                                  fontSize: '12.5px',
                                  fontWeight: 600,
                                  color: '#1E293B',
                                }}>
                                  {dateStr}
                                </span>
                              </div>
                            );
                          })()}
                        </td>

                        {/* 2. พนักงาน พร้อมรูป Avatar (เมล เอาออก) */}
                        <td data-label="พนักงาน">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {avatarUrl(avatar) ? (
                              <img
                                src={avatarUrl(avatar)!}
                                alt={row.user_name}
                                style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #e2e8f0', flexShrink: 0 }}
                              />
                            ) : (
                              <div style={{
                                width: '28px', height: '28px', borderRadius: '50%',
                                backgroundColor: '#EEF2FF', color: '#4F46E5', fontWeight: 700, fontSize: '11px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                border: '1px solid #E0E7FF'
                              }}>
                                {row.user_name ? row.user_name.charAt(0).toUpperCase() : 'U'}
                              </div>
                            )}
                            <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.user_name}</span>
                          </div>
                        </td>

                        {/* 3. ตำแหน่ง (แผนก เอาออก) */}
                        <td data-label="ตำแหน่ง">{row.position || '-'}</td>

                        {/* 4. ประเภท (มี ยังไม่มาทำงาน) */}
                        <td className="hide-type" data-label="ประเภท">
                          <span style={typeText === 'ยังไม่มาทำงาน' ? { color: '#DC2626', fontWeight: 600 } : undefined}>
                            {typeText}
                          </span>
                        </td>

                        {/* 5. สถานะ (มี ยังไม่มาทำงาน) */}
                        <td data-label="สถานะ">
                          <span
                            className={`status-badge ${getStatusClass(statusText, row.status)}`}
                            style={{
                              width: '128px',
                              minWidth: '128px',
                              maxWidth: '128px',
                              height: '28px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              textAlign: 'center',
                              boxSizing: 'border-box',
                              whiteSpace: 'nowrap',
                              borderRadius: '9999px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: currentUser?.role === 'admin' && isAbsent ? 'pointer' : 'default',
                              ...(isAbsent ? {
                                backgroundColor: '#FEF2F2',
                                color: '#DC2626',
                                border: '1px solid #FECACA',
                              } : {}),
                            }}
                            onClick={() => {
                              if (currentUser?.role === 'admin' && isAbsent) {
                                const matchedUser = users.find(u => u.email === row.email || getEmployeeDisplayName(u) === row.user_name);
                                setManualUser(matchedUser || null);
                                setManualDate(row.date.split('T')[0]);
                                setManualStatus('on_time');
                                setManualError('');
                                setManualModalOpen(true);
                              }
                            }}
                            title={currentUser?.role === 'admin' && isAbsent ? 'คลิกเพื่อลงเวลาแทน' : undefined}
                          >
                            {statusText}
                          </span>
                        </td>

                        {/* 6. เข้า พร้อมพิกัด GPS */}
                        <td data-label="เข้า" style={{ textAlign: 'center', color: row.type === 'attendance' && row.status === 'late' ? 'var(--danger-color)' : 'inherit', fontWeight: row.type === 'attendance' && row.status === 'late' ? 'bold' : 'normal' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', justifyContent: 'center' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <span>{row.type === 'attendance' && row.check_in_at ? formatTime(row.check_in_at) : '-'}</span>
                              {row.check_in_photo && (
                                <i
                                  className="fa-solid fa-image"
                                  style={{ color: 'var(--primary)', cursor: 'pointer', fontSize: '13px' }}
                                  onClick={() => {
                                    const rawUrl = row.check_in_photo!;
                                    const httpUrl = rawUrl.startsWith('r2://')
                                      ? rawUrl.replace('r2://', 'https://pub-2a877f7cc07b481ca09dec82cb240465.r2.dev/')
                                      : rawUrl;
                                    setActivePhotoUrl(httpUrl);
                                  }}
                                  title="ดูรูปถ่ายเช็คอิน"
                                />
                              )}
                            </div>
                            {(row.check_in_lat != null && row.check_in_lng != null) ? (
                              <a
                                href={`https://www.google.com/maps?q=${row.check_in_lat},${row.check_in_lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                  fontSize: '10px',
                                  color: '#4F46E5',
                                  textDecoration: 'none',
                                  backgroundColor: '#EEF2FF',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  border: '1px solid #E0E7FF',
                                  marginTop: '2px',
                                  cursor: 'pointer'
                                }}
                                title="คลิกเพื่อดูพิกัดบน Google Maps"
                              >
                                <MapPin size={9} style={{ color: '#6366F1', flexShrink: 0 }} />
                                <span>{row.check_in_lat.toFixed(4)}, {row.check_in_lng.toFixed(4)}</span>
                              </a>
                            ) : row.location_name ? (
                              <span style={{ fontSize: '10px', color: '#64748b' }}>{row.location_name}</span>
                            ) : null}
                          </div>
                        </td>

                        {/* 7. ออก พร้อมพิกัด GPS */}
                        <td data-label="ออก" style={{ textAlign: 'center', color: row.check_out_at ? 'inherit' : 'orange' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', justifyContent: 'center' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <span>{row.type === 'attendance' ? (row.check_out_at ? formatTime(row.check_out_at) : 'ยังไม่ออก') : '-'}</span>
                              {row.check_out_photo && (
                                <i
                                  className="fa-solid fa-image"
                                  style={{ color: 'var(--primary)', cursor: 'pointer', fontSize: '13px' }}
                                  onClick={() => {
                                    const rawUrl = row.check_out_photo!;
                                    const httpUrl = rawUrl.startsWith('r2://')
                                      ? rawUrl.replace('r2://', 'https://pub-2a877f7cc07b481ca09dec82cb240465.r2.dev/')
                                      : rawUrl;
                                    setActivePhotoUrl(httpUrl);
                                  }}
                                  title="ดูรูปถ่ายเช็คเอาท์"
                                />
                              )}
                            </div>
                            {(row.check_out_lat != null && row.check_out_lng != null) ? (
                              <a
                                href={`https://www.google.com/maps?q=${row.check_out_lat},${row.check_out_lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                  fontSize: '10px',
                                  color: '#4F46E5',
                                  textDecoration: 'none',
                                  backgroundColor: '#EEF2FF',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  border: '1px solid #E0E7FF',
                                  marginTop: '2px',
                                  cursor: 'pointer'
                                }}
                                title="คลิกเพื่อดูพิกัดบน Google Maps"
                              >
                                <MapPin size={9} style={{ color: '#6366F1', flexShrink: 0 }} />
                                <span>{row.check_out_lat.toFixed(4)}, {row.check_out_lng.toFixed(4)}</span>
                              </a>
                            ) : row.check_out_location_name ? (
                              <span style={{ fontSize: '10px', color: '#64748b' }}>{row.check_out_location_name}</span>
                            ) : null}
                          </div>
                        </td>

                        <td data-label="นาทีสาย" style={{ textAlign: 'center', color: late > 0 ? 'var(--danger-color)' : 'inherit', fontWeight: late > 0 ? 600 : 400 }}>
                          {row.type === 'attendance' && late > 0 ? late : '-'}
                        </td>
                        <td data-label="ชม.ทำงาน" style={{ textAlign: 'center' }}>
                          {row.type === 'attendance' && wh > 0 ? wh.toFixed(2) : '-'}
                        </td>
                        <td data-label="หมายเหตุ" style={{ fontSize: '12px', color: 'var(--text-gray)', maxWidth: '220px' }}>
                          {row.reason || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>พนักงาน</th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>มาทำงาน<br/><small>(วัน)</small></th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>มาสาย<br/><small>(ครั้ง)</small></th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>สายรวม<br/><small>(นาที)</small></th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>ขาดงาน<br/><small>(วัน)</small></th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>ลาป่วย<br/><small>(วัน)</small></th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>ลากิจ<br/><small>(วัน)</small></th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>ลาพักร้อน<br/><small>(วัน)</small></th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>ออกหน้างาน<br/><small>(ครั้ง)</small></th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>ชม.ทำงาน<br/>รวม</th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>% ตรงเวลา</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '30px' }}>กำลังโหลดข้อมูล...</td>
                  </tr>
                ) : pagedSummary.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-gray)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <CheckCircle size={32} color="var(--success-color)" />
                        <span>ไม่พบข้อมูลในเดือนนี้</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pagedSummary.map((row) => {
                    const avatar = row.avatar_url || userAvatarMap.get(row.email) || userAvatarMap.get(row.name);
                    return (
                      <tr key={row.email || row.name}>
                        <td data-label="พนักงาน">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {avatarUrl(avatar) ? (
                              <img
                                src={avatarUrl(avatar)!}
                                alt={row.name}
                                style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #e2e8f0', flexShrink: 0 }}
                              />
                            ) : (
                              <div style={{
                                width: '28px', height: '28px', borderRadius: '50%',
                                backgroundColor: '#EEF2FF', color: '#4F46E5', fontWeight: 700, fontSize: '11px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                border: '1px solid #E0E7FF'
                              }}>
                                {row.name ? row.name.charAt(0).toUpperCase() : 'U'}
                              </div>
                            )}
                            <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.name}</span>
                          </div>
                        </td>
                        <td data-label="มาทำงาน (วัน)" style={{ textAlign: 'center' }}>{row.presentCount || '-'}</td>
                        <td data-label="มาสาย (ครั้ง)" style={{ textAlign: 'center', color: row.lateCount > 3 ? 'var(--danger-color)' : 'inherit', fontWeight: row.lateCount > 3 ? 'bold' : 'normal' }}>{row.lateCount || '-'}</td>
                        <td data-label="สายรวม (นาที)" style={{ textAlign: 'center', color: row.lateMinutes ? 'var(--danger-color)' : 'inherit', fontWeight: row.lateMinutes ? 'bold' : 'normal' }}>{row.lateMinutes || '-'}</td>
                        <td data-label="ขาดงาน (วัน)" style={{ textAlign: 'center', color: row.absentDays ? 'var(--danger-color)' : 'inherit', fontWeight: row.absentDays ? 'bold' : 'normal' }}>{row.absentDays || '-'}</td>
                        <td data-label="ลาป่วย (วัน)" style={{ textAlign: 'center', color: row.sickLeave ? 'var(--danger-color)' : 'inherit' }}>{row.sickLeave || '-'}</td>
                        <td data-label="ลากิจ (วัน)" style={{ textAlign: 'center', color: row.personalLeave ? 'var(--danger-color)' : 'inherit' }}>{row.personalLeave || '-'}</td>
                        <td data-label="ลาพักร้อน (วัน)" style={{ textAlign: 'center', color: row.annualLeave ? 'var(--primary-color)' : 'inherit' }}>{row.annualLeave || '-'}</td>
                        <td data-label="ออกหน้างาน (ครั้ง)" style={{ textAlign: 'center' }}>{row.offsite || '-'}</td>
                        <td data-label="ชม.ทำงานรวม" style={{ textAlign: 'center' }}>{row.totalWorkHours > 0 ? row.totalWorkHours.toFixed(2) : '-'}</td>
                        <td data-label="% ตรงเวลา" style={{ textAlign: 'center', fontWeight: 600, color: row.onTimeRate >= 90 ? 'var(--success-color)' : row.onTimeRate >= 75 ? 'var(--gold)' : 'var(--danger-color)' }}>{row.onTimeRate}%</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="pagination-container" id="pagination-controls">
          <button
            className="btn-page"
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            ❮ ก่อนหน้า
          </button>
          <span className="page-info">หน้า {page} / {activeTab === 'log' ? totalPages : summaryTotalPages}</span>
          <button
            className="btn-page"
            disabled={activeTab === 'log' ? page >= totalPages : page >= summaryTotalPages}
            onClick={() => setPage(p => Math.min(activeTab === 'log' ? totalPages : summaryTotalPages, p + 1))}
          >
            ถัดไป ❯
          </button>
        </div>
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
            <h4 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600 }}>รูปภาพการลงเวลาย้อนหลัง</h4>
            <img
              src={activePhotoUrl}
              alt="History record"
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

      {/* Modal บันทึกลงเวลาแทนพนักงาน (Manual Attendance) */}
      {manualModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
          onClick={() => setManualModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '440px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: '#EEF2FF', color: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserCheck size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>บันทึกลงเวลาแทน</h3>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>สำหรับกรณีพนักงานลืมสแกนหรือสแกนไม่ติด</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setManualModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '18px' }}
              >
                ✕
              </button>
            </div>

            {manualError && (
              <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                {manualError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  พนักงาน
                </label>
                <select
                  className="form-control"
                  style={{ width: '100%', margin: 0 }}
                  value={manualUser?.id || ''}
                  onChange={(e) => {
                    const u = users.find(user => user.id === e.target.value);
                    setManualUser(u || null);
                  }}
                >
                  {users.filter(u => u.status === 'active').map(u => (
                    <option key={u.id} value={u.id}>
                      {getEmployeeDisplayName(u)} {u.nickname ? `(${u.nickname})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  วันที่
                </label>
                <input
                  type="date"
                  className="form-control"
                  style={{ width: '100%', margin: 0 }}
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  สถานะการเข้างาน
                </label>
                <select
                  className="form-control"
                  style={{ width: '100%', margin: 0 }}
                  value={manualStatus}
                  onChange={(e) => setManualStatus(e.target.value)}
                >
                  <option value="on_time">มาทำงาน (ตรงเวลา)</option>
                  <option value="late">มาทำงาน (สาย)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
              <button
                type="button"
                className="btn-reset"
                onClick={() => setManualModalOpen(false)}
                disabled={savingManual}
                style={{ padding: '8px 16px' }}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={async () => {
                  if (!manualUser) {
                    setManualError('กรุณาเลือกพนักงาน');
                    return;
                  }
                  if (!manualDate) {
                    setManualError('กรุณาเลือกวันที่');
                    return;
                  }
                  setSavingManual(true);
                  setManualError('');
                  try {
                    await manualAttendance({
                      user_id: manualUser.id,
                      date: manualDate,
                      status: manualStatus,
                    });
                    setManualModalOpen(false);
                    await loadData();
                  } catch (err: any) {
                    setManualError(err?.response?.data?.error || err?.message || 'บันทึกล้มเหลว');
                  } finally {
                    setSavingManual(false);
                  }
                }}
                disabled={savingManual}
                style={{ padding: '8px 20px', backgroundColor: '#4F46E5' }}
              >
                {savingManual ? 'กำลังบันทึก...' : 'บันทึกเวลา'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
