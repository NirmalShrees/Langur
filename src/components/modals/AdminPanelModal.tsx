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
} from 'lucide-react';
import { UserProfile, SymbolType, LANGUR_BURJA_SYMBOLS, SYMBOL_KEYS } from '../../types.js';
import { UserAvatar } from '../common/UserAvatar.js';
import { sound } from '../../utils/audio.js';
import { deleteZeroPlayerTablesFromSupabase, deleteTableFromSupabase } from '../../services/tableService.js';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onUpdateCurrentUserCoins?: (newBalance: number) => void;
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
  roundNumber: number;
  playerCount: number;
  realPlayerCount: number;
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
  status?: string;
  inMemory?: boolean;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onShowToast,
  onUpdateCurrentUserCoins,
  socket,
}) => {
  const [activeTab, setActiveTab] = useState<'players' | 'tables' | 'broadcast'>('players');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPresence, setFilterPresence] = useState<'all' | 'in_table' | 'online'>('all');
  const [loading, setLoading] = useState(false);

  // Data States
  const [players, setPlayers] = useState<PlayerAdminData[]>([]);
  const [tables, setTables] = useState<TableAdminData[]>([]);

  // Coin Adjustment Modal / Panel State
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerAdminData | null>(null);
  const [coinInputAmount, setCoinInputAmount] = useState<string>('25000');
  const [coinAdjustmentMode, setCoinAdjustmentMode] = useState<'grant' | 'deduct' | 'set'>('grant');
  const [coinReason, setCoinReason] = useState<string>('Admin Treasury Grant');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Broadcast Message State
  const [broadcastTitle, setBroadcastTitle] = useState('Announcement');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastType, setBroadcastType] = useState<'info' | 'success' | 'warning'>('info');

  // Airdrop State
  const [airdropAmount, setAirdropAmount] = useState<string>('25000');
  const [airdropTarget, setAirdropTarget] = useState<'online' | 'all'>('online');
  const [airdropReason, setAirdropReason] = useState<string>('Festival Celebration Gift');

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

  // Load data on open
  useEffect(() => {
    if (isOpen) {
      fetchPlayers();
      fetchTables();
    }
  }, [isOpen, fetchPlayers, fetchTables]);

  // Real-time socket sync for live player coin updates across sessions
  useEffect(() => {
    if (!socket) return;

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

    socket.on('user:coins_changed', handleCoinsChanged);
    socket.on('rooms:updated', handleRoomsUpdated);

    return () => {
      socket.off('user:coins_changed', handleCoinsChanged);
      socket.off('rooms:updated', handleRoomsUpdated);
    };
  }, [socket, selectedPlayer, fetchTables]);

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
        if (targetPlayer.id === currentUser.id && onUpdateCurrentUserCoins) {
          onUpdateCurrentUserCoins(data.newBalance);
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

  // Filtered Players (without admins filter tab)
  const filteredPlayers = players.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      p.username.toLowerCase().includes(q) ||
      (p.email && p.email.toLowerCase().includes(q)) ||
      p.id.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (filterPresence === 'in_table') return p.presence === 'in_table';
    if (filterPresence === 'online') return p.presence !== 'offline';
    return true;
  });

  if (!isOpen) return null;

  return (
    <div
      id="admin-panel-modal-backdrop"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div
        id="admin-panel-card"
        className="w-full max-w-2xl sm:max-w-3xl h-[540px] max-h-[88vh] rounded-3xl bg-gradient-to-b from-[#0f172a] via-[#090e1c] to-[#04060d] border border-amber-500/40 shadow-2xl shadow-black/95 flex flex-col overflow-hidden text-slate-100 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Stylized Top of Panel with title "Admin" */}
        <div className="relative px-4 sm:px-5 py-3.5 bg-gradient-to-r from-[#18233c] via-[#11192e] to-[#0b101e] border-b border-amber-500/30 shrink-0 overflow-hidden">
          {/* Subtle Ambient Gold Glow Effect */}
          <div className="absolute top-0 left-1/4 w-1/2 h-full bg-gradient-to-r from-amber-500/10 via-amber-400/15 to-transparent blur-xl pointer-events-none" />

          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Shimmering Gilded Badge */}
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-950/80 border border-amber-300/60 shrink-0">
                <Crown className="w-5 h-5 text-slate-950 fill-slate-950" />
              </div>

              <div>
                <h2 className="font-serif font-black text-lg sm:text-xl text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-amber-300 to-amber-500 tracking-wide drop-shadow-sm">
                  Admin
                </h2>
              </div>
            </div>

            <button
              onClick={() => {
                sound.playChipSound();
                onClose();
              }}
              className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/70 transition-all active:scale-95 cursor-pointer shadow-sm"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. Streamlined Tab Navigation Bar with Compact Badges */}
        <div className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-950/90 border-b border-slate-800 shrink-0 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('players')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 cursor-pointer ${
              activeTab === 'players'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold shadow-md shadow-amber-950/50'
                : 'text-slate-400 hover:text-amber-200 hover:bg-slate-900/60'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Players</span>
            <span
              className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-mono font-black rounded-full ${
                activeTab === 'players'
                  ? 'bg-slate-950/30 text-slate-950'
                  : 'bg-slate-800 text-amber-300'
              }`}
            >
              {players.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('tables');
              fetchTables();
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 cursor-pointer ${
              activeTab === 'tables'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold shadow-md shadow-amber-950/50'
                : 'text-slate-400 hover:text-amber-200 hover:bg-slate-900/60'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Tables</span>
            <span
              className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-mono font-black rounded-full ${
                activeTab === 'tables'
                  ? 'bg-slate-950/30 text-slate-950'
                  : 'bg-slate-800 text-amber-300'
              }`}
            >
              {tables.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('broadcast')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 cursor-pointer ${
              activeTab === 'broadcast'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold shadow-md shadow-amber-950/50'
                : 'text-slate-400 hover:text-amber-200 hover:bg-slate-900/60'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Broadcast</span>
          </button>
        </div>

        {/* 3. Main Scrollable Content Area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3">
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
                    All ({players.length})
                  </button>
                  <button
                    onClick={() => setFilterPresence('in_table')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      filterPresence === 'in_table'
                        ? 'bg-emerald-500/25 text-emerald-300 font-bold border border-emerald-500/40'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    In Table ({players.filter((p) => p.presence === 'in_table').length})
                  </button>
                  <button
                    onClick={() => setFilterPresence('online')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      filterPresence === 'online'
                        ? 'bg-sky-500/25 text-sky-300 font-bold border border-sky-500/40'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Online ({players.filter((p) => p.presence !== 'offline').length})
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

              {/* Player Cards List */}
              <div className="space-y-1.5">
                {filteredPlayers.length === 0 ? (
                  <div className="py-8 text-center rounded-xl bg-slate-900/40 border border-slate-800/80 text-slate-400 text-xs">
                    No players found matching search.
                  </div>
                ) : (
                  filteredPlayers.map((player) => (
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

                      {/* Right: Coin Action Button & Admin Toggle */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Dedicated Coin Management Button that opens the Add/Deduct Panel */}
                        <button
                          onClick={() => {
                            setSelectedPlayer(player);
                            setCoinInputAmount('25000');
                            setCoinAdjustmentMode('grant');
                            setCoinReason('Admin Treasury Grant');
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-amber-600/30 hover:from-amber-500/30 hover:to-amber-600/40 text-amber-300 border border-amber-500/40 text-xs font-mono font-bold active:scale-95 transition-all shadow-sm cursor-pointer"
                        >
                          <Coins className="w-3.5 h-3.5 text-amber-400" />
                          <span>Adjust Coins</span>
                        </button>

                        <button
                          onClick={() => handleToggleAdminStatus(player)}
                          title={player.isAdmin ? 'Revoke Admin Privileges' : 'Grant Admin Privileges'}
                          disabled={actionInProgress === player.id}
                          className={`p-1.5 rounded-xl border transition-all active:scale-95 cursor-pointer ${
                            player.isAdmin
                              ? 'bg-purple-950/60 border-purple-500/40 text-purple-300'
                              : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-amber-300'
                          }`}
                        >
                          <Crown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 2: TABLES & PURGE */}
          {activeTab === 'tables' && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-semibold text-amber-200">
                  Tables ({tables.length})
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
                    onClick={fetchTables}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 text-xs font-semibold transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {tables.length === 0 ? (
                  <div className="py-10 text-center rounded-xl bg-slate-900/40 border border-slate-800/80 text-slate-400 text-xs space-y-1">
                    <p className="text-slate-300 font-semibold">No active tables running.</p>
                    <p className="text-[11px] text-slate-500">All redundant or closed tables have been purged.</p>
                  </div>
                ) : (
                  tables.map((t) => (
                    <div
                      key={t.id}
                      className="p-3 rounded-xl bg-slate-900/80 border border-amber-500/20 shadow space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-xs px-2 py-0.5 rounded bg-amber-500 text-slate-950">
                            {t.code}
                          </span>
                          <span className="font-serif font-bold text-xs text-amber-200">
                            {t.name}
                          </span>
                          <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                            Host: {t.hostName}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 font-mono text-[10px]">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-bold">
                            {t.phase.toUpperCase()} ({t.timer}s)
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                            👥 {t.realPlayerCount} real / {t.playerCount} total
                          </span>
                        </div>
                      </div>

                      {/* Betting Pool Distribution */}
                      <div className="grid grid-cols-6 gap-1 pt-1 border-t border-slate-800/60">
                        {SYMBOL_KEYS.map((sym) => {
                          const config = LANGUR_BURJA_SYMBOLS[sym];
                          const betOnSym = t.tableBets?.[sym] || 0;
                          return (
                            <div
                              key={sym}
                              className="p-1 rounded bg-slate-950/80 border border-slate-800/80 text-center"
                            >
                              <div className="text-xs">{config.symbolChar}</div>
                              <div className={`text-[9px] font-mono ${betOnSym > 0 ? 'text-amber-300 font-bold' : 'text-slate-500'}`}>
                                {betOnSym > 0 ? `${(betOnSym / 1000).toFixed(0)}k` : '0'}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
                        <span className="text-[10px] font-mono text-slate-400">
                          Total Pool: <strong className="text-amber-300">{t.totalRoundBets.toLocaleString()} 🪙</strong>
                        </span>

                        <div className="flex items-center gap-1.5">
                          {t.phase === 'betting' && (
                            <button
                              onClick={() => handleTableAction(t.id, 'roll_now')}
                              disabled={actionInProgress === t.id}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] shadow active:scale-95 transition-all cursor-pointer"
                            >
                              <Play className="w-3 h-3 fill-slate-950" />
                              <span>Roll Now</span>
                            </button>
                          )}

                          {t.phase === 'payout' && (
                            <button
                              onClick={() => handleTableAction(t.id, 'next_round')}
                              disabled={actionInProgress === t.id}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] shadow active:scale-95 transition-all cursor-pointer"
                            >
                              <ChevronRight className="w-3 h-3" />
                              <span>Advance</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleTableAction(t.id, 'delete')}
                            disabled={actionInProgress === t.id}
                            title="Delete this row from Supabase game_tables and disband active room"
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-200 hover:text-white font-bold text-[11px] transition-all active:scale-95 cursor-pointer shadow-sm"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                            <span>Delete Row</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
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
      </div>
    </div>
  );
};
