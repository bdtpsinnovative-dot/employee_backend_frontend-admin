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
        initial: (user.nickname?.trim() || user.first_name?.trim() || 'U').charAt(0).toUpperCase(),
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
        name: user.nickname || trimmedActorName,
        avatarUrl: avatarUrl(user.avatar_url),
        initial: (user.nickname?.trim() || user.first_name?.trim() || 'U').charAt(0).toUpperCase(),
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
        initial: (bestMatch.nickname?.trim() || bestMatch.first_name?.trim() || 'U').charAt(0).toUpperCase(),
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

/**
 * Format notification body text to prefer displaying the user's nickname instead of their real/full name.
 * Handles both full names (e.g. "Nattapong Worapimrat") and first names (e.g. "Nattapong").
 */
export function formatNotificationBody(body: string, users: User[] = []): string {
  if (!body || users.length === 0) return body;

  let formatted = body;
  for (const u of users) {
    const nickname = u.nickname?.trim();
    if (!nickname) continue;

    const fullName = `${u.first_name} ${u.last_name}`.trim();
    const firstName = u.first_name?.trim();

    // 1. Replace full name first (e.g. "Nattapong Worapimrat" -> "ปอร์")
    if (fullName && fullName.length > 2 && formatted.includes(fullName)) {
      formatted = formatted.split(fullName).join(nickname);
    }
    // 2. Replace first name if at start of string or followed by space/colon
    else if (firstName && firstName.length > 2) {
      if (formatted.startsWith(firstName + ' ')) {
        formatted = nickname + ' ' + formatted.slice(firstName.length + 1);
      } else if (formatted.startsWith(firstName + ':')) {
        formatted = nickname + ':' + formatted.slice(firstName.length + 1);
      }
    }
  }

  return formatted;
}

export type NotificationActionType =
  | 'assignment'
  | 'attachment'
  | 'status'
  | 'comment'
  | 'revision'
  | 'review'
  | 'leave'
  | 'attendance'
  | 'system';

export interface NotificationActionInfo {
  type: NotificationActionType;
  label: string;
  badgeBg: string;
  badgeColor: string;
  fallbackBg: string;
  fallbackColor: string;
  iconName: 'clipboard-check' | 'paperclip' | 'check-circle' | 'message-square' | 'rotate-ccw' | 'file-search' | 'calendar' | 'clock' | 'bell';
}

/**
 * Determine the specific action type, appropriate icon, and color schemes for a notification.
 */
export function getNotificationAction(notif: AppNotification): NotificationActionInfo {
  const title = notif.title || '';
  const body = notif.body || '';
  const meta = parseNotificationMetadata(notif);
  const notifType = notif.type || '';
  const metaType = meta?.type || '';

  // 1. Assignment (มอบหมายงาน)
  if (
    title.includes('มอบหมาย') ||
    body.includes('ได้รับมอบหมาย') ||
    body.includes('เพิ่มคุณเป็นผู้รับผิดชอบ') ||
    body.includes('ถูกมอบหมาย') ||
    metaType === 'task_assignment' ||
    metaType === 'task_list_assignment' ||
    metaType === 'card_assigned' ||
    metaType === 'card_assignment'
  ) {
    return {
      type: 'assignment',
      label: 'มอบหมายงาน',
      badgeBg: 'bg-indigo-600',
      badgeColor: 'text-white',
      fallbackBg: 'bg-gradient-to-tr from-indigo-600 to-violet-600',
      fallbackColor: 'text-white',
      iconName: 'clipboard-check',
    };
  }

  // 2. Revision (ส่งแก้ไข)
  if (
    title.includes('ส่งแก้ไข') ||
    title.includes('แก้ไขงานย่อย') ||
    (body.includes('ส่งงานย่อย') && body.includes('ให้แก้ไข'))
  ) {
    return {
      type: 'revision',
      label: 'ส่งแก้ไข',
      badgeBg: 'bg-rose-500',
      badgeColor: 'text-white',
      fallbackBg: 'bg-gradient-to-tr from-rose-500 to-red-600',
      fallbackColor: 'text-white',
      iconName: 'rotate-ccw',
    };
  }

  // 3. Review (ส่งตรวจ)
  if (title.includes('ส่งตรวจ') || body.includes('ให้ตรวจ')) {
    return {
      type: 'review',
      label: 'ส่งตรวจ',
      badgeBg: 'bg-amber-500',
      badgeColor: 'text-white',
      fallbackBg: 'bg-gradient-to-tr from-amber-500 to-orange-500',
      fallbackColor: 'text-white',
      iconName: 'file-search',
    };
  }

  // 4. Attachment (อัปเดตไฟล์ / แนบไฟล์)
  if (
    title.includes('ไฟล์') ||
    body.includes('ไฟล์แนบ') ||
    body.includes('อัปเดตไฟล์')
  ) {
    return {
      type: 'attachment',
      label: 'อัปเดตไฟล์',
      badgeBg: 'bg-sky-500',
      badgeColor: 'text-white',
      fallbackBg: 'bg-gradient-to-tr from-sky-500 to-blue-600',
      fallbackColor: 'text-white',
      iconName: 'paperclip',
    };
  }

  // 5. Comment / Mention
  if (
    title.includes('ความคิดเห็น') ||
    title.includes('คอมเมนต์') ||
    title.includes('@mention') ||
    notifType === 'task_comment' ||
    metaType === 'task_comment' ||
    metaType === 'card_comment'
  ) {
    return {
      type: 'comment',
      label: 'ความคิดเห็น',
      badgeBg: 'bg-emerald-500',
      badgeColor: 'text-white',
      fallbackBg: 'bg-gradient-to-tr from-emerald-500 to-teal-600',
      fallbackColor: 'text-white',
      iconName: 'message-square',
    };
  }

  // 6. Status change
  if (
    title.includes('สถานะ') ||
    title.includes('เสร็จสิ้น') ||
    body.includes('เปลี่ยนสถานะ') ||
    body.includes('เสร็จสมบูรณ์') ||
    metaType === 'task_status' ||
    metaType === 'task_list_status'
  ) {
    return {
      type: 'status',
      label: 'สถานะงาน',
      badgeBg: 'bg-emerald-600',
      badgeColor: 'text-white',
      fallbackBg: 'bg-gradient-to-tr from-emerald-600 to-green-700',
      fallbackColor: 'text-white',
      iconName: 'check-circle',
    };
  }

  // 7. Leave
  if (notifType === 'leave' || notifType === 'leave_request' || title.includes('ใบลา') || title.includes('คำขอลา')) {
    return {
      type: 'leave',
      label: 'คำขอลา',
      badgeBg: 'bg-amber-500',
      badgeColor: 'text-white',
      fallbackBg: 'bg-gradient-to-tr from-amber-500 to-orange-600',
      fallbackColor: 'text-white',
      iconName: 'calendar',
    };
  }

  // 8. Attendance
  if (notifType === 'attendance' || title.includes('ลงเวลา') || title.includes('เข้างาน')) {
    return {
      type: 'attendance',
      label: 'ลงเวลา',
      badgeBg: 'bg-teal-500',
      badgeColor: 'text-white',
      fallbackBg: 'bg-gradient-to-tr from-teal-500 to-emerald-600',
      fallbackColor: 'text-white',
      iconName: 'clock',
    };
  }

  // Default: System / General Task
  return {
    type: 'system',
    label: 'งาน',
    badgeBg: 'bg-blue-600',
    badgeColor: 'text-white',
    fallbackBg: 'bg-gradient-to-tr from-blue-600 to-indigo-600',
    fallbackColor: 'text-white',
    iconName: 'bell',
  };
}
