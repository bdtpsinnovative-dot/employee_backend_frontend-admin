// TypeScript interfaces — map ตรงกับ backend domain models

export interface User {
  id: string;
  auth_id: string;
  email: string;
  first_name: string;
  last_name: string;
  department: string;
  position: string;
  role: 'employee' | 'admin';
  status: 'pending' | 'active' | 'disabled';
  device_id?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Attendance {
  id: string;
  user_id: string;
  date: string;
  check_in_at?: string;
  check_out_at?: string;
  status: 'on_time' | 'late' | 'no_record' | 'offsite'
    | 'sick_leave_full' | 'sick_leave_morning' | 'sick_leave_afternoon'
    | 'personal_leave_full' | 'personal_leave_morning' | 'personal_leave_afternoon'
    | 'annual_leave' | 'shift_swap' | 'unknown';
  check_in_lat?: number;
  check_in_lng?: number;
  check_out_lat?: number;
  check_out_lng?: number;
  check_in_photo?: string;
  check_out_photo?: string;
  location_id?: string;
  created_at: string;
}

export interface LeaveRequest {
  id: string;
  user_id: string;
  date: string;
  leave_type: string; // ลาป่วย, ลากิจ, สลับวันหยุด, ทำงานวันหยุด
  duration: string;   // เต็มวัน, ครึ่งวันเช้า, ครึ่งวันบ่าย
  swap_date?: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  medical_cert_url?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
}

export interface OffsiteRequest {
  id: string;
  user_id: string;
  date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
}

export interface HistoryRecord {
  date: string;
  user_name: string;
  email: string;
  status: string;
  type: string;
  check_in_at?: string;
  check_out_at?: string;
  created_at: string;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
  num_days: number;
  created_at: string;
}

export interface WorkLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  is_active: boolean;
  created_at: string;
}

// API response wrapper — backend ส่ง { ok: true, data: ... }
export interface ApiResponse<T> {
  ok: boolean;
  data: T;
  message?: string;
}

export interface PendingRequestsData {
  leaves: LeaveRequest[];
  offsite: OffsiteRequest[];
}
