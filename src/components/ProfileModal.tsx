import React, { useState, useEffect } from 'react';
import {
  User,
  X,
  Trophy,
  Coins,
  Sparkles,
  Check,
  Edit2,
  ShieldCheck,
  LogOut,
  KeyRound,
  Eye,
  EyeOff,
  Lock,
  Crown,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { UserProfile } from '../types.js';
import { sound } from '../utils/audio.js';
import { UserAvatar } from './UserAvatar.js';
import {
  setUserPassword,
  hasUserConfiguredPassword,
} from '../services/authService.js';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onUpdateUser: (updated: Partial<UserProfile>) => void;
  onOpenAuth?: () => void;
  onSignOut?: () => void;
  isFirstTime?: boolean;
}

const FESTIVAL_AVATARS = ['🎲', '👑', '🦁', '🦚', '🐯', '🏔️', '🪔', '⚡', '🏆', '💎', '🚩', '🐅'];

const AVAILABLE_TITLES = [
  { id: 'Festival Player', name: 'Festival Player', icon: '👑', desc: 'Distinguished Game Player' },
  { id: 'Dice Novice', name: 'Dice Novice', icon: '🎲', desc: 'Aspiring Dice Roller' },
  { id: 'Royal High Roller', name: 'Royal High Roller', icon: '💎', desc: 'High Stakes Master' },
  { id: 'Lakhpati', name: 'Lakhpati', icon: '💰', desc: 'Wealth & Prosperity' },
  { id: 'Himalayan Gambler', name: 'Himalayan Gambler', icon: '🏔️', desc: 'Mountain Legend' },
  { id: 'Festival Champion', name: 'Festival Champion', icon: '🏆', desc: 'Grand Victor' },
  { id: 'Royal Banker', name: 'Royal Banker', icon: '🏛️', desc: 'Treasury Guardian' },
  { id: 'Fortune Seeker', name: 'Fortune Seeker', icon: '✨', desc: 'Destined for Glory' },
];

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateUser,
  onOpenAuth,
  onSignOut,
  isFirstTime = false,
}) => {
  const [nameInput, setNameInput] = useState(user.username || '');
  const [isEditingName, setIsEditingName] = useState(false);

  // Title expansion and custom title state
  const currentTitle = user.equipped?.title || 'Festival Player';
  const isPredefinedTitle = AVAILABLE_TITLES.some((t) => t.id === currentTitle);
  const [showMoreTitles, setShowMoreTitles] = useState(false);
  const [customTitleInput, setCustomTitleInput] = useState(isPredefinedTitle ? '' : currentTitle);
  const [isEditingCustom, setIsEditingCustom] = useState(false);

  // Email Password State
  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [customEmail, setCustomEmail] = useState(user.email || '');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // Keep state synced with user prop
  useEffect(() => {
    if (user.username) setNameInput(user.username);
    if (user.email) setCustomEmail(user.email);
    if (user.equipped?.title) {
      const match = AVAILABLE_TITLES.some((t) => t.id === user.equipped?.title);
      if (!match) setCustomTitleInput(user.equipped.title);
    }
  }, [user.username, user.email, user.equipped?.title]);

  if (!isOpen) return null;

  // Detect Google Photo & Name from various sources
  const storedGoogleAvatar = localStorage.getItem('langur_burja_google_avatar');
  const storedGoogleName = localStorage.getItem('langur_burja_google_name');

  const googlePhotoUrl =
    user.googleAvatar ||
    storedGoogleAvatar ||
    (user.avatar?.startsWith('http') ? user.avatar : null) ||
    (user.email ? 'https://lh3.googleusercontent.com/a/ACg8ocKz-google-user-avatar-default=s96-c' : null);

  const googleAccountName =
    user.googleName ||
    storedGoogleName ||
    (user.email === 'magarjack0@gmail.com' ? 'Jack Magar' : null) ||
    (user.email ? user.email.split('@')[0] : null);

  const isGooglePhotoSelected = Boolean(googlePhotoUrl && user.avatar === googlePhotoUrl);
  const isPasswordReady = hasUserConfiguredPassword(user.email || customEmail, user);

  const handleSaveName = () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== user.username) {
      onUpdateUser({ username: trimmed });
      sound.playChipSound();
    }
    setIsEditingName(false);
  };

  const handleSelectGoogleAvatar = () => {
    if (!googlePhotoUrl) return;
    sound.playChipSound();
    onUpdateUser({ avatar: googlePhotoUrl });
  };

  const handleSelectAvatar = (av: string) => {
    sound.playChipSound();
    onUpdateUser({ avatar: av });
  };

  const handleSelectTitle = (title: string) => {
    sound.playChipSound();
    onUpdateUser({
      equipped: {
        ...user.equipped,
        title,
      },
    });
  };

  const handleApplyCustomTitle = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customTitleInput.trim();
    if (trimmed) {
      handleSelectTitle(trimmed);
      sound.playWinFanfare();
    }
  };

  const handleApplyGoogleName = () => {
    if (!googleAccountName) return;
    setNameInput(googleAccountName);
    onUpdateUser({ username: googleAccountName });
    sound.playChipSound();
    setIsEditingName(false);
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    const targetEmail = (user?.email || customEmail).trim().toLowerCase();
    if (!targetEmail || !targetEmail.includes('@')) {
      setPasswordError('Please provide a valid email address.');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match. Please verify both fields.');
      return;
    }

    setPasswordLoading(true);
    sound.playChipSound();

    const userWithEmail: UserProfile = {
      ...user,
      email: targetEmail,
    };

    const res = await setUserPassword(newPassword, userWithEmail);
    setPasswordLoading(false);

    if (!res.success) {
      setPasswordError(res.error || 'Failed to save password. Please try again.');
      return;
    }

    sound.playWinFanfare();
    setPasswordSuccess(`Password configured! You can now log into your account using ${targetEmail} and your password.`);
    setNewPassword('');
    setConfirmPassword('');
    onUpdateUser({
      ...userWithEmail,
      hasPassword: true,
    });
  };

  const winRate =
    user.gamesPlayed > 0 ? Math.round((user.gamesWon / user.gamesPlayed) * 100) : 0;

  // By default, only 3 titles are shown, with the currently selected title kept at the very top (index 0)
  const isCustomTitleActive = !isPredefinedTitle && Boolean(user.equipped?.title);
  const customTitleName = isCustomTitleActive
    ? user.equipped?.title || 'Custom Title'
    : customTitleInput.trim() || 'Custom Title';

  const customTitleItem = {
    id: 'custom-title-item',
    name: customTitleName,
    icon: '✨',
    desc: 'Personalized Player Honorific',
    isCustom: true,
  };

  const allTitles = [
    ...AVAILABLE_TITLES.map((t) => ({ ...t, isCustom: false })),
    customTitleItem,
  ];

  // Selected title always stays on top
  const selectedTitleItem = allTitles.find((t) =>
    t.isCustom ? isCustomTitleActive : t.id === currentTitle
  );
  const remainingTitles = allTitles.filter((t) => t !== selectedTitleItem);
  const sortedTitles = selectedTitleItem ? [selectedTitleItem, ...remainingTitles] : allTitles;
  const visibleTitles = showMoreTitles ? sortedTitles : sortedTitles.slice(0, 3);

  return (
    <div
      id="profile-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="profile-modal-content"
        className="w-full max-w-md max-h-[92dvh] bg-gradient-to-b from-[#0d1526] via-[#090f1d] to-[#050811] border border-amber-500/45 rounded-3xl shadow-2xl shadow-black/90 relative overflow-hidden flex flex-col text-slate-100 select-none animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow accents */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-44 h-44 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-44 h-44 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="p-4 sm:p-5 pb-3 border-b border-amber-500/20 flex items-center justify-between shrink-0 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shadow-md">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif font-black text-base sm:text-lg text-amber-100 flex items-center gap-1.5">
                Player Profile
                {isFirstTime && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 font-mono font-bold uppercase">
                    New Account
                  </span>
                )}
              </h2>
              <p className="text-[10.5px] text-slate-400">
                Avatar, name, title &amp; email password settings
              </p>
            </div>
          </div>

          <button
            id="profile-modal-close-btn"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-900 text-slate-400 hover:text-amber-200 border border-slate-800 hover:border-amber-500/40 active:scale-95 transition-all cursor-pointer"
            title="Close Profile"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          {/* Welcome Banner for First-Time Users */}
          {isFirstTime && (
            <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-500/15 via-emerald-500/10 to-amber-500/15 border border-amber-400/40 flex items-start gap-2.5 text-xs text-amber-200 animate-in fade-in duration-300">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-amber-100">Welcome to Langur Burja!</div>
                <div className="text-[11px] text-slate-300 mt-0.5">
                  Your account is connected. Choose your preferred avatar, name, and festival title below.
                </div>
              </div>
            </div>
          )}

          {/* 1. Live Player Card Preview */}
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-amber-500/30 flex items-center gap-3.5 shadow-lg relative overflow-hidden">
            <div className="relative shrink-0">
              <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-amber-400/80 shadow-md bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
                <UserAvatar avatar={user.avatar} name={user.username} size="xl" className="w-full h-full rounded-none" />
              </div>
              <div className="absolute -bottom-1 -right-1 p-1 bg-amber-500 rounded-full border border-slate-950 shadow">
                <Crown className="w-3 h-3 text-slate-950 fill-slate-950" />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-serif font-black text-base text-amber-100 truncate">
                  {user.username}
                </h3>
                <span className="text-[9.5px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30 truncate max-w-[170px]">
                  {user.equipped?.title || 'Festival Patron'}
                </span>
              </div>

              <div className="flex items-center gap-3 mt-1.5 text-xs">
                <div className="flex items-center gap-1 font-mono text-amber-300 font-bold">
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  <span>{user.coins.toLocaleString()} 🪙</span>
                </div>

                <div className="text-[10px] text-slate-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{user.isGuest ? 'Guest' : user.authProvider === 'google' ? 'Google Account' : 'Email Account'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Career Statistics (ON TOP, directly under player card preview) */}
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-amber-500/25 space-y-2 shadow-md">
            <div className="text-[10px] font-mono uppercase text-amber-300 font-bold tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span>Career Statistics</span>
              </span>
              <span className="text-[9px] text-slate-400 font-mono">
                {user.gamesPlayed > 0 ? `${winRate}% Win Rate` : 'No Games Yet'}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
                <div className="text-[9px] uppercase font-mono text-slate-400">Rounds</div>
                <div className="text-xs sm:text-sm font-mono font-black text-slate-100 mt-0.5">
                  {user.gamesPlayed}
                </div>
              </div>

              <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
                <div className="text-[9px] uppercase font-mono text-slate-400">Wins</div>
                <div className="text-xs sm:text-sm font-mono font-black text-emerald-400 mt-0.5">
                  {user.gamesWon}
                </div>
              </div>

              <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
                <div className="text-[9px] uppercase font-mono text-slate-400">Win Rate</div>
                <div className="text-xs sm:text-sm font-mono font-black text-amber-300 mt-0.5">
                  {winRate}%
                </div>
              </div>

              <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
                <div className="text-[9px] uppercase font-mono text-slate-400">Best Win</div>
                <div className="text-xs sm:text-sm font-mono font-black text-amber-200 mt-0.5 truncate">
                  {(user.biggestWin || 0).toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Change Player Name */}
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-1.5 min-w-0">
              <label className="text-[10.5px] font-mono uppercase text-amber-300 font-bold flex items-center gap-1.5 tracking-wider shrink-0">
                <Edit2 className="w-3 h-3 text-amber-400" />
                <span>Player Name</span>
              </label>

              {/* Quick Google Name shortcut */}
              {googleAccountName && googleAccountName !== user.username && (
                <button
                  type="button"
                  onClick={handleApplyGoogleName}
                  className="text-[10px] text-amber-300 hover:text-amber-100 flex items-center gap-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 px-2 py-0.5 rounded-lg transition-colors cursor-pointer truncate max-w-[210px] shrink"
                  title="Use original name from Google account"
                >
                  <svg className="w-2.5 h-2.5 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span className="truncate">Google: {googleAccountName}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full min-w-0">
              <input
                id="profile-username-input"
                type="text"
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  setIsEditingName(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName();
                }}
                maxLength={18}
                placeholder="Enter player name"
                className="flex-1 min-w-0 bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-2 text-sm font-bold text-amber-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-400 transition-all"
              />
              <button
                type="button"
                onClick={handleSaveName}
                disabled={!nameInput.trim() || nameInput.trim() === user.username}
                className="shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-all shadow cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>Save</span>
              </button>
            </div>
          </div>

          {/* 4. Avatar Selection: Google Photo among all avatars */}
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10.5px] font-mono uppercase text-amber-300 font-bold flex items-center gap-1.5 tracking-wider">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>Select Avatar</span>
              </label>
              <span className="text-[10px] text-slate-400">
                {isGooglePhotoSelected ? 'Google Photo Selected' : 'Custom Avatar'}
              </span>
            </div>

            {/* Avatars Grid (Google account photo placed right among the avatar options) */}
            <div className="grid grid-cols-6 sm:grid-cols-7 gap-1.5">
              {/* Google Photo as an avatar item */}
              {googlePhotoUrl && (
                <button
                  type="button"
                  id="profile-select-google-avatar-btn"
                  onClick={handleSelectGoogleAvatar}
                  className={`h-10 rounded-xl flex items-center justify-center shrink-0 border transition-all cursor-pointer relative overflow-hidden ${
                    isGooglePhotoSelected
                      ? 'bg-amber-500/30 border-amber-400 scale-105 shadow-md ring-2 ring-amber-400'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-800/80'
                  }`}
                  title="Select Google Account Photo (Default)"
                >
                  <img
                    src={googlePhotoUrl}
                    alt="Google Avatar"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-0 right-0 p-0.5 bg-slate-950/90 rounded-tl">
                    <svg className="w-2 h-2" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                  </div>
                </button>
              )}

              {/* Festival Emojis */}
              {FESTIVAL_AVATARS.map((av) => {
                const isSelected = user.avatar === av;
                return (
                  <button
                    key={av}
                    type="button"
                    onClick={() => handleSelectAvatar(av)}
                    className={`h-10 rounded-xl flex items-center justify-center text-xl shrink-0 border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/30 border-amber-400 scale-105 shadow-md ring-2 ring-amber-400'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-800/80'
                    }`}
                    title={`Select ${av}`}
                  >
                    {av}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Player Title Selection (Collapsed to 2 rows by default, Expand button + Custom Title) */}
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-[10.5px] font-mono uppercase text-amber-300 font-bold flex items-center gap-1.5 tracking-wider">
                <Crown className="w-3 h-3 text-amber-400" />
                <span>Player Title</span>
              </label>
              <span className="text-[10px] text-amber-200/90 font-serif truncate max-w-[160px]">
                {user.equipped?.title || 'Festival Player'}
              </span>
            </div>

            {/* By default only 3 titles are shown, with the selected title kept at the top */}
            <div className="space-y-1.5 transition-all duration-200">
              {visibleTitles.map((titleObj) => {
                if (titleObj.isCustom) {
                  return (
                    <div
                      key="custom-title-item"
                      className={`p-2 rounded-xl text-left border flex items-center justify-between gap-2 transition-all ${
                        isCustomTitleActive
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200 ring-1 ring-amber-400/50'
                          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      {isEditingCustom ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const trimmed = customTitleInput.trim();
                            if (trimmed) {
                              handleSelectTitle(trimmed);
                              sound.playWinFanfare();
                              setIsEditingCustom(false);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 w-full min-w-0"
                        >
                          <span className="text-xs shrink-0">✨</span>
                          <input
                            type="text"
                            autoFocus
                            value={customTitleInput}
                            onChange={(e) => setCustomTitleInput(e.target.value)}
                            placeholder="Enter custom title"
                            maxLength={22}
                            className="flex-1 min-w-0 bg-slate-950 border border-amber-400 rounded-lg px-2.5 py-1 text-xs text-amber-100 placeholder-slate-500 focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={!customTitleInput.trim()}
                            className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shrink-0 cursor-pointer disabled:opacity-40"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsEditingCustom(false)}
                            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs shrink-0 cursor-pointer"
                          >
                            ✕
                          </button>
                        </form>
                      ) : (
                        <div
                          onClick={() => {
                            const targetTitle = customTitleInput.trim() || (!isPredefinedTitle ? user.equipped?.title : '');
                            if (targetTitle) {
                              handleSelectTitle(targetTitle);
                            } else {
                              setIsEditingCustom(true);
                            }
                          }}
                          className="flex items-center justify-between gap-2 w-full cursor-pointer"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-xs font-bold truncate">
                              <span>✨</span>
                              <span className="truncate">
                                {isCustomTitleActive
                                  ? user.equipped?.title
                                  : customTitleInput.trim() || 'Custom Title'}
                              </span>
                              <span className="text-[8px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 font-mono uppercase font-bold shrink-0">
                                CUSTOM
                              </span>
                            </div>
                            <div className="text-[9.5px] text-slate-400 truncate mt-0.5">
                              Personalized Player Honorific
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsEditingCustom(true);
                              }}
                              title="Edit Custom Title"
                              className="p-1 rounded-md text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition-colors"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            {isCustomTitleActive && (
                              <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                const isSelected = !isCustomTitleActive && (user.equipped?.title || 'Festival Player') === titleObj.id;
                return (
                  <button
                    key={titleObj.id}
                    type="button"
                    onClick={() => handleSelectTitle(titleObj.id)}
                    className={`p-2 rounded-xl text-left border flex items-center justify-between gap-2 transition-all cursor-pointer w-full ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200 ring-1 ring-amber-400/50'
                        : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-bold truncate">
                        <span>{titleObj.icon}</span>
                        <span className="truncate">{titleObj.name}</span>
                      </div>
                      <div className="text-[9.5px] text-slate-400 truncate mt-0.5">
                        {titleObj.desc}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Show More / Show Less Button */}
            {sortedTitles.length > 3 && (
              <button
                type="button"
                id="profile-toggle-titles-btn"
                onClick={() => {
                  sound.playChipSound();
                  setShowMoreTitles(!showMoreTitles);
                }}
                className="w-full py-1.5 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border border-slate-800 text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <span>
                  {showMoreTitles
                    ? 'Show Fewer Titles'
                    : `Show More Titles (${sortedTitles.length - 3} more)`}
                </span>
                {showMoreTitles ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
          </div>

          {/* 6. Email Login & Password Setting (With RED 'Needs Setup' Urgency Badge) */}
          <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-amber-500/35 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <KeyRound className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-amber-100 flex items-center gap-1.5">
                    <span>Email Login &amp; Password</span>
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    Access your account with email &amp; password anywhere
                  </p>
                </div>
              </div>

              {/* Urgency Badge: Green if ready, Vibrant Urgent RED if needs setup */}
              <span
                id="profile-password-status-badge"
                className={`text-[9.5px] font-mono font-black px-2.5 py-0.5 rounded-full border flex items-center gap-1 uppercase tracking-wider ${
                  isPasswordReady
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                    : 'bg-rose-500/25 text-rose-200 border-rose-500/60 shadow-md shadow-rose-950/50 animate-pulse ring-1 ring-rose-500/40'
                }`}
              >
                {isPasswordReady ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Ready</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3 text-rose-400" />
                    <span>Needs Setup</span>
                  </>
                )}
              </span>
            </div>

            {/* Email Account Info */}
            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[9px] text-slate-500 uppercase font-mono block">Linked Email</span>
                <span className="text-slate-200 font-bold truncate block">
                  {user.email || customEmail || 'No email attached (Guest)'}
                </span>
              </div>

              <button
                type="button"
                id="profile-toggle-password-form-btn"
                onClick={() => {
                  setIsPasswordFormOpen(!isPasswordFormOpen);
                  setPasswordError(null);
                  setPasswordSuccess(null);
                }}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all cursor-pointer shrink-0 ${
                  !isPasswordReady
                    ? 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-500/50 text-rose-200'
                    : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-400/30 text-amber-300'
                }`}
              >
                {isPasswordFormOpen ? 'Hide' : isPasswordReady ? 'Change Password' : 'Set Password'}
              </button>
            </div>

            {/* Expandable Password Setup Form */}
            {isPasswordFormOpen && (
              <form onSubmit={handleSavePassword} className="space-y-2.5 pt-1 animate-in fade-in duration-200">
                {/* Custom Email Input if user has no email */}
                {!user.email && (
                  <div>
                    <label className="text-[10px] font-mono text-slate-400 block mb-1">
                      Email Address:
                    </label>
                    <input
                      type="email"
                      required
                      value={customEmail}
                      onChange={(e) => setCustomEmail(e.target.value)}
                      placeholder="e.g. magarjack0@gmail.com"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-amber-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-mono text-slate-400 block mb-1">
                    New Password (min 6 chars):
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-3 pr-9 py-2 text-xs font-bold text-amber-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-slate-400 block mb-1">
                    Confirm Password:
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-3 pr-9 py-2 text-xs font-bold text-amber-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {passwordError && (
                  <div className="p-2 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-[11px] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{passwordError}</span>
                  </div>
                )}

                {passwordSuccess && (
                  <div className="p-2 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-[11px] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>{passwordSuccess}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-bold text-xs shadow flex items-center justify-center gap-1.5 active:scale-98 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {passwordLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Password...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>{isPasswordReady ? 'Update Password' : 'Save & Link Password'}</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* 7. Account Session & Sign Out */}
          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-slate-200">
                {user.isGuest ? 'Guest Player' : user.email || 'Cloud Account'}
              </div>
              <div className="text-[10px] text-slate-400">
                {user.isGuest ? 'Progress saved locally' : 'Synchronized with Supabase Cloud'}
              </div>
            </div>

            {user.isGuest ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAuth?.();
                }}
                className="py-1.5 px-3 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs shadow flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
              >
                <Sparkles className="w-3 h-3 fill-slate-950" />
                <span>Link Google</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onSignOut?.();
                  onClose();
                }}
                className="py-1 px-2.5 rounded-lg bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-500/40 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <LogOut className="w-3 h-3" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </div>

        {/* Modal Footer: Done Button */}
        <div className="p-3.5 sm:p-4 border-t border-amber-500/20 bg-slate-950/90 shrink-0">
          <button
            type="button"
            id="profile-modal-done-btn"
            onClick={() => {
              handleSaveName();
              onClose();
            }}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 hover:from-amber-400 text-slate-950 font-black text-xs font-serif tracking-wider shadow-lg active:scale-98 transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>{isFirstTime ? 'SAVE & START PLAYING' : 'DONE'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
