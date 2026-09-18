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

export class GameEngine {
  public static readonly MAX_PLAYERS_PER_TABLE = 16;
  private io: Server;
  private rooms: Map<string, RoomState> = new Map();
  private roomIntervals: Map<string, NodeJS.Timeout> = new Map();
  private cleanupTimers: Map<string, NodeJS.Timeout> = new Map();
  private disconnectTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(io: Server) {
    this.io = io;
    this.hydrateFromSupabase().catch((err) => {
      console.warn('[GameEngine] Background hydration notice:', err);
    });

    // Sweep and purge residual 0-player tables from Supabase on launch and every 60 seconds
    this.purgeZeroPlayerTables();
    setInterval(() => {
      this.purgeZeroPlayerTables();
    }, 60 * 1000);
  }

  /**
   * Purges residual 0-player tables and redundant entries from Supabase.
   */
  public async purgeZeroPlayerTables(): Promise<void> {
    try {
      const activeIds = Array.from(this.rooms.keys());
      await deleteZeroPlayerTablesFromSupabase(activeIds);
    } catch (err) {
      console.warn('[GameEngine] purgeZeroPlayerTables notice:', err);
    }
  }

  /**
   * Hydrates active tables from Supabase into memory on server start.
   */
  public async hydrateFromSupabase(): Promise<void> {
    try {
      const records = await fetchActiveTablesFromSupabase();
      if (records && records.length > 0) {
        for (const rec of records) {
          // Immediately purge tables with 0 or negative players, status closed, or legacy lobby
          if ((rec.player_count || 0) <= 0 || rec.status === 'closed' || rec.id === 'public-royal-table') {
            deleteTableFromSupabase(rec.id).catch(() => {});
            continue;
          }
          if (!this.rooms.has(rec.id)) {
            this.instantiateRoomFromRecord(rec);
            // Grant a 10-minute grace period for empty restored tables
            this.scheduleRoomCleanup(rec.id, 10 * 60 * 1000);
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
  public instantiateRoomFromRecord(record: SupabaseTableRecord): RoomState {
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

    const room: RoomState = {
      id: record.id,
      code: record.code.toUpperCase(),
      name: record.name || "Friend's Table",
      hostId: record.host_id,
      isPrivate: record.is_private ?? false,
      settings,
      phase: record.status === 'waiting' ? 'waiting' : 'betting',
      timer: settings.bettingDuration,
      phaseEndsAt: record.status === 'waiting' ? undefined : Date.now() + (settings.bettingDuration * 1000),
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
    const list: { id: string; name: string; code: string; playerCount: number; phase: string; timer: number }[] = [];
    for (const r of this.rooms.values()) {
      // Only show actual tables with active players connected
      const count = Object.keys(r.players || {}).length;
      if (!r.isPrivate && count > 0) {
        list.push({
          id: r.id,
          name: r.name,
          code: r.code,
          playerCount: count,
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
    customSettings?: Partial<RoomSettings>
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
      bettingDuration: customSettings?.bettingDuration || 18,
      payoutDuration: customSettings?.payoutDuration || 6,
      autoLoop: customSettings?.autoLoop ?? true,
      payoutMultiplierType: customSettings?.payoutMultiplierType || 'traditional',
    };

    const room: RoomState = {
      id: roomId,
      code,
      name: name.trim() || `${hostUser.username}'s Arena`,
      hostId: hostUser.id,
      isPrivate,
      settings,
      phase: 'waiting', // Wait until host clicks Enter Table as Host
      timer: settings.bettingDuration,
      phaseEndsAt: Date.now() + (settings.bettingDuration * 1000),
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

    if (existingPlayer) {
      isReconnection = true;
      existingPlayer.id = user.id;
      existingPlayer.username = user.username;
      existingPlayer.avatar = user.avatar || existingPlayer.avatar;
      existingPlayer.coins = freshUser.coins;
      existingPlayer.isHost = room.hostId === user.id;
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
        isHost: room.hostId === user.id,
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
   * Handle unexpected socket disconnect with 45s grace period for network hiccups / packet drops.
   * The game continues running completely unaffected!
   */
  public handlePlayerDisconnect(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.players[userId];
    if (!player) return;

    player.isDisconnected = true;
    player.disconnectedAt = Date.now();

    // Broadcast disconnected status to the room
    this.io.to(`room:${roomId}`).emit('room:player_status_changed', {
      userId,
      isDisconnected: true,
      roomState: room,
    });

    // If in payout phase, re-evaluate connected players' votes so disconnected players don't block next round
    if (room.phase === 'payout') {
      const connectedPlayerIds = Object.keys(room.players).filter(
        (id) => !room.players[id].isDisconnected
      );
      const allReady =
        connectedPlayerIds.length > 0 &&
        connectedPlayerIds.every((id) => (room.nextRoundVotes || []).includes(id));
      this.io.to(`room:${roomId}`).emit('game:next_round_votes', {
        votes: room.nextRoundVotes || [],
        totalPlayers: connectedPlayerIds.length,
        allReady,
        voterId: userId,
      });
      if (allReady) {
        this.startNewRound(room);
      }
    }

    const timerKey = `${roomId}:${userId}`;
    const existing = this.disconnectTimers.get(timerKey);
    if (existing) clearTimeout(existing);

    // If the disconnecting player is the host and the room is waiting to start,
    // transfer leadership after 15s so lobby is not blocked.
    // In active game phases, allow a 45s grace period without disturbing ongoing rolls.
    const graceTimeout = room.phase === 'waiting' ? 15000 : 45000;

    const timeout = setTimeout(() => {
      this.disconnectTimers.delete(timerKey);
      const r = this.rooms.get(roomId);
      if (r && r.players[userId]?.isDisconnected) {
        // Player never reconnected within grace period - perform graceful removal
        this.executePlayerRemoval(roomId, userId, false);
      }
    }, graceTimeout);

    this.disconnectTimers.set(timerKey, timeout);
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
    const remainingPlayerIds = Object.keys(room.players);

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
      } else {
        // Table owner left and 0 players remain: delete table immediately
        this.destroyRoom(roomId);
        this.io.to(`room:${roomId}`).emit('room:player_left', { userId, roomState: room });
        return;
      }
    }

    // If all players left (0 players remain), delete table row in Supabase and destroy room immediately
    if (remainingPlayerIds.length === 0) {
      this.destroyRoom(roomId);
      this.io.to(`room:${roomId}`).emit('room:player_left', { userId, roomState: room });
      return;
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

    room.phase = 'betting';
    room.timer = room.settings.bettingDuration;
    room.phaseEndsAt = Date.now() + (room.settings.bettingDuration * 1000);
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

      if (room.phase === 'betting') {
        const remaining = Math.max(0, Math.ceil(((room.phaseEndsAt || Date.now()) - Date.now()) / 1000));
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

    room.roundNumber += 1;
    room.phase = 'betting';
    room.timer = room.settings.bettingDuration;
    room.phaseEndsAt = Date.now() + (room.settings.bettingDuration * 1000);
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
   * Round advances only when all connected members of the table have clicked Next Round.
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

    // Broadcast vote update to all clients in the room
    this.io.to(`room:${roomId}`).emit('game:next_round_votes', {
      votes: room.nextRoundVotes,
      totalPlayers: connectedPlayerIds.length,
      allReady,
      voterId: userId,
    });

    if (allReady) {
      this.startNewRound(room);
    }

    return { success: true, allReady, votes: room.nextRoundVotes };
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
