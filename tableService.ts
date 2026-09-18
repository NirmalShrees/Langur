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
  is_private: boolean;
  betting_duration: number;
  player_count: number;
  status: 'waiting' | 'active' | 'closed';
  player_stats?: any[];
  players?: TablePlayerRecord[];
  history?: any[];
  table_stats?: {
    totalRounds: number;
    totalBets: number;
    totalPayouts: number;
    highestRoundPool?: number;
    biggestWinner?: { username: string; amount: number; roundNumber: number };
  };
  created_at?: string;
  updated_at?: string;
}

/**
 * Records a newly created game table and its unique private code in Supabase.
 */
export async function recordTableInSupabase(table: {
  id: string;
  code: string;
  name: string;
  hostId: string;
  hostName: string;
  isPrivate: boolean;
  bettingDuration: number;
  playerCount?: number;
  status?: 'waiting' | 'active' | 'closed';
  players?: any[];
}): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: true };
  }

  try {
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

    const payload: Record<string, any> = {
      id: table.id,
      code: table.code.trim().toUpperCase(),
      name: table.name.trim(),
      host_id: table.hostId,
      host_name: table.hostName,
      is_private: table.isPrivate,
      betting_duration: table.bettingDuration,
      player_count: table.playerCount || 1,
      status: table.status || 'waiting',
      players: compactPlayers,
      player_stats: playerStats,
      history: [],
      table_stats: { totalRounds: 0, totalBets: 0, totalPayouts: 0 },
      updated_at: new Date().toISOString(),
    };

    let { error } = await supabase.from('game_tables').upsert(payload, { onConflict: 'id' });
    if (error && (error.message?.toLowerCase().includes('player_stats') || error.code === 'PGRST204')) {
      delete payload.player_stats;
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
      is_private: room.isPrivate,
      betting_duration: room.settings.bettingDuration,
      player_count: playersList.length,
      status: room.phase === 'waiting' ? 'waiting' : 'active',
      player_stats: playerStats,
      players: playerStats,
      history: compactHistory,
      table_stats: compactTableStats,
      updated_at: new Date().toISOString(),
    };

    let { error } = await supabase.from('game_tables').upsert(payload, { onConflict: 'id' });
    if (error && (error.message?.toLowerCase().includes('player_stats') || error.code === 'PGRST204')) {
      delete payload.player_stats;
      const retry = await supabase.from('game_tables').upsert(payload, { onConflict: 'id' });
      error = retry.error;
    } else if (error && error.message?.toLowerCase().includes('players')) {
      delete payload.players;
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
 * Permanently deletes a game table from Supabase game_tables when players count becomes 0.
 */
export async function deleteTableFromSupabase(roomId: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: true };
  }

  try {
    const { error } = await supabase.from('game_tables').delete().eq('id', roomId);
    if (error) {
      console.warn('[TableService] deleteTableFromSupabase notice:', error.message);
      // Fallback: mark as closed if delete policy restricts row deletion
      await updateTableInSupabase(roomId, { status: 'closed', playerCount: 0 });
      return { success: false, error: error.message };
    }
    console.log(`[TableService] Table ${roomId} deleted as players count reached 0.`);
    return { success: true };
  } catch (err: any) {
    console.warn('[TableService] deleteTableFromSupabase exception:', err);
    return { success: false, error: err?.message };
  }
}

/**
 * Sweeps and purges all tables with 0 players or closed status from Supabase.
 */
export async function deleteZeroPlayerTablesFromSupabase(): Promise<number> {
  if (!isSupabaseConfigured() || !supabase) return 0;
  try {
    let purged = 0;
    const { data, error } = await supabase
      .from('game_tables')
      .delete()
      .or('player_count.lte.0,status.eq.closed,player_count.is.null')
      .select('id');

    if (!error && data) {
      purged += data.length;
    }

    const { data: royalData } = await supabase
      .from('game_tables')
      .delete()
      .eq('id', 'public-royal-table')
      .select('id');

    if (royalData) {
      purged += royalData.length;
    }

    if (purged > 0) {
      console.log(`[TableService] Purged ${purged} zero-player/redundant tables from Supabase.`);
    }
    return purged;
  } catch (err) {
    console.warn('[TableService] deleteZeroPlayerTablesFromSupabase notice:', err);
  }
  return 0;
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
 * Retrieves all currently open public game tables from Supabase (waiting or active).
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
      .in('status', ['waiting', 'active'])
      .order('updated_at', { ascending: false })
      .limit(20);

    if (error) {
      return { success: false, tables: [], error: error.message };
    }

    return { success: true, tables: (data as GameTableRecord[]) || [] };
  } catch (err: any) {
    return { success: false, tables: [], error: err?.message };
  }
}
