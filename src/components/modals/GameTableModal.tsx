import React, { useState, useEffect, useCallback } from 'react';
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
  Trash2,
  Calendar,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import { UserProfile, RoomState } from '../../types.js';
import { sound } from '../../utils/audio.js';
import { UserAvatar } from '../common/UserAvatar.js';
import {
  fetchUserCreatedTablesFromSupabase,
  requestTableCreationApproval,
  deleteTableFromSupabase,
  GameTableRecord,
} from '../../services/tableService.js';

export function getRandomTableName(username?: string): string {
  const raw = (username || 'Player').trim();
  const first = raw.split(/\s+/)[0] || 'Player';
  const presets = [
    `${first}'s Table`,
    `${first}'s Den`,
    `${first}'s Room`,
    `${first}'s Hub`,
    `${first}'s Pit`,
    `${first}'s Club`,
    `${first}'s Spot`,
    `${first}'s Ring`,
    `${first}'s Game`,
    `${first}'s Court`,
    `${first}'s Arena`,
    `${first}'s Vault`,
    `${first}'s Deck`,
    `${first}'s Board`,
    `${first}'s Lounge`,
    `${first}'s Stakes`,
    `${first}'s Palace`,
    `${first}'s Durbar`,
    `${first}'s Fort`,
    `${first}'s Roll`,
  ];

  const randomIndex = Math.floor(Math.random() * presets.length);
  return presets[randomIndex];
}

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
    validityHours?: number;
    validityDays?: number;
  }) => Promise<{ success: boolean; code?: string; roomId?: string; error?: string }>;
  onJoinByCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  onJoinRandom: () => Promise<{ success: boolean; error?: string }>;
  onJoinRoomById: (roomId: string) => Promise<{ success: boolean; error?: string }>;
  onRefreshRooms?: () => void | Promise<any>;
  onKickPlayer?: (playerId: string) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  socket?: any;
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
  onShowToast,
  socket,
}) => {
  // --- Sub-Tab for Create Table View ('create' form vs 'my_tables' saved tables) ---
  const [createSubTab, setCreateSubTab] = useState<'create' | 'my_tables'>('create');

  // --- Create Table State ---
  const [tableName, setTableName] = useState(() => getRandomTableName(user.username));
  const [allowRandoms, setAllowRandoms] = useState(true); // Default to allow randoms, or toggle to Friends Only
  const [bettingDuration, setBettingDuration] = useState<number>(20);
  const [durationPreset, setDurationPreset] = useState<'2h' | '6h' | '24h' | 'custom'>('24h');
  const [customHours, setCustomHours] = useState<number>(12);
  const [isCreating, setIsCreating] = useState(false);
  const [createdRoomInfo, setCreatedRoomInfo] = useState<{ code: string; roomId: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showPlayersTooltip, setShowPlayersTooltip] = useState(false);

  // --- My Tables State ---
  const [myTables, setMyTables] = useState<GameTableRecord[]>([]);
  const [loadingMyTables, setLoadingMyTables] = useState(false);
  const [copiedMyTableCode, setCopiedMyTableCode] = useState<string | null>(null);
  const [copiedMyTableLink, setCopiedMyTableLink] = useState<string | null>(null);
  const [deletingTableId, setDeletingTableId] = useState<string | null>(null);
  const [tableToDelete, setTableToDelete] = useState<{ id: string; name: string; code: string } | null>(null);

  // --- Approval Request State ---
  const [requestingApproval, setRequestingApproval] = useState(false);
  const [approvalRequested, setApprovalRequested] = useState(false);

  // --- Join Table State ---
  const [tableCodeInput, setTableCodeInput] = useState('');
  const [isJoiningCode, setIsJoiningCode] = useState(false);
  const [isJoiningRandom, setIsJoiningRandom] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [isRefreshingRooms, setIsRefreshingRooms] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Is user approved to create tables? (Strictly requires table approval for all users including admins)
  const isApprovedToHost = Boolean(
    user.canCreateTable ||
    user.can_create_table
  );

  // Load user's created tables from Supabase game_tables
  const loadMyTables = useCallback(async () => {
    if (!user.id) return;
    setLoadingMyTables(true);
    try {
      const res = await fetchUserCreatedTablesFromSupabase(user.id);
      if (res.success && Array.isArray(res.tables)) {
        setMyTables(res.tables);
      }
    } catch (err) {
      console.warn('Failed fetching user tables:', err);
    } finally {
      setLoadingMyTables(false);
    }
  }, [user.id]);

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
      setTableName(getRandomTableName(user.username));
      setApprovalRequested(false);
      onRefreshRooms?.();
      loadMyTables();
    }
  }, [isOpen, mode, user.username, onRefreshRooms, loadMyTables]);

  // Real-time socket listener for table approval & room updates
  useEffect(() => {
    if (!socket) return;

    const handleTableDecision = (payload: any) => {
      if (payload?.approved) {
        loadMyTables();
        setApprovalRequested(false);
        setCreateSubTab('my_tables');
      }
    };

    const handleTableCreated = () => {
      loadMyTables();
    };

    const handleTableApproved = () => {
      loadMyTables();
    };

    const handleRoomsUpdated = () => {
      loadMyTables();
    };

    const handleApprovalChanged = (payload: any) => {
      if (payload?.canCreateTable) {
        loadMyTables();
      }
    };

    socket.on('user:table_request_decided', handleTableDecision);
    socket.on('table:created', handleTableCreated);
    socket.on('table:approved', handleTableApproved);
    socket.on('rooms:updated', handleRoomsUpdated);
    socket.on('user:table_approval_changed', handleApprovalChanged);

    return () => {
      socket.off('user:table_request_decided', handleTableDecision);
      socket.off('table:created', handleTableCreated);
      socket.off('table:approved', handleTableApproved);
      socket.off('rooms:updated', handleRoomsUpdated);
      socket.off('user:table_approval_changed', handleApprovalChanged);
    };
  }, [socket, loadMyTables]);

  if (!isOpen) return null;

  // Handle Request Table Host Approval from Admin
  const handleRequestApproval = async () => {
    if (requestingApproval) return;
    setRequestingApproval(true);
    sound.playChipSound();
    try {
      const res = await requestTableCreationApproval({
        userId: user.id,
        username: user.username,
        tableName: tableName.trim() || `${user.username}'s Table`,
        isPrivate: !allowRandoms,
        bettingDuration,
        validityHours: effectiveValidityHours,
      });

      const pendingRecord: GameTableRecord = {
        id: res.request?.tableId || res.table?.id || `room_${Date.now()}`,
        code: res.request?.roomCode || res.table?.code || 'PENDING',
        name: res.request?.tableName || res.table?.name || tableName.trim() || `${user.username}'s Table`,
        host_id: user.id,
        host_name: user.username,
        status: 'pending_approval',
        approval_status: 'pending',
        approved: false,
        is_private: !allowRandoms,
        betting_duration: bettingDuration,
        player_count: 0,
        validity_hours: effectiveValidityHours,
        validity_days: Math.max(1, Math.ceil(effectiveValidityHours / 24)),
        expires_at: undefined,
        created_at: new Date().toISOString(),
      };
      setMyTables((prev) => [pendingRecord, ...prev.filter((t) => t.id !== pendingRecord.id && t.code !== pendingRecord.code)]);

      sound.playWinFanfare();
      onShowToast?.('👑 Table request sent! Waiting for admin review ⏳', 'success');
      setCreateSubTab('my_tables');
      loadMyTables();
    } catch (err: any) {
      setErrorMsg('Failed submitting approval request');
    } finally {
      setRequestingApproval(false);
    }
  };

  // Calculate effective validity in hours
  const effectiveValidityHours =
    durationPreset === '2h'
      ? 2
      : durationPreset === '6h'
      ? 6
      : durationPreset === '24h'
      ? 24
      : Math.max(1, Math.min(720, customHours || 12));

  // Handle Create Table Submit (Strictly Submits Table for Admin Approval)
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsCreating(true);
    sound.playChipSound();

    try {
      const res = await requestTableCreationApproval({
        userId: user.id,
        username: user.username,
        tableName: tableName.trim() || getRandomTableName(user.username),
        isPrivate: !allowRandoms,
        bettingDuration,
        validityHours: effectiveValidityHours,
      });

      const pendingRecord: GameTableRecord = {
        id: res.request?.tableId || res.table?.id || `room_${Date.now()}`,
        code: res.request?.roomCode || res.table?.code || 'PENDING',
        name: res.request?.tableName || res.table?.name || tableName.trim() || `${user.username}'s Table`,
        host_id: user.id,
        host_name: user.username,
        status: 'pending_approval',
        approval_status: 'pending',
        approved: false,
        is_private: !allowRandoms,
        betting_duration: bettingDuration,
        player_count: 0,
        validity_hours: effectiveValidityHours,
        validity_days: Math.max(1, Math.ceil(effectiveValidityHours / 24)),
        expires_at: undefined,
        created_at: new Date().toISOString(),
      };
      setMyTables((prev) => [pendingRecord, ...prev.filter((t) => t.id !== pendingRecord.id && t.code !== pendingRecord.code)]);

      sound.playWinFanfare();
      onShowToast?.('👑 Table request sent! Waiting for admin review ⏳', 'success');
      setCreateSubTab('my_tables');
      loadMyTables();
    } catch (err: any) {
      setErrorMsg('Failed submitting approval request');
    } finally {
      setIsCreating(false);
    }
  };

  // Handle Delete My Table
  const handleDeleteMyTable = async (tableId: string) => {
    sound.playChipSound();
    setDeletingTableId(tableId);
    setMyTables((prev) => prev.filter((t) => t.id !== tableId));
    try {
      await deleteTableFromSupabase(tableId);
      loadMyTables();
    } catch (err) {
      console.warn('Failed deleting table:', err);
    } finally {
      setDeletingTableId(null);
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
    setIsJoiningRandom(false);

    if (!res.success) {
      setErrorMsg(res.error || 'No open public tables found right now. You can request a new table or join using a table code.');
    } else {
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

  // Format Expiration Countdown in hours / days
  const formatTimeRemaining = (expiresAt?: string | null, validityHours?: number, isPending?: boolean) => {
    if (isPending || !expiresAt) {
      const hrs = validityHours || 24;
      return `${hrs}h`;
    }
    const expiresMs = new Date(expiresAt).getTime();
    const diffMs = expiresMs - Date.now();
    if (diffMs <= 0) return 'Expired';
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (diffHours < 1) {
      return `${Math.max(1, diffMins)}m left`;
    }
    if (diffHours < 24) {
      return `${diffHours}h ${diffMins > 0 ? diffMins + 'm ' : ''}left`;
    }
    const diffDays = Math.floor(diffHours / 24);
    const remHours = diffHours % 24;
    return `${diffDays}d ${remHours > 0 ? remHours + 'h ' : ''}left`;
  };

  return (
    <div
      id="game-table-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="game-table-modal-container"
        className="w-full max-w-sm sm:max-w-md h-[480px] sm:h-[510px] max-h-[85vh] bg-gradient-to-b from-[#0e1628] via-[#090f1d] to-[#050811] border border-amber-500/40 rounded-3xl p-3.5 sm:p-5 shadow-2xl shadow-black/90 relative overflow-hidden text-slate-100 select-none animate-in zoom-in-95 duration-150 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle decorative ambiance without GPU-heavy blur */}
        <div className="absolute top-0 right-0 -mr-12 -mt-12 w-32 h-32 bg-amber-500/10 rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-12 -mb-12 w-32 h-32 bg-emerald-500/10 rounded-full pointer-events-none" />

        {/* Close Button */}
        <button
          id="game-table-modal-close-btn"
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-xl bg-slate-800/80 text-slate-400 hover:text-amber-200 border border-slate-700/80 active:scale-95 transition-all z-10 cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header Title tailored to the chosen mode */}
        <div className="text-center mb-2 shrink-0">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold uppercase tracking-wider mb-1">
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
          <h2 className="font-serif font-black text-lg sm:text-xl text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-amber-300 to-amber-500">
            {mode === 'create' ? 'TABLE MANAGEMENT' : 'JOIN TABLE'}
          </h2>
          <p className="text-[10.5px] text-slate-400">
            {mode === 'create'
              ? 'Create timed multiplayer tables or manage your saved tables'
              : 'Enter a friend’s 6-digit code or quick-match to an open table'}
          </p>
        </div>

        {/* Create Mode: Tabs Switcher (Create Table vs My Tables) */}
        {mode === 'create' && !createdRoomInfo && (
          <div className="flex items-center gap-1.5 p-1 bg-slate-950/90 rounded-2xl border border-slate-800 mb-3 shrink-0">
            <button
              type="button"
              id="tab-create-table-btn"
              onClick={() => {
                sound.playChipSound();
                setCreateSubTab('create');
              }}
              className={`flex-1 py-2 rounded-xl font-serif font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                createSubTab === 'create'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black shadow-md shadow-amber-950/60'
                  : 'text-slate-400 hover:text-amber-200'
              }`}
            >
              <Crown className="w-3.5 h-3.5" />
              <span>Create Table</span>
            </button>

            <button
              type="button"
              id="tab-my-tables-btn"
              onClick={() => {
                sound.playChipSound();
                setCreateSubTab('my_tables');
                loadMyTables();
              }}
              className={`flex-1 py-2 rounded-xl font-serif font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                createSubTab === 'my_tables'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black shadow-md shadow-amber-950/60'
                  : 'text-slate-400 hover:text-amber-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>My Tables</span>
              <span
                className={`text-[9.5px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
                  createSubTab === 'my_tables'
                    ? 'bg-slate-950/40 text-slate-950'
                    : 'bg-slate-800 text-amber-300 border border-slate-700'
                }`}
              >
                {myTables.length}
              </span>
            </button>
          </div>
        )}

        {/* Error Notification */}
        {errorMsg && (
          <div className="mb-3 p-2.5 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs flex items-start gap-2 shrink-0 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="leading-tight text-[11px]">{errorMsg}</span>
          </div>
        )}

        {/* Scrollable Modal Content - Fixed flex-1 container ensures identical height across all tabs */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-0.5 space-y-3.5 scrollbar-thin scrollbar-thumb-slate-800">
          {/* ========================================================= */}
          {/* 1. CREATE TABLE VIEW */}
          {/* ========================================================= */}
          {mode === 'create' && (
            <div>
              {createdRoomInfo ? (
                /* Created Room Invite, Joined Players & Host Entry Panel */
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
                        Saved in Supabase & active
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
              ) : createSubTab === 'create' ? (
                /* Sub-Tab 1: Create Table Form with Approval Handling */
                <form onSubmit={handleCreateSubmit} className="space-y-3.5">
                  {/* Table Name with Randomize Generator Inside Input */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                      Table Name
                    </label>
                    <div className="relative flex items-center">
                      <input
                        id="create-table-name-input"
                        type="text"
                        required
                        value={tableName}
                        onChange={(e) => setTableName(e.target.value)}
                        maxLength={32}
                        placeholder="e.g. Jack's Royal Durbar"
                        className="w-full pl-3.5 pr-20 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 text-xs font-semibold focus:outline-none focus:border-amber-400 shadow-inner"
                      />
                      <button
                        type="button"
                        id="randomize-table-name-btn"
                        onClick={() => {
                          sound.playChipSound();
                          setTableName(getRandomTableName(user.username));
                        }}
                        className="absolute right-3 text-slate-400 hover:text-amber-300 text-xs font-medium lowercase tracking-wide transition-colors cursor-pointer select-none active:opacity-70"
                        title="Generate random table name"
                      >
                        random
                      </button>
                    </div>
                  </div>

                    {/* Access Option: Allow Randoms vs Invite Friends Only */}
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

                    {/* Betting Round Countdown Duration (10s, 15s, 20s, 25s) */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                        <span>Betting Countdown</span>
                        <span className="font-mono text-amber-300 text-xs">{bettingDuration} seconds</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                        {[
                          { sec: 10, label: 'Blitz' },
                          { sec: 15, label: 'Fast' },
                          { sec: 20, label: 'Classic' },
                          { sec: 25, label: 'Relaxed' },
                        ].map(({ sec, label }) => (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => {
                              sound.playChipSound();
                              setBettingDuration(sec);
                            }}
                            className={`py-2 px-1 rounded-xl text-xs font-mono font-bold border transition-all text-center cursor-pointer ${
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

                    {/* Table Duration (2hrs, 6hrs, 24hrs, Custom in Hours) */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                        <span>Table Duration</span>
                        <span className="font-mono text-amber-300 text-xs">
                          {durationPreset === 'custom'
                            ? `${customHours || 12} Hours`
                            : durationPreset === '2h'
                            ? '2 Hours'
                            : durationPreset === '6h'
                            ? '6 Hours'
                            : '24 Hours'}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                        {[
                          { key: '2h', label: '2 hrs' },
                          { key: '6h', label: '6 hrs' },
                          { key: '24h', label: '24 hrs' },
                          { key: 'custom', label: 'Custom' },
                        ].map(({ key, label }) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              sound.playChipSound();
                              setDurationPreset(key as any);
                            }}
                            className={`py-2 px-1 rounded-xl text-xs font-mono font-bold border transition-all text-center cursor-pointer ${
                              durationPreset === key
                                ? 'bg-amber-500/20 border-amber-400 text-amber-200 ring-1 ring-amber-400/40 shadow-sm'
                                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                            }`}
                          >
                            <div className="text-amber-200 font-bold">{label}</div>
                            <div className="text-[9px] text-slate-400 font-normal">
                              {key === 'custom' ? 'Set hrs' : 'Active'}
                            </div>
                          </button>
                        ))}
                      </div>

                      {/* Custom Hours Input when 'custom' is selected */}
                      {durationPreset === 'custom' && (
                        <div className="mt-2 p-2.5 rounded-xl bg-slate-950 border border-amber-500/30 flex items-center justify-between gap-2 animate-in fade-in duration-150">
                          <label htmlFor="custom-duration-hours" className="text-[11px] text-slate-300 font-medium">
                            Active Duration (Hours):
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              id="custom-duration-hours"
                              type="number"
                              min={1}
                              max={720}
                              value={customHours}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setCustomHours(isNaN(val) ? 1 : Math.max(1, Math.min(720, val)));
                              }}
                              className="w-16 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-amber-300 font-mono font-bold text-xs text-center focus:outline-none focus:border-amber-400"
                            />
                            <span className="text-xs font-mono text-slate-400">hrs</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Submit Button */}
                    <button
                      id="submit-create-table-btn"
                      type="submit"
                      disabled={isCreating}
                      className="w-full py-3.5 px-4 rounded-2xl font-serif font-black text-xs sm:text-sm tracking-wider shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 mt-2 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 hover:from-amber-400 text-slate-950 shadow-amber-950/60"
                    >
                      {isCreating ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                          <span>Sending Request...</span>
                        </div>
                      ) : (
                        <>
                          <Crown className="w-4 h-4 text-slate-950 fill-slate-950" />
                          <span>Request Table</span>
                          <ArrowRight className="w-4 h-4 text-slate-950" />
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                /* Sub-Tab 2: My Tables List (Saved directly in game_tables) */
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold text-amber-200">
                      Your Created Tables ({myTables.length})
                    </span>
                    <button
                      type="button"
                      onClick={loadMyTables}
                      disabled={loadingMyTables}
                      className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-mono cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingMyTables ? 'animate-spin text-amber-300' : ''}`} />
                      <span>{loadingMyTables ? 'Loading...' : 'Refresh'}</span>
                    </button>
                  </div>

                  {myTables.length > 0 ? (
                    <div className="space-y-2.5">
                      {myTables.map((table) => {
                        const isTableApproved = Boolean(table.approved === true || table.approval_status === 'approved');
                        const isPending = !isTableApproved || table.approval_status === 'pending' || table.status === 'pending_approval';
                        const validityHours = table.validity_hours || (table as any).validityHours || 24;
                        const timeLeft = isPending
                          ? `${validityHours}h`
                          : formatTimeRemaining(table.expires_at, validityHours, false);
                        const isExpired = !isPending && timeLeft === 'Expired';

                        return (
                          <div
                            key={table.id}
                            className={`p-3.5 rounded-2xl bg-slate-950/90 border transition-all shadow-md space-y-2.5 ${
                              isPending
                                ? 'border-amber-500/30 bg-gradient-to-b from-amber-950/20 to-slate-950'
                                : isExpired
                                ? 'border-rose-950/60 opacity-60'
                                : 'border-slate-800 hover:border-amber-500/40'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-serif font-black text-xs sm:text-sm text-slate-100 truncate">
                                    {table.name}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5 flex-nowrap overflow-hidden">
                                  {table.is_private ? (
                                    <span title="Private Table (Friends Only)" className="inline-flex items-center text-amber-400 shrink-0">
                                      <Lock className="w-3 h-3" />
                                    </span>
                                  ) : (
                                    <span title="Public Table (Open)" className="inline-flex items-center text-blue-400 shrink-0">
                                      <Globe className="w-3 h-3" />
                                    </span>
                                  )}
                                  <span className="text-slate-600 font-bold">•</span>
                                  {isPending ? (
                                    <span
                                      className="font-mono text-amber-300/90 flex items-center gap-1 shrink-0"
                                      title="Table duration"
                                    >
                                      <Clock className="w-3 h-3 text-amber-400" />
                                      <span>{validityHours}h</span>
                                    </span>
                                  ) : (
                                    <span className={`font-mono flex items-center gap-0.5 shrink-0 ${isExpired ? 'text-rose-400 font-bold' : 'text-emerald-400'}`}>
                                      <Clock className={`w-3 h-3 ${isExpired ? 'text-rose-400' : 'text-emerald-400'}`} />
                                      <span>{timeLeft}</span>
                                    </span>
                                  )}
                                  <span className="text-slate-600 font-bold">•</span>
                                  {isPending ? (
                                    <span className="text-[9px] text-amber-300 font-bold inline-flex items-center gap-0.5 bg-amber-500/20 px-1.5 py-0.5 rounded-full border border-amber-500/40 animate-pulse shrink-0">
                                      <Clock className="w-2.5 h-2.5 text-amber-400" />
                                      <span>Pending Approval</span>
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-emerald-300 font-medium inline-flex items-center gap-0.5 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20 shrink-0">
                                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                                      <span>Approved</span>
                                    </span>
                                  )}
                                </div>
                                {table.admin_approval_message && (
                                  <div className="text-[9.5px] text-amber-200/80 italic mt-0.5 font-sans">
                                    "{table.admin_approval_message}"
                                  </div>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  sound.playChipSound();
                                  setTableToDelete({ id: table.id, name: table.name, code: table.code });
                                }}
                                disabled={deletingTableId === table.id}
                                title="Delete Table from Supabase"
                                className="p-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/80 text-rose-300 border border-rose-500/30 transition-all cursor-pointer active:scale-95 shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 pt-1 border-t border-slate-850">
                              {isPending ? (
                                <button
                                  type="button"
                                  disabled={true}
                                  className="flex-1 py-2 px-3 rounded-xl bg-slate-900/80 text-slate-500 font-serif font-bold text-xs flex items-center justify-center gap-1.5 border border-slate-800 cursor-not-allowed opacity-60"
                                >
                                  <Clock className="w-3.5 h-3.5 text-amber-500/60" />
                                  <span>Pending Approval ⏳</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    sound.playWinFanfare();
                                    if (onHostEnterTable) {
                                      await onHostEnterTable(table.id);
                                    } else {
                                      await onJoinRoomById(table.id);
                                    }
                                    onClose();
                                  }}
                                  disabled={isExpired}
                                  className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 text-slate-950 font-serif font-black text-xs flex items-center justify-center gap-1.5 shadow active:scale-95 transition-all cursor-pointer disabled:opacity-40"
                                >
                                  <Crown className="w-3.5 h-3.5 fill-slate-950" />
                                  <span>Enter as Host</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  sound.playChipSound();
                                  navigator.clipboard.writeText(table.code).then(() => {
                                    setCopiedMyTableCode(table.id);
                                    setTimeout(() => setCopiedMyTableCode(null), 2000);
                                  }).catch(() => {});
                                }}
                                className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 hover:border-amber-500/50 text-xs font-mono font-bold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-sm shrink-0"
                                title="Click to copy table code"
                              >
                                {copiedMyTableCode === table.id ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    <span className="text-emerald-300 font-bold">Copied!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                    <span className="tracking-wider">{table.code}</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-8 px-4 rounded-2xl bg-slate-950/40 border border-slate-800 text-center space-y-3">
                      <div className="w-10 h-10 mx-auto rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center">
                        <Layers className="w-5 h-5 text-slate-500" />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-slate-300">No saved tables found</p>
                        <p className="text-[11px] text-slate-500">
                          Create tables and they will be saved in Supabase game_tables for you.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCreateSubTab('create')}
                        className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs cursor-pointer active:scale-95 transition-all"
                      >
                        + Create Your First Table
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* 2. JOIN TABLE VIEW (100% UNCHANGED AS REQUESTED) */}
          {/* ========================================================= */}
          {mode === 'join' && (
            <div className="space-y-3.5">
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

              {/* Option B: Join Random Table */}
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

              {/* Option C: Available Tables Browser */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                    <Users className="w-3.5 h-3.5 text-amber-400" />
                    <span>Available Tables</span>
                  </div>
                  {onRefreshRooms && (
                    <button
                      type="button"
                      id="refresh-public-tables-btn"
                      onClick={handleRefreshRooms}
                      disabled={isRefreshingRooms}
                      className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1.5 font-mono cursor-pointer disabled:opacity-50"
                      title="Refresh Available Tables"
                    >
                      <RefreshCw className={`w-3 h-3 ${isRefreshingRooms ? 'animate-spin text-amber-300' : ''}`} />
                      <span>{isRefreshingRooms ? 'Refreshing...' : 'Refresh'}</span>
                    </button>
                  )}
                </div>

                {publicRooms.length > 0 ? (
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
                ) : (
                  <div className="py-4 px-3 rounded-2xl bg-slate-950/40 border border-slate-800/60 text-center">
                    <p className="text-xs text-slate-400 font-medium">No open public tables found</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Click Refresh to scan again or Join Random Table above</p>
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

        {/* Delete Table Confirmation Prompt Modal */}
        {tableToDelete && (
          <div
            id="delete-table-confirmation-overlay"
            className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={(e) => {
              e.stopPropagation();
              setTableToDelete(null);
            }}
          >
            <div
              className="w-full max-w-xs bg-gradient-to-b from-[#101726] to-[#080d18] border border-rose-500/50 rounded-2xl p-4 shadow-2xl space-y-3 text-center animate-in zoom-in-95 duration-150 relative text-slate-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/40 shadow-md shadow-rose-950/50">
                <Trash2 className="w-5 h-5" />
              </div>

              <div>
                <h4 className="font-serif font-black text-sm text-slate-100">
                  Delete Table?
                </h4>
                <p className="text-xs text-slate-300 mt-1">
                  Are you sure you want to delete <strong className="text-amber-300">"{tableToDelete.name}"</strong> ({tableToDelete.code})?
                </p>
                <p className="text-[10.5px] text-slate-400 mt-1.5 leading-tight">
                  This will disband the active room and permanently remove the table from Supabase.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1.5 border-t border-slate-800">
                <button
                  type="button"
                  id="cancel-delete-table-btn"
                  onClick={() => {
                    sound.playChipSound();
                    setTableToDelete(null);
                  }}
                  className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-bold text-xs transition-all active:scale-95 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="confirm-delete-table-btn"
                  onClick={async () => {
                    const target = tableToDelete;
                    setTableToDelete(null);
                    if (target) {
                      await handleDeleteMyTable(target.id);
                      onShowToast?.(`Table "${target.name}" was permanently deleted.`, 'info');
                    }
                  }}
                  className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-rose-600 via-rose-500 to-rose-700 hover:from-rose-500 text-white font-serif font-black text-xs transition-all shadow-md shadow-rose-950/60 active:scale-95 border border-rose-400/50 cursor-pointer"
                >
                  Delete Table
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
