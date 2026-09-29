import crypto from 'crypto';
import { Server, Socket } from 'socket.io';
import {
  SymbolType,
  SYMBOL_KEYS,
  RoomState,
  RoomSettings,
  PlayerInRoom,
  RoundResultSummary,
  ChatMessage,
  FloatingReaction,
} from '../src/types.js';
import { db } from './db.js';
import {
  fetchTableFromSupabaseByCode,
  fetchTableFromSupabaseById,
  fetchActiveTablesFromSupabase,
  deleteTableFromSupabase,
  deleteZeroPlayerTablesFromSupabase,
  updateTableHostInSupabase,
  syncTableStateToSupabaseServer,
  SupabaseTableRecord,
} from './supabase.js';

export const RANDOM_PUBLIC_TABLE_NAMES = [
  'Royal Himalayan Pavilion',
  'Kathmandu Fortune Lounge',
  'Pokhara Golden Dice Arena',
  'Everest High Rollers Club',
  'Annapurna Silver Pavilion',
  'Langur Burja Heritage Hall',
  'Muktinath Lucky Pavilion',
  'Shangri-La Crown Arena',
  'Gurkha Rollers Pavilion',
  'Golden Pagoda Arena',
  'Namche Fortune Table',
  'Mustang Royal Lounge',
  'Sagarmatha Crown Table',
  'Thamel Night Rollers Club',
  'Lumbini Golden Pavilion',
  'Patan Royal Dice Lounge',
  'Bhaktapur Crown Pavilion',
  'Himalayan Velvet Arena',
  'Diamond Crown Table',
  'Chitwan Fortune Pavilion',
];

export function generateRandomTableName(): string {
  const base = RANDOM_PUBLIC_TABLE_NAMES[Math.floor(Math.random() * RANDOM_PUBLIC_TABLE_NAMES.length)];
  const num = Math.floor(100 + Math.random() * 900);
  return `${base} #${num}`;
}

export class GameEngine {
  public static readonly MAX_PLAYERS_PER_TABLE = 16;
  private io: Server;
  private rooms: Map<string, RoomState> = new Map();
  private roomIntervals: Map<string, NodeJS.Timeout> = new Map();
  private cleanupTimers: Map<string, NodeJS.Timeout> = new Map();
  private disconnectTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(io: Server) {
    this.io = io;
    this.ensureDefaultPublicRoom();
    this.hydrateFromSupabase().catch((err) => {
      console.warn('[GameEngine] Background hydration notice:', err);
    });

    // Server-Authoritative Cleanup & Periodic Background Garbage Collector:
    // Sweeps on startup and executes every 5 minutes (300,000 ms)
    this.runServerAuthoritativeGarbageCollector().catch(() => {});
    setInterval(() => {
      this.runServerAuthoritativeGarbageCollector().catch((err) => {
        console.warn('[Server GC] 5-minute background sweep notice:', err);
      });
    }, 5 * 60 * 1000);
  }

  /**
   * Ensures there is always at least one permanent, active public room for players to join.
   */
  public ensureDefaultPublicRoom(): RoomState {
    const existing = this.rooms.get('public-royal-table');
    if (existing) {
      this.cancelRoomCleanup('public-royal-table');
      return existing;
    }

    const defaultRoom: RoomState = {
      id: 'public-royal-table',
      code: 'ROYAL1',
      name: '👑 Royal Himalayan Pavilion',
      hostId: 'system_host',
      isPrivate: false,
      settings: {
        minBet: 10,
        maxBet: 50000,
        bettingDuration: 20,
        payoutDuration: 6,
        autoLoop: true,
        payoutMultiplierType: 'traditional',
      },
      phase: 'betting',
      timer: 20,
      phaseStartedAt: Date.now(),
      phaseEndsAt: Date.now() + 20000,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      validityDays: 365,
      validity_days: 365,
      validityHours: 365 * 24,
      dice: ['burja', 'jhanda', 'itta', 'paan', 'hukum', 'chidi'],
      roundNumber: 1,
      players: {},
      activeBotIds: ['patron_aarav', 'patron_sita', 'patron_dipen', 'patron_maya', 'patron_rohan'],
      tableBets: { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 },
      recentHistory: [],
      history: [],
      tableStats: {
        totalRounds: 0,
        totalBets: 0,
        totalPayouts: 0,
        highestRoundPool: 0,
      },
    };

    this.rooms.set('public-royal-table', defaultRoom);
    this.startRoomLoop('public-royal-table');
    return defaultRoom;
  }

