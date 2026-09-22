import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CalendarDays,
  ChevronDown,
  Clock,
  Download,
  ExternalLink,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Filter,
  Globe,
  Loader2,
  Paperclip,
  Search,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

type PIRecord = {
  id: string;
  pi_supplier: string;
  record_date: string;
  supplier: string;
  link_file: string;
  link_file_url: string;
  etd: string;
  brand: string;
  order_no: string;
  file_name: string;
  file_url: string;
  sale_name: string;
  project_name: string;
  payment_date: string;
  delivered_date: string;
  date_order: string;
};

type Column = {
  key: keyof PIRecord | 'documents';
  label: string;
  linkKey?: keyof PIRecord;
};

const columns: Column[] = [
  { key: 'pi_supplier', label: 'PI-Supplier' },
  { key: 'record_date', label: 'วันที่' },
  { key: 'supplier', label: 'Supplier' },
  { key: 'documents', label: 'เอกสาร' },
  { key: 'etd', label: 'ETD' },
  { key: 'brand', label: 'Brand' },
  { key: 'order_no', label: 'Order No.' },
  { key: 'sale_name', label: 'Sale Name' },
  { key: 'project_name', label: 'Project Name' },
  { key: 'payment_date', label: 'Payment Date' },
  { key: 'delivered_date', label: 'Delivered Date' },
  { key: 'date_order', label: 'วันที่ลูกค้าชำระเงิน' },
];

const visibleValue = (value: string) => value?.trim() && value.trim() !== '-';
const safeUrl = (value: string) => /^https?:\/\//i.test(value?.trim());

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const DATE_TARGET_FIELDS: { key: keyof PIRecord; label: string }[] = [
  { key: 'record_date', label: 'วันที่บันทึก (Date)' },
  { key: 'etd', label: 'กำหนดส่ง (ETD)' },
  { key: 'payment_date', label: 'วันที่ชำระเงิน (Payment)' },
  { key: 'delivered_date', label: 'วันที่ส่งมอบ (Delivered)' },
  { key: 'date_order', label: 'วันที่ลูกค้าชำระเงิน' },
];

function formatLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateParts(value: string | undefined): { year: number; month: number; day: number; yearMonth: string } | null {
  if (!value) return null;
  const text = value.trim();
  if (!text || text === '-') return null;

  const dmy = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    if (year > 2400) year -= 543;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day, yearMonth: `${year}-${String(month).padStart(2, '0')}` };
    }
  }

  const ymd = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (ymd) {
    let year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    if (year > 2400) year -= 543;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day, yearMonth: `${year}-${String(month).padStart(2, '0')}` };
    }
  }

  const ts = Date.parse(text);
  if (!Number.isNaN(ts)) {
    const d = new Date(ts);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return { year, month, day, yearMonth: `${year}-${String(month).padStart(2, '0')}` };
  }

  return null;
}

function dateTimestamp(value: string) {
  const parsed = parseDateParts(value);
  if (!parsed) return Number.NEGATIVE_INFINITY;
  return new Date(parsed.year, parsed.month - 1, parsed.day).getTime();
}

