import api from '../api';
import { cachedQuery, invalidateQuery, invalidateQueryPrefix } from '../lib/queryCache';
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
  BrandResponsibility,
  TaskCategory,
  AdminTask,
  TaskEvent,
  TaskSubItem,
  TaskList,
  BackupJob,
  Team,
  BackupConfig,
  Position,
  TeamMembersData,
} from '../types';

// ────────────────── Backup & Restore ──────────────────

export async function fetchBackupJobs(): Promise<BackupJob[]> {
  const { data } = await api.get<ApiResponse<BackupJob[]>>('/admin/backups');
  return data.data ?? [];
}

export async function fetchBackupConfig(): Promise<BackupConfig> {
  const { data } = await api.get<BackupConfig & { ok: boolean }>('/admin/backups/config');
  return data;
}

export async function createBackup(note: string): Promise<BackupJob> {
	const { data } = await api.post<ApiResponse<BackupJob>>('/admin/backups', { note });
  return data.data;
}

export async function restoreBackup(id: string, tables: string[]): Promise<BackupJob> {
  const { data } = await api.post<ApiResponse<BackupJob>>(`/admin/backups/${id}/restore`, { tables });
  return data.data;
}

export async function fetchBackupJob(id: string): Promise<BackupJob> {
  const { data } = await api.get<ApiResponse<BackupJob>>(`/admin/backups/${id}`);
  return data.data;
}

// ────────────────── Users ──────────────────

export async function fetchUsers(ids?: string[]): Promise<User[]> {
  const cacheKey = `users:${ids?.slice().sort().join(',') ?? 'all'}`;
  return cachedQuery(cacheKey, 0, async () => {
    const params = ids && ids.length > 0 ? { ids: ids.join(',') } : undefined;
    try {
      const { data } = await api.get<ApiResponse<User[]>>('/admin/users', { params });
      return data.data;
    } catch (err: any) {
      if (err.message?.includes('คุณไม่มีสิทธิ์') || err.response?.status === 403) {
        const { data } = await api.get<ApiResponse<User[]>>('/api/users', { params });
        return data.data;
      }
      throw err;
    }
  });
}

export async function fetchActiveUsers(): Promise<User[]> {
  const { data } = await api.get<ApiResponse<User[]>>('/api/users/active');
  return data.data;
}

export async function fetchTeamMembers(): Promise<TeamMembersData> {
  const { data } = await api.get<ApiResponse<TeamMembersData>>('/api/users/team-members');
  return data.data ?? { team_assigned: false, members: [] };
}

export async function approveUser(id: string): Promise<void> {
  await api.patch(`/admin/users/${id}/approve`);
}

export async function updateUser(id: string, body: Partial<User>): Promise<void> {
  await api.put(`/admin/users/${id}`, body);
}

export async function fetchProfileTeams(): Promise<string[]> {
  const { data } = await api.get<ApiResponse<string[]>>('/admin/settings/profile-teams');
  return data.data ?? [];
}

export async function addProfileTeam(name: string): Promise<string[]> {
  const { data } = await api.post<ApiResponse<string[]>>('/admin/settings/profile-teams', { name });
  return data.data ?? [];
}

export async function fetchTeams(): Promise<Team[]> {
  const { data } = await api.get<ApiResponse<Team[]>>('/admin/settings/teams');
  return data.data ?? [];
}

export async function createTeam(name: string, shortName: string): Promise<Team> {
  const { data } = await api.post<ApiResponse<Team>>('/admin/settings/teams', {
    name,
    short_name: shortName,
  });
  return data.data;
}

export async function fetchPositions(teamId?: string): Promise<Position[]> {
  const { data } = await api.get<ApiResponse<Position[]>>('/admin/settings/positions', {
    params: teamId ? { team_id: teamId } : undefined,
  });
  return data.data ?? [];
}

export async function createPosition(teamId: string, name: string): Promise<Position> {
  const { data } = await api.post<ApiResponse<Position>>('/admin/settings/positions', {
    team_id: teamId,
    name,
  });
  return data.data;
}

export async function disableUser(id: string): Promise<void> {
  await api.patch(`/admin/users/${id}/disable`);
}

export async function unbindDevice(id: string): Promise<void> {
  await api.patch(`/admin/users/${id}/unbind-device`);
}

// ────────────────── Requests (Leave + Offsite) ──────────────────

export async function fetchPendingRequests(): Promise<PendingRequestsData> {
  return cachedQuery('pending-requests', 5_000, async () => {
    const { data } = await api.get<ApiResponse<PendingRequestsData>>('/admin/requests/pending');
    return data.data;
  });
}

export async function updateLeaveStatus(id: string, status: 'approved' | 'rejected'): Promise<void> {
  await api.patch(`/admin/leaves/${id}/status`, { status });
  invalidateQuery('pending-requests');
}