  /**
   * Server-Authoritative Cleanup & Periodic Background Garbage Collector:
   * 1. Inspects active memory rooms and destroys any empty or abandoned rooms with 0 real human players.
   * 2. Clears associated intervals, cleanup timers, and disconnect grace timers.
   * 3. Purges residual, closed, and orphaned 0-player table records from Supabase.
   * 4. Returns comprehensive metrics of the sweep.
   */
  public async runServerAuthoritativeGarbageCollector(): Promise<{
    purgedMemoryRooms: number;
    purgedSupabaseTables: number;
    activeRoomsRemaining: number;
    timestamp: string;
  }> {
    let purgedMemoryCount = 0;
    try {
      const activeIdsWithRealPlayers: string[] = [];
      const now = Date.now();

      for (const [id, r] of this.rooms.entries()) {
        const expiresMs = r.expiresAt ? (typeof r.expiresAt === 'number' ? r.expiresAt : new Date(r.expiresAt).getTime()) : 0;
        const isExpired = expiresMs > 0 && now >= expiresMs;

        if (isExpired) {
          this.destroyRoom(id);
          deleteTableFromSupabase(id).catch(() => {});
          purgedMemoryCount++;
        } else {
          activeIdsWithRealPlayers.push(id);
        }
      }

      // Purge expired tables in Supabase
      const purgedSupabase = await deleteZeroPlayerTablesFromSupabase(activeIdsWithRealPlayers);

      console.log(
        `[Server GC] 5-Minute Garbage Collector executed. Cleaned up ${purgedMemoryCount} expired memory rooms, ${purgedSupabase} expired Supabase rows. Active unexpired rooms: ${this.rooms.size}.`
      );

      return {
        purgedMemoryRooms: purgedMemoryCount,
        purgedSupabaseTables: purgedSupabase,
        activeRoomsRemaining: this.rooms.size,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      console.warn('[Server GC] Error running garbage collector:', err);
      return {
        purgedMemoryRooms: purgedMemoryCount,
        purgedSupabaseTables: 0,
        activeRoomsRemaining: this.rooms.size,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Purges residual 0-player tables and redundant entries from Supabase.
   */
  public async purgeZeroPlayerTables(): Promise<void> {
    await this.runServerAuthoritativeGarbageCollector();
  }

  /**
   * Hydrates active tables from Supabase into memory on server start.
   */
  public async hydrateFromSupabase(): Promise<void> {
    try {
      const records = await fetchActiveTablesFromSupabase();
      if (records && records.length > 0) {
        const now = Date.now();
        for (const rec of records) {
          // Immediately purge tables that are already expired or explicitly closed
          const isExpired = rec.expires_at ? new Date(rec.expires_at).getTime() <= now : false;
          if (isExpired || rec.status === 'closed' || rec.id === 'public-royal-table') {
            deleteTableFromSupabase(rec.id).catch(() => {});
            continue;
          }
          if (!this.rooms.has(rec.id)) {
            this.instantiateRoomFromRecord(rec);
          }
        }
      }
    } catch (err) {
      console.warn('[GameEngine] hydrateFromSupabase error:', err);
    }
  }

  public scheduleRoomCleanup(roomId: string, delayMs = 600000) {
    this.cancelRoomCleanup(roomId);
    const timeout = setTimeout(() => {
      this.cleanupTimers.delete(roomId);
      const room = this.rooms.get(roomId);
      if (room && Object.keys(room.players).length === 0) {
        console.log(`[GameEngine] Cleaning up idle empty room ${roomId} (${room.code})`);
        this.destroyRoom(roomId);
      }
    }, delayMs);
    this.cleanupTimers.set(roomId, timeout);
  }

  public cancelRoomCleanup(roomId: string) {
    const existing = this.cleanupTimers.get(roomId);
    if (existing) {
      clearTimeout(existing);
      this.cleanupTimers.delete(roomId);
    }
  }

  /**
   * Instantiates a RoomState object from a Supabase record and boots its game loop.
   */
  public instantiateRoomFromRecord(record: SupabaseTableRecord | any): RoomState | null {
    if (!record || !record.id) return null;

    // Strict Table Approval Check: Never instantiate unapproved or pending tables
    if (record.approved === false || record.approval_status === 'pending' || record.status === 'pending_approval' || record.approval_status === 'declined') {
      console.log(`[GameEngine] Refusing to instantiate unapproved/pending table ${record.name || record.id} (${record.code})`);
      return null;
    }

    const existing = this.rooms.get(record.id);
    if (existing) {
      this.cancelRoomCleanup(existing.id);
      return existing;
    }

    const settings: RoomSettings = {
      minBet: 10,
      maxBet: 50000,
      bettingDuration: record.betting_duration || 18,
      payoutDuration: 6,
      autoLoop: true,
      payoutMultiplierType: 'traditional',
    };

    const restoredPlayers: Record<string, PlayerInRoom> = {};
    const playerDataSource = (Array.isArray(record.player_stats) && record.player_stats.length > 0)
      ? record.player_stats
      : (Array.isArray(record.players) ? record.players : []);

    for (const p of playerDataSource) {
      if (p && p.id) {
        restoredPlayers[p.id] = {
          id: p.id,
          username: p.username || 'Player',
          avatar: p.avatar || '🎲',
          coins: typeof p.coins === 'number' ? p.coins : 10000,
          isHost: Boolean(p.isHost || p.id === record.host_id),
          bets: { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 },
          totalBetThisRound: 0,
          sessionStats: {
            joinedAt: p.joinedAt || p.lastActive || Date.now(),
            initialCoins: p.initialCoins || p.coins || 10000,
            roundsPlayed: p.roundsPlayed || 0,
            roundsWon: p.roundsWon || 0,
            totalBet: p.totalBet || 0,
            totalWon: p.totalWon || 0,
            netProfit: p.netProfit || 0,
            biggestWin: p.biggestWin || 0,
            winRate: p.winRate || 0,
            history: p.history || [],
          },
          equipped: p.equipped || { diceSkin: 'dice_classic', tableMat: 'mat_velvet_green', title: 'Novice' },
          lastActive: p.lastActive || Date.now(),
        };
      }
    }

    const now = Date.now();
    const validityDays = record.validity_days || 7;
    const expiresAt = record.expires_at || new Date(now + validityDays * 24 * 60 * 60 * 1000).toISOString();

    const room: RoomState = {
      id: record.id,
      code: record.code.toUpperCase(),
      name: record.name || "Friend's Table",
      hostId: record.host_id,
      isPrivate: record.is_private ?? false,
      settings,
      phase: record.status === 'waiting' ? 'waiting' : 'betting',
      timer: settings.bettingDuration,
      phaseStartedAt: record.status === 'waiting' ? undefined : now,
      phaseEndsAt: record.status === 'waiting' ? undefined : now + (settings.bettingDuration * 1000),
      expiresAt,
      expires_at: expiresAt,
      validityDays,
      validity_days: validityDays,
      dice: ['burja', 'jhanda', 'burja', 'itta', 'paan', 'chidi'],
      roundNumber: (record.table_stats?.totalRounds || 0) + 1,
      players: restoredPlayers,
      tableBets: { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 },
      recentHistory: [],
      history: record.history || [],
      tableStats: record.table_stats || {
        totalRounds: Math.max(0, record.table_stats?.totalRounds || 0),
        totalBets: 0,
        totalPayouts: 0,
        highestRoundPool: 0,
      },
    };

    this.rooms.set(room.id, room);
    this.startRoomLoop(room.id);
    return room;
  }

  /**
   * Attempts to restore a table by its code from Supabase or provided client cache.
   */
  public async restoreRoomByCode(code: string, fallbackData?: any): Promise<RoomState | null> {
    const clean = code.trim().toUpperCase();
    const existing = this.getRoomByCode(clean);
    if (existing) {
      this.cancelRoomCleanup(existing.id);
      return existing;
    }

    // Query Supabase
    let record = await fetchTableFromSupabaseByCode(clean);
    if (!record && fallbackData && typeof fallbackData === 'object' && (fallbackData.code || fallbackData.id)) {
      record = fallbackData;
    }

    if (record) {
      return this.instantiateRoomFromRecord(record);
    }
    return null;
  }

  /**
   * Attempts to restore a table by its room ID from Supabase or provided client cache.
   */
  public async restoreRoomById(roomId: string, fallbackData?: any): Promise<RoomState | null> {
    const existing = this.rooms.get(roomId);
    if (existing) {
      this.cancelRoomCleanup(existing.id);
      return existing;
    }

    let record = await fetchTableFromSupabaseById(roomId);
    if (!record && fallbackData && typeof fallbackData === 'object' && fallbackData.id) {
      record = fallbackData;
    }

    if (record) {
      return this.instantiateRoomFromRecord(record);
    }
    return null;
  }

  public getPublicRooms(): { id: string; name: string; code: string; playerCount: number; phase: string; timer: number }[] {
    this.ensureDefaultPublicRoom();
    const list: { id: string; name: string; code: string; playerCount: number; phase: string; timer: number }[] = [];
    const now = Date.now();
    for (const r of this.rooms.values()) {
      const expiresMs = r.expiresAt ? (typeof r.expiresAt === 'number' ? r.expiresAt : new Date(r.expiresAt).getTime()) : 0;
      const isExpired = expiresMs > 0 && now >= expiresMs;
      if (isExpired) continue;

      const realPlayers = Object.values(r.players || {}).filter(
        (p) => !p.id.startsWith('patron_') && !p.id.startsWith('bot_')
      );
      if (!r.isPrivate) {
        // Active table player count (at least bots count if bots present or real players)
        const botCount = (r.activeBotIds || []).length;
        const totalCount = realPlayers.length > 0 ? realPlayers.length : (botCount > 0 ? botCount : 1);
        list.push({
          id: r.id,
          name: r.name,
          code: r.code,
          playerCount: totalCount,
          phase: r.phase,
          timer: r.timer,
        });
      }
    }
    return list;
  }

  public getRoomByCode(code: string): RoomState | null {
    const clean = code.trim().toUpperCase();
    for (const r of this.rooms.values()) {
      if (r.code === clean) return r;
    }
    // Fuzzy 0 vs O matching to prevent code confusion
    if (clean.includes('0') || clean.includes('O')) {
      const alt = clean.includes('0') ? clean.replace(/0/g, 'O') : clean.replace(/O/g, '0');
      for (const r of this.rooms.values()) {
        if (r.code === alt) return r;
      }
    }
    return null;
  }

  public getRoom(roomId: string): RoomState | null {
    return this.rooms.get(roomId) || null;
  }

  public createRoom(
    hostUser: { id: string; username: string; avatar: string; coins: number; equipped: any },
    name: string,
    isPrivate: boolean,
    customSettings?: Partial<RoomSettings>,
    validityHoursOrDays: number = 24,
    isHours: boolean = true
  ): RoomState {
    // Ensure the host is cleanly removed from any other table they might have been in
    for (const [otherRoomId, otherRoom] of this.rooms.entries()) {
      if (otherRoom.players[hostUser.id]) {
        this.executePlayerRemoval(otherRoomId, hostUser.id, true);
      }
    }

    const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const settings: RoomSettings = {
      minBet: customSettings?.minBet || 10,
      maxBet: customSettings?.maxBet || 25000,
      bettingDuration: customSettings?.bettingDuration || 20,
      payoutDuration: customSettings?.payoutDuration || 6,
      autoLoop: customSettings?.autoLoop ?? true,
      payoutMultiplierType: customSettings?.payoutMultiplierType || 'traditional',
    };

    const now = Date.now();
    const effectiveHours = isHours ? Math.max(1, validityHoursOrDays) : Math.max(1, validityHoursOrDays * 24);
    const effectiveDays = Math.max(1, Math.ceil(effectiveHours / 24));
    const expiresAt = new Date(now + effectiveHours * 60 * 60 * 1000).toISOString();

    const room: RoomState = {
      id: roomId,
      code,
      name: name.trim() || `${hostUser.username}'s Arena`,
      hostId: hostUser.id,
      isPrivate,
      settings,
      phase: 'waiting', // Wait until host clicks Enter Table as Host
      timer: settings.bettingDuration,
      phaseStartedAt: undefined,
      phaseEndsAt: now + (settings.bettingDuration * 1000),
      expiresAt,
      expires_at: expiresAt,
      validityDays: effectiveDays,
      validity_days: effectiveDays,
      validityHours: effectiveHours,
      dice: ['burja', 'jhanda', 'itta', 'paan', 'hukum', 'chidi'],
      roundNumber: 1,
      players: {},
      activeBotIds: isPrivate ? [] : ['patron_aarav', 'patron_sita', 'patron_dipen', 'patron_maya', 'patron_rohan'],
      tableBets: { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 },
      recentHistory: [],
      history: [],
      tableStats: {
        totalRounds: 0,
        totalBets: 0,
        totalPayouts: 0,
        highestRoundPool: 0,
      },
    };

    this.rooms.set(roomId, room);
    this.startRoomLoop(roomId);

    // Sync initial table creation to Supabase
    if (room.id !== 'public-royal-table') {
      syncTableStateToSupabaseServer(room).catch((err) => {
        console.warn('[GameEngine] Supabase table create sync notice:', err);
      });
    }

    return room;
  }

  public joinRoom(
    socket: Socket,
    roomId: string,
    user: { id: string; username: string; avatar: string; coins: number; equipped: any }
  ): { success: boolean; room?: RoomState; message?: string; reconnected?: boolean } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, message: 'Room does not exist' };

    // Remove user from any OTHER table they may currently be in so they are free to join this table
    for (const [otherRoomId, otherRoom] of this.rooms.entries()) {
      if (otherRoomId !== roomId && otherRoom.players[user.id]) {
        this.leaveRoom(socket, otherRoomId, user.id);
      }
    }

    // Cancel any scheduled room cleanup timer since player is joining/active
    this.cancelRoomCleanup(roomId);

    // Cancel any pending disconnect grace timer for this user
    const timerKey = `${roomId}:${user.id}`;
    const pendingDisconnectTimer = this.disconnectTimers.get(timerKey);
    if (pendingDisconnectTimer) {
      clearTimeout(pendingDisconnectTimer);
      this.disconnectTimers.delete(timerKey);
    }

    // Fresh user data from DB to ensure accurate coins
    const freshUser = db.getOrCreateUser(user.id, user.username, user.avatar, user.coins);

    // Check if player already exists in room (reconnection scenario)
    let existingPlayer = room.players[user.id];
    if (!existingPlayer) {
      // Also check if existing entry exists by matching username
      for (const [existingId, existingP] of Object.entries(room.players)) {
        if (
          existingId === user.id ||
          (existingP.username && user.username && existingP.username.trim().toLowerCase() === user.username.trim().toLowerCase())
        ) {
          existingPlayer = existingP;
          if (existingId !== user.id) {
            delete room.players[existingId];
          }
          break;
        }
      }
    }

    // Maximum 16 players per table enforcement
    if (!existingPlayer && Object.keys(room.players).length >= GameEngine.MAX_PLAYERS_PER_TABLE) {
      return { success: false, message: `This table is full (maximum ${GameEngine.MAX_PLAYERS_PER_TABLE} players reached).` };
    }

    let isReconnection = false;
    let player: PlayerInRoom;

    // Check if other real human players exist in the room
    const otherRealPlayers = Object.values(room.players).filter(
      (p) => p.id !== user.id && !p.id.startsWith('patron_') && !p.id.startsWith('bot_') && p.id !== 'system_host' && p.id !== 'system'
    );

    // If joining the default public table or a room where host is system/absent,
    // and there are no other real human players present, make this user the leader/host!
    const shouldBeHost =
      otherRealPlayers.length === 0 &&
      (room.id === 'public-royal-table' ||
        room.code === 'ROYAL1' ||
        room.hostId === 'system_host' ||
        room.hostId === 'system' ||
        !room.players[room.hostId]);

    if (shouldBeHost) {
      room.hostId = user.id;
    }

    if (existingPlayer) {
      isReconnection = true;
      existingPlayer.id = user.id;
      existingPlayer.username = user.username;
      existingPlayer.avatar = user.avatar || existingPlayer.avatar;
      existingPlayer.coins = freshUser.coins;
      existingPlayer.isHost = shouldBeHost || room.hostId === user.id;
      existingPlayer.isDisconnected = false;
      delete existingPlayer.disconnectedAt;
      existingPlayer.lastActive = Date.now();
      if (user.equipped) {
        existingPlayer.equipped = user.equipped;
      }
      player = existingPlayer;
      room.players[user.id] = player;
    } else {
      player = {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        coins: freshUser.coins,
        isHost: shouldBeHost || room.hostId === user.id,
        bets: { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 },
        totalBetThisRound: 0,
        sessionStats: {
          joinedAt: Date.now(),
          initialCoins: freshUser.coins,
          roundsPlayed: 0,
          roundsWon: 0,
          totalBet: 0,
          totalWon: 0,
          netProfit: 0,
          biggestWin: 0,
          winRate: 0,
          history: [],
        },
        equipped: user.equipped || { diceSkin: 'dice_classic', tableMat: 'mat_velvet_green', title: 'Novice' },
        lastActive: Date.now(),
        isDisconnected: false,
      };
      room.players[user.id] = player;
    }

    socket.join(`room:${roomId}`);

    if (isReconnection) {
      this.broadcastSystemChat(roomId, `⚡ ${user.username} reconnected.`);
    } else {
      this.broadcastSystemChat(roomId, `${user.username} joined the pavilion.`);
    }

    this.io.to(`room:${roomId}`).emit('room:player_joined', { player, roomState: room, isReconnection });

    return { success: true, room, reconnected: isReconnection };
  }

  /**
   * When player is offline or disconnected, immediately remove them from the table.
   * If there are no players left or if only 1 player was at the table, prune and delete the table immediately.
   */
  public handlePlayerDisconnect(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.players[userId];
    if (!player) return;

    const timerKey = `${roomId}:${userId}`;
    const existing = this.disconnectTimers.get(timerKey);
    if (existing) {
      clearTimeout(existing);
      this.disconnectTimers.delete(timerKey);
    }

    // Immediately remove offline player from table and prune/delete table if 0 players remain
    this.executePlayerRemoval(roomId, userId, false);
  }

  /**
   * Explicit player exit (User clicked leave table or return to menu)
   */
  public leaveRoom(socket: Socket, roomId: string, userId: string): void {
    const timerKey = `${roomId}:${userId}`;
    const existing = this.disconnectTimers.get(timerKey);
    if (existing) {
      clearTimeout(existing);
      this.disconnectTimers.delete(timerKey);
    }

    socket.leave(`room:${roomId}`);
    this.executePlayerRemoval(roomId, userId, true);
  }

  /**
   * Internal player removal with uninterrupted game continuation & host migration
   */
  private executePlayerRemoval(roomId: string, userId: string, isExplicitLeave: boolean): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.players[userId];
    if (!player) return;

    // Refund active round bets ONLY if explicitly leaving during betting phase
    if (isExplicitLeave && room.phase === 'betting' && player.totalBetThisRound > 0) {
      db.atomicRefundBet(userId, player.totalBetThisRound);
      for (const k of SYMBOL_KEYS) {
        room.tableBets[k] = Math.max(0, (room.tableBets[k] || 0) - (player.bets[k] || 0));
      }
    }

    delete room.players[userId];
    this.broadcastSystemChat(roomId, `${player.username} ${isExplicitLeave ? 'left' : 'disconnected from'} the pavilion.`);

    // Clean up any Next Round vote for this user
    room.nextRoundVotes = (room.nextRoundVotes || []).filter((id) => id !== userId);

    const remainingPlayers = Object.values(room.players);
    const remainingRealPlayers = remainingPlayers.filter(
      (p) => !p.id.startsWith('patron_') && !p.id.startsWith('bot_')
    );
    const remainingPlayerIds = remainingRealPlayers.map((p) => p.id);

    // If no real players remain at the table (0 real players), delete the table (unless it is the permanent public pavilion)
    if (remainingRealPlayers.length === 0) {
      if (roomId === 'public-royal-table') {
        room.hostId = 'system_host';
        room.phase = 'waiting';
        room.tableBets = { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 };
        syncTableStateToSupabaseServer(room).catch(() => {});
        this.io.to(`room:${roomId}`).emit('room:player_left', { userId, roomState: room, tableClosed: false });
        this.io.emit('rooms:updated', { rooms: this.getPublicRooms() });
        return;
      }

      // Automatically delete and purge table from memory and Supabase
      this.destroyRoom(roomId);
      this.io.to(`room:${roomId}`).emit('room:player_left', { userId, roomState: room, tableClosed: true });
      this.io.to(`room:${roomId}`).emit('room:disbanded', { reason: 'No real players remain. Table closed.' });
      this.io.emit('rooms:updated', { rooms: this.getPublicRooms() });
      return;
    }

    // If in payout phase, check if remaining players have all voted to advance
    if (room.phase === 'payout' && remainingPlayerIds.length > 0) {
      const connectedRemaining = remainingPlayers.filter((p) => !p.isDisconnected);
      const checkList = connectedRemaining.length > 0 ? connectedRemaining.map((p) => p.id) : remainingPlayerIds;
      const allReady = checkList.every((id) => room.nextRoundVotes!.includes(id));
      this.io.to(`room:${roomId}`).emit('game:next_round_votes', {
        votes: room.nextRoundVotes,
        totalPlayers: remainingPlayerIds.length,
        allReady,
        voterId: userId,
      });
      if (allReady) {
        this.startNewRound(room);
      }
    }

    // Host migration if table owner left/disconnected permanently
    if (room.hostId === userId) {
      if (remainingPlayerIds.length > 0) {
        // Prefer a currently connected player as the new host
        const connectedCandidate = remainingPlayers.find((p) => !p.isDisconnected);
        const newHostId = connectedCandidate ? connectedCandidate.id : remainingPlayerIds[0];
        room.hostId = newHostId;
        if (room.players[newHostId]) {
          room.players[newHostId].isHost = true;
        }

        this.broadcastSystemChat(
          roomId,
          `👑 Host privileges transferred to ${room.players[newHostId]?.username || 'player'}. Game continues!`
        );

        // Emit host migration event to all clients in room
        this.io.to(`room:${roomId}`).emit('room:host_migrated', {
          newHostId,
          newHostName: room.players[newHostId]?.username || 'New Host',
          roomState: room,
        });

        // Sync new host in Supabase
        updateTableHostInSupabase(
          roomId,
          newHostId,
          room.players[newHostId]?.username || 'Host',
          remainingPlayerIds.length
        ).catch((err) => {
          console.warn('[GameEngine] Failed to sync new host to Supabase:', err);
        });
      }
    }

    // Sync updated player count in Supabase
    syncTableStateToSupabaseServer(room).catch((err) => {
      console.warn('[GameEngine] Failed to sync updated table state to Supabase:', err);
    });

    this.io.to(`room:${roomId}`).emit('room:player_left', { userId, roomState: room });
  }

  public placeBet(
    roomId: string,
    userId: string,
    symbol: SymbolType,
    amount: number
  ): { success: boolean; message: string; room?: RoomState } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, message: 'Room not found' };

