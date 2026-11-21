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

export const PRIMARY_TABLE = 'game_tables_data';

/**
 * Normalizes a database row from game_tables_data into GameTableRecord.
 */
export function mapDbRowToGameTableRecord(t: any): GameTableRecord {
  if (!t) return t;
  const config = typeof t.config === 'object' && t.config !== null ? t.config : {};
  const host = typeof config.host === 'object' && config.host !== null ? config.host : {};
  const approval = typeof config.approval === 'object' && config.approval !== null ? config.approval : {};

  const name = t.name || config.name || `Table ${t.code || ''}`;
  const hostId = t.host_id || host.id || t.leader_id || '';
  const hostName = t.host_name || host.name || t.leader_name || 'Host';
  const isPrivate = t.is_private !== undefined ? Boolean(t.is_private) : Boolean(config.is_private);
  const bettingDuration = t.betting_duration || config.betting_duration || 18;

  let approvalStatus = t.approval_status;
  if (!approvalStatus) {
    if (t.status === 'pending_approval') {
      approvalStatus = 'pending';
    } else if (approval.status) {
      approvalStatus = approval.status;
    } else if (approval.admin_id || t.approved === true || t.status === 'active' || t.status === 'waiting') {
      approvalStatus = 'approved';
    } else {
      approvalStatus = 'pending';
    }
  }

  const isApproved = approvalStatus === 'approved' || t.approved === true;

  return {
    id: t.id,
    code: t.code,
    name,
    host_id: hostId,
    host_name: hostName,
    leader_id: hostId,
    leader_name: hostName,
    status: t.status || (isApproved ? 'waiting' : 'pending_approval'),
    approval_status: approvalStatus,
    approved: isApproved,
    is_private: isPrivate,
    betting_duration: bettingDuration,
    player_count: t.player_count !== undefined ? Number(t.player_count) : (Array.isArray(t.player_stats) ? t.player_stats.length : 0),
    expires_at: t.expires_at,
    player_stats: t.player_stats || [],
    history: t.history || [],
    table_stats: t.table_stats || { totalRounds: 0, totalBets: 0, totalPayouts: 0 },
    approval_meta: {
      admin_id: approval.admin_id || t.approved_by_admin_id || t.approval_meta?.admin_id,
      admin_name: approval.admin_name || t.approved_by_admin_name || t.approval_meta?.admin_name,
      message: approval.message || t.admin_approval_message || t.approval_meta?.message,
      approved_at: approval.approved_at || t.approved_at || t.approval_meta?.approved_at,
    },
    created_at: t.created_at,
    updated_at: t.updated_at,
    validity_hours: config.validity_hours || t.validity_hours || (t.validity_days ? t.validity_days * 24 : 24),
    validity_days: t.validity_days || Math.max(1, Math.ceil((config.validity_hours || t.validity_hours || 24) / 24)),
  };
}

/**
 * Records a newly created game table and its unique private code in Supabase game_tables_data.
 */
