export const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export const WORK_START_HOUR = 9;
export const WORK_START_MIN = 0;

export function getThaiMonthYearString(year: number, month: number) {
  const months = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  return `${months[month - 1]} ${year + 543}`;
}

export function computeLateMinutes(
  checkInAt: string | undefined,
  userName: string,
  ymd: string,
  morningLeaveMap: Map<string, boolean>
): number {
  if (!checkInAt) return 0;
  const checkIn = new Date(checkInAt);
  const target = new Date(checkIn);
  if (morningLeaveMap.get(`${userName}_${ymd}`)) {
    target.setHours(13, 0, 0, 0);
  } else {
    target.setHours(WORK_START_HOUR, WORK_START_MIN, 0, 0);
  }
  const diffMs = checkIn.getTime() - target.getTime();
  return diffMs > 0 ? Math.floor(diffMs / 60000) : 0;
}

export function computeWorkHours(checkInAt: string | undefined, checkOutAt: string | undefined): number {
  if (!checkInAt || !checkOutAt) return 0;
  const diffMs = new Date(checkOutAt).getTime() - new Date(checkInAt).getTime();
  return diffMs > 0 ? Math.round((diffMs / 3600000) * 100) / 100 : 0;
}

export function parseCompactDateParts(iso: string) {
  if (!iso) return { weekday: '-', weekdayClean: '-', dateStr: '-', isWeekend: false };
  try {
    const d = new Date(iso);
    const dayOfWeek = d.getDay();
    const weekday = d.toLocaleDateString('th-TH', { weekday: 'short' });
    const weekdayClean = weekday.replace(/\./g, '').trim();
    const day = d.getDate();
    const monthShort = THAI_MONTHS_SHORT[d.getMonth()] || '';
    const yearBuddhistShort = ((d.getFullYear() + 543) % 100).toString().padStart(2, '0');
    return {
      weekday,
      weekdayClean,
      dateStr: `${day} ${monthShort} ${yearBuddhistShort}`,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    };
  } catch {
    return { weekday: '', weekdayClean: '', dateStr: iso, isWeekend: false };
  }
}

export function formatCompactDate(iso: string) {
  if (!iso) return '-';
  try {
    const parts = parseCompactDateParts(iso);
    return `${parts.weekday} ${parts.dateStr}`;
  } catch {
    return iso;
  }
}

export function formatDate(iso: string) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    const wd = d.toLocaleDateString('th-TH', { weekday: 'short' });
    const dm = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${dm} (${wd})`;
  } catch {
    return iso;
  }
}

export function formatTime(iso: string | undefined) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '-';
  }
}

export function translateType(t: string) {
  if (t === 'attendance') return 'เข้างาน';
  if (t === 'leave') return 'ลา';
  if (t === 'offsite') return 'ออกหน้างาน';
  if (t === 'not_checked_in' || t === 'absent') return 'ยังไม่มาทำงาน';
  return t;
}

export function translateStatus(raw: string, isoDate?: string) {
  if (isoDate) {
    const day = new Date(isoDate).getDay();
    if ((day === 0 || day === 6) && (raw === 'on_time' || raw === 'late')) {
      return 'ทำงานวันหยุด';
    }
  }
  if (raw === 'on_time') return 'มาทำงาน (ตรงเวลา)';
  if (raw === 'late') return 'มาทำงาน (สาย)';
  if (raw === 'no_record' || raw === 'not_checked_in' || raw === 'absent') return 'ยังไม่มาทำงาน';
  
  let result = raw;
  if (result.startsWith('offsite')) {
    result = result.replace('offsite', 'ออกหน้างาน');
  }
  if (result.includes('sick_leave_full')) result = result.replace('sick_leave_full', 'ลาป่วย (เต็มวัน)');
  if (result.includes('sick_leave_morning')) result = result.replace('sick_leave_morning', 'ลาป่วย (ครึ่งเช้า)');
  if (result.includes('sick_leave_afternoon')) result = result.replace('sick_leave_afternoon', 'ลาป่วย (ครึ่งบ่าย)');
  if (result.includes('personal_leave_full')) result = result.replace('personal_leave_full', 'ลากิจ (เต็มวัน)');
  if (result.includes('personal_leave_morning')) result = result.replace('personal_leave_morning', 'ลากิจ (ครึ่งเช้า)');
  if (result.includes('personal_leave_afternoon')) result = result.replace('personal_leave_afternoon', 'ลากิจ (ครึ่งบ่าย)');
  if (result.includes('annual_leave')) result = result.replace('annual_leave', 'ลาพักร้อน');
  if (result.includes('shift_swap')) result = result.replace('shift_swap', 'สลับวันหยุด');
  if (result === 'unknown') return 'ไม่ทราบสาเหตุ';

  // Support space-separated leave types from backend
  result = result.replace(/sick_leave\s+full/gi, 'ลาป่วย (เต็มวัน)');
  result = result.replace(/sick_leave\s+morning/gi, 'ลาป่วย (ครึ่งเช้า)');
  result = result.replace(/sick_leave\s+afternoon/gi, 'ลาป่วย (ครึ่งบ่าย)');
  result = result.replace(/sick_leave/gi, 'ลาป่วย');
  result = result.replace(/personal_leave\s+full/gi, 'ลากิจ (เต็มวัน)');
  result = result.replace(/personal_leave\s+morning/gi, 'ลากิจ (ครึ่งเช้า)');
  result = result.replace(/personal_leave\s+afternoon/gi, 'ลากิจ (ครึ่งบ่าย)');
  result = result.replace(/personal_leave/gi, 'ลากิจ');
  result = result.replace(/annual_leave/gi, 'ลาพักร้อน');

  // Strip approved tags as requested by user (approved will be shown in green badge instead)
  result = result.replace(/\s*\(approved\)/gi, '');
  result = result.replace(/\s*\(อนุมัติ\)/gi, '');
  result = result.replace('(pending)', '(รออนุมัติ)');
  result = result.replace('(rejected)', '(ปฏิเสธ)');
  
  return result.trim();
}

export function getStatusClass(status: string, rawStatus?: string) {
  const isApproved = (rawStatus && (rawStatus.includes('approved') || rawStatus.includes('อนุมัติ')))
    || (!rawStatus && (status.includes('อนุมัติ') || status.includes('approved')));
  if (isApproved || status.includes('ตรงเวลา')) return 'st-ontime';
  if (status.includes('สาย')) return 'st-late';
  if (status.includes('ออกหน้างาน')) return 'st-offsite';
  if (status.includes('ลา')) return 'st-leave';
  if (status.includes('วันหยุด')) return 'st-weekend';
  if (status.includes('ยังไม่มาทำงาน')) return 'st-absent';
  if (status.includes('รออนุมัติ')) return 'st-pending';
  return 'st-unknown';
}
