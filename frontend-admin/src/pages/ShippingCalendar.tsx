import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Truck,
  Plus,
  Calendar as CalendarIcon,
  List as ListIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  MapPin,
  Phone,
  Clock,
  Package,
  User as UserIcon,
  Edit3,
  Trash2,
  X,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Building2,
  FileText,
} from 'lucide-react';
import {
  fetchShippingBranches,
  fetchShippingSchedules,
  createShippingSchedule,
  updateShippingSchedule,
  deleteShippingSchedule,
  fetchBrands,
  fetchHolidays,
  fetchUsers,
} from '../services/adminApi';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/queryKeys';
import type {
  Brand,
  Holiday,
  ShippingBranch,
  ShippingSchedule,
  ShippingScheduleInput,
  ShippingStatus,
  ShippingVehicleType,
  User,
} from '../types';

interface LayoutContext {
  currentUser: User | null;
}

const MONTH_NAMES = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const MONTH_NAMES_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const WEEKDAY_NAMES_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

const STATUS_META: Record<
  ShippingStatus,
  { label: string; dot: string; badge: string; cardBorder: string }
> = {
  pending: {
    label: 'รอจัดส่ง',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    cardBorder: 'border-amber-200 hover:border-amber-300',
  },
  in_transit: {
    label: 'กำลังจัดส่ง',
    dot: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    cardBorder: 'border-blue-200 hover:border-blue-300',
  },
  delivered: {
    label: 'ส่งสำเร็จ',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    cardBorder: 'border-emerald-200 hover:border-emerald-300',
  },
  postponed: {
    label: 'เลื่อนส่ง',
    dot: 'bg-purple-500',
    badge: 'bg-purple-50 text-purple-700 border-purple-200',
    cardBorder: 'border-purple-200 hover:border-purple-300',
  },
  cancelled: {
    label: 'ยกเลิก',
    dot: 'bg-rose-500',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    cardBorder: 'border-rose-200 hover:border-rose-300',
  },
};

const VEHICLE_META: Record<ShippingVehicleType, { label: string; icon: string }> = {
  company_truck: { label: 'รถบริษัท', icon: '🚛' },
  lalamove: { label: 'Lalamove / รถรับจ้าง', icon: '🚐' },
  external_courier: { label: 'ขนส่งเอกชน', icon: '📦' },
  customer_pickup: { label: 'ลูกค้ารับเอง', icon: '🏪' },
  other: { label: 'อื่นๆ', icon: '🚚' },
};

const TIME_SLOT_PRESETS = [
  'ช่วงเช้า (09:00-12:00)',
  'ช่วงบ่าย (13:00-17:00)',
  'ทั้งวัน',
  'นัดเวลาเฉพาะ',
];