export async function recordTableInSupabase(table: {
  id: string;
  code: string;
  name?: string;
  tableName?: string;
  hostId?: string;
  host_id?: string;
  hostName?: string;
  host_name?: string;
  leaderId?: string;
  leaderName?: string;
  approvedByAdminId?: string;
  approvedByAdminName?: string;
  adminApprovalMessage?: string;
  approvedAt?: string;
  isPrivate?: boolean;
  is_private?: boolean;
  bettingDuration?: number;
  betting_duration?: number;
  playerCount?: number;
  player_count?: number;
  status?: 'waiting' | 'active' | 'closed' | 'pending_approval' | string;
  approval_status?: 'pending' | 'approved' | 'declined' | string;
  players?: any[];
  player_stats?: any[];
  validityHours?: number;
  validity_hours?: number;
  validityDays?: number;
  validity_days?: number;
  expiresAt?: string;
  expires_at?: string;
  [key: string]: any;
}): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: true };
  }

  try {
    const validityHours = table.validityHours || (table as any).validity_hours || (table.validityDays ? table.validityDays * 24 : 24);
    const expiresAt = (table as any).status === 'pending_approval' || (table as any).approval_status === 'pending'
      ? null
      : (table.expiresAt || (table as any).expires_at || new Date(Date.now() + validityHours * 60 * 60 * 1000).toISOString());
    const nowIso = new Date().toISOString();

    const hostId = table.hostId || (table as any).host_id || table.leaderId || (table as any).leader_id || (table as any).config?.host?.id || '';
    const hostName = table.hostName || (table as any).host_name || table.leaderName || (table as any).leader_name || (table as any).config?.host?.name || 'Host';
    const tableName = (table.name || (table as any).tableName || (table as any).config?.name || `Table ${table.code}`).trim();
    const isPrivate = table.isPrivate !== undefined ? Boolean(table.isPrivate) : ((table as any).is_private !== undefined ? Boolean((table as any).is_private) : Boolean((table as any).config?.is_private));
    const bettingDuration = table.bettingDuration || (table as any).betting_duration || (table as any).config?.betting_duration || 18;

    const rawPlayers = table.players || (table as any).player_stats || (table as any).playerStats || [];
    const playerStats = Array.isArray(rawPlayers) ? rawPlayers.map((p: any) => ({
      id: p.id || '',
      username: p.username || 'Player',
      avatar: p.avatar || '🎲',
      coins: p.coins || 0,
      isHost: Boolean(p.isHost || p.id === hostId),
      roundsPlayed: p.sessionStats?.roundsPlayed || p.roundsPlayed || 0,
      roundsWon: p.sessionStats?.roundsWon || p.roundsWon || 0,
      winRate: p.sessionStats?.winRate || p.winRate || 0,
      totalBet: p.sessionStats?.totalBet || p.totalBet || 0,
      totalWon: p.sessionStats?.totalWon || p.totalWon || 0,
      netProfit: p.sessionStats?.netProfit || p.netProfit || 0,
      biggestWin: p.sessionStats?.biggestWin || p.biggestWin || 0,
    })) : [];

    const isTableApproved = (table as any).approved !== undefined
      ? Boolean((table as any).approved)
      : ((table as any).approval_status === 'approved' || (table as any).approvalStatus === 'approved' || !table.status || table.status === 'waiting' || table.status === 'active');

    const approvalStatus = (table as any).approval_status || (table as any).approvalStatus || (isTableApproved ? 'approved' : 'pending');

    const approvalMeta = {
      admin_id: table.approvedByAdminId || (table as any).approval_meta?.admin_id || (table as any).config?.approval?.admin_id || null,
      admin_name: table.approvedByAdminName || (table as any).approval_meta?.admin_name || (table as any).config?.approval?.admin_name || null,
      message: table.adminApprovalMessage || (table as any).approval_meta?.message || (table as any).config?.approval?.message || null,
      approved_at: table.approvedAt || (table as any).approval_meta?.approved_at || (table as any).config?.approval?.approved_at || (isTableApproved ? nowIso : null),
    };

    // 1. Primary write: game_tables_data (compact layout)
    const primaryPayload: Record<string, any> = {
      id: table.id,
      code: table.code.trim().toUpperCase(),
      name: tableName,
      status: table.status || (isTableApproved ? 'waiting' : 'pending_approval'),
      player_count: table.playerCount !== undefined ? table.playerCount : ((table as any).player_count !== undefined ? (table as any).player_count : playerStats.length),
      expires_at: expiresAt,
      config: {
        is_private: isPrivate,
        betting_duration: bettingDuration,
        validity_hours: validityHours,
        host: {
          id: hostId,
          name: hostName,
        },
        approval: {
          admin_id: approvalMeta.admin_id,
          admin_name: approvalMeta.admin_name,
          approved_at: approvalMeta.approved_at,
          message: approvalMeta.message,
        },
      },
      player_stats: playerStats,
      history: (table as any).history || [],
      table_stats: (table as any).table_stats || { totalBets: 0, totalRounds: 0, totalPayouts: 0 },
      created_at: (table as any).created_at || nowIso,
      updated_at: nowIso,
    };

    const { error: primaryErr } = await supabase.from(PRIMARY_TABLE).upsert(primaryPayload, { onConflict: 'id' });
    if (primaryErr) {
      if (primaryErr.code === '42501') {
        console.error(`[TableService] RLS Policy Error (42501) on ${PRIMARY_TABLE}: Supabase blocked the insert/update because Row-Level Security policies are missing. Please execute the RLS policies query in your Supabase SQL Editor.`);
      } else {
        console.warn(`[TableService] ${PRIMARY_TABLE} recordTable notice:`, primaryErr.message);
      }
      return { success: false, error: primaryErr.message };
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
    player_stats?: any[];
    history?: any[];
    table_stats?: any;
    expires_at?: string | null;
  }
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: true };
  }

  try {
    const nowIso = new Date().toISOString();

    const primaryPatch: any = { updated_at: nowIso };
    if (typeof updates.playerCount === 'number') primaryPatch.player_count = updates.playerCount;
    if (updates.status) primaryPatch.status = updates.status;
    if (updates.history) primaryPatch.history = updates.history;
    if (updates.table_stats) primaryPatch.table_stats = updates.table_stats;
    if (updates.expires_at !== undefined) primaryPatch.expires_at = updates.expires_at;

    if (updates.player_stats) {
      primaryPatch.player_stats = updates.player_stats;
    } else if (updates.players) {
      primaryPatch.player_stats = updates.players.map((p: any) => ({
        id: p.id,
        username: p.username || 'Player',
        avatar: p.avatar || '🎲',
        coins: p.coins || 0,
        isHost: Boolean(p.isHost),
        roundsPlayed: p.sessionStats?.roundsPlayed || p.roundsPlayed || 0,
        roundsWon: p.sessionStats?.roundsWon || p.roundsWon || 0,
        winRate: p.sessionStats?.winRate || p.winRate || 0,
        totalBet: p.sessionStats?.totalBet || p.totalBet || 0,
        totalWon: p.sessionStats?.totalWon || p.totalWon || 0,
        netProfit: p.sessionStats?.netProfit || p.netProfit || 0,
        biggestWin: p.sessionStats?.biggestWin || p.biggestWin || 0,
        lastActive: p.lastActive || Date.now(),
      }));
    }

    if (updates.name) {
      primaryPatch.name = updates.name.trim();
    }

    const { error } = await supabase.from(PRIMARY_TABLE).update(primaryPatch).eq('id', roomId);
    if (error) {
      console.warn(`[TableService] ${PRIMARY_TABLE} updateTable notice:`, error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.warn('[TableService] Supabase updateTable exception:', err);
    return { success: false, error: err?.message };
  }
}

/**
 * Syncs full table state including all players, win rates, session history, and table stats to Supabase game_tables_data.
 */
export async function syncTableStateToSupabase(room: RoomState): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: true };
  }

  try {
    const rawPlayers = Object.values(room.players || {}).filter((p) => {
      const idLower = String(p?.id || '').toLowerCase();
      return (
        idLower &&
        !idLower.startsWith('patron_') &&
        !idLower.startsWith('bot_') &&
        !idLower.startsWith('bot-') &&
        !idLower.startsWith('smart_') &&
        !idLower.startsWith('seed-') &&
        !idLower.startsWith('seed_') &&
        !idLower.startsWith('ai_') &&
        !idLower.startsWith('system') &&
        !(p as any)?.isBot
      );
    });
    if (rawPlayers.length === 0) {
      await deleteTableFromSupabase(room.id);
      return { success: true };
    }

    const validityHours = (room as any).validityHours || (room as any).validity_hours || (room.validityDays ? room.validityDays * 24 : 24);
    const expiresAt = room.expiresAt
      ? (typeof room.expiresAt === 'number' ? new Date(room.expiresAt).toISOString() : room.expiresAt)
      : (room.expires_at || new Date(Date.now() + validityHours * 60 * 60 * 1000).toISOString());

    // Generate compact player stats for easy inspection
    const playerStats = rawPlayers.map((p) => {
      const stats = p.sessionStats;
      const roundsPlayed = stats?.roundsPlayed || 0;
      const roundsWon = stats?.roundsWon || 0;
      const winRate = stats?.winRate ?? (roundsPlayed > 0 ? Math.round((roundsWon / roundsPlayed) * 100) : 0);
      return {
        id: p.id,
        username: p.username || 'Player',
        avatar: p.avatar || '🎲',
        coins: p.coins,
        isHost: Boolean(p.isHost || p.id === room.hostId),
        roundsPlayed,
        roundsWon,
        winRate,
        totalBet: stats?.totalBet || 0,
        totalWon: stats?.totalWon || 0,
        netProfit: stats?.netProfit || 0,
        biggestWin: stats?.biggestWin || 0,
        lastActive: p.lastActive || Date.now(),
      };
    });

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

    const hostName = room.players[room.hostId]?.username || (room as any).host_name || 'Host';
    const nowIso = new Date().toISOString();

    // 1. Primary write: game_tables_data (compact layout)
    const primaryPayload: Record<string, any> = {
      id: room.id,
      code: room.code.trim().toUpperCase(),
      name: room.name.trim(),
      status: room.phase === 'waiting' ? 'waiting' : 'active',
      player_count: rawPlayers.length,
      expires_at: expiresAt,
      config: {
        is_private: room.isPrivate,
        betting_duration: room.settings.bettingDuration,
        validity_hours: validityHours,
        host: {
          id: room.hostId,
          name: hostName,
        },
        approval: {
          admin_id: (room as any).approvedByAdminId || (room as any).approved_by_admin_id || null,
          admin_name: (room as any).approvedByAdminName || (room as any).approved_by_admin_name || null,
          approved_at: (room as any).approvedAt || (room as any).approved_at || nowIso,
        },
      },
      player_stats: playerStats,
      history: compactHistory,
      table_stats: compactTableStats,
      updated_at: nowIso,
    };

    const { error: primaryErr } = await supabase.from(PRIMARY_TABLE).upsert(primaryPayload, { onConflict: 'id' });
    if (primaryErr) {
      console.warn(`[TableService] ${PRIMARY_TABLE} sync notice:`, primaryErr.message);
      return { success: false, error: primaryErr.message };
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
 * Permanently deletes a game table from Supabase game_tables_data.
 * Also tries deleting by code or sending a fallback delete request to the server.
 */
export async function deleteTableFromSupabase(roomId: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (isSupabaseConfigured() && supabase) {
      await supabase.from(PRIMARY_TABLE).update({ status: 'closed', player_count: 0 }).eq('id', roomId);
      await supabase.from(PRIMARY_TABLE).delete().eq('id', roomId);
      await supabase.from(PRIMARY_TABLE).delete().eq('code', roomId);
    }

    // 2. Also notify backend API to delete from server memory and Supabase on server
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
      const nowMs = Date.now();

      // Sweep primary table
      const { data: primaryTables } = await supabase
        .from(PRIMARY_TABLE)
        .select('id, code, player_count, status, expires_at');

      if (primaryTables && primaryTables.length > 0) {
        const expiredIds = primaryTables
          .filter((t) => {
            if (t.id === 'public-royal-table') return true;
            if (t.status === 'closed') return true;
            if (t.expires_at && new Date(t.expires_at).getTime() < nowMs) return true;
            return false;
          })
          .map((t) => t.id);

        if (expiredIds.length > 0) {
          await supabase.from(PRIMARY_TABLE).update({ status: 'closed', player_count: 0 }).in('id', expiredIds);
          const { data: delRows } = await supabase.from(PRIMARY_TABLE).delete().in('id', expiredIds).select('id');
          purged += delRows?.length || expiredIds.length;
        }
      }

      // Remove test royal table
      try {
        await supabase.from(PRIMARY_TABLE).delete().eq('id', 'public-royal-table');
      } catch {}
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
 * Updates host info in Supabase game_tables_data during Host Migration.
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
    const nowIso = new Date().toISOString();

    const { data: cur } = await supabase.from(PRIMARY_TABLE).select('config').eq('id', roomId).maybeSingle();
    const existingConfig = typeof cur?.config === 'object' && cur?.config !== null ? cur.config : {};
    const updatedConfig = {
      ...existingConfig,
      host: { id: newHostId, name: newHostName },
    };
    await supabase.from(PRIMARY_TABLE).update({
      config: updatedConfig,
      player_count: playerCount,
      updated_at: nowIso,
    }).eq('id', roomId);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Looks up a running game table in Supabase game_tables_data by its 6-character private code (waiting or active).
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

    // 1. Exact match query in primary table: game_tables_data
    let { data, error } = await supabase
      .from(PRIMARY_TABLE)
      .select('*')
      .eq('code', cleanCode)
      .in('status', ['waiting', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 2. Fuzzy 0 vs O matching in primary table if not found
    if (!data && (cleanCode.includes('0') || cleanCode.includes('O'))) {
      const altCode = cleanCode.includes('0')
        ? cleanCode.replace(/0/g, 'O')
        : cleanCode.replace(/O/g, '0');

      const altRes = await supabase
        .from(PRIMARY_TABLE)
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

    // 3. If still not found, check recently created tables to support rejoining
    if (!data) {
      const recentPrimary = await supabase
        .from(PRIMARY_TABLE)
        .select('*')
        .eq('code', cleanCode)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentPrimary.data) {
        data = recentPrimary.data;
        error = null;
      }
    }

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: 'No table found for this code. Please check the code and try again.' };
    }

    return { success: true, table: mapDbRowToGameTableRecord(data) };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed querying table' };
  }
}

/**
 * Looks up a game table in Supabase game_tables_data by its unique table ID.
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
      .from(PRIMARY_TABLE)
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

    return { success: true, table: mapDbRowToGameTableRecord(data) };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed querying table by ID' };
  }
}

/**
 * Retrieves all currently open public game tables from Supabase game_tables_data (waiting or active) with active players.
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
    const nowMs = Date.now();
    const tablesMap = new Map<string, GameTableRecord>();

    const { data: primaryData } = await supabase
      .from(PRIMARY_TABLE)
      .select('*')
      .neq('status', 'closed')
      .gte('player_count', 0)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (primaryData && Array.isArray(primaryData)) {
      for (const raw of primaryData) {
        const t = mapDbRowToGameTableRecord(raw);
        if (!t || !t.id) continue;
        if (t.is_private) continue;
        if (t.status === 'closed') continue;
        if (t.expires_at && new Date(t.expires_at).getTime() <= nowMs) continue;
        if (t.id === 'public-royal-table' || t.code === 'ROYAL1' || t.host_id === 'system') continue;
        tablesMap.set(t.id, t);
      }
    }

    return { success: true, tables: Array.from(tablesMap.values()) };
  } catch (err: any) {
    console.warn('[TableService] fetchRunningTablesFromSupabase exception:', err);
    return { success: false, tables: [], error: err?.message };
  }
}

/**
 * Fetches all active & saved tables created by a specific user from server and Supabase game_tables_data.
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
            tablesMap.set(t.id, mapDbRowToGameTableRecord(t));
          }
        }
      }
    }
  } catch (err) {
    console.warn('[TableService] Server user tables fetch notice:', err);
  }

  // 2. Direct query to Supabase: query PRIMARY_TABLE (game_tables_data)
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data: primaryTables } = await supabase
        .from(PRIMARY_TABLE)
        .select('*')
        .neq('status', 'closed')
        .order('created_at', { ascending: false });

      if (primaryTables && Array.isArray(primaryTables)) {
        for (const raw of primaryTables) {
          const t = mapDbRowToGameTableRecord(raw);
          if (!t || !t.id) continue;
          if (t.host_id !== userId && (raw.config?.host?.id !== userId)) continue;

          if (t.expires_at && new Date(t.expires_at).getTime() < nowMs && t.approval_status === 'approved') {
            deleteTableFromSupabase(t.id).catch(() => {});
            continue;
          }
          if (!tablesMap.has(t.id)) {
            tablesMap.set(t.id, t);
          }
        }
      }
    } catch (pErr) {
      console.warn(`[TableService] ${PRIMARY_TABLE} user tables notice:`, pErr);
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
 * Connects with server API and verifies against Supabase game_tables_data.
 */
export async function fetchPendingTableRequests(): Promise<{
  success: boolean;
  requests: any[];
  error?: string;
}> {
  let requestsList: any[] = [];
  try {
    const res = await fetch('/api/admin/table-requests', { cache: 'no-store' });
    const data = await res.json();
    if (data.success && Array.isArray(data.requests)) {
      requestsList = data.requests;
    }
  } catch (err: any) {
    console.warn('[TableService] Server table requests fetch notice:', err);
  }

  // Supplementary direct query to Supabase for 100% reliability
  if (isSupabaseConfigured() && supabase) {
    try {
      const existingIds = new Set(requestsList.map((r) => r.id || r.tableId));

      const { data: primaryData } = await supabase
        .from(PRIMARY_TABLE)
        .select('*')
        .neq('status', 'closed')
        .order('created_at', { ascending: false });

      if (primaryData && Array.isArray(primaryData)) {
        for (const raw of primaryData) {
          const t = mapDbRowToGameTableRecord(raw);
          if (!t || !t.id) continue;
          if (t.id === 'public-royal-table' || t.code === 'ROYAL1') continue;
          if (t.status === 'closed' || t.approval_status === 'declined') continue;

          const isApproved =
            t.approval_status === 'approved' ||
            t.approved === true ||
            (t.status === 'active' && t.approval_status !== 'pending');

          if (!isApproved && !existingIds.has(t.id) && !existingIds.has(t.code)) {
            const config = typeof raw.config === 'object' && raw.config !== null ? raw.config : {};
            const validityHours = config.validity_hours || t.validity_hours || 24;

            requestsList.push({
              id: t.id,
              tableId: t.id,
              roomCode: t.code,
              userId: t.host_id,
              username: t.host_name || 'Player',
              tableName: t.name || `Table ${t.code}`,
              isPrivate: Boolean(t.is_private),
              bettingDuration: t.betting_duration || 18,
              validityHours,
              status: 'pending',
              approvalStatus: t.approval_status || 'pending',
              approved: false,
              createdAt: t.created_at ? new Date(t.created_at).getTime() : Date.now(),
            });
            existingIds.add(t.id);
          }
        }
      }
    } catch (sbErr) {
      console.warn('[TableService] Direct Supabase table requests query error:', sbErr);
    }
  }

  return { success: true, requests: requestsList };
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

