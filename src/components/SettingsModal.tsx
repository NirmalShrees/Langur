import React, { useState } from 'react';
import {
  X,
  Settings,
  Volume2,
  VolumeX,
  HelpCircle,
  Palette,
  LogOut,
  Sparkles,
  BookOpen,
  ChevronRight,
} from 'lucide-react';
import { sound } from '../utils/audio.js';
import { SYMBOL_KEYS, LANGUR_BURJA_SYMBOLS, UserProfile, SymbolType } from '../types.js';
import { getSymbolImageDataUrl } from '../utils/diceTextures.js';

const PURE_NEPALI_NAMES: Record<SymbolType, string> = {
  jhanda: 'झण्डा',
  burja: 'बुर्जा',
  itta: 'ईंटा',
  paan: 'पान',
  hukum: 'हुकुम',
  chidi: 'चिडी',
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenRules: () => void;
  onReturnToMainMenu: () => void;
  tableTheme: 'emerald' | 'crimson' | 'midnight';
  onChangeTableTheme: (theme: 'emerald' | 'crimson' | 'midnight') => void;
  isInGame?: boolean;
  user?: UserProfile;
  onOpenAuth?: () => void;
  onOpenProfile?: () => void;
  onUpdateUser?: (updated: UserProfile) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onOpenRules,
  onReturnToMainMenu,
  tableTheme,
  onChangeTableTheme,
  isInGame = false,
}) => {
  const [isMuted, setIsMuted] = useState(sound.getIsMuted());
  const [activeTab, setActiveTab] = useState<'settings' | 'rules'>('settings');

  if (!isOpen) return null;

  const toggleSound = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
    if (!muted) {
      sound.playChipSound();
    }
  };

  const handleTestSound = () => {
    if (isMuted) {
      sound.setMuted(false);
      setIsMuted(false);
    }
    sound.playWinCelebration();
  };

  return (
    <div
      id="game-settings-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-4"
    >
      <div className="relative w-full max-w-md bg-slate-900 rounded-3xl border border-amber-900/40 shadow-2xl p-4 sm:p-5 overflow-hidden flex flex-col h-[520px] max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg text-slate-950">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-amber-100 font-serif">
                Game Settings & Rules
              </h2>
              <p className="text-[11px] text-slate-400">
                Audio, how to play, table theme & menu
              </p>
            </div>
          </div>

          <button
            id="settings-close-btn"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation: Settings vs Rules */}
        <div className="flex items-center gap-1.5 mt-3 p-1 rounded-xl bg-slate-950 border border-slate-800 shrink-0">
          <button
            id="settings-tab-btn"
            onClick={() => setActiveTab('settings')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'settings'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Preferences</span>
          </button>
          <button
            id="settings-rules-tab-btn"
            onClick={() => setActiveTab('rules')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'rules'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Rules & Guide</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto mt-3 pr-0.5 space-y-3.5 text-xs text-slate-300">
          {activeTab === 'settings' ? (
            <>
              {/* 1. Sound & Audio Controls */}
              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="font-bold text-slate-200 text-xs">Game Audio & FX</div>
                      <div className="text-[10px] text-slate-400">
                        {isMuted ? 'Sound muted' : 'Dice rattle, bounces & fanfare active'}
                      </div>
                    </div>
                  </div>

                  {/* Toggle Button */}
                  <button
                    id="settings-sound-toggle-btn"
                    onClick={toggleSound}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                      !isMuted
                        ? 'bg-emerald-500 text-slate-950 font-black shadow-sm'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {!isMuted ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* Sound Test Action */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-900">
                  <span className="text-[11px] text-slate-400">Test audio synthesizer:</span>
                  <button
                    onClick={handleTestSound}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1 active:scale-95 transition-all"
                  >
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>Play Chime</span>
                  </button>
                </div>
              </div>

              {/* 2. Table Felt Theme Customization */}
              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <Palette className="w-4 h-4 text-amber-400" />
                  <span className="font-bold text-slate-200 text-xs">Table Felt Color</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      if (tableTheme !== 'emerald') {
                        onChangeTableTheme('emerald');
                        sound.playChipSound();
                      }
                    }}
                    className={`p-2 rounded-xl border text-center active:scale-95 transition-transform ${
                      tableTheme === 'emerald'
                        ? 'border-emerald-400 bg-emerald-950/60 text-emerald-200 font-bold shadow-md'
                        : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="w-4 h-4 rounded-full bg-emerald-600 mx-auto mb-1 border border-emerald-400/40" />
                    <span className="text-[10px]">Emerald</span>
                  </button>

                  <button
                    onClick={() => {
                      if (tableTheme !== 'crimson') {
                        onChangeTableTheme('crimson');
                        sound.playChipSound();
                      }
                    }}
                    className={`p-2 rounded-xl border text-center active:scale-95 transition-transform ${
                      tableTheme === 'crimson'
                        ? 'border-rose-400 bg-rose-950/60 text-rose-200 font-bold shadow-md'
                        : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="w-4 h-4 rounded-full bg-rose-700 mx-auto mb-1 border border-rose-400/40" />
                    <span className="text-[10px]">Crimson</span>
                  </button>

                  <button
                    onClick={() => {
                      if (tableTheme !== 'midnight') {
                        onChangeTableTheme('midnight');
                        sound.playChipSound();
                      }
                    }}
                    className={`p-2 rounded-xl border text-center active:scale-95 transition-transform ${
                      tableTheme === 'midnight'
                        ? 'border-blue-400 bg-blue-950/60 text-blue-200 font-bold shadow-md'
                        : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="w-4 h-4 rounded-full bg-indigo-800 mx-auto mb-1 border border-blue-400/40" />
                    <span className="text-[10px]">Midnight</span>
                  </button>
                </div>
              </div>

              {/* Exit to Main Menu (only visible when in game) */}
              {isInGame && (
                <button
                  id="settings-exit-to-menu-btn"
                  onClick={() => {
                    onClose();
                    onReturnToMainMenu();
                  }}
                  className="w-full p-3 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-amber-500/30 hover:border-amber-400 text-amber-200 flex items-center justify-between active:scale-98 transition-all group shadow-md"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center border border-amber-500/30 text-amber-300">
                      <LogOut className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-xs text-amber-200 group-hover:text-amber-100">
                        Exit to Main Menu
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Return to festival lobby & game modes
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-amber-400/70 group-hover:translate-x-0.5 transition-transform" />
                </button>
              )}
            </>
          ) : (
            /* Tab: Rules & Guide */
            <div className="space-y-3">
              {/* How it works */}
              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1.5">
                <div className="font-bold text-amber-300 text-xs flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4" />
                  <span>How Langur Burja Works</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-300">
                  Langur Burja (लङ्गुर बुर्जा) is played with 6 authentic 6-sided dice shaken in a tumbler.
                  Bet on any of the 6 symbols. When the tumbler lifts:
                </p>
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900/80 text-[10px] font-mono">
                    <span className="text-slate-300">0 matches:</span>
                    <span className="text-rose-400 font-bold">Wager lost</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900/80 text-[10px] font-mono">
                    <span className="text-slate-300">1 match:</span>
                    <span className="text-amber-300 font-bold">Bet returned (1:1 refund)</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900/80 text-[10px] font-mono">
                    <span className="text-emerald-300">2 matches:</span>
                    <span className="text-emerald-400 font-bold">2x profit + original bet</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900/80 text-[10px] font-mono">
                    <span className="text-emerald-300">3 matches:</span>
                    <span className="text-emerald-400 font-bold">3x profit + original bet</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900/80 text-[10px] font-mono">
                    <span className="text-emerald-300">4+ matches:</span>
                    <span className="text-emerald-400 font-bold">4x - 6x jackpot payout!</span>
                  </div>
                </div>
              </div>

              {/* The 6 Sacred Symbols with authentic dice face textures */}
              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-200 text-xs flex items-center gap-1.5">
                    <span>🎲</span>
                    <span>The 6 Sacred Symbols</span>
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">Traditional Faces</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {SYMBOL_KEYS.map((k) => {
                    const s = LANGUR_BURJA_SYMBOLS[k];
                    const isRed = k === 'jhanda' || k === 'paan' || k === 'itta';
                    const isGold = k === 'burja';
                    const isGreen = k === 'chidi';

                    return (
                      <div
                        key={k}
                        className={`p-2 rounded-xl border flex items-center gap-2.5 transition-all shadow-sm ${
                          isGold
                            ? 'bg-gradient-to-r from-amber-950/50 via-slate-900 to-slate-950 border-amber-400/50'
                            : isRed
                            ? 'bg-gradient-to-r from-rose-950/50 via-slate-900 to-slate-950 border-rose-500/50'
                            : isGreen
                            ? 'bg-gradient-to-r from-emerald-950/50 via-slate-900 to-slate-950 border-emerald-500/50'
                            : 'bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border-slate-700/60'
                        }`}
                      >
                        {/* Scaled symbol image texture on ivory parchment, zoomed in to hide outer black border */}
                        <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center border border-amber-900/40 shadow-sm shrink-0 bg-[#FAF4D0]">
                          <img
                            src={getSymbolImageDataUrl(k)}
                            alt={s.name}
                            className="w-full h-full object-cover scale-[1.28] pointer-events-none select-none"
                          />
                        </div>
                        <div className="min-w-0 flex-1 overflow-visible py-0.5">
                          <span className="font-nepali text-xs sm:text-[13px] font-bold text-amber-200 block pt-1 pb-0.5 leading-normal select-none overflow-visible">
                            {PURE_NEPALI_NAMES[k]}
                          </span>
                          <span className="text-[10px] font-mono text-slate-300 font-bold uppercase tracking-wider block truncate">
                            {s.name}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Full Rules Modal Button */}
              <button
                onClick={() => {
                  onClose();
                  onOpenRules();
                }}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all flex items-center justify-center gap-1.5 shadow-md"
              >
                <span>Open Detailed Historical Rules</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-3 mt-3 border-t border-slate-800 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