    if (room.phase !== 'betting') {
      return { success: false, message: 'Betting is currently closed for this roll' };
    }

    const player = room.players[userId];
    if (!player) return { success: false, message: 'Player is not in room' };

    if (amount <= 0 || !Number.isInteger(amount)) {
      return { success: false, message: 'Invalid bet amount' };
    }

    if (amount < room.settings.minBet) {
      return { success: false, message: `Minimum bet is ${room.settings.minBet} coins` };
    }

    const newTotalForSymbol = (player.bets[symbol] || 0) + amount;
    if (newTotalForSymbol > room.settings.maxBet) {
      return { success: false, message: `Maximum bet per symbol is ${room.settings.maxBet} coins` };
    }

    // Atomic deduction in server database
    const deducted = db.atomicDeductBet(userId, amount, symbol);
    if (!deducted) {
      return { success: false, message: 'Insufficient coin balance! Claim free faucet or lower your bet.' };
    }

    player.coins -= amount;
    player.bets[symbol] = newTotalForSymbol;
    player.totalBetThisRound += amount;
    room.tableBets[symbol] = (room.tableBets[symbol] || 0) + amount;

    // Broadcast updated bets
    this.io.to(`room:${roomId}`).emit('game:bet_placed', {
      userId,
      symbol,
      amount,
      playerBets: player.bets,
      playerCoins: player.coins,
      tableBets: room.tableBets,
    });

