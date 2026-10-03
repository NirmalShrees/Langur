import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck,
  Crown,
  Users,
  Search,
  RefreshCw,
  Trash2,
  Play,
  Radio,
  X,
  ChevronRight,
  ChevronLeft,
  Send,
  Flame,
  Sparkles,
  Coins,
  Plus,
  Minus,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Sliders,
  Info,
  Copy,
  Check,
  Lock,
  Globe,
  Clock,
  Zap,
} from 'lucide-react';
import { UserProfile, SymbolType, LANGUR_BURJA_SYMBOLS, SYMBOL_KEYS } from '../../types.js';
import { AppNotification } from '../../utils/notifications.js';
import { UserAvatar } from '../common/UserAvatar.js';
import { sound } from '../../utils/audio.js';
import { TableAvarControl } from '../admin/TableAvarControl.js';
import { GodModeModal, GodModeCareerStats } from '../admin/GodModeModal.js';
import {
  deleteZeroPlayerTablesFromSupabase,
  deleteTableFromSupabase,
  fetchPendingTableRequests,
  decideTableRequest,
  recordTableInSupabase,
} from '../../services/tableService.js';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onUpdateCurrentUserCoins?: (newBalance: number) => void;
  onAddNotification?: (note: AppNotification) => void;
  socket?: any;
}

interface PlayerAdminData {
  id: string;
  username: string;
  avatar: string;
  email?: string;
  coins: number;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  totalWinnings: number;
  biggestWin: number;
  isAdmin: boolean;
  canCreateTable?: boolean;
  tableValidityDays?: number;
  tablePermissionExpiresAt?: string | number;
  createdTables?: any[];
  equippedTitle: string;
  createdAt: number;
  presence: 'online' | 'in_table' | 'offline';
  currentTable?: {
    id: string;
    name: string;
    code: string;
    isHost: boolean;
  } | null;
}

interface TableAdminData {
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
  expiresAt?: string;
  expires_at?: string;
  validityDays?: number;
  validity_days?: number;
  approvalStatus?: string;
  approvalMeta?: any;
  approvedByAdminName?: string;
  adminApprovalMessage?: string;
  createdAt?: string | number;
  players: {
    id: string;
    username: string;
    avatar: string;
    coins: number;
    currentBet: number;
    isHost: boolean;
    isBot: boolean;
  }[];
  tableBets: Record<SymbolType, number>;
  totalRoundBets: number;
  avar?: number;
  status?: string;
  inMemory?: boolean;
}

