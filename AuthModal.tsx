import React, { useState, useEffect } from 'react';
import {
  Crown,
  Dice5,
  X,
  AlertCircle,
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  Loader2,
} from 'lucide-react';
import { UserProfile } from '../types.js';
import {
  signInWithGoogle,
  signInAsGuest,
  signInWithEmail,
} from '../services/authService.js';
import { sound } from '../utils/audio.js';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: UserProfile) => void;
  canDismiss?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
  canDismiss = true,
}) => {
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGoogleAccountWithoutPassword, setIsGoogleAccountWithoutPassword] = useState<boolean>(false);

  // Clear states when modal closes or opens
  useEffect(() => {
    if (!isOpen) {
      setLoading(false);
      setGoogleLoading(false);
      setGuestLoading(false);
      setErrorMsg(null);
      setIsGoogleAccountWithoutPassword(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 1. Email Login Submit (for registered accounts with a password)
  const handleEmailLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsGoogleAccountWithoutPassword(false);

    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !passwordInput) {
      setErrorMsg('Please enter both your email address and password.');
      return;
    }

    setLoading(true);
    sound.playChipSound();

    const res = await signInWithEmail(cleanEmail, passwordInput);
    setLoading(false);

    if (res.error) {
      setErrorMsg(res.error);
      if (res.isGoogleAccountWithoutPassword) {
        setIsGoogleAccountWithoutPassword(true);
      }
      return;
    }

    if (res.user) {
      sound.playWinFanfare();
      onAuthSuccess(res.user);
      onClose();
    }
  };

  // 2. Google Sign In
  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setIsGoogleAccountWithoutPassword(false);
    setGoogleLoading(true);
    sound.playChipSound();

    const res = await signInWithGoogle();
    if (res.error) {
      setErrorMsg(res.error);
      setGoogleLoading(false);
      return;
    }

    // Browser will redirect to Google account chooser
    setGoogleLoading(true);
  };

  // 3. Guest Play
  const handleGuestPlay = async () => {
    setErrorMsg(null);
    setIsGoogleAccountWithoutPassword(false);
    setGuestLoading(true);
    sound.playChipSound();

    const res = await signInAsGuest();
    setGuestLoading(false);
    onAuthSuccess(res.user);
    onClose();
  };

  return (
    <div
      id="auth-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={canDismiss ? onClose : undefined}
    >
      <div
        id="auth-modal-container"
        className="w-full max-w-sm sm:max-w-md bg-gradient-to-b from-[#0d1424] via-[#090e1a] to-[#050811] border border-amber-500/40 rounded-3xl p-5 sm:p-6 shadow-2xl shadow-black/90 relative overflow-hidden text-slate-100 select-none animate-in zoom-in-95 duration-200 max-h-[94vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle decorative warm glow */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-44 h-44 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-44 h-44 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        {canDismiss && (
          <button
            id="auth-modal-close-btn"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800/80 text-slate-400 hover:text-amber-200 border border-slate-700/80 active:scale-95 transition-all z-10 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Header Branding */}
        <div className="text-center mb-4 shrink-0">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-700 border border-amber-300/60 shadow-lg shadow-amber-950/80 mb-2">
            <Crown className="w-5 h-5 text-slate-950 fill-slate-950" />
          </div>
          <h2 className="font-game-title font-black text-xl sm:text-2xl text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-amber-300 to-amber-500 tracking-wider drop-shadow-sm">
            LANGUR BURJA
          </h2>
          <p className="text-[11.5px] text-amber-300/80 flex items-center justify-center gap-1.5 mt-0.5">
            <span className="font-nepali-title text-amber-200 font-bold">लङ्गुर बुर्जा</span>
            <span className="text-amber-500/60">•</span>
            <span className="font-serif text-slate-300 text-[11px]">Festival Dice Table</span>
          </p>
        </div>

        {/* Unified Scrollable Body: All three options in order */}
        <div className="overflow-y-auto flex-1 pr-0.5 space-y-3.5 scrollbar-thin scrollbar-thumb-slate-800">
          {/* ========================================================= */}
          {/* 1. EMAIL LOGIN (Option 1 - Registered Accounts Only) */}
          {/* ========================================================= */}
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/90 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-200">
                <Mail className="w-3.5 h-3.5 text-amber-400" />
                <span>Email Login</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                Registered Accounts
              </span>
            </div>

            {/* Google Account Without Password Notification */}
            {isGoogleAccountWithoutPassword && (
              <div className="p-2.5 rounded-xl bg-amber-950/50 border border-amber-500/40 text-[11px] text-amber-200 space-y-1">
                <div className="font-bold flex items-center gap-1 text-amber-300">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Google Account Detected</span>
                </div>
                <p className="text-slate-300 leading-snug">
                  You previously connected with Google. Please use <strong>Continue with Google</strong> below to log in, then configure your email password in your Player Profile.
                </p>
              </div>
            )}

            {/* Email & Password Form */}
            <form onSubmit={handleEmailLoginSubmit} className="space-y-2">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <input
                    id="auth-email-input"
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-amber-400"
                  />
                  <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="auth-password-input"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-8 pr-8 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-amber-400"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <button
                id="auth-email-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 hover:from-amber-400 text-slate-950 font-bold text-xs tracking-wider shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 disabled:opacity-60 cursor-pointer mt-1"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Sign In with Email</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Divider */}
          <div className="relative py-0.5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800" />
            </div>
            <div className="relative flex justify-center text-[9.5px] uppercase font-mono tracking-wider">
              <span className="bg-[#090e1a] px-2.5 text-slate-500">Or connect with</span>
            </div>
          </div>

          {/* ========================================================= */}
          {/* 2. CONTINUE WITH GOOGLE (Option 2) */}
          {/* ========================================================= */}
          <div>
            <button
              id="auth-google-signin-btn"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading || guestLoading}
              className="w-full py-3 px-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs sm:text-sm tracking-wide shadow-lg border border-slate-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 disabled:opacity-80 cursor-pointer"
            >
              {googleLoading ? (
                <div className="flex items-center justify-center gap-2 text-slate-800 text-xs">
                  <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-amber-600 rounded-full animate-spin shrink-0" />
                  <span>Connecting to Google...</span>
                </div>
              ) : (
                <>
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </>
              )}
            </button>

            {googleLoading && (
              <div className="flex items-center justify-between px-1 pt-1.5 text-xs animate-in fade-in">
                <span className="text-amber-300 text-[10.5px] animate-pulse flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Redirecting to Google...
                </span>
                <button
                  type="button"
                  onClick={() => setGoogleLoading(false)}
                  className="text-slate-300 hover:text-white underline font-semibold text-[10.5px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 active:scale-95 transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* 3. PLAY AS GUEST (Option 3) */}
          {/* ========================================================= */}
          <div>
            <button
              id="auth-guest-play-btn"
              onClick={handleGuestPlay}
              disabled={guestLoading || loading || googleLoading}
              className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 hover:from-amber-400 text-slate-950 font-serif font-black text-xs sm:text-sm tracking-wider shadow-lg shadow-amber-500/20 border border-amber-300 active:scale-[0.98] transition-all flex items-center justify-between gap-2 disabled:opacity-60 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Dice5 className="w-4 h-4 text-slate-950 shrink-0" />
                <span>Play as Guest</span>
              </div>
              <span className="text-[10.5px] px-2.5 py-0.5 rounded-full bg-slate-950/20 font-mono font-bold">
                Instant • 5,000 🪙
              </span>
            </button>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="leading-tight text-[11px]">{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer Note */}
        <div className="mt-3 text-center shrink-0">
          <p className="text-[10px] text-slate-400 font-sans">
            Coins and unlocked mats are saved securely to your player session.
          </p>
        </div>
      </div>
    </div>
  );
};