    return { success: true, message: 'Bet placed successfully!', room };
  }

  public clearBets(roomId: string, userId: string): { success: boolean; message: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, message: 'Room not found' };

    if (room.phase !== 'betting') {
      return { success: false, message: 'Cannot clear bets after countdown ends' };
    }

    const player = room.players[userId];
    if (!player || player.totalBetThisRound === 0) {
      return { success: false, message: 'No active bets to clear' };
    }

    const refundAmount = player.totalBetThisRound;
    db.atomicRefundBet(userId, refundAmount);

    for (const k of SYMBOL_KEYS) {
      room.tableBets[k] = Math.max(0, (room.tableBets[k] || 0) - player.bets[k]);
      player.bets[k] = 0;
    }
    player.coins += refundAmount;
    player.totalBetThisRound = 0;

    this.io.to(`room:${roomId}`).emit('game:bets_cleared', {
      userId,
      playerCoins: player.coins,
      playerBets: player.bets,
      tableBets: room.tableBets,
    });

    return { success: true, message: `Refunded ${refundAmount} coins.` };
  }

  // --- Host Permissions & Controls ---

  public hostStartGame(roomId: string, hostUserId: string): { success: boolean; message: string; room?: RoomState } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, message: 'Room not found' };

    if (room.hostId !== hostUserId && room.id !== 'public-royal-table') {
      return { success: false, message: 'Only the room host can start the game' };
    }

    if (room.phase !== 'waiting') {
      return { success: true, message: 'Game already active', room };
    }

    const now = Date.now();
    room.phase = 'betting';
    room.timer = room.settings.bettingDuration;
    room.phaseStartedAt = now;
    room.phaseEndsAt = now + (room.settings.bettingDuration * 1000);
    room.nextRoundVotes = [];

    this.broadcastSystemChat(roomId, `🎲 The table host has officially entered and opened betting! Place your wagers.`);

    this.io.to(`room:${roomId}`).emit('game:started_by_host', {
      phase: 'betting',
      timer: room.timer,
      phaseEndsAt: room.phaseEndsAt,
      roundNumber: room.roundNumber,
      roomState: room,
    });

    // Ensure room loop interval is active and ticking
    this.startRoomLoop(roomId);

    if (room.id !== 'public-royal-table') {
      syncTableStateToSupabaseServer(room).catch((err) => {
        console.warn('[GameEngine] Supabase table start sync notice:', err);
      });
    }

    return { success: true, message: 'Table started by host', room };
  }

  public forceRollNow(roomId: string, hostUserId: string): { success: boolean; message: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, message: 'Room not found' };

    if (room.hostId !== hostUserId && room.id !== 'public-royal-table') {
      return { success: false, message: 'Only the room host can force roll' };
    }

    if (room.phase !== 'betting') {
      return { success: false, message: 'Cannot force roll outside betting phase' };
    }

    // Force trigger roll immediately
    room.timer = 0;
    this.executeRoll(room);
    return { success: true, message: 'Dice roll initiated by host!' };
  }

  public hostStartNextRound(roomId: string, hostUserId: string): { success: boolean; message: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, message: 'Room not found' };

    if (room.hostId !== hostUserId && room.id !== 'public-royal-table') {
      return { success: false, message: 'Only the table leader can advance to next round' };
    }

    if (room.phase !== 'payout') {
      return { success: false, message: 'Cannot start next round outside results phase' };
    }

    this.startNewRound(room);
    return { success: true, message: 'Next round started immediately by table leader!' };
  }

  public updateRoomSettings(
    roomId: string,
    hostUserId: string,
    newSettings: Partial<RoomSettings>
  ): { success: boolean; message: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, message: 'Room not found' };

    if (room.hostId !== hostUserId) {
      return { success: false, message: 'Only the host can modify room settings' };
    }

    if (newSettings.bettingDuration !== undefined) {
      room.settings.bettingDuration = Math.max(8, Math.min(60, newSettings.bettingDuration));
    }
    if (newSettings.minBet !== undefined) {
      room.settings.minBet = Math.max(1, newSettings.minBet);
    }
    if (newSettings.maxBet !== undefined) {
      room.settings.maxBet = Math.max(room.settings.minBet, newSettings.maxBet);
    }
    if (newSettings.autoLoop !== undefined) {
      room.settings.autoLoop = Boolean(newSettings.autoLoop);
    }

    this.io.to(`room:${roomId}`).emit('room:settings_updated', { settings: room.settings });
    return { success: true, message: 'Settings updated successfully' };
  }

  public kickPlayer(roomId: string, hostUserId: string, targetUserId: string): { success: boolean; message: string; room?: RoomState } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, message: 'Room not found' };

    if (room.hostId !== hostUserId) {
      return { success: false, message: 'Only the room host can kick players' };
    }

    if (targetUserId === hostUserId) {
      return { success: false, message: 'Host cannot kick themselves' };
    }

    const targetPlayer = room.players[targetUserId];
    if (!targetPlayer) return { success: false, message: 'Player not found in room' };

    // Refund active bet
    if (room.phase === 'betting' && targetPlayer.totalBetThisRound > 0) {
      db.atomicRefundBet(targetUserId, targetPlayer.totalBetThisRound);
      for (const k of SYMBOL_KEYS) {
        room.tableBets[k] -= targetPlayer.bets[k];
      }
    }

    delete room.players[targetUserId];
    room.nextRoundVotes = (room.nextRoundVotes || []).filter((id) => id !== targetUserId);

    this.broadcastSystemChat(roomId, `⚠️ ${targetPlayer.username} was removed by the host.`);
    this.io.to(`room:${roomId}`).emit('room:player_kicked', { userId: targetUserId, roomState: room });

    const remainingPlayerIds = Object.keys(room.players);

    // If in payout phase, check if remaining players have all voted
    if (room.phase === 'payout' && remainingPlayerIds.length > 0) {
      const allReady = remainingPlayerIds.every((id) => room.nextRoundVotes!.includes(id));
      this.io.to(`room:${roomId}`).emit('game:next_round_votes', {
        votes: room.nextRoundVotes,
        totalPlayers: remainingPlayerIds.length,
        allReady,
        voterId: targetUserId,
      });
      if (allReady) {
        this.startNewRound(room);
      }
    }

    // If no players remain after kick, delete table and destroy room
    if (remainingPlayerIds.length === 0) {
      this.destroyRoom(roomId);
      return { success: true, message: `Player ${targetPlayer.username} removed. Table closed.`, room };
    }

    // Sync updated table state to Supabase
    syncTableStateToSupabaseServer(room).catch((err) => {
      console.warn('[GameEngine] Supabase kick sync notice:', err);
    });

    return { success: true, message: `Player ${targetPlayer.username} kicked.`, room };
  }

  public requestTransferLeadership(roomId: string, requesterId: string, targetUserId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, message: 'Room not found' };
    if (room.hostId !== requesterId) {
      return { success: false, message: 'Only the Table Leader can transfer leadership' };
    }
    if (targetUserId === requesterId) {
      return { success: false, message: 'You are already the Table Leader' };
    }
    const targetPlayer = room.players[targetUserId];
    if (!targetPlayer) {
      return { success: false, message: 'Player not found in room' };
    }
    const requesterPlayer = room.players[requesterId];
    const requesterName = requesterPlayer ? requesterPlayer.username : 'Table Leader';

    // Notify the target user
    this.io.to(`room:${roomId}`).emit('table:leadership_offered', {
      roomId,
      targetUserId,
      requesterId,
      requesterName,
      tableName: room.name,
    });

    return { success: true, message: `Leadership offer sent to ${targetPlayer.username}.` };
  }

  public respondTransferLeadership(roomId: string, targetUserId: string, accepted: boolean) {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, message: 'Room not found' };
    const targetPlayer = room.players[targetUserId];
    if (!targetPlayer) return { success: false, message: 'Player not found in room' };

    const oldHostId = room.hostId;
    const oldHostPlayer = room.players[oldHostId];

    if (accepted) {
      // Transfer leadership
      room.hostId = targetUserId;
      if (oldHostPlayer) {
        oldHostPlayer.isHost = false;
      }
      targetPlayer.isHost = true;

      this.broadcastSystemChat(roomId, `👑 ${targetPlayer.username} is now the Table Leader!`);
      this.io.to(`room:${roomId}`).emit('table:leadership_transferred', {
        newHostId: targetUserId,
        newHostName: targetPlayer.username,
        oldHostId,
        roomState: room,
      });

      // Sync updated table state to Supabase
      if (room.id !== 'public-royal-table') {
        syncTableStateToSupabaseServer(room).catch((err) => {
          console.warn('[GameEngine] Supabase leadership sync notice:', err);
        });
      }

      return { success: true, message: `${targetPlayer.username} accepted Table Leadership.`, newHostId: targetUserId };
    } else {
      // Declined
      this.io.to(`room:${roomId}`).emit('table:leadership_declined', {
        targetUserId,
        targetUserName: targetPlayer.username,
        hostId: oldHostId,
      });
      return { success: true, message: `${targetPlayer.username} declined Table Leadership.` };
    }
  }

  // --- Automated Game Loop Logic ---

  private startRoomLoop(roomId: string) {
    if (this.roomIntervals.has(roomId)) return;

    const interval = setInterval(() => {
      const room = this.rooms.get(roomId);
      if (!room) {
        clearInterval(interval);
        this.roomIntervals.delete(roomId);
        return;
      }

      // Check if table validity has expired (timed in hours / days)
      if (room.expiresAt) {
        const expiresMs = typeof room.expiresAt === 'number' ? room.expiresAt : new Date(room.expiresAt).getTime();
        if (Date.now() >= expiresMs) {
          console.log(`[GameEngine] Table ${roomId} (${room.name}) timed validity expired. Deleting table.`);
          this.io.to(`room:${roomId}`).emit('room:disbanded', { reason: 'Table duration has expired.' });
          this.destroyRoom(roomId);
          deleteTableFromSupabase(roomId).catch(() => {});
          return;
        }
      }

      // If room has 0 players, keep room alive in 'waiting' phase until time expires
      if (!room.players || Object.keys(room.players).length === 0) {
        if (room.phase !== 'waiting') {
          room.phase = 'waiting';
          room.tableBets = { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 };
        }
        return;
      }

      if (room.phase === 'betting') {
        const now = Date.now();
        const duration = room.settings.bettingDuration || 18;
        const phaseStart = room.phaseStartedAt || (room.phaseEndsAt ? room.phaseEndsAt - duration * 1000 : now);
        const elapsedSec = Math.floor((now - phaseStart) / 1000);
        const remaining = Math.max(0, duration - elapsedSec);
        room.timer = remaining;
        this.io.to(`room:${roomId}`).emit('game:timer_tick', {
          phase: 'betting',
          timer: remaining,
          phaseEndsAt: room.phaseEndsAt,
          roundNumber: room.roundNumber,
        });

        if (remaining <= 0) {
          this.executeRoll(room);
        }
      } else if (room.phase === 'payout') {
        const playerIds = Object.keys(room.players || {}).filter(
          (id) => !room.players[id].isDisconnected
        );
        const votes = room.nextRoundVotes || [];
        const allReady = playerIds.length > 0 && playerIds.every((id) => votes.includes(id));

        this.io.to(`room:${roomId}`).emit('game:timer_tick', {
          phase: 'payout',
          timer: Math.max(0, room.timer),
          roundNumber: room.roundNumber,
          votesCount: votes.length,
          totalPlayers: playerIds.length,
          allReady,
        });

        // Advance to next round ONLY when all connected players have voted
        if (allReady) {
          this.startNewRound(room);
        }
      }
    }, 1000);

    this.roomIntervals.set(roomId, interval);
  }

  /**
   * Cryptographically secure roll of 6 Langur Burja dice
   */
  private generateSecureDice(): SymbolType[] {
    const dice: SymbolType[] = [];
    for (let i = 0; i < 6; i++) {
      const idx = crypto.randomInt(0, SYMBOL_KEYS.length);
      dice.push(SYMBOL_KEYS[idx]);
    }
    return dice;
  }

  /**
   * Transition to Rolling Phase
   */
  private executeRoll(room: RoomState) {
    room.phase = 'rolling';
    const rolledDice = this.generateSecureDice();
    room.dice = rolledDice;
    room.timer = 4; // 3.8 - 4 seconds rolling animation
    room.phaseEndsAt = Date.now() + 3800;

    this.io.to(`room:${room.id}`).emit('game:phase_rolling', {
      dice: rolledDice,
      duration: 3800,
      roundNumber: room.roundNumber,
    });

    // Schedule payout transition after suspenseful 3.8s roll animation
    setTimeout(() => {
      const currentRoom = this.rooms.get(room.id);
      if (currentRoom && currentRoom.phase === 'rolling') {
        this.executePayout(currentRoom);
      }
    }, 3800);
  }

  /**
   * Calculate Langur Burja Authentic Payouts
   * 
   * Classic Rules:
   * - 6 dice are rolled.
   * - Count occurrences of each symbol.
   * - Symbol count = 0 or 1: Bet lost.
   * - Symbol count >= 2: Player receives their bet back PLUS count * bet!
   *   e.g. 2 dice = 2:1 profit (3x stake return)
   *        3 dice = 3:1 profit (4x stake return)
   *        4 dice = 4:1 profit (5x stake return)
   *        5 dice = 5:1 profit (6x stake return)
   *        6 dice = 6:1 profit (7x Jackpot return!)
   */
  private executePayout(room: RoomState) {
    room.phase = 'payout';
    room.timer = room.settings.payoutDuration || 6;
    room.phaseEndsAt = Date.now() + ((room.settings.payoutDuration || 6) * 1000);
    room.nextRoundVotes = [];

    // Count symbol frequencies
    const counts: Record<SymbolType, number> = {
      jhanda: 0,
      burja: 0,
      itta: 0,
      paan: 0,
      hukum: 0,
      chidi: 0,
    };
    for (const d of room.dice) {
      counts[d] = (counts[d] || 0) + 1;
    }

    const winningSymbols: SymbolType[] = SYMBOL_KEYS.filter(k => counts[k] >= 2);
    let totalTablePayouts = 0;
    let totalTableBets = 0;

    const playerPayouts: RoundResultSummary['playerPayouts'] = {};

    for (const [userId, player] of Object.entries(room.players)) {
      let playerWonTotal = 0;
      const details: { symbol: SymbolType; bet: number; count: number; won: number }[] = [];

      for (const symbol of SYMBOL_KEYS) {
        const bet = player.bets[symbol] || 0;
        if (bet > 0) {
          totalTableBets += bet;
          const count = counts[symbol];
          let won = 0;
          if (count >= 2) {
            // Bet returned + count * bet
            won = bet + (count * bet);
          } else {
            won = 0;
          }
          playerWonTotal += won;
          details.push({ symbol, bet, count, won });
        }
      }

      // Update user in DB atomically
      const updatedUser = db.atomicAddWinnings(userId, playerWonTotal, player.totalBetThisRound);
      if (updatedUser) {
        player.coins = updatedUser.coins;
      }

      const netChange = playerWonTotal - player.totalBetThisRound;
      totalTablePayouts += playerWonTotal;

      // Update in-table player session history and win rate
      if (!player.sessionStats) {
        player.sessionStats = {
          joinedAt: Date.now(),
          roundsPlayed: 0,
          roundsWon: 0,
          totalBet: 0,
          totalWon: 0,
          netProfit: 0,
          biggestWin: 0,
          winRate: 0,
          history: [],
        };
      }

      if (player.totalBetThisRound > 0) {
        player.sessionStats.roundsPlayed += 1;
        if (playerWonTotal > 0) {
          player.sessionStats.roundsWon += 1;
        }
        player.sessionStats.totalBet += player.totalBetThisRound;
        player.sessionStats.totalWon += playerWonTotal;
        player.sessionStats.netProfit += netChange;
        player.sessionStats.biggestWin = Math.max(player.sessionStats.biggestWin, netChange > 0 ? netChange : 0);
        player.sessionStats.winRate = Math.round(
          (player.sessionStats.roundsWon / player.sessionStats.roundsPlayed) * 100
        );

        // Keep last 25 round entries for this player
        player.sessionStats.history.unshift({
          roundNumber: room.roundNumber,
          betAmount: player.totalBetThisRound,
          wonAmount: playerWonTotal,
          netChange,
          dice: [...room.dice],
          bets: { ...player.bets },
          timestamp: Date.now(),
        });
        if (player.sessionStats.history.length > 25) {
          player.sessionStats.history.pop();
        }
      }

      playerPayouts[userId] = {
        totalBet: player.totalBetThisRound,
        totalWon: playerWonTotal,
        netChange,
        details,
      };
    }

    // Top symbol of round for history
    let topSymbol: SymbolType = 'burja';
    let maxCount = -1;
    for (const k of SYMBOL_KEYS) {
      if (counts[k] > maxCount) {
        maxCount = counts[k];
        topSymbol = k;
      }
    }

    const summary: RoundResultSummary = {
      roundNumber: room.roundNumber,
      dice: room.dice,
      symbolCounts: counts,
      winningSymbols,
      playerPayouts,
      totalTableBets,
      totalTablePayouts,
      timestamp: Date.now(),
    };

    room.lastResult = summary;
    room.nextRoundVotes = []; // Reset next round votes for the new results screen
    room.recentHistory.unshift({
      roundNumber: room.roundNumber,
      dice: room.dice,
      topSymbol,
    });
    if (room.recentHistory.length > 12) {
      room.recentHistory.pop();
    }

    // Update table stats and complete table history
    room.tableStats = room.tableStats || {
      totalRounds: 0,
      totalBets: 0,
      totalPayouts: 0,
      highestRoundPool: 0,
    };
    room.tableStats.totalRounds += 1;
    room.tableStats.totalBets += totalTableBets;
    room.tableStats.totalPayouts += totalTablePayouts;
    room.tableStats.highestRoundPool = Math.max(room.tableStats.highestRoundPool || 0, totalTableBets);

    // Track highest single payout winner
    for (const [userId, payout] of Object.entries(playerPayouts)) {
      if (payout.totalWon > 0 && (!room.tableStats.biggestWinner || payout.totalWon > room.tableStats.biggestWinner.amount)) {
        const pObj = room.players[userId];
        if (pObj) {
          room.tableStats.biggestWinner = {
            username: pObj.username,
            amount: payout.totalWon,
            roundNumber: room.roundNumber,
          };
        }
      }
    }

    room.history = room.history || [];
    room.history.unshift({
      roundNumber: room.roundNumber,
      dice: [...room.dice],
      symbolCounts: { ...counts },
      winningSymbols: [...winningSymbols],
      totalTableBets,
      totalTablePayouts,
      playerPayouts,
      timestamp: Date.now(),
    });
    if (room.history.length > 30) {
      room.history.pop();
    }

    this.io.to(`room:${room.id}`).emit('game:phase_payout', {
      summary,
      players: room.players,
      roomState: room,
    });

    // Record updated player stats, payouts, and table history to Supabase
    if (room.id !== 'public-royal-table') {
      syncTableStateToSupabaseServer(room).catch((err) => {
        console.warn('[GameEngine] Supabase table sync notice:', err);
      });
    }
  }

  /**
   * Reset board and begin next round
   */
  public startNewRound(room: RoomState) {
    if (!room.settings.autoLoop) {
      room.phase = 'waiting';
      this.io.to(`room:${room.id}`).emit('game:paused', { message: 'Game paused by host' });
      return;
    }

    const now = Date.now();
    room.roundNumber += 1;
    room.phase = 'betting';
    room.timer = room.settings.bettingDuration;
    room.phaseStartedAt = now;
    room.phaseEndsAt = now + (room.settings.bettingDuration * 1000);
    room.nextRoundVotes = []; // Cleared for the new round

    // Reset table bets
    for (const k of SYMBOL_KEYS) {
      room.tableBets[k] = 0;
    }

    // Reset all player bets
    for (const p of Object.values(room.players)) {
      for (const k of SYMBOL_KEYS) {
        p.bets[k] = 0;
      }
      p.totalBetThisRound = 0;
    }

    this.io.to(`room:${room.id}`).emit('game:new_round', {
      roundNumber: room.roundNumber,
      bettingDuration: room.settings.bettingDuration,
      tableBets: room.tableBets,
      players: room.players,
      roomState: room,
    });
  }

  /**
   * Handles player voting for Next Round during the payout / results phase.
   * If the Table Leader clicks Next Round, the round starts immediately for everyone.
   * If non-leaders click, votes are recorded and round starts when all connected members have voted.
   */
  public voteNextRound(roomId: string, userId: string): { success: boolean; allReady: boolean; votes: string[]; message?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, allReady: false, votes: [], message: 'Room not found' };

    if (room.phase !== 'payout') {
      return { success: false, allReady: false, votes: room.nextRoundVotes || [], message: 'Not in results phase' };
    }

    if (!room.players[userId]) {
      return { success: false, allReady: false, votes: room.nextRoundVotes || [], message: 'Player not in room' };
    }

    room.nextRoundVotes = room.nextRoundVotes || [];
    if (!room.nextRoundVotes.includes(userId)) {
      room.nextRoundVotes.push(userId);
    }

    // Only count active, connected players
    const connectedPlayerIds = Object.keys(room.players).filter(
      (id) => !room.players[id].isDisconnected
    );
    const allReady =
      connectedPlayerIds.length > 0 &&
      connectedPlayerIds.every((id) => room.nextRoundVotes!.includes(id));

    const isLeader = room.hostId === userId || room.id === 'public-royal-table';

    // Broadcast vote update to all clients in the room
    this.io.to(`room:${roomId}`).emit('game:next_round_votes', {
      votes: room.nextRoundVotes,
      totalPlayers: connectedPlayerIds.length,
      allReady: allReady || isLeader,
      voterId: userId,
      startedByLeader: isLeader,
    });

    if (allReady || isLeader) {
      this.startNewRound(room);
    }

    return { success: true, allReady: allReady || isLeader, votes: room.nextRoundVotes };
  }

  public destroyRoom(roomId: string) {
    this.cancelRoomCleanup(roomId);
    const interval = this.roomIntervals.get(roomId);
    if (interval) {
      clearInterval(interval);
      this.roomIntervals.delete(roomId);
    }
    this.rooms.delete(roomId);
    deleteTableFromSupabase(roomId).catch((err) => {
      console.warn('[GameEngine] Failed to delete table from Supabase in destroyRoom:', err);
    });
  }

  // --- Real-time Chat & Reactions ---

  public sendChatMessage(roomId: string, sender: { id: string; username: string; avatar: string }, text: string) {
    const msg: ChatMessage = {
      id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      senderId: sender.id,
      senderName: sender.username,
      senderAvatar: sender.avatar,
      text: text.trim().slice(0, 150),
      timestamp: Date.now(),
    };
    this.io.to(`room:${roomId}`).emit('chat:new_message', msg);
  }

  public sendReaction(roomId: string, sender: { id: string; username: string }, emoji: string) {
    const reaction: FloatingReaction = {
      id: `rx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      senderId: sender.id,
      senderName: sender.username,
      emoji,
      timestamp: Date.now(),
    };
    this.io.to(`room:${roomId}`).emit('chat:floating_reaction', reaction);
  }

  private broadcastSystemChat(roomId: string, text: string) {
    const msg: ChatMessage = {
      id: `sys_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      senderId: 'system',
      senderName: 'Dealer',
      senderAvatar: '🏛️',
      text,
      timestamp: Date.now(),
      isSystem: true,
    };
    this.io.to(`room:${roomId}`).emit('chat:new_message', msg);
  }
}
