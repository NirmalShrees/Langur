import React, { useState, useEffect } from 'react';
import { CheckCircle2, Clock, Users, X, Sparkles, Crown, LogOut, Activity, WifiOff, Mic, MicOff, Volume2, Radio } from 'lucide-react';
import { UserAvatar } from './UserAvatar.js';
import { PlayerSessionStats } from '../types.js';
import { voiceService, VoiceState } from '../services/voiceService.js';
import { VoiceChatBar } from './VoiceChatBar.js';

export interface TablePlayer {
  id: string;
  username: string;
  avatar: string;
  coins: number;
  currentBet: number;
  isReady: boolean;
  isHost?: boolean;
  sessionStats?: PlayerSessionStats;
  title?: string;
  isUser?: boolean;
  isBot?: boolean;
  isDisconnected?: boolean;
}

interface ActivePlayersDeckProps {
  players: TablePlayer[];
  phase: 'waiting' | 'betting' | 'rolling' | 'payout';
  onToggleUserReady?: () => void;
  isUserReady?: boolean;
  nextRoundVotes?: string[];
  bettingTimer: number;
  maxTimer?: number;
  roundNumber?: number;
  tablePool?: number;
  onOpenTableStats?: () => void;
  isTableOwner?: boolean;
  onKickPlayer?: (playerId: string) => void;
  onTransferLeadership?: (playerId: string, playerName: string) => void;
  ping?: number | null;
  isConnected?: boolean;
  isOnline?: boolean;
  roomId?: string | null;
  currentUser?: { id: string; username: string; avatar: string } | null;
}

