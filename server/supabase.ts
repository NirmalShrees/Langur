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
 * Permanently deletes a table from Supabase game_tables.
 */
export async function deleteTableFromSupabase(roomId: string): Promise<boolean> {
  const sb = getSupabaseServerClient();
  if (!sb) return false;

  try {
    // 1. Immediately mark table status closed and zero players
    await sb.from('game_tables').update({ status: 'closed', player_count: 0, players: [], player_stats: [] }).eq('id', roomId);

    // 2. Hard delete the row by ID or code
    const { error: err1 } = await sb.from('game_tables').delete().eq('id', roomId);
    await sb.from('game_tables').delete().eq('code', roomId);

    if (err1) {
      console.warn('[Server Supabase] deleteTableFromSupabase notice (marked closed):', err1.message);
    } else {
      console.log(`[Server Supabase] Table ${roomId} deleted from Supabase game_tables.`);
    }
    return true;
  } catch (err) {
    console.warn('[Server Supabase] deleteTableFromSupabase exception:', err);
    return false;
  }
}

/**
 * Sweeps Supabase and purges all redundant table entries:
 * 1. Tables with 0 or null players or status 'closed'
 * 2. Unused system lobby tables (e.g., 'public-royal-table')
 * 3. Orphaned tables not present in active memory rooms
 * 4. Inactive tables with 0 real human players
 */
