import React, { useState, useEffect } from 'react';
import {
  Crown,
  Dice5,
  X,
  Users,
  Lock,
  Globe,
  Share2,
  Copy,
  Check,
  Sparkles,
  ArrowRight,
  Zap,
  LogIn,
  LogOut,
  AlertCircle,
  Clock,
  Coins,
  ShieldCheck,
  RefreshCw,
  UserX,
} from 'lucide-react';
import { UserProfile, RoomState } from '../types.js';
import { sound } from '../utils/audio.js';
import { UserAvatar } from './UserAvatar.js';

export interface PublicRoomSummary {
  id: string;
  name: string;
  code: string;
  playerCount: number;
  phase: string;
  timer: number;
}

interface GameTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  mode?: 'create' | 'join';
  publicRooms: PublicRoomSummary[];
  currentRoom?: RoomState | null;
  onHostEnterTable?: (roomId: string) => Promise<void>;
  onCreateTable: (params: {
    name: string;
    isPrivate: boolean;
    bettingDuration: number;
  }) => Promise<{ success: boolean; code?: string; roomId?: string; error?: string }>;
  onJoinByCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  onJoinRandom: () => Promise<{ success: boolean; error?: string }>;
  onJoinRoomById: (roomId: string) => Promise<{ success: boolean; error?: string }>;
  onRefreshRooms?: () => void | Promise<any>;
  onKickPlayer?: (playerId: string) => void;
}

