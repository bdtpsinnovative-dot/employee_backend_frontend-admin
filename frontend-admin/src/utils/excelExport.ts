import XLSX from 'xlsx-js-style';
import type { HistoryRecord } from '../types';
import { 
  formatDate, 
  formatTime, 
  translateType, 
  translateStatus, 
  computeLateMinutes, 
  computeWorkHours 
} from './attendanceHelpers';

// ──── Styling Helpers for Excel Export ────
function applyStylesToSheet1(ws: any) {
  const ref = ws['!ref'];
  if (!ref) return;
  const [, end] = ref.split(':');
  const endCol = end.charCodeAt(0) - 65; // e.g. 'L' -> 11
  const endRow = parseInt(end.substring(1), 10);

  // Style Header Row
  for (let c = 0; c <= endCol; c++) {
    const cellRef = String.fromCharCode(65 + c) + '1';
    if (ws[cellRef]) {
      ws[cellRef].s = {
        fill: { fgColor: { rgb: "F1F5F9" } },
        font: { bold: true, color: { rgb: "334155" }, name: "Arial", sz: 10 },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          bottom: { style: "medium", color: { rgb: "CBD5E1" } }
        }
      };
    }
  }

  // Style Data Rows
  for (let r = 2; r <= endRow; r++) {
    const statusRef = 'G' + r;
    const statusVal = ws[statusRef] ? ws[statusRef].v : '';

    if (ws[statusRef]) {
      let bgColor = "F1F5F9"; // default gray
      let textColor = "475569";
      
      if (statusVal.includes("ตรงเวลา")) {
        bgColor = "DCFCE7"; // light green
        textColor = "15803D";
      } else if (statusVal.includes("สาย")) {
        bgColor = "FEF3C7"; // light yellow
        textColor = "B45309";
      } else if (statusVal.includes("ขาดงาน") || statusVal.includes("ไม่สแกน") || statusVal.includes("ไม่ทราบสาเหตุ") || statusVal.includes("ไม่มีบันทึก")) {
        bgColor = "FEE2E2"; // light red
        textColor = "DC2626";
      } else if (statusVal.includes("ลา")) {
        bgColor = "E0F2FE"; // light blue
        textColor = "0369A1";
      } else if (statusVal.includes("ออกหน้างาน")) {
        bgColor = "F3E8FF"; // light purple
        textColor = "6D28D9";
      }

      ws[statusRef].s = {
        fill: { fgColor: { rgb: bgColor } },
        font: { bold: true, color: { rgb: textColor }, name: "Arial", sz: 10 },
        alignment: { horizontal: "center", vertical: "center" }
      };
    }

    const checkInRef = 'H' + r;
    if (ws[checkInRef] && statusVal.includes("สาย")) {
      ws[checkInRef].s = {
        font: { bold: true, color: { rgb: "DC2626" }, name: "Arial", sz: 10 }
      };
    }

    // Border and normal font for all cells
    for (let c = 0; c <= endCol; c++) {
      const cellRef = String.fromCharCode(65 + c) + r;
      if (ws[cellRef] && cellRef !== statusRef && cellRef !== checkInRef) {
        ws[cellRef].s = {
          font: { name: "Arial", sz: 10 },
          border: {
            bottom: { style: "thin", color: { rgb: "E2E8F0" } }
          }
        };
      }
    }
  }
}

function applyStylesToSheet2(ws: any) {
  const ref = ws['!ref'];
  if (!ref) return;
  const [, end] = ref.split(':');
  const endCol = end.charCodeAt(0) - 65; // e.g. 'N' -> 13
  const endRow = parseInt(end.substring(1), 10);

  // Style Header Row
  for (let c = 0; c <= endCol; c++) {
    const cellRef = String.fromCharCode(65 + c) + '1';
    if (ws[cellRef]) {
      ws[cellRef].s = {
        fill: { fgColor: { rgb: "EFF6FF" } },
        font: { bold: true, color: { rgb: "1E40AF" }, name: "Arial", sz: 10 },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          bottom: { style: "medium", color: { rgb: "BFDBFE" } }
        }
      };
    }
  }

  // Style Data Rows
  for (let r = 2; r < endRow; r++) {
    const lateRef = 'F' + r;
    const lateVal = ws[lateRef] ? parseInt(ws[lateRef].v, 10) : 0;
    if (ws[lateRef] && lateVal > 3) {
      ws[lateRef].s = {
        font: { bold: true, color: { rgb: "DC2626" }, name: "Arial", sz: 10 }
      };
    }

    const absentRef = 'H' + r;
    const absentVal = ws[absentRef] ? parseInt(ws[absentRef].v, 10) : 0;
    if (ws[absentRef] && absentVal > 0) {
      ws[absentRef].s = {
        font: { bold: true, color: { rgb: "DC2626" }, name: "Arial", sz: 10 }
      };
    }

    const rateRef = 'N' + r;
    if (ws[rateRef]) {
      const rateVal = parseFloat(ws[rateRef].v);
      let textColor = "475569";
      if (rateVal >= 90) {
        textColor = "15803D";
      } else if (rateVal >= 75) {
        textColor = "D97706";
      } else {
        textColor = "DC2626";
      }
      ws[rateRef].s = {
        font: { bold: true, color: { rgb: textColor }, name: "Arial", sz: 10 }
      };
    }

    for (let c = 0; c <= endCol; c++) {
      const cellRef = String.fromCharCode(65 + c) + r;
      if (ws[cellRef] && cellRef !== lateRef && cellRef !== absentRef && cellRef !== rateRef) {
        ws[cellRef].s = {
          font: { name: "Arial", sz: 10 },
          border: {
            bottom: { style: "thin", color: { rgb: "E2E8F0" } }
          }
        };
      }
    }
  }

  // Style Total Row (Last Row)
  for (let c = 0; c <= endCol; c++) {
    const cellRef = String.fromCharCode(65 + c) + endRow;
    if (ws[cellRef]) {
      ws[cellRef].s = {
        fill: { fgColor: { rgb: "F8FAFC" } },
        font: { bold: true, color: { rgb: "0F172A" }, name: "Arial", sz: 10 },
        border: {
          top: { style: "thin", color: { rgb: "94A3B8" } },
          bottom: { style: "double", color: { rgb: "94A3B8" } }
        }
      };
    }
  }
}

