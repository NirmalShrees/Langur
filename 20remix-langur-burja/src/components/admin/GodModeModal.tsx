import React, { useState, useEffect } from 'react';
import {
  Zap,
  X,
  Copy,
  Check,
  Play,
  ChevronRight,
  RefreshCw,
  Clock,
  Crown,
  Users,
  Target,
  Activity,
} from 'lucide-react';
import { SymbolType, LANGUR_BURJA_SYMBOLS, SYMBOL_KEYS } from '../../types.js';
import { SYMBOL_IMAGE_PATHS } from '../../utils/diceTextures.js';
import { UserAvatar } from '../common/UserAvatar.js';
import { sound } from '../../utils/audio.js';
import { TableAvarControl } from './TableAvarControl.js';

export interface GodModePlayer {
  id: string;
  username: string;
  avatar: string;
  coins: number;
  currentBet: number;
  isHost: boolean;
  isBot: boolean;
  bets?: Record<SymbolType, number>;
}

export interface GodModeTableData {
  id: string;
  name: string;
  code: string;
  hostId: string;
  hostName: string;
  isPrivate: boolean;
  phase: string;
  timer: number;
  bettingDuration?: number;
  roundNumber: number;
  playerCount: number;
  realPlayerCount: number;
  players: GodModePlayer[];
  tableBets: Record<SymbolType, number>;
  totalRoundBets: number;
  avar?: number;
  status?: string;
}

export interface GodModeCareerStats {
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  totalWinnings: number;
  biggestWin: number;
  isAdmin?: boolean;
}

interface GodModeModalProps {
  table: GodModeTableData;
  onClose: () => void;
  playersRegistry: Record<string, GodModeCareerStats>;
  onTableAction: (tableId: string, action: 'roll_now' | 'next_round' | 'terminate' | 'delete') => Promise<void>;
  onUpdateAvar: (tableId: string, avar: number) => Promise<void>;
  onRefresh: () => void;
  actionInProgress: string | null;
}