function formatTimeRemaining(expiresAt?: string, isPending?: boolean, validityHours?: number): string {
  if (isPending || !expiresAt) {
    const hrs = validityHours || 24;
    return `Starts on approval (${hrs}h)`;
  }
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${remHours}h left`;
  }
  return `${hours}h ${mins}m left`;
}

function getApprovedByDisplayName(
  table: TableAdminData | null | any,
  currentUser: UserProfile,
  playersList: PlayerAdminData[] = []
): string {
  if (!table) return 'System Admin';

  // 1. Is it a system-generated default app table?
  const isSystemGenerated = Boolean(
    table.id === 'public-royal-table' ||
    table.code === 'ROYAL1' ||
    table.hostId === 'system_host' ||
    table.hostId === 'system' ||
    table.host_id === 'system_host' ||
    table.host_id === 'system' ||
    table.isSystemGenerated === true ||
    (typeof table.id === 'string' && table.id.startsWith('system_'))
  );

  if (isSystemGenerated) {
    return 'System Admin';
  }

  // 2. Explicit approvedByAdminName or approvalMeta recorded
  const explicitAdminName =
    table.approvedByAdminName ||
    table.approved_by_admin_name ||
    table.approvalMeta?.admin_name ||
    table.approval_meta?.admin_name ||
    table.approvalMeta?.adminName ||
    table.approval_meta?.adminName;

  if (explicitAdminName && explicitAdminName.trim() && explicitAdminName.trim() !== 'System Admin') {
    return explicitAdminName.trim();
  }

  // 3. Check if table was created/hosted by an Admin player
  const hostId = table.hostId || table.host_id;
  const hostName = table.hostName || table.host_name;

  if (hostId === currentUser.id && (currentUser.isAdmin || currentUser.is_admin)) {
    return currentUser.username || 'Admin';
  }

  const hostPlayer = playersList.find((p) => p.id === hostId);
  if (hostPlayer && hostPlayer.isAdmin) {
    return hostPlayer.username || hostName || 'Admin';
  }

  // 4. If table was approved/created by a player with approved host access, always show the active Admin's name
  if (currentUser.isAdmin || currentUser.is_admin) {
    return currentUser.username || 'Admin';
  }

  const firstAdmin = playersList.find((p) => p.isAdmin);
  if (firstAdmin?.username) {
    return firstAdmin.username;
  }

  return 'Admin';
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onShowToast,
  onUpdateCurrentUserCoins,
  onAddNotification,
  socket,
}) => {
  const [activeTab, setActiveTab] = useState<'players' | 'tables' | 'broadcast'>('players');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPresence, setFilterPresence] = useState<'all' | 'in_table' | 'online'>('all');
  const [loading, setLoading] = useState(false);

  // Data States
  const [players, setPlayers] = useState<PlayerAdminData[]>([]);
  const [tables, setTables] = useState<TableAdminData[]>([]);
  const [tableRequests, setTableRequests] = useState<any[]>([]);

  // Mobile Performance Pagination Limits
  const [playersVisibleCount, setPlayersVisibleCount] = useState<number>(25);
  const [tablesVisibleCount, setTablesVisibleCount] = useState<number>(12);
  const lastTablesSignatureRef = React.useRef<string>('');
  const lastPlayersSignatureRef = React.useRef<string>('');

  // Table Request Review State
  const [reviewingRequest, setReviewingRequest] = useState<any | null>(null);
  const [reviewHoursPreset, setReviewHoursPreset] = useState<'2h' | '6h' | '24h' | 'custom'>('24h');
  const [reviewCustomHours, setReviewCustomHours] = useState<number>(24);
  const [adminMessageInput, setAdminMessageInput] = useState<string>('');

  // Coin Adjustment Modal / Panel State
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerAdminData | null>(null);
  const [coinInputAmount, setCoinInputAmount] = useState<string>('25000');
  const [coinAdjustmentMode, setCoinAdjustmentMode] = useState<'grant' | 'deduct' | 'set'>('grant');
  const [coinReason, setCoinReason] = useState<string>('Admin Treasury Grant');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Admin Role Confirmation State
  const [adminConfirmPlayer, setAdminConfirmPlayer] = useState<PlayerAdminData | null>(null);

  // Broadcast Message State
  const [broadcastTitle, setBroadcastTitle] = useState('Announcement');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastType, setBroadcastType] = useState<'info' | 'success' | 'warning'>('info');

  // Airdrop State
  const [airdropAmount, setAirdropAmount] = useState<string>('25000');
  const [airdropTarget, setAirdropTarget] = useState<'online' | 'all'>('online');
  const [airdropReason, setAirdropReason] = useState<string>('Festival Celebration Gift');

  // Table Details Info Modal State
  const [selectedTableDetails, setSelectedTableDetails] = useState<any | null>(null);
  const [copiedDetailsCode, setCopiedDetailsCode] = useState<boolean>(false);

  // Table God Mode Surveillance Modal State
  const [selectedGodTable, setSelectedGodTable] = useState<TableAdminData | null>(null);
  const [copiedGodCode, setCopiedGodCode] = useState<boolean>(false);

  // Fetch Table Requests
  const fetchTableRequestsData = useCallback(async () => {
    try {
      const res = await fetchPendingTableRequests();
      if (res.success && Array.isArray(res.requests)) {
        setTableRequests(res.requests);
      }
    } catch (err) {
      console.warn('Failed fetching table requests:', err);
    }
  }, []);

  // Fetch Players
  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/players', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && Array.isArray(data.players)) {
        setPlayers(data.players);
      }
    } catch (err) {
      console.warn('Failed fetching admin players:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Tables
  const fetchTables = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/tables', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && Array.isArray(data.tables)) {
        setTables(data.tables);
      }
    } catch (err) {
      console.warn('Failed fetching admin tables:', err);
    }
  }, []);

  // Load data on open & subscribe to live telemetry stream
  useEffect(() => {
    if (isOpen) {
      fetchPlayers();
      fetchTables();
      fetchTableRequestsData();
      if (socket) {
        socket.emit('admin:subscribe_live');
      }
    } else if (socket) {
      socket.emit('admin:unsubscribe_live');
    }
  }, [isOpen, socket, fetchPlayers, fetchTables, fetchTableRequestsData]);

  // Real-time socket sync for live tables, god mode view, player presence & coin updates
  useEffect(() => {
    if (!socket || !isOpen) return;

    // 1. Authoritative 1-second live tables synchronization with smart signature diffing
    const handleLiveTablesSync = (payload: { tables: TableAdminData[] }) => {
      if (Array.isArray(payload?.tables)) {
        const sig = payload.tables.map((t) => `${t.id}:${t.phase}:${t.timer}:${t.roundNumber}:${t.playerCount}:${t.totalRoundBets}`).join('|');
        if (sig !== lastTablesSignatureRef.current) {
          lastTablesSignatureRef.current = sig;
          setTables(payload.tables);
        }
        // Instant sync for active God Mode Surveillance
        if (selectedGodTable) {
          const fresh = payload.tables.find((t) => t.id === selectedGodTable.id);
          if (fresh) {
            setSelectedGodTable(fresh);
          }
        }
      }
    };

    // 2. Authoritative 2-second live players synchronization with smart signature diffing
    const handleLivePlayersSync = (payload: { players: PlayerAdminData[] }) => {
      if (Array.isArray(payload?.players)) {
        const sig = payload.players.map((p) => `${p.id}:${p.coins}:${p.presence}:${p.isAdmin}:${p.canCreateTable}`).join('|');
        if (sig !== lastPlayersSignatureRef.current) {
          lastPlayersSignatureRef.current = sig;
          setPlayers(payload.players);
        }
        // Instant sync for active Coin Adjustment Panel
        if (selectedPlayer) {
          const fresh = payload.players.find((p) => p.id === selectedPlayer.id);
          if (fresh) {
            setSelectedPlayer(fresh);
          }
        }
      }
    };

    // 3. Instant Presence Change Relay
    const handlePresenceChanged = (payload: { userId: string; presence: 'online' | 'in_table' | 'offline'; username?: string; avatar?: string; coins?: number }) => {
      setPlayers((prev) =>
        prev.map((p) => (p.id === payload.userId ? { ...p, presence: payload.presence } : p))
      );
    };

    // 4. Instant Coin Adjustment Relay
    const handleCoinsChanged = (payload: { userId: string; coins: number }) => {
      setPlayers((prev) =>
        prev.map((p) => (p.id === payload.userId ? { ...p, coins: payload.coins } : p))
      );
      if (selectedPlayer && selectedPlayer.id === payload.userId) {
        setSelectedPlayer((prev) => (prev ? { ...prev, coins: payload.coins } : null));
      }
    };

    const handleRoomsUpdated = () => {
      fetchTables();
    };

    const handleTableCreated = () => {
      fetchTables();
    };

    const handleTableApproved = () => {
      fetchTables();
      fetchTableRequestsData();
    };

    const handleTableRequestReceived = (req: any) => {
      setTableRequests((prev) => [req, ...prev.filter((r) => r.id !== req.id)]);
      sound.playWinFanfare();
      onShowToast(`👑 New table request from ${req.username || 'Player'} (${req.validityHours || 24} hrs)!`, 'info');
    };

    const handleTableRequestsUpdated = (payload: any) => {
      setTableRequests((prev) => prev.filter((r) => r.id !== payload.requestId));
    };

    const handleTableAvarUpdated = (payload: { roomId: string; avar: number }) => {
      setTables((prev) =>
        prev.map((t) => (t.id === payload.roomId ? { ...t, avar: payload.avar } : t))
      );
      if (selectedGodTable && selectedGodTable.id === payload.roomId) {
        setSelectedGodTable((prev) => (prev ? { ...prev, avar: payload.avar } : null));
      }
    };

    socket.on('admin:live_tables_sync', handleLiveTablesSync);
    socket.on('admin:live_players_sync', handleLivePlayersSync);
    socket.on('user:presence_changed', handlePresenceChanged);
    socket.on('user:coins_changed', handleCoinsChanged);
    socket.on('rooms:updated', handleRoomsUpdated);
    socket.on('table:created', handleTableCreated);
    socket.on('table:approved', handleTableApproved);
    socket.on('admin:table_request', handleTableRequestReceived);
    socket.on('admin:table_requests_updated', handleTableRequestsUpdated);
    socket.on('admin:table_avar_updated', handleTableAvarUpdated);

    return () => {
      socket.off('admin:live_tables_sync', handleLiveTablesSync);
      socket.off('admin:live_players_sync', handleLivePlayersSync);
      socket.off('user:presence_changed', handlePresenceChanged);
      socket.off('user:coins_changed', handleCoinsChanged);
      socket.off('rooms:updated', handleRoomsUpdated);
      socket.off('table:created', handleTableCreated);
      socket.off('table:approved', handleTableApproved);
      socket.off('admin:table_request', handleTableRequestReceived);
      socket.off('admin:table_requests_updated', handleTableRequestsUpdated);
      socket.off('admin:table_avar_updated', handleTableAvarUpdated);
    };
  }, [socket, isOpen, selectedPlayer, selectedGodTable, fetchTables, fetchTableRequestsData, onShowToast]);

  // Handle Admin Decision on Table Request with message & validity hours
  const handleDecideRequest = async (decision: 'approve' | 'decline') => {
    if (!reviewingRequest) return;
    const targetReq = reviewingRequest;
    const effectiveHours =
      reviewHoursPreset === '2h'
        ? 2
        : reviewHoursPreset === '6h'
        ? 6
        : reviewHoursPreset === '24h'
        ? 24
        : Math.max(1, Math.min(720, reviewCustomHours || 24));

    const finalAdminMsg = adminMessageInput.trim();

    setActionInProgress(targetReq.id);
    try {
      const res = await decideTableRequest({
        requestId: targetReq.id,
        decision,
        adminId: currentUser.id,
        adminName: currentUser.username || 'Admin',
        adminMessage: finalAdminMsg,
        validityHours: effectiveHours,
      });

      if (res.success) {
        if (decision === 'approve') {
          sound.playWinFanfare();
          if (res.table) {
            recordTableInSupabase(res.table).catch(() => {});
          }
        } else {
          sound.playChipSound();
        }
        onShowToast(res.message || `Table request ${decision}d!`, 'success');
        setTableRequests((prev) => prev.filter((r) => r.id !== targetReq.id));
        setReviewingRequest(null);
        setAdminMessageInput('');
        fetchPlayers();
        fetchTables();
      } else {
        onShowToast(res.message || 'Failed processing request', 'error');
      }
    } catch (err: any) {
      onShowToast(err?.message || 'Error processing request', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  // Calculated Preview Balance for the Coin Panel
  const parsedInputAmount = useMemo(() => {
    const val = parseInt(coinInputAmount.replace(/,/g, ''), 10);
    return isNaN(val) ? 0 : Math.max(0, val);
  }, [coinInputAmount]);

  const previewNewBalance = useMemo(() => {
    if (!selectedPlayer) return 0;
    const current = selectedPlayer.coins;
    if (coinAdjustmentMode === 'set') {
      return parsedInputAmount;
    } else if (coinAdjustmentMode === 'deduct') {
      return Math.max(0, current - parsedInputAmount);
    } else {
      return current + parsedInputAmount;
    }
  }, [selectedPlayer, coinAdjustmentMode, parsedInputAmount]);

  const previewDelta = useMemo(() => {
    if (!selectedPlayer) return 0;
    return previewNewBalance - selectedPlayer.coins;
  }, [selectedPlayer, previewNewBalance]);

  // Handle Instant Real-Time Coin Update (Optimistic + Immediate Sound & Feedback)
  const handleApplyCoins = async (
    targetPlayer: PlayerAdminData,
    amount: number,
    mode: 'grant' | 'deduct' | 'set',
    reason = 'Admin Treasury Adjustment'
  ) => {
    const previousBalance = targetPlayer.coins;
    let calculatedBalance = targetPlayer.coins;
    let delta = 0;

    if (mode === 'set') {
      calculatedBalance = Math.max(0, Math.floor(Math.abs(amount)));
      delta = calculatedBalance - targetPlayer.coins;
    } else if (mode === 'deduct') {
      const deductAmt = Math.abs(amount);
      calculatedBalance = Math.max(0, Math.floor(targetPlayer.coins - deductAmt));
      delta = calculatedBalance - targetPlayer.coins;
    } else {
      const grantAmt = Math.abs(amount);
      calculatedBalance = Math.max(0, Math.floor(targetPlayer.coins + grantAmt));
      delta = calculatedBalance - targetPlayer.coins;
    }

    // 1. Instant Optimistic State Update: 0ms real-time UI reflection!
    setPlayers((prev) =>
      prev.map((p) => (p.id === targetPlayer.id ? { ...p, coins: calculatedBalance } : p))
    );

    if (selectedPlayer?.id === targetPlayer.id) {
      setSelectedPlayer((prev) => (prev ? { ...prev, coins: calculatedBalance } : null));
    }

    if (targetPlayer.id === currentUser.id && onUpdateCurrentUserCoins) {
      onUpdateCurrentUserCoins(calculatedBalance);
    }

    // 2. Immediate Audio & Toast Notification
    if (delta >= 0) {
      sound.playWinFanfare();
      onShowToast(
        `🪙 Granted +${delta.toLocaleString()} coins to ${targetPlayer.username}! Balance: ${calculatedBalance.toLocaleString()} 🪙`,
        'success'
      );
    } else {
      sound.playChipSound();
      onShowToast(
        `🪙 Deducted ${Math.abs(delta).toLocaleString()} coins from ${targetPlayer.username}! Balance: ${calculatedBalance.toLocaleString()} 🪙`,
        'info'
      );
    }

    // Close coin panel immediately on apply
    setSelectedPlayer(null);

    // 3. Asynchronously persist to backend in background
    setActionInProgress(targetPlayer.id);
    try {
      const res = await fetch(`/api/admin/players/${targetPlayer.id}/coins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          mode,
          reason,
          adminId: currentUser.id,
        }),
      });
      const data = await res.json();
      if (data.success && typeof data.newBalance === 'number') {
        setPlayers((prev) =>
          prev.map((p) => (p.id === targetPlayer.id ? { ...p, coins: data.newBalance } : p))
        );
        if (targetPlayer.id === currentUser.id) {
          if (onUpdateCurrentUserCoins) {
            onUpdateCurrentUserCoins(data.newBalance);
          }
          if (data.notification && onAddNotification) {
            onAddNotification(data.notification);
          }
        }
      } else {
        // Rollback on server error
        setPlayers((prev) =>
          prev.map((p) => (p.id === targetPlayer.id ? { ...p, coins: previousBalance } : p))
        );
        if (targetPlayer.id === currentUser.id && onUpdateCurrentUserCoins) {
          onUpdateCurrentUserCoins(previousBalance);
        }
        onShowToast(data.message || 'Failed updating coins on server', 'error');
      }
    } catch (err: any) {
      // Rollback on network failure
      setPlayers((prev) =>
        prev.map((p) => (p.id === targetPlayer.id ? { ...p, coins: previousBalance } : p))
      );
      if (targetPlayer.id === currentUser.id && onUpdateCurrentUserCoins) {
        onUpdateCurrentUserCoins(previousBalance);
      }
      onShowToast(err?.message || 'Network error updating coins', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle Admin Promotion / Revocation
  const handleToggleAdminStatus = async (targetPlayer: PlayerAdminData) => {
    const nextStatus = !targetPlayer.isAdmin;
    setActionInProgress(targetPlayer.id);

    // Optimistic toggle
    setPlayers((prev) =>
      prev.map((p) => (p.id === targetPlayer.id ? { ...p, isAdmin: nextStatus } : p))
    );

    try {
      const res = await fetch(`/api/admin/players/${targetPlayer.id}/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAdmin: nextStatus }),
      });
      const data = await res.json();
      if (data.success) {
        sound.playChipSound();
        onShowToast(data.message, 'success');
      } else {
        // Rollback
        setPlayers((prev) =>
          prev.map((p) => (p.id === targetPlayer.id ? { ...p, isAdmin: !nextStatus } : p))
        );
        onShowToast(data.message || 'Failed updating admin status', 'error');
      }
    } catch (err: any) {
      setPlayers((prev) =>
        prev.map((p) => (p.id === targetPlayer.id ? { ...p, isAdmin: !nextStatus } : p))
      );
      onShowToast(err?.message || 'Network error', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle Table Action (Roll Now, Next Round, Delete Row)
  const handleTableAction = async (tableId: string, action: 'roll_now' | 'next_round' | 'terminate' | 'delete') => {
    setActionInProgress(tableId);
    if (action === 'terminate' || action === 'delete') {
      sound.playChipSound();
      // 1. Optimistic removal from UI list
      setTables((prev) => prev.filter((t) => t.id !== tableId));
      onShowToast(`🗑️ Deleting table row from Supabase...`, 'info');
    }

    try {
      if (action === 'terminate' || action === 'delete') {
        // Direct delete API calls to server and client Supabase
        await fetch(`/api/admin/tables/${tableId}`, { method: 'DELETE' }).catch(() => {});
        const res = await fetch(`/api/admin/tables/${tableId}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete' }),
        });
        const data = await res.json();
        await deleteTableFromSupabase(tableId).catch(() => {});

        sound.playChipSound();
        onShowToast(data.message || '🗑️ Table row deleted from Supabase successfully!', 'success');
        fetchTables();
        return;
      }

      const res = await fetch(`/api/admin/tables/${tableId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        sound.playWinFanfare();
        onShowToast(data.message, 'success');
        fetchTables();
      } else {
        onShowToast(data.message || 'Failed executing action', 'error');
        fetchTables();
      }
    } catch (err: any) {
      onShowToast(err?.message || 'Network error', 'error');
      fetchTables();
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle Real-Time Table A-VAR Adjustment
  const handleUpdateTableAvar = async (tableId: string, newAvar: number) => {
    const sanitized = Math.max(0, Math.min(100, Math.round(Number(newAvar) || 0)));

    // 1. Optimistic update
    setTables((prev) =>
      prev.map((t) => (t.id === tableId ? { ...t, avar: sanitized } : t))
    );

    // 2. Real-time WebSocket event
    if (socket) {
      socket.emit('admin:set_table_avar', { roomId: tableId, avar: sanitized });
    }

    // 3. Background API persistence
    try {
      const res = await fetch(`/api/admin/tables/${tableId}/avar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avar: sanitized }),
      });
      const data = await res.json();
      if (data.success) {
        onShowToast(`🎯 A-VAR for table set to ${sanitized}%!`, 'info');
      }
    } catch (err: any) {
      console.warn('[Admin] Failed persisting A-VAR setting:', err);
    }
  };

  // Handle Global Broadcast Send
  const handleSendBroadcast = async () => {
    if (!broadcastMessage.trim()) {
      onShowToast('Please enter a message to broadcast.', 'error');
      return;
    }
    setActionInProgress('broadcast');
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: broadcastTitle.trim() || 'Announcement',
          message: broadcastMessage.trim(),
          type: broadcastType,
        }),
      });
      const data = await res.json();
      if (data.success) {
        sound.playWinFanfare();
        onShowToast('📢 Announcement broadcasted to all active players!', 'success');
        setBroadcastMessage('');
      } else {
        onShowToast(data.message || 'Failed broadcasting', 'error');
      }
    } catch (err: any) {
      onShowToast(err?.message || 'Network error', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle Global Airdrop
  const handleSendAirdrop = async () => {
    const parsed = parseInt(airdropAmount, 10);
    if (isNaN(parsed) || parsed <= 0) {
      onShowToast('Please enter a valid positive coin amount for the airdrop.', 'error');
      return;
    }

    setActionInProgress('airdrop');
    try {
      const res = await fetch('/api/admin/airdrop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parsed,
          target: airdropTarget,
          reason: airdropReason.trim() || 'Festival Bonus',
          adminId: currentUser.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        sound.playJackpotSound();
        onShowToast(data.message, 'success');
        fetchPlayers();
      } else {
        onShowToast(data.message || 'Failed processing airdrop', 'error');
      }
    } catch (err: any) {
      onShowToast(err?.message || 'Network error', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  // Trigger Complete Garbage Collection and Redundant Tables Deletion from Supabase
  const handleTriggerGC = async () => {
    setActionInProgress('gc');
    
    // 1. Optimistic removal of 0-player or closed tables from UI
    setTables((prev) =>
      prev.filter((t) => t.realPlayerCount > 0 && t.status !== 'closed' && t.id !== 'public-royal-table')
    );

    try {
      // 2. Server authoritative sweep
      const res = await fetch('/api/tables/cleanup', { method: 'POST' });
      const data = await res.json();

      // 3. Client Supabase direct sweep
      let clientPurged = 0;
      try {
        clientPurged = await deleteZeroPlayerTablesFromSupabase();
      } catch {}

      // 4. Clean up any remaining legacy records
      await deleteTableFromSupabase('public-royal-table').catch(() => {});

      sound.playChipSound();
      const serverPurged = (data.gcResult?.purgedSupabaseTables ?? 0) + (data.gcResult?.purgedMemoryRooms ?? 0);
      const totalPurged = Math.max(serverPurged, clientPurged);

      if (totalPurged > 0) {
        onShowToast(
          `🧹 Successfully deleted ${totalPurged} redundant / 0-player tables from Supabase!`,
          'success'
        );
      } else {
        onShowToast(
          `✓ Redundant tables purged! Supabase game_tables is clean and in sync.`,
          'success'
        );
      }
      await fetchTables();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to run cleanup', 'error');
      fetchTables();
    } finally {
      setActionInProgress(null);
    }
  };

  // Complete Players list guaranteeing current user (myself) is present and active online
  const completePlayers = useMemo<PlayerAdminData[]>(() => {
    const list = [...players];
    const meIndex = list.findIndex(
      (p) =>
        (currentUser.id && p.id === currentUser.id) ||
        (currentUser.email && p.email && p.email.toLowerCase() === currentUser.email.toLowerCase()) ||
        (currentUser.username && p.username && p.username.toLowerCase() === currentUser.username.toLowerCase())
    );

    if (meIndex >= 0) {
      const existing = list[meIndex];
      const meItem: PlayerAdminData = {
        ...existing,
        id: currentUser.id || existing.id,
        username: currentUser.username || existing.username,
        avatar: currentUser.avatar || existing.avatar,
        email: currentUser.email || existing.email,
        coins: typeof currentUser.coins === 'number' ? currentUser.coins : existing.coins,
        gamesPlayed: typeof currentUser.gamesPlayed === 'number' ? currentUser.gamesPlayed : existing.gamesPlayed,
        gamesWon: typeof currentUser.gamesWon === 'number' ? currentUser.gamesWon : existing.gamesWon,
        winRate: (currentUser.gamesPlayed || 0) > 0 ? Math.round(((currentUser.gamesWon || 0) / currentUser.gamesPlayed) * 100) : existing.winRate,
        totalWinnings: typeof currentUser.totalWinnings === 'number' ? currentUser.totalWinnings : existing.totalWinnings,
        biggestWin: typeof currentUser.biggestWin === 'number' ? currentUser.biggestWin : existing.biggestWin,
        isAdmin: true,
        presence: existing.presence === 'in_table' ? 'in_table' : 'online',
      };
      // Place yourself at top for instant visibility
      list.splice(meIndex, 1);
      list.unshift(meItem);
    } else if (currentUser) {
      list.unshift({
        id: currentUser.id || 'current_admin',
        username: currentUser.username || 'You (Admin)',
        avatar: currentUser.avatar || '🎲',
        email: currentUser.email,
        coins: typeof currentUser.coins === 'number' ? currentUser.coins : 0,
        gamesPlayed: currentUser.gamesPlayed || 0,
        gamesWon: currentUser.gamesWon || 0,
        winRate: (currentUser.gamesPlayed || 0) > 0 ? Math.round(((currentUser.gamesWon || 0) / (currentUser.gamesPlayed || 1)) * 100) : 0,
        totalWinnings: currentUser.totalWinnings || 0,
        biggestWin: currentUser.biggestWin || 0,
        isAdmin: true,
        canCreateTable: Boolean(currentUser.canCreateTable || currentUser.can_create_table),
        tableValidityDays: currentUser.tableValidityDays || 7,
        equippedTitle: currentUser.equipped?.title || 'Admin',
        presence: 'online',
        createdAt: Date.now(),
      });
    }
    return list;
  }, [players, currentUser]);

  // Filtered Players (without admins filter tab)
  const filteredPlayers = useMemo(() => {
    return completePlayers.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        p.username.toLowerCase().includes(q) ||
        (p.email && p.email.toLowerCase().includes(q)) ||
        p.id.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      const isMe =
        (currentUser.id && p.id === currentUser.id) ||
        (currentUser.email && p.email && p.email.toLowerCase() === currentUser.email.toLowerCase()) ||
        (currentUser.username && p.username && p.username.toLowerCase() === currentUser.username.toLowerCase());

      if (filterPresence === 'in_table') return p.presence === 'in_table';
      if (filterPresence === 'online') return p.presence === 'online' || p.presence === 'in_table' || isMe;
      return true;
    });
  }, [completePlayers, searchQuery, filterPresence, currentUser]);

  // Fast Memoized Player Career Stats Map for God Mode
  const playersRegistry = useMemo<Record<string, GodModeCareerStats>>(() => {
    const reg: Record<string, GodModeCareerStats> = {};
    for (const p of completePlayers) {
      reg[p.id] = {
        gamesPlayed: p.gamesPlayed || 0,
        gamesWon: p.gamesWon || 0,
        winRate: p.winRate || 0,
        totalWinnings: p.totalWinnings || 0,
        biggestWin: p.biggestWin || 0,
        isAdmin: p.isAdmin,
      };
    }
    return reg;
  }, [completePlayers]);

  // Escape key to close dedicated view
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedGodTable) {
          setSelectedGodTable(null);
          return;
        }
        if (selectedPlayer || coinAdjustmentMode || selectedTableDetails || adminConfirmPlayer) {
          // let sub-modals handle their own close
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedGodTable, selectedPlayer, coinAdjustmentMode, selectedTableDetails, adminConfirmPlayer, onClose]);

  // Keep selectedGodTable in sync with live tables data
  useEffect(() => {
    if (selectedGodTable) {
      const updated = tables.find((t) => t.id === selectedGodTable.id);
      if (updated) {
        setSelectedGodTable(updated);
      }
    }
  }, [tables, selectedGodTable?.id]);

  if (!isOpen) return null;

  return (
    <div
      id="admin-view-root"
      className="fixed inset-0 z-50 bg-gradient-to-b from-[#090e1a] via-[#05070f] to-[#020306] flex flex-col text-slate-100 select-none overflow-hidden animate-in fade-in duration-200"
    >
      {/* 1. Full-Width Executive Header with Back Button */}
      <header className="relative px-4 sm:px-6 py-3 bg-gradient-to-r from-[#141d33] via-[#0f172a] to-[#0b101e] border-b border-amber-500/30 shrink-0 z-10 shadow-lg">
        <div className="absolute top-0 left-1/3 w-1/3 h-full bg-gradient-to-r from-amber-500/10 via-amber-400/15 to-transparent blur-2xl pointer-events-none" />

        <div className="max-w-7xl mx-auto relative flex items-center justify-between gap-3">
          {/* Left: Back Button */}
          <button
            type="button"
            onClick={() => {
              sound.playChipSound();
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-amber-200 border border-slate-700/80 hover:border-amber-500/50 font-semibold text-xs sm:text-sm transition-all active:scale-95 cursor-pointer shadow-md group shrink-0 z-10"
          >
            <ChevronLeft className="w-4 h-4 text-amber-400 transition-transform group-hover:-translate-x-0.5" />
            <span>Back</span>
          </button>

          {/* Center: Admin Title (Strictly Centered) */}
          <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none text-center">
            <h1 className="font-serif font-black text-base sm:text-lg text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-amber-300 to-amber-500 tracking-wide">
              Admin
            </h1>
          </div>

          {/* Right: Close Action */}
          <div className="flex items-center gap-2 z-10">
            <button
              onClick={() => {
                sound.playChipSound();
                onClose();
              }}
              className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-rose-950/60 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-500/40 transition-all active:scale-95 cursor-pointer shadow-sm"
              title="Close Admin View"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Top Navigation Tabs Bar */}
      <nav className="bg-slate-950/90 border-b border-slate-800/80 shrink-0 px-3 sm:px-6 py-2">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-2 sm:gap-3 w-full">
          <button
            onClick={() => setActiveTab('players')}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer transition-all ${
              activeTab === 'players'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold shadow-md shadow-amber-950/50'
                : 'text-slate-400 hover:text-amber-200 hover:bg-slate-900/60 border border-transparent hover:border-slate-800'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span className="capitalize">Players</span>
            <span
              className={`inline-flex items-center justify-center min-w-[18px] sm:min-w-[20px] h-[18px] sm:h-[20px] px-1 text-[10px] sm:text-[11px] font-mono font-black rounded-full ${
                activeTab === 'players'
                  ? 'bg-slate-950/30 text-slate-950'
                  : 'bg-slate-800 text-amber-300'
              }`}
            >
              {completePlayers.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('tables');
              fetchTables();
              fetchTableRequestsData();
            }}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer transition-all ${
              activeTab === 'tables'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold shadow-md shadow-amber-950/50'
                : 'text-slate-400 hover:text-amber-200 hover:bg-slate-900/60 border border-transparent hover:border-slate-800'
            }`}
          >
            <Flame className="w-4 h-4 shrink-0" />
            <span className="capitalize">Tables</span>
            <span
              className={`inline-flex items-center justify-center min-w-[18px] sm:min-w-[20px] h-[18px] sm:h-[20px] px-1 text-[10px] sm:text-[11px] font-mono font-black rounded-full ${
                tableRequests.length > 0
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : activeTab === 'tables'
                  ? 'bg-slate-950/30 text-slate-950'
                  : 'bg-slate-800 text-amber-300'
              }`}
            >
              {tableRequests.length > 0 ? tableRequests.length : tables.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('broadcast')}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer transition-all ${
              activeTab === 'broadcast'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold shadow-md shadow-amber-950/50'
                : 'text-slate-400 hover:text-amber-200 hover:bg-slate-900/60 border border-transparent hover:border-slate-800'
            }`}
          >
            <Radio className="w-4 h-4 shrink-0" />
            <span className="capitalize">Broadcast</span>
          </button>
        </div>
      </nav>

      {/* 3. Main Full-Screen Content Area */}
      <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
        <div className="max-w-7xl mx-auto space-y-4">
          {/* TAB 1: PLAYERS & COIN MANAGEMENT */}
          {activeTab === 'players' && (
            <div className="space-y-2.5">
              {/* Search & Filter Bar (Without Admins filter) */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative flex-1 min-w-[170px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name, email, or ID..."
                    className="w-full bg-slate-900/90 border border-slate-700/70 rounded-xl pl-8 pr-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Filter Tags: All, In Table, Online (Admins filter removed) */}
                <div className="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded-xl border border-slate-800 text-[10.5px] font-mono">
                  <button
                    onClick={() => setFilterPresence('all')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      filterPresence === 'all'
                        ? 'bg-amber-500/25 text-amber-300 font-bold border border-amber-500/40'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All ({completePlayers.length})
                  </button>
                  <button
                    onClick={() => setFilterPresence('in_table')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      filterPresence === 'in_table'
                        ? 'bg-emerald-500/25 text-emerald-300 font-bold border border-emerald-500/40'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    In Table ({completePlayers.filter((p) => p.presence === 'in_table').length})
                  </button>
                  <button
                    onClick={() => setFilterPresence('online')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      filterPresence === 'online'
                        ? 'bg-sky-500/25 text-sky-300 font-bold border border-sky-500/40'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Online ({completePlayers.filter((p) => p.presence !== 'offline').length})
                  </button>
                </div>

                <button
                  onClick={fetchPlayers}
                  disabled={loading}
                  title="Refresh Players"
                  className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-700 active:scale-95 transition-all cursor-pointer shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Player Cards List (Optimized for Mobile Performance) */}
              <div className="space-y-1.5">
                {filteredPlayers.length === 0 ? (
                  <div className="py-8 text-center rounded-xl bg-slate-900/40 border border-slate-800/80 text-slate-400 text-xs">
                    No players found matching search.
                  </div>
                ) : (
                  <>
                    {filteredPlayers.slice(0, playersVisibleCount).map((player) => (
                      <div
                        key={player.id}
                        className="p-2.5 sm:px-3.5 sm:py-2.5 rounded-xl bg-slate-900/70 border border-slate-800/80 hover:border-amber-500/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm"
                      >
                        {/* Left: Avatar, Username, Status, Info */}
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="relative shrink-0">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-xs shadow border border-amber-300/40 overflow-hidden">
                              <UserAvatar avatar={player.avatar} name={player.username} size="sm" className="w-full h-full rounded-none" />
                            </div>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-slate-950 ${
                                player.presence === 'in_table'
                                  ? 'bg-emerald-400 animate-pulse'
                                  : player.presence === 'online'
                                  ? 'bg-amber-400'
                                  : 'bg-slate-600'
                              }`}
                            />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-serif font-bold text-xs sm:text-sm text-amber-200 truncate">
                                {player.username}
                              </span>
                              {player.isAdmin && (
                                <span className="text-[8px] px-1.5 py-0.2 rounded font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-400/30 flex items-center gap-0.5">
                                  <Crown className="w-2 h-2 text-purple-300" />
                                  ADMIN
                                </span>
                              )}
                              {player.canCreateTable && (
                                <span className="text-[8px] px-1.5 py-0.2 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-0.5" title={`Table Host Approved (${player.tableValidityDays || 7} days validity)`}>
                                  👑 HOST ({player.tableValidityDays || 7}d)
                                </span>
                              )}
                              {player.id === currentUser.id && (
                                <span className="text-[8px] px-1.5 py-0.2 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  YOU
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 text-[9.5px] text-slate-400 font-mono truncate mt-0.5">
                              {player.email ? (
                                <span className="text-amber-300/80 truncate max-w-[140px] sm:max-w-[200px]">{player.email}</span>
                              ) : (
                                <span className="text-slate-500">ID: {player.id.substring(0, 8)}...</span>
                              )}
                              {player.currentTable && (
                                <span className="text-emerald-300 bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-500/20">
                                  🎲 {player.currentTable.code}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Middle: Coin Balance Display */}
                        <div className="flex items-center gap-2 shrink-0 bg-slate-950/70 px-2.5 py-1.5 rounded-xl border border-slate-800 text-[11px] font-mono">
                          <Coins className="w-3.5 h-3.5 text-amber-400" />
                          <span className="font-bold text-amber-300 text-xs sm:text-sm">
                            {player.coins.toLocaleString()} 🪙
                          </span>
                          <span className="text-[9px] text-slate-500 border-l border-slate-800 pl-1.5 hidden xs:inline">
                            W: {player.gamesWon} ({player.winRate}%)
                          </span>
                        </div>

                        {/* Right: Admin Toggle & Coin Action Button */}
                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap sm:flex-nowrap">
                          {/* Admin Privileges Toggle Button */}
                          <button
                            type="button"
                            onClick={() => setAdminConfirmPlayer(player)}
                            title={player.isAdmin ? 'Revoke Admin Privileges' : 'Grant Admin Privileges'}
                            disabled={actionInProgress === player.id}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-mono font-bold transition-all active:scale-95 cursor-pointer shadow-sm ${
                              player.isAdmin
                                ? 'bg-purple-950/70 border-purple-500/60 text-purple-200 hover:bg-purple-900/70'
                                : 'bg-slate-900/90 border-slate-700 text-slate-400 hover:text-purple-300 hover:border-purple-500/40'
                            }`}
                          >
                            <ShieldCheck className={`w-3.5 h-3.5 ${player.isAdmin ? 'text-purple-300' : 'text-slate-400'}`} />
                            <span>{player.isAdmin ? 'Admin' : 'Make Admin'}</span>
                          </button>

                          {/* Dedicated Coin Management Button that opens the Add/Deduct Panel */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPlayer(player);
                              setCoinInputAmount('25000');
                              setCoinAdjustmentMode('grant');
                              setCoinReason('Admin Treasury Grant');
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-amber-600/30 hover:from-amber-500/30 hover:to-amber-600/40 text-amber-300 border border-amber-500/40 text-xs font-mono font-bold active:scale-95 transition-all shadow-sm cursor-pointer"
                          >
                            <Coins className="w-3.5 h-3.5 text-amber-400" />
                            <span>Coins</span>
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Progressive Load More on Mobile */}
                    {filteredPlayers.length > playersVisibleCount && (
                      <div className="pt-2 text-center">
                        <button
                          type="button"
                          onClick={() => setPlayersVisibleCount((prev) => prev + 25)}
                          className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 text-xs font-mono font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
                        >
                          Load More Players ({filteredPlayers.length - playersVisibleCount} remaining)
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: TABLES & TABLE REQUESTS */}
          {activeTab === 'tables' && (
            <div className="space-y-4">
              {/* SECTION 1: TABLE CREATION REQUESTS */}
              <div className="space-y-2.5 p-3 sm:p-3.5 rounded-2xl bg-slate-950/70 border border-amber-500/30">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-serif font-bold text-amber-200">
                      Table Creation Requests ({tableRequests.length})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={fetchTableRequestsData}
                    className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 text-xs flex items-center gap-1 cursor-pointer active:scale-95"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span className="text-[10px]">Refresh</span>
                  </button>
                </div>

                {tableRequests.length === 0 ? (
                  <div className="py-4 text-center rounded-xl bg-slate-900/40 border border-slate-800/80 text-slate-400 text-xs space-y-1">
                    <div className="flex items-center justify-center gap-1.5 text-emerald-400 font-semibold text-xs">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>No pending table requests</span>
                    </div>
                    <p className="text-[10.5px] text-slate-500">
                      When players or admins request to create a table, they appear here for your review and approval.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tableRequests.map((req) => (
                      <div
                        key={req.id}
                        className="p-3 rounded-xl bg-slate-900/90 border border-amber-500/40 hover:border-amber-400 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 shadow-md"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-100 text-xs">{req.username}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              {req.validityHours || 24} Hours
                            </span>
                            {req.isPrivate && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                Private
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-300 font-medium">
                            Table: <strong className="text-amber-200">{req.tableName}</strong>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Countdown: {req.bettingDuration || 20}s • Requested {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() => {
                              sound.playChipSound();
                              setReviewingRequest(req);
                              setReviewHoursPreset(
                                req.validityHours === 2
                                  ? '2h'
                                  : req.validityHours === 6
                                  ? '6h'
                                  : req.validityHours === 24
                                  ? '24h'
                                  : 'custom'
                              );
                              setReviewCustomHours(req.validityHours || 24);
                              setAdminMessageInput('');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-xs shadow-md shadow-emerald-950/60 border border-emerald-400 flex items-center gap-1.5 cursor-pointer active:scale-95"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Review</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 2: LIVE & SAVED GAME TABLES */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-amber-200">
                    Live Active Tables ({tables.length})
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleTriggerGC}
                      disabled={actionInProgress === 'gc'}
                      title="Purge 0-player, closed, and orphaned tables from Supabase & Game Engine"
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-500/40 text-xs font-semibold transition-all cursor-pointer active:scale-95 shadow-sm disabled:opacity-50"
                    >
                      <Trash2 className={`w-3.5 h-3.5 text-rose-400 ${actionInProgress === 'gc' ? 'animate-spin' : ''}`} />
                      <span>Delete Redundant Tables</span>
                    </button>
                    <button
                      onClick={() => {
                        fetchTables();
                        fetchTableRequestsData();
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 text-xs font-semibold transition-all cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Refresh</span>
                    </button>
                  </div>
                </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                {tables.length === 0 ? (
                  <div className="col-span-full py-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800/80 text-slate-400 text-xs space-y-1.5">
                    <p className="text-slate-300 font-semibold text-sm">No active tables running.</p>
                    <p className="text-[11px] text-slate-500">All redundant or closed tables have been purged.</p>
                  </div>
                ) : (
                  <>
                    {tables.slice(0, tablesVisibleCount).map((t) => (
                      <div
                        key={t.id}
                        className="p-3.5 rounded-2xl bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950 border border-slate-800/90 hover:border-amber-500/35 shadow-xl shadow-black/60 space-y-3 transition-all flex flex-col justify-between"
                      >
                        {/* Combined Unified Top Section: Table Name, Info Button, Line 2 Badges (with Round #), & Integrated A-VAR Slider */}
                        <div className="p-3 rounded-xl bg-gradient-to-r from-slate-950/95 via-slate-900/90 to-slate-950/95 border border-slate-800/80 space-y-2.5 shadow-inner">
                          {/* Line 1: Table Name on Left, GOD & Info "i" Buttons on Right */}
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-serif font-bold text-sm sm:text-base text-amber-200 truncate tracking-wide">
                              {t.name}
                            </h3>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* God Mode Surveillance Button */}
                              <button
                                type="button"
                                onClick={() => {
                                  sound.playWinFanfare();
                                  setCopiedGodCode(false);
                                  setSelectedGodTable(t);
                                }}
                                className="px-2 py-1 rounded-lg bg-gradient-to-r from-amber-500/25 via-purple-500/25 to-indigo-500/25 hover:from-amber-500/35 hover:via-purple-500/35 hover:to-indigo-500/35 text-amber-300 hover:text-amber-100 border border-amber-500/50 hover:border-amber-400 font-mono font-black text-[10.5px] transition-all cursor-pointer active:scale-95 shadow-sm flex items-center gap-1 group"
                                title="God Mode: House Surveillance, Player Bets & Probability Matrix"
                              >
                                <Zap className="w-3 h-3 text-amber-400 fill-amber-400/30 group-hover:scale-110 transition-transform" />
                                <span className="tracking-wider">GOD</span>
                              </button>

                              {/* Info Details Button */}
                              <button
                                type="button"
                                onClick={() => {
                                  sound.playChipSound();
                                  setCopiedDetailsCode(false);
                                  setSelectedTableDetails(t);
                                }}
                                className="p-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-amber-300 border border-slate-700/60 transition-all cursor-pointer active:scale-95 shadow-sm flex items-center justify-center shrink-0"
                                title="View Table Details & Access Code"
                              >
                                <Info className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Line 2: Player Count, Phase/Waiting Badge, AND Round Number Badge */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded-md bg-slate-900/90 border border-slate-700/60 text-[9.5px] text-slate-300 font-mono flex items-center gap-1 shadow-inner">
                              <Users className="w-2.5 h-2.5 text-amber-400/90" />
                              <span>{t.realPlayerCount || t.playerCount || 1} { (t.realPlayerCount || t.playerCount || 1) === 1 ? 'Player' : 'Players'}</span>
                            </span>

                            <span
                              className={`px-1.5 py-0.5 rounded-md font-mono text-[9px] font-bold uppercase tracking-wider border shadow-sm flex items-center gap-1 ${
                                t.phase === 'betting'
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                  : t.phase === 'rolling'
                                  ? 'bg-purple-500/15 border-purple-500/40 text-purple-200 animate-pulse'
                                  : t.phase === 'payout'
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                  : 'bg-slate-800/60 border-slate-700 text-slate-400'
                              }`}
                            >
                              {t.phase === 'betting' && `Betting (${t.timer}s)`}
                              {t.phase === 'rolling' && `Rolling (${t.timer}s)`}
                              {t.phase === 'payout' && `Results (${t.timer}s)`}
                              {t.phase !== 'betting' && t.phase !== 'rolling' && t.phase !== 'payout' && 'Waiting'}
                            </span>

                            {/* Round Number Badge on Line 2 */}
                            <span className="px-1.5 py-0.5 rounded-md bg-slate-900/90 border border-slate-700/60 text-[9.5px] text-amber-300/90 font-mono font-bold shadow-inner">
                              Round #{t.roundNumber}
                            </span>
                          </div>

                          {/* Integrated Real-Time A-VAR Algorithm Slider */}
                          <TableAvarControl
                            tableId={t.id}
                            tableName={t.name}
                            avarValue={t.avar ?? 50}
                            onUpdateAvar={handleUpdateTableAvar}
                            disabled={actionInProgress === t.id}
                          />
                        </div>

                        {/* Bottom Footer: Pool & Actions */}
                        <div className="flex items-center justify-between gap-2.5 pt-1.5 border-t border-slate-800/80 flex-wrap">
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-950/80 border border-slate-800 font-mono text-[11px]">
                            <span className="text-slate-400 text-[10.5px]">Round Pool:</span>
                            <strong className="text-amber-300 font-bold">{t.totalRoundBets.toLocaleString()} 🪙</strong>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleTableAction(t.id, 'delete')}
                              disabled={actionInProgress === t.id}
                              title="Disband active room and delete table"
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-500/40 text-rose-200 hover:text-white font-semibold text-[11px] transition-all active:scale-95 cursor-pointer shadow-sm hover:border-rose-400"
                            >
                              <Trash2 className="w-3 h-3 text-rose-400" />
                              <span>Delete Table</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {tables.length > tablesVisibleCount && (
                      <div className="col-span-full pt-2 text-center">
                        <button
                          type="button"
                          onClick={() => setTablesVisibleCount((prev) => prev + 12)}
                          className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 text-xs font-mono font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
                        >
                          Load More Tables ({tables.length - tablesVisibleCount} remaining)
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

          {/* TAB 3: BROADCAST */}
          {activeTab === 'broadcast' && (
            <div className="space-y-3">
              {/* Broadcast Card */}
              <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2.5">
                <div className="flex items-center gap-2 text-amber-300">
                  <Radio className="w-4 h-4" />
                  <span className="font-semibold text-xs sm:text-sm text-amber-200">Global Banner Alert</span>
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    value={broadcastTitle}
                    onChange={(e) => setBroadcastTitle(e.target.value)}
                    placeholder="Alert Title..."
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-amber-200 placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  />
                  <textarea
                    rows={2}
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    placeholder="Enter message to display across all active screens..."
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 resize-none"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      {(['info', 'success', 'warning'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setBroadcastType(t)}
                          className={`px-2.5 py-0.5 rounded-lg text-[10px] font-mono capitalize cursor-pointer ${
                            broadcastType === t
                              ? 'bg-amber-500 text-slate-950 font-bold'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={handleSendBroadcast}
                      disabled={actionInProgress === 'broadcast' || !broadcastMessage.trim()}
                      className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5 fill-slate-950" />
                      <span>Send Alert</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Mass Coin Airdrop Card */}
              <div className="p-3.5 rounded-2xl bg-purple-950/30 border border-purple-500/30 space-y-2.5">
                <div className="flex items-center gap-2 text-purple-300">
                  <Sparkles className="w-4 h-4" />
                  <span className="font-semibold text-xs sm:text-sm text-purple-200">Mass Coin Airdrop</span>
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[10.5px] font-mono">
                    <button
                      type="button"
                      onClick={() => setAirdropTarget('online')}
                      className={`py-1 rounded-lg font-bold cursor-pointer ${
                        airdropTarget === 'online'
                          ? 'bg-purple-600 text-white shadow'
                          : 'text-slate-400'
                      }`}
                    >
                      Online ({players.filter((p) => p.presence !== 'offline').length || 1})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAirdropTarget('all')}
                      className={`py-1 rounded-lg font-bold cursor-pointer ${
                        airdropTarget === 'all'
                          ? 'bg-purple-600 text-white shadow'
                          : 'text-slate-400'
                      }`}
                    >
                      All Registered ({players.length})
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={airdropAmount}
                      onChange={(e) => setAirdropAmount(e.target.value)}
                      placeholder="Amount..."
                      className="flex-1 bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs font-mono text-amber-300 focus:outline-none focus:border-purple-400"
                    />
                    {[10000, 25000, 50000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setAirdropAmount(amt.toString())}
                        className="px-2 py-1 rounded-lg bg-slate-800 text-[10px] font-mono text-amber-300 border border-slate-700 cursor-pointer"
                      >
                        +{amt / 1000}k
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={airdropReason}
                      onChange={(e) => setAirdropReason(e.target.value)}
                      placeholder="Reason note..."
                      className="flex-1 bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-[11px] text-slate-200 focus:outline-none"
                    />
                    <button
                      onClick={handleSendAirdrop}
                      disabled={actionInProgress === 'airdrop' || !airdropAmount}
                      className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5 fill-white" />
                      <span>Airdrop</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

        {/* 4. DEDICATED PLAYER COIN MANAGEMENT PANEL / MODAL */}
        {selectedPlayer && (
          <div
            className="fixed inset-0 z-60 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
            onClick={() => setSelectedPlayer(null)}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-gradient-to-b from-[#111c35] via-[#0c1427] to-[#060a14] border border-amber-500/50 p-4 sm:p-5 shadow-2xl text-slate-100 space-y-3.5 relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header with Player Info & Current Balance */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 font-bold overflow-hidden text-sm shadow-md border border-amber-300/40">
                    <UserAvatar avatar={selectedPlayer.avatar} name={selectedPlayer.username} size="sm" className="w-full h-full rounded-none" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-serif font-bold text-sm text-amber-200 truncate">
                        {selectedPlayer.username}
                      </h3>
                      {selectedPlayer.isAdmin && (
                        <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-400/30">
                          ADMIN
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono">
                      Current: <strong className="text-amber-300">{selectedPlayer.coins.toLocaleString()} 🪙</strong>
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedPlayer(null)}
                  className="p-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Mode Selector Tabs */}
              <div className="grid grid-cols-3 gap-1.5 bg-slate-950/90 p-1 rounded-xl border border-slate-800 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setCoinAdjustmentMode('grant')}
                  className={`py-1.5 rounded-lg font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    coinAdjustmentMode === 'grant'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-emerald-300'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCoinAdjustmentMode('deduct')}
                  className={`py-1.5 rounded-lg font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    coinAdjustmentMode === 'deduct'
                      ? 'bg-rose-600 text-white shadow'
                      : 'text-slate-400 hover:text-rose-300'
                  }`}
                >
                  <Minus className="w-3.5 h-3.5" />
                  <span>Deduct</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCoinAdjustmentMode('set')}
                  className={`py-1.5 rounded-lg font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    coinAdjustmentMode === 'set'
                      ? 'bg-amber-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-amber-300'
                  }`}
                >
                  <span>= Set</span>
                </button>
              </div>

              {/* Real-Time Live Preview Badge */}
              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/90 flex items-center justify-between text-xs font-mono">
                <div className="text-slate-400">
                  <span>Balance After:</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-300">{selectedPlayer.coins.toLocaleString()}</span>
                  <ArrowRight className="w-3 h-3 text-slate-500" />
                  <span
                    className={`font-black text-sm ${
                      previewDelta > 0
                        ? 'text-emerald-400'
                        : previewDelta < 0
                        ? 'text-rose-400'
                        : 'text-amber-300'
                    }`}
                  >
                    {previewNewBalance.toLocaleString()} 🪙
                  </span>
                  <span
                    className={`text-[10px] px-1 py-0.2 rounded font-bold ${
                      previewDelta > 0
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : previewDelta < 0
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {previewDelta >= 0 ? `+${previewDelta.toLocaleString()}` : previewDelta.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Amount Input */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  {coinAdjustmentMode === 'grant'
                    ? 'Amount to Add'
                    : coinAdjustmentMode === 'deduct'
                    ? 'Amount to Deduct'
                    : 'Exact Balance Target'}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={coinInputAmount}
                    onChange={(e) => setCoinInputAmount(e.target.value)}
                    placeholder="Enter coin amount..."
                    min="1"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-sm font-mono text-amber-300 placeholder-slate-600 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/40"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500">
                    🪙 Coins
                  </div>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="space-y-1">
                <div className="text-[10px] font-mono text-slate-400">Quick Presets:</div>
                <div className="grid grid-cols-4 gap-1">
                  {[5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCoinInputAmount(amt.toString())}
                      className={`py-1 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer border ${
                        parseInt(coinInputAmount, 10) === amt
                          ? 'bg-amber-500 text-slate-950 border-amber-400'
                          : 'bg-slate-900/90 text-amber-300/90 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {amt >= 1000000 ? `${amt / 1000000}M` : `${amt / 1000}K`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reason / Note Preset Tags & Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  Audit Reason / Note:
                </label>
                <div className="flex items-center gap-1 flex-wrap">
                  {['Festival Gift', 'Admin Correction', 'VIP Bonus', 'Compensation', 'Jackpot Grant'].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setCoinReason(tag)}
                      className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono transition-all cursor-pointer border ${
                        coinReason === tag
                          ? 'bg-amber-500/30 text-amber-300 border-amber-400/50 font-bold'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={coinReason}
                  onChange={(e) => setCoinReason(e.target.value)}
                  placeholder="Custom memo note..."
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedPlayer(null)}
                  className="flex-1 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 font-bold text-xs transition-all active:scale-95 cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (parsedInputAmount <= 0 && coinAdjustmentMode !== 'set') {
                      onShowToast('Please enter a positive coin amount.', 'error');
                      return;
                    }
                    handleApplyCoins(selectedPlayer, parsedInputAmount, coinAdjustmentMode, coinReason);
                  }}
                  className={`flex-2 py-2 rounded-xl font-bold text-xs shadow-lg transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 ${
                    coinAdjustmentMode === 'grant'
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-emerald-950/60'
                      : coinAdjustmentMode === 'deduct'
                      ? 'bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white shadow-rose-950/60'
                      : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-amber-950/60'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {coinAdjustmentMode === 'grant'
                      ? `Add +${parsedInputAmount.toLocaleString()} 🪙 Now`
                      : coinAdjustmentMode === 'deduct'
                      ? `Deduct -${parsedInputAmount.toLocaleString()} 🪙 Now`
                      : `Set Balance to ${parsedInputAmount.toLocaleString()} 🪙`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
        {/* 5. Role Confirmation Modal Panel */}
        {adminConfirmPlayer && (
          <div
            className="absolute inset-0 bg-black/85 backdrop-blur-md z-30 flex items-center justify-center p-3 animate-in fade-in duration-150"
            onClick={() => setAdminConfirmPlayer(null)}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-gradient-to-b from-[#11192e] to-[#080d19] border border-amber-500/50 p-4 sm:p-5 shadow-2xl shadow-black flex flex-col gap-4 text-slate-100 animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shrink-0 ${
                    adminConfirmPlayer.isAdmin
                      ? 'bg-rose-950/80 border border-rose-500/50 text-rose-400'
                      : 'bg-gradient-to-br from-amber-400 to-amber-600 border border-amber-300 text-slate-950'
                  }`}
                >
                  <Crown className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif font-black text-sm sm:text-base text-amber-200">
                    {adminConfirmPlayer.isAdmin ? 'Revoke Admin Access?' : 'Grant Admin Privileges?'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Target Player: <span className="text-white font-bold">{adminConfirmPlayer.username}</span>
                  </p>
                </div>
              </div>

              {/* Player Info Summary */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg overflow-hidden border border-amber-400/40">
                    <UserAvatar
                      avatar={adminConfirmPlayer.avatar}
                      name={adminConfirmPlayer.username}
                      size="sm"
                      className="w-full h-full rounded-none"
                    />
                  </div>
                  <div>
                    <div className="font-bold text-amber-200">{adminConfirmPlayer.username}</div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {adminConfirmPlayer.email || `ID: ${adminConfirmPlayer.id.substring(0, 10)}...`}
                    </div>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <span className="text-[10px] text-slate-400">Current Role: </span>
                  <span
                    className={`font-bold text-[10px] px-1.5 py-0.5 rounded ${
                      adminConfirmPlayer.isAdmin
                        ? 'bg-purple-950 text-purple-300 border border-purple-500/30'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {adminConfirmPlayer.isAdmin ? 'ADMIN' : 'PLAYER'}
                  </span>
                </div>
              </div>

              {/* Warning Notice */}
              <p className="text-xs text-slate-300 leading-relaxed bg-amber-950/20 border border-amber-500/30 rounded-xl p-3">
                {adminConfirmPlayer.isAdmin
                  ? `Are you sure you want to remove admin capabilities from ${adminConfirmPlayer.username}? They will no longer be able to manage tables, adjust player balances, or broadcast announcements.`
                  : `Are you sure you want to grant full administrator privileges to ${adminConfirmPlayer.username}? They will gain complete access to the Admin Treasury, game tables, and global announcements.`}
              </p>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setAdminConfirmPlayer(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 font-bold text-xs transition-all active:scale-95 cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const target = adminConfirmPlayer;
                    setAdminConfirmPlayer(null);
                    handleToggleAdminStatus(target);
                  }}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 ${
                    adminConfirmPlayer.isAdmin
                      ? 'bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white shadow-rose-950/60'
                      : 'bg-gradient-to-r from-purple-600 via-amber-500 to-amber-600 hover:opacity-90 text-slate-950 font-black shadow-amber-950/60'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {adminConfirmPlayer.isAdmin ? 'Confirm Revoke' : 'Confirm Promotion'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 6. Review Table Creation Request Modal (with Optional Message Input & Duration in Hours) */}
        {reviewingRequest && (
          <div
            className="absolute inset-0 bg-black/85 backdrop-blur-md z-30 flex items-center justify-center p-3 animate-in fade-in duration-150"
            onClick={() => setReviewingRequest(null)}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-gradient-to-b from-[#11192e] to-[#080d19] border border-amber-500/50 p-4 sm:p-5 shadow-2xl shadow-black flex flex-col gap-3.5 text-slate-100 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg text-slate-950 shrink-0">
                    <Crown className="w-4 h-4 fill-slate-950" />
                  </div>
                  <div>
                    <h3 className="font-serif font-black text-sm sm:text-base text-amber-200">
                      Review Table Request
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Requested by: <span className="text-white font-bold">{reviewingRequest.username}</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setReviewingRequest(null)}
                  className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Request Info Box */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Table Name:</span>
                  <span className="font-bold text-amber-200">{reviewingRequest.tableName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Privacy:</span>
                  <span className="font-mono text-purple-300">{reviewingRequest.isPrivate ? 'Private (Code Only)' : 'Public'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Betting Timer:</span>
                  <span className="font-mono text-sky-300">{reviewingRequest.bettingDuration || 20}s</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Duration:</span>
                  <span className="font-mono text-emerald-300 font-bold">{reviewingRequest.validityHours || 24} Hours</span>
                </div>
              </div>

              {/* Duration Setting in Hours */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-amber-200">
                  <span>Approved Active Duration</span>
                  <span className="font-mono text-emerald-300 text-xs">
                    {reviewHoursPreset === 'custom'
                      ? `${reviewCustomHours || 24} Hours`
                      : reviewHoursPreset === '2h'
                      ? '2 Hours'
                      : reviewHoursPreset === '6h'
                      ? '6 Hours'
                      : '24 Hours'}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
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
                        setReviewHoursPreset(key as any);
                      }}
                      className={`py-1.5 px-1 rounded-xl text-xs font-mono font-bold border transition-all text-center cursor-pointer ${
                        reviewHoursPreset === key
                          ? 'bg-amber-500/25 border-amber-400 text-amber-200 ring-1 ring-amber-400/40'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {reviewHoursPreset === 'custom' && (
                  <div className="mt-1 p-2 rounded-xl bg-slate-950 border border-amber-500/30 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-300">Active Hours:</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={720}
                        value={reviewCustomHours}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setReviewCustomHours(isNaN(val) ? 1 : Math.max(1, Math.min(720, val)));
                        }}
                        className="w-16 px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-700 text-amber-300 font-mono font-bold text-xs text-center focus:outline-none"
                      />
                      <span className="text-xs font-mono text-slate-400">hrs</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Admin Message to Player Input */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-300">
                  Admin Message (Optional):
                </label>
                <textarea
                  rows={2}
                  value={adminMessageInput}
                  onChange={(e) => setAdminMessageInput(e.target.value)}
                  placeholder="Optional message to player..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5 pt-1.5 w-full">
                <button
                  type="button"
                  onClick={() => handleDecideRequest('decline')}
                  disabled={Boolean(actionInProgress)}
                  className="w-[40%] flex-[2] py-2.5 px-3 rounded-xl bg-gradient-to-b from-rose-900/60 via-rose-950/80 to-rose-950 hover:from-rose-800/80 hover:via-rose-900/90 hover:to-rose-900 text-rose-200 hover:text-white border border-rose-500/40 hover:border-rose-400/70 font-bold text-xs tracking-wide shadow-md shadow-rose-950/60 transition-all duration-150 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <X className="w-3.5 h-3.5 text-rose-400 group-hover:text-rose-200 transition-colors shrink-0 stroke-[2.5]" />
                  <span>Decline</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDecideRequest('approve')}
                  disabled={Boolean(actionInProgress)}
                  className="w-[60%] flex-[3] py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 hover:from-emerald-400 hover:via-emerald-300 hover:to-teal-300 text-slate-950 font-black text-xs tracking-wide shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-150 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5 border border-emerald-300/80 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4 text-slate-950 shrink-0 stroke-[3]" />
                  <span>Approve</span>
                </button>
              </div>
            </div>
          </div>
        )}
        {/* 6. DEDICATED TABLE DETAILS INFO MODAL */}
        {selectedTableDetails && (
          <div
            className="fixed inset-0 z-60 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
            onClick={() => setSelectedTableDetails(null)}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-gradient-to-b from-[#111c35] via-[#0c1427] to-[#060a14] border border-amber-500/50 p-4 sm:p-5 shadow-2xl text-slate-100 space-y-3.5 relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 font-bold shrink-0 shadow-sm">
                    <Info className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-serif font-black text-sm sm:text-base text-amber-200 truncate">
                      {selectedTableDetails.name}
                    </h3>
                    <p className="text-[10.5px] text-slate-400 font-mono">Table Inspection & Details</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedTableDetails(null)}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs font-sans">
                {/* Table Code */}
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Table Code</div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono font-black text-amber-300 tracking-wider">
                      {selectedTableDetails.code}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        sound.playChipSound();
                        navigator.clipboard.writeText(selectedTableDetails.code).then(() => {
                          setCopiedDetailsCode(true);
                          setTimeout(() => setCopiedDetailsCode(false), 2000);
                        }).catch(() => {});
                      }}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] flex items-center gap-1 cursor-pointer active:scale-95"
                      title="Copy Code"
                    >
                      {copiedDetailsCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedDetailsCode ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                {/* Host Name */}
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Host</div>
                  <div className="font-semibold text-slate-200 truncate flex items-center gap-1">
                    <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                    <span className="truncate">{selectedTableDetails.hostName || 'Host'}</span>
                  </div>
                </div>

                {/* Approved By */}
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Approved By</div>
                  <div className="font-semibold text-emerald-300 truncate flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="truncate">
                      {getApprovedByDisplayName(selectedTableDetails, currentUser, players)}
                    </span>
                  </div>
                </div>

                {/* Time Remaining */}
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Time Remaining</div>
                  <div className="font-mono font-bold text-amber-300 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>
                      {formatTimeRemaining(
                        selectedTableDetails.expiresAt || selectedTableDetails.expires_at,
                        selectedTableDetails.approvalStatus === 'pending' || selectedTableDetails.status === 'pending_approval' || selectedTableDetails.approved === false,
                        selectedTableDetails.validity_hours || selectedTableDetails.validityHours
                      )}
                    </span>
                  </div>
                </div>

                {/* Access Privacy */}
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Privacy & Access</div>
                  <div className="font-medium text-slate-200 flex items-center gap-1">
                    {selectedTableDetails.isPrivate ? (
                      <>
                        <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                        <span>Private (Friends)</span>
                      </>
                    ) : (
                      <>
                        <Globe className="w-3 h-3 text-blue-400 shrink-0" />
                        <span>Public Open</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Players Count */}
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Player Count</div>
                  <div className="font-mono text-slate-200 flex items-center gap-1">
                    <Users className="w-3 h-3 text-purple-400 shrink-0" />
                    <span>{selectedTableDetails.realPlayerCount || 0} real / {selectedTableDetails.playerCount || 0} total</span>
                  </div>
                </div>
              </div>

              {/* Admin Note if present */}
              {(selectedTableDetails.adminApprovalMessage || selectedTableDetails.approvalMeta?.message) && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
                  <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider block mb-0.5">Admin Message Note:</span>
                  <p className="text-amber-100/90 italic font-sans">
                    "{selectedTableDetails.adminApprovalMessage || selectedTableDetails.approvalMeta?.message}"
                  </p>
                </div>
              )}

              {/* Close Button */}
              <div className="flex items-center justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedTableDetails(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer active:scale-95 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 7. GOD MODE MODAL (Separate Compact Component with 2s Auto-Telemetry) */}
        {selectedGodTable && (
          <GodModeModal
            table={tables.find((t) => t.id === selectedGodTable.id) || selectedGodTable}
            onClose={() => setSelectedGodTable(null)}
            playersRegistry={playersRegistry}
            onTableAction={handleTableAction}
            onUpdateAvar={handleUpdateTableAvar}
            onRefresh={() => {
              fetchTables();
              fetchPlayers();
            }}
            actionInProgress={actionInProgress}
          />
        )}
    </div>
  );
};
