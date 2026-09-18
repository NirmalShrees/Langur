import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SymbolType, LANGUR_BURJA_SYMBOLS, RoundResultSummary, GamePhase } from '../types.js';
import { sound } from '../utils/audio.js';
import confetti from 'canvas-confetti';

interface DiceArenaProps {
  phase: GamePhase;
  timer: number;
  dice: SymbolType[];
  lastResult?: RoundResultSummary;
  diceSkin?: string;
  roundNumber: number;
}

export const DiceArena: React.FC<DiceArenaProps> = ({
  phase,
  timer,
  dice,
  lastResult,
  diceSkin = 'dice_classic',
  roundNumber,
}) => {
  const [isShaking, setIsShaking] = useState(false);

  useEffect(() => {
    if (phase === 'rolling') {
      setIsShaking(true);
      sound.playDiceShakeSound();
      const shakeInterval = setInterval(() => {
        sound.playDiceShakeSound();
      }, 500);

      const timerOut = setTimeout(() => {
        setIsShaking(false);
        clearInterval(shakeInterval);
        sound.playDiceLandSound();
      }, 3400);

      return () => {
        clearInterval(shakeInterval);
        clearTimeout(timerOut);
      };
    }
  }, [phase]);

  // Celebrate on outcome if there are winning symbols
  useEffect(() => {
    if (phase === 'payout' && lastResult) {
      if (lastResult.winningSymbols && lastResult.winningSymbols.length > 0) {
        sound.playWinFanfare();

        // Check if high match (4+ of a kind) for jackpot confetti
        const counts = Object.values(lastResult.symbolCounts || {}) as number[];
        const maxMatch = counts.length > 0 ? Math.max(...counts) : 0;
        if (maxMatch >= 4) {
          sound.playJackpotSound();
          confetti({
            particleCount: 80,
            spread: 90,
            origin: { y: 0.5 },
            colors: ['#f59e0b', '#ec4899', '#3b82f6', '#10b981'],
          });
        }
      }
    }
  }, [phase, lastResult]);

  // Skin styling helpers
  const getSkinStyles = () => {
    switch (diceSkin) {
      case 'dice_gold':
        return {
          cubeBg: 'bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 border-amber-200/90 text-amber-950 shadow-amber-500/40',
          pipBg: 'bg-amber-950',
        };
      case 'dice_neon':
        return {
          cubeBg: 'bg-gradient-to-br from-cyan-950 via-slate-900 to-cyan-900 border-cyan-400 text-cyan-300 shadow-cyan-500/50',
          pipBg: 'bg-cyan-400',
        };
      case 'dice_crimson':
        return {
          cubeBg: 'bg-gradient-to-br from-red-600 via-rose-700 to-red-950 border-rose-400 text-amber-200 shadow-rose-600/40',
          pipBg: 'bg-amber-300',
        };
      case 'dice_obsidian':
        return {
          cubeBg: 'bg-gradient-to-br from-slate-900 via-purple-950 to-slate-950 border-purple-500 text-purple-200 shadow-purple-900/50',
          pipBg: 'bg-purple-400',
        };
      case 'dice_classic':
      default:
        return {
          cubeBg: 'bg-gradient-to-br from-stone-100 via-stone-200 to-stone-300 border-stone-300 text-slate-900 shadow-slate-950/40',
          pipBg: 'bg-slate-900',
        };
    }
  };

  const skin = getSkinStyles();

  // Compute symbol frequency counts for active dice
  const currentCounts: Record<SymbolType, number> = {
    jhanda: 0,
    burja: 0,
    itta: 0,
    paan: 0,
    hukum: 0,
    chidi: 0,
  };
  dice.forEach((d) => {
    if (d) currentCounts[d] = (currentCounts[d] || 0) + 1;
  });

  return (
    <div
      id="dice-arena-container"
      className="relative w-full rounded-2xl bg-gradient-to-b from-slate-900/90 via-slate-900/95 to-slate-950 border border-amber-900/40 p-4 sm:p-6 shadow-2xl overflow-hidden"
    >
      {/* Background Subtle Wood & Felt Ambience Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(217,119,6,0.08)_0%,transparent_70%)] pointer-events-none" />

      {/* Top Arena Header Status */}
      <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="px-2.5 py-1 rounded-lg bg-slate-800/80 text-xs font-semibold text-amber-300 border border-slate-700">
            Round #{roundNumber}
          </div>
          <span className="text-xs text-slate-400 font-medium">6 Himalayan Langur Burja Dice</span>
        </div>

        {/* Phase Badge */}
        <div className="flex items-center gap-2">
          {phase === 'betting' && (
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
              Betting Open • {timer}s
            </span>
          )}
          {phase === 'rolling' && (
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-bounce">
              🎲 Rolling Tumbler...
            </span>
          )}
          {phase === 'payout' && (
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40">
              Payout Phase • {timer}s
            </span>
          )}
        </div>
      </div>

      {/* Center Tumbler & Dice Rolling Surface */}
      <div className="relative min-h-[160px] sm:min-h-[190px] flex items-center justify-center py-2">
        {/* Shaking Tumbler / Cup Animation */}
        <AnimatePresence>
          {phase === 'rolling' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: -20 }}
              animate={{
                scale: 1,
                opacity: 1,
                y: [0, -12, 4, -8, 2, 0],
                rotate: [-8, 8, -6, 6, -3, 3, 0],
              }}
              exit={{ scale: 0.5, opacity: 0, y: -40 }}
              transition={{ repeat: Infinity, duration: 0.6 }}
              className="absolute z-20 flex flex-col items-center pointer-events-none"
            >
              <div className="w-24 h-28 sm:w-28 sm:h-32 rounded-t-3xl rounded-b-xl bg-gradient-to-b from-amber-700 via-amber-800 to-amber-950 border-2 border-amber-400 shadow-2xl shadow-amber-950 flex flex-col items-center justify-center p-2 text-center">
                <span className="text-3xl mb-1">🏺</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-200">
                  Rolling
                </span>
                <span className="text-[9px] text-amber-400/80 font-mono font-bold">Langur Burja</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* The 6 Dice Grid */}
        <div
          id="dice-grid"
          className={`grid grid-cols-3 sm:grid-cols-6 gap-3 sm:gap-4 w-full max-w-2xl mx-auto transition-opacity duration-300 ${
            phase === 'rolling' ? 'opacity-30 blur-[1px]' : 'opacity-100'
          }`}
        >
          {dice.map((symbolKey, index) => {
            const sym = LANGUR_BURJA_SYMBOLS[symbolKey] || LANGUR_BURJA_SYMBOLS.burja;
            const count = currentCounts[symbolKey] || 0;
            const isWinner = phase === 'payout' && count >= 2;

            return (
              <motion.div
                key={`${symbolKey}-${index}-${roundNumber}`}
                initial={{
                  rotateX: phase === 'rolling' ? 720 : 0,
                  rotateY: phase === 'rolling' ? 720 : 0,
                  scale: 0.6,
                  y: -30,
                }}
                animate={{
                  rotateX: 0,
                  rotateY: 0,
                  scale: 1,
                  y: 0,
                }}
                transition={{
                  type: 'spring',
                  stiffness: 260,
                  damping: 18,
                  delay: index * 0.07,
                }}
                whileHover={{ scale: 1.05 }}
                className="flex flex-col items-center"
              >
                {/* 3D Physical-Look Die Cube */}
                <div
                  className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border-2 flex flex-col items-center justify-center shadow-xl transition-all duration-300 ${
                    skin.cubeBg
                  } ${
                    isWinner
                      ? 'ring-4 ring-amber-400 ring-offset-2 ring-offset-slate-900 scale-105 shadow-amber-500/50 animate-pulse'
                      : ''
                  }`}
                >
                  {/* Symbol Character */}
                  <span className="text-2xl sm:text-3xl filter drop-shadow-md select-none">
                    {sym.symbolChar}
                  </span>

                  {/* Name Label on Die */}
                  <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-tight leading-none mt-0.5 select-none">
                    {sym.name}
                  </span>

                  {/* Corner Die Dots (Casino accent) */}
                  <span className="absolute top-1.5 left-1.5 w-1 h-1 rounded-full bg-current opacity-30" />
                  <span className="absolute bottom-1.5 right-1.5 w-1 h-1 rounded-full bg-current opacity-30" />
                </div>

                {/* Match Counter Badge below die */}
                <div className="mt-1.5 min-h-[22px] flex items-center">
                  {phase === 'payout' && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isWinner
                          ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/30 animate-bounce'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {count >= 2 ? `${count}x WIN` : `${count}x`}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Outcome Summary Strip (during Payout) */}
      <AnimatePresence>
        {phase === 'payout' && lastResult && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wide">
                Winning Symbols:
              </span>
              {lastResult.winningSymbols.length > 0 ? (
                <div className="flex items-center gap-1.5">
                  {lastResult.winningSymbols.map((symKey) => {
                    const sym = LANGUR_BURJA_SYMBOLS[symKey];
                    const count = lastResult.symbolCounts[symKey];
                    return (
                      <span
                        key={symKey}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-extrabold bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md"
                      >
                        <span>{sym.symbolChar}</span>
                        <span>{sym.name} ({count}x)</span>
                        <span className="bg-slate-950 text-amber-300 px-1 py-0.2 rounded text-[10px]">
                          +{count}:1
                        </span>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <span className="text-xs text-slate-400 italic">
                  No 2+ matches this roll! The Pavilion House collects 0 & 1 bets.
                </span>
              )}
            </div>

            <div className="text-xs text-slate-300 font-mono">
              Total Table Payouts:{' '}
              <span className="text-amber-400 font-bold">
                {lastResult.totalTablePayouts.toLocaleString()} 🪙
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
