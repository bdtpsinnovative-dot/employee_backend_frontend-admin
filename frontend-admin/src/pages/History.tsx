import { useState, useEffect, useMemo } from 'react';
import { Download, FileText, BarChart, Search, CheckCircle } from 'lucide-react';
import { fetchMonthlyHistory } from '../services/adminApi';
import type { HistoryRecord } from '../types';

const PAGE_SIZE = 20;

export default function History() {
  const [allRows, setAllRows] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchName, setSearchName] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [filterMonth, setFilterMonth] = useState(
    new Date().toISOString().slice(0, 7) // YYYY-MM
  );
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'log' | 'summary'>('log');

  useEffect(() => {
    loadData();
  }, [filterMonth]);

  async function loadData() {
    setLoading(true);
    try {
      const records = await fetchMonthlyHistory(filterMonth);
      setAllRows(records);
      setPage(1);
    } catch (err) {
      console.error('โหลดประวัติล้มเหลว:', err);
    }
    setLoading(false);
  }

  // ──── Filtering for Log ────
  const filteredRows = useMemo(() => {
    return allRows.filter(r => {
      if (searchName && !r.user_name.toLowerCase().includes(searchName.toLowerCase())) return false;
      const thStatus = translateStatus(r.status, r.date);
      if (filterType !== 'All') {
        if (!thStatus.includes(filterType)) return false;
      }
      return true;
    });
  }, [allRows, searchName, filterType]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ──── Calculation for Monthly Report ────
  const summaryData = useMemo(() => {
    const map = new Map<string, { 
      name: string, presentCount: number, lateCount: number, lateMinutes: number,
      sickLeave: number, personalLeave: number, annualLeave: number,
      holidayWork: number, offsite: number, missingCheckout: number
    }>();

    const getUserStat = (name: string) => {
      if (!map.has(name)) {
        map.set(name, {
          name, presentCount: 0, lateCount: 0, lateMinutes: 0,
          sickLeave: 0, personalLeave: 0, annualLeave: 0,
          holidayWork: 0, offsite: 0, missingCheckout: 0
        });
      }
      return map.get(name)!;
    };

    // Build leave map to check morning leaves
    const leaveMap = new Map<string, string>();
    allRows.forEach(r => {
      if (r.type === 'leave' && r.status.includes('approved')) {
        leaveMap.set(`${r.user_name}_${r.date.split('T')[0]}`, r.status);
      }
    });

    allRows.forEach(r => {
      const stat = getUserStat(r.user_name);
      
      if (r.type === 'attendance') {
        if (r.status === 'on_time' || r.status === 'late') {
          const isWeekend = new Date(r.date).getDay() === 0 || new Date(r.date).getDay() === 6;
          if (isWeekend) {
            stat.holidayWork += 1;
          } else {
            stat.presentCount += 1;
          }
        }
        
        if (r.check_in_at && !r.check_out_at) {
          stat.missingCheckout += 1;
        }

        if (r.check_in_at) {
          const checkIn = new Date(r.check_in_at);
          const target = new Date(r.check_in_at);
          const ymd = r.date.split('T')[0];
          const leaveStatus = leaveMap.get(`${r.user_name}_${ymd}`);
          if (leaveStatus && leaveStatus.includes('ครึ่งวันเช้า')) {
            target.setHours(13, 0, 0, 0); 
          } else {
            target.setHours(9, 0, 0, 0);
          }
          
          if (checkIn.getTime() > target.getTime()) {
            const diffMs = checkIn.getTime() - target.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            if (diffMins > 0) {
              stat.lateCount += 1;
              stat.lateMinutes += diffMins;
            }
          }
        }
      } else if (r.type === 'leave' && r.status.includes('approved')) {
        const val = r.status.includes('ครึ่ง') ? 0.5 : 1.0;
        if (r.status.includes('ลาป่วย')) stat.sickLeave += val;
        else if (r.status.includes('ลากิจ')) stat.personalLeave += val;
        else if (r.status.includes('ลาพักร้อน')) stat.annualLeave += val;
      } else if (r.type === 'offsite' && r.status.includes('approved')) {
        stat.offsite += 1;
      }
    });
    
    let result = Array.from(map.values());
    if (searchName) {
      result = result.filter(s => s.name.toLowerCase().includes(searchName.toLowerCase()));
    }
    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [allRows, searchName]);

  // Pagination for Summary
  const summaryTotalPages = Math.max(1, Math.ceil(summaryData.length / PAGE_SIZE));
  const pagedSummary = summaryData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function formatDate(iso: string) {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return iso;
    }
  }

  function formatTime(iso: string | undefined) {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '-';
    }
  }

  function translateStatus(raw: string, isoDate?: string) {
    if (isoDate) {
      const day = new Date(isoDate).getDay();
      if ((day === 0 || day === 6) && (raw === 'on_time' || raw === 'late')) {
        return 'ทำงานวันหยุด';
      }
    }
    
    if (raw === 'on_time') return 'มาทำงาน (ตรงเวลา)';
    if (raw === 'late') return 'มาทำงาน (สาย)';
    if (raw.startsWith('offsite')) return raw.replace('offsite', 'ออกหน้างาน');
    if (raw.includes('sick_leave_full')) return raw.replace('sick_leave_full', 'ลาป่วย (เต็มวัน)');
    if (raw.includes('sick_leave_morning')) return raw.replace('sick_leave_morning', 'ลาป่วย (ครึ่งเช้า)');
    if (raw.includes('sick_leave_afternoon')) return raw.replace('sick_leave_afternoon', 'ลาป่วย (ครึ่งบ่าย)');
    if (raw.includes('personal_leave_full')) return raw.replace('personal_leave_full', 'ลากิจ (เต็มวัน)');
    if (raw.includes('personal_leave_morning')) return raw.replace('personal_leave_morning', 'ลากิจ (ครึ่งเช้า)');
    if (raw.includes('personal_leave_afternoon')) return raw.replace('personal_leave_afternoon', 'ลากิจ (ครึ่งบ่าย)');
    if (raw.includes('annual_leave')) return raw.replace('annual_leave', 'ลาพักร้อน');
    if (raw.includes('shift_swap')) return raw.replace('shift_swap', 'สลับวันหยุด');
    if (raw === 'unknown') return 'ไม่ทราบสาเหตุ';
    return raw;
  }

  function getStatusClass(status: string) {
    if (status.includes('ตรงเวลา')) return 'st-ontime';
    if (status.includes('สาย')) return 'st-late';
    if (status.includes('ออกหน้างาน')) return 'st-offsite';
    if (status.includes('ลา')) return 'st-leave';
    if (status.includes('วันหยุด')) return 'st-weekend';
    return 'st-unknown';
  }

  function handleReset() {
    setSearchName('');
    setFilterType('All');
    setFilterMonth(new Date().toISOString().slice(0, 7));
    setPage(1);
  }

  function exportCSV() {
    if (activeTab === 'log') {
      if (filteredRows.length === 0) {
        alert("ไม่มีข้อมูลสำหรับ Export");
        return;
      }
      const headers = ["วันที่", "ชื่อพนักงาน", "ประเภท", "สถานะ", "เวลาเข้างาน", "เวลาออกงาน"];
      const csvRows = [headers.join(',')];
      
      for (const row of filteredRows) {
        const date = formatDate(row.date);
        const name = `"${row.user_name}"`;
        const type = row.type;
        const status = `"${translateStatus(row.status, row.date)}"`;
        const inTime = formatTime(row.check_in_at);
        const outTime = formatTime(row.check_out_at);
        
        csvRows.push([date, name, type, status, inTime, outTime].join(','));
      }
      downloadCSV(csvRows.join('\n'), `History_Log_${filterMonth}.csv`);
    } else {
      if (summaryData.length === 0) {
        alert("ไม่มีข้อมูลสำหรับ Export");
        return;
      }
      const headers = [
        "ชื่อพนักงาน", "มาทำงานปกติ (วัน)", "ทำงานวันหยุด (วัน)", 
        "ออกหน้างาน (วัน)", "ลาป่วย (วัน)", "ลากิจ (วัน)", "ลาพักร้อน (วัน)", 
        "สาย (ครั้ง)", "สายรวม (นาที)", "ลืมสแกนออก (ครั้ง)"
      ];
      const csvRows = [headers.join(',')];
      for (const row of summaryData) {
        csvRows.push([
          `"${row.name}"`, 
          row.presentCount, row.holidayWork, row.offsite, 
          row.sickLeave, row.personalLeave, row.annualLeave, 
          row.lateCount, row.lateMinutes, row.missingCheckout
        ].join(','));
      }
      downloadCSV(csvRows.join('\n'), `Monthly_Report_${filterMonth}.csv`);
    }
  }

  function downloadCSV(csvContent: string, filename: string) {
    const csvString = "\uFEFF" + csvContent; // Add BOM for Excel Thai support
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const inactiveTabStyle = {
    backgroundColor: 'transparent',
    color: 'var(--text-color)',
    border: '1px solid var(--border-color)',
    cursor: 'pointer'
  };

  return (
    <div id="history" className="page-section active">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center' }}>
        <h2>ประวัติ (Log) & สรุปยอด</h2>
        <button className="btn-primary" onClick={exportCSV} style={{ backgroundColor: '#217346', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Download size={18} /> Export CSV ({activeTab === 'log' ? 'ประวัติ' : 'สรุปประจำเดือน'})
        </button>
      </div>

      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
        <button 
          className={activeTab === 'log' ? 'btn-primary' : ''}
          style={{ ...(activeTab === 'log' ? {} : inactiveTabStyle), display: 'flex', alignItems: 'center', gap: '8px' }}
          onClick={() => { setActiveTab('log'); setPage(1); }}
        >
          <FileText size={18} /> ประวัติรายวัน
        </button>
        <button 
          className={activeTab === 'summary' ? 'btn-primary' : ''}
          style={{ ...(activeTab === 'summary' ? {} : inactiveTabStyle), display: 'flex', alignItems: 'center', gap: '8px' }}
          onClick={() => { setActiveTab('summary'); setPage(1); }}
        >
          <BarChart size={18} /> สรุปประจำเดือน
        </button>
      </div>

      <div className="history-filters glass-panel" style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', padding: '15px', borderRadius: '12px', alignItems: 'center' }}>
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
        <input
          type="month"
          className="form-control"
          style={{ width: '180px', margin: 0 }}
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
        />
        <button className="btn-reset" onClick={handleReset}>รีเซ็ต</button>
      </div>
      
      <div className="table-card glass-panel">
        {activeTab === 'log' ? (
          <table>
            <thead>
              <tr>
                <th>วันที่</th>
                <th>พนักงาน</th>
                <th>สถานะ</th>
                <th>เวลาเข้า-ออก</th>
              </tr>
            </thead>
            <tbody id="history-table">
              {loading ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '30px' }}>
                    กำลังโหลดข้อมูล...
                  </td>
                </tr>
              ) : pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-gray)' }}>
                    ไม่พบข้อมูล
                  </td>
                </tr>
              ) : (
                pagedRows.map((row, idx) => (
                  <tr key={`${row.date}-${row.user_name}-${idx}`}>
                    <td data-label="วันที่">{formatDate(row.date)}</td>
                    <td data-label="พนักงาน" style={{ fontWeight: 600 }}>{row.user_name}</td>
                    <td data-label="สถานะ">
                      <span className={`status-badge ${getStatusClass(translateStatus(row.status, row.date))}`}>{translateStatus(row.status, row.date)}</span>
                    </td>
                    <td data-label="เวลาเข้า-ออก" style={{ fontSize: '14px', color: 'var(--text-gray)' }}>
                      {(row.type === 'attendance' && (row.status === 'on_time' || row.status === 'late' || row.status.includes('offsite'))) ? (
                        <>
                          <span style={{ color: 'var(--success-color)' }}>{formatTime(row.check_in_at)}</span>
                          {' - '}
                          <span style={{ color: row.check_out_at ? 'inherit' : 'orange' }}>
                            {row.check_out_at ? formatTime(row.check_out_at) : 'ยังไม่ออก'}
                          </span>
                        </>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>พนักงาน</th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>มาทำงาน<br/><small>(วัน)</small></th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>วันหยุด<br/><small>(วัน)</small></th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>หน้างาน<br/><small>(วัน)</small></th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>ลาป่วย<br/><small>(วัน)</small></th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>ลากิจ<br/><small>(วัน)</small></th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>พักร้อน<br/><small>(วัน)</small></th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>มาสาย<br/><small>(ครั้ง)</small></th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>สายรวม<br/><small>(นาที)</small></th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>ลืมสแกนออก<br/><small>(ครั้ง)</small></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '30px' }}>กำลังโหลดข้อมูล...</td>
                  </tr>
                ) : pagedSummary.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-gray)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <CheckCircle size={32} color="var(--success-color)" />
                        <span>ไม่พบข้อมูลในเดือนนี้</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pagedSummary.map((row) => (
                    <tr key={row.name}>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.name}</td>
                      <td style={{ textAlign: 'center' }}>{row.presentCount}</td>
                      <td style={{ textAlign: 'center' }}>{row.holidayWork || '-'}</td>
                      <td style={{ textAlign: 'center' }}>{row.offsite || '-'}</td>
                      <td style={{ textAlign: 'center', color: row.sickLeave ? 'var(--danger-color)' : 'inherit' }}>{row.sickLeave || '-'}</td>
                      <td style={{ textAlign: 'center', color: row.personalLeave ? 'var(--danger-color)' : 'inherit' }}>{row.personalLeave || '-'}</td>
                      <td style={{ textAlign: 'center', color: row.annualLeave ? 'var(--primary-color)' : 'inherit' }}>{row.annualLeave || '-'}</td>
                      <td style={{ textAlign: 'center', color: row.lateCount ? 'var(--danger-color)' : 'inherit' }}>{row.lateCount || '-'}</td>
                      <td style={{ textAlign: 'center', color: row.lateMinutes ? 'var(--danger-color)' : 'inherit', fontWeight: row.lateMinutes ? 'bold' : 'normal' }}>{row.lateMinutes || '-'}</td>
                      <td style={{ textAlign: 'center', color: row.missingCheckout ? 'orange' : 'inherit' }}>{row.missingCheckout || '-'}</td>
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
    </div>
  );
}
