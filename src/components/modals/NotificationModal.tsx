import React from 'react';
import {
  Bell,
  X,
  CheckCheck,
  Trash2,
  Radio,
  Coins,
  Sparkles,
  Trophy,
  Clock,
} from 'lucide-react';
import { AppNotification, isNotificationUnseen } from '../../utils/notifications.js';
import { sound } from '../../utils/audio.js';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  onDeleteNotification: (id: string) => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  onDeleteNotification,
}) => {
  if (!isOpen) return null;

  const unreadCount = notifications.filter(isNotificationUnseen).length;

  const formatTimestamp = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'announcement':
        return <Radio className="w-4 h-4 text-sky-400" />;
      case 'reward':
      case 'treasury':
        return <Coins className="w-4 h-4 text-amber-400" />;
      case 'game':
        return <Trophy className="w-4 h-4 text-emerald-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-purple-400" />;
    }
  };

  const getTypeBadge = (type: AppNotification['type']) => {
    switch (type) {
      case 'announcement':
        return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
      case 'reward':
      case 'treasury':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'game':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      default:
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
    }
  };

  return (
    <div
      id="notification-modal-backdrop"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 md:p-6 animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div
        id="notification-card"
        className="w-full max-w-md sm:max-w-lg md:max-w-xl h-[480px] sm:h-[520px] md:h-[560px] max-h-[88vh] rounded-3xl bg-gradient-to-b from-[#0e1628] via-[#090e1c] to-[#04060d] border border-amber-500/40 shadow-2xl shadow-black/90 flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-amber-500/20 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-md">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-serif font-bold text-base text-amber-200 tracking-wide flex items-center gap-2">
                <span>Notifications</span>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black">
                    {unreadCount} New
                  </span>
                )}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                onClick={() => {
                  sound.playChipSound();
                  onMarkAllAsRead();
                }}
                title="Mark all as read"
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-amber-300 border border-slate-700 transition-all text-xs flex items-center gap-1 cursor-pointer active:scale-95"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span className="text-[10px] hidden xs:inline">Read All</span>
              </button>
            )}

            {notifications.length > 0 && (
              <button
                onClick={() => {
                  sound.playChipSound();
                  onClearAll();
                }}
                title="Clear all notifications"
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 transition-all cursor-pointer active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={() => {
                sound.playChipSound();
                onClose();
              }}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-all active:scale-95 cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notification List Content - Unified all notifications in one place */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
          {notifications.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
                <Bell className="w-6 h-6 opacity-40" />
              </div>
              <p className="text-sm font-semibold text-slate-300">No notifications yet</p>
              <p className="text-xs text-slate-500 max-w-xs">
                Broadcast announcements, coin grants, and airdrops will appear here in real time.
              </p>
            </div>
          ) : (
            notifications.map((note) => {
              const isUnseen = isNotificationUnseen(note);
              return (
                <div
                  key={note.id}
                  onClick={() => {
                    if (isUnseen) {
                      onMarkAsRead(note.id);
                    }
                  }}
                  className={`p-3 rounded-xl border transition-all flex items-start gap-3 relative cursor-pointer group ${
                    isUnseen
                      ? 'bg-gradient-to-r from-amber-950/40 via-slate-900/95 to-slate-900/95 border-amber-500/80 ring-1 ring-amber-400/40 hover:border-amber-400 text-slate-100 shadow-md shadow-amber-950/30'
                      : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  {/* Left Icon Badge */}
                  <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 shrink-0 mt-0.5">
                    {getIcon(note.type)}
                  </div>

                  {/* Middle Info */}
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-xs sm:text-sm text-amber-200">
                        {note.title}
                      </span>
                      {/* Category Badge */}
                      <span
                        className={`text-[8px] font-mono px-1.5 py-0.2 rounded uppercase border font-bold ${getTypeBadge(
                          note.type
                        )}`}
                      >
                        {note.type}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 mt-1 leading-relaxed break-words">
                      {note.message}
                    </p>

                    <div className="flex items-center gap-1 mt-2 text-[10px] text-slate-500 font-mono">
                      <Clock className="w-3 h-3" />
                      <span>{formatTimestamp(note.timestamp)}</span>
                    </div>
                  </div>

                  {/* Delete Button on Hover */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      sound.playChipSound();
                      onDeleteNotification(note.id);
                    }}
                    title="Delete notification"
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-950 text-slate-500 hover:text-rose-300 transition-all cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
