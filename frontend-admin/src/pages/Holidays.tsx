import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { fetchHolidays, createHoliday, deleteHoliday } from '../services/adminApi';
import type { Holiday, User } from '../types';

interface LayoutContext {
  currentUser: User | null;
}

export default function Holidays() {
  const { currentUser } = useOutletContext<LayoutContext>() || {};
  const isAdmin = currentUser?.role === 'admin';

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [year, setYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [selectedHoliday, setSelectedHoliday] = useState<Holiday | null>(null);

  // Form state (Admin)
  const [formDate, setFormDate] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formDays, setFormDays] = useState<number>(1);
  const [formLoading, setFormLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadHolidays();
  }, [year]);

  async function loadHolidays() {
    setLoading(true);
    try {
      const data = await fetchHolidays(year);
      (data ?? []).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setHolidays(data ?? []);
    } catch (err) {
      console.error('โหลดวันหยุดล้มเหลว:', err);
    }
    setLoading(false);
  }

  const monthNames = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  const weekDayNamesShort = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  const weekDayNamesFull = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];

  // Calculate total consecutive days off (including preceding & following weekends)
  function getConsecutiveDaysOff(dateIso: string, numDays: number = 1): number {
    try {
      const start = new Date(dateIso);
      start.setHours(0, 0, 0, 0);

      let firstDay = new Date(start);
      while (true) {
        const prev = new Date(firstDay.getTime() - 86400000);
        const day = prev.getDay();
        if (day === 0 || day === 6) {
          firstDay = prev;
        } else {
          break;
        }
      }

      let lastDay = new Date(start.getTime() + (numDays - 1) * 86400000);
      while (true) {
        const next = new Date(lastDay.getTime() + 86400000);
        const day = next.getDay();
        if (day === 0 || day === 6) {
          lastDay = next;
        } else {
          break;
        }
      }

      return Math.round((lastDay.getTime() - firstDay.getTime()) / 86400000) + 1;
    } catch {
      return numDays;
    }
  }

  function isLongWeekend(dateIso: string, numDays: number = 1): boolean {
    return getConsecutiveDaysOff(dateIso, numDays) >= 3;
  }

  // Find nearest upcoming holiday
  const upcomingHolidayInfo = useMemo(() => {
    const nowMs = today.getTime();

    // Filter holidays that end today or later
    const futureHolidays = holidays
      .map(h => {
        const startDate = new Date(h.date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(startDate.getTime() + ((h.num_days || 1) - 1) * 86400000);
        const diffMs = startDate.getTime() - nowMs;
        const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        return { holiday: h, startDate, endDate, daysLeft };
      })
      .filter(item => item.endDate.getTime() >= nowMs)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    return futureHolidays.length > 0 ? futureHolidays[0] : null;
  }, [holidays, today]);

  // Statistics calculation
  const stats = useMemo(() => {
    const totalDays = holidays.reduce((sum, h) => sum + (h.num_days || 1), 0);
    const longWeekends = holidays.filter(h => isLongWeekend(h.date, h.num_days)).length;

    // Remaining holidays this year
    const remainingCount = holidays.filter(h => {
      const d = new Date(h.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() >= today.getTime();
    }).length;

    return { totalHolidays: holidays.length, totalDays, longWeekends, remainingCount };
  }, [holidays, today]);

  // Handle holiday creation (Admin only)
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    if (!formDate || !formName) return;

    setFormLoading(true);
    try {
      await createHoliday({
        date: formDate,
        name: formName,
        num_days: formDays,
      });
      setFormDate('');
      setFormName('');
      setFormDays(1);
      setShowAddModal(false);
      await loadHolidays();
    } catch (err) {
      console.error('เพิ่มวันหยุดล้มเหลว:', err);
      alert('เพิ่มวันหยุดล้มเหลว');
    }
    setFormLoading(false);
  }

  // Handle holiday deletion (Admin only)
  async function handleDelete(id: string) {
    if (!isAdmin) return;
    if (!confirm('คุณต้องการลบวันหยุดนี้ใช่หรือไม่?')) return;

    setActionLoading(id);
    try {
      await deleteHoliday(id);
      if (selectedHoliday?.id === id) {
        setSelectedHoliday(null);
      }
      await loadHolidays();
    } catch (err) {
      console.error('ลบวันหยุดล้มเหลว:', err);
      alert('ลบวันหยุดล้มเหลว');
    }
    setActionLoading(null);
  }

  function formatDateThai(dateIso: string): string {
    try {
      const d = new Date(dateIso);
      return d.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateIso;
    }
  }

  function getWeekdayText(dateIso: string): string {
    try {
      const d = new Date(dateIso);
      return weekDayNamesFull[d.getDay()];
    } catch {
      return '-';
    }
  }

  // Calendar Grid builder for current month
  const calendarCells = useMemo(() => {
    const daysInMonth = new Date(year, currentMonth + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, currentMonth, 1).getDay(); // 0 = Sun
    const prevMonthDays = new Date(year, currentMonth, 0).getDate();

    const cells: Array<{
      dayNumber: number;
      isCurrentMonth: boolean;
      dateStr: string;
      isToday: boolean;
      holiday: Holiday | null;
      isHolidaySpan: boolean;
    }> = [];

    // Previous month padding
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const prevM = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevY = currentMonth === 0 ? year - 1 : year;
      const dateStr = `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      cells.push({
        dayNumber: dayNum,
        isCurrentMonth: false,
        dateStr,
        isToday: false,
        holiday: null,
        isHolidaySpan: false,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, currentMonth, d);
      dateObj.setHours(0, 0, 0, 0);
      const dateStr = `${year}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = dateObj.getTime() === today.getTime();

      // Find matching holiday
      let holidayMatch: Holiday | null = null;
      let isSpan = false;

      for (const h of holidays) {
        const hStart = new Date(h.date);
        hStart.setHours(0, 0, 0, 0);
        const hEnd = new Date(hStart.getTime() + ((h.num_days || 1) - 1) * 86400000);

        if (dateObj.getTime() >= hStart.getTime() && dateObj.getTime() <= hEnd.getTime()) {
          holidayMatch = h;
          isSpan = true;
          break;
        }
      }

      cells.push({
        dayNumber: d,
        isCurrentMonth: true,
        dateStr,
        isToday,
        holiday: holidayMatch,
        isHolidaySpan: isSpan,
      });
    }

    // Next month padding to fill complete 6 rows (42 cells) or 5 rows
    const totalCellsNeeded = cells.length > 35 ? 42 : 35;
    const remaining = totalCellsNeeded - cells.length;
    for (let i = 1; i <= remaining; i++) {
      const nextM = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextY = currentMonth === 11 ? year + 1 : year;
      const dateStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      cells.push({
        dayNumber: i,
        isCurrentMonth: false,
        dateStr,
        isToday: false,
        holiday: null,
        isHolidaySpan: false,
      });
    }

    return cells;
  }, [year, currentMonth, holidays, today]);

  // Grouped Holidays by Month for List View
  const filteredGroupedHolidays = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const filtered = holidays.filter(h => {
      if (!query) return true;
      const nameMatch = h.name.toLowerCase().includes(query);
      const dateMatch = formatDateThai(h.date).toLowerCase().includes(query);
      return nameMatch || dateMatch;
    });

    const groups: Record<number, Holiday[]> = {};
    filtered.forEach(h => {
      const m = new Date(h.date).getMonth();
      if (!groups[m]) groups[m] = [];
      groups[m].push(h);
    });

    return groups;
  }, [holidays, searchTerm]);

  return (
    <div id="holidays" className="page-section active max-w-7xl mx-auto pb-12">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
              <span className="w-10 h-10 rounded-xl bg-slate-900 text-amber-400 border border-slate-800 flex items-center justify-center shadow-xs text-base">
                <i className="fa-solid fa-calendar-days"></i>
              </span>
              ปฏิทินวันหยุดบริษัท
            </h2>
            <span className="bg-slate-100 text-slate-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-slate-200">
              ปี {year + 543}
            </span>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            {isAdmin
              ? 'ตรวจสอบวันหยุดประจำปี เพิ่มหรือจัดการวันหยุดสำหรับพนักงานในระบบ'
              : ''}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Year Selector */}
          <div className="relative">
            <select
              className="appearance-none bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl px-4 py-2.5 pr-9 shadow-xs hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {[year - 1, year, year + 1].map(y => (
                <option key={y} value={y}>พ.ศ. {y + 543} ({y})</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
              <i className="fa-solid fa-chevron-down text-xs"></i>
            </div>
          </div>

          {/* View Mode Switcher */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200">
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${viewMode === 'calendar'
                ? 'bg-white text-blue-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
                }`}
            >
              <i className="fa-solid fa-calendar-days text-sm"></i>
              ปฏิทิน
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${viewMode === 'list'
                ? 'bg-white text-blue-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
                }`}
            >
              <i className="fa-solid fa-list-ul text-sm"></i>
              รายการ
            </button>
          </div>

          {/* Add Holiday Button (Admin only) */}
          {isAdmin && (
            <button
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium text-sm px-4 py-2.5 rounded-xl shadow-md shadow-blue-500/20 hover:shadow-blue-500/30 active:scale-98 transition-all flex items-center gap-2 cursor-pointer"
              onClick={() => setShowAddModal(true)}
            >
              <i className="fa-solid fa-plus text-xs"></i>
              เพิ่มวันหยุด
            </button>
          )}
        </div>
      </div>

      {/* Top Banner: Upcoming Holiday Spotlight (Quiet Luxury Design) */}
      {upcomingHolidayInfo ? (
        <div className="bg-slate-900 rounded-2xl p-6 sm:p-7 text-white shadow-sm mb-8 border border-slate-800">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-amber-400 text-xs font-medium border border-slate-700/80">
                <i className="fa-solid fa-sparkles text-[11px]"></i>
                วันหยุดที่จะถึงถัดไป
              </div>

              <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                {upcomingHolidayInfo.holiday.name}
                {isLongWeekend(upcomingHolidayInfo.holiday.date, upcomingHolidayInfo.holiday.num_days) && (
                  <span className="text-xs bg-amber-950/70 text-amber-300 border border-amber-800/70 px-2.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1.5">
                    <i className="fa-solid fa-plane text-[10px] text-amber-400"></i> Long Weekend
                  </span>
                )}
              </h3>

              <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-slate-400">
                <div className="flex items-center gap-2">
                  <i className="fa-regular fa-calendar-check text-slate-300"></i>
                  <span>{getWeekdayText(upcomingHolidayInfo.holiday.date)} {formatDateThai(upcomingHolidayInfo.holiday.date)}</span>
                </div>
                <span className="w-1 h-1 rounded-full bg-slate-700"></span>
                <div className="flex items-center gap-2">
                  <i className="fa-regular fa-clock text-slate-300"></i>
                  <span>หยุดต่อเนื่อง {getConsecutiveDaysOff(upcomingHolidayInfo.holiday.date, upcomingHolidayInfo.holiday.num_days)} วัน</span>
                </div>
              </div>
            </div>

            {/* Countdown Badge */}
            <div className="w-full md:w-auto bg-slate-800/90 rounded-xl px-5 py-3.5 border border-slate-700/80 flex items-center justify-between md:flex-col md:justify-center text-center shrink-0 min-w-[140px]">
              <span className="text-xs text-slate-400 font-medium">จะถึงในอีก</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                {upcomingHolidayInfo.daysLeft === 0 ? (
                  <span className="text-lg font-bold text-amber-400">วันนี้วันหยุด! 🎉</span>
                ) : (
                  <>
                    <span className="text-2xl sm:text-3xl font-bold text-amber-400 tracking-tight">{upcomingHolidayInfo.daysLeft}</span>
                    <span className="text-xs font-semibold text-slate-300">วัน</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 text-slate-300 rounded-2xl p-5 mb-8 flex items-center gap-4 border border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-slate-800 text-amber-400 flex items-center justify-center text-base border border-slate-700">
            <i className="fa-solid fa-calendar-check"></i>
          </div>
          <div>
            <div className="font-semibold text-white text-sm">ไม่มีวันหยุดคงเหลือในปี {year + 543}</div>
            <p className="text-xs text-slate-400">คุณสามารถเปลี่ยนปี พ.ศ. ด้านบนเพื่อตรวจสอบปฏิทินวันหยุดปีก่อนหน้าหรือปีถัดไป</p>
          </div>
        </div>
      )}

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-lg font-bold">
            <i className="fa-solid fa-calendar-days"></i>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">วันหยุดทั้งหมด</div>
            <div className="text-xl font-black text-slate-800 mt-0.5">{stats.totalDays} <span className="text-xs font-normal text-slate-500">วัน</span></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-lg font-bold">
            <i className="fa-solid fa-hourglass-half"></i>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">คงเหลือในปีนี้</div>
            <div className="text-xl font-black text-amber-600 mt-0.5">{stats.remainingCount} <span className="text-xs font-normal text-slate-500">รายการ</span></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-lg font-bold">
            <i className="fa-solid fa-plane"></i>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">วันหยุดยาว 3+ วัน</div>
            <div className="text-xl font-black text-purple-600 mt-0.5">{stats.longWeekends} <span className="text-xs font-normal text-slate-500">ครั้ง</span></div>
          </div>
        </div>
      </div>

      {/* Main View: Calendar View */}
      {viewMode === 'calendar' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Month Header Controller */}
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-slate-800">
                {monthNames[currentMonth]} {year + 543}
              </h3>
              <span className="text-xs bg-slate-200 text-slate-700 font-medium px-2.5 py-0.5 rounded-full">
                {holidays.filter(h => new Date(h.date).getMonth() === currentMonth).length} วันหยุด
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Month Selector Tabs Dropdown */}
              <select
                className="bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg px-3 py-1.5 shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={currentMonth}
                onChange={(e) => setCurrentMonth(Number(e.target.value))}
              >
                {monthNames.map((mName, idx) => (
                  <option key={idx} value={idx}>
                    เดือน{mName}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentMonth(prev => (prev === 0 ? 11 : prev - 1))}
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-all cursor-pointer shadow-2xs active:scale-95"
                  title="เดือนก่อนหน้า"
                >
                  <i className="fa-solid fa-chevron-left text-xs"></i>
                </button>
                <button
                  onClick={() => setCurrentMonth(today.getMonth())}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
                  title="ไปเดือนปัจจุบัน"
                >
                  เดือนนี้
                </button>
                <button
                  onClick={() => setCurrentMonth(prev => (prev === 11 ? 0 : prev + 1))}
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-all cursor-pointer shadow-2xs active:scale-95"
                  title="เดือนถัดไป"
                >
                  <i className="fa-solid fa-chevron-right text-xs"></i>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Month Pills */}
          <div className="px-6 py-3 border-b border-slate-100 bg-white overflow-x-auto flex items-center gap-1.5 scrollbar-none">
            {monthNames.map((mName, idx) => {
              const countInMonth = holidays.filter(h => new Date(h.date).getMonth() === idx).length;
              const isSelected = currentMonth === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setCurrentMonth(idx)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${isSelected
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-100'
                    }`}
                >
                  {mName}
                  {countInMonth > 0 && (
                    <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold ${isSelected ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
                      }`}>
                      {countInMonth}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/70 text-center text-xs font-bold text-slate-500 py-3">
            {weekDayNamesShort.map((day, i) => (
              <div key={day} className={i === 0 || i === 6 ? 'text-rose-500' : ''}>
                {day}
              </div>
            ))}
          </div>

          {/* Monthly Calendar Grid */}
          <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-100 bg-slate-50/30">
            {loading ? (
              <div className="col-span-7 py-20 text-center text-slate-400">
                <i className="fa-solid fa-spinner fa-spin text-2xl mb-2 text-blue-500 block"></i>
                กำลังโหลดปฏิทินวันหยุด...
              </div>
            ) : (
              calendarCells.map((cell, index) => {
                const isWeekend = (index % 7 === 0) || (index % 7 === 6);
                return (
                  <div
                    key={index}
                    onClick={() => {
                      if (cell.holiday) setSelectedHoliday(cell.holiday);
                    }}
                    className={`min-h-[110px] p-2 transition-all relative flex flex-col justify-between ${!cell.isCurrentMonth ? 'bg-slate-50/50 opacity-40' : 'bg-white hover:bg-slate-50/80'
                      } ${cell.holiday ? 'cursor-pointer group' : ''}`}
                  >
                    {/* Day Header */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-extrabold ${cell.isToday
                          ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-300'
                          : isWeekend
                            ? 'text-rose-500'
                            : 'text-slate-700'
                          }`}
                      >
                        {cell.dayNumber}
                      </span>

                      {cell.isToday && (
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                          วันนี้
                        </span>
                      )}
                    </div>

                    {/* Holiday Event Badge */}
                    {cell.holiday && (
                      <div className="mt-1.5 space-y-1">
                        <div className="p-2 rounded-xl bg-amber-50 border border-amber-200/90 text-amber-950 shadow-2xs group-hover:border-amber-400 group-hover:bg-amber-100/70 transition-all">
                          <div className="text-[11px] font-bold truncate flex items-center gap-1.5 text-amber-950">
                            <i className="fa-solid fa-calendar-days text-[11px] text-amber-700 shrink-0"></i>
                            <span className="truncate">{cell.holiday.name}</span>
                          </div>
                          {cell.holiday.num_days > 1 && (
                            <div className="text-[9px] font-medium text-amber-800 mt-0.5">
                              หยุด {cell.holiday.num_days} วัน
                            </div>
                          )}
                        </div>

                        {isLongWeekend(cell.holiday.date, cell.holiday.num_days) && (
                          <div className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded-md">
                            <i className="fa-solid fa-plane text-[8px]"></i> Long Weekend
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Main View: List View */}
      {viewMode === 'list' && (
        <div className="space-y-6">
          {/* Search Bar */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex items-center gap-3">
            <i className="fa-solid fa-magnifying-glass text-slate-400 text-sm"></i>
            <input
              type="text"
              placeholder="ค้นหาชื่อวันหยุด หรือ วันที่..."
              className="w-full text-sm bg-transparent border-none outline-none text-slate-700 placeholder-slate-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1"
              >
                ล้างคำค้น
              </button>
            )}
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl p-12 text-center text-slate-400 border border-slate-200">
              <i className="fa-solid fa-spinner fa-spin text-2xl mb-2 text-blue-500 block"></i>
              กำลังโหลดรายการวันหยุด...
            </div>
          ) : Object.keys(filteredGroupedHolidays).length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center text-slate-500 border border-slate-200">
              <i className="fa-solid fa-calendar-xmark text-3xl mb-3 text-slate-300 block"></i>
              ไม่พบข้อมูลวันหยุดในเงื่อนไขที่ค้นหา
            </div>
          ) : (
            Object.keys(filteredGroupedHolidays).map((monthStr) => {
              const m = Number(monthStr);
              const items = filteredGroupedHolidays[m];
              return (
                <div key={m} className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                  <div className="bg-slate-50 px-6 py-3.5 border-b border-slate-100 flex items-center justify-between">
                    <h4 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                      <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                      เดือน{monthNames[m]}
                    </h4>
                    <span className="text-xs text-slate-500 font-semibold bg-white border border-slate-200 px-2.5 py-1 rounded-full">
                      {items.length} วันหยุด
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {items.map((h) => {
                      const isLW = isLongWeekend(h.date, h.num_days);
                      const consecDays = getConsecutiveDaysOff(h.date, h.num_days);
                      return (
                        <div
                          key={h.id}
                          className="p-4 sm:p-5 hover:bg-slate-50/70 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        >
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/60 text-amber-600 flex flex-col items-center justify-center shrink-0">
                              <span className="text-[10px] font-bold uppercase tracking-wider">{monthNames[m].substring(0, 3)}</span>
                              <span className="text-lg font-black leading-none">{new Date(h.date).getDate()}</span>
                            </div>

                            <div className="space-y-1">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <h5 className="font-bold text-slate-800 text-base">{h.name}</h5>
                                {isLW && (
                                  <span className="text-xs bg-amber-100 text-amber-800 border border-amber-200 font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                                    <i className="fa-solid fa-plane text-[10px]"></i> Long Weekend ({consecDays} วันติด)
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 flex items-center gap-3">
                                <span>{getWeekdayText(h.date)}ที่ {formatDateThai(h.date)}</span>
                                <span>•</span>
                                <span>จำนวน {h.num_days} วัน</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            <button
                              onClick={() => setSelectedHoliday(h)}
                              className="px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-all border border-blue-200/80 cursor-pointer"
                            >
                              รายละเอียด
                            </button>

                            {isAdmin && (
                              <button
                                disabled={actionLoading === h.id}
                                onClick={() => handleDelete(h.id)}
                                className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-all border border-rose-200/80 cursor-pointer disabled:opacity-50"
                              >
                                {actionLoading === h.id ? 'กำลังลบ...' : 'ลบ'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Holiday Detail Modal */}
      {selectedHoliday && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6 text-white relative">
              <button
                onClick={() => setSelectedHoliday(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
              <div className="text-xs font-semibold text-amber-100 uppercase tracking-wider mb-1">รายละเอียดวันหยุด</div>
              <h3 className="text-xl font-extrabold">{selectedHoliday.name}</h3>
            </div>

            <div className="p-6 space-y-4 text-slate-700">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-xs text-slate-500 font-semibold">วันที่หยุด</span>
                <span className="text-sm font-bold text-slate-800">{getWeekdayText(selectedHoliday.date)} {formatDateThai(selectedHoliday.date)}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-xs text-slate-500 font-semibold">จำนวนวันหยุดบริษัท</span>
                <span className="text-sm font-bold text-amber-600">{selectedHoliday.num_days} วัน</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-xs text-slate-500 font-semibold">หยุดต่อเนื่องสุทธิ (รวม ส.-อา.)</span>
                <span className="text-sm font-bold text-purple-600">
                  {getConsecutiveDaysOff(selectedHoliday.date, selectedHoliday.num_days)} วัน
                </span>
              </div>

              {isLongWeekend(selectedHoliday.date, selectedHoliday.num_days) && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-2xl text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <i className="fa-solid fa-plane text-amber-600"></i> วันหยุดยาว (Long Weekend)
                  </div>
                  <p className="text-amber-700/90 leading-relaxed">
                    วันหยุดนี้ติดกับวันเสาร์-อาทิตย์ เหมาะสำหรับวางแผนพักผ่อน หรือจัดทริปท่องเที่ยวล่วงหน้า
                  </p>
                </div>
              )}
            </div>

            <div className={`p-4 bg-slate-50 border-t border-slate-100 flex items-center ${isAdmin ? 'justify-between' : 'justify-end'}`}>
              {isAdmin && (
                <button
                  onClick={() => handleDelete(selectedHoliday.id)}
                  className="px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-100/60 rounded-xl transition-all border border-rose-200 cursor-pointer"
                >
                  <i className="fa-solid fa-trash mr-1.5"></i> ลบวันหยุดนี้
                </button>
              )}

              <button
                onClick={() => setSelectedHoliday(null)}
                className="px-5 py-2 bg-slate-800 text-white hover:bg-slate-900 text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Holiday Modal (Admin Only) */}
      {showAddModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-900 p-6 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <i className="fa-solid fa-calendar-plus text-amber-400"></i>
                  เพิ่มวันหยุดใหม่
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">กำหนดวันหยุดบริษัทและบันทึกลงในระบบ</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 transition-all cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">วันที่เริ่มต้น</label>
                <input
                  type="date"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ชื่อวันหยุด</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  placeholder="เช่น วันสงกรานต์, วันแรงงานแห่งชาติ"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">จำนวนวันหยุด (วัน)</label>
                <input
                  type="number"
                  min={1}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  value={formDays}
                  onChange={(e) => setFormDays(Number(e.target.value))}
                  required
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {formLoading ? (
                    <span className="flex items-center gap-2">
                      <i className="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...
                    </span>
                  ) : (
                    'บันทึกวันหยุด'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
