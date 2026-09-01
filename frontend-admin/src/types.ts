// TypeScript interfaces — map ตรงกับ backend domain models

export interface User {
  id: string;
  auth_id: string;
  email: string;
  first_name: string;
  last_name: string;
  nickname?: string;
  department: string;
  team_id?: string | null;
  position_id?: string | null;
  team_name?: string;
  team_short_name?: string;
  // Compatibility fields returned by the API while other clients migrate.
  position: string;
  team: string;
  role: 'employee' | 'admin';
  status: 'pending' | 'active' | 'disabled';
  device_id?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  first_name: string;
  last_name: string;
  nickname?: string;
  avatar_url?: string;
  team?: string;
  position?: string;
}

export interface TeamMembersData {
  team_assigned: boolean;
  members: TeamMember[];
}

export interface Team {
  id: string;
  name: string;
  short_name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: string;
  team_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
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
  user_id?: string;
  date: string;
  user_name: string;
  email: string;
  avatar_url?: string;
  department: string;
  position: string;
  status: string;
  type: string;
  reason: string;
  check_in_at?: string;
  check_out_at?: string;
  check_in_photo?: string;
  check_out_photo?: string;
  check_in_lat?: number;
  check_in_lng?: number;
  check_out_lat?: number;
  check_out_lng?: number;
  location_name?: string;
  check_out_location_name?: string;
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

export interface BackupJob {
  id: string;
  operation: 'backup' | 'restore';
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  schema_version: string;
  source_backup_id?: string;
  triggered_by?: string;
  file_count: number;
  database_size_bytes: number;
  note: string;
  table_stats?: BackupTableStat[];
  description: string;
  error_message?: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
}

export interface BackupTableStat {
  name: string;
  snapshot_rows: number;
  current_rows: number;
}

export interface BackupConfig {
  restore_enabled: boolean;
  backup_enabled: boolean;
  tables: string[];
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

export interface LeaveQuota {
  id: string;
  user_id: string;
  year: number;
  sick_leave: number;
  personal_leave: number;
  annual_leave: number;
  created_at: string;
  updated_at: string;
}

export interface Brand {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  responsible_user_ids?: string[];
  responsibilities?: BrandResponsibility[];
}

export type BrandResponsibilityType = 'bd' | 'mkt' | 'graphic';

export interface BrandResponsibility {
  user_id: string;
  responsibility_type: BrandResponsibilityType;
}

export interface TaskCategory {
  id: string;
  name: string;
  created_at: string;
}

export interface TaskSubItem {
  id: string;
  task_id: string;
  title: string;
  is_done: boolean;
  sort_order: number;
  created_at: string;
  start_date?: string;
  status?: 'pending' | 'in_progress' | 'completed';
  admin_comment?: string;
  verification_notes?: string;
  phase?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  notes?: string;
  link_url?: string;
  attachment_url?: string;
  due_date?: string;
  assigned_to?: string;
}

export interface TaskCard {
  id: string;
  list_id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  sort_order: number;
  created_at: string;
  start_date?: string;
  due_date?: string;
  admin_comment?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string;
  sub_items?: TaskSubItem[];
  assignee_ids?: string[];
  attachments?: any[];
}

export interface TaskList {
  id: string;
  task_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  description?: string;
  start_date?: string;
  due_date?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  status?: 'waiting' | 'pending' | 'in_progress' | 'in_review' | 'completed' | 'revision';
  admin_comment?: string;
  attachments?: { name: string; url: string; type: 'file' | 'link' }[];
  cards?: TaskCard[];
  assignee_ids?: string[];
  deleted_at?: string;
  project_name?: string;
  task_title?: string;
  brand_id?: string;
  brand_name?: string;
  category_id?: string;
}

export interface TaskSubmission {
  id: string;
  task_id: string;
  submitted_by: string;
  url: string;
  version: number;
  status: 'submitted' | 'approved' | 'revision_requested' | 'superseded';
  submitted_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_note?: string;
  created_at: string;
}

export interface AdminTask {
  id: string;
  assigned_to: string;
  title: string;
  description: string;
  due_date: string;
  status: 'pending' | 'in_progress' | 'in_review' | 'completed';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigned_by?: string;
  brand_id?: string;
  category_id?: string;
  attachment_url?: string;
  created_at: string;
  
  // Joined Fields
  assigned_to_name?: string;
  assigned_by_name?: string;
  card_total?: number;
  card_done?: number;
  
  // Sub-items
  sub_items?: TaskSubItem[];
  assignee_ids?: string[];
  lists?: TaskList[];

  // Submissions
  needs_revision?: boolean;
  completed_at?: string;
  submission_count?: number;
  latest_submission?: TaskSubmission;
  deleted_at?: string;
  is_starred?: boolean;
}

export interface TaskEvent {
  id: string;
  task_id?: string;
  user_id?: string;
  event_type: 'comment' | 'system';
  action: string;
  content?: string;
  created_at: string;
  user_first_name?: string;
  user_last_name?: string;
  user_avatar_url?: string;
  task_title?: string;
  // Optional scope fields returned by the board-aware audit log API.
  board_id?: string;
  list_id?: string;
  card_id?: string;
  sub_item_id?: string;
  list_name?: string;
  card_title?: string;
  entity_type?: 'task' | 'board' | 'list' | 'card' | 'sub_item';
  entity_id?: string;
}