export const GameTableModal: React.FC<GameTableModalProps> = ({
  isOpen,
  onClose,
  user,
  mode = 'create',
  publicRooms,
  currentRoom,
  onHostEnterTable,
  onCreateTable,
  onJoinByCode,
  onJoinRandom,
  onJoinRoomById,
  onRefreshRooms,
  onKickPlayer,
}) => {
  // --- Create Table State ---
  const [tableName, setTableName] = useState(`${user.username}'s Table`);
  const [allowRandoms, setAllowRandoms] = useState(true); // Default to allow randoms, or toggle to Friends Only
  const [bettingDuration, setBettingDuration] = useState<number>(18);
  const [isCreating, setIsCreating] = useState(false);
  const [createdRoomInfo, setCreatedRoomInfo] = useState<{ code: string; roomId: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showPlayersTooltip, setShowPlayersTooltip] = useState(false);

  // --- Join Table State ---
  const [tableCodeInput, setTableCodeInput] = useState('');
  const [isJoiningCode, setIsJoiningCode] = useState(false);
  const [isJoiningRandom, setIsJoiningRandom] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [isRefreshingRooms, setIsRefreshingRooms] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRefreshRooms = async () => {
    if (isRefreshingRooms) return;
    setIsRefreshingRooms(true);
    sound.playChipSound();
    try {
      if (onRefreshRooms) {
        await onRefreshRooms();
      }
    } finally {
      setTimeout(() => {
        setIsRefreshingRooms(false);
      }, 400);
    }
  };

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setCreatedRoomInfo(null);
      setCopiedLink(false);
      setCopiedCode(false);
      setTableName(`${user.username}'s Table`);
      onRefreshRooms?.();
    }
  }, [isOpen, mode, user.username, onRefreshRooms]);

  if (!isOpen) return null;

  // Handle Create Table Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsCreating(true);
    sound.playChipSound();

    const result = await onCreateTable({
      name: tableName.trim() || `${user.username}'s Pavilion`,
      isPrivate: !allowRandoms,
      bettingDuration,
    });

    setIsCreating(false);

    if (!result.success) {
      setErrorMsg(result.error || 'Failed to create table.');
      return;
    }

    if (result.code && result.roomId) {
      sound.playWinFanfare();
      setCreatedRoomInfo({ code: result.code, roomId: result.roomId });
    }
  };

  // Handle Join with Table Code
  const handleJoinByCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = tableCodeInput.trim().toUpperCase();
    if (!cleanCode) {
      setErrorMsg('Please enter a 6-character table code.');
      return;
    }

    setErrorMsg(null);
    setIsJoiningCode(true);
    sound.playChipSound();

    const res = await onJoinByCode(cleanCode);
    setIsJoiningCode(false);

    if (!res.success) {
      setErrorMsg(res.error || 'Table not found. Please check the code.');
    } else {
      onClose();
    }
  };

  // Handle Join Random Table
  const handleJoinRandomClick = async () => {
    setErrorMsg(null);
    setIsJoiningRandom(true);
    sound.playChipSound();

    const res = await onJoinRandom();
    if (!res.success) {
      // If joining random table returned false, automatically create a public table with random enabled!
      const createRes = await onCreateTable({
        name: `${user.username}'s Table`,
        isPrivate: false,
        bettingDuration: 20,
      });
      setIsJoiningRandom(false);
      if (!createRes.success) {
        setErrorMsg(createRes.error || 'Failed to auto-create public table.');
      } else {
        onClose();
      }
    } else {
      setIsJoiningRandom(false);
      onClose();
    }
  };

  // Handle direct room item click
  const handleRoomItemClick = async (roomId: string, roomCode?: string) => {
    setErrorMsg(null);
    setJoiningRoomId(roomId);
    sound.playChipSound();

    let res = await onJoinRoomById(roomId);
    if (!res.success && roomCode) {
      res = await onJoinByCode(roomCode);
    }
    setJoiningRoomId(null);

    if (!res.success) {
      setErrorMsg(res.error || 'Could not join this table.');
    } else {
      onClose();
    }
  };

  // Copy Invite Link
  const handleCopyLink = () => {
    if (!createdRoomInfo?.code) return;
    sound.playChipSound();
    const origin = window.location.origin;
    const inviteUrl = `${origin}?table=${createdRoomInfo.code}`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }).catch(() => {});
  };

  // Copy Table Code
  const handleCopyCode = () => {
    if (!createdRoomInfo?.code) return;
    sound.playChipSound();
    navigator.clipboard.writeText(createdRoomInfo.code).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }).catch(() => {});
  };

  // Share via Web Share API if available
  const handleShareNative = () => {
    if (!createdRoomInfo?.code) return;
    const origin = window.location.origin;
    const inviteUrl = `${origin}?table=${createdRoomInfo.code}`;

    if (navigator.share) {
      navigator.share({
        title: 'Join my Langur Burja Table!',
        text: `🎲 Roll dice with me at table ${createdRoomInfo.code}! Tap to join:`,
        url: inviteUrl,
      }).catch(() => {});
    } else {
      handleCopyLink();
    }
  };

  return (
    <div
      id="game-table-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="game-table-modal-container"
        className="w-full max-w-sm sm:max-w-md bg-gradient-to-b from-[#0e1628] via-[#090f1d] to-[#050811] border border-amber-500/40 rounded-3xl p-4 sm:p-6 shadow-2xl shadow-black/90 relative overflow-hidden text-slate-100 select-none animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Warm decorative ambiance */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-44 h-44 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-44 h-44 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          id="game-table-modal-close-btn"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800/80 text-slate-400 hover:text-amber-200 border border-slate-700/80 active:scale-95 transition-all z-10 cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header Title tailored to the chosen mode */}
        <div className="text-center mb-4 shrink-0">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold uppercase tracking-wider mb-2">
            {mode === 'create' ? (
              <>
                <Crown className="w-3 h-3 text-amber-400" />
                <span>Host Game Table</span>
              </>
            ) : (
              <>
                <Dice5 className="w-3 h-3 text-amber-400" />
                <span>Join Game Table</span>
              </>
            )}
          </div>
          <h2 className="font-serif font-black text-xl sm:text-2xl text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-amber-300 to-amber-500">
            {mode === 'create' ? 'CREATE TABLE' : 'JOIN TABLE'}
          </h2>
          <p className="text-[11px] text-slate-400">
            {mode === 'create'
              ? 'Configure your table rules, timer, and invite your friends'
              : 'Enter a friend’s 6-digit code or quick-match to an open table'}
          </p>
        </div>

        {/* Error Notification */}
        {errorMsg && (
          <div className="mb-3 p-2.5 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs flex items-start gap-2 shrink-0 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="leading-tight text-[11px]">{errorMsg}</span>
          </div>
        )}

        {/* Scrollable Modal Content (non-scrollable when showing created room to fit everything cleanly) */}
        <div className={`${createdRoomInfo ? 'overflow-visible' : 'overflow-y-auto'} flex-1 pr-0.5 space-y-4 scrollbar-thin scrollbar-thumb-slate-800`}>
          {/* ========================================================= */}
          {/* 1. CREATE TABLE VIEW */}
          {/* ========================================================= */}
          {mode === 'create' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {createdRoomInfo ? (
                /* Created Room Invite, Joined Players & Host Entry Panel - Non-scrollable compact layout */
                <div className="p-3 sm:p-4 rounded-2xl bg-gradient-to-b from-amber-950/40 via-slate-900 to-slate-950 border border-amber-400/50 space-y-3 text-center relative">
                  {/* Compact Header */}
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center shadow-md shadow-amber-950/80 shrink-0">
                      <Crown className="w-4 h-4 fill-slate-950" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-serif font-black text-sm sm:text-base text-amber-200 leading-tight">
                        Table Created Successfully!
                      </h3>
                      <span className="text-[10px] text-amber-300/80 font-mono">
                        Waiting for players to join
                      </span>
                    </div>
                  </div>

                  {/* Compact Table Code & Copy Actions Bar */}
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-amber-500/40 flex items-center justify-between gap-2">
                    <div className="text-left pl-1">
                      <span className="text-[9px] text-slate-400 uppercase font-mono block">Private Table Code</span>
                      <span className="font-mono font-black text-xl sm:text-2xl text-amber-300 tracking-widest leading-none">
                        {createdRoomInfo.code}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 active:scale-95 transition-all flex items-center gap-1 text-xs font-bold cursor-pointer"
                      >
                        {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 active:scale-95 transition-all cursor-pointer"
                        title="Copy Invite Link"
                      >
                        {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5 text-amber-400" />}
                      </button>
                    </div>
                  </div>

                  {/* Joined Players: ONLY Avatars shown, clicking shows player list tooltip without extending layout */}
                  {(() => {
                    const joinedPlayers = currentRoom?.players
                      ? Object.values(currentRoom.players)
                      : [
                          {
                            id: user.id,
                            username: user.username,
                            avatar: user.avatar,
                            coins: user.coins,
                            isHost: true,
                          },
                        ];

                    return (
                      <div className="relative">
                        {/* Floating Tooltip positioned over the avatar section so it doesn't extend the layout */}
                        {showPlayersTooltip && (
                          <div
                            className="absolute bottom-full mb-2 left-0 right-0 z-50 p-3 rounded-2xl bg-slate-950/95 border border-amber-400/70 shadow-2xl shadow-black/90 backdrop-blur-md text-left animate-in fade-in zoom-in-95 duration-150"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 mb-2">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-200">
                                <Users className="w-3.5 h-3.5 text-amber-400" />
                                <span>Joined Players ({joinedPlayers.length})</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setShowPlayersTooltip(false)}
                                className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Player rows list inside tooltip */}
                            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5 scrollbar-thin">
                              {joinedPlayers.map((p) => {
                                const isOwner = Boolean(p.isHost || (currentRoom && currentRoom.hostId === p.id) || p.id === user.id);
                                const isTableHost = Boolean(currentRoom ? currentRoom.hostId === user.id : true);
                                const isSelf = p.id === user.id;
                                return (
                                  <div
                                    key={p.id}
                                    className={`flex items-center justify-between p-1.5 rounded-lg border text-xs ${
                                      isOwner ? 'bg-amber-500/10 border-amber-400/40' : 'bg-slate-900/80 border-slate-800'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="relative shrink-0">
                                        <div
                                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs overflow-hidden border ${
                                            isOwner ? 'border-amber-400' : 'border-slate-700'
                                          }`}
                                        >
                                          <UserAvatar avatar={p.avatar} name={p.username} size="xs" className="w-full h-full rounded-none" />
                                        </div>
                                        {isOwner && (
                                          <span className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-amber-400 flex items-center justify-center">
                                            <Crown className="w-1.5 h-1.5 text-slate-950 fill-slate-950" />
                                          </span>
                                        )}
                                      </div>

                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1">
                                          <span className="font-bold text-slate-200 truncate text-[11px]">{p.username}</span>
                                          {isOwner && (
                                            <span className="text-[7.5px] px-1 rounded bg-amber-500/25 border border-amber-400/50 font-mono font-bold text-amber-300">
                                              HOST
                                            </span>
                                          )}
                                        </div>
                                        <span className="text-[9.5px] text-amber-300/80 font-mono">
                                          {p.coins.toLocaleString()} 🪙
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                      <span className="text-[8.5px] font-mono text-emerald-400 bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-800/40">
                                        {isOwner ? 'Host' : 'Ready'}
                                      </span>
                                      {isTableHost && !isSelf && onKickPlayer && (
                                        <button
                                          type="button"
                                          onClick={() => onKickPlayer(p.id)}
                                          title={`Kick ${p.username} from table`}
                                          className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                                        >
                                          <LogOut className="w-3 h-3 text-rose-400" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Downward pointer triangle */}
                            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-950 border-r border-b border-amber-400/70 rotate-45" />
                          </div>
                        )}

                        {/* Avatars Only Section: Clickable to open tooltip list without extending layout */}
                        <div
                          id="joined-players-avatars-trigger"
                          onClick={() => {
                            sound.playChipSound();
                            setShowPlayersTooltip(!showPlayersTooltip);
                          }}
                          className="p-2 sm:p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-amber-500/40 transition-all cursor-pointer flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-1 text-[11px] font-mono text-slate-300 shrink-0">
                            <Users className="w-3.5 h-3.5 text-amber-400" />
                            <span>Joined ({joinedPlayers.length}):</span>
                          </div>

                          {/* Avatars Only */}
                          <div className="flex items-center -space-x-2 overflow-hidden py-0.5 px-1">
                            {joinedPlayers.map((p) => {
                              const isOwner = Boolean(p.isHost || (currentRoom && currentRoom.hostId === p.id) || p.id === user.id);
                              return (
                                <div
                                  key={p.id}
                                  title={`${p.username}${isOwner ? ' (Host)' : ''}`}
                                  className="relative shrink-0 hover:z-10 hover:scale-110 transition-transform"
                                >
                                  <div
                                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs overflow-hidden border-2 bg-slate-900 shadow ${
                                      isOwner ? 'border-amber-400 ring-1 ring-amber-400/60' : 'border-slate-700'
                                    }`}
                                  >
                                    <UserAvatar avatar={p.avatar} name={p.username} size="xs" className="w-full h-full rounded-none" />
                                  </div>
                                  {isOwner && (
                                    <span className="absolute -top-1 -left-1 w-3 h-3 rounded-full bg-gradient-to-tr from-amber-400 to-amber-600 flex items-center justify-center shadow">
                                      <Crown className="w-2 h-2 text-slate-950 fill-slate-950" />
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          <span className="text-[10px] text-amber-400/90 font-mono underline decoration-amber-400/40 shrink-0">
                            {showPlayersTooltip ? 'Hide list' : 'View list'}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Primary Enter Table as Host Button */}
                  <button
                    type="button"
                    id="host-enter-table-btn"
                    onClick={async () => {
                      sound.playWinFanfare();
                      if (onHostEnterTable) {
                        await onHostEnterTable(createdRoomInfo.roomId);
                      }
                      onClose();
                    }}
                    className="w-full py-2.5 sm:py-3 px-4 rounded-xl bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-serif font-black text-xs sm:text-sm tracking-wider shadow-lg shadow-amber-950/70 border border-amber-200 flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
                  >
                    <Crown className="w-4 h-4 fill-slate-950 text-slate-950" />
                    <span>ENTER TABLE AS HOST 👑</span>
                    <ArrowRight className="w-4 h-4 text-slate-950" />
                  </button>
                </div>
              ) : (
                /* Table Creation Form */
                <form onSubmit={handleCreateSubmit} className="space-y-3.5">
                  {/* Table Name */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                      Table Name
                    </label>
                    <input
                      id="create-table-name-input"
                      type="text"
                      required
                      value={tableName}
                      onChange={(e) => setTableName(e.target.value)}
                      maxLength={24}
                      placeholder="e.g. Jack's Royal Pavilion"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 text-xs font-semibold focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  {/* Access Option: Allow Randoms vs Invite Friends Only (The Exact Requested Option!) */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      Table Access & Privacy
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {/* Option A: Allow Randoms (Public) */}
                      <div
                        id="option-allow-randoms"
                        onClick={() => {
                          sound.playChipSound();
                          setAllowRandoms(true);
                        }}
                        className={`p-3 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                          allowRandoms
                            ? 'bg-gradient-to-b from-amber-950/60 to-slate-900 border-amber-400 ring-2 ring-amber-400/40 text-amber-200'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <Globe className={`w-4 h-4 ${allowRandoms ? 'text-amber-400' : 'text-slate-500'}`} />
                          <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full ${allowRandoms ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                            OPEN
                          </span>
                        </div>
                        <div className="font-bold text-xs text-slate-100">
                          Allow Randoms
                        </div>
                        <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                          Friends can join via code, plus random players can quick-match.
                        </p>
                      </div>

                      {/* Option B: Friends Only (Private) */}
                      <div
                        id="option-friends-only"
                        onClick={() => {
                          sound.playChipSound();
                          setAllowRandoms(false);
                        }}
                        className={`p-3 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                          !allowRandoms
                            ? 'bg-gradient-to-b from-emerald-950/60 to-slate-900 border-emerald-400 ring-2 ring-emerald-400/40 text-emerald-200'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <Lock className={`w-4 h-4 ${!allowRandoms ? 'text-emerald-400' : 'text-slate-500'}`} />
                          <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full ${!allowRandoms ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                            PRIVATE
                          </span>
                        </div>
                        <div className="font-bold text-xs text-slate-100">
                          Friends Only
                        </div>
                        <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                          Only players with your 6-digit code or invite link can join.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Betting Round Countdown Duration (4 Options: 10s Blitz, 15s Fast, 18s Classic, 25s Relaxed) */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      <span>Betting Countdown</span>
                      <span className="font-mono text-amber-300 text-xs">{bettingDuration} seconds</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                      {[
                        { sec: 10, label: 'Blitz' },
                        { sec: 15, label: 'Fast' },
                        { sec: 18, label: 'Classic' },
                        { sec: 25, label: 'Relaxed' },
                      ].map(({ sec, label }) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => {
                            sound.playChipSound();
                            setBettingDuration(sec);
                          }}
                          className={`py-2 px-1 rounded-xl text-xs font-mono font-bold border transition-all text-center ${
                            bettingDuration === sec
                              ? 'bg-amber-500/20 border-amber-400 text-amber-200 ring-1 ring-amber-400/40 shadow-sm'
                              : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                          }`}
                        >
                          <div className="text-amber-200 font-bold">{sec}s</div>
                          <div className="text-[9px] text-slate-400 font-normal">{label}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    id="submit-create-table-btn"
                    type="submit"
                    disabled={isCreating}
                    className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 hover:from-amber-400 text-slate-950 font-serif font-black text-sm tracking-wider shadow-xl shadow-amber-950/60 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 mt-2"
                  >
                    {isCreating ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                        <span>Creating Your Table...</span>
                      </div>
                    ) : (
                      <>
                        <Crown className="w-4 h-4 text-slate-950" />
                        <span>CREATE TABLE NOW</span>
                        <ArrowRight className="w-4 h-4 text-slate-950" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* 2. JOIN TABLE VIEW */}
          {/* ========================================================= */}
          {mode === 'join' && (
            <div className="space-y-3.5 animate-in fade-in duration-200">
              {/* Option A: Join with Table Code */}
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-200">
                    <LogIn className="w-3.5 h-3.5 text-amber-400" />
                    <span>Join with Table Code</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">From Friends</span>
                </div>

                <form onSubmit={handleJoinByCodeSubmit} className="space-y-2">
                  <div className="relative">
                    <input
                      id="join-table-code-input"
                      type="text"
                      value={tableCodeInput}
                      onChange={(e) => setTableCodeInput(e.target.value.toUpperCase())}
                      maxLength={8}
                      placeholder="e.g. ROYAL1"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-amber-300 font-mono font-bold text-sm tracking-widest placeholder-slate-600 focus:outline-none focus:border-amber-400 uppercase"
                    />
                  </div>

                  <button
                    id="submit-join-by-code-btn"
                    type="submit"
                    disabled={isJoiningCode || !tableCodeInput.trim()}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-serif font-black text-xs sm:text-sm tracking-wide shadow-md shadow-amber-950/60 active:scale-[0.98] transition-all flex items-center justify-center gap-2 border border-amber-300/80 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isJoiningCode ? (
                      <div className="flex items-center gap-1.5 font-sans">
                        <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                        <span>Verifying Code...</span>
                      </div>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4 text-slate-950" />
                        <span>Join Table with Code</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Option B: Join Random Table - Ultra-Attractive Styled Action Button below Join with Code */}
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-600 via-rose-500 to-amber-500 rounded-2xl opacity-70 blur-xs group-hover:opacity-100 transition-opacity duration-300 -z-10" />
                <button
                  id="join-random-table-btn"
                  type="button"
                  onClick={handleJoinRandomClick}
                  disabled={isJoiningRandom}
                  className="w-full py-2.5 sm:py-3 px-4 rounded-xl bg-gradient-to-r from-orange-600 via-rose-600 to-amber-600 hover:from-orange-500 hover:via-rose-500 hover:to-amber-500 text-white font-serif font-black text-xs sm:text-sm tracking-wider shadow-lg shadow-rose-950/70 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 border border-orange-300/80 text-center"
                >
                  {isJoiningRandom ? (
                    <div className="flex items-center gap-2 text-xs font-sans font-bold text-white">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Matching Random Table...</span>
                    </div>
                  ) : (
                    <span className="drop-shadow-sm">Join Random Table</span>
                  )}
                </button>
              </div>

              {/* Option C: Active Public Tables Browser */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                    <Users className="w-3.5 h-3.5 text-amber-400" />
                    <span>Active Public Tables</span>
                  </div>
                  {onRefreshRooms && (
                    <button
                      type="button"
                      id="refresh-public-tables-btn"
                      onClick={handleRefreshRooms}
                      disabled={isRefreshingRooms}
                      className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1.5 font-mono cursor-pointer disabled:opacity-50"
                      title="Refresh Public Tables"
                    >
                      <RefreshCw className={`w-3 h-3 ${isRefreshingRooms ? 'animate-spin text-amber-300' : ''}`} />
                      <span>{isRefreshingRooms ? 'Refreshing...' : 'Refresh'}</span>
                    </button>
                  )}
                </div>

                {publicRooms.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-center text-xs text-slate-400 space-y-1">
                    <p className="font-medium text-slate-300">No active public tables right now.</p>
                    <p className="text-[11px] text-slate-500">
                      Create a public table to get started, or join a friend using their table code!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {publicRooms.map((room) => (
                      <div
                        key={room.id}
                        className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-amber-500/40 transition-all flex items-center justify-between gap-3 shadow-md"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-xs text-slate-100 truncate">
                              {room.name}
                            </span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-amber-300 font-bold border border-slate-700">
                              {room.code}
                            </span>
                          </div>
                          <div className="flex items-center gap-2.5 text-[10px] text-slate-400 mt-1">
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3 text-slate-500" />
                              {room.playerCount}/16 players
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              <span className="capitalize">{room.phase} ({room.timer}s)</span>
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRoomItemClick(room.id, room.code)}
                          disabled={joiningRoomId === room.id || room.playerCount >= 16}
                          className={`py-1.5 px-3.5 rounded-xl font-bold text-xs shadow-md transition-all shrink-0 active:scale-95 disabled:opacity-50 cursor-pointer ${
                            room.playerCount >= 16
                              ? 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed'
                              : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 border border-amber-300/60'
                          }`}
                        >
                          {joiningRoomId === room.id ? 'Joining...' : room.playerCount >= 16 ? 'Full' : 'Join'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Note */}
        <div className="mt-3 pt-2 border-t border-slate-800/80 text-center shrink-0">
          <p className="text-[10px] text-slate-400 font-mono flex items-center justify-center gap-1.5">
            <Users className="w-3 h-3 text-amber-400/80" />
            <span>Up to 16 players per table</span>
          </p>
        </div>
      </div>
    </div>
  );
};
