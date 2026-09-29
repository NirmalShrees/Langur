import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { RoomState } from '../types.js';

export interface TablePlayerRecord {
  id: string;
  username: string;
  avatar: string;
  isHost: boolean;
  coins: number;
  joinedAt: number;
  initialCoins?: number;
  roundsPlayed: number;
  roundsWon: number;
  winRate: number;
  totalBet: number;
  totalWon: number;
  netProfit: number;
  biggestWin: number;
  lastActive: number;
  history: any[];
}

export interface GameTableRecord {
  id: string;
  code: string;
  name: string;
  host_id: string;
  host_name: string;
  status: 'waiting' | 'active' | 'closed' | 'pending_approval';
  approval_status?: 'pending' | 'approved' | 'declined';
  is_private: boolean;
  betting_duration: number;
  player_count: number;
  expires_at?: string;
  player_stats?: any[];
  history?: any[];
  table_stats?: {
    totalRounds: number;
    totalBets: number;
    totalPayouts: number;
    highestRoundPool?: number;
    biggestWinner?: { username: string; amount: number; roundNumber: number };
  };
  approval_meta?: {
    admin_id?: string;
    admin_name?: string;
    message?: string;
    approved_at?: string;
  };
  created_at?: string;
  updated_at?: string;

  // Legacy fallback fields (optional for backward compatibility)
  leader_id?: string;
  leader_name?: string;
  approved?: boolean;
  approved_by_admin_id?: string;
  approved_by_admin_name?: string;
  admin_approval_message?: string;
  approved_at?: string;
  players?: TablePlayerRecord[];
  validity_hours?: number;
  validity_days?: number;
}

/**
 * Records a newly created game table and its unique private code in Supabase game_tables.
 */
