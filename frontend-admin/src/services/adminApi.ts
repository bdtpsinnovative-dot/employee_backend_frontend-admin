import api from '../api';
import type {
  ApiResponse,
  User,
  Attendance,
  LeaveRequest,
  OffsiteRequest,
  Holiday,
  WorkLocation,
  PendingRequestsData,
  HistoryRecord,
  LeaveQuota,
  Brand,
  TaskCategory,
  AdminTask,
  TaskEvent,
} from '../types';

// ────────────────── Users ──────────────────

export async function fetchUsers(): Promise<User[]> {
  const { data } = await api.get<ApiResponse<User[]>>('/admin/users');
  return data.data;
}

export async function approveUser(id: string): Promise<void> {
  await api.patch(`/admin/users/${id}/approve`);
}

export async function updateUser(id: string, body: Partial<User>): Promise<void> {
  await api.put(`/admin/users/${id}`, body);
}

export async function disableUser(id: string): Promise<void> {
  await api.patch(`/admin/users/${id}/disable`);
}

export async function unbindDevice(id: string): Promise<void> {
  await api.patch(`/admin/users/${id}/unbind-device`);
}

// ────────────────── Requests (Leave + Offsite) ──────────────────

export async function fetchPendingRequests(): Promise<PendingRequestsData> {
  const { data } = await api.get<ApiResponse<PendingRequestsData>>('/admin/requests/pending');
  return data.data;
}

export async function updateLeaveStatus(id: string, status: 'approved' | 'rejected'): Promise<void> {
  await api.patch(`/admin/leaves/${id}/status`, { status });
}

export async function updateOffsiteStatus(id: string, status: 'approved' | 'rejected'): Promise<void> {
  await api.patch(`/admin/offsite/${id}/status`, { status });
}

// ────────────────── Attendance ──────────────────

export async function fetchAllAttendance(date: string): Promise<Attendance[]> {
  const { data } = await api.get<ApiResponse<Attendance[]>>('/admin/attendance', {
    params: { date },
  });
  return data.data ?? [];
}

export async function fetchMonthlyHistory(month: string): Promise<HistoryRecord[]> {
  const { data } = await api.get<ApiResponse<HistoryRecord[]>>('/admin/history/monthly', {
    params: { month },
  });
  return data.data ?? [];
}

export async function manualAttendance(body: {
  user_id: string;
  date: string;
  status: string;
}): Promise<Attendance> {
  const { data } = await api.post<ApiResponse<Attendance>>('/admin/attendance/manual', body);
  return data.data;
}

// ────────────────── Holidays ──────────────────

export async function fetchHolidays(year: number): Promise<Holiday[]> {
  const { data } = await api.get<ApiResponse<Holiday[]>>('/api/holidays', {
    params: { year },
  });
  return data.data ?? [];
}

export async function createHoliday(body: {
  date: string;
  name: string;
  num_days?: number;
}): Promise<void> {
  await api.post('/admin/holidays', body);
}

export async function deleteHoliday(id: string): Promise<void> {
  await api.delete(`/admin/holidays/${id}`);
}

// ────────────────── Locations ──────────────────

export async function fetchLocations(): Promise<WorkLocation[]> {
  const { data } = await api.get<ApiResponse<WorkLocation[]>>('/admin/locations');
  return data.data ?? [];
}

export async function createLocation(body: {
  name: string;
  latitude: number;
  longitude: number;
  radius_m?: number;
}): Promise<WorkLocation> {
  const { data } = await api.post<ApiResponse<WorkLocation>>('/admin/locations', body);
  return data.data;
}

export async function deleteLocation(id: string): Promise<void> {
  await api.delete(`/admin/locations/${id}`);
}

// ────────────────── User (self) ──────────────────

export async function fetchMe(): Promise<User> {
  const { data } = await api.get<ApiResponse<User>>('/api/users/me');
  return data.data;
}

// ────────────────── Employee History (Admin) ──────────────────

export async function fetchUserHistory(id: string): Promise<{
  attendance: Attendance[];
  leaves: LeaveRequest[];
  offsite: OffsiteRequest[];
}> {
  const { data } = await api.get<ApiResponse<{
    attendance: Attendance[];
    leaves: LeaveRequest[];
    offsite: OffsiteRequest[];
  }>>(`/admin/users/${id}/history`);
  return data.data;
}

