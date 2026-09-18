import React, { useState } from 'react';
import {
  Crown,
  History,
  Users,
  X,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Flame,
  Clock,
  LogOut,
  BarChart3,
} from 'lucide-react';
import { RoomState, LANGUR_BURJA_SYMBOLS } from '../types.js';
import { UserAvatar } from './UserAvatar.js';
import { TablePlayer } from './ActivePlayersDeck.js';

interface TableStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  room?: RoomState | null;
  roomState?: RoomState | null;
  tablePlayers?: TablePlayer[];
  currentUserId: string;
  onKickPlayer?: (playerId: string) => void;
  onTransferLeadership?: (playerId: string, playerName: string) => void;
}

export const TableStatsModal: React.FC<TableStatsModalProps> = ({
  isOpen,
  onClose,
  room: propRoom,
  roomState: propRoomState,
  tablePlayers: propTablePlayers,
  currentUserId,
  onKickPlayer,
  onTransferLeadership,
}) => {
  const [activeTab, setActiveTab] = useState<'players' | 'history' | 'overview'>('players');
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);

  if (!isOpen) return null;

  const room = propRoom || propRoomState || null;
  const rawPlayerStats: any[] = Array.isArray((room as any)?.player_stats) ? (room as any).player_stats : [];

  const tablePlayers: TablePlayer[] = propTablePlayers || (() => {
    if (!room) return [];
    let playersSource = Array.isArray(room.players)
      ? room.players
      : Object.values(room.players || {});

    if (playersSource.length === 0 && rawPlayerStats.length > 0) {
      playersSource = rawPlayerStats;
    }

    return playersSource.map((p: any) => {
      const matchedStat = rawPlayerStats.find((s) => s.id === p.id) || {};
      const roundsPlayed = p.sessionStats?.roundsPlayed ?? matchedStat.roundsPlayed ?? p.roundsPlayed ?? 0;
      const roundsWon = p.sessionStats?.roundsWon ?? matchedStat.roundsWon ?? p.roundsWon ?? 0;
      const winRate =
        p.sessionStats?.winRate ??
        matchedStat.winRate ??
        p.winRate ??
        (roundsPlayed > 0 ? Math.round((roundsWon / roundsPlayed) * 100) : 0);
      const totalBet = p.sessionStats?.totalBet ?? matchedStat.totalBet ?? p.totalBet ?? 0;
      const totalWon = p.sessionStats?.totalWon ?? matchedStat.totalWon ?? p.totalWon ?? 0;
      const netProfit = p.sessionStats?.netProfit ?? matchedStat.netProfit ?? p.netProfit ?? 0;
      const biggestWin = p.sessionStats?.biggestWin ?? matchedStat.biggestWin ?? p.biggestWin ?? 0;

      return {
        id: p.id,
        username: p.username || matchedStat.username || 'Player',
        avatar: p.avatar || matchedStat.avatar || '🎲',
        coins: typeof p.coins === 'number' ? p.coins : (matchedStat.coins || 10000),
        currentBet: p.totalBetThisRound || p.currentBet || 0,
        isReady: Boolean((p.totalBetThisRound || p.currentBet || 0) > 0 || p.isReady),
        title: p.equipped?.title || 'Player',
        isUser: p.id === currentUserId,
        isHost: Boolean(p.isHost || room.hostId === p.id || matchedStat.isHost),
        isBot: false,
        sessionStats: {
          joinedAt: p.sessionStats?.joinedAt || matchedStat.lastActive || Date.now(),
          roundsPlayed,
          roundsWon,
          winRate,
          totalBet,
          totalWon,
          netProfit,
          biggestWin,
          history: p.sessionStats?.history || [],
        },
      };
    });
  })();

  const hostId = room?.hostId;
  const isHost = hostId === currentUserId;
  const hostPlayer = tablePlayers.find((p) => p.isHost || p.id === hostId);

  // Sort players: Table leader first, then by net profit descending
  const sortedPlayers = [...tablePlayers].sort((a, b) => {
    if (a.isHost || a.id === hostId) return -1;
    if (b.isHost || b.id === hostId) return 1;
    const netA = a.sessionStats?.netProfit || 0;
    const netB = b.sessionStats?.netProfit || 0;
    return netB - netA;
  });

  const tableHistory = room?.history || [];
  const tableStats = room?.tableStats || {
    totalRounds: room?.roundNumber ? Math.max(0, room.roundNumber - 1) : 0,
    totalBets: 0,
    totalPayouts: 0,
  };

  return (
    <div
      id="table-stats-backdrop"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overscroll-contain animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="table-stats-modal"
        className="w-full max-w-xl h-[560px] max-h-[90vh] bg-gradient-to-b from-[#0e1424] via-[#090d18] to-[#060810] border border-amber-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Ribbon */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-amber-500/30 bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 shadow-md shadow-amber-950/50 shrink-0">
              <Crown className="w-4 h-4 fill-slate-950" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-serif font-black text-sm sm:text-base text-amber-100 truncate">
                  {room?.name || 'Royal Table'}
                </h2>
                {room?.code && (
                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-300 shrink-0">
                    {room.code}
                  </span>
                )}
              </div>
              <p className="text-[10px] sm:text-[11px] text-amber-300/80 font-mono truncate flex items-center gap-1.5">
                <span>Leader:</span>
                <span className="font-bold text-amber-200">
                  {hostPlayer ? hostPlayer.username : 'Table Leader'} 👑
                </span>
                <span>•</span>
                <span className="capitalize text-emerald-400">
                  {room?.phase === 'waiting' ? 'Waiting' : 'Active'}
                </span>
              </p>
            </div>
          </div>

          <button
            id="close-table-stats-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation - Aligned and covering full width with grid-cols-3 */}
        <div className="grid grid-cols-3 w-full border-b border-amber-500/20 bg-slate-950/60 p-1.5 gap-1.5 shrink-0">
          <button
            id="table-tab-players-btn"
            onClick={() => setActiveTab('players')}
            className={`w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === 'players'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-400/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Players</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-amber-300 font-mono">
              {tablePlayers.length}
            </span>
          </button>

          <button
            id="table-tab-history-btn"
            onClick={() => setActiveTab('history')}
            className={`w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-400/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>History</span>
            {tableHistory.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-amber-300 font-mono">
                {tableHistory.length}
              </span>
            )}
          </button>

          <button
            id="table-tab-overview-btn"
            onClick={() => setActiveTab('overview')}
            className={`w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-400/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Stats</span>
          </button>
        </div>

        {/* Modal Scrollable Body (Fixed viewport flex-1) */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 scrollbar-thin">
          {activeTab === 'players' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 font-mono">
                <span>{isHost ? 'Session Records' : 'Table Roster'}</span>
                {isHost && <span>Click player to view logs</span>}
              </div>

              {sortedPlayers.map((player) => {
                const isMe = player.id === currentUserId;
                const isTableLeader = player.isHost || player.id === hostId;
                const stats = player.sessionStats;
                const roundsPlayed = stats?.roundsPlayed || 0;
                const roundsWon = stats?.roundsWon || 0;
                const winRate = stats?.winRate ?? (roundsPlayed > 0 ? Math.round((roundsWon / roundsPlayed) * 100) : 0);
                const netProfit = stats?.netProfit || 0;
                const totalBet = stats?.totalBet || 0;
                const totalWon = stats?.totalWon || 0;
                const biggestWin = stats?.biggestWin || 0;
                const isExpanded = expandedPlayerId === player.id;
                const historyLogs = stats?.history || [];

                return (
                  <div
                    key={player.id}
                    className={`rounded-xl border transition-all overflow-hidden ${
                      isTableLeader
                        ? 'bg-amber-500/10 border-amber-400/50 shadow-sm'
                        : isMe
                        ? 'bg-slate-900/80 border-amber-500/30 ring-1 ring-amber-500/20'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Top Row: Avatar, Host Badge, Win Rate, and Actions */}
                    <div
                      onClick={() => isHost && setExpandedPlayerId(isExpanded ? null : player.id)}
                      className={`p-2.5 flex items-center justify-between gap-2 select-none ${
                        isHost ? 'cursor-pointer hover:bg-slate-800/40' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative shrink-0">
                          <div
                            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-lg overflow-hidden border ${
                              isTableLeader
                                ? 'bg-amber-500/30 border-amber-400 ring-1 ring-amber-400/70 shadow-sm'
                                : 'bg-slate-800 border-slate-700'
                            }`}
                          >
                            <UserAvatar avatar={player.avatar} name={player.username} size="sm" className="w-full h-full rounded-none" />
                          </div>
                          {isTableLeader && (
                            <span
                              title="Table Leader 👑"
                              className="absolute -top-1.5 -left-1 w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-amber-400 to-amber-600 flex items-center justify-center shadow border border-slate-950 z-10"
                            >
                              <Crown className="w-2 h-2 text-slate-950 fill-slate-950" />
                            </span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-xs sm:text-sm text-slate-100 truncate">
                              {player.username}
                            </span>
                            {isTableLeader && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-500/25 border border-amber-400/50 text-[8.5px] font-black text-amber-300 font-mono tracking-wider">
                                LEADER
                              </span>
                            )}
                            {isMe && (
                              <span className="text-[8.5px] font-bold px-1.5 py-0.2 rounded bg-slate-800 text-amber-300 font-mono">
                                YOU
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[10.5px] text-slate-400 font-mono mt-0.5">
                            <span className="text-amber-200 font-bold">{player.coins.toLocaleString()} 🪙</span>
                            {player.currentBet > 0 && (
                              <span className="text-emerald-300">• Bet: {player.currentBet.toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Side: Win Rate Badge, Net Profit & Leader Actions */}
                      {isHost ? (
                        <div className="flex items-center gap-2 shrink-0 text-right">
                          <div>
                            <div className="flex items-center justify-end gap-1">
                              <span
                                className={`text-[9.5px] font-mono font-black px-1.5 py-0.5 rounded border ${
                                  winRate >= 50
                                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                                    : winRate >= 25
                                    ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                                    : 'bg-slate-800 border-slate-700 text-slate-400'
                                }`}
                              >
                                {winRate}% WR
                              </span>
                            </div>
                            <p
                              className={`text-[9.5px] font-mono font-bold mt-0.5 ${
                                netProfit > 0
                                  ? 'text-emerald-400'
                                  : netProfit < 0
                                  ? 'text-rose-400'
                                  : 'text-slate-400'
                              }`}
                            >
                              {netProfit > 0 ? `+${netProfit.toLocaleString()}` : netProfit.toLocaleString()} 🪙
                            </p>
                          </div>

                          {/* Leader Action: Transfer Leadership */}
                          {isHost && !isMe && onTransferLeadership && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onTransferLeadership(player.id, player.username);
                              }}
                              title={`Make ${player.username} the Leader 👑`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-amber-500/20 transition-colors border border-transparent hover:border-amber-500/40 shrink-0 cursor-pointer"
                            >
                              <Crown className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Leader Action: Kick Player */}
                          {isHost && !isMe && onKickPlayer && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onKickPlayer(player.id);
                              }}
                              title={`Kick ${player.username} from table`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/60 transition-colors border border-transparent hover:border-rose-700/50 shrink-0 cursor-pointer"
                            >
                              <LogOut className="w-3.5 h-3.5 text-rose-400" />
                            </button>
                          )}

                          <div className="p-1 rounded text-slate-400 hover:text-slate-200">
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 shrink-0">
                          {player.isReady ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold font-mono">
                              Ready
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-400/30 text-amber-300 text-xs font-medium font-mono">
                              Betting
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Detailed Stats Cards - Only visible to Table Leader */}
                    {isHost && (
                      <div className="grid grid-cols-4 gap-1 px-2.5 pb-2.5 pt-1 border-t border-slate-800/80 bg-slate-950/30 text-center font-mono">
                        <div className="p-1 rounded bg-slate-900/70 border border-slate-800">
                          <p className="text-[8.5px] text-slate-400">Wins</p>
                          <p className="text-[11px] font-bold text-slate-200">
                            {roundsWon}/{roundsPlayed}
                          </p>
                        </div>
                        <div className="p-1 rounded bg-slate-900/70 border border-slate-800">
                          <p className="text-[8.5px] text-slate-400">Bets</p>
                          <p className="text-[11px] font-bold text-amber-300">{totalBet.toLocaleString()}</p>
                        </div>
                        <div className="p-1 rounded bg-slate-900/70 border border-slate-800">
                          <p className="text-[8.5px] text-slate-400">Won</p>
                          <p className="text-[11px] font-bold text-emerald-300">{totalWon.toLocaleString()}</p>
                        </div>
                        <div className="p-1 rounded bg-slate-900/70 border border-slate-800">
                          <p className="text-[8.5px] text-slate-400">Best</p>
                          <p className="text-[11px] font-bold text-amber-200">
                            {biggestWin > 0 ? biggestWin.toLocaleString() : '—'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Expandable Round-by-Round Log */}
                    {isHost && isExpanded && (
                      <div className="p-2.5 border-t border-amber-500/20 bg-[#070b14] space-y-2">
                        <div className="flex items-center justify-between text-[10px] font-mono text-amber-300/80">
                          <span className="font-bold flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Logs ({player.username})
                          </span>
                          <span>{historyLogs.length} rounds</span>
                        </div>

                        {historyLogs.length === 0 ? (
                          <p className="text-[11px] text-slate-500 italic py-1 text-center">
                            No wagers placed yet in this session.
                          </p>
                        ) : (
                          <div className="space-y-1 max-h-36 overflow-y-auto pr-1 scrollbar-thin">
                            {historyLogs.map((log, idx) => {
                              return (
                                <div
                                  key={`${log.roundNumber}-${idx}`}
                                  className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900/70 border border-slate-800 text-[10.5px] font-mono"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-amber-400">#{log.roundNumber}</span>
                                    <div className="flex items-center gap-0.5">
                                      {log.dice?.map((s, dIdx) => (
                                        <span
                                          key={dIdx}
                                          className="text-[9px] w-3.5 h-3.5 rounded bg-slate-800 border border-slate-700 flex items-center justify-center"
                                          title={LANGUR_BURJA_SYMBOLS[s]?.nepaliName}
                                        >
                                          {LANGUR_BURJA_SYMBOLS[s]?.symbolChar || '🎲'}
                                        </span>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-400">{log.betAmount.toLocaleString()}</span>
                                    <span
                                      className={`font-bold ${
                                        log.netChange > 0
                                          ? 'text-emerald-400'
                                          : log.netChange < 0
                                          ? 'text-rose-400'
                                          : 'text-slate-400'
                                      }`}
                                    >
                                      {log.netChange > 0 ? `+${log.netChange.toLocaleString()}` : log.netChange.toLocaleString()} 🪙
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 font-mono">
                <span>Rolls</span>
                <span>{tableHistory.length} rounds</span>
              </div>

              {tableHistory.length === 0 ? (
                <div className="text-center py-12 text-slate-500 font-mono text-xs">
                  <p>No rolls completed yet.</p>
                  <p className="text-[10px] mt-1 text-slate-600">History records here as dice are thrown.</p>
                </div>
              ) : (
                tableHistory.map((entry) => (
                  <div
                    key={entry.roundNumber}
                    className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono font-bold text-[11px]">
                          #{entry.roundNumber}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        <span className="text-slate-400">Pool: <strong className="text-amber-300">{entry.totalTableBets.toLocaleString()}</strong></span>
                        <span className="text-slate-400">• Paid: <strong className="text-emerald-300">{entry.totalTablePayouts.toLocaleString()}</strong></span>
                      </div>
                    </div>

                    {/* Dice Rolled */}
                    <div className="flex items-center gap-1 bg-slate-950/60 p-1.5 rounded-lg border border-slate-800">
                      <span className="text-[9.5px] text-slate-400 font-mono shrink-0 mr-1">Roll:</span>
                      <div className="flex items-center gap-1 flex-wrap">
                        {entry.dice?.map((sym, idx) => {
                          const cfg = LANGUR_BURJA_SYMBOLS[sym];
                          const isWin = entry.winningSymbols?.includes(sym);
                          return (
                            <div
                              key={idx}
                              className={`flex items-center gap-1 px-1.5 py-0.2 rounded border text-[10.5px] font-mono ${
                                isWin
                                  ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold ring-1 ring-amber-400/40'
                                  : 'bg-slate-900 border-slate-700 text-slate-400'
                              }`}
                            >
                              <span>{cfg?.symbolChar || '🎲'}</span>
                              <span className="text-[9.5px]">{cfg?.name || sym}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'overview' && (
            <div className="space-y-2.5 font-mono">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-400/40 space-y-1.5">
                <div className="flex items-center gap-1.5 text-amber-200 font-bold text-xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>Table Info</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-300">
                  <div>
                    <span className="text-slate-500">Name:</span>{' '}
                    <span className="font-bold text-slate-100">{room?.name || 'Langur Burja'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Code:</span>{' '}
                    <span className="font-bold text-amber-300">{room?.code || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Leader:</span>{' '}
                    <span className="font-bold text-amber-200">{hostPlayer?.username || 'Leader'} 👑</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Timer:</span>{' '}
                    <span className="font-bold text-slate-100">{room?.settings?.bettingDuration || 18}s</span>
                  </div>
                </div>
              </div>

              {/* Table Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-center">
                <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
                  <p className="text-[9.5px] text-slate-400">Rounds</p>
                  <p className="text-sm font-black text-amber-200 mt-0.5">{tableStats.totalRounds}</p>
                </div>
                <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
                  <p className="text-[9.5px] text-slate-400">Total Bets</p>
                  <p className="text-sm font-black text-amber-400 mt-0.5">
                    {(tableStats.totalBets || 0).toLocaleString()}
                  </p>
                </div>
                <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
                  <p className="text-[9.5px] text-slate-400">Payouts</p>
                  <p className="text-sm font-black text-emerald-400 mt-0.5">
                    {(tableStats.totalPayouts || 0).toLocaleString()}
                  </p>
                </div>
                <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
                  <p className="text-[9.5px] text-slate-400">Players</p>
                  <p className="text-sm font-black text-amber-300 mt-0.5">{tablePlayers.length}</p>
                </div>
              </div>

              {/* Top Round Winner */}
              {tableStats.biggestWinner && (
                <div className="p-2.5 rounded-xl bg-slate-900/90 border border-emerald-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    <div>
                      <p className="text-[9.5px] text-slate-400 uppercase tracking-wider">Top Round Win</p>
                      <p className="text-[11.5px] font-bold text-slate-200">
                        {tableStats.biggestWinner.username} in #{tableStats.biggestWinner.roundNumber}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-400">
                    +{tableStats.biggestWinner.amount.toLocaleString()} 🪙
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-amber-500/20 bg-slate-950/70 flex items-center justify-between text-[11px] font-mono text-slate-400 shrink-0">
          <span>👑 Leader: {hostPlayer ? hostPlayer.username : 'Table Leader'}</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 transition-colors font-bold text-xs cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