export const GodModeModal: React.FC<GodModeModalProps> = ({
  table,
  onClose,
  playersRegistry,
  onTableAction,
  onUpdateAvar,
  onRefresh,
  actionInProgress,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);

  // Auto-refresh table every 2 seconds only while God View is open/mounted
  useEffect(() => {
    onRefresh();
    const intervalId = setInterval(() => {
      onRefresh();
    }, 2000);

    return () => clearInterval(intervalId);
  }, [onRefresh]);

  const handleCopyCode = () => {
    sound.playChipSound();
    navigator.clipboard.writeText(table.code).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }).catch(() => {});
  };

  return (
    <div
      className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-3 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-gradient-to-b from-[#0e1628] via-[#090e1b] to-[#04060d] border border-amber-500/40 shadow-2xl text-slate-100 overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact Header */}
        <header className="px-3.5 py-2.5 bg-gradient-to-r from-[#141d33] via-[#0e172a] to-[#10192e] border-b border-amber-500/30 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow border border-amber-300/40 shrink-0">
              <Zap className="w-3.5 h-3.5 text-slate-950 fill-slate-950" />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="font-serif font-black text-xs sm:text-sm text-amber-200 truncate">
                {table.name}
              </h2>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                GOD MODE
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="hidden xs:flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900/90 hover:bg-slate-800 text-amber-300 border border-slate-700/80 text-[10px] font-mono font-bold transition-all cursor-pointer shrink-0"
                title="Copy Room Code"
              >
                <span>{table.code}</span>
                {copiedCode ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg bg-slate-800/80 hover:bg-rose-950/80 text-slate-400 hover:text-rose-200 border border-slate-700 hover:border-rose-500/40 transition-all cursor-pointer shrink-0"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Scrollable Compact Body */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
          {/* 1. Compact Live Telemetry & Control Bar */}
          <div className="p-2.5 rounded-xl bg-slate-950/90 border border-amber-500/30 space-y-2 shadow-inner">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 font-mono font-black text-[11px]">
                  Round #{table.roundNumber}
                </span>

                <span
                  className={`px-2 py-0.5 rounded-lg font-mono text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1 ${
                    table.phase === 'betting'
                      ? 'bg-amber-500/15 border-amber-400/50 text-amber-300'
                      : table.phase === 'rolling'
                      ? 'bg-purple-500/20 border-purple-400/50 text-purple-200 animate-pulse'
                      : table.phase === 'payout'
                      ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
                  <span>
                    {table.phase === 'betting' && `Betting (${table.timer}s)`}
                    {table.phase === 'rolling' && `Rolling (${table.timer}s)`}
                    {table.phase === 'payout' && `Payout (${table.timer}s)`}
                    {table.phase !== 'betting' && table.phase !== 'rolling' && table.phase !== 'payout' && 'Waiting'}
                  </span>
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5">
                {table.phase === 'betting' && (
                  <button
                    type="button"
                    onClick={() => onTableAction(table.id, 'roll_now')}
                    disabled={actionInProgress === table.id}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[10.5px] shadow active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-3 h-3 fill-slate-950" />
                    <span>Roll Now</span>
                  </button>
                )}

                {table.phase === 'payout' && (
                  <button
                    type="button"
                    onClick={() => onTableAction(table.id, 'next_round')}
                    disabled={actionInProgress === table.id}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10.5px] shadow active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <ChevronRight className="w-3 h-3 stroke-[2.5]" />
                    <span>Advance</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onRefresh}
                  className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-700/80 text-[10px] transition-all cursor-pointer"
                  title="Refresh"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Concise Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-xs">
              <div className="p-1.5 px-2 rounded-lg bg-slate-900/80 border border-slate-800/80 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">Pool</span>
                <span className="text-amber-300 font-bold">{table.totalRoundBets.toLocaleString()} 🪙</span>
              </div>

              <div className="p-1.5 px-2 rounded-lg bg-slate-900/80 border border-slate-800/80 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">Players</span>
                <span className="text-sky-300 font-bold">{table.realPlayerCount || table.players?.length || 1}</span>
              </div>

              <div className="p-1.5 px-2 rounded-lg bg-slate-900/80 border border-slate-800/80 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">A-VAR</span>
                <span className="text-emerald-300 font-bold">{table.avar ?? 50}%</span>
              </div>

              <div className="p-1.5 px-2 rounded-lg bg-slate-900/80 border border-slate-800/80 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">Timer</span>
                <span className="text-amber-400 font-bold flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  <span>{table.timer}s</span>
                </span>
              </div>
            </div>

            {/* Compact A-VAR Slider */}
            <div className="pt-0.5 border-t border-slate-800/60">
              <TableAvarControl
                tableId={table.id}
                tableName={table.name}
                avarValue={table.avar ?? 50}
                onUpdateAvar={onUpdateAvar}
                disabled={actionInProgress === table.id}
              />
            </div>
          </div>

          {/* 2. Compact Symbol Exposure Grid */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 px-0.5">
              <div className="flex items-center gap-1.5 text-xs font-serif font-bold text-amber-200">
                <Target className="w-3.5 h-3.5 text-amber-400" />
                <span>Symbol Exposure</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                Win Chance: <strong className="text-amber-300">26.3% (≥2 matches)</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
              {SYMBOL_KEYS.map((symKey) => {
                const symInfo = LANGUR_BURJA_SYMBOLS[symKey];
                const symBet = Number(table.tableBets?.[symKey] || 0);
                const totalPool = table.totalRoundBets || 1;
                const symPct = Math.round((symBet / totalPool) * 100);
                const isHighRisk = symBet > 0 && symPct >= 35;

                return (
                  <div
                    key={symKey}
                    className={`p-2 rounded-xl border space-y-1 transition-all shadow-sm ${
                      symBet > 0
                        ? isHighRisk
                          ? 'bg-rose-950/30 border-rose-500/50'
                          : 'bg-amber-950/20 border-amber-500/40'
                        : 'bg-slate-900/50 border-slate-800/80 opacity-70'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <img
                        src={SYMBOL_IMAGE_PATHS[symKey]}
                        alt={symInfo.name}
                        className="w-4 h-4 object-contain rounded shrink-0 shadow-sm"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                      <span className="font-bold text-[11px] text-slate-200 truncate flex-1">{symInfo.name}</span>
                      <span className="text-[9px] text-amber-400/90 font-nepali truncate">{symInfo.nepaliName}</span>
                    </div>

                    <div className="font-mono text-[11px] flex items-center justify-between border-t border-slate-800/60 pt-0.5">
                      <span className="text-[9.5px] text-slate-400">Bet:</span>
                      <span className={`font-bold ${symBet > 0 ? 'text-amber-300' : 'text-slate-500'}`}>
                        {symBet.toLocaleString()} 🪙 <span className="text-[9px] text-slate-400 font-normal">({symPct}%)</span>
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                      <span>2x: <strong className="text-slate-200">{(symBet * 2).toLocaleString()}</strong></span>
                      <span
                        className={`px-1 py-0.2 rounded text-[8px] font-bold uppercase tracking-wider ${
                          symBet === 0
                            ? 'bg-emerald-950/80 text-emerald-300'
                            : isHighRisk
                            ? 'bg-rose-950/80 text-rose-300'
                            : 'bg-amber-950/80 text-amber-300'
                        }`}
                      >
                        {symBet === 0 ? 'Safe' : isHighRisk ? 'High Risk' : 'Balanced'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Compact Live Player Stats */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 px-0.5">
              <div className="flex items-center gap-1.5 text-xs font-serif font-bold text-amber-200">
                <Users className="w-3.5 h-3.5 text-amber-400" />
                <span>Live Player Stats ({table.players?.length || 0})</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                Roster & Probabilities
              </span>
            </div>

            {(!table.players || table.players.length === 0) ? (
              <div className="py-4 text-center rounded-xl bg-slate-900/40 border border-slate-800 text-slate-400 text-xs">
                No active players in room.
              </div>
            ) : (
              <div className="space-y-1.5">
                {table.players.map((p) => {
                  const career = playersRegistry[p.id] || {
                    gamesPlayed: 0,
                    gamesWon: 0,
                    winRate: 0,
                    totalWinnings: 0,
                    biggestWin: 0,
                    isAdmin: false,
                  };

                  const gamesPlayed = career.gamesPlayed || 0;
                  const gamesWon = career.gamesWon || 0;
                  const winRate = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : career.winRate || 0;

                  const playerBets = p.bets || {};
                  const activeSymbolBets = Object.entries(playerBets).filter(([_, val]) => Number(val) > 0) as [SymbolType, number][];
                  const symbolsCoveredCount = activeSymbolBets.length;

                  let roundOddsLabel = '0% (Spectating)';
                  if (symbolsCoveredCount === 1) roundOddsLabel = '26.3% (1 Symbol)';
                  else if (symbolsCoveredCount === 2) roundOddsLabel = '46.5% (2 Symbols)';
                  else if (symbolsCoveredCount === 3) roundOddsLabel = '62.8% (3 Symbols)';
                  else if (symbolsCoveredCount >= 4) roundOddsLabel = '75.4%+ (Multi)';
                  else if (p.currentBet > 0) roundOddsLabel = '~26.3% (Active)';

                  return (
                    <div
                      key={p.id}
                      className="p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-900/75 border border-slate-800/80 hover:border-amber-500/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-2 shadow-sm"
                    >
                      {/* Left: Player Identity & Balance */}
                      <div className="flex items-center gap-2 min-w-0 md:w-1/3">
                        <div className="relative shrink-0">
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-xs shadow border border-amber-300/40 overflow-hidden">
                            <UserAvatar avatar={p.avatar} name={p.username} size="sm" className="w-full h-full rounded-none" />
                          </div>
                          <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-950 bg-emerald-400" />
                        </div>

                        <div className="min-w-0 leading-tight">
                          <div className="flex items-center gap-1 truncate">
                            <span className="font-serif font-bold text-xs text-amber-200 truncate">
                              {p.username}
                            </span>
                            {p.isHost && (
                              <span className="text-[8px] px-1 py-0.2 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30">
                                HOST
                              </span>
                            )}
                            {p.isBot && (
                              <span className="text-[8px] px-1 py-0.2 rounded font-mono font-bold bg-sky-500/20 text-sky-300 border border-sky-400/30">
                                BOT
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                            <span className="text-amber-300 font-bold">{p.coins.toLocaleString()} 🪙</span>
                            <span className="text-slate-600 mx-1">·</span>
                            <span>Bet: <strong className="text-amber-200">{p.currentBet.toLocaleString()}</strong></span>
                          </div>
                        </div>
                      </div>

                      {/* Middle: Active Bets & Win Odds */}
                      <div className="flex-1 min-w-0 md:px-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9.5px] font-mono font-bold text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.2 rounded">
                            {roundOddsLabel}
                          </span>

                          {activeSymbolBets.length > 0 ? (
                            activeSymbolBets.map(([symKey, amt]) => {
                              const sym = LANGUR_BURJA_SYMBOLS[symKey];
                              return (
                                <span
                                  key={symKey}
                                  className="px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/25 text-[9.5px] font-mono text-amber-200 flex items-center gap-1"
                                >
                                  <img src={SYMBOL_IMAGE_PATHS[symKey]} alt={sym.name} className="w-3 h-3 object-contain" />
                                  <span>{sym.name}: {Number(amt).toLocaleString()}</span>
                                </span>
                              );
                            })
                          ) : p.currentBet > 0 ? (
                            <span className="text-[9.5px] font-mono text-amber-300">
                              Placed: {p.currentBet.toLocaleString()} 🪙
                            </span>
                          ) : (
                            <span className="text-[9.5px] font-mono text-slate-500 italic">
                              No bets
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: Career Stats */}
                      <div className="flex items-center justify-end font-mono text-[10.5px] shrink-0">
                        <div className="text-right leading-tight">
                          <div className="text-slate-300">
                            Win Rate: <strong className="text-amber-300">{winRate}%</strong> <span className="text-[9px] text-slate-500">({gamesWon}/{gamesPlayed})</span>
                          </div>
                          <div className="text-[9.5px] text-slate-400">
                            Won: <strong className="text-emerald-400">+{career.totalWinnings.toLocaleString()} 🪙</strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Compact Footer (Zero Wasted Space - Live Real-Time Telemetry Sync) */}
        <footer className="px-3.5 py-1.5 bg-slate-950/95 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[10px] font-mono text-slate-400 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-emerald-300 font-semibold">Live Real-Time Telemetry Sync</span>
          </div>
          <div className="text-slate-500">
            Esc / ✕ to close
          </div>
        </footer>
      </div>
    </div>
  );
};
