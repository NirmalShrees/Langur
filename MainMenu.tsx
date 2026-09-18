import React, { useState } from 'react';
import {
  Crown,
  Dice5,
  Coins,
  Sparkles,
  BookOpen,
  Trophy,
  ShoppingBag,
  Volume2,
  VolumeX,
  CheckCircle2,
  ArrowRight,
  Flame,
  Edit2,
  Check,
  Maximize2,
  Minimize2,
  Settings,
  Palette,
  Info,
  User,
  LogIn,
  ShieldCheck,
  Users,
  Globe,
  Lock,
  Zap,
} from 'lucide-react';
import { UserProfile, LANGUR_BURJA_SYMBOLS, SYMBOL_KEYS, SymbolType } from '../types.js';
import { sound } from '../utils/audio.js';
import { getSymbolImageDataUrl } from '../utils/diceTextures.js';
import { UserAvatar } from './UserAvatar.js';
import { CoinTreasuryModal } from './CoinTreasuryModal.js';

interface MainMenuProps {
  user: UserProfile;
  onUpdateUser: (updated: Partial<UserProfile>) => void;
  onStartGame: () => void;
  onOpenTableModal: (tab: 'create' | 'join') => void;
  onOpenRules: () => void;
  onOpenLeaderboard: () => void;
  onOpenShop: () => void;
  onClaimFaucet: () => void;
  faucetLoading: boolean;

  // Game Options
  tableTheme: 'emerald' | 'crimson' | 'midnight';
  onChangeTableTheme: (theme: 'emerald' | 'crimson' | 'midnight') => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onOpenSettings?: () => void;
  onOpenAuth?: () => void;
  onOpenProfile?: () => void;
}

const THEME_ACCENTS = {
  emerald: {
    screenBg: 'bg-gradient-to-b from-[#031910] via-[#04100b] to-[#010805]',
    screenBorder: 'border-emerald-800/40',
    topNavBg: 'bg-gradient-to-r from-[#031d12] via-[#06291a] to-[#031d12]',
    panelBorder: 'border-emerald-500/35',
    panelDivide: 'divide-emerald-500/20',
    themeBadge: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
  },
  crimson: {
    screenBg: 'bg-gradient-to-b from-[#1c0509] via-[#100306] to-[#070103]',
    screenBorder: 'border-rose-800/40',
    topNavBg: 'bg-gradient-to-r from-[#22060c] via-[#300912] to-[#22060c]',
    panelBorder: 'border-rose-500/35',
    panelDivide: 'divide-rose-500/20',
    themeBadge: 'bg-rose-500/20 text-rose-300 border-rose-400/40',
  },
  midnight: {
    screenBg: 'bg-gradient-to-b from-[#051329] via-[#040c1a] to-[#02050c]',
    screenBorder: 'border-blue-800/40',
    topNavBg: 'bg-gradient-to-r from-[#071935] via-[#0c264d] to-[#071935]',
    panelBorder: 'border-blue-500/35',
    panelDivide: 'divide-blue-500/20',
    themeBadge: 'bg-blue-500/20 text-blue-300 border-blue-400/40',
  },
};

const PURE_NEPALI_NAMES: Record<SymbolType, string> = {
  jhanda: 'झण्डा',
  burja: 'बुर्जा',
  itta: 'ईंटा',
  paan: 'पान',
  hukum: 'हुकुम',
  chidi: 'चिडी',
};

