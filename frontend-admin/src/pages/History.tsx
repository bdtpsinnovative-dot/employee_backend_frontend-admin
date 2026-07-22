import { useState, useEffect, useMemo } from 'react';
import { Download, FileText, BarChart, Search, CheckCircle } from 'lucide-react';
import { fetchMonthlyHistory, fetchHolidays } from '../services/adminApi';
import type { HistoryRecord, Holiday } from '../types';
import MonthPicker from '../components/MonthPicker';
import { exportXLSX } from '../utils/excelExport';
import {
  formatDate,
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

export default function History() {
  const [allRows, setAllRows] = useState<HistoryRecord[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
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

  const [selectedYear, selectedMonth] = useMemo(() => {
    const [y, m] = filterMonth.split('-');
    return [parseInt(y, 10), parseInt(m, 10)];
  }, [filterMonth]);

  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth, 0).getDate();
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    loadData();
    const currentMonthStr = new Date().toISOString().slice(0, 7);
    if (filterMonth === currentMonthStr) {
      setFilterDay(String(new Date().getDate()).padStart(2, '0'));
    } else {
      setFilterDay('All');
    }
  }, [filterMonth]);

  async function loadData() {
    setLoading(true);
    try {
      const year = parseInt(filterMonth.split('-')[0], 10);
      const [records, holidaysData] = await Promise.all([
        fetchMonthlyHistory(filterMonth),
        fetchHolidays(year),
      ]);
      setAllRows(records);
      setHolidays(holidaysData ?? []);
      setPage(1);
    } catch (err) {
      console.error('โหลดประวัติล้มเหลว:', err);
    }
    setLoading(false);
  }

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

  // ──── Filtering สำหรับ Log ────
  const filteredRows = useMemo(() => {
    return allRows.filter(r => {
      if (searchName && !r.user_name.toLowerCase().includes(searchName.toLowerCase())) return false;
      
      // ฟิลเตอร์เฉพาะวัน
      if (filterDay !== 'All') {
        const datePart = r.date.split('T')[0]; // "YYYY-MM-DD"
        const dayPart = datePart.split('-')[2]; // "DD"
        if (dayPart !== filterDay) return false;
      }

      const thStatus = translateStatus(r.status, r.date);
      if (filterType !== 'All') {
        if (!thStatus.includes(filterType)) return false;
      }
      return true;
    });
  }, [allRows, searchName, filterType, filterDay]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ──── คำนวณสรุปรายเดือนต่อพนักงาน ────
  const summaryData = useMemo(() => {
    const map = new Map<string, UserSummary>();
    const coveredDaysByUser = new Map<string, Set<string>>();

    const getUserSummary = (name: string, email: string, dept: string) => {
      if (!map.has(name)) {
        map.set(name, {
          email, name, department: dept,
          scheduledDays: scheduledWorkDays,
          presentCount: 0, lateCount: 0, lateMinutes: 0,
          absentDays: 0, sickLeave: 0, personalLeave: 0, annualLeave: 0,
          offsite: 0, totalWorkHours: 0, onTimeRate: 0,
        });
        coveredDaysByUser.set(name, new Set());
      }
      return map.get(name)!;
    };

    allRows.forEach(r => {
      const stat = getUserSummary(r.user_name, r.email, r.department);
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
  }, [allRows, searchName, scheduledWorkDays, scheduledYMDs, approvedLeaveMap, approvedOffsiteMap, morningLeaveMap]);

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

  function handleExport() {
    const mLeaveMap = new Map<string, boolean>();
    allRows.forEach(r => {
      if (r.type === 'leave' && r.status.includes('approved') && r.status.includes('ครึ่งเช้า')) {
        mLeaveMap.set(`${r.user_name}_${r.date.split('T')[0]}`, true);
      }
    });
    exportXLSX(filteredRows, summaryData, scheduledWorkDays, filterMonth, mLeaveMap);
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
        <button className="btn-primary" onClick={handleExport} style={{ backgroundColor: '#217346', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Download size={18} /> Export Excel
        </button>
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
                  <th className="hide-email" style={{ whiteSpace: 'nowrap' }}>Email</th>
                  <th style={{ whiteSpace: 'nowrap' }}>พนักงาน</th>
                  <th style={{ whiteSpace: 'nowrap' }}>แผนก</th>
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
                    <td colSpan={12} style={{ textAlign: 'center', padding: '30px' }}>
                      กำลังโหลดข้อมูล...
                    </td>
                  </tr>
                ) : pagedRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-gray)' }}>
                      ไม่พบข้อมูล
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((row, idx) => {
                    const ymd = row.date.split('T')[0];
                    const late = row.type === 'attendance' ? computeLateMinutes(row.check_in_at, row.user_name, ymd, morningLeaveMap) : 0;
                    const wh = row.type === 'attendance' ? computeWorkHours(row.check_in_at, row.check_out_at) : 0;
                    return (
                      <tr key={`${row.date}-${row.user_name}-${idx}`}>
                        <td data-label="วันที่" style={{ whiteSpace: 'nowrap' }}>{formatDate(row.date)}</td>
                        <td className="hide-email" data-label="Email" style={{ fontSize: '12px', color: 'var(--text-gray)' }}>{row.email}</td>
                        <td data-label="พนักงาน" style={{ fontWeight: 600 }}>{row.user_name}</td>
                        <td data-label="แผนก">{row.department || '-'}</td>
                        <td data-label="ตำแหน่ง">{row.position || '-'}</td>
                        <td className="hide-type" data-label="ประเภท">{translateType(row.type)}</td>
                        <td data-label="สถานะ">
                          <span className={`status-badge ${getStatusClass(translateStatus(row.status, row.date))}`}>{translateStatus(row.status, row.date)}</span>
                        </td>
                        <td data-label="เข้า" style={{ textAlign: 'center', color: row.type === 'attendance' && row.status === 'late' ? 'var(--danger-color)' : 'inherit', fontWeight: row.type === 'attendance' && row.status === 'late' ? 'bold' : 'normal' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'center', width: '100%' }}>
                            {row.type === 'attendance' ? formatTime(row.check_in_at) : '-'}
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
                              ></i>
                            )}
                          </div>
                        </td>
                        <td data-label="ออก" style={{ textAlign: 'center', color: row.check_out_at ? 'inherit' : 'orange' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'center', width: '100%' }}>
                            {row.type === 'attendance' ? (row.check_out_at ? formatTime(row.check_out_at) : 'ยังไม่ออก') : '-'}
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
                              ></i>
                            )}
                          </div>
                        </td>
                        <td data-label="นาทีสาย" style={{ textAlign: 'center', color: late > 0 ? 'var(--danger-color)' : 'inherit', fontWeight: late > 0 ? 600 : 400 }}>
                          {row.type === 'attendance' && late > 0 ? late : '-'}
                        </td>
                        <td data-label="ชม.ทำงาน" style={{ textAlign: 'center' }}>
                          {row.type === 'attendance' && wh > 0 ? wh : '-'}
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
                  <th className="hide-email" style={{ whiteSpace: 'nowrap' }}>Email</th>
                  <th style={{ whiteSpace: 'nowrap' }}>พนักงาน</th>
                  <th style={{ whiteSpace: 'nowrap' }}>แผนก</th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>วันทำงาน<br/><small>(ตามตาราง)</small></th>
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
                    <td colSpan={14} style={{ textAlign: 'center', padding: '30px' }}>กำลังโหลดข้อมูล...</td>
                  </tr>
                ) : pagedSummary.length === 0 ? (
                  <tr>
                    <td colSpan={14} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-gray)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <CheckCircle size={32} color="var(--success-color)" />
                        <span>ไม่พบข้อมูลในเดือนนี้</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pagedSummary.map((row) => (
                    <tr key={row.email}>
                      <td className="hide-email" data-label="Email" style={{ fontSize: '12px', color: 'var(--text-gray)' }}>{row.email}</td>
                      <td data-label="พนักงาน" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.name}</td>
                      <td data-label="แผนก">{row.department || '-'}</td>
                      <td data-label="วันทำงาน (ตามตาราง)" style={{ textAlign: 'center' }}>{row.scheduledDays}</td>
                      <td data-label="มาทำงาน (วัน)" style={{ textAlign: 'center' }}>{row.presentCount || '-'}</td>
                      <td data-label="มาสาย (ครั้ง)" style={{ textAlign: 'center', color: row.lateCount > 3 ? 'var(--danger-color)' : 'inherit', fontWeight: row.lateCount > 3 ? 'bold' : 'normal' }}>{row.lateCount || '-'}</td>
                      <td data-label="สายรวม (นาที)" style={{ textAlign: 'center', color: row.lateMinutes ? 'var(--danger-color)' : 'inherit', fontWeight: row.lateMinutes ? 'bold' : 'normal' }}>{row.lateMinutes || '-'}</td>
                      <td data-label="ขาดงาน (วัน)" style={{ textAlign: 'center', color: row.absentDays ? 'var(--danger-color)' : 'inherit', fontWeight: row.absentDays ? 'bold' : 'normal' }}>{row.absentDays || '-'}</td>
                      <td data-label="ลาป่วย (วัน)" style={{ textAlign: 'center', color: row.sickLeave ? 'var(--danger-color)' : 'inherit' }}>{row.sickLeave || '-'}</td>
                      <td data-label="ลากิจ (วัน)" style={{ textAlign: 'center', color: row.personalLeave ? 'var(--danger-color)' : 'inherit' }}>{row.personalLeave || '-'}</td>
                      <td data-label="ลาพักร้อน (วัน)" style={{ textAlign: 'center', color: row.annualLeave ? 'var(--primary-color)' : 'inherit' }}>{row.annualLeave || '-'}</td>
                      <td data-label="ออกหน้างาน (ครั้ง)" style={{ textAlign: 'center' }}>{row.offsite || '-'}</td>
                      <td data-label="ชม.ทำงานรวม" style={{ textAlign: 'center' }}>{row.totalWorkHours > 0 ? row.totalWorkHours : '-'}</td>
                      <td data-label="% ตรงเวลา" style={{ textAlign: 'center', fontWeight: 600, color: row.onTimeRate >= 90 ? 'var(--success-color)' : row.onTimeRate >= 75 ? 'var(--gold)' : 'var(--danger-color)' }}>{row.onTimeRate}%</td>
                    </tr>
                  ))
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
    </div>
  );
}
