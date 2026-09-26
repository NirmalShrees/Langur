export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'announcement' | 'reward' | 'treasury' | 'game' | 'system';
  timestamp: number;
  read: boolean;
  deltaCoins?: number;
  icon?: string;
}

const STORAGE_KEY = 'langur_burja_notifications';

export function getStoredNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Provide default welcome notification
      const defaults: AppNotification[] = [
        {
          id: 'welcome_note_1',
          title: '🎉 Welcome to Langur Burja!',
          message: 'Experience authentic 3D dice physics, private tables, voice chat, and daily rewards.',
          type: 'announcement',
          timestamp: Date.now() - 3600000,
          read: false,
        },
        {
          id: 'welcome_note_2',
          title: '🪙 Welcome Bonus',
          message: '5,000 festival coins have been credited to your treasury.',
          type: 'reward',
          timestamp: Date.now() - 3600000,
          read: true,
          deltaCoins: 5000,
        },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
      return defaults;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveNotifications(notifications: AppNotification[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, 50)));
  } catch {}
}

export function addNotification(notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>): AppNotification {
  const current = getStoredNotifications();
  const newNote: AppNotification = {
    ...notification,
    id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: Date.now(),
    read: false,
  };
  const updated = [newNote, ...current.slice(0, 49)];
  saveNotifications(updated);
  return newNote;
}

export function markNotificationAsRead(id: string): AppNotification[] {
  const current = getStoredNotifications();
  const updated = current.map((n) => (n.id === id ? { ...n, read: true } : n));
  saveNotifications(updated);
  return updated;
}

export function markAllNotificationsAsRead(): AppNotification[] {
  const current = getStoredNotifications();
  const updated = current.map((n) => ({ ...n, read: true }));
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