// ────────────────── All Requests (for History page) ──────────────────

export async function fetchAllRequests(): Promise<PendingRequestsData> {
  const { data } = await api.get<ApiResponse<PendingRequestsData>>('/admin/requests/all');
  return data.data;
}

// ────────────────── Leave Quotas (Admin) ──────────────────

export async function fetchUserQuota(id: string, year: number): Promise<LeaveQuota> {
  const { data } = await api.get<ApiResponse<LeaveQuota>>(`/admin/users/${id}/quota`, {
    params: { year },
  });
  return data.data;
}

export async function updateUserQuota(
  id: string,
  year: number,
  body: { sick_leave: number; personal_leave: number; annual_leave: number }
): Promise<void> {
  await api.put(`/admin/users/${id}/quota`, body, {
    params: { year },
  });
}

// ────────────────── Settings (Admin) ──────────────────

export async function fetchCheckInMode(): Promise<string> {
  const { data } = await api.get<{ ok: boolean; checkin_mode: string }>('/api/settings/checkin-mode');
  return data.checkin_mode;
}

export async function updateCheckInMode(mode: 'face' | 'selfie'): Promise<void> {
  await api.put('/admin/settings/checkin-mode', { checkin_mode: mode });
}

// ────────────────── Brands (Admin) ──────────────────

export async function fetchBrands(): Promise<Brand[]> {
  const { data } = await api.get<ApiResponse<Brand[]>>('/admin/brands');
  return data.data ?? [];
}

export async function createBrand(name: string): Promise<Brand> {
  const { data } = await api.post<ApiResponse<Brand>>('/admin/brands', { name });
  return data.data;
}

export async function deleteBrand(id: string): Promise<void> {
  await api.delete(`/admin/brands/${id}`);
}

// ────────────────── Task Categories (Admin) ──────────────────

export async function fetchTaskCategories(): Promise<TaskCategory[]> {
  const { data } = await api.get<ApiResponse<TaskCategory[]>>('/admin/task-categories');
  return data.data ?? [];
}

export async function createTaskCategory(name: string): Promise<TaskCategory> {
  const { data } = await api.post<ApiResponse<TaskCategory>>('/admin/task-categories', { name });
  return data.data;
}

export async function deleteTaskCategory(id: string): Promise<void> {
  await api.delete(`/admin/task-categories/${id}`);
}

// ────────────────── Admin Tasks ──────────────────

export async function fetchAdminTasks(): Promise<AdminTask[]> {
  const { data } = await api.get<ApiResponse<AdminTask[]>>('/admin/tasks');
  return data.data ?? [];
}

export async function createAdminTask(body: {
  assigned_to?: string;
  assignee_ids?: string[];
  title: string;
  description?: string;
  due_date: string;
  brand_id?: string;
  category_id?: string;
  sub_items?: string[];
}): Promise<AdminTask> {
  const { data } = await api.post<ApiResponse<AdminTask>>('/admin/tasks', body);
  return data.data;
}

export async function updateAdminTaskStatus(id: string, status: 'pending' | 'in_progress' | 'completed'): Promise<void> {
  await api.patch(`/api/tasks/${id}/status`, { status });
}

export async function deleteAdminTask(id: string): Promise<void> {
  await api.delete(`/admin/tasks/${id}`);
}

export async function fetchTaskEvents(taskId: string): Promise<TaskEvent[]> {
  const { data } = await api.get<ApiResponse<TaskEvent[]>>(`/api/tasks/${taskId}/events`);
  return data.data ?? [];
}

export async function fetchAllTaskEvents(): Promise<TaskEvent[]> {
  const { data } = await api.get<ApiResponse<TaskEvent[]>>('/admin/tasks/events');
  return data.data ?? [];
}

export async function addTaskComment(taskId: string, content: string): Promise<TaskEvent> {
  const { data } = await api.post<ApiResponse<TaskEvent>>(`/api/tasks/${taskId}/events`, { content });
  return data.data;
}