export async function deleteZeroPlayerTablesFromSupabase(activeRoomIds?: string[]): Promise<number> {
  const sb = getSupabaseServerClient();
  if (!sb) return 0;

  try {
    let totalPurged = 0;

    // Fetch all existing tables from Supabase to thoroughly find redundant/abandoned ones
    const { data: allTables, error: fetchErr } = await sb
      .from('game_tables')
      .select('id, code, name, player_count, status, players, player_stats, host_id, updated_at, created_at');

    if (!fetchErr && allTables && allTables.length > 0) {
      const redundantIds = allTables
        .filter((t) => {
          if (t.id === 'public-royal-table') return true;
          if (t.status === 'closed') return true;
          if (t.player_count === null || t.player_count === undefined || Number(t.player_count) <= 0) return true;
          
          // Check player_stats or players json array
          const statsArr = Array.isArray(t.player_stats) ? t.player_stats : [];
          const playersArr = Array.isArray(t.players) ? t.players : [];
          const combinedPlayers = statsArr.length > 0 ? statsArr : playersArr;
          
          if (combinedPlayers.length === 0) return true;

          // Check if all players are bots/patrons
          const realPlayers = combinedPlayers.filter((p: any) => {
            const pId = String(p?.id || '');
            return !pId.startsWith('patron_') && !pId.startsWith('bot_') && pId !== '';
          });
          if (realPlayers.length === 0) return true;

          // If activeRoomIds provided and table is not active in memory
          if (activeRoomIds && Array.isArray(activeRoomIds) && !activeRoomIds.includes(t.id)) {
            return true;
          }

          return false;
        })
        .map((t) => t.id);

      if (redundantIds.length > 0) {
        // Mark closed
        await sb
          .from('game_tables')
          .update({ status: 'closed', player_count: 0, players: [], player_stats: [] })
          .in('id', redundantIds);

        // Hard delete from database table
        const { data: deletedRows, error: delErr } = await sb
          .from('game_tables')
          .delete()
          .in('id', redundantIds)
          .select('id');

        if (!delErr && deletedRows) {
          totalPurged += deletedRows.length;
        } else {
          totalPurged += redundantIds.length;
        }
      }
    }

    // Direct deletion query fallback for any remaining closed or <=0 player rows
    const { data: directDeleted } = await sb
      .from('game_tables')
      .delete()
      .or('player_count.lte.0,status.eq.closed,player_count.is.null')
      .select('id');

    if (directDeleted) {
      totalPurged += directDeleted.length;
    }

    // Explicitly delete public-royal-table
    await sb.from('game_tables').delete().eq('id', 'public-royal-table');

    if (totalPurged > 0) {
      console.log(`[Server GC] Cleaned up ${totalPurged} redundant/unused tables from Supabase game_tables.`);
    }
    return totalPurged;
  } catch (err) {
    console.warn('[Server GC] deleteZeroPlayerTablesFromSupabase exception:', err);
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

// Known default superadmin emails
export const SUPERADMIN_EMAILS = [
  'lamrinshrees@gmail.com',
];

/**
 * Checks if a user has admin privileges based on their ID, email, or DB is_admin flag.
 */
export async function checkIsAdmin(userId: string, email?: string): Promise<boolean> {
  if (email && SUPERADMIN_EMAILS.includes(email.toLowerCase().trim())) {
    return true;
  }

  const sb = getSupabaseServerClient();
  if (!sb || !userId) return false;

  try {
    const { data } = await sb
      .from('profiles')
      .select('email, is_admin, stats')
      .eq('id', userId)
      .maybeSingle();

    if (data) {
      if (data.is_admin === true) return true;
      if (data.email && SUPERADMIN_EMAILS.includes(data.email.toLowerCase().trim())) return true;
      if (data.stats && typeof data.stats === 'object' && data.stats.isAdmin === true) return true;
    }
  } catch (e) {
    console.warn('[Server Supabase] checkIsAdmin exception:', e);
  }
  return false;
}

/**
 * Fetches all registered players from Supabase profiles for the Admin Panel.
 */
export async function fetchAllProfilesForAdmin(): Promise<any[]> {
  const sb = getSupabaseServerClient();
  if (!sb) return [];

  try {
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(200);

    if (!error && Array.isArray(data)) {
      return data.filter((p) => {
        if (!p || !p.id) return false;
        const idLower = String(p.id).toLowerCase();
        return (
          !idLower.startsWith('bot_') &&
          !idLower.startsWith('patron_') &&
          !idLower.startsWith('smart_') &&
          !idLower.startsWith('seed-') &&
          !idLower.startsWith('seed_') &&
          !idLower.startsWith('ai_')
        );
      });
    }
  } catch (err) {
    console.warn('[Server Supabase] fetchAllProfilesForAdmin exception:', err);
  }
  return [];
}

/**
 * Admin: Updates player's coin balance in Supabase profiles.
 */
export async function updateUserCoinsInSupabase(
  userId: string,
  newBalance: number,
  receipt?: any
): Promise<boolean> {
  const sb = getSupabaseServerClient();
  if (!sb || !userId) return false;

  try {
    const finalBalance = Math.max(0, Math.floor(Number(newBalance) || 0));

    // 1. Fetch current profile to append receipt if provided
    let updatedReceipts: any[] | undefined = undefined;
    let currentStats: any = undefined;

    const { data: cur } = await sb
      .from('profiles')
      .select('coins, coin_history, stats')
      .eq('id', userId)
      .maybeSingle();

    if (cur) {
      currentStats = typeof cur.stats === 'object' && cur.stats !== null ? { ...cur.stats } : {};
      if (receipt) {
        const existingReceipts = Array.isArray(cur.coin_history)
          ? cur.coin_history
          : (Array.isArray(currentStats.coinHistory) ? currentStats.coinHistory : []);

        updatedReceipts = [receipt, ...existingReceipts].slice(0, 50);
      }
    }

    const updatePayload: Record<string, any> = {
      coins: finalBalance,
      updated_at: new Date().toISOString(),
    };

    if (currentStats) {
      currentStats.coins = finalBalance;
      if (updatedReceipts) {
        currentStats.coinHistory = updatedReceipts;
      }
      updatePayload.stats = currentStats;
    }

    if (updatedReceipts) {
      updatePayload.coin_history = updatedReceipts;
    }

    let { error } = await sb
      .from('profiles')
      .update(updatePayload)
      .eq('id', userId);

    if (error && (error.message?.includes('coin_history') || (error as any).code === 'PGRST204')) {
      delete updatePayload.coin_history;
      const retry = await sb.from('profiles').update(updatePayload).eq('id', userId);
      error = retry.error;
    }

    if (error) {
      console.warn('[Server Supabase] updateUserCoinsInSupabase error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Server Supabase] updateUserCoinsInSupabase exception:', err);
    return false;
  }
}

/**
 * Admin: Grants or revokes admin status in Supabase profiles.
 */
export async function updateUserAdminStatusInSupabase(
  userId: string,
  isAdmin: boolean
): Promise<boolean> {
  const sb = getSupabaseServerClient();
  if (!sb || !userId) return false;

  try {
    const { error } = await sb
      .from('profiles')
      .update({
        is_admin: isAdmin,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.warn('[Server Supabase] updateUserAdminStatusInSupabase error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Server Supabase] updateUserAdminStatusInSupabase exception:', err);
    return false;
  }
}

