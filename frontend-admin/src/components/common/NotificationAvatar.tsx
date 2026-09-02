import React from 'react';
import {
  ClipboardCheck,
  Paperclip,
  CheckCircle2,
  MessageSquare,
  RotateCcw,
  FileSearch,
  Calendar,
  Clock,
  Bell,
} from 'lucide-react';
import type { AppNotification } from '../../services/adminApi';
import {
  type NotificationSender,
  getNotificationAction,
} from '../../utils/notificationHelpers';

interface NotificationAvatarProps {
  notification: AppNotification;
  sender: NotificationSender;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const NotificationAvatar: React.FC<NotificationAvatarProps> = ({
  notification,
  sender,
  size = 'md',
  className = '',
}) => {
  const action = getNotificationAction(notification);

  const renderActionIcon = (iconClass: string) => {
    switch (action.iconName) {
      case 'clipboard-check':
        return <ClipboardCheck className={iconClass} />;
      case 'paperclip':
        return <Paperclip className={iconClass} />;
      case 'check-circle':
        return <CheckCircle2 className={iconClass} />;
      case 'message-square':
        return <MessageSquare className={iconClass} />;
      case 'rotate-ccw':
        return <RotateCcw className={iconClass} />;
      case 'file-search':
        return <FileSearch className={iconClass} />;
      case 'calendar':
        return <Calendar className={iconClass} />;
      case 'clock':
        return <Clock className={iconClass} />;
      case 'bell':
      default:
        return <Bell className={iconClass} />;
    }
  };

  const dimClass = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-11 h-11' : 'w-9 h-9';
  const badgeDim = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const miniIconDim = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';
  const fullIconDim = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-5 h-5' : 'w-4.5 h-4.5';

  return (
    <div className={`relative shrink-0 ${className}`}>
      {/* 1. If user avatar photo is available */}
      {sender.avatarUrl ? (
        <div className={`${dimClass} rounded-full overflow-hidden bg-slate-100 border border-slate-200/80 shadow-2xs`}>
          <img
            src={sender.avatarUrl}
            alt={sender.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      ) : sender.isUser ? (
        /* 2. User without photo (Initial) */
        <div
          className={`${dimClass} rounded-full overflow-hidden bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs border border-slate-200/60`}
        >
          <span>{sender.initial}</span>
        </div>
      ) : (
        /* 3. System / Action-specific dedicated icon (e.g. มอบหมายงานใหม่, อัปเดตสถานะ) */
        <div
          className={`${dimClass} rounded-full overflow-hidden ${action.fallbackBg} ${action.fallbackColor} flex items-center justify-center shadow-xs border border-white/20`}
        >
          {renderActionIcon(fullIconDim)}
        </div>
      )}

      {/* Mini Action Badge at bottom-right corner when sender is a user */}
      {sender.isUser && (
        <span
          title={action.label}
          className={`absolute -bottom-0.5 -right-0.5 ${badgeDim} rounded-full ${action.badgeBg} ${action.badgeColor} flex items-center justify-center shadow-2xs ring-1.5 ring-white dark:ring-slate-900`}
        >
          {renderActionIcon(miniIconDim)}
        </span>
      )}

      {/* Unread dot at top-right corner */}
      {!notification.is_read && (
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-500 ring-2 ring-white dark:ring-slate-900 rounded-full shadow-2xs" />
      )}
    </div>
  );
};
