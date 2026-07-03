import { useState, useEffect, useMemo } from 'react';
import { fetchAllAttendance, fetchUsers, fetchAllRequests } from '../services/adminApi';
import type { User, Attendance, LeaveRequest, OffsiteRequest } from '../types';

interface HistoryRow {
  date: string;
  userName: string;
  status: string;
  statusClass: string;
  createdAt: string;
}

const PAGE_SIZE = 20;

export default function History() {
  const [allRows, setAllRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchName, setSearchName] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [filterMonth, setFilterMonth] = useState(
    new Date().toISOString().slice(0, 7) // YYYY-MM
  );
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadData();
  }, [filterMonth]);

  async function loadData() {
    setLoading(true);
    try {
      const [year, month] = filterMonth.split('-').map(Number);

      // โหลด attendance ทุกวันในเดือน
      const daysInMonth = new Date(year, month, 0).getDate();

      const [usersData, allRequestsData] = await Promise.all([
        fetchUsers(),
        fetchAllRequests(),
      ]);

      const userMap = new Map<string, User>();
      (usersData ?? []).forEach(u => userMap.set(u.id, u));

      const rows: HistoryRow[] = [];

      // โหลด attendance ทีละวัน (ภายในเดือน)
      const attendancePromises: Promise<Attendance[]>[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dayStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        attendancePromises.push(
          fetchAllAttendance(dayStr).catch(() => [])
        );
      }

      const allAttendance = await Promise.all(attendancePromises);

      allAttendance.forEach((dayRecords) => {
        dayRecords.forEach(att => {
          const user = userMap.get(att.user_id);
          const userName = user ? `${user.first_name} ${user.last_name}` : att.user_id;
          let status: string = att.status;
          let statusClass = 'st-unknown';

          switch (att.status) {
            case 'on_time': status = 'มาทำงาน (ตรงเวลา)'; statusClass = 'st-ontime'; break;
            case 'late': status = 'มาทำงาน (สาย)'; statusClass = 'st-late'; break;
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

          rows.push({
            date: att.date,
            userName,
            status,
            statusClass,
            createdAt: att.created_at,
          });
        });
      });

      // เพิ่ม leave requests (ทุกสถานะ — approved, pending, rejected)
      (allRequestsData.leaves ?? []).forEach((l: LeaveRequest) => {
        const lDate = l.date.slice(0, 7);
        if (lDate !== filterMonth) return;

        const user = userMap.get(l.user_id);
        rows.push({
          date: l.date,
          userName: user ? `${user.first_name} ${user.last_name}` : l.user_id,
          status: l.leave_type + (l.status !== 'approved' ? ` (${l.status})` : ''),
          statusClass: 'st-leave',
          createdAt: l.created_at,
        });
      });

      // เพิ่ม offsite requests (ทุกสถานะ)
      (allRequestsData.offsite ?? []).forEach((o: OffsiteRequest) => {
        const oDate = o.date.slice(0, 7);
        if (oDate !== filterMonth) return;

        const user = userMap.get(o.user_id);
        rows.push({
          date: o.date,
          userName: user ? `${user.first_name} ${user.last_name}` : o.user_id,
          status: 'ออกหน้างาน' + (o.status !== 'approved' ? ` (${o.status})` : ''),
          statusClass: 'st-offsite',
          createdAt: o.created_at,
        });
      });

      // เรียงตามวันที่ (ใหม่สุดก่อน)
      rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setAllRows(rows);
      setPage(1);
    } catch (err) {
      console.error('โหลดประวัติล้มเหลว:', err);
    }
    setLoading(false);
  }

  // ──── Filtering ────
  const filteredRows = useMemo(() => {
    return allRows.filter(r => {
      if (searchName && !r.userName.toLowerCase().includes(searchName.toLowerCase())) return false;
      if (filterType !== 'All') {
        if (!r.status.includes(filterType)) return false;
      }
      return true;
    });
  }, [allRows, searchName, filterType]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function formatDate(iso: string) {
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

  function handleReset() {
    setSearchName('');
    setFilterType('All');
    setFilterMonth(new Date().toISOString().slice(0, 7));
    setPage(1);
  }

  return (
    <div id="history" className="page-section active">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center' }}>
        <h2>ประวัติ (Log)</h2>
      </div>
      <div className="history-filters glass-panel" style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', padding: '15px', borderRadius: '12px' }}>
        <input
          type="text"
          className="form-control"
          placeholder="🔍 ค้นหาชื่อ..."
          style={{ width: '200px', margin: 0 }}
          value={searchName}
          onChange={(e) => { setSearchName(e.target.value); setPage(1); }}
        />
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
          <option value="ไม่ทราบสาเหตุ">ไม่ทราบสาเหตุ</option>
        </select>
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
        <table>
          <thead>
            <tr>
              <th>วันที่</th>
              <th>พนักงาน</th>
              <th>สถานะ</th>
              <th>บันทึกเมื่อ</th>
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
                <tr key={`${row.date}-${row.userName}-${idx}`}>
                  <td>{formatDate(row.date)}</td>
                  <td style={{ fontWeight: 600 }}>{row.userName}</td>
                  <td>
                    <span className={`status-badge ${row.statusClass}`}>{row.status}</span>
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--text-gray)' }}>
                    {formatDate(row.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="pagination-container" id="pagination-controls">
          <button
            className="btn-page"
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            ❮ ก่อนหน้า
          </button>
          <span className="page-info">หน้า {page} / {totalPages}</span>
          <button
            className="btn-page"
            disabled={page >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          >
            ถัดไป ❯
          </button>
        </div>
      </div>
    </div>
  );
}