export async function recordTableInSupabase(table: {
  id: string;
  code: string;
  name: string;
  leaderId?: string;
  leaderName?: string;
  hostId: string;
  hostName: string;
  approvedByAdminId?: string;
  approvedByAdminName?: string;
  adminApprovalMessage?: string;
  approvedAt?: string;
  isPrivate: boolean;
  bettingDuration: number;
  playerCount?: number;
  status?: 'waiting' | 'active' | 'closed';
  players?: any[];
  validityHours?: number;
  validityDays?: number;
  expiresAt?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: true };
  }

  try {
    const validityHours = table.validityHours || (table.validityDays ? table.validityDays * 24 : 24);
    const validityDays = Math.max(1, Math.ceil(validityHours / 24));
    const expiresAt = table.expiresAt || new Date(Date.now() + validityHours * 60 * 60 * 1000).toISOString();

    const playerStats = (table.players || []).map((p: any) => ({
      id: p.id,
      username: p.username,
      avatar: p.avatar,
      coins: p.coins,
      isHost: Boolean(p.isHost || p.id === table.hostId),
      roundsPlayed: p.sessionStats?.roundsPlayed || 0,
      roundsWon: p.sessionStats?.roundsWon || 0,
      winRate: p.sessionStats?.winRate || 0,
      totalBet: p.sessionStats?.totalBet || 0,
      totalWon: p.sessionStats?.totalWon || 0,
      netProfit: p.sessionStats?.netProfit || 0,
      biggestWin: p.sessionStats?.biggestWin || 0,
    }));

    const compactPlayers = (table.players || []).map((p: any) => ({
      id: p.id,
      username: p.username,
      avatar: p.avatar,
      coins: p.coins,
      isHost: Boolean(p.isHost || p.id === table.hostId),
      roundsPlayed: p.sessionStats?.roundsPlayed || 0,
      roundsWon: p.sessionStats?.roundsWon || 0,
      winRate: p.sessionStats?.winRate || 0,
      netProfit: p.sessionStats?.netProfit || 0,
    }));

    const isTableApproved = (table as any).approved !== undefined
      ? Boolean((table as any).approved)
      : ((table as any).approval_status === 'approved' || (table as any).approvalStatus === 'approved' || !table.status || table.status === 'waiting' || table.status === 'active');

    const approvalStatus = (table as any).approval_status || (table as any).approvalStatus || (isTableApproved ? 'approved' : 'pending');

    const approvalMeta = {
      admin_id: table.approvedByAdminId || (table as any).approval_meta?.admin_id,
      admin_name: table.approvedByAdminName || (table as any).approval_meta?.admin_name,
      message: table.adminApprovalMessage || (table as any).approval_meta?.message,
      approved_at: table.approvedAt || (table as any).approval_meta?.approved_at || (isTableApproved ? new Date().toISOString() : undefined),
    };

    const payload: Record<string, any> = {
      id: table.id,
      code: table.code.trim().toUpperCase(),
      name: table.name.trim(),
      host_id: table.hostId,
      host_name: table.hostName,
      status: table.status || (isTableApproved ? 'waiting' : 'pending_approval'),
      approval_status: approvalStatus,
      is_private: table.isPrivate,
      betting_duration: table.bettingDuration,
      player_count: table.playerCount || 0,
      expires_at: expiresAt,
      player_stats: playerStats,
      history: [],
      table_stats: { totalRounds: 0, totalBets: 0, totalPayouts: 0 },
      approval_meta: approvalMeta,
      updated_at: new Date().toISOString(),
    };

    let { error } = await supabase.from('game_tables').upsert(payload, { onConflict: 'id' });
    if (error && error.message?.toLowerCase().includes('approval_meta')) {
      delete payload.approval_meta;
      const retry = await supabase.from('game_tables').upsert(payload, { onConflict: 'id' });
      error = retry.error;
    }

    if (error) {
      console.warn('[TableService] Supabase recordTable notice:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.warn('[TableService] Supabase recordTable exception:', err);
    return { success: false, error: err?.message || 'Failed to record table' };
  }
}

/**
 * Updates an active table's player count, players roster, history, or status in Supabase.
 */
export async function updateTableInSupabase(
  roomId: string,
  updates: {
    playerCount?: number;
    status?: 'waiting' | 'active' | 'closed';
    name?: string;
    players?: any[];
    history?: any[];
    table_stats?: any;
  }
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: true };
  }

  try {
    const patch: any = {
      updated_at: new Date().toISOString(),
    };
    if (typeof updates.playerCount === 'number') {
      patch.player_count = updates.playerCount;
    }
    if (updates.status) {
      patch.status = updates.status;
    }
    if (updates.name) {
      patch.name = updates.name;
    }
    if (updates.players) {
      patch.players = updates.players;
    }
    if (updates.history) {
      patch.history = updates.history;
    }
    if (updates.table_stats) {
      patch.table_stats = updates.table_stats;
    }

    const { error } = await supabase
      .from('game_tables')
      .update(patch)
      .eq('id', roomId);

    if (error) {
      console.warn('[TableService] Supabase updateTable notice:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.warn('[TableService] Supabase updateTable exception:', err);
    return { success: false, error: err?.message };
  }
}

/**
 * Syncs full table state including all players, win rates, session history, and table stats to Supabase.
 */
export async function syncTableStateToSupabase(room: RoomState): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: true };
  }

  try {
    const rawPlayers = Object.values(room.players || {});
    if (rawPlayers.length === 0) {
      await deleteTableFromSupabase(room.id);
      return { success: true };
    }

    const playersList: TablePlayerRecord[] = rawPlayers.map((p) => ({
      id: p.id,
      username: p.username,
      avatar: p.avatar,
      isHost: Boolean(p.isHost || p.id === room.hostId),
      coins: p.coins,
      joinedAt: p.sessionStats?.joinedAt || Date.now(),
      initialCoins: p.sessionStats?.initialCoins ?? p.coins,
      roundsPlayed: p.sessionStats?.roundsPlayed || 0,
      roundsWon: p.sessionStats?.roundsWon || 0,
      winRate: p.sessionStats?.winRate || 0,
      totalBet: p.sessionStats?.totalBet || 0,
      totalWon: p.sessionStats?.totalWon || 0,
      netProfit: p.sessionStats?.netProfit || 0,
      biggestWin: p.sessionStats?.biggestWin || 0,
      lastActive: p.lastActive || Date.now(),
      history: p.sessionStats?.history || [],
    }));

    // Generate compact player stats for easy inspection in Supabase table
    const playerStats = playersList.map((p) => ({
      id: p.id,
      username: p.username,
      avatar: p.avatar,
      coins: p.coins,
      isHost: p.isHost,
      roundsPlayed: p.roundsPlayed,
      roundsWon: p.roundsWon,
      winRate: p.winRate,
      totalBet: p.totalBet,
      totalWon: p.totalWon,
      netProfit: p.netProfit,
      biggestWin: p.biggestWin,
      lastActive: p.lastActive,
    }));

    // Compact players roster without bulky 25-round deep history arrays
    const compactPlayers = playersList.map((p) => ({
      id: p.id,
      username: p.username,
      avatar: p.avatar,
      coins: p.coins,
      isHost: p.isHost,
      roundsPlayed: p.roundsPlayed,
      roundsWon: p.roundsWon,
      winRate: p.winRate,
      netProfit: p.netProfit,
    }));

    // Compact history: keep latest 15 rounds
    const compactHistory = (room.history || []).slice(0, 15).map((h) => ({
      roundNumber: h.roundNumber,
      dice: h.dice,
      symbolCounts: h.symbolCounts,
      winningSymbols: h.winningSymbols,
      totalTableBets: h.totalTableBets,
      totalTablePayouts: h.totalTablePayouts,
      timestamp: h.timestamp,
    }));

    const compactTableStats = {
      totalRounds: room.tableStats?.totalRounds || Math.max(0, room.roundNumber - 1),
      totalBets: room.tableStats?.totalBets || 0,
      totalPayouts: room.tableStats?.totalPayouts || 0,
      highestRoundPool: room.tableStats?.highestRoundPool || 0,
      biggestWinner: room.tableStats?.biggestWinner,
    };

    const payload: Record<string, any> = {
      id: room.id,
      code: room.code.trim().toUpperCase(),
      name: room.name.trim(),
      host_id: room.hostId,
      host_name: room.players[room.hostId]?.username || 'Host',
      status: room.phase === 'waiting' ? 'waiting' : 'active',
      approval_status: 'approved',
      is_private: room.isPrivate,
      betting_duration: room.settings.bettingDuration,
      player_count: playersList.length,
      player_stats: playerStats,
      history: compactHistory,
      table_stats: compactTableStats,
      updated_at: new Date().toISOString(),
    };

    let { error } = await supabase.from('game_tables').upsert(payload, { onConflict: 'id' });
    if (error && (error.message?.toLowerCase().includes('player_stats') || error.code === 'PGRST204')) {
      delete payload.player_stats;
      const retry = await supabase.from('game_tables').upsert(payload, { onConflict: 'id' });
      error = retry.error;
    }

    if (error) {
      console.warn('[TableService] syncTableStateToSupabase notice:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.warn('[TableService] syncTableStateToSupabase exception:', err);
    return { success: false, error: err?.message };
  }
}

/**
 * Marks a game table as closed in Supabase when all players leave or the game terminates.
 */
export async function closeTableInSupabase(roomId: string): Promise<{ success: boolean; error?: string }> {
  return updateTableInSupabase(roomId, { status: 'closed', playerCount: 0 });
}

/**
 * Permanently deletes a game table from Supabase game_tables.
 * Also tries deleting by code or sending a fallback delete request to the server.
 */
export async function deleteTableFromSupabase(roomId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. If Supabase client configured, delete directly from database
    if (isSupabaseConfigured() && supabase) {
      await supabase.from('game_tables').update({ status: 'closed', player_count: 0, players: [], player_stats: [] }).eq('id', roomId);
      await supabase.from('game_tables').delete().eq('id', roomId);
      await supabase.from('game_tables').delete().eq('code', roomId);
    }

    // 2. Also notify backend API to delete from server memory and Supabase with service role
    fetch(`/api/admin/tables/${roomId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'terminate' }),
    }).catch(() => {});

    console.log(`[TableService] Table ${roomId} permanently deleted.`);
    return { success: true };
  } catch (err: any) {
    console.warn('[TableService] deleteTableFromSupabase exception:', err);
    return { success: false, error: err?.message };
  }
}

/**
 * Sweeps and purges all tables whose time has expired or have closed status from Supabase.
 * Tables that have not expired stay active even with 0 players until their time runs out.
 */
export async function deleteZeroPlayerTablesFromSupabase(): Promise<number> {
  let purged = 0;

  // 1. Direct Supabase Client Query
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data: allTables } = await supabase
        .from('game_tables')
        .select('id, code, player_count, status, expires_at');

      if (allTables && allTables.length > 0) {
        const nowMs = Date.now();
        const expiredIds = allTables
          .filter((t) => {
            if (t.id === 'public-royal-table') return true;
            if (t.status === 'closed') return true;
            if (t.expires_at && new Date(t.expires_at).getTime() < nowMs) return true;
            return false;
          })
          .map((t) => t.id);

        if (expiredIds.length > 0) {
          await supabase
            .from('game_tables')
            .update({ status: 'closed', player_count: 0, players: [], player_stats: [] })
            .in('id', expiredIds);

          const { data: deletedRows } = await supabase
            .from('game_tables')
            .delete()
            .in('id', expiredIds)
            .select('id');

          if (deletedRows) {
            purged += deletedRows.length;
          } else {
            purged += expiredIds.length;
          }
        }
      }

      // Remove legacy royal table
      await supabase.from('game_tables').delete().eq('id', 'public-royal-table');
    } catch (err) {
      console.warn('[TableService] deleteZeroPlayerTablesFromSupabase client notice:', err);
    }
  }

  // 2. Also execute server-side cleanup
  try {
    const res = await fetch('/api/tables/cleanup', { method: 'POST' });
    const json = await res.json();
    if (json?.gcResult?.purgedSupabaseTables) {
      purged = Math.max(purged, json.gcResult.purgedSupabaseTables);
    }
  } catch {}

  if (purged > 0) {
    console.log(`[TableService] Purged ${purged} expired tables from Supabase.`);
  }
  return purged;
}

/**
 * Updates host info in Supabase during Host Migration.
 */
export async function updateTableHostInSupabase(
  roomId: string,
  newHostId: string,
  newHostName: string,
  playerCount: number
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: true };
  }

  try {
    const { error } = await supabase
      .from('game_tables')
      .update({
        host_id: newHostId,
        host_name: newHostName,
        player_count: playerCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', roomId);

    if (error) {
      console.warn('[TableService] updateTableHostInSupabase notice:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Looks up a running game table in Supabase by its 6-character private code (waiting or active).
 * Supports fuzzy matching for '0' (zero) and 'O' (letter O) to prevent typing confusion.
 */
export async function findTableByCodeInSupabase(code: string): Promise<{
  success: boolean;
  table?: GameTableRecord;
  error?: string;
}> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Supabase is not configured' };
  }

  try {
    const cleanCode = code.trim().toUpperCase();

    // 1. Exact match query
    let { data, error } = await supabase
      .from('game_tables')
      .select('*')
      .eq('code', cleanCode)
      .in('status', ['waiting', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 2. Fuzzy 0 vs O matching if not found
    if (!data && (cleanCode.includes('0') || cleanCode.includes('O'))) {
      const altCode = cleanCode.includes('0')
        ? cleanCode.replace(/0/g, 'O')
        : cleanCode.replace(/O/g, '0');

      const altRes = await supabase
        .from('game_tables')
        .select('*')
        .eq('code', altCode)
        .in('status', ['waiting', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (altRes.data) {
        data = altRes.data;
        error = null;
      }
    }

    // 3. If still not found, check recently created tables to support rejoining after quick reloads
    if (!data) {
      const recentRes = await supabase
        .from('game_tables')
        .select('*')
        .eq('code', cleanCode)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentRes.data) {
        data = recentRes.data;
        error = null;
      }
    }

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: 'No table found for this code. Please check the code and try again.' };
    }

    return { success: true, table: data as GameTableRecord };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed querying table' };
  }
}

/**
 * Looks up a game table in Supabase by its unique table ID.
 */
export async function findTableByIdInSupabase(roomId: string): Promise<{
  success: boolean;
  table?: GameTableRecord;
  error?: string;
}> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Supabase is not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('game_tables')
      .select('*')
      .eq('id', roomId)
      .limit(1)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: 'Table not found in database.' };
    }

    return { success: true, table: data as GameTableRecord };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed querying table by ID' };
  }
}

/**
 * Retrieves all currently open public game tables from Supabase (waiting or active) with active players.
 */
export async function fetchRunningTablesFromSupabase(): Promise<{
  success: boolean;
  tables: GameTableRecord[];
  error?: string;
}> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, tables: [] };
  }

  try {
    const { data, error } = await supabase
      .from('game_tables')
      .select('*')
      .eq('is_private', false)
      .neq('status', 'closed')
      .gt('player_count', 0)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) {
      console.warn('[TableService] fetchRunningTablesFromSupabase error:', error.message);
      return { success: false, tables: [], error: error.message };
    }

    const nowMs = Date.now();
    const publicTables = ((data as GameTableRecord[]) || []).filter(
      (t) =>
        !t.is_private &&
        t.status !== 'closed' &&
        (!t.expires_at || new Date(t.expires_at).getTime() > nowMs) &&
        t.id !== 'public-royal-table' &&
        t.code !== 'ROYAL1' &&
        t.host_id !== 'system'
    );

    return { success: true, tables: publicTables };
  } catch (err: any) {
    console.warn('[TableService] fetchRunningTablesFromSupabase exception:', err);
    return { success: false, tables: [], error: err?.message };
  }
}

/**
 * Fetches all active & saved tables created by a specific user from server and Supabase game_tables.
 * Automatically filters out expired tables.
 */
export async function fetchUserCreatedTablesFromSupabase(userId: string): Promise<{
  success: boolean;
  tables: GameTableRecord[];
  error?: string;
}> {
  if (!userId) {
    return { success: false, tables: [] };
  }

  const tablesMap = new Map<string, GameTableRecord>();
  const nowMs = Date.now();

  // 1. Fetch from server API (includes both GameEngine in-memory rooms and Supabase tables)
  try {
    const apiRes = await fetch(`/api/user/${encodeURIComponent(userId)}/tables`, { cache: 'no-store' });
    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data.success && Array.isArray(data.tables)) {
        for (const t of data.tables) {
          if (t && t.id) {
            tablesMap.set(t.id, t as GameTableRecord);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[TableService] Server user tables fetch notice:', err);
  }

  // 2. Fallback / supplementary direct query to Supabase
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data: dbTables, error } = await supabase
        .from('game_tables')
        .select('*')
        .eq('host_id', userId)
        .neq('status', 'closed')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(dbTables)) {
        for (const t of dbTables) {
          if (t && t.id) {
            if (t.expires_at && new Date(t.expires_at).getTime() < nowMs) {
              deleteTableFromSupabase(t.id).catch(() => {});
              continue;
            }
            if (!tablesMap.has(t.id)) {
              tablesMap.set(t.id, t as GameTableRecord);
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('[TableService] fetchUserCreatedTablesFromSupabase direct query exception:', err);
    }
  }

  const activeTables = Array.from(tablesMap.values());
  return { success: true, tables: activeTables };
}

/**
 * Sends a table creation approval request to all Admins with specified table options & hours.
 */
export async function requestTableCreationApproval(params: {
  userId: string;
  username: string;
  tableName?: string;
  isPrivate?: boolean;
  bettingDuration?: number;
  validityHours?: number;
}): Promise<{ success: boolean; message?: string; request?: any; table?: any }> {
  try {
    const res = await fetch('/api/tables/request-approval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    return { success: data.success ?? true, message: data.message, request: data.request, table: data.table };
  } catch (err: any) {
    return { success: true, message: 'Request sent to Administrator!' };
  }
}

/**
 * Fetches pending table creation requests for Admin review.
 */
export async function fetchPendingTableRequests(): Promise<{
  success: boolean;
  requests: any[];
  error?: string;
}> {
  try {
    const res = await fetch('/api/admin/table-requests', { cache: 'no-store' });
    const data = await res.json();
    if (data.success && Array.isArray(data.requests)) {
      return { success: true, requests: data.requests };
    }
    return { success: false, requests: [], error: data.error };
  } catch (err: any) {
    return { success: false, requests: [], error: err?.message };
  }
}

/**
 * Admin decides on a pending table request (Approve or Decline) with custom message & duration.
 */
export async function decideTableRequest(params: {
  requestId: string;
  decision: 'approve' | 'decline';
  adminId: string;
  adminName: string;
  adminMessage?: string;
  validityHours?: number;
}): Promise<{ success: boolean; message: string; table?: any }> {
  try {
    const res = await fetch(`/api/admin/table-requests/${params.requestId}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    return { success: data.success ?? false, message: data.message || '', table: data.table };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network error processing decision' };
  }
}

