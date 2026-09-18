import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SymbolType, SYMBOL_KEYS, LANGUR_BURJA_SYMBOLS, RoundResultSummary } from '../types.js';
import { getSymbolImageDataUrl } from '../utils/diceTextures.js';
import { sound } from '../utils/audio.js';
import { Sparkles, X, SlidersHorizontal, Check, Edit3, Receipt } from 'lucide-react';

interface MobileBettingMatProps {
  phase: 'waiting' | 'betting' | 'rolling' | 'payout';
  userCoins: number;
  userBets: Record<SymbolType, number>;
  tableBets: Record<SymbolType, number>;
  lastResult?: RoundResultSummary;
  selectedChip: number;
  onSelectChip: (val: number) => void;
  onPlaceBet: (symbol: SymbolType, amount: number) => void;
  onClearTileBet?: (symbol: SymbolType) => void;
  onClearBets: () => void;
  onDoubleBets: () => void;
  onRepeatBets?: () => void;
  onInsufficientCoins?: (needed: number, available: number) => void;
  canRepeat?: boolean;
  tableMatColor?: 'green' | 'crimson' | 'royal';
  className?: string;
}

const CHIP_PRESETS = [
  { value: 100, label: '100', bg: 'bg-gradient-to-b from-slate-600 to-slate-800 border-slate-300/80 text-slate-100' },
  { value: 500, label: '500', bg: 'bg-gradient-to-b from-amber-500 to-amber-700 border-amber-200 text-slate-950 font-black' },
  { value: 1000, label: '1K', bg: 'bg-gradient-to-b from-rose-700 to-rose-950 border-rose-400/80 text-rose-100' },
  { value: 2000, label: '2K', bg: 'bg-gradient-to-b from-purple-800 to-purple-950 border-purple-300/80 text-amber-200' },
  { value: 5000, label: '5K', bg: 'bg-gradient-to-b from-emerald-700 to-emerald-950 border-emerald-300/80 text-emerald-100' },
];

