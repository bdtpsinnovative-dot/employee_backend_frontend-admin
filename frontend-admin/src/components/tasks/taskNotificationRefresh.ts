interface TaskNotificationLike {
  id: string;
  metadata?: unknown;
}

function parseNotificationMetadata(metadata: unknown): Record<string, unknown> | null {
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }

  return metadata && typeof metadata === 'object'
    ? metadata as Record<string, unknown>
    : null;
}

/**
 * Produces a stable signal for server-side list changes affecting one project.
 * Read/unread state is intentionally excluded so opening the notification UI
 * does not trigger another Trello request.
 */
export function getTaskNotificationRefreshKey(
  notifications: TaskNotificationLike[],
  taskId: string,
): string {
  return notifications
    .filter((notification) => {
      const metadata = parseNotificationMetadata(notification.metadata);
      if (!metadata || !metadata.list_id) return false;
      return taskId === 'daily' || metadata.task_id === taskId;
    })
    .map((notification) => notification.id)
    .sort()
    .join('|');
}
