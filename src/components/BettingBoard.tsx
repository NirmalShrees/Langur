import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  SymbolType,
  SYMBOL_KEYS,
  LANGUR_BURJA_SYMBOLS,
  GamePhase,
  RoundResultSummary,
} from '../types.js';
import { sound } from '../utils/audio.js';
import { Trash2, TrendingUp, Sparkles } from 'lucide-react';

interface BettingBoardProps {
  phase: GamePhase;
  userCoins: number;
  userBets: Record<SymbolType, number>;
  tableBets: Record<SymbolType, number>;
  minBet: number;
  maxBet: number;
  tableMat?: string;
  lastResult?: RoundResultSummary;
  onPlaceBet: (symbol: SymbolType, amount: number) => void;
  onClearBets: () => void;
}

const CHIP_VALUES = [10, 50, 100, 500, 1000, 5000];

export const BettingBoard: React.FC<BettingBoardProps> = ({
  phase,
  userCoins,
  userBets,
  tableBets,
  minBet,
  maxBet,
  tableMat = 'mat_velvet_green',
  lastResult,
  onPlaceBet,
  onClearBets,
}) => {
  const [selectedChip, setSelectedChip] = useState<number>(500);

  const isBettingOpen = phase === 'betting';

  // Mat style helper
  const getMatClasses = () => {
    switch (tableMat) {
      case 'mat_crimson_luxury':
        return 'bg-gradient-to-br from-red-950/80 via-rose-950/90 to-amber-950/80 border-rose-800/40 shadow-rose-950/50';
      case 'mat_midnight_gold':
        return 'bg-gradient-to-br from-slate-950 via-indigo-950/90 to-slate-950 border-indigo-700/40 shadow-indigo-950/50';
      case 'mat_himalayan_aurora':
        return 'bg-gradient-to-br from-teal-950 via-cyan-950/90 to-slate-950 border-teal-700/40 shadow-teal-950/50';
      case 'mat_velvet_green':
      default:
        return 'bg-gradient-to-br from-emerald-950 via-green-950/90 to-slate-950 border-emerald-800/40 shadow-emerald-950/50';
    }
  };

  const handleTileClick = (symbolKey: SymbolType) => {
    if (!isBettingOpen) return;
    if (userCoins < selectedChip) {
      sound.playDiceLandSound();
      return;
    }
    sound.playChipSound();
    onPlaceBet(symbolKey, selectedChip);
  };

  const handleClear = () => {
    if (!isBettingOpen) return;
    sound.playDiceLandSound();
    onClearBets();
  };

  const totalUserBet = (Object.values(userBets) as number[]).reduce((acc: number, curr: number) => acc + curr, 0);

  return (
    <div
      id="betting-board-root"
      className={`relative w-full rounded-2xl border p-4 sm:p-6 shadow-2xl transition-all duration-500 overflow-hidden ${getMatClasses()}`}
    >
      {/* Felt Texture Overlay Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px] opacity-5 pointer-events-none" />

      {/* Board Top Bar: Title, Limits, Total Active Bet */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 mb-5 pb-3 border-b border-white/10">
        <div>
          <h2 className="font-extrabold text-base sm:text-lg text-amber-100 font-serif tracking-tight flex items-center gap-2">
            <span>Langur Burja Betting Board</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-sans font-semibold border border-amber-500/30">
              Min {minBet} • Max {maxBet}
            </span>
          </h2>
          <p className="text-xs text-emerald-200/60 mt-0.5">
            Tap a tile to place bets. Match 2+ dice to win authentic multipliers!
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/70 border border-amber-500/30">
            <span className="text-xs text-slate-400 font-medium">Your Total Bet:</span>
            <span className="font-mono font-extrabold text-sm text-amber-300">
              {totalUserBet.toLocaleString()} 🪙
            </span>
          </div>

          <button
            id="betting-board-clear-btn"
            onClick={handleClear}
            disabled={!isBettingOpen || totalUserBet === 0}
            title="Clear and refund active bets"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-xs font-bold text-slate-300 border border-slate-700 hover:text-rose-400 disabled:opacity-40 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* The 6 Main Langur Burja Betting Tiles */}
      <div
        id="betting-tiles-grid"
        className="relative z-10 grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-6"
      >
        {SYMBOL_KEYS.map((symKey) => {
          const sym = LANGUR_BURJA_SYMBOLS[symKey];
          const myBet = userBets[symKey] || 0;
          const totalTableBet = tableBets[symKey] || 0;

          // Payout highlighting
          const isWinner =
            phase === 'payout' &&
            lastResult &&
            (lastResult.symbolCounts[symKey] || 0) >= 2;
          const winnerCount = lastResult?.symbolCounts[symKey] || 0;

          return (
            <motion.div
              key={symKey}
              id={`bet-tile-${symKey}`}
              onClick={() => handleTileClick(symKey)}
              whileHover={isBettingOpen ? { scale: 1.02, y: -2 } : {}}
              whileTap={isBettingOpen ? { scale: 0.98 } : {}}
              className={`group relative min-h-[140px] sm:min-h-[160px] rounded-2xl border-2 p-3 sm:p-4 flex flex-col justify-between cursor-pointer transition-all duration-300 shadow-lg ${
                sym.borderColor
              } ${
                isWinner
                  ? 'bg-amber-500/20 ring-4 ring-amber-400 border-amber-300 shadow-amber-500/40 animate-pulse'
                  : 'bg-slate-950/70 hover:bg-slate-900/80'
              } ${!isBettingOpen ? 'cursor-not-allowed opacity-90' : ''}`}
            >
              {/* Top Row: Symbol Char & Nepali Label */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-3xl sm:text-4xl filter drop-shadow-md group-hover:scale-110 transition-transform">
                    {sym.symbolChar}
                  </span>
                  <div>
                    <h3 className={`font-black text-sm sm:text-base ${sym.textColor} tracking-tight`}>
                      {sym.name}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">{sym.nepaliName}</p>
                  </div>
                </div>

                {/* Multiplier / Payout Badge */}
                {isWinner ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-400 text-slate-950 shadow-md">
                    +{winnerCount}:1 WON
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700">
                    2+ Pays {symKey === 'burja' ? '3x-7x' : '3x-7x'}
                  </span>
                )}
              </div>

              {/* Center Bet Indicator / Chips */}
              <div className="my-2 flex items-center justify-between">
                {myBet > 0 ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500 text-slate-950 font-black text-xs sm:text-sm shadow-md animate-bounce">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>My Bet: {myBet.toLocaleString()}</span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-500 font-medium italic">
                    {isBettingOpen ? 'Click to place bet' : 'No bets'}
                  </span>
                )}

                {/* Table Pool on this symbol */}
                {totalTableBet > 0 && (
                  <div className="text-[11px] font-mono font-semibold text-amber-300/80 bg-slate-900/90 px-2 py-0.5 rounded-lg border border-slate-800">
                    Pool: {totalTableBet.toLocaleString()} 🪙
                  </div>
                )}
              </div>

              {/* Bottom description / potential return estimate */}
              <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 truncate max-w-[140px]">{sym.description}</span>
                {myBet > 0 && (
                  <span className="text-emerald-400 font-mono font-bold">
                    Win: {(myBet * 3).toLocaleString()}+
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Chip Selector Control Deck */}
      <div className="relative z-10 bg-slate-950/90 rounded-2xl border border-amber-900/30 p-3 sm:p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-300 font-mono">
            Select Chip:
          </span>
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-1">
            {CHIP_VALUES.map((val) => {
              const isSelected = selectedChip === val;
              return (
                <button
                  key={val}
                  id={`chip-selector-${val}`}
                  onClick={() => {
                    setSelectedChip(val);
                    sound.playChipSound();
                  }}
                  className={`relative min-w-[46px] sm:min-w-[54px] h-10 sm:h-11 rounded-full font-black text-xs sm:text-sm font-mono flex items-center justify-center transition-all duration-200 border-2 shadow-lg ${
                    isSelected
                      ? 'scale-110 -translate-y-1 ring-4 ring-amber-400 border-amber-200 bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 shadow-amber-500/40'
                      : 'border-slate-700 bg-gradient-to-br from-slate-800 to-slate-900 text-amber-200 hover:border-amber-500/50'
                  }`}
                >
                  <span className="relative z-10">{val >= 1000 ? `${val / 1000}K` : val}</span>
                  {/* Outer notched rim for chip look */}
                  <span className="absolute inset-1 rounded-full border border-dashed border-current opacity-30 pointer-events-none" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Max Bet button */}
        <div className="flex items-center gap-2">
          <button
            id="chip-max-bet-btn"
            onClick={() => {
              const maxAffordable = Math.min(userCoins, maxBet);
              if (maxAffordable > 0) {
                setSelectedChip(maxAffordable);
                sound.playChipSound();
              }
            }}
            className="flex items-center gap-1 text-xs px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold border border-slate-700 transition-colors"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Max Bet ({Math.min(userCoins, maxBet).toLocaleString()})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
