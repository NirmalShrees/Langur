import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { RoomState } from '../src/types.js';

dotenv.config();

const rawUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const rawKey =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

let serverSupabaseInstance: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient | null {
  if (serverSupabaseInstance) return serverSupabaseInstance;

  if (rawUrl && rawKey && rawUrl.startsWith('http') && rawKey.length > 10) {
    try {
      serverSupabaseInstance = createClient(rawUrl.trim(), rawKey.trim(), {
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
  status: 'waiting' | 'active' | 'closed' | 'pending_approval' | string;
  approval_status?: 'pending' | 'approved' | 'declined' | string;
  player_stats?: any[];
  history?: any[];
  table_stats?: any;
  approval_meta?: {
    admin_id?: string;
    admin_name?: string;
    message?: string;
    approved_at?: string;
  };
  expires_at?: string;
  created_at?: string;
  updated_at?: string;

  // Legacy fallback fields
  leader_id?: string;
  leader_name?: string;
  approved?: boolean;
  approved_by_admin_id?: string;
  approved_by_admin_name?: string;
  admin_approval_message?: string;
  approved_at?: string;
  players?: any[];
  validity_days?: number;
}

export const PRIMARY_TABLE = 'game_tables_data';

export function normalizeTableRecord(t: any): SupabaseTableRecord | null {
  if (!t || !t.id) return null;

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
    is_private: isPrivate,
    betting_duration: bettingDuration,
    player_count: t.player_count !== undefined ? Number(t.player_count) : (Array.isArray(t.player_stats) ? t.player_stats.length : 0),
    status: t.status || (isApproved ? 'waiting' : 'pending_approval'),
    approval_status: approvalStatus,
    approved: isApproved,
    player_stats: t.player_stats || [],
    history: t.history || [],
    table_stats: t.table_stats || { totalBets: 0, totalRounds: 0, totalPayouts: 0 },
    approval_meta: {
      admin_id: approval.admin_id || t.approved_by_admin_id,
      admin_name: approval.admin_name || t.approved_by_admin_name,
      message: approval.message || t.admin_approval_message,
      approved_at: approval.approved_at || t.approved_at,
    },
    expires_at: t.expires_at,
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
}

/**
 * Queries Supabase game_tables_data for an active/waiting table matching the given code.
 * Includes fuzzy matching for '0' (zero) vs 'O' (letter O) to prevent typos.
 */
export async function fetchTableFromSupabaseByCode(code: string): Promise<SupabaseTableRecord | null> {
  const sb = getSupabaseServerClient();
  if (!sb) return null;

  try {
    const clean = code.trim().toUpperCase();

    // 1. game_tables_data (Exact match)
    let { data: primaryData, error: primaryErr } = await sb
      .from(PRIMARY_TABLE)
      .select('*')
      .eq('code', clean)
      .in('status', ['waiting', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!primaryErr && primaryData) {
      return normalizeTableRecord(primaryData);
    }

    // 2. Fuzzy swap 0 and O on game_tables_data
    if (clean.includes('0') || clean.includes('O')) {
      const alt = clean.includes('0') ? clean.replace(/0/g, 'O') : clean.replace(/O/g, '0');
      const { data: altPrimary } = await sb
        .from(PRIMARY_TABLE)
        .select('*')
        .eq('code', alt)
        .in('status', ['waiting', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (altPrimary) {
        return normalizeTableRecord(altPrimary);
      }
    }
  } catch (err) {
    console.warn('[Server Supabase] fetchTableFromSupabaseByCode error:', err);
  }
  return null;
}

/**
 * Queries Supabase game_tables_data for a table by its unique table ID.
 */
export async function fetchTableFromSupabaseById(roomId: string): Promise<SupabaseTableRecord | null> {
  const sb = getSupabaseServerClient();
  if (!sb) return null;

  try {
    const { data: primaryData, error: primaryErr } = await sb
      .from(PRIMARY_TABLE)
      .select('*')
      .eq('id', roomId)
      .limit(1)
      .maybeSingle();

    if (!primaryErr && primaryData) {
      return normalizeTableRecord(primaryData);
    }
  } catch (err) {
    console.warn('[Server Supabase] fetchTableFromSupabaseById error:', err);
  }
  return null;
}

/**
 * Fetches all running or waiting tables from Supabase game_tables_data to hydrate the game engine.
 */
export async function fetchActiveTablesFromSupabase(): Promise<SupabaseTableRecord[]> {
  const sb = getSupabaseServerClient();
  if (!sb) return [];

  try {
    const { data: primaryData, error: primaryErr } = await sb
      .from(PRIMARY_TABLE)
      .select('*')
      .in('status', ['waiting', 'active'])
      .order('updated_at', { ascending: false })
      .limit(50);

    if (!primaryErr && Array.isArray(primaryData) && primaryData.length > 0) {
      return primaryData.map(normalizeTableRecord).filter(Boolean) as SupabaseTableRecord[];
    }
  } catch (err) {
    console.warn('[Server Supabase] fetchActiveTablesFromSupabase error:', err);
  }
  return [];
}

/**
 * Permanently deletes a table from Supabase game_tables_data.
 */
export async function deleteTableFromSupabase(roomId: string): Promise<boolean> {
  const sb = getSupabaseServerClient();
  if (!sb) return false;

  try {
    await sb.from(PRIMARY_TABLE).update({ status: 'closed', player_count: 0 }).eq('id', roomId);
    await sb.from(PRIMARY_TABLE).delete().eq('id', roomId);
    await sb.from(PRIMARY_TABLE).delete().eq('code', roomId);

    console.log(`[Server Supabase] Table ${roomId} deleted from ${PRIMARY_TABLE}.`);
    return true;
  } catch (err) {
    console.warn('[Server Supabase] deleteTableFromSupabase exception:', err);
    return false;
  }
}

/**
 * Sweeps Supabase game_tables_data and purges all redundant table entries:
 * 1. Tables with status 'closed'
 * 2. Unused system lobby tables (e.g., 'public-royal-table')
 * 3. Tables whose validity timestamp has expired
 */
export async function deleteZeroPlayerTablesFromSupabase(activeRoomIds?: string[]): Promise<number> {
  const sb = getSupabaseServerClient();
  if (!sb) return 0;

  try {
    let totalPurged = 0;
    const nowMs = Date.now();

    const { data: primaryTables } = await sb
      .from(PRIMARY_TABLE)
      .select('id, code, status, expires_at');

    if (primaryTables && primaryTables.length > 0) {
      const redundantIds = primaryTables
        .filter((t) => {
          if (t.id === 'public-royal-table') return true;
          if (t.status === 'closed') return true;
          if (t.expires_at && new Date(t.expires_at).getTime() < nowMs) return true;
          return false;
        })
        .map((t) => t.id);

      if (redundantIds.length > 0) {
        await sb.from(PRIMARY_TABLE).update({ status: 'closed', player_count: 0 }).in('id', redundantIds);
        const { data: delRows } = await sb.from(PRIMARY_TABLE).delete().in('id', redundantIds).select('id');
        totalPurged += delRows?.length || redundantIds.length;
      }
    }

    // Explicitly delete public-royal-table
    try {
      await sb.from(PRIMARY_TABLE).delete().eq('id', 'public-royal-table');
    } catch {}

    if (totalPurged > 0) {
      console.log(`[Server GC] Cleaned up ${totalPurged} expired/closed tables from ${PRIMARY_TABLE}.`);
    }
    return totalPurged;
  } catch (err) {
    console.warn('[Server GC] deleteZeroPlayerTablesFromSupabase exception:', err);
    return 0;
  }
}

/**
 * Updates host assignment in Supabase game_tables_data when Host Migration occurs.
 * Updates config.host and player_count.
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
    const nowIso = new Date().toISOString();

    const { data: cur } = await sb
      .from(PRIMARY_TABLE)
      .select('config')
      .eq('id', roomId)
      .maybeSingle();

    const existingConfig = typeof cur?.config === 'object' && cur?.config !== null ? cur.config : {};
    const updatedConfig = {
      ...existingConfig,
      host: {
        id: newHostId,
        name: newHostName,
      },
    };

    await sb
      .from(PRIMARY_TABLE)
      .update({
        config: updatedConfig,
        player_count: playerCount,
        updated_at: nowIso,
      })
      .eq('id', roomId);

    console.log(`[Server Supabase] Host migrated for room ${roomId} to ${newHostName} (${newHostId})`);
    return true;
  } catch (err) {
    console.warn('[Server Supabase] updateTableHostInSupabase exception:', err);
    return false;
  }
}

/**
 * Persists full table state with compact player stats, compact roster,
 * recent history, and metrics into Supabase game_tables_data.
 */
export async function syncTableStateToSupabaseServer(room: RoomState): Promise<boolean> {
  const sb = getSupabaseServerClient();
  if (!sb) return false;

  try {
    const playersArr = Object.values(room.players || {}).filter((p) => !isNonRegisteredId(p?.id) && !(p as any)?.isBot);
    const validityHours = (room as any).validityHours || (room as any).validity_hours || (room.validityDays ? room.validityDays * 24 : 24);
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

    const approvalMeta = {
      admin_id: (room as any).approvedByAdminId || (room as any).approved_by_admin_id || null,
      admin_name: (room as any).approvedByAdminName || (room as any).approved_by_admin_name || null,
      message: (room as any).adminApprovalMessage || (room as any).admin_approval_message || null,
      approved_at: (room as any).approvedAt || (room as any).approved_at || new Date().toISOString(),
    };

    const nowIso = new Date().toISOString();

    // 1. Primary write: game_tables_data (compact layout)
    const primaryPayload: Record<string, any> = {
      id: room.id,
      code: room.code.trim().toUpperCase(),
      name: room.name.trim(),
      status: room.phase === 'waiting' ? 'waiting' : 'active',
      player_count: playersArr.length,
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
          admin_id: approvalMeta.admin_id,
          admin_name: approvalMeta.admin_name,
          approved_at: approvalMeta.approved_at,
        },
      },
      player_stats: playerStats,
      history: compactHistory,
      table_stats: compactTableStats,
      updated_at: nowIso,
    };

    const { error: primaryErr } = await sb.from(PRIMARY_TABLE).upsert(primaryPayload, { onConflict: 'id' });
    if (primaryErr) {
      console.warn(`[Server Supabase] ${PRIMARY_TABLE} sync notice:`, primaryErr.message);
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
  'notnrmlzz@gmail.com',
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

export function isNonRegisteredId(userId?: string | null): boolean {
  if (!userId) return true;
  const idLower = String(userId).trim().toLowerCase();
  if (!idLower) return true;
  return (
    idLower.startsWith('bot_') ||
    idLower.startsWith('bot-') ||
    idLower.startsWith('patron_') ||
    idLower.startsWith('smart_') ||
    idLower.startsWith('seed-') ||
    idLower.startsWith('seed_') ||
    idLower.startsWith('ai_') ||
    idLower.startsWith('user_') ||
    idLower.startsWith('guest_') ||
    idLower.startsWith('system')
  );
}

export function isRealRegisteredPlayer(p: any): boolean {
  if (!p || !p.id) return false;
  if (isNonRegisteredId(p.id)) return false;

  const username = String(p.username || '').trim().toLowerCase();
  if ((username === 'festival player' || username === 'festival patron' || username === 'guest') && !p.email) {
    return false;
  }
  if (username === '[purged]' || username.includes('purged')) return false;

  const stats = typeof p.stats === 'object' && p.stats !== null ? p.stats : {};
  if (p.isBot || p.is_bot || stats.is_deleted || stats.is_dummy || stats.isBot) return false;

  const hasEmail = Boolean(p.email && String(p.email).includes('@'));
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.id);
  const isEmailAccount = String(p.id).startsWith('email_') || String(p.id).startsWith('google_');
  return Boolean(hasEmail || isUuid || isEmailAccount);
}

/**
 * Fetches all real registered players from Supabase profiles for the Admin Panel.
 * Strictly excludes temporary guest sessions, festival placeholders, bots, and purged entries.
 */
export async function fetchAllProfilesForAdmin(): Promise<any[]> {
  const sb = getSupabaseServerClient();
  if (!sb) return [];

  try {
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(300);

    if (!error && Array.isArray(data)) {
      return data.filter(isRealRegisteredPlayer);
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
  if (!sb || !userId || isNonRegisteredId(userId) || !Array.isArray(notifications)) return false;

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
  if (!sb || !userId || isNonRegisteredId(userId) || !notificationId) return false;

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
  if (!sb || !userId || isNonRegisteredId(userId)) return false;

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
  if (!sb || !userId || isNonRegisteredId(userId)) return { success: false };

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
      .select('id, email, username, stats, notifications');

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
      if (!isRealRegisteredPlayer(p)) continue;
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
  if (!sb || !userId || isNonRegisteredId(userId)) return false;

  try {
    const { data: cur } = await sb
      .from('profiles')
      .select('stats')
      .eq('id', userId)
      .maybeSingle();

    const currentStats = typeof cur?.stats === 'object' && cur?.stats !== null ? { ...cur.stats } : {};
    currentStats.isAdmin = isAdmin;
    currentStats.is_admin = isAdmin;

    const payload: Record<string, any> = {
      is_admin: isAdmin,
      stats: currentStats,
      updated_at: new Date().toISOString(),
    };

    let { error } = await sb
      .from('profiles')
      .update(payload)
      .eq('id', userId);

    if (error && (error.message?.toLowerCase().includes('is_admin') || (error as any).code === 'PGRST204')) {
      delete payload.is_admin;
      const retry = await sb.from('profiles').update(payload).eq('id', userId);
      error = retry.error;
    }

    if (error) {
      console.warn('[Server Supabase] updateUserAdminStatusInSupabase notice:', error.message);
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
  if (!sb || !userId || isNonRegisteredId(userId)) return { success: false, message: 'Missing database client or invalid userId' };

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
    currentStats.can_create_table = canCreate;
    currentStats.tableValidityDays = validityDays;
    currentStats.table_validity_days = validityDays;
    currentStats.tablePermissionExpiresAt = expiresAt;
    currentStats.table_permission_expires_at = expiresAt;

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

    const payload: Record<string, any> = {
      can_create_table: canCreate,
      table_permission_expires_at: expiresAt,
      table_validity_days: validityDays,
      stats: currentStats,
      notifications: updatedNotifications,
      updated_at: new Date().toISOString(),
    };

    let { error } = await sb
      .from('profiles')
      .update(payload)
      .eq('id', userId);

    if (error && (error.message?.toLowerCase().includes('can_create_table') || (error as any).code === 'PGRST204')) {
      delete payload.can_create_table;
      delete payload.table_permission_expires_at;
      delete payload.table_validity_days;
      const retry = await sb.from('profiles').update(payload).eq('id', userId);
      error = retry.error;
    }

    if (error && (error.message?.toLowerCase().includes('notifications') || (error as any).code === 'PGRST204')) {
      delete payload.notifications;
      const retry = await sb.from('profiles').update(payload).eq('id', userId);
      error = retry.error;
    }

    if (error) {
      console.warn('[Server Supabase] updateUserTableHostApproval notice:', error.message);
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
 * Extracts a missing column name from PostgREST PGRST204 error message.
 */
function extractMissingColumn(errorMsg: string): string | null {
  if (!errorMsg) return null;
  const match =
    errorMsg.match(/'([a-zA-Z0-9_]+)' column/i) ||
    errorMsg.match(/column '([a-zA-Z0-9_]+)'/i) ||
    errorMsg.match(/column ([a-zA-Z0-9_]+) of/i) ||
    errorMsg.match(/column ([a-zA-Z0-9_]+) does not exist/i);
  return match ? match[1] : null;
}

/**
 * Saves or updates a table creation request directly in game_tables_data.
 */
export async function saveTableRequestToSupabase(request: {
  id: string;
  tableId?: string;
  roomCode?: string;
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
  createdAt?: number | string;
}): Promise<boolean> {
  const sb = getSupabaseServerClient();
  if (!sb) return false;

  try {
    const tableId = request.tableId || request.id;
    const isApproved = request.status === 'approved';
    const roomCode = (request.roomCode || Math.random().toString(36).substring(2, 8)).trim().toUpperCase();
    const nowIso = new Date().toISOString();
    const expiresAt = isApproved ? new Date(Date.now() + (request.validityHours || 24) * 3600 * 1000).toISOString() : null;

    // 1. Primary write: game_tables_data (compact layout)
    const primaryPayload: Record<string, any> = {
      id: tableId,
      code: roomCode,
      name: request.tableName.trim(),
      status: isApproved ? 'waiting' : request.status === 'declined' ? 'closed' : 'pending_approval',
      player_count: 0,
      expires_at: expiresAt,
      config: {
        is_private: Boolean(request.isPrivate),
        betting_duration: request.bettingDuration,
        validity_hours: request.validityHours,
        host: {
          id: request.userId,
          name: request.username,
        },
        approval: {
          admin_id: request.approvedByAdminId || null,
          admin_name: request.approvedByAdminName || null,
          approved_at: isApproved ? nowIso : null,
          message: request.adminMessage || null,
        },
      },
      player_stats: [],
      history: [],
      table_stats: { totalBets: 0, totalRounds: 0, totalPayouts: 0 },
      updated_at: nowIso,
    };

    let { error: pErr } = await sb.from(PRIMARY_TABLE).upsert(primaryPayload, { onConflict: 'id' });
    if (pErr) {
      console.warn(`[Server Supabase] ${PRIMARY_TABLE} saveTableRequest notice:`, pErr.message);
      return false;
    }

    console.log(`[Server Supabase] Table request for '${request.tableName}' (${tableId}) saved to ${PRIMARY_TABLE} (status=${primaryPayload.status}).`);
    return true;
  } catch (err) {
    console.warn('[Server Supabase] saveTableRequestToSupabase exception:', err);
    return false;
  }
}

/**
 * Fetches all pending table creation requests directly from game_tables_data.
 * Any table that is not approved (and not closed/declined) is treated as a request.
 */
export async function fetchPendingTableRequestsFromSupabase(): Promise<any[]> {
  const sb = getSupabaseServerClient();
  if (!sb) return [];

  const requestsMap = new Map<string, any>();

  try {
    const { data: primaryData, error: primaryErr } = await sb
      .from(PRIMARY_TABLE)
      .select('*')
      .neq('status', 'closed')
      .order('created_at', { ascending: false });

    if (!primaryErr && Array.isArray(primaryData)) {
      for (const raw of primaryData) {
        const norm = normalizeTableRecord(raw);
        if (!norm || !norm.id) continue;
        if (norm.id === 'public-royal-table' || norm.code === 'ROYAL1') continue;
        if (norm.status === 'closed' || norm.approval_status === 'declined') continue;

        const isApproved =
          norm.approval_status === 'approved' ||
          norm.approved === true ||
          (norm.status === 'active' && norm.approval_status !== 'pending');

        if (!isApproved) {
          const config = typeof raw.config === 'object' && raw.config !== null ? raw.config : {};
          const validityHours = config.validity_hours || 24;

          requestsMap.set(norm.id, {
            id: norm.id,
            tableId: norm.id,
            roomCode: norm.code,
            userId: norm.host_id,
            username: norm.host_name || 'Player',
            tableName: norm.name || `Table ${norm.code}`,
            isPrivate: Boolean(norm.is_private),
            bettingDuration: norm.betting_duration || 18,
            validityHours,
            status: 'pending',
            approvalStatus: norm.approval_status || 'pending',
            approved: false,
            createdAt: norm.created_at ? new Date(norm.created_at).getTime() : Date.now(),
          });
        }
      }
    }

    return Array.from(requestsMap.values());
  } catch (err) {
    console.warn('[Server Supabase] fetchPendingTableRequestsFromSupabase exception:', err);
    return [];
  }
}

/**
 * Safely inserts or updates a table record into Supabase game_tables_data.
 */
export async function saveTableToSupabaseSafe(tableRecord: any): Promise<boolean> {
  const sb = getSupabaseServerClient();
  if (!sb || !tableRecord?.id) return false;

  const norm = normalizeTableRecord(tableRecord) || tableRecord;
  const isApproved = norm.approved === true || norm.approval_status === 'approved';
  const nowIso = new Date().toISOString();

  try {
    const primaryPayload: Record<string, any> = {
      id: norm.id,
      code: (norm.code || '').trim().toUpperCase(),
      name: (norm.name || `Table ${norm.code}`).trim(),
      status: norm.status || (isApproved ? 'waiting' : 'pending_approval'),
      player_count: norm.player_count || 0,
      expires_at: norm.expires_at || null,
      config: {
        is_private: Boolean(norm.is_private),
        betting_duration: norm.betting_duration || 18,
        validity_hours: (tableRecord as any).validity_hours || (tableRecord as any).validityHours || 24,
        host: {
          id: norm.host_id || '',
          name: norm.host_name || 'Host',
        },
        approval: {
          admin_id: norm.approval_meta?.admin_id || null,
          admin_name: norm.approval_meta?.admin_name || null,
          approved_at: norm.approval_meta?.approved_at || (isApproved ? nowIso : null),
          message: norm.approval_meta?.message || null,
        },
      },
      player_stats: norm.player_stats || [],
      history: norm.history || [],
      table_stats: norm.table_stats || { totalBets: 0, totalRounds: 0, totalPayouts: 0 },
      created_at: norm.created_at || nowIso,
      updated_at: nowIso,
    };

    let { error: pErr } = await sb.from(PRIMARY_TABLE).upsert(primaryPayload, { onConflict: 'id' });
    if (pErr) {
      console.warn(`[Server Supabase] ${PRIMARY_TABLE} saveTableToSupabaseSafe notice:`, pErr.message);
      return false;
    }

    console.log(`[Server Supabase] Table ${norm.name} (${norm.id}) saved to ${PRIMARY_TABLE} (approved=${isApproved}, status=${norm.status})`);
    return true;
  } catch (pErr) {
    console.warn(`[Server Supabase] ${PRIMARY_TABLE} save exception:`, pErr);
    return false;
  }
}