const BRANCH_PALETTES = [
  { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200', dot: 'bg-blue-600' },
  { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200', dot: 'bg-emerald-600' },
  { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200', dot: 'bg-amber-600' },
  { bg: 'bg-violet-100', text: 'text-violet-800', border: 'border-violet-200', dot: 'bg-violet-600' },
  { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-200', dot: 'bg-rose-600' },
  { bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-200', dot: 'bg-cyan-600' },
  { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-200', dot: 'bg-orange-600' },
  { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-200', dot: 'bg-teal-600' },
  { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-200', dot: 'bg-indigo-600' },
  { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-200', dot: 'bg-pink-600' },
];

function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateThai(dateStr: string): string {
  if (!dateStr) return '-';
  const clean = dateStr.split('T')[0];
  const [y, m, d] = clean.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return `${d} ${MONTH_NAMES[m - 1]} ${y + 543}`;
}

function getWeekdayThai(dateStr: string): string {
  const clean = dateStr.split('T')[0];
  const dt = new Date(`${clean}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return '';
  const names = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
  return names[dt.getDay()] || '';
}

interface FormState {
  delivery_date: string;
  time_slot: string;
  title: string;
  branch_id: string;
  brand_id: string;
  customer_name: string;
  customer_phone: string;
  location: string;
  map_url: string;
  order_no: string;
  vehicle_type: ShippingVehicleType;
  driver_name: string;
  assignee_id: string;
  status: ShippingStatus;
  notes: string;
}

const createEmptyForm = (dateStr: string): FormState => ({
  delivery_date: dateStr,
  time_slot: 'ช่วงเช้า (09:00-12:00)',
  title: '',
  branch_id: '',
  brand_id: '',
  customer_name: '',
  customer_phone: '',
  location: '',
  map_url: '',
  order_no: '',
  vehicle_type: 'company_truck',
  driver_name: '',
  assignee_id: '',
  status: 'pending',
  notes: '',
});

export default function ShippingCalendar() {
  const { currentUser } = useOutletContext<LayoutContext>() || {};
  const queryClient = useQueryClient();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayStr = useMemo(() => formatDateStr(today), [today]);

  const [year, setYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth());
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals
  const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);
  const [showFormModal, setShowFormModal] = useState<boolean>(false);
  const [showMoreFields, setShowMoreFields] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<ShippingSchedule | null>(null);
  const [form, setForm] = useState<FormState>(() => createEmptyForm(todayStr));
  const [saving, setSaving] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const schedulesQuery = useQuery({
    queryKey: queryKeys.shippingSchedules(year),
    queryFn: () => fetchShippingSchedules(year),
    staleTime: 30_000,
  });

  const branchesQuery = useQuery({
    queryKey: queryKeys.shippingBranches,
    queryFn: () => fetchShippingBranches(),
    staleTime: 10 * 60_000,
  });

  const brandsQuery = useQuery({
    queryKey: queryKeys.brands,
    queryFn: () => fetchBrands(),
    staleTime: 15 * 60_000,
  });

  const holidaysQuery = useQuery({
    queryKey: queryKeys.holidays(year),
    queryFn: () => fetchHolidays(year),
    staleTime: 30 * 60_000,
  });

  const usersQuery = useQuery({
    queryKey: queryKeys.users(),
    queryFn: () => fetchUsers(),
    enabled: Boolean(currentUser?.id),
    staleTime: 5 * 60_000,
  });

  // Realtime sync across teammates
  useEffect(() => {
    const channel = supabase
      .channel('shipping_schedules_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shipping_schedules' },
        () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.shippingSchedules(year) });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, year]);

  const schedules: ShippingSchedule[] = schedulesQuery.data ?? [];
  const branches: ShippingBranch[] = branchesQuery.data ?? [];
  const brands: Brand[] = useMemo(() => {
    const raw = brandsQuery.data ?? [];
    return [...raw].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.name.localeCompare(b.name));
  }, [brandsQuery.data]);
  const holidays: Holiday[] = holidaysQuery.data ?? [];
  const users: User[] = usersQuery.data ?? [];

  const branchMap = useMemo(() => {
    const map = new Map<number, { branch: ShippingBranch; palette: (typeof BRANCH_PALETTES)[number] }>();
    branches.forEach((b, idx) => {
      map.set(b.id, { branch: b, palette: BRANCH_PALETTES[idx % BRANCH_PALETTES.length] });
    });
    return map;
  }, [branches]);

  const brandMap = useMemo(() => {
    const map = new Map<string, Brand>();
    brands.forEach((b) => map.set(b.id, b));
    return map;
  }, [brands]);

  const userMap = useMemo(() => {
    const map = new Map<string, User>();
    users.forEach((u) => map.set(u.id, u));
    return map;
  }, [users]);

  const getUserDisplayName = useCallback(
    (userId?: string | null) => {
      if (!userId) return '';
      const u = userMap.get(userId);
      if (!u) return '';
      return u.nickname?.trim() || `${u.first_name} ${u.last_name}`.trim() || u.email;
    },
    [userMap]
  );

  // Filtered schedules
  const filteredSchedules = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return schedules.filter((item) => {
      if (branchFilter === 'none') {
        if (item.branch_id !== null && item.branch_id !== undefined) return false;
      } else if (branchFilter !== 'all') {
        if (String(item.branch_id ?? '') !== branchFilter) return false;
      }

      if (brandFilter !== 'all' && (item.brand_id || '') !== brandFilter) {
        return false;
      }

      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }

      if (q) {
        const branchName = item.branch_id ? (branchMap.get(item.branch_id)?.branch.branch_name || '') : '';
        const branchCode = item.branch_id ? (branchMap.get(item.branch_id)?.branch.branch_code || '') : '';
        const brandName = item.brand_id ? (brandMap.get(item.brand_id)?.name || '') : '';
        const assigneeName = getUserDisplayName(item.assignee_id);
        const haystack = [
          item.title,
          item.customer_name,
          item.customer_phone,
          item.location,
          item.order_no,
          item.driver_name,
          item.notes,
          item.time_slot,
          branchName,
          branchCode,
          brandName,
          assigneeName,
          formatDateThai(item.delivery_date),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [schedules, branchFilter, brandFilter, statusFilter, searchTerm, branchMap, brandMap, getUserDisplayName]);

  // Map by YYYY-MM-DD
  const schedulesByDate = useMemo(() => {
    const map = new Map<string, ShippingSchedule[]>();
    for (const item of filteredSchedules) {
      const key = item.delivery_date.split('T')[0];
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [filteredSchedules]);

  // Holiday lookup by YYYY-MM-DD
  const holidaysByDate = useMemo(() => {
    const map = new Map<string, Holiday[]>();
    for (const h of holidays) {
      const startStr = h.date.split('T')[0];
      const start = new Date(`${startStr}T00:00:00`);
      const numDays = Math.max(1, h.num_days || 1);
      for (let i = 0; i < numDays; i++) {
        const d = new Date(start.getTime() + i * 86400000);
        const key = formatDateStr(d);
        const list = map.get(key) || [];
        list.push(h);
        map.set(key, list);
      }
    }
    return map;
  }, [holidays]);

  // Month stats
  const currentMonthSchedules = useMemo(() => {
    const prefix = `${year}-${String(currentMonth + 1).padStart(2, '0')}-`;
    return filteredSchedules.filter((s) => s.delivery_date.startsWith(prefix));
  }, [filteredSchedules, year, currentMonth]);

  const monthStats = useMemo(() => {
    let pending = 0;
    let inTransit = 0;
    let delivered = 0;
    for (const s of currentMonthSchedules) {
      if (s.status === 'pending') pending++;
      else if (s.status === 'in_transit') inTransit++;
      else if (s.status === 'delivered') delivered++;
    }
    return { total: currentMonthSchedules.length, pending, inTransit, delivered };
  }, [currentMonthSchedules]);

  // Branch counts for current month
  const monthBranchCounts = useMemo(() => {
    const prefix = `${year}-${String(currentMonth + 1).padStart(2, '0')}-`;
    const counts = new Map<string, number>();
    let total = 0;
    for (const s of schedules) {
      if (!s.delivery_date.startsWith(prefix)) continue;
      if (brandFilter !== 'all' && (s.brand_id || '') !== brandFilter) continue;
      if (statusFilter !== 'all' && s.status !== statusFilter) continue;
      total++;
      const key = s.branch_id !== null && s.branch_id !== undefined ? String(s.branch_id) : 'none';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    counts.set('all', total);
    return counts;
  }, [schedules, year, currentMonth, brandFilter, statusFilter]);

  // Calendar grid days
  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(year, currentMonth, 1);
    const startDay = firstOfMonth.getDay();
    const startDate = new Date(firstOfMonth);
    startDate.setDate(startDate.getDate() - startDay);

    const lastOfMonth = new Date(year, currentMonth + 1, 0);
    const endDay = lastOfMonth.getDay();
    const endDate = new Date(lastOfMonth);
    endDate.setDate(endDate.getDate() + (6 - endDay));

    const cells: Array<{
      dateStr: string;
      dayNumber: number;
      monthNumber: number;
      yearNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      items: ShippingSchedule[];
      holidays: Holiday[];
    }> = [];

    const cur = new Date(startDate);
    while (cur <= endDate) {
      const dateStr = formatDateStr(cur);
      cells.push({
        dateStr,
        dayNumber: cur.getDate(),
        monthNumber: cur.getMonth(),
        yearNumber: cur.getFullYear(),
        isCurrentMonth: cur.getMonth() === currentMonth && cur.getFullYear() === year,
        isToday: dateStr === todayStr,
        items: schedulesByDate.get(dateStr) || [],
        holidays: holidaysByDate.get(dateStr) || [],
      });
      cur.setDate(cur.getDate() + 1);
    }
    return cells;
  }, [year, currentMonth, todayStr, schedulesByDate, holidaysByDate]);

  // Grouped by month for List View
  const groupedByMonth = useMemo(() => {
    const groups: Record<number, ShippingSchedule[]> = {};
    const yearPrefix = `${year}-`;
    for (const item of filteredSchedules) {
      if (!item.delivery_date.startsWith(yearPrefix)) continue;
      const m = Number(item.delivery_date.slice(5, 7)) - 1;
      if (m < 0 || m > 11) continue;
      if (!groups[m]) groups[m] = [];
      groups[m].push(item);
    }
    return groups;
  }, [filteredSchedules, year]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleGoToday = () => {
    setYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  };

  const openCreateModal = (dateStr?: string) => {
    setEditingItem(null);
    const defaultDate =
      dateStr ||
      (year === today.getFullYear() && currentMonth === today.getMonth()
        ? todayStr
        : `${year}-${String(currentMonth + 1).padStart(2, '0')}-01`);
    const nextForm = createEmptyForm(defaultDate);
    if (branchFilter !== 'all' && branchFilter !== 'none') {
      nextForm.branch_id = branchFilter;
    }
    if (brandFilter !== 'all') {
      nextForm.brand_id = brandFilter;
    }
    if (currentUser?.id) {
      nextForm.assignee_id = currentUser.id;
    }
    setForm(nextForm);
    setShowMoreFields(false);
    setShowFormModal(true);
  };

  const openEditModal = (item: ShippingSchedule) => {
    setEditingItem(item);
    const hasExtra = Boolean(
      item.customer_name ||
        item.customer_phone ||
        item.location ||
        item.map_url ||
        item.order_no ||
        item.driver_name ||
        item.brand_id ||
        item.notes ||
        (item.vehicle_type && item.vehicle_type !== 'company_truck')
    );
    setForm({
      delivery_date: item.delivery_date.split('T')[0],
      time_slot: item.time_slot || '',
      title: item.title || '',
      branch_id: item.branch_id !== null && item.branch_id !== undefined ? String(item.branch_id) : '',
      brand_id: item.brand_id || '',
      customer_name: item.customer_name || '',
      customer_phone: item.customer_phone || '',
      location: item.location || '',
      map_url: item.map_url || '',
      order_no: item.order_no || '',
      vehicle_type: item.vehicle_type || 'company_truck',
      driver_name: item.driver_name || '',
      assignee_id: item.assignee_id || '',
      status: item.status || 'pending',
      notes: item.notes || '',
    });
    setShowMoreFields(hasExtra);
    setShowFormModal(true);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.delivery_date || !form.title.trim()) {
      showToast('error', 'กรุณาระบุวันที่จัดส่งและรายการขนส่ง');
      return;
    }

    setSaving(true);
    try {
      const parsedBranchId = form.branch_id ? Number(form.branch_id) : null;
      const payload: ShippingScheduleInput = {
        delivery_date: form.delivery_date,
        time_slot: form.time_slot,
        title: form.title,
        branch_id: parsedBranchId && Number.isFinite(parsedBranchId) ? parsedBranchId : null,
        brand_id: form.brand_id || null,
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        location: form.location,
        map_url: form.map_url,
        order_no: form.order_no,
        vehicle_type: form.vehicle_type,
        driver_name: form.driver_name,
        assignee_id: form.assignee_id || null,
        status: form.status,
        notes: form.notes,
      };

      if (editingItem) {
        await updateShippingSchedule(editingItem.id, payload);
        showToast('success', 'อัปเดตแผนขนส่งเรียบร้อยแล้ว');
      } else {
        await createShippingSchedule(payload);
        showToast('success', 'เพิ่มแผนขนส่งเรียบร้อยแล้ว');
      }

      const savedYear = Number(form.delivery_date.slice(0, 4));
      await queryClient.invalidateQueries({ queryKey: queryKeys.shippingSchedules(year) });
      if (savedYear && savedYear !== year) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.shippingSchedules(savedYear) });
      }
      setShowFormModal(false);
      setEditingItem(null);
    } catch (err: any) {
      showToast('error', err?.message || 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickStatus = async (item: ShippingSchedule, newStatus: ShippingStatus) => {
    if (item.status === newStatus || updatingStatusId) return;
    setUpdatingStatusId(item.id);
    try {
      await updateShippingSchedule(item.id, { status: newStatus });
      await queryClient.invalidateQueries({ queryKey: queryKeys.shippingSchedules(year) });
      showToast('success', `เปลี่ยนสถานะเป็น "${STATUS_META[newStatus].label}" แล้ว`);
    } catch (err: any) {
      showToast('error', err?.message || 'เปลี่ยนสถานะไม่สำเร็จ');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleDelete = async (item: ShippingSchedule) => {
    if (!window.confirm(`ยืนยันลบแผนขนส่ง "${item.title}" วันที่ ${formatDateThai(item.delivery_date)}?`)) {
      return;
    }
    setDeletingId(item.id);
    try {
      await deleteShippingSchedule(item.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.shippingSchedules(year) });
      showToast('success', 'ลบแผนขนส่งเรียบร้อยแล้ว');
      if (editingItem?.id === item.id) {
        setShowFormModal(false);
        setEditingItem(null);
      }
    } catch (err: any) {
      showToast('error', err?.message || 'ลบแผนขนส่งไม่สำเร็จ');
    } finally {
      setDeletingId(null);
    }
  };

  const selectedDayItems = selectedDayStr ? schedulesByDate.get(selectedDayStr) || [] : [];
  const selectedDayHolidays = selectedDayStr ? holidaysByDate.get(selectedDayStr) || [] : [];
  const loading = schedulesQuery.isLoading;

  return (
    <div
      id="shipping-calendar"
      className="page-section active flex w-full min-w-0 flex-none flex-col pb-12 content-area-flush px-4 sm:px-6 md:px-8 pt-0"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      {/* Consolidated Master Toolbar (Cloned from Holidays.tsx) */}
      <div className="holiday-master-toolbar sticky z-30 bg-white border-b border-slate-200 shadow-xs -mx-4 sm:-mx-6 md:-mx-8 px-4 sm:px-6 md:px-8 divide-y divide-slate-100">
        {/* Deck 1: Title, Search, Year, View Mode, Add Button */}
        <div className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20 flex items-center justify-center">
                <Truck className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight leading-tight">
                  แผนขนส่ง
                </h2>
                <p className="text-[11px] text-slate-500 font-medium">
                  ปฏิทินและตารางจัดส่งสินค้าแยกตามสาขา (ทุกคนที่ล็อกอินดูและแก้ไขได้)
                </p>
              </div>
            </div>
            <span className="bg-slate-100 text-slate-700 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-slate-200">
              ปี {year + 543}
            </span>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Search Box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหา ลูกค้า, สาขา, ออเดอร์..."
                className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-xl pl-8 pr-7 py-1.5 w-48 sm:w-56 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Year Selector */}
            <select
              className="bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-3 py-1.5 shadow-xs hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {[year - 1, year, year + 1].map((y) => (
                <option key={y} value={y}>
                  พ.ศ. {y + 543} ({y})
                </option>
              ))}
            </select>

            {/* View Mode Switcher */}
            <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('calendar')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'calendar'
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                ปฏิทิน
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <ListIcon className="w-3.5 h-3.5" />
                รายการ
              </button>
            </div>

            {/* Add Button */}
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-3.5 py-1.5 rounded-xl shadow-md shadow-blue-500/20 hover:shadow-blue-500/30 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              เพิ่มแผนขนส่ง
            </button>
          </div>
        </div>

        {/* Deck 2: Month Navigator + Month Pills + Brand & Status Filters */}
        <div className="py-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          {/* Left: Current Month + Stats + Prev/Today/Next */}
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-extrabold text-slate-800 tracking-tight flex items-center gap-1.5">
              <CalendarIcon className="w-4 h-4 text-blue-600" />
              เดือน{MONTH_NAMES[currentMonth]} {year + 543}
            </h3>
            <span className="text-[11px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-200">
              {monthStats.total} คิว
            </span>
            {monthStats.pending > 0 && (
              <span className="text-[11px] bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded-full border border-amber-200">
                รอส่ง {monthStats.pending}
              </span>
            )}
            {monthStats.inTransit > 0 && (
              <span className="text-[11px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full border border-indigo-200">
                กำลังส่ง {monthStats.inTransit}
              </span>
            )}
            {monthStats.delivered > 0 && (
              <span className="text-[11px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                สำเร็จ {monthStats.delivered}
              </span>
            )}

            <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200 ml-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="w-6 h-6 rounded-md hover:bg-white text-slate-600 hover:text-slate-900 flex items-center justify-center transition-all cursor-pointer"
                title="เดือนก่อนหน้า"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleGoToday}
                className="px-2 py-0.5 rounded-md hover:bg-white text-slate-700 font-bold text-[11px] transition-all cursor-pointer"
                title="ไปเดือนปัจจุบัน"
              >
                วันนี้
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="w-6 h-6 rounded-md hover:bg-white text-slate-600 hover:text-slate-900 flex items-center justify-center transition-all cursor-pointer"
                title="เดือนถัดไป"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Center: Month Pills */}
          <div className="overflow-x-auto flex items-center gap-1 scrollbar-none py-0.5">
            {MONTH_NAMES_SHORT.map((mShort, idx) => {
              const isSelected = currentMonth === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentMonth(idx)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 bg-slate-50 border border-slate-200/60'
                  }`}
                >
                  {mShort}
                </button>
              );
            })}
          </div>

          {/* Right: Branch + Brand + Status Dropdown Filters */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div className="flex items-center gap-1.5 rounded-xl border border-blue-200/80 bg-blue-50/60 px-2.5 py-1 shadow-2xs">
              <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                aria-label="กรองตามสาขา"
                className="bg-transparent text-xs font-bold text-blue-900 outline-none cursor-pointer max-w-[190px]"
              >
                <option value="all">ทุกสาขา ({monthBranchCounts.get('all') || 0})</option>
                {branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.branch_name.trim()} ({monthBranchCounts.get(String(b.id)) || 0})
                  </option>
                ))}
                {(monthBranchCounts.get('none') || 0) > 0 && (
                  <option value="none">
                    ไม่ระบุสาขา ({monthBranchCounts.get('none') || 0})
                  </option>
                )}
              </select>
              {branchFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setBranchFilter('all')}
                  aria-label="ล้างตัวกรองสาขา"
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-blue-400 hover:bg-blue-200/80 hover:text-blue-800 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {brands.length > 0 && (
              <select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                aria-label="กรองตามแบรนด์"
                className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-2.5 py-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20 max-w-[150px]"
              >
                <option value="all">แบรนด์: ทั้งหมด</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="กรองตามสถานะ"
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-2.5 py-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">สถานะ: ทั้งหมด</option>
              {(Object.keys(STATUS_META) as ShippingStatus[]).map((st) => (
                <option key={st} value={st}>
                  {STATUS_META[st].label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mt-4">
        {schedulesQuery.isError && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              โหลดข้อมูลแผนขนส่งไม่สำเร็จ: {(schedulesQuery.error as Error)?.message || 'กรุณาลองใหม่อีกครั้ง'}
            </span>
          </div>
        )}

        {/* CALENDAR VIEW */}
        {viewMode === 'calendar' && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {/* Weekday Header */}
            <div className="grid grid-cols-7 bg-slate-50/90 border-b border-slate-200 text-center text-xs font-bold text-slate-500 py-3">
              {WEEKDAY_NAMES_SHORT.map((day, i) => (
                <div key={day} className={i === 0 || i === 6 ? 'text-rose-500' : ''}>
                  {day}
                </div>
              ))}
            </div>

            {loading ? (
              <div className="py-20 text-center text-slate-400">
                <Loader2 className="w-7 h-7 animate-spin text-blue-500 mx-auto mb-2" />
                <p className="text-sm font-medium">กำลังโหลดแผนขนส่ง...</p>
              </div>
            ) : (
              <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-200 bg-slate-200/40">
                {calendarDays.map((cell, idx) => {
                  const isWeekend = idx % 7 === 0 || idx % 7 === 6;
                  const visibleItems = cell.items.slice(0, 3);
                  const extraCount = Math.max(0, cell.items.length - visibleItems.length);

                  return (
                    <div
                      key={cell.dateStr}
                      onClick={() => {
                        if (cell.items.length > 0 || cell.holidays.length > 0) {
                          setSelectedDayStr(cell.dateStr);
                        } else {
                          openCreateModal(cell.dateStr);
                        }
                      }}
                      className={`min-h-[142px] p-2 transition-all relative flex flex-col group cursor-pointer ${
                        cell.isCurrentMonth
                          ? 'bg-white hover:bg-slate-50/90'
                          : 'bg-slate-50/70 opacity-45 hover:opacity-80'
                      } ${cell.isToday ? 'ring-2 ring-inset ring-blue-500/50 bg-blue-50/20 opacity-100' : ''}`}
                    >
                      {/* Cell Header */}
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span
                          className={`inline-flex items-center justify-center text-xs font-extrabold rounded-full ${
                            cell.isToday
                              ? 'w-6 h-6 bg-blue-600 text-white shadow-xs'
                              : isWeekend
                              ? 'text-rose-500 px-1'
                              : 'text-slate-700 px-1'
                          }`}
                        >
                          {cell.dayNumber}
                        </span>

                        <div className="flex items-center gap-1">
                          {cell.items.length > 0 && (
                            <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 border border-blue-200/70 px-1.5 py-0.2 rounded-full">
                              {cell.items.length}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openCreateModal(cell.dateStr);
                            }}
                            title={`เพิ่มแผนขนส่งวันที่ ${formatDateThai(cell.dateStr)}`}
                            className="w-5 h-5 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Company Holiday Reference */}
                      {cell.holidays.length > 0 && (
                        <div className="mb-1 px-1.5 py-0.5 rounded-md bg-rose-50 border border-rose-200/80 text-[10px] font-bold text-rose-600 truncate">
                          วันหยุด: {cell.holidays[0].name}
                        </div>
                      )}

                      {/* Delivery Cards inside Day Cell */}
                      <div className="flex flex-col gap-1 flex-1">
                        {visibleItems.map((item) => {
                          const branchInfo =
                            item.branch_id !== null && item.branch_id !== undefined
                              ? branchMap.get(item.branch_id)
                              : undefined;
                          const brandObj = item.brand_id ? brandMap.get(item.brand_id) : undefined;
                          const st = STATUS_META[item.status] || STATUS_META.pending;
                          return (
                            <div
                              key={item.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDayStr(cell.dateStr);
                              }}
                              className={`rounded-lg border px-1.5 py-1 text-left transition-all shadow-2xs ${
                                item.status === 'cancelled'
                                  ? 'bg-slate-50 border-slate-200 opacity-60'
                                  : item.status === 'delivered'
                                  ? 'bg-emerald-50/60 border-emerald-200'
                                  : 'bg-white border-slate-200/90 hover:border-blue-300'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                {branchInfo ? (
                                  <span
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-extrabold truncate max-w-[105px] ${branchInfo.palette.bg} ${branchInfo.palette.text}`}
                                    title={branchInfo.branch.branch_name}
                                  >
                                    {branchInfo.branch.branch_name.trim()}
                                  </span>
                                ) : brandObj ? (
                                  <span className="text-[9px] font-bold text-slate-600 truncate">
                                    {brandObj.name}
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-bold text-slate-400">ขนส่ง</span>
                                )}
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`}
                                  title={st.label}
                                />
                              </div>
                              <p
                                className={`text-[11px] font-bold leading-snug truncate mt-0.5 ${
                                  item.status === 'cancelled'
                                    ? 'line-through text-slate-400'
                                    : 'text-slate-800'
                                }`}
                              >
                                {item.title}
                              </p>
                              {(item.customer_name || item.time_slot) && (
                                <p className="text-[9.5px] text-slate-500 truncate">
                                  {item.time_slot ? `${item.time_slot.split(' ')[0]} · ` : ''}
                                  {item.customer_name || item.location}
                                </p>
                              )}
                            </div>
                          );
                        })}

                        {extraCount > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDayStr(cell.dateStr);
                            }}
                            className="text-[10px] font-extrabold text-blue-600 hover:text-blue-800 bg-blue-50/70 rounded-md py-0.5 text-center"
                          >
                            +{extraCount} คิวเพิ่มเติม
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* LIST VIEW */}
        {viewMode === 'list' && (
          <div className="space-y-6">
            {loading ? (
              <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center text-slate-400">
                <Loader2 className="w-7 h-7 animate-spin text-blue-500 mx-auto mb-2" />
                กำลังโหลดรายการแผนขนส่ง...
              </div>
            ) : Object.keys(groupedByMonth).length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
                <Truck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 font-bold">ยังไม่มีแผนขนส่งในปี {year + 543}</p>
                <p className="text-xs text-slate-400 mt-1">กดปุ่ม "+ เพิ่มแผนขนส่ง" เพื่อเริ่มลงตารางได้เลยครับ</p>
                <button
                  type="button"
                  onClick={() => openCreateModal()}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  เพิ่มแผนขนส่งแรก
                </button>
              </div>
            ) : (
              Object.keys(groupedByMonth)
                .map(Number)
                .sort((a, b) => a - b)
                .map((monthIdx) => {
                  const list = groupedByMonth[monthIdx] || [];
                  return (
                    <div
                      key={monthIdx}
                      className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden"
                    >
                      <div className="px-5 py-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                        <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                          <CalendarIcon className="w-4 h-4 text-blue-600" />
                          เดือน{MONTH_NAMES[monthIdx]} {year + 543}
                        </h4>
                        <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                          {list.length} คิว
                        </span>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {list.map((item) => {
                          const branchInfo =
                            item.branch_id !== null && item.branch_id !== undefined
                              ? branchMap.get(item.branch_id)
                              : undefined;
                          const brandObj = item.brand_id ? brandMap.get(item.brand_id) : undefined;
                          const st = STATUS_META[item.status] || STATUS_META.pending;
                          const veh = VEHICLE_META[item.vehicle_type] || VEHICLE_META.other;
                          const assigneeName = getUserDisplayName(item.assignee_id);

                          return (
                            <div
                              key={item.id}
                              className="p-4 hover:bg-slate-50/70 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                            >
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-extrabold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-lg">
                                    {formatDateThai(item.delivery_date)}
                                  </span>
                                  {item.time_slot && (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600">
                                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                                      {item.time_slot}
                                    </span>
                                  )}
                                  {branchInfo && (
                                    <span
                                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${branchInfo.palette.bg} ${branchInfo.palette.text} ${branchInfo.palette.border}`}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full ${branchInfo.palette.dot}`} />
                                      {branchInfo.branch.branch_name.trim()}
                                    </span>
                                  )}
                                  {brandObj && (
                                    <span className="text-[11px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                                      {brandObj.name}
                                    </span>
                                  )}
                                  {item.order_no && (
                                    <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                                      #{item.order_no}
                                    </span>
                                  )}
                                </div>

                                <p
                                  className={`text-sm font-extrabold ${
                                    item.status === 'cancelled'
                                      ? 'line-through text-slate-400'
                                      : 'text-slate-900'
                                  }`}
                                >
                                  {item.title}
                                </p>

                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                                  {item.customer_name && (
                                    <span className="inline-flex items-center gap-1 font-medium">
                                      <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                                      {item.customer_name}
                                    </span>
                                  )}
                                  {item.customer_phone && (
                                    <a
                                      href={`tel:${item.customer_phone}`}
                                      className="inline-flex items-center gap-1 text-blue-600 hover:underline font-semibold"
                                    >
                                      <Phone className="w-3.5 h-3.5" />
                                      {item.customer_phone}
                                    </a>
                                  )}
                                  {item.location && (
                                    <span className="inline-flex items-center gap-1">
                                      <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                      {item.location}
                                    </span>
                                  )}
                                  {item.map_url && (
                                    <a
                                      href={item.map_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-emerald-600 hover:underline font-semibold"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                      เปิดแผนที่
                                    </a>
                                  )}
                                  <span>
                                    {veh.icon} {veh.label}
                                    {item.driver_name ? ` (${item.driver_name})` : ''}
                                  </span>
                                  {assigneeName && (
                                    <span className="text-slate-500">ผู้ดูแล: {assigneeName}</span>
                                  )}
                                </div>

                                {item.notes && (
                                  <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                                    หมายเหตุ: {item.notes}
                                  </p>
                                )}
                              </div>

                              {/* Right Actions */}
                              <div className="flex items-center gap-2 shrink-0">
                                <select
                                  value={item.status}
                                  disabled={updatingStatusId === item.id}
                                  onChange={(e) => handleQuickStatus(item, e.target.value as ShippingStatus)}
                                  className={`text-xs font-bold rounded-xl px-2.5 py-1.5 border cursor-pointer focus:outline-none ${st.badge}`}
                                >
                                  {(Object.keys(STATUS_META) as ShippingStatus[]).map((k) => (
                                    <option key={k} value={k}>
                                      {STATUS_META[k].label}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => openEditModal(item)}
                                  className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-blue-600 hover:border-blue-300 transition-colors cursor-pointer"
                                  title="แก้ไข"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  disabled={deletingId === item.id}
                                  onClick={() => handleDelete(item)}
                                  className="p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-rose-600 hover:border-rose-300 transition-colors cursor-pointer disabled:opacity-50"
                                  title="ลบ"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
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
      </div>

      {/* DAY DETAILS MODAL */}
      {selectedDayStr && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedDayStr(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/70">
              <div>
                <p className="text-xs font-bold text-blue-600">{getWeekdayThai(selectedDayStr)}</p>
                <h3 className="text-lg font-extrabold text-slate-900">
                  {formatDateThai(selectedDayStr)}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openCreateModal(selectedDayStr)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  เพิ่มแผนวันนี้
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDayStr(null)}
                  className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {selectedDayHolidays.length > 0 && (
                <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs font-bold text-rose-700">
                  วันหยุดบริษัท: {selectedDayHolidays.map((h) => h.name).join(', ')}
                </div>
              )}

              {selectedDayItems.length === 0 ? (
                <div className="py-10 text-center text-slate-400">
                  <Truck className="w-9 h-9 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-500">ยังไม่มีแผนขนส่งในวันนี้</p>
                </div>
              ) : (
                selectedDayItems.map((item) => {
                  const branchInfo =
                    item.branch_id !== null && item.branch_id !== undefined
                      ? branchMap.get(item.branch_id)
                      : undefined;
                  const brandObj = item.brand_id ? brandMap.get(item.brand_id) : undefined;
                  const st = STATUS_META[item.status] || STATUS_META.pending;
                  const veh = VEHICLE_META[item.vehicle_type] || VEHICLE_META.other;
                  const assigneeName = getUserDisplayName(item.assignee_id);
                  const updatedByName = getUserDisplayName(item.updated_by || item.created_by);

                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border bg-white p-4 shadow-2xs space-y-2.5 ${st.cardBorder}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {branchInfo && (
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${branchInfo.palette.bg} ${branchInfo.palette.text} ${branchInfo.palette.border}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${branchInfo.palette.dot}`} />
                              {branchInfo.branch.branch_name.trim()}
                            </span>
                          )}
                          {brandObj && (
                            <span className="text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                              {brandObj.name}
                            </span>
                          )}
                          {item.time_slot && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg">
                              <Clock className="w-3 h-3" />
                              {item.time_slot}
                            </span>
                          )}
                          {item.order_no && (
                            <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg">
                              #{item.order_no}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:text-blue-600 hover:border-blue-300 flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            แก้ไข
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === item.id}
                            onClick={() => handleDelete(item)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-300 cursor-pointer disabled:opacity-50"
                            title="ลบ"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <h4
                        className={`text-base font-extrabold ${
                          item.status === 'cancelled' ? 'line-through text-slate-400' : 'text-slate-900'
                        }`}
                      >
                        {item.title}
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-600">
                        {item.customer_name && (
                          <div className="flex items-center gap-1.5">
                            <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-semibold text-slate-700">{item.customer_name}</span>
                          </div>
                        )}
                        {item.customer_phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <a href={`tel:${item.customer_phone}`} className="text-blue-600 font-bold hover:underline">
                              {item.customer_phone}
                            </a>
                          </div>
                        )}
                        {item.location && (
                          <div className="flex items-start gap-1.5 sm:col-span-2">
                            <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                            <span>{item.location}</span>
                          </div>
                        )}
                        {item.map_url && (
                          <div className="sm:col-span-2">
                            <a
                              href={item.map_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-emerald-600 hover:underline font-bold"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              เปิดพิกัดใน Google Maps
                            </a>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>
                            {veh.icon} {veh.label}
                            {item.driver_name ? ` — ${item.driver_name}` : ''}
                          </span>
                        </div>
                        {assigneeName && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">ผู้ประสานงาน:</span>
                            <span className="font-semibold text-slate-700">{assigneeName}</span>
                          </div>
                        )}
                      </div>

                      {item.notes && (
                        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-600 flex items-start gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span className="whitespace-pre-wrap">{item.notes}</span>
                        </div>
                      )}

                      {/* Quick Status Bar */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1 flex-wrap">
                          {(Object.keys(STATUS_META) as ShippingStatus[]).map((k) => {
                            const active = item.status === k;
                            return (
                              <button
                                key={k}
                                type="button"
                                disabled={updatingStatusId === item.id}
                                onClick={() => handleQuickStatus(item, k)}
                                className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                                  active
                                    ? `${STATUS_META[k].badge} ring-2 ring-offset-1 ring-slate-300`
                                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                {STATUS_META[k].label}
                              </button>
                            );
                          })}
                        </div>
                        {updatedByName && (
                          <span className="text-[10px] text-slate-400">อัปเดตโดย {updatedByName}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT MODAL (Compact by default, optional details collapsible) */}
      {showFormModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !saving && setShowFormModal(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                  <Truck className="w-4 h-4" />
                </span>
                <h3 className="text-base font-extrabold text-slate-900">
                  {editingItem ? 'แก้ไขแผนขนส่ง' : 'เพิ่มแผนขนส่ง'}
                </h3>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setShowFormModal(false)}
                className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* SECTION 1: ข้อมูลจำเป็น */}
              <div className="rounded-2xl border border-blue-100 bg-blue-50/25 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-blue-600 text-white">
                      ข้อมูลจำเป็น
                    </span>
                    <span className="text-[11px] text-slate-500">กรอกส่วนนี้ก็บันทึกคิวได้เลย</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      วันที่จัดส่ง <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={form.delivery_date}
                      onChange={(e) => setForm((f) => ({ ...f, delivery_date: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">ช่วงเวลา</label>
                    <input
                      type="text"
                      list="shipping-time-presets"
                      value={form.time_slot}
                      onChange={(e) => setForm((f) => ({ ...f, time_slot: e.target.value }))}
                      placeholder="เช้า / บ่าย / ระบุเวลา"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                    <datalist id="shipping-time-presets">
                      {TIME_SLOT_PRESETS.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      รายการขนส่ง <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder="เช่น ส่งแผ่นไม้ 2 แผ่น, ย้ายของไปสาขาลาดพร้าว"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">สาขา</label>
                    <select
                      value={form.branch_id}
                      onChange={(e) => setForm((f) => ({ ...f, branch_id: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                      <option value="">— เลือกสาขา —</option>
                      {branches.map((b) => (
                        <option key={b.id} value={String(b.id)}>
                          {b.branch_name.trim()}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">สถานะ</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ShippingStatus }))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                      {(Object.keys(STATUS_META) as ShippingStatus[]).map((st) => (
                        <option key={st} value={st}>
                          {STATUS_META[st].label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION 2: ข้อมูลเพิ่มเติม (ไม่จำเป็น — พับเก็บได้) */}
              {(() => {
                const optionalFilledCount = [
                  form.customer_name.trim(),
                  form.customer_phone.trim(),
                  form.location.trim(),
                  form.map_url.trim(),
                  form.order_no.trim(),
                  form.driver_name.trim(),
                  form.brand_id,
                  form.notes.trim(),
                  form.vehicle_type !== 'company_truck' ? form.vehicle_type : '',
                ].filter(Boolean).length;

                return (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowMoreFields((v) => !v)}
                      className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-100/70 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-extrabold text-slate-700">ข้อมูลเพิ่มเติม</span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-200/80 text-slate-600">
                            ไม่จำเป็น
                          </span>
                          {optionalFilledCount > 0 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700">
                              กรอกแล้ว {optionalFilledCount} ช่อง
                            </span>
                          )}
                        </div>
                        {!showMoreFields && (
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            ลูกค้า, เบอร์โทร, ที่อยู่/แผนที่, รถ/คนขับ, เลขออเดอร์, แบรนด์, ผู้ประสานงาน, หมายเหตุ
                          </p>
                        )}
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-slate-500 shrink-0 transition-transform duration-200 ${
                          showMoreFields ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {showMoreFields && (
                      <div className="px-4 pb-4 pt-2 border-t border-slate-200/80 bg-white/80 space-y-3.5">
                        {/* กลุ่มปลายทาง / ลูกค้า */}
                        <div className="space-y-2.5">
                          <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wide">
                            ลูกค้า / สถานที่จัดส่ง
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-slate-600 mb-1">ชื่อลูกค้า / หน้างาน</label>
                              <input
                                type="text"
                                value={form.customer_name}
                                onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
                                placeholder="ชื่อลูกค้า หรือชื่อโครงการ"
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-600 mb-1">เบอร์ติดต่อลูกค้า</label>
                              <input
                                type="text"
                                value={form.customer_phone}
                                onChange={(e) => setForm((f) => ({ ...f, customer_phone: e.target.value }))}
                                placeholder="081-234-5678"
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              />
                            </div>

                            <div className="sm:col-span-2">
                              <label className="block text-xs font-bold text-slate-600 mb-1">สถานที่ / ที่อยู่จัดส่ง</label>
                              <input
                                type="text"
                                value={form.location}
                                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                                placeholder="ที่อยู่จัดส่ง หรือชื่อหมู่บ้าน/โครงการ"
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              />
                            </div>

                            <div className="sm:col-span-2">
                              <label className="block text-xs font-bold text-slate-600 mb-1">ลิงก์ Google Maps</label>
                              <input
                                type="url"
                                value={form.map_url}
                                onChange={(e) => setForm((f) => ({ ...f, map_url: e.target.value }))}
                                placeholder="https://maps.app.goo.gl/..."
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              />
                            </div>
                          </div>
                        </div>

                        {/* กลุ่มขนส่งและอ้างอิง */}
                        <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
                          <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wide">
                            รถขนส่ง / ข้อมูลอ้างอิง
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-slate-600 mb-1">ประเภทขนส่ง</label>
                              <select
                                value={form.vehicle_type}
                                onChange={(e) =>
                                  setForm((f) => ({ ...f, vehicle_type: e.target.value as ShippingVehicleType }))
                                }
                                className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              >
                                {(Object.keys(VEHICLE_META) as ShippingVehicleType[]).map((v) => (
                                  <option key={v} value={v}>
                                    {VEHICLE_META[v].icon} {VEHICLE_META[v].label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-600 mb-1">คนขับ / ทะเบียนรถ</label>
                              <input
                                type="text"
                                value={form.driver_name}
                                onChange={(e) => setForm((f) => ({ ...f, driver_name: e.target.value }))}
                                placeholder="พี่เอก กข-1234"
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-600 mb-1">เลขออเดอร์ / ใบเสนอราคา</label>
                              <input
                                type="text"
                                value={form.order_no}
                                onChange={(e) => setForm((f) => ({ ...f, order_no: e.target.value }))}
                                placeholder="QT-2026-001"
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-600 mb-1">แบรนด์</label>
                              <select
                                value={form.brand_id}
                                onChange={(e) => setForm((f) => ({ ...f, brand_id: e.target.value }))}
                                className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              >
                                <option value="">— ไม่ระบุ —</option>
                                {brands.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="sm:col-span-2">
                              <label className="block text-xs font-bold text-slate-600 mb-1">ผู้ประสานงาน</label>
                              <select
                                value={form.assignee_id}
                                onChange={(e) => setForm((f) => ({ ...f, assignee_id: e.target.value }))}
                                className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              >
                                <option value="">— ไม่ระบุ —</option>
                                {users.map((u) => {
                                  const label = u.nickname?.trim()
                                    ? `${u.nickname} (${u.first_name})`
                                    : `${u.first_name} ${u.last_name}`.trim() || u.email;
                                  return (
                                    <option key={u.id} value={u.id}>
                                      {label}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>

                            <div className="sm:col-span-2">
                              <label className="block text-xs font-bold text-slate-600 mb-1">หมายเหตุ</label>
                              <textarea
                                rows={2}
                                value={form.notes}
                                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                                placeholder="เช่น ต้องใช้คนยก 4 คน, แลกบัตรหน้าหมู่บ้าน..."
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                {editingItem ? (
                  <button
                    type="button"
                    disabled={saving || deletingId === editingItem.id}
                    onClick={() => handleDelete(editingItem)}
                    className="px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    ลบคิวนี้
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setShowFormModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-bold cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {editingItem ? 'บันทึกการแก้ไข' : 'บันทึกแผนขนส่ง'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-[70] flex items-center gap-2 px-4 py-3 rounded-2xl shadow-xl border text-xs font-bold ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}
