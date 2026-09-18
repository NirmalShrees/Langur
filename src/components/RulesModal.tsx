import React, { useState } from 'react';
import {
  X,
  BookOpen,
  Crown,
  CheckCircle2,
  Calculator,
  Sparkles,
  Coins,
  Flame,
  Layers,
  HelpCircle,
  Scroll,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { SYMBOL_KEYS, LANGUR_BURJA_SYMBOLS, SymbolType } from '../types.js';
import { getSymbolImageDataUrl } from '../utils/diceTextures.js';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'gameplay' | 'payouts' | 'symbols' | 'heritage'>('gameplay');
  const [simulatedBet, setSimulatedBet] = useState<number>(500);

  if (!isOpen) return null;

  return (
    <div
      id="rules-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-4 overflow-x-hidden"
    >
      <div className="relative w-full max-w-2xl bg-gradient-to-b from-slate-900 via-[#0d121f] to-slate-950 rounded-3xl border border-amber-500/30 shadow-2xl p-4 sm:p-6 overflow-x-hidden flex flex-col max-h-[88vh]">
        {/* Ambient atmospheric glows */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="relative flex items-center justify-between pb-3.5 border-b border-slate-800/80 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 shrink-0">
              <BookOpen className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-lg sm:text-xl font-black text-amber-100 font-game-title tracking-wider">
                  LANGUR BURJA RULES
                </h2>
                <span className="text-[11px] font-nepali-title text-amber-300 font-bold hidden xs:inline">
                  (नियम तथा खेल्ने विधि)
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400">
                Traditional Himalayan & South Asian Festival Dice (Jhandi Munda)
              </p>
            </div>
          </div>

          <button
            id="close-rules-btn"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 active:scale-95 transition-all shadow-sm shrink-0"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-2xl border border-slate-800/80 my-3.5 shrink-0 overflow-x-auto custom-scrollbar">
          <button
            id="rules-tab-gameplay"
            onClick={() => setActiveTab('gameplay')}
            className={`flex-1 min-w-[90px] py-2 px-2.5 rounded-xl font-serif text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === 'gameplay'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>How to Play</span>
          </button>

          <button
            id="rules-tab-payouts"
            onClick={() => setActiveTab('payouts')}
            className={`flex-1 min-w-[90px] py-2 px-2.5 rounded-xl font-serif text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === 'payouts'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Coins className="w-3.5 h-3.5 shrink-0" />
            <span>Payout Matrix</span>
          </button>

          <button
            id="rules-tab-symbols"
            onClick={() => setActiveTab('symbols')}
            className={`flex-1 min-w-[90px] py-2 px-2.5 rounded-xl font-serif text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === 'symbols'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Crown className="w-3.5 h-3.5 shrink-0" />
            <span>6 Symbols</span>
          </button>

          <button
            id="rules-tab-heritage"
            onClick={() => setActiveTab('heritage')}
            className={`flex-1 min-w-[90px] py-2 px-2.5 rounded-xl font-serif text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === 'heritage'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Scroll className="w-3.5 h-3.5 shrink-0" />
            <span>Lore & Tips</span>
          </button>
        </div>

        {/* Tab Content Body with custom scrollbar */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden pr-1.5 space-y-4 text-xs sm:text-sm text-slate-300 custom-scrollbar">
          {/* TAB 1: HOW TO PLAY */}
          {activeTab === 'gameplay' && (
            <div className="space-y-3.5 animate-in fade-in duration-200">
              {/* Introduction Card */}
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-amber-500/20 relative overflow-hidden">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300 shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-serif font-black text-amber-200 text-sm mb-1">
                      The Ancient Game of Dashain & Tihar
                    </h3>
                    <p className="text-slate-300 leading-relaxed text-xs sm:text-xs+">
                      Langur Burja is a celebrated Himalayan festival game of pure chance played with <strong>6 identical dice</strong> and an authentic brass bucket known as the <em>Khor (खोर)</em>. Players place coin wagers on a felt wagering cloth marked with the 6 sacred symbols before the dealer shakes and casts the dice.
                    </p>
                  </div>
                </div>
              </div>

              {/* 4-Step Visual Game Cycle */}
              <div>
                <h4 className="font-serif font-bold text-amber-300 text-xs uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span>The 4-Step Round Progression</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Step 1 */}
                  <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-300 font-mono font-black text-xs flex items-center justify-center shrink-0 border border-amber-500/30">
                      1
                    </div>
                    <div>
                      <div className="font-bold text-amber-100 text-xs mb-0.5">Wagering Phase (दाउ राख्ने)</div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Select chips from your stack (10, 50, 100, 500, 1K, 5K) and tap any of the 6 symbols on the mat. You can spread chips across multiple symbols.
                      </p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-300 font-mono font-black text-xs flex items-center justify-center shrink-0 border border-amber-500/30">
                      2
                    </div>
                    <div>
                      <div className="font-bold text-amber-100 text-xs mb-0.5">Bucket Shake & Slam (खोर हल्लाउने)</div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        The dealer places all 6 dice into the brass vessel and shakes vigorously in mid-air, flips it upside down, and slams it firmly onto the felt table.
                      </p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-300 font-mono font-black text-xs flex items-center justify-center shrink-0 border border-amber-500/30">
                      3
                    </div>
                    <div>
                      <div className="font-bold text-amber-100 text-xs mb-0.5">Suspense Pause (सस्पेन्स)</div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        The bucket sits motionless on the table covering the dice. A brief delay builds suspense while players watch closely. You can orbit the 3D camera freely!
                      </p>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-300 font-mono font-black text-xs flex items-center justify-center shrink-0 border border-amber-500/30">
                      4
                    </div>
                    <div>
                      <div className="font-bold text-amber-100 text-xs mb-0.5">The Reveal & Payout (खोर उचाल्ने)</div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        The bucket lifts! The winning symbols are counted. If 2 or more dice match your bet, you win your stake back PLUS generous multipliers up to 7x!
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Fundamental Golden Rule */}
              <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/30 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-bold text-amber-200">The Golden Rule of Langur Burja: </span>
                  <span className="text-slate-300">
                    You require at least <strong>2 matching dice</strong> to trigger a winning payout. If only 0 or 1 die lands on your chosen symbol, the house keeps the wagered stake.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PAYOUT MATRIX & SIMULATOR */}
          {activeTab === 'payouts' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Interactive Bet Calculator */}
              <div className="p-4 rounded-2xl bg-gradient-to-b from-slate-950 via-[#0a0f1d] to-slate-950 border border-amber-500/30">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-amber-400" />
                    <span className="font-serif font-bold text-amber-200 text-xs sm:text-sm">
                      Interactive Payout Calculator
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400">Simulate Bet:</span>
                    {[100, 500, 1000, 5000].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setSimulatedBet(amt)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all ${
                          simulatedBet === amt
                            ? 'bg-amber-500 text-slate-950 shadow-sm'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {amt >= 1000 ? `${amt / 1000}K` : amt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-emerald-500/30">
                    <div className="text-[10px] text-emerald-400 font-bold uppercase">2 Matching Dice</div>
                    <div className="font-mono text-base font-black text-emerald-200">
                      {(simulatedBet * 3).toLocaleString()} 🪙
                    </div>
                    <div className="text-[9px] text-slate-400">Bet back + 2x profit (3x Total)</div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-emerald-500/40">
                    <div className="text-[10px] text-emerald-400 font-bold uppercase">3 Matching Dice</div>
                    <div className="font-mono text-base font-black text-emerald-200">
                      {(simulatedBet * 4).toLocaleString()} 🪙
                    </div>
                    <div className="text-[9px] text-slate-400">Bet back + 3x profit (4x Total)</div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-amber-500/40">
                    <div className="text-[10px] text-amber-400 font-bold uppercase">4 Matching Dice</div>
                    <div className="font-mono text-base font-black text-amber-200">
                      {(simulatedBet * 5).toLocaleString()} 🪙
                    </div>
                    <div className="text-[9px] text-slate-400">Bet back + 4x profit (5x Total)</div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-amber-500/50">
                    <div className="text-[10px] text-amber-400 font-bold uppercase">5 Matching Dice</div>
                    <div className="font-mono text-base font-black text-amber-200">
                      {(simulatedBet * 6).toLocaleString()} 🪙
                    </div>
                    <div className="text-[9px] text-slate-400">Bet back + 5x profit (6x Total)</div>
                  </div>

                  <div className="col-span-2 p-2.5 rounded-xl bg-gradient-to-r from-amber-500/20 via-amber-600/20 to-yellow-500/20 border border-amber-400/60 shadow-lg shadow-amber-500/10 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-amber-300 font-black uppercase flex items-center gap-1">
                        <span>👑 6 Royal Jackpot Dice</span>
                      </div>
                      <div className="text-[9px] text-amber-200/80">All 6 dice land on your symbol!</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-lg font-black text-amber-200">
                        {(simulatedBet * 7).toLocaleString()} 🪙
                      </div>
                      <div className="text-[9px] text-amber-400 font-bold">7x Ultimate Multiplier</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Complete Payout Schedule Table */}
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/80">
                <h4 className="font-serif font-bold text-amber-300 text-xs uppercase tracking-wider mb-2.5">
                  Official Himalayan Casino Multiplier Schedule
                </h4>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between p-2 rounded-xl bg-rose-950/25 border border-rose-900/30 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      <span className="font-bold text-rose-300">0 or 1 Matching Die</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-rose-400">0x (Lost)</span>
                      <span className="text-[10px] text-slate-400 block">Stake collected by dealer</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-950/25 border border-emerald-900/30 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="font-bold text-emerald-300">2 Matching Dice</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-black text-emerald-300">3x Return</span>
                      <span className="text-[10px] text-emerald-400/80 block">Bet + 2x Profit</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-950/35 border border-emerald-800/40 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="font-bold text-emerald-300">3 Matching Dice</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-black text-emerald-300">4x Return</span>
                      <span className="text-[10px] text-emerald-400/80 block">Bet + 3x Profit</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-xl bg-amber-950/30 border border-amber-800/40 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span className="font-bold text-amber-300">4 Matching Dice</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-black text-amber-300">5x Return</span>
                      <span className="text-[10px] text-amber-400/80 block">Bet + 4x Profit</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-xl bg-amber-950/50 border border-amber-700/50 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span className="font-bold text-amber-300">5 Matching Dice</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-black text-amber-300">6x Return</span>
                      <span className="text-[10px] text-amber-400/80 block">Bet + 5x Profit</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-gradient-to-r from-amber-500/25 via-amber-400/20 to-amber-600/25 border border-amber-400/70 text-xs shadow-md">
                    <div className="flex items-center gap-2">
                      <Crown className="w-4 h-4 text-amber-400" />
                      <span className="font-black text-amber-200">6 Matching Dice (Grand Jackpot)</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-black text-amber-200 text-sm">7x Total!</span>
                      <span className="text-[10px] text-amber-300/90 font-bold block">Bet + 6x Profit</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: THE 6 SACRED SYMBOLS */}
          {activeTab === 'symbols' && (
            <div className="space-y-3.5 animate-in fade-in duration-200">
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
                Each of the 6 wooden or brass dice contains one face for each sacred symbol. The odds of any single die landing on any given symbol are exactly <strong>1 in 6 (16.67%)</strong>.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {SYMBOL_KEYS.map((k) => {
                  const s = LANGUR_BURJA_SYMBOLS[k];
                  const symbolDescriptions: Record<SymbolType, { meaning: string; lore: string; color: string }> = {
                    jhanda: {
                      meaning: 'National Victory Flag',
                      lore: 'Symbolizes sovereignty, bravery, and festival joy across the Kathmandu valley.',
                      color: 'border-blue-500/40 bg-blue-950/20',
                    },
                    burja: {
                      meaning: 'Imperial Royal Crown',
                      lore: 'The supreme royal emblem representing sovereignty, power, and the Grand Jackpot.',
                      color: 'border-amber-500/40 bg-amber-950/20',
                    },
                    itta: {
                      meaning: 'Sacred Diamond Ingot',
                      lore: 'Represents prosperity, indestructible wealth, and gemstone blessings during Tihar.',
                      color: 'border-rose-500/40 bg-rose-950/20',
                    },
                    paan: {
                      meaning: 'Auspicious Betel Leaf / Heart',
                      lore: 'Traditional symbol of hospitality, affection, and harmonious gatherings.',
                      color: 'border-red-500/40 bg-red-950/20',
                    },
                    hukum: {
                      meaning: 'Sovereign Royal Decree / Spade',
                      lore: 'Symbolizes authoritative fortune, destiny, and cosmic balance.',
                      color: 'border-slate-500/40 bg-slate-900/40',
                    },
                    chidi: {
                      meaning: 'Tri-Leaf Clover / Club',
                      lore: 'Represents nature, fertile harvest, and peaceful flourishing.',
                      color: 'border-emerald-500/40 bg-emerald-950/20',
                    },
                  };

                  const desc = symbolDescriptions[k];

                  return (
                    <div
                      key={k}
                      className={`p-3.5 rounded-2xl border ${desc.color} flex items-start gap-3 transition-all hover:border-amber-400/50`}
                    >
                      <div className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center border border-amber-900/40 shadow-sm shrink-0 bg-[#FAF4D0]">
                        <img
                          src={getSymbolImageDataUrl(k)}
                          alt={s.name}
                          className="w-full h-full object-cover scale-[1.28] pointer-events-none select-none"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <h5 className="font-serif font-black text-amber-200 text-xs sm:text-sm truncate">
                            {s.name}
                          </h5>
                          <span className="font-nepali text-amber-400/90 font-bold text-xs shrink-0">
                            {s.nepaliName}
                          </span>
                        </div>
                        <div className="text-[10px] text-amber-300/80 font-medium mb-1">
                          {desc.meaning}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-snug">
                          {desc.lore}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: LORE & STRATEGY TIPS */}
          {activeTab === 'heritage' && (
            <div className="space-y-3.5 animate-in fade-in duration-200">
              {/* Cultural Lore Card */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-amber-500/20">
                <h4 className="font-serif font-bold text-amber-300 text-xs sm:text-sm mb-1.5 flex items-center gap-1.5">
                  <Scroll className="w-4 h-4 text-amber-400" />
                  <span>The Tihar & Dashain Tradition (खोरिया र दाउ)</span>
                </h4>
                <p className="text-slate-300 text-xs leading-relaxed mb-2">
                  Langur Burja has been played for generations during the festival of lights (Tihar / Deepawali) and victory (Dashain). Families and friends gather under oil lamps on Kathmandu courtyards and mountain village verandas. The game operator (<em>Khoriya</em>) controls the tumbler, chanting rhythmic Nepali rhymes as bets are laid down on the iconic cloth.
                </p>
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-amber-300/90 italic font-nepali">
                  "झण्डामा दाउ, बुर्जामा दाउ! खोर घुम्यो, भाग्य खुल्यो!" — The timeless Kathmandu festival chant!
                </div>
              </div>

              {/* Tactical Player Tips */}
              <div>
                <h4 className="font-serif font-bold text-amber-300 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5 text-amber-400" />
                  <span>Tactical Wagering Strategies</span>
                </h4>

                <div className="space-y-2 text-xs">
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-bold text-slate-100">Multi-Symbol Hedging: </span>
                      <span className="text-slate-400">
                        Instead of putting your entire stack on a single symbol, spreading smaller bets across 2 or 3 symbols increases your probability of hitting at least one double-match.
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-bold text-slate-100">Repeat Bet Convenience: </span>
                      <span className="text-slate-400">
                        Use the "Repeat Bet" button on the table to instantly re-apply your favorite winning layout from the previous round with a single tap.
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-bold text-slate-100">Cryptographically Fair Rolls: </span>
                      <span className="text-slate-400">
                        Every roll uses cryptographically secure pseudo-random generators with independent physics seeds. Past rolls have zero mathematical bearing on subsequent rolls.
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-bold text-slate-100">Daily Coin Faucet: </span>
                      <span className="text-slate-400">
                        If your coin balance drops low, tap the <strong>+ Free Coins</strong> button in the header or table menu to replenish your wallet with 1,000 festival chips.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="hidden sm:inline">Six 6-sided dice • 2+ matching symbols win</span>
            <span className="sm:hidden">2+ matches to win</span>
          </div>

          <button
            id="rules-confirm-btn"
            onClick={onClose}
            className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-serif font-black text-xs sm:text-sm tracking-wider shadow-lg shadow-amber-500/25 active:scale-95 transition-all border border-amber-300"
          >
            Understood, Let's Play!
          </button>
        </div>
      </div>
    </div>
  );
};