function documentBadge(value: string, url: string, key: keyof PIRecord) {
  const source = `${value} ${url}`.toLowerCase();
  if (/\.pdf(?:[?#]|$)|\/pdf\b/.test(source)) {
    return { label: safeUrl(value) ? 'PDF' : value, Icon: FileText, className: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300' };
  }
  if (/docs\.google\.com\/spreadsheets|\.xlsx?(?:[?#]|$)|\.csv(?:[?#]|$)/.test(source)) {
    return { label: safeUrl(value) ? 'Google Sheet' : value, Icon: FileSpreadsheet, className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300' };
  }
  return { label: safeUrl(value) ? (key === 'file_name' ? 'ไฟล์แนบ' : 'เปิดเอกสาร') : value, Icon: FileIcon, className: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300' };
}

export default function PIRecordPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<PIRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Date Presets & Values (Exact adminwallcraft logic)
  const now = new Date();
  const todayStr = useMemo(() => formatLocal(now), []);
  const thirtyDaysAgoStr = useMemo(() => formatLocal(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)), []);
  const ninetyDaysAgoStr = useMemo(() => formatLocal(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)), []);
  const firstDayOfMonthStr = useMemo(() => formatLocal(new Date(now.getFullYear(), now.getMonth(), 1)), []);
  const lastDayOfMonthStr = useMemo(() => formatLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0)), []);

  const [activePreset, setActivePreset] = useState<'30DAYS' | '90DAYS' | 'THIS_MONTH' | 'ALL_TIME' | 'CUSTOM'>('ALL_TIME');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateFieldTarget, setDateFieldTarget] = useState<keyof PIRecord>('record_date');

  // Date Modal State
  const [showDateModal, setShowDateModal] = useState(false);
  const [tempStart, setTempStart] = useState('');
  const [tempEnd, setTempEnd] = useState('');
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());

  // Entity Filters
  const [selectedBrand, setSelectedBrand] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterSaleName, setFilterSaleName] = useState('');
  const [filterProjectName, setFilterProjectName] = useState('');
  const [filterOrderNo, setFilterOrderNo] = useState('');
  const [filterPISupplier, setFilterPISupplier] = useState('');
  const [onlyWithDocs, setOnlyWithDocs] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;

    async function loadRecords() {
      try {
        const response = await api.get<{ data: PIRecord[] }>('/api/pi-records');
        if (active) setRecords(response.data.data || []);
      } catch (requestError: any) {
        if (active) setError(requestError?.message || 'ไม่สามารถโหลดข้อมูล PI Record ได้');
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadRecords();
    return () => { active = false; };
  }, []);

  // Multi-month range calculation inside Date Modal
  useEffect(() => {
    if (selectedMonths.length > 0) {
      const minMonth = Math.min(...selectedMonths);
      const maxMonth = Math.max(...selectedMonths);

      const startD = new Date(selectedYear, minMonth, 1);
      const endD = new Date(selectedYear, maxMonth + 1, 0);

      setTempStart(formatLocal(startD));
      setTempEnd(formatLocal(endD));
    }
  }, [selectedMonths, selectedYear]);

  // Unique select options
  const options = useMemo(() => {
    const values: Partial<Record<keyof PIRecord, string[]>> = {};
    columns.filter(({ key }) => key !== 'documents').forEach(({ key }) => {
      const recordKey = key as keyof PIRecord;
      values[recordKey] = Array.from(new Set(records.map((record) => record[recordKey]).filter(visibleValue))).sort((a, b) => a.localeCompare(b));
    });
    return values;
  }, [records]);

  // Unique brands with count
  const availableBrands = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach((r) => {
      const b = r.brand?.trim();
      if (b && b !== '-') {
        counts[b] = (counts[b] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({ name, count }));
  }, [records]);

  const recordsWithDocsCount = useMemo(() => {
    return records.filter((r) => safeUrl(r.link_file_url || r.link_file) || safeUrl(r.file_url || r.file_name)).length;
  }, [records]);

  // Presets trigger
  const applyPreset = (preset: '30DAYS' | '90DAYS' | 'THIS_MONTH' | 'ALL_TIME') => {
    setActivePreset(preset);
    if (preset === '30DAYS') {
      setStartDate(thirtyDaysAgoStr);
      setEndDate(todayStr);
    } else if (preset === '90DAYS') {
      setStartDate(ninetyDaysAgoStr);
      setEndDate(todayStr);
    } else if (preset === 'THIS_MONTH') {
      setStartDate(firstDayOfMonthStr);
      setEndDate(lastDayOfMonthStr);
    } else if (preset === 'ALL_TIME') {
      setStartDate('');
      setEndDate('');
    }
  };

  const openDateModal = () => {
    setTempStart(startDate || todayStr);
    setTempEnd(endDate || todayStr);
    setSelectedMonths([]);
    setShowDateModal(true);
  };

  const applyCustomDate = () => {
    setStartDate(tempStart);
    setEndDate(tempEnd);
    setActivePreset('CUSTOM');
    setShowDateModal(false);
  };

  const calculateDays = () => {
    if (!tempStart || !tempEnd) return 0;
    const s = new Date(tempStart);
    const e = new Date(tempEnd);
    const diffTime = Math.abs(e.getTime() - s.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const clearAllFilters = () => {
    setActivePreset('ALL_TIME');
    setStartDate('');
    setEndDate('');
    setSelectedBrand('');
    setFilterSupplier('');
    setFilterSaleName('');
    setFilterProjectName('');
    setFilterOrderNo('');
    setFilterPISupplier('');
    setOnlyWithDocs(false);
    setSearch('');
  };

  const isFiltered = Boolean(
    startDate ||
    endDate ||
    selectedBrand ||
    filterSupplier ||
    filterSaleName ||
    filterProjectName ||
    filterOrderNo ||
    filterPISupplier ||
    onlyWithDocs ||
    search
  );

  // Master Filter Engine
  const displayedRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();

    return records.filter((record) => {
      // 1. Text search across all fields
      if (query) {
        const matchesSearch = Object.values(record).some(
          (val) => typeof val === 'string' && val.toLocaleLowerCase().includes(query)
        );
        if (!matchesSearch) return false;
      }

      // 2. Brand Filter
      if (selectedBrand && record.brand !== selectedBrand) {
        return false;
      }

      // 3. Supplier Filter
      if (filterSupplier && record.supplier !== filterSupplier) {
        return false;
      }

      // 4. Sale Name Filter
      if (filterSaleName && record.sale_name !== filterSaleName) {
        return false;
      }

      // 5. Project Name Filter
      if (filterProjectName && record.project_name !== filterProjectName) {
        return false;
      }

      // 6. Order No Filter
      if (filterOrderNo && record.order_no !== filterOrderNo) {
        return false;
      }

      // 7. PI Supplier Filter
      if (filterPISupplier && record.pi_supplier !== filterPISupplier) {
        return false;
      }

      // 8. Only with documents
      if (onlyWithDocs) {
        const hasLink = safeUrl(record.link_file_url || record.link_file);
        const hasFile = safeUrl(record.file_url || record.file_name);
        if (!hasLink && !hasFile) return false;
      }

      // 9. Date Range Filter
      if (startDate || endDate) {
        const dateVal = record[dateFieldTarget] || record.record_date;
        const parsed = parseDateParts(dateVal);
        if (!parsed) return false;
        const recordDateStr = `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`;
        if (startDate && recordDateStr < startDate) return false;
        if (endDate && recordDateStr > endDate) return false;
      }

      return true;
    }).sort((a, b) => dateTimestamp(b.record_date) - dateTimestamp(a.record_date));
  }, [
    records,
    search,
    selectedBrand,
    filterSupplier,
    filterSaleName,
    filterProjectName,
    filterOrderNo,
    filterPISupplier,
    onlyWithDocs,
    startDate,
    endDate,
    dateFieldTarget,
  ]);

  // Export to Excel with custom styling
  const handleExportExcel = async () => {
    try {
      const XLSX = (await import('xlsx-js-style')).default || (await import('xlsx-js-style'));
      const rows = displayedRecords.map((r, idx) => ({
        'ลำดับ': idx + 1,
        'PI-Supplier': r.pi_supplier || '',
        'วันที่': r.record_date || '',
        'Supplier': r.supplier || '',
        'ETD': r.etd || '',
        'Brand': r.brand || '',
        'Order No.': r.order_no || '',
        'Sale Name': r.sale_name || '',
        'Project Name': r.project_name || '',
        'Payment Date': r.payment_date || '',
        'Delivered Date': r.delivered_date || '',
        'วันที่ลูกค้าชำระเงิน': r.date_order || '',
        'Link/File': r.link_file || r.link_file_url || '',
        'File แนบ': r.file_name || r.file_url || '',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'PI Records');
      const todayFileStr = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `PI_Records_${todayFileStr}.xlsx`);
    } catch (err) {
      console.error('Export Excel failed:', err);
    }
  };

  return (
    <div className="fixed inset-0 overflow-y-auto bg-slate-50 dark:bg-[#0b1120] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1700px] space-y-4 pb-16">
        
        {/* Header Bar */}
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#111a2d] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="mt-0.5 rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              title="กลับหน้า Dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#fcf7ee] to-[#f4e2ca] border border-amber-200/60 shadow-xs">
                <img src="/brands/purchase-sales.png" alt="" className="h-full w-full object-cover scale-[1.05]" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">จัดการซื้อ-ขาย</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">PI Record · หน้านี้สำหรับอ่านข้อมูลเท่านั้น</p>
              </div>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 self-start rounded-xl bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 sm:self-auto border border-blue-100 dark:border-blue-900">
            <FileSpreadsheet className="h-4 w-4" />
            {loading ? 'กำลังโหลดข้อมูล...' : `${displayedRecords.length.toLocaleString()} รายการ (จากทั้งหมด ${records.length.toLocaleString()})`}
          </div>
        </div>

        {/* ──── Filter Command Center (Style: adminwallcraft DashboardDateFilter) ──── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#111a2d] space-y-3">
          
          {/* Row 1: Date Presets, Custom Date Range, & Entity Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter size={16} className="text-slate-400 hidden lg:block mr-1" />

            {/* Date Preset Segmented Buttons */}
            <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-inner">
              <button 
                type="button"
                onClick={() => applyPreset('30DAYS')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  activePreset === '30DAYS' 
                    ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-400' 
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <Clock size={14} /> 30 วัน
              </button>
              <button 
                type="button"
                onClick={() => applyPreset('90DAYS')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  activePreset === '90DAYS' 
                    ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-400' 
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <Clock size={14} /> 90 วัน
              </button>
              <button 
                type="button"
                onClick={() => applyPreset('THIS_MONTH')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  activePreset === 'THIS_MONTH' 
                    ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-400' 
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <CalendarDays size={14} /> เดือนนี้
              </button>
              <button 
                type="button"
                onClick={() => applyPreset('ALL_TIME')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  activePreset === 'ALL_TIME' 
                    ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-400' 
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <Globe size={14} /> ทั้งหมด
              </button>
            </div>

            {/* Custom Date Range Trigger */}
            <div 
              onClick={openDateModal}
              className={`flex items-center gap-2 bg-white dark:bg-slate-900 border rounded-lg px-3 py-1.5 shadow-sm transition-colors cursor-pointer ${
                activePreset === 'CUSTOM' 
                  ? 'border-indigo-400 ring-1 ring-indigo-100 dark:border-indigo-500 dark:ring-indigo-950' 
                  : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600'
              }`} 
              title="คลิกเพื่อเลือกเดือนหรือระบุช่วงเวลาที่ต้องการเอง"
            >
              <Calendar size={14} className={activePreset === 'CUSTOM' ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"} />
              {startDate || endDate ? (
                <>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{startDate || '...'}</span>
                  <span className="text-slate-400 text-xs">-</span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{endDate || '...'}</span>
                </>
              ) : (
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">เลือกช่วงวันที่...</span>
              )}
            </div>

            {/* Brand Filter */}
            <div className="relative">
              <select 
                className={`appearance-none border rounded-lg px-3 py-1.5 pr-8 text-xs font-medium outline-none transition-colors cursor-pointer shadow-sm ${
                  selectedBrand 
                    ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 font-bold' 
                    : 'border-slate-200 bg-white text-slate-700 hover:border-amber-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
                value={selectedBrand} 
                onChange={(e) => setSelectedBrand(e.target.value)}
              >
                <option value="">🏷️ แบรนด์: ทั้งหมด</option>
                {availableBrands.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name} ({b.count})
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-2 text-slate-400 pointer-events-none" />
            </div>

            {/* Supplier Filter */}
            <div className="relative">
              <select 
                className={`appearance-none border rounded-lg px-3 py-1.5 pr-8 text-xs font-medium outline-none transition-colors cursor-pointer shadow-sm ${
                  filterSupplier 
                    ? 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 font-bold' 
                    : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
                value={filterSupplier} 
                onChange={(e) => setFilterSupplier(e.target.value)}
              >
                <option value="">🏢 ซัพพลายเออร์: ทั้งหมด</option>
                {options.supplier?.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-2 text-slate-400 pointer-events-none" />
            </div>

            {/* Sale Name Filter */}
            <div className="relative">
              <select 
                className={`appearance-none border rounded-lg px-3 py-1.5 pr-8 text-xs font-medium outline-none transition-colors cursor-pointer shadow-sm ${
                  filterSaleName 
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 font-bold' 
                    : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
                value={filterSaleName} 
                onChange={(e) => setFilterSaleName(e.target.value)}
              >
                <option value="">👤 เซลส์: ทั้งหมด</option>
                {options.sale_name?.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-2 text-slate-400 pointer-events-none" />
            </div>

            {/* Project Name Filter */}
            <div className="relative">
              <select 
                className={`appearance-none border rounded-lg px-3 py-1.5 pr-8 text-xs font-medium outline-none transition-colors cursor-pointer shadow-sm ${
                  filterProjectName 
                    ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 font-bold' 
                    : 'border-slate-200 bg-white text-slate-700 hover:border-violet-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
                value={filterProjectName} 
                onChange={(e) => setFilterProjectName(e.target.value)}
              >
                <option value="">📁 โครงการ: ทั้งหมด</option>
                {options.project_name?.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-2 text-slate-400 pointer-events-none" />
            </div>

            {/* Order No Filter */}
            <div className="relative">
              <select 
                className={`appearance-none border rounded-lg px-3 py-1.5 pr-8 text-xs font-medium outline-none transition-colors cursor-pointer shadow-sm ${
                  filterOrderNo 
                    ? 'border-pink-500 bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300 font-bold' 
                    : 'border-slate-200 bg-white text-slate-700 hover:border-pink-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
                value={filterOrderNo} 
                onChange={(e) => setFilterOrderNo(e.target.value)}
              >
                <option value="">🔢 Order No.: ทั้งหมด</option>
                {options.order_no?.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-2 text-slate-400 pointer-events-none" />
            </div>

            {/* PI-Supplier Filter */}
            <div className="relative">
              <select 
                className={`appearance-none border rounded-lg px-3 py-1.5 pr-8 text-xs font-medium outline-none transition-colors cursor-pointer shadow-sm ${
                  filterPISupplier 
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 font-bold' 
                    : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
                value={filterPISupplier} 
                onChange={(e) => setFilterPISupplier(e.target.value)}
              >
                <option value="">📄 PI-Supplier: ทั้งหมด</option>
                {options.pi_supplier?.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-2 text-slate-400 pointer-events-none" />
            </div>

            {/* Only With Docs Toggle */}
            <button
              type="button"
              onClick={() => setOnlyWithDocs((prev) => !prev)}
              className={`flex items-center gap-1.5 border rounded-lg px-3 py-1.5 text-xs font-medium transition-colors shadow-sm cursor-pointer ${
                onlyWithDocs 
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 font-bold ring-1 ring-emerald-200 dark:ring-emerald-900' 
                  : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
              title="กรองเฉพาะรายการที่มีเอกสารแนบ"
            >
              <Paperclip size={14} className={onlyWithDocs ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'} />
              <span>มีเอกสาร ({recordsWithDocsCount})</span>
            </button>

            {/* Clear Filters Button */}
            {isFiltered && (
              <button 
                type="button"
                onClick={clearAllFilters}
                className="ml-1 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 p-1.5 rounded-lg transition-colors border border-rose-100 dark:border-rose-900 shadow-sm flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                title="ล้างตัวกรองทั้งหมด"
              >
                <X size={14} strokeWidth={2.5} /> ล้าง
              </button>
            )}
          </div>

          {/* Row 2: Search Input & Export Excel Button */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="relative flex-1 min-w-[260px]">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาทุกช่อง (เลขที่, แบรนด์, ซัพพลายเออร์, ผู้ขาย, โครงการ...)"
                className="w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-9 text-xs font-medium outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-1 focus:ring-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-indigo-950"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold border border-emerald-600 bg-emerald-600 text-white shadow-xs hover:bg-emerald-700 active:bg-emerald-800 transition cursor-pointer"
              title="ดาวน์โหลดข้อมูลตารางที่กำลังกรองเป็น Excel"
            >
              <Download size={14} />
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* ──── Date Picker Modal (Exact adminwallcraft design) ──── */}
        {showDateModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-[#111a2d] border border-slate-100 dark:border-slate-800 p-6 rounded-2xl shadow-2xl w-[340px] sm:w-[380px] transform transition-all scale-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <Calendar size={18} className="text-indigo-600 dark:text-indigo-400" />
                  เลือกช่วงเวลา
                </h3>
                <button 
                  type="button"
                  onClick={() => setShowDateModal(false)} 
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
              
              {/* Year Selector */}
              <div className="flex items-center justify-between mb-3 bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl border border-slate-100 dark:border-slate-700">
                <button 
                  type="button"
                  onClick={() => setSelectedYear((y) => y - 1)}
                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  title="ปีก่อนหน้า"
                >
                  <ChevronDown size={16} className="rotate-90" />
                </button>
                <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">
                  ค.ศ. {selectedYear} (พ.ศ. {selectedYear + 543})
                </span>
                <button 
                  type="button"
                  onClick={() => setSelectedYear((y) => y + 1)}
                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  title="ปีถัดไป"
                >
                  <ChevronDown size={16} className="-rotate-90" />
                </button>
              </div>

              {/* 12-Month Grid */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {THAI_MONTHS_SHORT.map((m, i) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => {
                      setSelectedMonths((prev) => 
                        prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
                      );
                    }}
                    className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      selectedMonths.includes(i) 
                        ? 'bg-indigo-600 text-white shadow-sm' 
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* Target Date Column & Direct Date Inputs */}
              <div className="flex flex-col gap-3 mb-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    กรองจากคอลัมน์วันที่
                  </label>
                  <select
                    value={dateFieldTarget}
                    onChange={(e) => setDateFieldTarget(e.target.value as keyof PIRecord)}
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-400"
                  >
                    {DATE_TARGET_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">วันเริ่มต้น (ปรับเอง)</label>
                  <input 
                    type="date" 
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-400"
                    value={tempStart}
                    onChange={(e) => {
                      setTempStart(e.target.value);
                      setSelectedMonths([]);
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">วันสิ้นสุด (ปรับเอง)</label>
                  <input 
                    type="date" 
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-400"
                    value={tempEnd}
                    onChange={(e) => {
                      setTempEnd(e.target.value);
                      setSelectedMonths([]);
                    }}
                  />
                </div>
              </div>

              {/* Calculated Days Badge */}
              <div className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold px-3 py-2 rounded-lg mb-5 text-center border border-indigo-100 dark:border-indigo-900 flex items-center justify-center gap-2">
                <CalendarDays size={15} />
                จำนวนที่เลือก: {calculateDays()} วัน
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2">
                <button 
                  type="button"
                  onClick={() => setShowDateModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button 
                  type="button"
                  onClick={applyCustomDate}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm cursor-pointer"
                >
                  ตกลง
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ──── Table Section ──── */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#111a2d]">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center gap-3 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              กำลังโหลด PI Record
            </div>
          ) : error ? (
            <div className="min-h-64 p-8 text-center">
              <p className="font-semibold text-rose-600">โหลดข้อมูลไม่สำเร็จ</p>
              <p className="mt-1 text-sm text-slate-500">{error}</p>
            </div>
          ) : displayedRecords.length === 0 ? (
            <div className="min-h-64 p-8 text-center">
              <FileSpreadsheet className="mx-auto h-9 w-9 text-slate-300" />
              <p className="mt-3 font-semibold text-slate-700 dark:text-slate-200">ไม่พบข้อมูลที่ตรงตามตัวกรอง</p>
              <p className="mt-1 text-sm text-slate-500">ลองปรับช่วงเวลาหรือล้างตัวกรองเพื่อดูข้อมูลทั้งหมด</p>
              <button
                type="button"
                onClick={clearAllFilters}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/40 rounded-lg hover:bg-blue-100 transition cursor-pointer"
              >
                ล้างตัวกรองทั้งหมด
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1700px] w-full border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <tr>
                    {columns.map(({ key, label }) => (
                      <th key={key} className="whitespace-nowrap border-b border-r border-slate-200 px-3 py-3 last:border-r-0 dark:border-slate-700">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {displayedRecords.map((record) => (
                    <tr key={record.id} className="align-top hover:bg-blue-50/40 dark:hover:bg-slate-800/50">
                      {columns.map(({ key, linkKey, label }) => {
                        if (key === 'documents') {
                          const documents = [
                            { value: record.link_file, url: record.link_file_url || record.link_file, source: 'Link/File' },
                            { value: record.file_name, url: record.file_url || record.file_name, source: 'File' },
                          ].filter(({ url }) => safeUrl(url));
                          return (
                            <td key={key} className="border-r border-slate-100 px-3 py-3 last:border-r-0 dark:border-slate-800">
                              {documents.length > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  {documents.map(({ value, url, source }, index) => {
                                    const badge = documentBadge(value, url, source === 'File' ? 'file_name' : 'link_file');
                                    const DocumentIcon = badge.Icon;
                                    return (
                                      <a 
                                        key={`${source}-${url}`} 
                                        href={url} 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        title={`${source}: ${badge.label || 'เปิดเอกสาร'}`} 
                                        aria-label={`${source}: ${badge.label || 'เปิดเอกสาร'}`} 
                                        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition hover:scale-105 hover:brightness-95 ${badge.className}`}
                                      >
                                        <DocumentIcon className="h-4 w-4" />
                                        <span className="sr-only">{index + 1}</span>
                                      </a>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                          );
                        }
                        const recordKey = key as keyof PIRecord;
                        const value = record[recordKey] || '-';
                        const url = (linkKey ? record[linkKey] : '') || value;
                        const badge = documentBadge(value, url, recordKey);
                        const LinkIcon = badge.Icon;
                        return (
                          <td key={key} className="max-w-64 border-r border-slate-100 px-3 py-3 leading-5 text-slate-600 last:border-r-0 dark:border-slate-800 dark:text-slate-300">
                            {safeUrl(url) ? (
                              <a 
                                href={url} 
                                target="_blank" 
                                rel="noreferrer" 
                                title={url} 
                                className={`inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold transition hover:brightness-95 hover:underline ${badge.className}`}
                              >
                                <LinkIcon className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{badge.label || `เปิด ${label}`}</span>
                                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                              </a>
                            ) : (
                              value
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
