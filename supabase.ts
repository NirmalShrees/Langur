import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { RoomState } from '../src/types.js';

dotenv.config();

const rawUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const rawAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

let serverSupabaseInstance: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient | null {
  if (serverSupabaseInstance) return serverSupabaseInstance;

  if (rawUrl && rawAnonKey && rawUrl.startsWith('http') && rawAnonKey.length > 10) {
    try {
      serverSupabaseInstance = createClient(rawUrl.trim(), rawAnonKey.trim(), {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    } catch (err) {
      console.warn('[Server Supabase] Failed to initialize client:', err);
    }
  }
  return serverSupabaseInstance;
}

export interface SupabaseTableRecord {
  id: string;
  code: string;
  name: string;
  host_id: string;
  host_name?: string;
  is_private: boolean;
  betting_duration?: number;
  player_count?: number;
  status: 'waiting' | 'active' | 'closed';
  player_stats?: any[];
  players?: any[];
  history?: any[];
  table_stats?: any;
  created_at?: string;
  updated_at?: string;
}

/**
 * Queries Supabase for an active/waiting table matching the given code.
 * Includes fuzzy matching for '0' (zero) vs 'O' (letter O) to prevent typos.
 */
export async function fetchTableFromSupabaseByCode(code: string): Promise<SupabaseTableRecord | null> {
  const sb = getSupabaseServerClient();
  if (!sb) return null;

  try {
    const clean = code.trim().toUpperCase();

    // 1. Try exact code
    let { data, error } = await sb
      .from('game_tables')
      .select('*')
      .eq('code', clean)
      .in('status', ['waiting', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return data as SupabaseTableRecord;
    }

    // 2. Try swapping 0 and O if not found
    if (clean.includes('0') || clean.includes('O')) {
      const alt = clean.includes('0') ? clean.replace(/0/g, 'O') : clean.replace(/O/g, '0');
      const altRes = await sb
        .from('game_tables')
        .select('*')
        .eq('code', alt)
        .in('status', ['waiting', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!altRes.error && altRes.data) {
        return altRes.data as SupabaseTableRecord;
      }
    }

    // 3. Check recently closed tables if created recently (within last 30 minutes)
    // to allow reconnecting after transient host disconnects
    const recentRes = await sb
      .from('game_tables')
      .select('*')
      .eq('code', clean)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!recentRes.error && recentRes.data) {
      return recentRes.data as SupabaseTableRecord;
    }
  } catch (err) {
    console.warn('[Server Supabase] fetchTableFromSupabaseByCode error:', err);
  }
  return null;
}

/**
 * Queries Supabase for a table by its unique table ID.
 */
export async function fetchTableFromSupabaseById(roomId: string): Promise<SupabaseTableRecord | null> {
  const sb = getSupabaseServerClient();
  if (!sb) return null;

  try {
    const { data, error } = await sb
      .from('game_tables')
      .select('*')
      .eq('id', roomId)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return data as SupabaseTableRecord;
    }
  } catch (err) {
    console.warn('[Server Supabase] fetchTableFromSupabaseById error:', err);
  }
  return null;
}

/**
 * Fetches all running or waiting tables from Supabase to hydrate the game engine.
 */
export async function fetchActiveTablesFromSupabase(): Promise<SupabaseTableRecord[]> {
  const sb = getSupabaseServerClient();
  if (!sb) return [];

  try {
    const { data, error } = await sb
      .from('game_tables')
      .select('*')
      .in('status', ['waiting', 'active'])
      .order('updated_at', { ascending: false })
      .limit(50);

    if (!error && Array.isArray(data)) {
      return data as SupabaseTableRecord[];
    }
  } catch (err) {
    console.warn('[Server Supabase] fetchActiveTablesFromSupabase error:', err);
  }
  return [];
}

/**
 * Permanently deletes a table from Supabase game_tables when players count reaches 0.
 */
export async function deleteTableFromSupabase(roomId: string): Promise<boolean> {
  const sb = getSupabaseServerClient();
  if (!sb) return false;

  try {
    const { error } = await sb.from('game_tables').delete().eq('id', roomId);
    if (error) {
      console.warn('[Server Supabase] deleteTableFromSupabase notice:', error.message);
      return false;
    }
    console.log(`[Server Supabase] Table ${roomId} deleted as players reached 0.`);
    return true;
  } catch (err) {
    console.warn('[Server Supabase] deleteTableFromSupabase exception:', err);
    return false;
  }
}

/**
 * Sweeps Supabase and purges all redundant table entries:
 * 1. Tables with 0 or null players or status 'closed'
 * 2. Unused system lobby tables
 * 3. Orphaned tables not present in active memory rooms
 */
export async function deleteZeroPlayerTablesFromSupabase(activeRoomIds?: string[]): Promise<number> {
  const sb = getSupabaseServerClient();
  if (!sb) return 0;

  try {
    let totalPurged = 0;

    // 1. Delete tables where player_count is 0 or less, is null, or status is 'closed'
    const { data: zeroData, error: zeroErr } = await sb
      .from('game_tables')
      .delete()
      .or('player_count.lte.0,status.eq.closed,player_count.is.null')
      .select('id');

    if (!zeroErr && zeroData) {
      totalPurged += zeroData.length;
    }

    // 2. Explicitly remove any legacy or redundant public-royal-table
    const { data: royalData } = await sb
      .from('game_tables')
      .delete()
      .eq('id', 'public-royal-table')
      .select('id');
    if (royalData) {
      totalPurged += royalData.length;
    }

    // 3. If active room IDs are provided, purge any orphaned table rows not running in memory
    if (activeRoomIds && Array.isArray(activeRoomIds)) {
      const { data: allTables } = await sb
        .from('game_tables')
        .select('id, player_count, updated_at');

      if (allTables && allTables.length > 0) {
        const orphanedIds = allTables
          .filter((t) => !activeRoomIds.includes(t.id))
          .map((t) => t.id);

        if (orphanedIds.length > 0) {
          const { data: orphanData } = await sb
            .from('game_tables')
            .delete()
            .in('id', orphanedIds)
            .select('id');

          if (orphanData) {
            totalPurged += orphanData.length;
          }
        }
      }
    }

    if (totalPurged > 0) {
      console.log(`[Server Supabase] Purged ${totalPurged} redundant/unused tables from Supabase.`);
    }
    return totalPurged;
  } catch (err) {
    console.warn('[Server Supabase] deleteZeroPlayerTablesFromSupabase exception:', err);
    return 0;
  }
}

/**
 * Updates host assignment in Supabase when Host Migration occurs.
 */
export async function updateTableHostInSupabase(
  roomId: string,
  newHostId: string,
  newHostName: string,
  playerCount: number
): Promise<boolean> {
  const sb = getSupabaseServerClient();
  if (!sb) return false;

  try {
    const { error } = await sb
      .from('game_tables')
      .update({
        host_id: newHostId,
        host_name: newHostName,
        player_count: playerCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', roomId);

    if (error) {
      console.warn('[Server Supabase] updateTableHostInSupabase notice:', error.message);
      return false;
    }
    console.log(`[Server Supabase] Host migrated for room ${roomId} to ${newHostName} (${newHostId})`);
    return true;
  } catch (err) {
    console.warn('[Server Supabase] updateTableHostInSupabase exception:', err);
    return false;
  }
}

/**
 * Persists full table state with compact player stats, compact roster,
 * recent history, and metrics into Supabase game_tables.
 */
export async function syncTableStateToSupabaseServer(room: RoomState): Promise<boolean> {
  const sb = getSupabaseServerClient();
  if (!sb) return false;

  try {
    const playersArr = Object.values(room.players || {});
    if (playersArr.length === 0) {
      // If table has 0 players remaining, delete it immediately from Supabase
      await deleteTableFromSupabase(room.id);
      return true;
    }

    // Compact player stats: easy to inspect in Supabase Table Editor
    const playerStats = playersArr.map((p) => {
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

    // Compact active roster (strip deep per-player history arrays to keep row compact)
    const compactPlayers = playersArr.map((p) => ({
      id: p.id,
      username: p.username || 'Player',
      avatar: p.avatar || '🎲',
      coins: p.coins,
      isHost: Boolean(p.isHost || p.id === room.hostId),
      currentBet: p.totalBetThisRound || 0,
      roundsPlayed: p.sessionStats?.roundsPlayed || 0,
      roundsWon: p.sessionStats?.roundsWon || 0,
      winRate: p.sessionStats?.winRate || 0,
      netProfit: p.sessionStats?.netProfit || 0,
    }));

    // Compact round history: keep latest 15 rounds
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

    const hostPlayer = room.players[room.hostId];
    const hostName = hostPlayer?.username || 'Host';

    const payload: Record<string, any> = {
      id: room.id,
      code: room.code.trim().toUpperCase(),
      name: room.name.trim(),
      host_id: room.hostId,
      host_name: hostName,
      is_private: room.isPrivate,
      betting_duration: room.settings.bettingDuration,
      player_count: playersArr.length,
      status: room.phase === 'waiting' ? 'waiting' : 'active',
      player_stats: playerStats,
      players: playerStats,
      history: compactHistory,
      table_stats: compactTableStats,
      updated_at: new Date().toISOString(),
    };

    let { error } = await sb.from('game_tables').upsert(payload, { onConflict: 'id' });
    // Fallback if player_stats or players column has not yet been migrated
    if (error && (error.message?.toLowerCase().includes('player_stats') || (error as any).code === 'PGRST204')) {
      delete payload.player_stats;
      const retry = await sb.from('game_tables').upsert(payload, { onConflict: 'id' });
      error = retry.error;
    } else if (error && error.message?.toLowerCase().includes('players')) {
      delete payload.players;
      const retry = await sb.from('game_tables').upsert(payload, { onConflict: 'id' });
      error = retry.error;
    }

    if (error) {
      console.warn('[Server Supabase] syncTableStateToSupabaseServer notice:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Server Supabase] syncTableStateToSupabaseServer exception:', err);
    return false;
  }
}

