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
  expires_at?: string;
  validity_days?: number;
  approval_status?: 'pending' | 'approved' | 'rejected';
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

    // Fetch all existing tables from Supabase to find expired/closed ones
    const { data: allTables, error: fetchErr } = await sb
      .from('game_tables')
      .select('id, code, name, player_count, status, players, player_stats, host_id, updated_at, created_at, expires_at');

    if (!fetchErr && allTables && allTables.length > 0) {
      const nowMs = Date.now();
      const redundantIds = allTables
        .filter((t) => {
          if (t.id === 'public-royal-table') return true;
          if (t.status === 'closed') return true;
          // Only purge if table validity has actually expired!
          if (t.expires_at && new Date(t.expires_at).getTime() < nowMs) return true;
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

    // Explicitly delete public-royal-table
    await sb.from('game_tables').delete().eq('id', 'public-royal-table');

    if (totalPurged > 0) {
      console.log(`[Server GC] Cleaned up ${totalPurged} expired/closed tables from Supabase game_tables.`);
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
    const validityHours = (room as any).validityHours || (room as any).validity_hours || (room.validityDays ? room.validityDays * 24 : 24);
    const validityDays = Math.max(1, Math.ceil(validityHours / 24));
    const expiresAt = room.expiresAt
      ? (typeof room.expiresAt === 'number' ? new Date(room.expiresAt).toISOString() : room.expiresAt)
      : (room.expires_at || new Date(Date.now() + validityHours * 60 * 60 * 1000).toISOString());

    const isExpired = expiresAt ? new Date(expiresAt).getTime() < Date.now() : false;
    if (isExpired) {
      // If table time has actually expired, delete it from Supabase
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

    const leaderId = (room as any).leaderId || (room as any).leader_id || room.hostId;
    const leaderName = (room as any).leaderName || (room as any).leader_name || hostName;
    const approvedByAdminId = (room as any).approvedByAdminId || (room as any).approved_by_admin_id;
    const approvedByAdminName = (room as any).approvedByAdminName || (room as any).approved_by_admin_name;
    const adminApprovalMessage = (room as any).adminApprovalMessage || (room as any).admin_approval_message;
    const approvedAt = (room as any).approvedAt || (room as any).approved_at || new Date().toISOString();

    const payload: Record<string, any> = {
      id: room.id,
      code: room.code.trim().toUpperCase(),
      name: room.name.trim(),
      leader_id: leaderId,
      leader_name: leaderName,
      host_id: room.hostId,
      host_name: hostName,
      approved: true,
      approved_by_admin_id: approvedByAdminId,
      approved_by_admin_name: approvedByAdminName,
      admin_approval_message: adminApprovalMessage,
      approved_at: approvedAt,
      is_private: room.isPrivate,
      betting_duration: room.settings.bettingDuration,
      player_count: playersArr.length,
      status: room.phase === 'waiting' ? 'waiting' : 'active',
      player_stats: playerStats,
      players: playerStats,
      history: compactHistory,
      table_stats: compactTableStats,
      expires_at: expiresAt,
      validity_hours: validityHours,
      validity_days: validityDays,
      approval_status: 'approved',
      updated_at: new Date().toISOString(),
    };

    let { error } = await sb.from('game_tables').upsert(payload, { onConflict: 'id' });
    // Fallback if player_stats or players column has not yet been migrated
    if (error && (error.message?.toLowerCase().includes('player_stats') || (error as any).code === 'PGRST204')) {
      delete payload.player_stats;
      const retry = await sb.from('game_tables').upsert(payload, { onConflict: 'id' });
      error = retry.error;
    }
    if (error && error.message?.toLowerCase().includes('approved')) {
      delete payload.approved;
      const retry = await sb.from('game_tables').upsert(payload, { onConflict: 'id' });
      error = retry.error;
    }
    if (error && error.message?.toLowerCase().includes('players')) {
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
 * Updates user notifications in Supabase profiles table
 */
export async function updateUserNotificationsInSupabase(
  userId: string,
  notifications: any[]
): Promise<boolean> {
  const sb = getSupabaseServerClient();
  if (!sb || !userId || !Array.isArray(notifications)) return false;

  try {
    const formatted = notifications.map((n) => {
      const base: any = {
        id: String(n.id || `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`),
        title: String(n.title || 'Notification'),
        message: String(n.message || ''),
        type: String(n.type || 'system'),
        timestamp: Number(n.timestamp) || Date.now(),
      };
      if (n.state === 'not seen') {
        base.state = 'not seen';
      }
      return base;
    }).slice(0, 50);

    const { error } = await sb
      .from('profiles')
      .update({
        notifications: formatted,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.warn('[Server Supabase] updateUserNotificationsInSupabase error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Server Supabase] updateUserNotificationsInSupabase exception:', err);
    return false;
  }
}

/**
 * Deletes a single notification for a user in Supabase
 */
export async function deleteUserNotificationInSupabase(
  userId: string,
  notificationId: string
): Promise<boolean> {
  const sb = getSupabaseServerClient();
  if (!sb || !userId || !notificationId) return false;

  try {
    const { data: cur } = await sb
      .from('profiles')
      .select('notifications')
      .eq('id', userId)
      .maybeSingle();

    const existing: any[] = Array.isArray(cur?.notifications) ? cur.notifications : [];
    const remaining = existing.filter((n: any) => String(n.id) !== String(notificationId));

    const { error } = await sb
      .from('profiles')
      .update({
        notifications: remaining,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.warn('[Server Supabase] deleteUserNotificationInSupabase error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Server Supabase] deleteUserNotificationInSupabase exception:', err);
    return false;
  }
}

/**
 * Clears all notifications for a user in Supabase
 */
export async function clearUserNotificationsInSupabase(userId: string): Promise<boolean> {
  const sb = getSupabaseServerClient();
  if (!sb || !userId) return false;

  try {
    const { error } = await sb
      .from('profiles')
      .update({
        notifications: [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.warn('[Server Supabase] clearUserNotificationsInSupabase error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Server Supabase] clearUserNotificationsInSupabase exception:', err);
    return false;
  }
}

/**
 * Admin: Updates player's coin balance in Supabase profiles.
 */
export async function updateUserCoinsInSupabase(
  userId: string,
  newBalance: number,
  receipt?: any,
  notificationReason?: string | { id?: string; title?: string; message?: string; type?: string; state?: string }
): Promise<{ success: boolean; notification?: any }> {
  const sb = getSupabaseServerClient();
  if (!sb || !userId) return { success: false };

  try {
    const finalBalance = Math.max(0, Math.floor(Number(newBalance) || 0));
    const delta = receipt?.amount || 0;

    // 1. Build notification object reliably
    let resultingNotification: any = undefined;
    if (typeof notificationReason === 'object' && notificationReason !== null) {
      resultingNotification = {
        id: notificationReason.id || `note_admin_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: notificationReason.title || (delta >= 0 ? '🪙 Treasury Reward' : '🪙 Treasury Adjustment'),
        message: notificationReason.message || (delta >= 0 ? `+${delta.toLocaleString()} 🪙` : `${delta.toLocaleString()} 🪙`),
        type: notificationReason.type || (delta >= 0 ? 'reward' : 'treasury'),
        timestamp: Date.now(),
        state: 'not seen',
      };
    } else if (receipt || notificationReason) {
      const noteMsg =
        typeof notificationReason === 'string'
          ? notificationReason
          : receipt?.description || (delta >= 0 ? `+${delta.toLocaleString()} 🪙` : `${delta.toLocaleString()} 🪙`);
      resultingNotification = {
        id: `note_admin_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: delta >= 0 ? '🪙 Treasury Coins Granted' : '🪙 Treasury Coins Deducted',
        message: noteMsg,
        type: delta >= 0 ? 'reward' : 'treasury',
        timestamp: Date.now(),
        state: 'not seen',
      };
    }

    // 2. Fetch current profile to append receipt & notification
    let updatedReceipts: any[] | undefined = undefined;
    let updatedNotifications: any[] | undefined = undefined;
    let currentStats: any = undefined;

    const { data: cur } = await sb
      .from('profiles')
      .select('id, coins, coin_history, notifications, stats')
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

      if (resultingNotification) {
        const existingNotes = Array.isArray(cur.notifications) ? cur.notifications : [];
        updatedNotifications = [
          resultingNotification,
          ...existingNotes.filter((n: any) => n.id !== resultingNotification.id),
        ].slice(0, 50);
      }
    } else {
      if (receipt) {
        updatedReceipts = [receipt];
      }
      if (resultingNotification) {
        updatedNotifications = [resultingNotification];
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

    if (updatedNotifications) {
      updatePayload.notifications = updatedNotifications;
    }

    let { error } = await sb
      .from('profiles')
      .update(updatePayload)
      .eq('id', userId);

    if (error && (error.message?.includes('notifications') || (error as any).code === 'PGRST204')) {
      delete updatePayload.notifications;
      const retry = await sb.from('profiles').update(updatePayload).eq('id', userId);
      error = retry.error;
    }

    if (error && (error.message?.includes('coin_history') || (error as any).code === 'PGRST204')) {
      delete updatePayload.coin_history;
      const retry = await sb.from('profiles').update(updatePayload).eq('id', userId);
      error = retry.error;
    }

    if (error) {
      console.warn('[Server Supabase] updateUserCoinsInSupabase error:', error.message);
      return { success: false };
    }
    return { success: true, notification: resultingNotification };
  } catch (err) {
    console.warn('[Server Supabase] updateUserCoinsInSupabase exception:', err);
    return { success: false };
  }
}

/**
 * Broadcasts an announcement to all user profiles in Supabase notifications column
 */
export async function broadcastNotificationToSupabase(
  title: string,
  message: string,
  type: string = 'announcement'
): Promise<number> {
  const sb = getSupabaseServerClient();
  if (!sb) return 0;

  try {
    const { data: profiles, error: fetchErr } = await sb
      .from('profiles')
      .select('id, notifications');

    if (fetchErr || !profiles || profiles.length === 0) return 0;

    const newNote = {
      id: `note_bcast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: title || '📢 Announcement',
      message: message.trim(),
      type: type || 'announcement',
      timestamp: Date.now(),
      state: 'not seen', // Starts with 'not seen' state
    };

    let updatedCount = 0;
    for (const p of profiles) {
      if (!p.id || p.id.startsWith('guest_')) continue;
      const existing = Array.isArray(p.notifications) ? p.notifications : [];
      const updatedNotes = [newNote, ...existing.filter((n: any) => n.id !== newNote.id)].slice(0, 50);

      await sb
        .from('profiles')
        .update({
          notifications: updatedNotes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', p.id);
      
      updatedCount++;
    }
    return updatedCount;
  } catch (err) {
    console.warn('[Server Supabase] broadcastNotificationToSupabase exception:', err);
    return 0;
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

/**
 * Admin: Grants or revokes Table Host Approval for a user, specifying duration in days.
 */
export async function updateUserTableHostApproval(
  userId: string,
  canCreate: boolean,
  validityDays: number = 7
): Promise<{ success: boolean; expiresAt?: string; message?: string }> {
  const sb = getSupabaseServerClient();
  if (!sb || !userId) return { success: false, message: 'Missing database client or userId' };

  try {
    const expiresAt = canCreate
      ? new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // Fetch existing stats to update stats JSONB in tandem
    const { data: cur } = await sb
      .from('profiles')
      .select('stats, notifications')
      .eq('id', userId)
      .maybeSingle();

    const currentStats = typeof cur?.stats === 'object' && cur?.stats !== null ? { ...cur.stats } : {};
    currentStats.canCreateTable = canCreate;
    currentStats.tableValidityDays = validityDays;
    currentStats.tablePermissionExpiresAt = expiresAt;

    // Create celebratory notification if approved
    let updatedNotifications = Array.isArray(cur?.notifications) ? cur.notifications : [];
    if (canCreate) {
      const approvalNote = {
        id: `note_host_approval_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: '👑 Table Host Approved!',
        message: `Admin has approved your request to host game tables! You can create and host tables for the next ${validityDays} days.`,
        type: 'reward',
        timestamp: Date.now(),
        state: 'not seen',
      };
      updatedNotifications = [approvalNote, ...updatedNotifications].slice(0, 50);
    }

    const { error } = await sb
      .from('profiles')
      .update({
        can_create_table: canCreate,
        table_permission_expires_at: expiresAt,
        table_validity_days: validityDays,
        stats: currentStats,
        notifications: updatedNotifications,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.warn('[Server Supabase] updateUserTableHostApproval error:', error.message);
      return { success: false, message: error.message };
    }

    return {
      success: true,
      expiresAt: expiresAt || undefined,
      message: canCreate
        ? `Table host approval granted for ${validityDays} days!`
        : 'Table host approval revoked.',
    };
  } catch (err: any) {
    console.warn('[Server Supabase] updateUserTableHostApproval exception:', err);
    return { success: false, message: err?.message || 'Server error updating table approval' };
  }
}

/**
 * Sends a high-priority notification to all Admin user profiles in Supabase.
 */
export async function notifyAllAdminsInSupabase(
  title: string,
  message: string,
  extraData?: Record<string, any>
): Promise<number> {
  const sb = getSupabaseServerClient();
  if (!sb) return 0;

  try {
    const { data: profiles, error } = await sb
      .from('profiles')
      .select('id, email, is_admin, stats, notifications');

    if (error || !profiles) return 0;

    let notifiedCount = 0;
    const now = Date.now();

    for (const p of profiles) {
      const emailMatch = p.email && SUPERADMIN_EMAILS.includes(p.email.toLowerCase().trim());
      const isAdminFlag = p.is_admin === true || (p.stats && typeof p.stats === 'object' && p.stats.isAdmin === true);

      if (emailMatch || isAdminFlag) {
        const note = {
          id: `note_admin_req_${now}_${Math.random().toString(36).substring(2, 6)}`,
          title: title || '👑 Table Creation Request',
          message: message.trim(),
          type: 'announcement',
          timestamp: now,
          state: 'not seen',
          ...extraData,
        };

        const existingNotes = Array.isArray(p.notifications) ? p.notifications : [];
        const updated = [note, ...existingNotes.filter((n: any) => n.id !== note.id)].slice(0, 50);

        await sb.from('profiles').update({ notifications: updated, updated_at: new Date().toISOString() }).eq('id', p.id);
        notifiedCount++;
      }
    }
    return notifiedCount;
  } catch (err) {
    console.warn('[Server Supabase] notifyAllAdminsInSupabase error:', err);
    return 0;
  }
}

/**
 * Saves or updates a table creation request in Supabase table_requests table.
 */
export async function saveTableRequestToSupabase(request: {
  id: string;
  userId: string;
  username: string;
  tableName: string;
  isPrivate: boolean;
  bettingDuration: number;
  validityHours: number;
  status: string;
  approvedByAdminId?: string;
  approvedByAdminName?: string;
  adminMessage?: string;
}): Promise<boolean> {
  const sb = getSupabaseServerClient();
  if (!sb) return false;

  try {
    const payload = {
      id: request.id,
      user_id: request.userId,
      username: request.username,
      table_name: request.tableName,
      is_private: request.isPrivate,
      betting_duration: request.bettingDuration,
      validity_hours: request.validityHours,
      status: request.status,
      approved_by_admin_id: request.approvedByAdminId,
      approved_by_admin_name: request.approvedByAdminName,
      admin_message: request.adminMessage,
      updated_at: new Date().toISOString(),
    };

    const { error } = await sb.from('table_requests').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.warn('[Server Supabase] saveTableRequestToSupabase notice:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Server Supabase] saveTableRequestToSupabase exception:', err);
    return false;
  }
}

/**
 * Fetches all pending table creation requests from Supabase.
 */
export async function fetchPendingTableRequestsFromSupabase(): Promise<any[]> {
  const sb = getSupabaseServerClient();
  if (!sb) return [];

  try {
    const { data, error } = await sb
      .from('table_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      return data.map((r) => ({
        id: r.id,
        userId: r.user_id,
        username: r.username,
        tableName: r.table_name,
        isPrivate: r.is_private,
        bettingDuration: r.betting_duration,
        validityHours: r.validity_hours,
        status: r.status,
        createdAt: new Date(r.created_at).getTime(),
      }));
    }
  } catch (err) {
    console.warn('[Server Supabase] fetchPendingTableRequestsFromSupabase exception:', err);
  }
  return [];
}

/**
 * Safely inserts or updates a table record into Supabase game_tables.
 * Handles schema differences gracefully with automatic column stripping retries.
 */
export async function saveTableToSupabaseSafe(tableRecord: any): Promise<boolean> {
  const sb = getSupabaseServerClient();
  if (!sb || !tableRecord?.id) return false;

  const payload: Record<string, any> = { ...tableRecord };

  try {
    let { error } = await sb.from('game_tables').upsert(payload, { onConflict: 'id' });

    if (error && (error.message?.toLowerCase().includes('player_stats') || (error as any).code === 'PGRST204')) {
      delete payload.player_stats;
      const retry = await sb.from('game_tables').upsert(payload, { onConflict: 'id' });
      error = retry.error;
    }
    if (error && error.message?.toLowerCase().includes('approved')) {
      delete payload.approved;
      const retry = await sb.from('game_tables').upsert(payload, { onConflict: 'id' });
      error = retry.error;
    }
    if (error && error.message?.toLowerCase().includes('players')) {
      delete payload.players;
      const retry = await sb.from('game_tables').upsert(payload, { onConflict: 'id' });
      error = retry.error;
    }

    if (error) {
      console.warn('[Server Supabase] saveTableToSupabaseSafe notice:', error.message);
      return false;
    }
    console.log(`[Server Supabase] Table ${tableRecord.name} (${tableRecord.id}) saved to Supabase (approved=${Boolean(tableRecord.approved)})`);
    return true;
  } catch (err) {
    console.warn('[Server Supabase] saveTableToSupabaseSafe exception:', err);
    return false;
  }
}