export const ActivePlayersDeck: React.FC<ActivePlayersDeckProps> = React.memo(({
  players,
  phase,
  onToggleUserReady,
  isUserReady = false,
  nextRoundVotes = [],
  bettingTimer,
  roundNumber = 1,
  tablePool = 0,
  onOpenTableStats,
  isTableOwner,
  onKickPlayer,
  onTransferLeadership,
  ping = null,
  isConnected = true,
  isOnline = true,
  roomId = 'public_table',
  currentUser,
}) => {
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>(voiceService.getState());

  useEffect(() => {
    const unsub = voiceService.subscribe((vs) => {
      setVoiceState(vs);
    });
    return () => unsub();
  }, []);

  // Guarantee list has zero duplicates by ID or username
  const uniquePlayers = React.useMemo(() => {
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    return players.filter((p) => {
      if (!p || !p.id) return false;
      const lowerName = (p.username || '').trim().toLowerCase();
      if (seenIds.has(p.id)) return false;
      if (p.isUser) {
        seenIds.add(p.id);
        if (lowerName) seenNames.add(lowerName);
        return true;
      }
      if (lowerName && seenNames.has(lowerName)) return false;
      seenIds.add(p.id);
      if (lowerName) seenNames.add(lowerName);
      return true;
    });
  }, [players]);

  const isOwner = isTableOwner ?? Boolean(uniquePlayers.find((p) => p.isUser)?.isHost);

  // Show up to 4-5 circular player avatars, and remaining as +N
  const visiblePlayers = uniquePlayers.slice(0, 5);
  const overflowCount = Math.max(0, uniquePlayers.length - 5);

  const handleOpenStats = () => {
    setShowRosterModal(true);
  };

  // Compute speaking and voice status with robust fallback matching
  const isPeerSpeaking = (playerId: string, playerUsername: string, isUser?: boolean) => {
    if (isUser) {
      return Boolean(voiceState.isConnected && !voiceState.isMuted && voiceState.isSpeaking);
    }
    const directPeer = voiceState.peers[playerId];
    if (directPeer) {
      return Boolean(directPeer.isSpeaking && !directPeer.isMuted);
    }
    const matchedPeer = Object.values(voiceState.peers).find(
      (p) =>
        p.userId === playerId ||
        p.username.toLowerCase() === playerUsername.toLowerCase()
    );
    return Boolean(matchedPeer?.isSpeaking && !matchedPeer?.isMuted);
  };

  const isPeerVoiceConnected = (playerId: string, playerUsername: string, isUser?: boolean) => {
    if (isUser) return voiceState.isConnected;
    if (voiceState.peers[playerId]) return true;
    return Boolean(
      Object.values(voiceState.peers).find(
        (p) =>
          p.userId === playerId ||
          p.username.toLowerCase() === playerUsername.toLowerCase()
      )
    );
  };

  const isPeerMuted = (playerId: string, playerUsername: string, isUser?: boolean) => {
    if (isUser) return Boolean(voiceState.isConnected && voiceState.isMuted);
    const directPeer = voiceState.peers[playerId];
    if (directPeer) return Boolean(directPeer.isMuted);
    const matchedPeer = Object.values(voiceState.peers).find(
      (p) =>
        p.userId === playerId ||
        p.username.toLowerCase() === playerUsername.toLowerCase()
    );
    return Boolean(matchedPeer?.isMuted);
  };

  return (
    <>
      {/* Top Status Header with Table Info & Live Ping Latency Indicator directly above Avatars */}
      <div className="w-full flex items-center justify-between px-1 mb-1 text-[9.5px] font-mono select-none">
        {/* Left: Table Status */}
        <div className="flex items-center gap-1.5 text-slate-400 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <span className="font-semibold text-amber-200/90 tracking-wide uppercase text-[9px]">Pavilion Deck</span>
          <span className="text-slate-600">•</span>
          <span className="text-slate-300 font-bold">{uniquePlayers.length} {uniquePlayers.length === 1 ? 'Player' : 'Players'}</span>
        </div>

        {/* Top Right: Voice Chat Button & Network Ping Indicator */}
        <div className="flex items-center gap-1.5 relative">
          {/* Voice Chat Button with Dropdown/Tooltip Popover */}
          <VoiceChatBar
            roomId={roomId}
            currentUser={currentUser}
          />

          {/* Network Ping Indicator above Avatars Panel */}
          <div
            id="network-ping-indicator"
            title={
              !isOnline
                ? 'No Internet Connection (Offline)'
                : ping !== null
                ? `Network Latency: ${ping}ms (${ping < 90 ? 'Optimal' : ping < 180 ? 'Good' : 'High'})`
                : 'Connecting to network...'
            }
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-mono transition-all duration-300 shadow-sm ${
              !isOnline
                ? 'bg-rose-950/80 border-rose-500/50 text-rose-300'
                : ping === null
                ? 'bg-slate-900/80 border-slate-700 text-slate-400'
                : ping < 90
                ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
                : ping < 190
                ? 'bg-amber-950/70 border-amber-500/40 text-amber-300'
                : 'bg-rose-950/70 border-rose-500/40 text-rose-300'
            }`}
          >
            {!isOnline ? (
              <>
                <WifiOff className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                <span className="font-bold text-rose-300">Offline</span>
              </>
            ) : ping !== null ? (
              <>
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    !isConnected
                      ? 'bg-amber-400 animate-pulse'
                      : ping < 90
                      ? 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.9)]'
                      : ping < 190
                      ? 'bg-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.9)]'
                      : 'bg-rose-400 shadow-[0_0_5px_rgba(244,63,94,0.9)]'
                  }`}
                />
                <Activity className="w-2.5 h-2.5 opacity-80 shrink-0" />
                <span className="tabular-nums font-bold">
                  {ping}ms
                </span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 animate-ping shrink-0" />
                <span className="font-semibold text-slate-300">Connecting...</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Compact Elegant Table Pavilion Ribbon */}
      <div
        id="active-players-compact-pavilion"
        className="w-full flex items-center justify-between px-2 sm:px-2.5 py-1 rounded-xl bg-gradient-to-r from-[#060913] via-[#0c1222] to-[#060913] border border-amber-500/20 shadow-sm select-none shrink-0 overflow-visible"
      >
        {/* Top Left: Sleek Ready Button & Round Countdown Timer */}
        <div className="flex items-center gap-1.5 shrink-0">
          {phase === 'waiting' ? (
            <div className="h-[25px] flex items-center gap-1.5 px-2 rounded-lg bg-amber-500/15 border border-amber-400/40 text-amber-300 text-[10.5px] font-bold shrink-0 animate-pulse">
              <Crown className="w-3 h-3 text-amber-400" />
              <span>Waiting for Leader...</span>
            </div>
          ) : phase === 'betting' ? (
            <>
              {/* Ready Button (Fixed width so neither state changes its size) */}
              {onToggleUserReady && (
                <button
                  id="compact-deck-ready-btn"
                  onClick={onToggleUserReady}
                  title={isUserReady ? 'Status: Ready for next roll' : 'Click to toggle ready status'}
                  className={`w-[66px] h-[25px] rounded-lg text-[10px] font-mono font-bold transition-all shadow-sm active:scale-95 flex items-center justify-center gap-1 border shrink-0 ${
                    isUserReady
                      ? 'bg-emerald-500 border-emerald-300 text-slate-950 shadow-emerald-500/25 font-black'
                      : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-amber-500/40'
                  }`}
                >
                  {isUserReady ? (
                    <CheckCircle2 className="w-3 h-3 fill-slate-950 text-emerald-400 shrink-0" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  )}
                  <span>READY</span>
                </button>
              )}

              {/* Countdown Timer Badge */}
              <div
                id="active-countdown-badge"
                className="h-[25px] min-w-[58px] flex items-center justify-center px-2 rounded-lg bg-amber-950/50 border border-amber-500/35 text-amber-300 font-mono text-[10.5px] font-bold shadow-inner shrink-0 select-none overflow-visible"
              >
                <div
                  className={`flex items-center gap-1 origin-center ${
                    bettingTimer <= 4 ? 'animate-timer-urgent' : 'animate-timer-pulse'
                  }`}
                >
                  <Clock
                    className={`w-3 h-3 shrink-0 ${
                      bettingTimer <= 4 ? 'text-rose-400' : 'text-amber-400'
                    }`}
                  />
                  <span
                    className={`tabular-nums leading-none ${
                      bettingTimer <= 4 ? 'text-rose-300 font-black' : 'text-amber-200'
                    }`}
                  >
                    {Math.max(0, bettingTimer)}s
                  </span>
                </div>
              </div>
            </>
          ) : phase === 'rolling' ? (
            <div className="h-[25px] flex items-center gap-1 px-2 rounded-lg bg-amber-500/15 border border-amber-400/30 text-amber-300 text-[10.5px] font-bold animate-pulse shrink-0">
              <Sparkles className="w-3 h-3 text-amber-400 animate-spin" />
              <span>Rolling...</span>
            </div>
          ) : (
            <div className="h-[25px] flex items-center gap-1.5 px-2 rounded-lg bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[10px] font-bold shrink-0 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                Next: {uniquePlayers.filter((p) => (nextRoundVotes || []).includes(p.id) || p.isReady).length}/{uniquePlayers.length} Ready
              </span>
            </div>
          )}
        </div>

        {/* Right: Round Tag, Avatars Cluster, & Pool */}
        <div className="flex items-center gap-1.5 xs:gap-2 min-w-0">
          {/* Pool Counter */}
          <div className="hidden xs:flex items-center gap-1 font-mono text-[10px] text-slate-300 shrink-0">
            <span className="text-slate-500">Pool:</span>
            <span className="font-bold text-amber-200 truncate">{tablePool.toLocaleString()} 🪙</span>
          </div>

          {/* Circular Avatars Cluster */}
          <div
            onClick={handleOpenStats}
            className="flex items-center -space-x-1.5 cursor-pointer group shrink-0"
            title="Click to view all table players and win rates"
          >
            {visiblePlayers.map((player) => {
              const isUser = Boolean(player.isUser);
              const isHost = Boolean(player.isHost);
              const isDisconnected = Boolean(player.isDisconnected);
              const hasVotedNext = phase === 'payout' && ((nextRoundVotes || []).includes(player.id) || player.isReady);
              const isVoiceConnected = isPeerVoiceConnected(player.id, player.username, isUser);
              const isMuted = isPeerMuted(player.id, player.username, isUser);
              const isSpeaking = isPeerSpeaking(player.id, player.username, isUser);

              return (
                <div
                  key={player.id}
                  className={`relative group/avatar ${isHost ? 'z-30' : isUser ? 'z-20' : 'z-10'}`}
                  title={`${player.username}${isHost ? ' (Table Leader 👑)' : ''}${isSpeaking ? ' (Speaking Live 🎙️)' : ''}${isDisconnected ? ' (Reconnecting...)' : ''}: ${phase === 'payout' ? (hasVotedNext ? 'Ready for Next Round' : 'Viewing Results') : (player.isReady ? 'Ready' : 'Betting')}${isOwner && player.sessionStats?.winRate !== undefined ? ` • Win Rate: ${player.sessionStats.winRate}%` : ''}`}
                >
                  {/* Speaking Radar Halo Pulse */}
                  {isSpeaking && (
                    <span className="absolute -inset-1 rounded-full bg-emerald-400/40 animate-ping pointer-events-none z-0" />
                  )}

                  <div
                    className={`w-7 h-7 sm:w-7.5 sm:h-7.5 rounded-full flex items-center justify-center text-sm shadow-sm border transition-all duration-150 group-hover/avatar:scale-110 overflow-hidden relative z-10 ${
                      isSpeaking
                        ? 'bg-emerald-500/30 border-emerald-300 ring-2.5 ring-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.9)] animate-speaking-ring scale-110'
                        : isDisconnected
                        ? 'opacity-60 grayscale border-slate-600 bg-slate-900'
                        : isHost
                        ? 'bg-amber-500/30 border-amber-400 ring-2 ring-amber-400 shadow-md shadow-amber-950/80'
                        : isUser
                        ? 'bg-amber-500/25 border-amber-400 ring-1.5 ring-amber-400/60'
                        : 'bg-slate-900 border-slate-700'
                    }`}
                  >
                    <UserAvatar avatar={player.avatar} name={player.username} size="xs" className="w-full h-full rounded-none" />
                  </div>

                  {/* Real-time Voice Speaking Wave / Mute Badge */}
                  {isSpeaking ? (
                    <span
                      title={`${player.username} is speaking live 🎙️`}
                      className="absolute -top-1.5 -right-1.5 px-1 py-0.5 rounded-full bg-emerald-400 text-slate-950 border border-slate-950 flex items-center gap-[1.5px] shadow-lg z-40 pointer-events-none"
                    >
                      <span className="w-[1.5px] bg-slate-950 rounded-full animate-wave-1" />
                      <span className="w-[1.5px] bg-slate-950 rounded-full animate-wave-2" />
                      <span className="w-[1.5px] bg-slate-950 rounded-full animate-wave-3" />
                    </span>
                  ) : isVoiceConnected && isMuted ? (
                    <span
                      title="Microphone Muted"
                      className="absolute -top-1.5 -right-1 w-3.5 h-3.5 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center shadow z-30"
                    >
                      <MicOff className="w-2 h-2 text-rose-400" />
                    </span>
                  ) : null}

                  {/* Table Leader Crown Badge - Always renders on top of avatar and outline */}
                  {isHost && (
                    <span
                      title="Table Leader 👑"
                      className="absolute -top-2.5 -left-1.5 w-4 h-4 rounded-full bg-gradient-to-tr from-amber-300 via-amber-400 to-amber-600 flex items-center justify-center shadow-lg border border-slate-950 z-40 ring-1.5 ring-amber-300/90"
                    >
                      <Crown className="w-2.5 h-2.5 text-slate-950 fill-slate-950" />
                    </span>
                  )}

                  {/* Disconnected / Reconnecting indicator or Ready State Dot */}
                  {isDisconnected ? (
                    <span
                      title="Player temporarily disconnected - reconnecting"
                      className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-rose-600 border border-slate-950 flex items-center justify-center shadow z-20"
                    >
                      <WifiOff className="w-2 h-2 text-white" />
                    </span>
                  ) : phase === 'payout' ? (
                    hasVotedNext ? (
                      <span title="Ready for next round" className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-slate-950 shadow z-20 flex items-center justify-center">
                        <CheckCircle2 className="w-2 h-2 text-slate-950 fill-emerald-400" />
                      </span>
                    ) : (
                      <span title="Waiting for player to click Next Round" className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500/70 border border-slate-950 animate-pulse z-20" />
                    )
                  ) : player.isReady ? (
                    <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-slate-950 shadow z-20" />
                  ) : (
                    <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500/70 border border-slate-950 animate-pulse z-20" />
                  )}
                </div>
              );
            })}

            {/* Overflow Circle (+N) */}
            {overflowCount > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenStats();
                }}
                className="w-7 h-7 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-amber-500/40 flex items-center justify-center text-[10px] font-mono font-black text-amber-300 shadow-sm transition-transform hover:scale-110 shrink-0"
                title={`${overflowCount} more players at table`}
              >
                +{overflowCount}
              </button>
            )}
          </div>

          {/* Session Round Tag (e.g. #1, #2, etc) */}
          <div
            title={`Game Session Round #${roundNumber}`}
            className="px-2 py-0.5 rounded-lg bg-amber-950/60 border border-amber-500/35 text-amber-200 font-mono font-bold text-[10px] shrink-0 shadow-sm"
          >
            #{roundNumber}
          </div>
        </div>
      </div>

      {/* Table Players Modal / Popover */}
      {showRosterModal && (
        <div
          id="table-roster-backdrop"
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 sm:p-4 overscroll-contain animate-in fade-in duration-100"
          style={{ willChange: 'opacity' }}
          onClick={() => setShowRosterModal(false)}
        >
          <div
            id="table-roster-modal"
            className="w-full max-w-sm sm:max-w-md bg-gradient-to-b from-[#0e1424] via-[#090d18] to-[#060810] border border-amber-500/40 rounded-2xl shadow-2xl p-3.5 sm:p-4 text-slate-100 animate-in zoom-in-95 duration-100 overflow-hidden flex flex-col max-h-[85vh]"
            style={{ transform: 'translateZ(0)', willChange: 'transform' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2.5 border-b border-amber-500/25 mb-2.5 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shadow-inner">
                  <Users className="w-3.5 h-3.5" />
                </div>
                <h3 className="font-serif font-bold text-sm text-amber-100 tracking-wide">
                  Royal Table Players
                </h3>
                <span className="text-[10px] font-mono text-amber-300/90 bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/30">
                  {players.length}
                </span>
              </div>
              <button
                onClick={() => setShowRosterModal(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 overflow-y-auto overflow-x-hidden pr-1 scrollbar-thin min-h-0 flex-1">
              {uniquePlayers.map((p) => {
                const isMe = p.isUser;
                const isDisconnected = Boolean(p.isDisconnected);
                const isSpeaking = isPeerSpeaking(p.id, p.username, Boolean(p.isUser));

                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between gap-2.5 p-2.5 rounded-xl border overflow-hidden transition-all duration-150 ${
                      isSpeaking
                        ? 'bg-emerald-950/40 border-emerald-500/60 shadow-md shadow-emerald-950/40'
                        : isMe
                        ? 'bg-amber-500/15 border-amber-400/50'
                        : isDisconnected
                        ? 'bg-slate-900/40 border-slate-800 opacity-70'
                        : 'bg-slate-900/70 border-slate-800/90'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-sm shrink-0 overflow-hidden relative transition-all duration-150 ${
                        isSpeaking
                          ? 'border-emerald-400 ring-2 ring-emerald-400/70 bg-emerald-500/20 animate-speaking-ring'
                          : 'border-slate-700 bg-slate-800'
                      }`}>
                        <UserAvatar avatar={p.avatar} name={p.username} size="xs" className="w-full h-full rounded-none" />
                        {isSpeaking && (
                          <span className="absolute bottom-0 right-0 px-0.5 py-0.2 rounded-full bg-emerald-500 border border-slate-950 flex items-center gap-[1px]">
                            <span className="w-[1px] bg-slate-950 rounded-full animate-wave-1" />
                            <span className="w-[1px] bg-slate-950 rounded-full animate-wave-2" />
                            <span className="w-[1px] bg-slate-950 rounded-full animate-wave-3" />
                          </span>
                        )}
                        {isDisconnected && (
                          <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center">
                            <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5 min-w-0">
                          <span className="truncate max-w-[110px] sm:max-w-[150px]">{p.username}</span>
                          {isSpeaking && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-emerald-500/20 border border-emerald-400/40 text-[8.5px] font-bold text-emerald-300 font-mono shrink-0">
                              <Radio className="w-2.5 h-2.5 animate-pulse" />
                              TALKING
                            </span>
                          )}
                          {p.isHost && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/25 border border-amber-400/60 text-[8.5px] font-black text-amber-300 tracking-wider font-mono shadow-sm shrink-0 whitespace-nowrap">
                              <Crown className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                              LEADER
                            </span>
                          )}
                          {isMe && !isSpeaking && (
                            <span className="text-[9px] font-black text-amber-400 font-mono shrink-0 whitespace-nowrap">
                              (YOU)
                            </span>
                          )}
                          {isDisconnected && (
                            <span className="text-[8.5px] text-rose-400 bg-rose-950/60 px-1 py-0.2 rounded border border-rose-800/40 font-mono shrink-0">
                              Offline
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] sm:text-[10.5px] text-slate-400 font-mono flex items-center gap-1.5 flex-wrap min-w-0 mt-0.5">
                          <span className="text-amber-200/90 font-medium whitespace-nowrap">{p.coins.toLocaleString()} 🪙</span>
                          {p.currentBet > 0 && (
                            <span className="text-amber-300/80 whitespace-nowrap">• Bet: {p.currentBet.toLocaleString()}</span>
                          )}
                          {isOwner && p.sessionStats && p.sessionStats.roundsPlayed > 0 && (
                            <span className="text-emerald-400 font-bold whitespace-nowrap">
                              • WR: {p.sessionStats.winRate}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isDisconnected ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[9.5px] font-mono whitespace-nowrap">
                          Reconnecting
                        </span>
                      ) : p.isReady ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-bold whitespace-nowrap">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>Ready</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/30 text-amber-300 text-[10px] font-medium whitespace-nowrap">
                          Betting
                        </span>
                      )}

                      {/* Leader Action: Transfer Table Leadership */}
                      {isOwner && !isMe && onTransferLeadership && (
                        <button
                          type="button"
                          onClick={() => onTransferLeadership(p.id, p.username)}
                          title={`Make ${p.username} the Table Leader 👑`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-amber-500/20 transition-colors border border-transparent hover:border-amber-500/40 shrink-0 cursor-pointer"
                        >
                          <Crown className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Leader Action: Kick Player from Table */}
                      {isOwner && !isMe && onKickPlayer && (
                        <button
                          type="button"
                          onClick={() => onKickPlayer(p.id)}
                          title={`Kick ${p.username} from table`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/60 transition-colors border border-transparent hover:border-rose-700/50 shrink-0 cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5 text-rose-400" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {isOwner && onOpenTableStats && (
              <button
                type="button"
                onClick={() => {
                  setShowRosterModal(false);
                  onOpenTableStats();
                }}
                className="w-full mt-3 py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500/20 via-amber-400/20 to-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-xs font-bold font-mono flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
              >
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span>View Full Table History & Win Rates</span>
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
});

