import React, { useState } from 'react';
import {
  Crown,
  Coins,
  Trophy,
  ShoppingBag,
  HelpCircle,
  Settings,
  Volume2,
  VolumeX,
  Copy,
  Check,
  LogOut,
  Sparkles,
  Users,
} from 'lucide-react';
import { UserProfile, RoomState } from '../types.js';
import { sound } from '../utils/audio.js';

interface HeaderProps {
  user: UserProfile;
  room: RoomState | null;
  onOpenLeaderboard: () => void;
  onOpenShop: () => void;
  onOpenRules: () => void;
  onOpenHostSettings: () => void;
  onClaimFaucet: () => void;
  onLeaveRoom: () => void;
  isHost: boolean;
  faucetLoading: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  room,
  onOpenLeaderboard,
  onOpenShop,
  onOpenRules,
  onOpenHostSettings,
  onClaimFaucet,
  onLeaveRoom,
  isHost,
  faucetLoading,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [isMuted, setIsMuted] = useState(sound.getIsMuted());

  const handleCopyCode = () => {
    if (room?.code) {
      navigator.clipboard.writeText(room.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleToggleSound = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  const playerCount = room ? Object.keys(room.players).length : 0;

  return (
    <header
      id="main-app-header"
      className="sticky top-0 z-40 w-full bg-slate-950/90 backdrop-blur-md border-b border-amber-900/30 px-3 sm:px-6 py-2.5"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-900/40 border border-amber-300/50">
            <Crown className="w-6 h-6 text-slate-950 fill-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-game-title font-bold text-lg sm:text-xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-amber-300 to-amber-500 drop-shadow-sm">
                LANGUR BURJA
              </h1>
              <span className="font-nepali-title text-xs sm:text-sm font-semibold text-amber-200/90 hidden xs:inline-block">
                लङ्गुर बुर्जा
              </span>
              <span className="hidden md:inline-block px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm">
                Live 3D
              </span>
            </div>
          </div>
        </div>

        {/* Room Info (if inside a room) */}
        {room && (
          <div className="hidden lg:flex items-center gap-3 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800">
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-amber-200">{room.name}</span>
            </div>

            <div className="h-4 w-px bg-slate-700" />

            <button
              id="header-copy-code-btn"
              onClick={handleCopyCode}
              title="Copy Room Code for Friends"
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-mono transition-colors border border-slate-700"
            >
              <span>Code: {room.code}</span>
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span>{playerCount}</span>
            </div>
          </div>
        )}

        {/* Coin Balance & Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Free Coin Faucet Refill */}
          <div className="flex items-center bg-slate-900/90 rounded-xl border border-amber-500/30 p-1 pl-2.5 sm:pl-3 shadow-inner">
            <div className="flex items-center gap-1.5 mr-2">
              <Coins className="w-4 h-4 text-amber-400 fill-amber-400/30" />
              <span className="font-bold text-sm sm:text-base text-amber-200 font-mono tracking-tight">
                {user.coins.toLocaleString()}
              </span>
            </div>

            <button
              id="header-faucet-claim-btn"
              onClick={onClaimFaucet}
              disabled={faucetLoading}
              title="Claim +1,000 Free Bonus Coins"
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs transition-all shadow hover:shadow-amber-500/20 active:scale-95 disabled:opacity-50"
            >
              <Sparkles className="w-3 h-3" />
              <span className="hidden sm:inline">Free Coins</span>
              <span className="sm:hidden">+1K</span>
            </button>
          </div>

          {/* Navigation Buttons */}
          <div className="flex items-center gap-1">
            <button
              id="header-leaderboard-btn"
              onClick={onOpenLeaderboard}
              title="Hall of Fame & Leaderboard"
              className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-amber-300 border border-slate-800 transition-colors"
            >
              <Trophy className="w-4 h-4" />
            </button>

            <button
              id="header-shop-btn"
              onClick={onOpenShop}
              title="Coin Shop & Customization"
              className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-amber-300 border border-slate-800 transition-colors relative"
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500" />
            </button>

            <button
              id="header-rules-btn"
              onClick={onOpenRules}
              title="Game Rules & Payout Guide"
              className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {isHost && (
              <button
                id="header-host-settings-btn"
                onClick={onOpenHostSettings}
                title="Host Room Settings"
                className="p-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-colors"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}

            <button
              id="header-sound-toggle-btn"
              onClick={handleToggleSound}
              title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
              className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-slate-500" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
            </button>

            {room && (
              <button
                id="header-leave-room-btn"
                onClick={onLeaveRoom}
                title="Leave Table"
                className="p-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
