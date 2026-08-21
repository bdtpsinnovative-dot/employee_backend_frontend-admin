export const queryKeys = {
  me: ['me'] as const,
  users: (scope = 'all') => ['users', scope] as const,
  brands: ['brands'] as const,
  taskCategories: ['task-categories'] as const,
  holidays: (year: number) => ['holidays', year] as const,
  tasks: (scope: 'mine' | 'all' = 'mine') => ['tasks', scope] as const,
  taskEvents: (taskId: string, taskOnly = false) => ['task-events', taskId, taskOnly] as const,
} as const;
