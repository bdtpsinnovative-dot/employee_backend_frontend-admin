import type { User } from '../types';
import type { AppNotification } from '../services/adminApi';
import { avatarUrl } from '../components/tasks/taskUtils';

export interface NotificationSender {
  id?: string;
  name: string;
  avatarUrl: string | null;
  initial: string;
  isUser: boolean;
}

/**
 * Safely parse notification metadata whether it is a JSON string or an object.
 */
export function parseNotificationMetadata(notif: AppNotification): Record<string, any> | null {
  if (!notif.metadata) return null;
  if (typeof notif.metadata === 'string') {
    try {
      return JSON.parse(notif.metadata);
    } catch {
      return null;
    }
  }
  if (typeof notif.metadata === 'object') {
    return notif.metadata;
  }
  return null;
}

/**
 * Identify the person / sender of a notification to display their profile picture.
 * Checks metadata first (future notifications), then matches users by name / nickname
 * from the notification body text (existing past notifications).
 */
export function getNotificationSender(notif: AppNotification, users: User[] = []): NotificationSender {
  const meta = parseNotificationMetadata(notif);

  // 1. Explicit actor_avatar in metadata
  if (meta?.actor_avatar) {
    const rawName = meta.actor_name || notif.title || 'ผู้ใช้';
    return {
      id: meta.actor_id,
      name: rawName,
      avatarUrl: avatarUrl(meta.actor_avatar),
      initial: rawName.trim().charAt(0).toUpperCase() || 'U',
      isUser: true,
    };
  }

  // 2. Explicit actor_id in metadata
  if (meta?.actor_id && users.length > 0) {
    const user = users.find((u) => u.id === meta.actor_id || u.auth_id === meta.actor_id);
    if (user) {
      const name = user.nickname || `${user.first_name} ${user.last_name}`.trim();
      return {
        id: user.id,
        name,
        avatarUrl: avatarUrl(user.avatar_url),
        initial: user.first_name?.trim().charAt(0).toUpperCase() || user.nickname?.trim().charAt(0).toUpperCase() || 'U',
        isUser: true,
      };
    }
  }

  // 3. Explicit actor_name in metadata
  if (meta?.actor_name && users.length > 0) {
    const trimmedActorName = String(meta.actor_name).trim();
    const user = users.find(
      (u) =>
        `${u.first_name} ${u.last_name}`.trim() === trimmedActorName ||
        u.nickname?.trim() === trimmedActorName ||
        u.first_name?.trim() === trimmedActorName
    );
    if (user) {
      return {
        id: user.id,
        name: trimmedActorName,
        avatarUrl: avatarUrl(user.avatar_url),
        initial: user.first_name?.trim().charAt(0).toUpperCase() || user.nickname?.trim().charAt(0).toUpperCase() || 'U',
        isUser: true,
      };
    }
  }

  // 4. Match sender name from notification body (for existing historical notifications)
  if (users.length > 0 && notif.body) {
    const text = notif.body.trim();
    let bestMatch: User | null = null;
    let maxMatchLen = 0;

    // Check startsWith with full name, nickname, first name
    for (const u of users) {
      const fullName = `${u.first_name} ${u.last_name}`.trim();
      const nickname = u.nickname?.trim() || '';
      const firstName = u.first_name?.trim() || '';

      const candidates = [fullName, nickname, firstName].filter((c) => c.length > 1);
      for (const cand of candidates) {
        if (text.startsWith(cand) && cand.length > maxMatchLen) {
          bestMatch = u;
          maxMatchLen = cand.length;
        }
      }
    }

    // Secondary fallback: contains name near beginning
    if (!bestMatch) {
      for (const u of users) {
        const fullName = `${u.first_name} ${u.last_name}`.trim();
        const nickname = u.nickname?.trim() || '';
        if (fullName && text.includes(fullName) && fullName.length > maxMatchLen) {
          bestMatch = u;
          maxMatchLen = fullName.length;
        } else if (nickname && text.includes(nickname) && nickname.length > maxMatchLen) {
          bestMatch = u;
          maxMatchLen = nickname.length;
        }
      }
    }

    if (bestMatch) {
      const name = bestMatch.nickname || `${bestMatch.first_name} ${bestMatch.last_name}`.trim();
      return {
        id: bestMatch.id,
        name,
        avatarUrl: avatarUrl(bestMatch.avatar_url),
        initial: bestMatch.first_name?.trim().charAt(0).toUpperCase() || bestMatch.nickname?.trim().charAt(0).toUpperCase() || 'U',
        isUser: true,
      };
    }
  }

  // 5. System or general notification
  return {
    name: notif.title || 'ระบบ',
    avatarUrl: null,
    initial: notif.title?.trim().charAt(0).toUpperCase() || 'S',
    isUser: false,
  };
}

/**
 * Calculate the target application URL that should open when clicking the notification.
 */
export function getNotificationTargetUrl(notif: AppNotification): string {
  const meta = parseNotificationMetadata(notif);

  // 1. Task with specific list / deliverable
  if (meta?.task_id) {
    if (meta.list_id) {
      return `/tasks/${meta.task_id}?listId=${meta.list_id}`;
    }
    return `/tasks/${meta.task_id}`;
  }

  // 2. Leave / Request
  if (meta?.leave_id || meta?.request_id || notif.type === 'leave' || notif.type === 'leave_request') {
    return '/requests';
  }

  // 3. Attendance
  if (notif.type === 'attendance') {
    return '/history';
  }

  // 4. General task-related
  if (
    notif.type?.includes('task') ||
    notif.title?.includes('งาน') ||
    notif.body?.includes('งาน')
  ) {
    return '/tasks';
  }

  return '/notifications';
}