export async function updateOffsiteStatus(id: string, status: 'approved' | 'rejected'): Promise<void> {
  await api.patch(`/admin/offsite/${id}/status`, { status });
  invalidateQuery('pending-requests');
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

/** Fetch the signed-in employee's attendance history for one month. */
export async function fetchAttendanceHistory(year: number, month: number): Promise<Attendance[]> {
  const { data } = await api.get<ApiResponse<Attendance[]>>('/api/attendance/history', {
    params: { year, month },
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
  return cachedQuery(`holidays:${year}`, 5 * 60_000, async () => {
    const { data } = await api.get<ApiResponse<Holiday[]>>('/api/holidays', {
      params: { year },
    });
    return data.data ?? [];
  });
}

export async function createHoliday(body: {
  date: string;
  name: string;
  num_days?: number;
}): Promise<void> {
  await api.post('/admin/holidays', body);
  invalidateQueryPrefix('holidays:');
}

export async function deleteHoliday(id: string): Promise<void> {
  await api.delete(`/admin/holidays/${id}`);
  invalidateQueryPrefix('holidays:');
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
  return cachedQuery('me', 60_000, async () => {
    const { data } = await api.get<ApiResponse<User>>('/api/users/me');
    return data.data;
  });
}

/** Fetch the signed-in employee's leave requests (all statuses). */
export async function fetchMyLeaves(): Promise<LeaveRequest[]> {
  const { data } = await api.get<ApiResponse<LeaveRequest[]>>('/api/leaves');
  return data.data ?? [];
}

/** Fetch the signed-in employee's offsite requests (all statuses). */
export async function fetchMyOffsite(): Promise<OffsiteRequest[]> {
  const { data } = await api.get<ApiResponse<OffsiteRequest[]>>('/api/offsite');
  return data.data ?? [];
}

export async function updateMyProfile(body: {
  first_name: string;
  last_name: string;
  nickname: string;
  avatar_url: string;
  email: string;
}): Promise<void> {
  await api.put('/api/users/me/profile/info', body);
  invalidateQuery('me');
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
  return cachedQuery('brands', 5 * 60_000, async () => {
    const { data } = await api.get<ApiResponse<Brand[]>>('/api/brands');
    return data.data ?? [];
  });
}

export async function createBrand(name: string): Promise<Brand> {
  const { data } = await api.post<ApiResponse<Brand>>('/admin/brands', { name });
  invalidateQuery('brands');
  return data.data;
}

export async function deleteBrand(id: string): Promise<void> {
  await api.delete(`/admin/brands/${id}`);
  invalidateQuery('brands');
}

export async function reorderBrands(brandIds: string[]): Promise<void> {
  await api.put('/admin/brands/order', { brand_ids: brandIds });
  invalidateQuery('brands');
}

export async function updateBrandResponsibilities(
  id: string,
  responsibilities: BrandResponsibility[],
): Promise<{ responsibleUserIds: string[]; responsibilities: BrandResponsibility[] }> {
  const { data } = await api.put<ApiResponse<{
    brand_id: string;
    responsible_user_ids: string[];
    responsibilities: BrandResponsibility[];
  }>>(
    `/admin/brands/${id}/responsibilities`,
    { responsibilities },
  );
  invalidateQuery('brands');
  return {
    responsibleUserIds: data.data?.responsible_user_ids ?? [],
    responsibilities: data.data?.responsibilities ?? [],
  };
}

// ────────────────── Task Categories (Admin) ──────────────────

export async function fetchTaskCategories(): Promise<TaskCategory[]> {
  return cachedQuery('task-categories', 0, async () => {
    const { data } = await api.get<ApiResponse<TaskCategory[]>>('/api/task-categories');
    return data.data ?? [];
  });
}

export async function createTaskCategory(name: string): Promise<TaskCategory> {
  const { data } = await api.post<ApiResponse<TaskCategory>>('/admin/task-categories', { name });
  return data.data;
}

export async function deleteTaskCategory(id: string): Promise<void> {
  await api.delete(`/admin/task-categories/${id}`);
}

// ────────────────── Admin Tasks ──────────────────

export async function fetchAdminTasks(scope: 'mine' | 'all' = 'mine'): Promise<AdminTask[]> {
  // The task page remains scoped to work owned by or assigned to the signed-in user.
  // Calendar admins can explicitly request the existing admin-wide read endpoint.
  return cachedQuery(`tasks:${scope}`, 0, async () => {
    if (scope === 'all') {
      const { data } = await api.get<ApiResponse<AdminTask[]>>('/admin/tasks');
      return data.data ?? [];
    }

    const { data } = await api.get<ApiResponse<AdminTask[]>>('/api/tasks');
    return data.data ?? [];
  });
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
  priority?: string;
  status?: string;
}): Promise<AdminTask> {
  try {
    const { data } = await api.post<ApiResponse<AdminTask>>('/admin/tasks', body);
    return data.data;
  } catch (err: any) {
    if (err.message?.includes('คุณไม่มีสิทธิ์') || err.response?.status === 403) {
      const { data } = await api.post<ApiResponse<AdminTask>>('/api/tasks', body);
      return data.data;
    }
    throw err;
  }
}

export async function fetchTaskSubItems(taskId: string): Promise<TaskSubItem[]> {
  try {
    const { data } = await api.get<ApiResponse<TaskSubItem[]>>(`/admin/tasks/${taskId}/sub-items`);
    return data.data ?? [];
  } catch (err: any) {
    if (err.message?.includes('คุณไม่มีสิทธิ์') || err.response?.status === 403) {
      const { data } = await api.get<ApiResponse<TaskSubItem[]>>(`/api/tasks/${taskId}/sub-items`);
      return data.data ?? [];
    }
    throw err;
  }
}

export async function updateAdminTask(id: string, body: {
  assigned_to?: string;
  assignee_ids?: string[];
  title: string;
  description?: string;
  due_date: string;
  brand_id?: string;
  category_id?: string;
  priority?: string;
  status?: string;
}): Promise<AdminTask> {
  const { data } = await api.put<ApiResponse<AdminTask>>(`/api/tasks/${id}`, body);
  return data.data;
}

export async function updateAdminTaskStatus(id: string, status: 'pending' | 'in_progress' | 'in_review' | 'completed'): Promise<void> {
  await api.patch(`/api/tasks/${id}/status`, { status });
}

export async function approveTask(id: string): Promise<void> {
  await api.post(`/api/tasks/${id}/approve`);
}

export async function createTaskSubItem(taskId: string, title: string, dueDate?: string): Promise<any> {
  const { data } = await api.post<ApiResponse<any>>(`/api/tasks/${taskId}/sub-items`, { title, due_date: dueDate });
  return data.data;
}

export async function createTaskCard(listId: string, body: { title: string; priority?: string; due_date?: string; assignee_ids?: string[] }): Promise<any> {
  const { data } = await api.post<ApiResponse<any>>(`/api/tasks/lists/${listId}/cards`, body);
  return data.data;
}

export async function deleteTaskCard(cardId: string): Promise<void> {
  await api.delete(`/api/tasks/cards/${cardId}`);
}

export async function updateTaskCard(cardId: string, body: {
  title?: string;
  description?: string;
  due_date?: string;
  priority?: string;
  status?: string;
  admin_comment?: string;
  assignee_ids?: string[];
  link_url?: string;
  attachment_url?: string;
}): Promise<any> {
  const { data } = await api.patch<ApiResponse<any>>(`/api/tasks/cards/${cardId}`, body);
  return data.data;
}

export async function createTaskList(taskId: string, body: {
  name: string;
  description?: string;
  due_date?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  status?: 'waiting' | 'pending' | 'in_progress' | 'in_review' | 'completed' | 'revision';
  admin_comment?: string;
  attachments?: { name: string; url: string; type: 'file' | 'link' }[];
  assignee_ids?: string[];
}): Promise<any> {
  const { data } = await api.post<ApiResponse<any>>(`/api/tasks/${taskId}/lists`, body);
  return data.data;
}

export async function deleteTaskList(listId: string): Promise<void> {
  await api.delete(`/api/tasks/lists/${listId}`);
}

export async function updateTaskList(listId: string, body: {
  name?: string;
  description?: string;
  due_date?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  status?: 'waiting' | 'pending' | 'in_progress' | 'in_review' | 'completed' | 'revision';
  admin_comment?: string;
  attachments?: { name: string; url: string; type: 'file' | 'link' }[];
  assignee_ids?: string[];
}): Promise<any> {
  const { data } = await api.patch<ApiResponse<any>>(`/api/tasks/lists/${listId}`, body);
  return data.data;
}

export async function toggleTaskSubItem(subItemId: string, isDone?: boolean): Promise<any> {
  const body = isDone !== undefined ? { is_done: isDone } : undefined;
  const { data } = await api.patch<ApiResponse<any>>(`/api/tasks/sub-items/${subItemId}/toggle`, body);
  return data.data;
}

export async function deleteTaskSubItem(subItemId: string): Promise<void> {
  await api.delete(`/api/tasks/sub-items/${subItemId}`);
}

export async function updateTaskSubItemNote(subItemId: string, adminComment: string): Promise<void> {
  await api.patch(`/api/tasks/sub-items/${subItemId}/detail`, {
    admin_comment: adminComment,
  });
}

export function isRealSubItem(sub: any): boolean {
  if (!sub) return false;
  return Boolean(sub.id && !String(sub.id).startsWith('demo-') && !String(sub.id).startsWith('mock-'));
}

export async function updateTaskSubItemDetail(
  subItemId: string,
  body: {
    title: string;
    start_date?: string;
    due_date?: string;
    link_url?: string;
    attachment_url?: string;
    verification_notes?: string;
    admin_comment?: string;
  }
): Promise<void> {
  await api.patch(`/api/tasks/sub-items/${subItemId}/detail`, body);
}

export async function deleteAdminTask(id: string): Promise<void> {
  await api.delete(`/api/tasks/${id}`);
}

export async function fetchTaskEvents(
  taskId: string,
  scope?: { listId?: string; cardId?: string; taskOnly?: boolean },
): Promise<TaskEvent[]> {
  const { data } = await api.get<ApiResponse<TaskEvent[]>>(`/api/tasks/${taskId}/events`, {
    params: {
      list_id: scope?.listId,
      card_id: scope?.cardId,
      task_only: scope?.taskOnly ? 'true' : undefined,
    },
  });
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

export async function approveSubmission(taskId: string, submissionId: string): Promise<void> {
  await api.post(`/admin/tasks/${taskId}/submissions/${submissionId}/approve`);
}

export async function requestRevision(taskId: string, submissionId: string, note: string): Promise<void> {
  await api.post(`/admin/tasks/${taskId}/submissions/${submissionId}/request-revision`, { note });
}

export async function fetchTaskTrello(taskId: string): Promise<TaskList[]> {
  const { data } = await api.get<ApiResponse<TaskList[]>>(`/api/tasks/${taskId}/trello`);
  return data.data ?? [];
}

export async function fetchDailyTaskLists(): Promise<TaskList[]> {
  const { data } = await api.get<ApiResponse<TaskList[]>>('/api/tasks/daily-lists');
  return data.data ?? [];
}

export async function createCardSubItem(cardId: string, title: string): Promise<any> {
  const { data } = await api.post<ApiResponse<any>>(`/api/tasks/cards/${cardId}/sub-items`, { title });
  return data.data;
}

export async function createCardAttachment(cardId: string, body: { name: string; url: string; type: 'image' | 'file' | 'link' }): Promise<any> {
  const { data } = await api.post<ApiResponse<any>>(`/api/tasks/cards/${cardId}/attachments`, body);
  return data.data;
}

export async function deleteCardAttachment(attachmentId: string): Promise<void> {
  await api.delete(`/api/tasks/cards/attachments/${attachmentId}`);
}

export async function updateCardAttachment(attachmentId: string, body: { name: string; url: string }): Promise<void> {
  await api.patch(`/api/tasks/cards/attachments/${attachmentId}`, body);
}

export async function createSubItemVerification(subItemId: string, body: { status: 'pass' | 'fail'; verification_notes?: string; admin_comment?: string }): Promise<any> {
  const { data } = await api.post<ApiResponse<any>>(`/api/tasks/sub-items/${subItemId}/verifications`, body);
  return data.data;
}

interface UploadFileOptions {
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

export async function uploadFile(file: File, options: UploadFileOptions = {}): Promise<{ ok: boolean; url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post('/api/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    signal: options.signal,
    onUploadProgress: (event) => {
      if (!options.onProgress || !event.total) return;
      const progress = Math.min(100, Math.round((event.loaded * 100) / event.total));
      options.onProgress(progress);
    },
  });
  return data;
}

export async function fetchTrashTasks(): Promise<AdminTask[]> {
  const { data } = await api.get<ApiResponse<AdminTask[]>>('/api/tasks/trash');
  return data.data ?? [];
}

export async function restoreTask(id: string): Promise<void> {
  await api.post(`/api/tasks/${id}/restore`);
}

export async function fetchTrashTaskLists(taskId: string): Promise<TaskList[]> {
  const { data } = await api.get<ApiResponse<TaskList[]>>(`/api/tasks/${taskId}/trello/trash`);
  return data.data ?? [];
}

export async function restoreTaskList(listId: string): Promise<void> {
  await api.post(`/api/tasks/lists/${listId}/restore`);
}

// ─── Notifications ─────────────────────────────────────────────────────────

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
  metadata?: any;
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  const { data } = await api.get<ApiResponse<AppNotification[]>>('/api/notifications');
  return data.data ?? [];
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.patch(`/api/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.patch('/api/notifications/read-all');
}

export async function toggleStarTask(taskId: string, isStarred: boolean): Promise<any> {
  const { data } = await api.post<ApiResponse<any>>(`/api/tasks/${taskId}/star`, { is_starred: isStarred });
  return data;
}
