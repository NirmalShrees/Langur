export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'announcement' | 'reward' | 'treasury' | 'game' | 'system';
  timestamp: number;
  read?: boolean;
  state?: 'not seen'; // "not seen" if unseen; omitted/undefined if seen
  icon?: string;
}

const STORAGE_KEY = 'langur_burja_notifications';

/**
 * Checks whether a notification is in the "not seen" state.
 */
export function isNotificationUnseen(notification: AppNotification): boolean {
  if (!notification) return false;
  return notification.state === 'not seen' || notification.read === false;
}

/**
 * Prepares notification JSONB array for Supabase profiles.notifications column:
 * - If not seen: adds `"state": "not seen"`
 * - If seen: adds nothing (the `state` key is omitted completely)
 */
export function toSupabaseNotificationsJsonb(notifications: AppNotification[]): any[] {
  if (!Array.isArray(notifications)) return [];
  return notifications.slice(0, 50).map((n) => {
    const isUnseen = isNotificationUnseen(n);
    const item: Record<string, any> = {
      id: String(n.id || `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`),
      title: String(n.title || 'Notification'),
      message: String(n.message || ''),
      type: n.type || 'system',
      timestamp: typeof n.timestamp === 'number' ? n.timestamp : Date.now(),
    };

    if (n.icon) {
      item.icon = n.icon;
    }

    // "if it is not seen, add not seen state. but if it is seen, add nothing."
    if (isUnseen) {
      item.state = 'not seen';
    }

    return item;
  });
}

/**
 * Parses notification JSONB array from Supabase profiles.notifications column:
 * - If item has `"state": "not seen"`: sets state="not seen" and read=false
 * - If item has no state (or seen): sets read=true and omits state
 */
export function fromSupabaseNotificationsJsonb(rawList: any[]): AppNotification[] {
  if (!Array.isArray(rawList)) return [];
  return rawList.map((item) => {
    const isUnseen = item.state === 'not seen' || item.read === false;
    const note: AppNotification = {
      id: String(item.id || `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`),
      title: String(item.title || 'Notification'),
      message: String(item.message || ''),
      type: (item.type || 'system') as AppNotification['type'],
      timestamp: typeof item.timestamp === 'number' ? item.timestamp : Date.now(),
      icon: item.icon,
      read: !isUnseen,
    };

    if (isUnseen) {
      note.state = 'not seen';
    }

    return note;
  });
}

export function getStoredNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Default initial welcome notifications
      const defaults: AppNotification[] = [
        {
          id: 'welcome_note_1',
          title: '🎉 Welcome to Langur Burja!',
          message: 'Experience authentic 3D dice physics, private tables, voice chat, and daily rewards.',
          type: 'announcement',
          timestamp: Date.now() - 3600000,
          read: false,
          state: 'not seen',
        },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSupabaseNotificationsJsonb(defaults)));
      return defaults;
    }
    const parsed = JSON.parse(raw);
    return fromSupabaseNotificationsJsonb(parsed);
  } catch {
    return [];
  }
}

export function saveNotifications(notifications: AppNotification[]): void {
  try {
    const payload = toSupabaseNotificationsJsonb(notifications);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

export function addNotification(
  notification: Omit<AppNotification, 'id' | 'timestamp' | 'read' | 'state'>
): AppNotification {
  const current = getStoredNotifications();
  const newNote: AppNotification = {
    ...notification,
    id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: Date.now(),
    read: false,
    state: 'not seen', // New notifications start with "not seen" state
  };
  const updated = [newNote, ...current.slice(0, 49)];
  saveNotifications(updated);
  return newNote;
}

export function markNotificationAsRead(id: string): AppNotification[] {
  const current = getStoredNotifications();
  const updated = current.map((n) => {
    if (n.id === id) {
      // If it is seen, add nothing (remove 'state')
      const { state, ...rest } = n;
      return { ...rest, read: true };
    }
    return n;
  });
  saveNotifications(updated);
  return updated;
}

export function markAllNotificationsAsRead(): AppNotification[] {
  const current = getStoredNotifications();
  const updated = current.map((n) => {
    // If it is seen, add nothing (remove 'state')
    const { state, ...rest } = n;
    return { ...rest, read: true };
  });
  saveNotifications(updated);
  return updated;
}

export function clearAllNotifications(): AppNotification[] {
  saveNotifications([]);
  return [];
}

export function deleteNotification(id: string): AppNotification[] {
  const current = getStoredNotifications();
  const updated = current.filter((n) => n.id !== id);
  saveNotifications(updated);
  return updated;
}
