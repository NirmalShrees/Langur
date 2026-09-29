import React from 'react';
import { Coins, Sparkles, Settings, Maximize2, Minimize2, Home, Share2, Crown, Users, Bell } from 'lucide-react';
import { UserProfile, RoomState } from '../../types.js';
import { UserAvatar } from '../common/UserAvatar.js';

interface MobileHeaderProps {
  user: UserProfile;
  currentRoom?: RoomState | null;
  onShareTable?: () => void;
  onOpenProfile: () => void;
  onClaimFaucet: () => void;
  faucetLoading: boolean;
  onOpenSettings: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onReturnToMainMenu?: () => void;
  onOpenTableStats?: () => void;
  onOpenNotifications?: () => void;
  unreadNotificationCount?: number;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  user,
  currentRoom,
  onShareTable,
  onOpenProfile,
  onClaimFaucet,
  faucetLoading,
  onOpenSettings,
  isFullscreen,
  onToggleFullscreen,
  onReturnToMainMenu,
  onOpenNotifications,
  unreadNotificationCount = 0,
}) => {
  return (
    <header
      id="mobile-game-header"
      className="w-full bg-slate-950 border-b border-amber-900/40 px-3 py-2 sm:px-4 sm:py-2.5 md:px-5 md:py-3 pt-[max(0.5rem,env(safe-area-inset-top,0.5rem))] select-none z-30 shadow-md transform-gpu will-change-transform shrink-0"
      style={{ transform: 'translateZ(0)' }}
    >
      <div className="flex items-center justify-between gap-2 max-w-full">
        {/* Left: Tap Avatar & Name to Open Profile */}
        <button
          id="header-open-profile-btn"
          onClick={onOpenProfile}
          title="Open Player Profile"
          className="flex items-center gap-2 sm:gap-2.5 min-w-0 p-1 -ml-1 rounded-xl hover:bg-slate-900/80 active:scale-95 transition-all text-left group cursor-pointer"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-xl md:rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-700 flex items-center justify-center shadow-md shadow-amber-950/60 border border-amber-300/50 shrink-0 text-base overflow-hidden">
            <UserAvatar avatar={user.avatar} name={user.username} size="sm" className="w-full h-full rounded-none" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 leading-none">
              <span className="font-serif font-black text-xs sm:text-sm md:text-base tracking-tight text-amber-200 truncate group-hover:text-amber-100 max-w-[120px] sm:max-w-[180px] md:max-w-[260px]">
                {user.username}
              </span>
              <span className="text-[8px] sm:text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono font-bold">
                PRO
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] md:text-xs text-amber-400/80 font-mono truncate mt-0.5 sm:mt-1">
              {user.coins.toLocaleString()} 🪙
            </p>
          </div>
        </button>

        {/* Right Actions: Notifications, Share, Return to Main Menu, Fullscreen, Settings */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Notifications Button */}
          {onOpenNotifications && (
            <button
              id="header-mobile-notifications-btn"
              onClick={onOpenNotifications}
              title="Notifications"
              className="relative p-1.5 sm:p-2 rounded-xl bg-slate-900/90 text-amber-300 hover:text-amber-100 border border-slate-800 hover:border-amber-500/40 active:scale-95 transition-all shadow-sm cursor-pointer"
            >
              <Bell className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-amber-400" />
              {unreadNotificationCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-amber-500 text-slate-950 text-[8px] sm:text-[9px] font-mono font-black flex items-center justify-center shadow-sm">
                  {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                </span>
              )}
            </button>
          )}

          {/* Share Table Button with Table Code in Same Badge */}
          {onShareTable && (
            <button
              id="header-share-btn"
              onClick={onShareTable}
              title={currentRoom ? `Share Table Code (${currentRoom.code})` : 'Share Game'}
              className="px-2 py-1 sm:px-2.5 sm:py-1.5 md:px-3 rounded-xl bg-slate-900/90 text-amber-400 hover:text-amber-200 border border-slate-800 hover:border-amber-500/40 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {currentRoom?.code && (
                <span className="font-mono font-black text-[11px] sm:text-xs md:text-sm tracking-wider text-amber-300">
                  {currentRoom.code}
                </span>
              )}
              <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
            </button>
          )}

          {/* Return to Main Menu Button */}
          {onReturnToMainMenu && (
            <button
              id="header-return-menu-btn"
              onClick={onReturnToMainMenu}
              title="Return to Main Menu"
              className="p-1.5 sm:p-2 rounded-xl bg-slate-900/90 text-amber-300 hover:text-amber-100 border border-slate-800 hover:border-amber-500/40 active:scale-95 transition-all shadow-sm flex items-center gap-1 cursor-pointer"
            >
              <Home className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-amber-400" />
              <span className="hidden xs:inline text-[11px] sm:text-xs font-bold text-amber-200">Menu</span>
            </button>
          )}

          {/* Fullscreen Toggle Button (Mobile Friendly!) */}
          <button
            id="header-fullscreen-toggle-btn"
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}
            className="p-1.5 sm:p-2 rounded-xl bg-slate-900/90 text-amber-300 hover:text-amber-100 border border-slate-800 hover:border-amber-500/40 active:scale-95 transition-all shadow-sm cursor-pointer"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-amber-400" />
            ) : (
              <Maximize2 className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-amber-400" />
            )}
          </button>

          {/* Settings Modal Button (Controls Sound, Rules & Table) */}
          <button
            id="header-settings-btn"
            onClick={onOpenSettings}
            title="Game Settings & Rules"
            className="p-1.5 sm:p-2 rounded-xl bg-slate-900/90 text-slate-300 hover:text-amber-300 border border-slate-800 hover:border-amber-500/40 active:scale-95 transition-all shadow-sm cursor-pointer"
          >
            <Settings className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-amber-400" />
          </button>
        </div>
      </div>
    </header>
  );
};


