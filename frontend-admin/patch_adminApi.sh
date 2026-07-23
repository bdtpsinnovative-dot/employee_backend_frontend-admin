cat << 'INNER_EOF' >> src/services/adminApi.ts

// ────────────────── Projects ──────────────────

export async function fetchProjects(): Promise<import('../types').Project[]> {
  const { data } = await api.get<import('../types').ApiResponse<import('../types').Project[]>>('/api/projects');
  return data.data ?? [];
}

export async function createProject(body: Partial<import('../types').Project>): Promise<import('../types').Project> {
  const { data } = await api.post<import('../types').ApiResponse<import('../types').Project>>('/admin/projects', body);
  return data.data;
}

export async function updateProject(id: string, body: Partial<import('../types').Project>): Promise<import('../types').Project> {
  const { data } = await api.put<import('../types').ApiResponse<import('../types').Project>>(`/admin/projects/${id}`, body);
  return data.data;
}

export async function deleteProject(id: string): Promise<void> {
  await api.delete(`/admin/projects/${id}`);
}

export async function fetchProjectGroups(projectId: string): Promise<import('../types').ProjectGroup[]> {
  const { data } = await api.get<import('../types').ApiResponse<import('../types').ProjectGroup[]>>(`/api/projects/${projectId}/groups`);
  return data.data ?? [];
}

export async function createProjectGroup(projectId: string, name: string, description?: string): Promise<import('../types').ProjectGroup> {
  const { data } = await api.post<import('../types').ApiResponse<import('../types').ProjectGroup>>(`/api/projects/${projectId}/groups`, { name, description });
  return data.data;
}

export async function updateProjectGroup(id: string, body: Partial<import('../types').ProjectGroup>): Promise<void> {
  await api.patch(`/api/project-groups/${id}`, body);
}

export async function deleteProjectGroup(id: string): Promise<void> {
  await api.delete(`/admin/project-groups/${id}`);
}

export async function fetchProjectTasks(projectId: string): Promise<import('../types').AdminTask[]> {
  const { data } = await api.get<import('../types').ApiResponse<import('../types').AdminTask[]>>(`/api/projects/${projectId}/tasks`);
  return data.data ?? [];
}
INNER_EOF