export function exportXLSX(
  filteredRows: HistoryRecord[],
  summaryData: any[],
  scheduledWorkDays: number,
  filterMonth: string,
  morningLeaveMap: Map<string, boolean>
) {
  if (filteredRows.length === 0 && summaryData.length === 0) {
    alert('ไม่มีข้อมูลสำหรับ Export');
    return;
  }

  // Sheet 1: รายละเอียดรายวัน
  const logHeaders = [
    'วันที่', 'Email', 'ชื่อ-นามสกุล', 'แผนก', 'ตำแหน่ง',
    'ประเภท', 'สถานะ', 'เวลาเข้า', 'เวลาออก',
    'นาทีสาย', 'ชม.ทำงาน', 'หมายเหตุ'
  ];
  const logBody = filteredRows.map(r => {
    const ymd = r.date.split('T')[0];
    const late = r.type === 'attendance' ? computeLateMinutes(r.check_in_at, r.user_name, ymd, morningLeaveMap) : 0;
    const wh = r.type === 'attendance' ? computeWorkHours(r.check_in_at, r.check_out_at) : 0;
    return [
      formatDate(r.date),
      r.email,
      r.user_name,
      r.department || '-',
      r.position || '-',
      translateType(r.type),
      translateStatus(r.status, r.date),
      r.type === 'attendance' ? formatTime(r.check_in_at) : '-',
      r.type === 'attendance' ? formatTime(r.check_out_at) : '-',
      r.type === 'attendance' && late > 0 ? late : '',
      r.type === 'attendance' && wh > 0 ? Number(wh.toFixed(2)) : '',
      r.reason || '',
    ];
  });
  const ws1 = XLSX.utils.aoa_to_sheet([logHeaders, ...logBody]);
  ws1['!cols'] = [
    { wch: 22 }, { wch: 26 }, { wch: 20 }, { wch: 14 }, { wch: 14 },
    { wch: 10 }, { wch: 22 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 30 }
  ];
  applyStylesToSheet1(ws1);

  // Sheet 2: สรุปรายเดือน + แถวรวม
  const sumHeaders = [
    'Email', 'ชื่อ-นามสกุล', 'แผนก', 'วันทำงาน (ตามตาราง)',
    'มาทำงาน (วัน)', 'มาสาย (ครั้ง)', 'สายรวม (นาที)', 'ขาดงาน (วัน)',
    'ลาป่วย (วัน)', 'ลากิจ (วัน)', 'ลาพักร้อน (วัน)', 'ออกหน้างาน (ครั้ง)',
    'ชม.ทำงานรวม', '% ตรงเวลา'
  ];
  const sumBody = summaryData.map(s => [
    s.email, s.name, s.department || '-', s.scheduledDays,
    s.presentCount, s.lateCount, s.lateMinutes, s.absentDays,
    s.sickLeave, s.personalLeave, s.annualLeave, s.offsite,
    s.totalWorkHours > 0 ? Number(s.totalWorkHours.toFixed(2)) : 0, s.onTimeRate
  ]);
  
  // แถวรวมทั้งบริษัท
  const totalScheduled = scheduledWorkDays * summaryData.length;
  const totalPresent = summaryData.reduce((a, s) => a + s.presentCount, 0);
  const totalLate = summaryData.reduce((a, s) => a + s.lateCount, 0);
  const totalLateMin = summaryData.reduce((a, s) => a + s.lateMinutes, 0);
  const totalAbsent = summaryData.reduce((a, s) => a + s.absentDays, 0);
  const totalSick = summaryData.reduce((a, s) => a + s.sickLeave, 0);
  const totalPersonal = summaryData.reduce((a, s) => a + s.personalLeave, 0);
  const totalAnnual = summaryData.reduce((a, s) => a + s.annualLeave, 0);
  const totalOffsite = summaryData.reduce((a, s) => a + s.offsite, 0);
  const totalHours = summaryData.reduce((a, s) => a + s.totalWorkHours, 0);
  const overallRate = totalScheduled > 0
    ? Math.round(((totalPresent - totalLate) / totalScheduled) * 1000) / 10
    : 0;

  sumBody.push([
    '', 'รวมทั้งหมด', '', totalScheduled,
    totalPresent, totalLate, totalLateMin, totalAbsent,
    totalSick, totalPersonal, totalAnnual, totalOffsite,
    Math.round(totalHours * 100) / 100, overallRate
  ]);

  const ws2 = XLSX.utils.aoa_to_sheet([sumHeaders, ...sumBody]);
  ws2['!cols'] = [
    { wch: 26 }, { wch: 20 }, { wch: 14 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
    { wch: 14 }, { wch: 12 }
  ];
  applyStylesToSheet2(ws2);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'รายละเอียดรายวัน');
  XLSX.utils.book_append_sheet(wb, ws2, 'สรุปรายเดือน');
  XLSX.writeFile(wb, `Attendance_Report_${filterMonth}.xlsx`);
}