export const MainMenu: React.FC<MainMenuProps> = ({
  user,
  onUpdateUser,
  onStartGame,
  onOpenTableModal,
  onOpenRules,
  onOpenLeaderboard,
  onOpenShop,
  onClaimFaucet,
  faucetLoading,
  tableTheme,
  onChangeTableTheme,
  isFullscreen = false,
  onToggleFullscreen,
  onOpenSettings,
  onOpenAuth,
  onOpenProfile,
}) => {
  const [isMuted, setIsMuted] = useState(sound.getIsMuted());
  const [showSymbolColorInfo, setShowSymbolColorInfo] = useState(false);
  const [isTreasuryOpen, setIsTreasuryOpen] = useState(false);

  const toggleSound = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
    if (!muted) {
      sound.playChipSound();
    }
  };

  const currentTheme = THEME_ACCENTS[tableTheme] || THEME_ACCENTS.emerald;

  return (
    <div
      id="main-menu-screen"
      className={`w-full max-w-md sm:max-w-lg h-[100dvh] max-h-screen flex flex-col justify-between ${currentTheme.screenBg} text-slate-100 shadow-2xl border-x ${currentTheme.screenBorder} select-none overflow-y-auto scrollbar-none p-3 sm:p-4`}
    >
      {/* 1 & 2. Top Nav Panel & Profile Panel (Directly Touching - No Gap) */}
      <div className={`shrink-0 flex flex-col rounded-2xl bg-slate-900/90 ${currentTheme.panelBorder} shadow-lg shadow-black/40 overflow-hidden divide-y ${currentTheme.panelDivide}`}>
        {/* Top Nav Row */}
        <div className={`flex items-center justify-between px-3 py-2 ${currentTheme.topNavBg}`}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-700 flex items-center justify-center shadow-md shadow-amber-950/80 border border-amber-300/60 shrink-0">
              <Crown className="w-4 h-4 text-slate-950 fill-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 leading-none">
                <h1 className="font-game-title font-bold text-base sm:text-lg tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-amber-300 to-amber-500 drop-shadow-sm">
                  LANGUR BURJA
                </h1>
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/40 font-mono font-bold uppercase">
                  3D
                </span>
              </div>
              <p className="text-[10.5px] text-amber-300/80 flex items-center gap-1.5 mt-0.5">
                <span className="font-nepali-title font-semibold text-amber-200">लङ्गुर बुर्जा</span>
              </p>
            </div>
          </div>

          {/* Header Right: Fullscreen & Settings (matches in-game header) */}
          <div className="flex items-center gap-1.5 shrink-0">
            {onToggleFullscreen && (
              <button
                id="main-menu-fullscreen-toggle-btn"
                onClick={onToggleFullscreen}
                title={isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}
                className="p-1.5 rounded-xl bg-slate-900/90 text-amber-300 hover:text-amber-100 border border-slate-800 hover:border-amber-500/40 active:scale-95 transition-all shadow-sm"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4 text-amber-400" />
                ) : (
                  <Maximize2 className="w-4 h-4 text-amber-400" />
                )}
              </button>
            )}

            {/* Settings Button */}
            <button
              id="main-menu-settings-btn"
              onClick={onOpenSettings}
              title="Game Settings & Player Account"
              className="p-1.5 rounded-xl bg-slate-900/90 text-amber-300 hover:text-amber-100 border border-slate-800 hover:border-amber-500/40 active:scale-95 transition-all shadow-sm"
            >
              <Settings className="w-4 h-4 text-amber-400" />
            </button>
          </div>
        </div>

        {/* Profile & Treasury Panel (Touching Top Nav Panel with Zero Gap) */}
        <div className="p-2 sm:px-3 bg-slate-900/85 flex items-center justify-between gap-2">
          {/* User Info & Avatar */}
          <div className="flex items-center gap-2 min-w-0">
            {/* Player Avatar */}
            <button
              id="main-menu-avatar-btn"
              type="button"
              onClick={() => {
                sound.playChipSound();
                onOpenProfile?.();
              }}
              title="Open Player Profile (Change Avatar, Name & Title)"
              className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-sm shadow border border-amber-300/60 shrink-0 hover:scale-105 active:scale-95 transition-transform overflow-hidden cursor-pointer"
            >
              <UserAvatar avatar={user.avatar} name={user.username} size="sm" className="w-full h-full rounded-none" />
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {/* Player Name Button */}
                <button
                  id="main-menu-username-btn"
                  type="button"
                  onClick={() => {
                    sound.playChipSound();
                    onOpenProfile?.();
                  }}
                  title="Open Player Profile"
                  className="text-left font-serif font-bold text-xs sm:text-sm text-amber-200 truncate hover:text-amber-100 hover:underline decoration-amber-400/40 transition-colors cursor-pointer max-w-[130px] sm:max-w-[170px]"
                >
                  {user.username}
                </button>

                {/* Pencil Icon Button */}
                <button
                  id="main-menu-edit-profile-btn"
                  type="button"
                  onClick={() => {
                    sound.playChipSound();
                    onOpenProfile?.();
                  }}
                  className="text-slate-500 hover:text-amber-300 p-0.5 transition-colors cursor-pointer"
                  title="Edit Player Profile"
                >
                  <Edit2 className="w-2.5 h-2.5" />
                </button>
              </div>

              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[9px] text-slate-400 truncate">
                  {user.equipped?.title || 'Festival Player'}
                </span>
                {user.isGuest ? (
                  <button
                    onClick={onOpenAuth}
                    className="text-[8px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40 hover:bg-amber-500/30 transition-colors"
                  >
                    GUEST
                  </button>
                ) : (
                  <span className="text-[8px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-0.5">
                    <Check className="w-2 h-2" />
                    SYNCED
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Treasury Coins Button (Opens Treasury & History) */}
          <div className="flex items-center shrink-0">
            <button
              id="main-menu-coins-btn"
              type="button"
              onClick={() => {
                sound.playChipSound();
                setIsTreasuryOpen(true);
              }}
              title="Open Treasury"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-950/90 hover:bg-slate-900 border border-amber-500/40 hover:border-amber-400 text-amber-300 shadow-sm active:scale-95 transition-all group cursor-pointer"
            >
              <Coins className="w-3 h-3 text-amber-400 fill-amber-400/40 group-hover:scale-105 transition-transform shrink-0" />
              <span className="text-[11px] font-mono font-bold text-amber-200 tracking-tight">
                {user.coins.toLocaleString()}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. The 6 Dice Symbols Showcase */}
      <div className="shrink-0 space-y-1.5 relative">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[11px] font-serif font-bold text-amber-300 tracking-wide flex items-center gap-1.5">
            <span>🎲</span>
            <span>6 faces of dice</span>
          </span>
          <span className="text-[9px] text-slate-400 font-mono">Match 2+ to Win (Up to 6x)</span>
        </div>

        {/* 6 Prominent Dice Cubes Grid */}
        <div className="grid grid-cols-6 gap-1.5">
          {SYMBOL_KEYS.map((symKey) => {
            const cfg = LANGUR_BURJA_SYMBOLS[symKey];
            const isRed = symKey === 'jhanda' || symKey === 'paan' || symKey === 'itta';
            const isGold = symKey === 'burja';
            const isGreen = symKey === 'chidi';

            return (
              <div
                key={symKey}
                className={`relative flex flex-col items-center justify-center py-1.5 sm:py-2 px-1 rounded-xl border transition-transform hover:scale-105 shadow-md text-center min-h-[68px] sm:min-h-[74px] ${
                  isGold
                    ? 'bg-gradient-to-b from-amber-950/70 via-slate-900 to-slate-950 border-amber-400/60 shadow-amber-950/50'
                    : isRed
                    ? 'bg-gradient-to-b from-rose-950/60 via-slate-900 to-slate-950 border-rose-500/50 shadow-rose-950/50'
                    : isGreen
                    ? 'bg-gradient-to-b from-emerald-950/60 via-slate-900 to-slate-950 border-emerald-500/50 shadow-emerald-950/50'
                    : 'bg-gradient-to-b from-slate-850 via-slate-900 to-slate-950 border-slate-700/60 shadow-slate-950/50'
                }`}
              >
                {/* Scaled symbol image texture on ivory parchment, zoomed in to hide outer black border */}
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-md sm:rounded-lg overflow-hidden flex items-center justify-center border border-amber-900/40 shadow-sm shrink-0 bg-[#FAF4D0]">
                  <img
                    src={getSymbolImageDataUrl(symKey)}
                    alt={cfg.name}
                    className="w-full h-full object-cover scale-[1.28] pointer-events-none select-none"
                  />
                </div>

                {/* Authentic Nepali Name with dedicated font and ample vertical headroom */}
                <span className="text-[11px] sm:text-xs font-black font-nepali text-amber-200 leading-tight pt-1 px-0.5 w-full text-center block select-none truncate">
                  {PURE_NEPALI_NAMES[symKey]}
                </span>
                <span className="text-[7.5px] sm:text-[8px] font-mono text-amber-400/70 font-bold uppercase tracking-wider block truncate w-full text-center">
                  {cfg.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. GAME TABLE: THE TWO PRIMARY OPTIONS (CREATE TABLE & JOIN TABLE) */}
      <div className="shrink-0 space-y-1.5">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300/90 font-bold flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            Game Table Options
          </span>
          <span className="text-[9px] text-slate-400">Multiplayer Tables</span>
        </div>

        {/* 2-Column Boxes: Create Table & Join Table */}
        <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
          {/* Option 1: Create Table */}
          <div
            id="mode-box-create-table"
            onClick={() => {
              sound.playChipSound();
              onOpenTableModal('create');
            }}
            className="p-2.5 sm:p-3 rounded-2xl border cursor-pointer transition-all relative flex flex-col justify-between select-none bg-gradient-to-b from-amber-950/70 via-slate-900 to-slate-950 border-amber-500/50 hover:border-amber-400 active:scale-95 group shadow-lg shadow-amber-950/40 hover:shadow-amber-500/20"
          >
            {/* Top Badge */}
            <div className="flex items-center justify-between gap-1 mb-1.5">
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/40 font-mono font-bold tracking-tight">
                HOST TABLE
              </span>
              <div className="flex items-center gap-0.5 text-amber-400 text-[10px] font-bold">
                <Crown className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Icon & Title */}
            <div className="flex items-center gap-2 my-1">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-700 flex items-center justify-center text-slate-950 shadow-md shrink-0 group-hover:scale-105 transition-transform">
                <Crown className="w-5 h-5 text-slate-950" />
              </div>
              <div className="min-w-0">
                <h3 className="font-serif font-black text-xs sm:text-sm text-amber-200 leading-tight group-hover:text-amber-100">
                  Create Table
                </h3>
                <span className="text-[9px] text-slate-400 truncate block">Friends or Randoms</span>
              </div>
            </div>

            {/* Specs */}
            <div className="mt-1 pt-1 border-t border-amber-500/20 space-y-0.5 text-[9px] text-slate-300 font-mono">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Invite:</span>
                <span className="text-amber-300 font-bold">Code & Link</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Access:</span>
                <span className="text-slate-200">Private / Open</span>
              </div>
            </div>
          </div>

          {/* Option 2: Join Table */}
          <div
            id="mode-box-join-table"
            onClick={() => {
              sound.playChipSound();
              onOpenTableModal('join');
            }}
            className="p-2.5 sm:p-3 rounded-2xl border cursor-pointer transition-all relative flex flex-col justify-between select-none bg-gradient-to-b from-emerald-950/70 via-slate-900 to-slate-950 border-emerald-500/50 hover:border-emerald-400 active:scale-95 group shadow-lg shadow-emerald-950/40 hover:shadow-emerald-500/20"
          >
            {/* Top Badge */}
            <div className="flex items-center justify-between gap-1 mb-1.5">
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 font-mono font-bold tracking-tight">
                JOIN TABLE
              </span>
              <div className="flex items-center gap-0.5 text-emerald-400 text-[10px] font-bold">
                <Users className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Icon & Title */}
            <div className="flex items-center gap-2 my-1">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center text-slate-950 shadow-md shrink-0 group-hover:scale-105 transition-transform">
                <Dice5 className="w-5 h-5 text-slate-950" />
              </div>
              <div className="min-w-0">
                <h3 className="font-serif font-black text-xs sm:text-sm text-emerald-200 leading-tight group-hover:text-emerald-100">
                  Join Table
                </h3>
                <span className="text-[9px] text-slate-400 truncate block">Code or Random</span>
              </div>
            </div>

            {/* Specs */}
            <div className="mt-1 pt-1 border-t border-emerald-500/20 space-y-0.5 text-[9px] text-slate-300 font-mono">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Match:</span>
                <span className="text-emerald-300 font-bold">Random Table</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Code:</span>
                <span className="text-slate-200">Enter 6-char</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Table Customization & Quick Utility Buttons (Enhanced Height & Prominence) */}
      <div className="shrink-0 space-y-2.5 sm:space-y-3">
        {/* Global Elegant Table & Ambiance Theme Selector */}
        <div className="flex items-center justify-between gap-2 p-2 sm:p-2.5 rounded-2xl bg-slate-900/95 border border-slate-800/90 shadow-lg min-h-[50px] sm:min-h-[54px]">
          <div className="flex items-center gap-1.5 pl-1 shrink-0">
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Palette className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400" />
            </div>
            <span className="text-[10.5px] sm:text-xs text-amber-300 font-mono uppercase font-bold tracking-wider">
              Theme:
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1 sm:gap-1.5 flex-1 min-w-0 max-w-[280px]">
            {[
              {
                key: 'emerald',
                label: 'Emerald',
                dot: 'bg-emerald-500 shadow-emerald-500/50',
                active: 'bg-emerald-950/90 border-emerald-400 text-emerald-200 ring-1 ring-emerald-400/60 shadow-md shadow-emerald-950/80',
              },
              {
                key: 'crimson',
                label: 'Crimson',
                dot: 'bg-rose-500 shadow-rose-500/50',
                active: 'bg-rose-950/90 border-rose-400 text-rose-200 ring-1 ring-rose-400/60 shadow-md shadow-rose-950/80',
              },
              {
                key: 'midnight',
                label: 'Midnight',
                dot: 'bg-blue-500 shadow-blue-500/50',
                active: 'bg-blue-950/90 border-blue-400 text-blue-200 ring-1 ring-blue-400/60 shadow-md shadow-blue-950/80',
              },
            ].map(({ key, label, dot, active }) => {
              const isSelected = tableTheme === key;
              return (
                <button
                  key={key}
                  id={`main-menu-theme-btn-${key}`}
                  onClick={() => {
                    if (tableTheme !== key) {
                      sound.playChipSound();
                      onChangeTableTheme(key as any);
                    }
                  }}
                  className={`flex items-center justify-center gap-1 sm:gap-1.5 px-1 sm:px-2 py-1.5 sm:py-2 rounded-xl border text-[10.5px] sm:text-xs font-bold active:scale-95 transition-transform shadow-sm truncate min-w-0 w-full ${
                    isSelected
                      ? active
                      : 'bg-slate-950/70 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${dot} ${isSelected ? 'scale-125 ring-2 ring-white/20' : 'opacity-70'}`} />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Modals: Rules, Leaderboard, Bazaar (Enlarged & More Prominent) */}
        <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
          <button
            onClick={onOpenRules}
            className="flex items-center justify-center gap-2 py-3 sm:py-3.5 px-2.5 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 hover:from-slate-850 hover:to-slate-900 border border-slate-800 hover:border-amber-500/50 text-slate-100 hover:text-amber-200 text-xs sm:text-sm font-bold active:scale-95 transition-all shadow-lg min-h-[50px] sm:min-h-[54px]"
          >
            <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
              <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
            </div>
            <span>Rules</span>
          </button>

          <button
            onClick={onOpenLeaderboard}
            className="flex items-center justify-center gap-2 py-3 sm:py-3.5 px-2.5 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 hover:from-slate-850 hover:to-slate-900 border border-slate-800 hover:border-amber-500/50 text-slate-100 hover:text-amber-200 text-xs sm:text-sm font-bold active:scale-95 transition-all shadow-lg min-h-[50px] sm:min-h-[54px]"
          >
            <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
              <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
            </div>
            <span>Hall of Fame</span>
          </button>

          <button
            onClick={onOpenShop}
            className="flex items-center justify-center gap-2 py-3 sm:py-3.5 px-2.5 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 hover:from-slate-850 hover:to-slate-900 border border-slate-800 hover:border-amber-500/50 text-slate-100 hover:text-amber-200 text-xs sm:text-sm font-bold active:scale-95 transition-all shadow-lg min-h-[50px] sm:min-h-[54px]"
          >
            <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
              <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
            </div>
            <span>Bazaar</span>
          </button>
        </div>
      </div>

      {/* 6. Clean Bottom Footer */}
      <div className="shrink-0 pt-2 border-t border-amber-900/30 text-center text-[10px] text-slate-400 font-mono flex items-center justify-center gap-2">
        <span className="text-amber-300">Invite Friends</span>
        <span>•</span>
        <span className="text-emerald-300">Quick Match</span>
        <span>•</span>
        <span className={`px-2 py-0.5 rounded-full uppercase text-[9px] font-bold border ${currentTheme.themeBadge}`}>
          {tableTheme}
        </span>
      </div>

      {/* 7. Coin Treasury & Received History Modal */}
      <CoinTreasuryModal
        isOpen={isTreasuryOpen}
        onClose={() => setIsTreasuryOpen(false)}
        user={user}
        onClaimFaucet={onClaimFaucet}
        faucetLoading={faucetLoading}
      />
    </div>
  );
};