const MobileBettingMatComponent: React.FC<MobileBettingMatProps> = ({
  phase,
  userCoins,
  userBets,
  tableBets,
  lastResult,
  selectedChip,
  onSelectChip,
  onPlaceBet,
  onClearTileBet,
  onClearBets,
  onDoubleBets,
  onRepeatBets,
  onInsufficientCoins,
  canRepeat = false,
  tableMatColor = 'green',
  className,
}) => {
  const isBettingOpen = phase === 'betting';

  // Custom Chip State - default to 250
  const [customChipAmount, setCustomChipAmount] = useState<number>(250);
  const [showCustomModal, setShowCustomModal] = useState<boolean>(false);
  const [customInputValue, setCustomInputValue] = useState<string>('250');
  const [showDetailedReceipt, setShowDetailedReceipt] = useState<boolean>(false);

  const isCustomSelected =
    !CHIP_PRESETS.some((c) => c.value === selectedChip) ||
    selectedChip === customChipAmount;

  const handleCustomChipClick = () => {
    if (isCustomSelected) {
      setCustomInputValue((customChipAmount || 250).toString());
      setShowCustomModal(true);
      sound.playChipSound();
    } else {
      const targetAmount = customChipAmount || 250;
      onSelectChip(targetAmount);
      sound.playChipSound();
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(10);
      }
    }
  };

  const handleApplyCustomChip = () => {
    const parsed = parseInt(customInputValue, 10);
    const finalVal = Math.max(1, isNaN(parsed) ? 50 : parsed);
    setCustomChipAmount(finalVal);
    onSelectChip(finalVal);
    setShowCustomModal(false);
    sound.playChipSound();
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
  };

  const handleTileClick = (symbol: SymbolType) => {
    if (!isBettingOpen) return;
    if (userCoins < selectedChip) {
      sound.playDiceLandSound();
      if (onInsufficientCoins) {
        onInsufficientCoins(selectedChip, userCoins);
      } else {
        onPlaceBet(symbol, selectedChip);
      }
      return;
    }
    sound.playChipSound();
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
    onPlaceBet(symbol, selectedChip);
  };

  const handleRemoveTileBet = (e: React.MouseEvent, symbol: SymbolType) => {
    e.stopPropagation();
    if (!isBettingOpen) return;
    sound.playDiceLandSound();
    if (onClearTileBet) {
      onClearTileBet(symbol);
    }
  };

  const totalUserBet = (Object.values(userBets) as number[]).reduce((a, b) => a + b, 0);

  // Player outcome calculation for payout phase
  const playerWonAmount = lastResult
    ? SYMBOL_KEYS.reduce((acc, sym) => {
        const bet = userBets[sym] || 0;
        const count = lastResult.symbolCounts?.[sym] || 0;
        return count >= 2 && bet > 0 ? acc + (bet + count * bet) : acc;
      }, 0)
    : 0;
  const hasWinningDice = Boolean(lastResult && lastResult.winningSymbols && lastResult.winningSymbols.length > 0);

  // Luxury Felt Background
  const getMatBackground = () => {
    if (tableMatColor === 'crimson') {
      return 'bg-gradient-to-b from-[#240608] via-[#150304] to-[#0a0102] border-amber-600/30';
    }
    if (tableMatColor === 'royal') {
      return 'bg-gradient-to-b from-[#080d1f] via-[#050712] to-[#020307] border-amber-500/30';
    }
    return 'bg-gradient-to-b from-[#061810] via-[#030d09] to-[#020604] border-amber-500/30';
  };

  return (
    <div
      id="mobile-betting-mat-root"
      className={`relative w-full h-full min-h-0 rounded-2xl border p-1.5 pb-1.5 sm:p-2 sm:pb-2 shadow-xl ${getMatBackground()} select-none flex flex-col justify-between overflow-hidden ${className || ''}`}
    >
      {/* Decorative Fine Felt Texture */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(#d4af37_1px,transparent_1px)] [background-size:20px_20px] opacity-10" />
      </div>

      {/* Mat Header Bar: Smooth Animated Cross-Fade with Locked Height (zero layout shift or panel resizing) */}
      <div
        id="mat-header-container"
        className="relative z-20 h-[34px] mb-1 pb-1 border-b border-amber-500/20 w-full overflow-visible shrink-0"
      >
        <AnimatePresence initial={false}>
          {phase === 'payout' && lastResult ? (
            <motion.div
              key="payout-result-ribbon"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="absolute inset-0 flex items-center justify-between gap-1.5 px-2 rounded-xl bg-gradient-to-r from-[#050811] via-[#0d172e] to-[#050811] border border-amber-500/40 shadow-inner text-xs"
            >
              {/* Left: Winning dice matches preview */}
              <div className="flex items-center gap-1 overflow-x-auto py-0.5 max-w-[62%] min-w-0 scrollbar-none">
                <span className="font-serif font-bold text-amber-200 text-[10.5px] shrink-0">
                  {playerWonAmount > 0 ? 'Won:' : 'Result:'}
                </span>
                {hasWinningDice ? (
                  lastResult.winningSymbols.map((symKey) => {
                    const count = lastResult.symbolCounts[symKey] || 0;
                    const cfg = LANGUR_BURJA_SYMBOLS[symKey];
                    return (
                      <span
                        key={symKey}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 font-mono text-[10px] font-bold shrink-0 whitespace-nowrap shadow-sm"
                      >
                        <div className="w-3.5 h-3.5 rounded-sm overflow-hidden flex items-center justify-center shrink-0 bg-[#FAF4D0]">
                          <img src={getSymbolImageDataUrl(symKey)} alt={cfg.name} className="w-full h-full object-cover scale-[1.34]" />
                        </div>
                        <span>{count}x</span>
                      </span>
                    );
                  })
                ) : (
                  <span className="text-slate-400 text-[10px] italic truncate whitespace-nowrap">
                    House sweeps (no 2+ matches)
                  </span>
                )}
              </div>

              {/* Right: Net outcome and itemized breakdown dropdown trigger */}
              <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                {playerWonAmount > 0 ? (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500 text-slate-950 font-mono font-black text-[10.5px] shadow-sm whitespace-nowrap animate-pulse">
                    +{playerWonAmount.toLocaleString()} 🪙
                  </span>
                ) : totalUserBet > 0 ? (
                  <span className="px-1.5 py-0.5 rounded-md bg-rose-950/70 border border-rose-800/60 text-rose-300 font-mono text-[10px] whitespace-nowrap">
                    -{totalUserBet.toLocaleString()} 🪙
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">No bet</span>
                )}

                {/* Receipt Button & Absolute Dropdown Popover */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      sound.playChipSound();
                      setShowDetailedReceipt((prev) => !prev);
                    }}
                    title="View itemized breakdown"
                    className={`p-1 rounded-md text-[10px] transition-all shrink-0 flex items-center gap-0.5 border ${
                      showDetailedReceipt
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                        : 'bg-slate-800/80 hover:bg-slate-700 text-amber-400 border-slate-700/60'
                    }`}
                  >
                    <Receipt className="w-3 h-3" />
                  </button>

                  {/* Absolute Dropdown Popover (DOES NOT alter mat height) */}
                  <AnimatePresence>
                    {showDetailedReceipt && (
                      <>
                        {/* Fixed invisible backdrop to dismiss dropdown on outside click */}
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setShowDetailedReceipt(false)}
                        />
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -4 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -4 }}
                          transition={{ duration: 0.15, ease: 'easeOut' }}
                          className="absolute right-0 top-full mt-1.5 w-64 max-w-[calc(100vw-2rem)] z-50 p-2.5 rounded-xl border border-amber-500/50 bg-[#070c17]/98 backdrop-blur-xl shadow-2xl text-xs font-mono ring-1 ring-black/80 select-text"
                        >
                          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-amber-500/20 font-sans">
                            <span className="text-[10.5px] font-bold text-amber-300 flex items-center gap-1.5">
                              <Receipt className="w-3.5 h-3.5 text-amber-400" />
                              Itemized Payout
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowDetailedReceipt(false)}
                              className="text-slate-400 hover:text-slate-200 text-xs px-1 rounded hover:bg-slate-800"
                            >
                              ✕
                            </button>
                          </div>

                          <div className="flex items-center justify-between text-slate-400 text-[9px] pb-1 border-b border-slate-800/80 mb-1 font-sans font-bold">
                            <span>Symbol</span>
                            <span>Bet</span>
                            <span>Matches</span>
                            <span>Payout</span>
                          </div>

                          <div className="space-y-0.5 max-h-32 overflow-y-auto custom-scrollbar pr-0.5">
                            {SYMBOL_KEYS.map((symKey) => {
                              const bet = userBets[symKey] || 0;
                              const count = lastResult.symbolCounts[symKey] || 0;
                              const won = count >= 2 && bet > 0 ? bet + count * bet : 0;
                              if (bet === 0 && count < 2) return null;
                              return (
                                <div
                                  key={symKey}
                                  className={`flex items-center justify-between py-0.5 text-[10px] px-1 rounded ${
                                    won > 0 ? 'text-emerald-300 font-bold bg-emerald-950/40' : 'text-slate-400'
                                  }`}
                                >
                                  <span className="flex items-center gap-1.5">
                                    <div className="w-4 h-4 rounded-sm overflow-hidden flex items-center justify-center shrink-0 bg-[#FAF4D0]">
                                      <img src={getSymbolImageDataUrl(symKey)} alt={LANGUR_BURJA_SYMBOLS[symKey].name} className="w-full h-full object-cover scale-[1.34]" />
                                    </div>
                                    <span>{LANGUR_BURJA_SYMBOLS[symKey].name}</span>
                                  </span>
                                  <span>{bet.toLocaleString()} 🪙</span>
                                  <span>{count}x</span>
                                  <span>{won > 0 ? `+${won.toLocaleString()} 🪙` : '0'}</span>
                                </div>
                              );
                            })}
                          </div>

                          <div className="mt-2 pt-1 border-t border-amber-500/20 flex items-center justify-between text-[10px] font-sans">
                            <span className="text-slate-400">Net Outcome:</span>
                            <span className={`font-mono font-bold ${playerWonAmount > 0 ? 'text-emerald-400' : totalUserBet > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                              {playerWonAmount > 0 ? `+${playerWonAmount.toLocaleString()} 🪙` : totalUserBet > 0 ? `-${totalUserBet.toLocaleString()} 🪙` : '0 🪙'}
                            </span>
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          ) : (
            /* Regular Mat Header Bar: Compact & Informative */
            <motion.div
              key="standard-betting-bar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="absolute inset-0 flex items-center justify-between px-0.5 text-xs"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] sm:text-sm font-nepali-title font-bold text-amber-200 tracking-wide">
                  लङ्गुर बुर्जा दाउ
                </span>
                <span className="text-[9px] sm:text-[10px] text-amber-400/60 font-medium">
                  (2+ Match Wins)
                </span>
              </div>

              {totalUserBet > 0 ? (
                <div className="px-1.5 py-0.5 rounded-lg bg-amber-500/20 border border-amber-400/35 font-mono text-[10px] sm:text-[11px] font-bold text-amber-300 flex items-center gap-1 shrink-0">
                  <span className="text-amber-400/70">Bet:</span>
                  <span className="whitespace-nowrap">{totalUserBet.toLocaleString()} 🪙</span>
                </div>
              ) : (
                <span className="text-[9.5px] sm:text-[10px] text-slate-400/70 font-mono shrink-0 whitespace-nowrap">
                  Tap tile to place {selectedChip} 🪙
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* The 6 Symbols: Authentic 3 Columns x 2 Rows Prominent Grid */}
      <div className="relative z-10 grid grid-cols-3 grid-rows-2 gap-1.5 sm:gap-2 flex-1 min-h-0 my-0.5">
        {SYMBOL_KEYS.map((symKey) => {
          const sym = LANGUR_BURJA_SYMBOLS[symKey];
          const myBet = userBets[symKey] || 0;
          const totalPool = tableBets[symKey] || 0;

          // Winner check in payout phase
          const matchCount = lastResult?.symbolCounts?.[symKey] || 0;
          const isWinner = phase === 'payout' && matchCount >= 2;
          const isLoser = phase === 'payout' && matchCount < 2 && myBet > 0;

          return (
            <motion.div
              key={symKey}
              id={`mat-tile-${symKey}`}
              onClick={() => handleTileClick(symKey)}
              whileHover={isBettingOpen ? { scale: 1.02 } : {}}
              whileTap={isBettingOpen ? { scale: 0.96 } : {}}
              className={`@container relative h-full min-h-0 rounded-xl border p-1.5 sm:p-2 flex flex-col sm:flex-row @[135px]:flex-row justify-between items-stretch sm:items-center @[135px]:items-center gap-1 cursor-pointer transition-all select-none shadow-md overflow-hidden ${
                isWinner
                  ? 'bg-gradient-to-br from-amber-500/30 via-emerald-950/50 to-slate-950 border-amber-300 ring-2 ring-amber-400/80 shadow-amber-500/40 animate-pulse'
                  : isLoser
                  ? 'bg-rose-950/20 border-slate-800/80 opacity-50'
                  : 'bg-slate-950/85 hover:bg-slate-900/90 border-slate-800/90 hover:border-amber-500/50'
              } ${!isBettingOpen ? 'cursor-default' : 'active:bg-amber-950/40'}`}
            >
              {/* Primary Identity Section: Emblem & Titles */}
              <div className="flex items-center justify-between gap-1.5 min-w-0 flex-1">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  {/* Scaled symbol emblem with ivory parchment backing */}
                  <div className="w-7.5 h-7.5 sm:w-8 sm:h-8 rounded-md sm:rounded-lg overflow-hidden flex items-center justify-center border border-amber-900/40 shadow-sm shrink-0 bg-[#FAF4D0]">
                    <img
                      src={getSymbolImageDataUrl(symKey)}
                      alt={sym.name}
                      className="w-full h-full object-cover scale-[1.28] pointer-events-none select-none"
                    />
                  </div>
                  <div className="min-w-0 flex flex-col justify-center">
                    <div className="font-nepali font-black text-xs sm:text-[13px] text-amber-100 leading-tight tracking-wide truncate">
                      {sym.nepaliName.split(' ')[0]}
                    </div>
                    <div className="text-[8px] sm:text-[8.5px] text-amber-400 font-mono tracking-wider font-bold leading-tight uppercase truncate">
                      {sym.name}
                    </div>
                  </div>
                </div>

                {/* Mobile portrait match counter or star (hidden when card is wide/horizontal) */}
                <div className="sm:hidden @[135px]:hidden shrink-0">
                  {isWinner ? (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-400 text-slate-950 font-mono leading-none">
                      {matchCount}x
                    </span>
                  ) : (
                    <span className="text-[8px] text-amber-400/50 font-bold">✦</span>
                  )}
                </div>
              </div>

              {/* Stake & Pool Status Section: Adapts from bottom row on small screens to right side on wider screens */}
              <div className="flex items-center justify-end gap-1 min-w-0 shrink-0 w-full sm:w-auto @[135px]:w-auto mt-0.5 sm:mt-0 @[135px]:mt-0">
                {/* On wider screens, show winner badge alongside stake */}
                {isWinner && (
                  <span className="hidden sm:inline-flex @[135px]:inline-flex px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-black bg-emerald-400 text-slate-950 font-mono shrink-0 leading-none shadow-sm">
                    {matchCount}x
                  </span>
                )}

                {myBet > 0 ? (
                  <div className="w-full sm:w-auto @[135px]:w-auto flex items-center justify-between sm:justify-center @[135px]:justify-center gap-1 px-1.5 py-0.5 rounded-md bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-black font-mono shadow-sm min-w-0">
                    <div className="flex items-center gap-1 min-w-0">
                      <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
                      <span className="truncate leading-none text-[9px] sm:text-[10px] font-mono font-black">
                        {myBet >= 10000 ? `${(myBet / 1000).toFixed(myBet % 1000 === 0 ? 0 : 1)}K` : myBet.toLocaleString()}
                      </span>
                    </div>
                    {isBettingOpen && (
                      <button
                        onClick={(e) => handleRemoveTileBet(e, symKey)}
                        title="Remove bet"
                        className="p-0.5 rounded hover:bg-slate-950/25 text-slate-950 shrink-0 ml-0.5"
                      >
                        <X className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      </button>
                    )}
                  </div>
                ) : totalPool > 0 ? (
                  <span className="text-slate-400/90 font-mono text-[8.5px] sm:text-[9.5px] truncate font-medium bg-slate-900/40 sm:bg-transparent @[135px]:bg-transparent px-1 sm:px-0 py-0.5 rounded">
                    Pool: {totalPool >= 10000 ? `${(totalPool / 1000).toFixed(1)}K` : totalPool.toLocaleString()}
                  </span>
                ) : (
                  <span className="text-slate-500/70 font-mono text-[8.5px] sm:text-[9.5px]">
                    {isBettingOpen ? `+${selectedChip >= 10000 ? `${(selectedChip / 1000).toFixed(selectedChip % 1000 === 0 ? 0 : 1)}K` : selectedChip.toLocaleString()}` : '—'}
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Chip Denominations Bar - 100, 500, 1K, 2K, 5K & Custom (default 250) */}
      <div className="relative z-10 mt-1 pt-1 sm:mt-1.5 sm:pt-1.5 border-t border-amber-500/20 flex items-center justify-center shrink-0">
        {/* Chip Row - centered, clear, no horizontal scrolling on standard screens */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-2.5 py-0.5 px-0.5 w-full scrollbar-none">
          {/* Preset Chips: 100, 500, 1K, 2K, 5K */}
          {CHIP_PRESETS.map(({ value, label, bg }) => {
            const isSelected = selectedChip === value && !isCustomSelected;
            return (
              <button
                key={value}
                id={`mobile-chip-${value}`}
                onClick={() => {
                  onSelectChip(value);
                  sound.playChipSound();
                  if (typeof navigator !== 'undefined' && navigator.vibrate) {
                    navigator.vibrate(10);
                  }
                }}
                className={`relative w-8.5 h-8.5 sm:w-10 sm:h-10 rounded-full font-mono font-black flex items-center justify-center transition-all border-[1.5px] shadow-md shrink-0 select-none ${bg} ${
                  isSelected
                    ? 'ring-2 ring-amber-300 ring-offset-1 ring-offset-slate-950 scale-105 z-10 shadow-amber-400/50 brightness-110'
                    : 'hover:brightness-110 opacity-85 hover:opacity-100'
                }`}
              >
                {/* Authentic dashed inner rim */}
                <div className="w-6.5 h-6.5 sm:w-8 sm:h-8 rounded-full border border-dashed border-white/40 flex items-center justify-center pointer-events-none">
                  <span className="text-[9.5px] sm:text-[11px] leading-none tracking-tighter whitespace-nowrap font-bold">
                    {label}
                  </span>
                </div>
              </button>
            );
          })}

          {/* Custom Option Chip - Exact same circular size (Default 250) */}
          <button
            key="custom"
            id="mobile-chip-custom"
            onClick={handleCustomChipClick}
            className={`relative w-8.5 h-8.5 sm:w-10 sm:h-10 rounded-full font-mono font-black flex items-center justify-center transition-all border-[1.5px] shadow-md shrink-0 select-none bg-gradient-to-b from-cyan-600 via-cyan-800 to-slate-950 border-cyan-300 text-cyan-100 ${
              isCustomSelected
                ? 'ring-2 ring-cyan-300 ring-offset-1 ring-offset-slate-950 scale-105 z-10 shadow-cyan-400/50 brightness-110'
                : 'hover:brightness-110 opacity-85 hover:opacity-100'
            }`}
            title={`Custom Chip: ${customChipAmount.toLocaleString()} 🪙 (Default 250. Tap to select, tap again to customize)`}
          >
            <div className="w-6.5 h-6.5 sm:w-8 sm:h-8 rounded-full border border-dashed border-cyan-200/50 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[8.5px] sm:text-[10px] leading-none font-mono font-black tracking-tighter whitespace-nowrap">
                {customChipAmount >= 10000
                  ? `${(customChipAmount / 1000).toFixed(customChipAmount % 1000 === 0 ? 0 : 1)}K`
                  : customChipAmount >= 1000
                  ? `${(customChipAmount / 1000).toFixed(customChipAmount % 100 === 0 ? 0 : 1)}K`
                  : customChipAmount}
              </span>
              <span className="text-[4.5px] sm:text-[5.5px] leading-none font-sans tracking-tight text-cyan-300/90 uppercase mt-0.5 font-bold">
                {isCustomSelected ? 'edit' : 'custom'}
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Custom Bet Chip Amount Modal */}
      {showCustomModal && (
        <div
          id="custom-chip-modal-backdrop"
          onClick={() => setShowCustomModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div
            id="custom-chip-modal-card"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-gradient-to-b from-[#0e1628] via-[#090d18] to-[#05070e] border border-amber-500/40 p-4 text-slate-100 shadow-2xl relative animate-in zoom-in-95 duration-150"
          >
            {/* Close button */}
            <button
              onClick={() => setShowCustomModal(false)}
              className="absolute top-3 right-3 p-1 rounded-lg text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-700/80 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-slate-950 shadow-md">
                <SlidersHorizontal className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-serif font-black text-sm text-amber-200">
                  Custom Bet Chip
                </h3>
                <p className="text-[10px] text-slate-400">
                  Type exact number of coins per bet tap
                </p>
              </div>
            </div>

            {/* Balance pill */}
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 mb-3 text-xs font-mono">
              <span className="text-slate-400">Available Balance:</span>
              <span className="font-bold text-amber-300">{userCoins.toLocaleString()} 🪙</span>
            </div>

            {/* Number input */}
            <div className="mb-3">
              <label className="block text-[10px] uppercase font-mono tracking-wider text-slate-400 mb-1">
                Exact Chip Value (Coins)
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-sm pointer-events-none">🪙</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={customInputValue}
                  onChange={(e) => setCustomInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleApplyCustomChip();
                    }
                  }}
                  autoFocus
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-amber-400/50 focus:border-amber-300 focus:ring-2 focus:ring-amber-400/30 text-base font-mono font-black text-amber-200 outline-none transition-all shadow-inner"
                  placeholder="e.g. 250"
                />
              </div>
              {Number(customInputValue) > userCoins && (
                <p className="text-[10px] text-amber-400/90 font-mono mt-1">
                  ⚠️ Exceeds current coin balance ({userCoins.toLocaleString()} coins)
                </p>
              )}
            </div>

            {/* Quick Presets */}
            <div className="mb-4">
              <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
                Quick Adjust
              </span>
              <div className="grid grid-cols-4 gap-1.5 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => {
                    const cur = parseInt(customInputValue, 10) || 0;
                    setCustomInputValue(String(cur + 50));
                  }}
                  className="py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-amber-200 transition-colors"
                >
                  +50
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const cur = parseInt(customInputValue, 10) || 0;
                    setCustomInputValue(String(cur + 250));
                  }}
                  className="py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-amber-200 transition-colors"
                >
                  +250
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomInputValue(String(Math.max(1, Math.floor(userCoins / 2))));
                  }}
                  className="py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-amber-200 transition-colors"
                >
                  1/2 Max
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomInputValue(String(Math.max(1, userCoins)));
                  }}
                  className="py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-amber-200 transition-colors"
                >
                  All In
                </button>
              </div>
            </div>

            {/* Confirm button */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyCustomChip}
                className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold font-serif shadow-lg shadow-amber-500/25 border border-amber-300 active:scale-95 transition-all flex items-center justify-center gap-1"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Apply Chip</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const MobileBettingMat = React.memo(MobileBettingMatComponent);
