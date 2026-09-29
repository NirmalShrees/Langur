import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { db, SHOP_ITEMS } from './server/db.js';
import { GameEngine, generateRandomTableName } from './server/gameEngine.js';
import { RoomState } from './src/types.js';
import {
  deleteTableFromSupabase,
  fetchAllProfilesForAdmin,
  updateUserCoinsInSupabase,
  updateUserAdminStatusInSupabase,
  updateUserTableHostApproval,
  updateUserNotificationsInSupabase,
  deleteUserNotificationInSupabase,
  clearUserNotificationsInSupabase,
  broadcastNotificationToSupabase,
  checkIsAdmin,
  SUPERADMIN_EMAILS,
  getSupabaseServerClient,
  notifyAllAdminsInSupabase,
  saveTableRequestToSupabase,
  fetchPendingTableRequestsFromSupabase,
  saveTableToSupabaseSafe,
  syncTableStateToSupabaseServer,
} from './server/supabase.js';

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());

  // Socket.io integration with polling + websocket fallback for mobile devices and cloud proxies
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    transports: ['polling', 'websocket'],
    allowUpgrades: true,
    pingInterval: 10000,
    pingTimeout: 20000,
  });

  const gameEngine = new GameEngine(io);

  // REST API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.get('/api/leaderboard', (req, res) => {
    const leaderboard = db.getLeaderboard(50);
    res.json({ leaderboard });
  });

  app.get('/api/shop', (req, res) => {
    res.json({ items: SHOP_ITEMS });
  });

  app.get('/api/rooms', (req, res) => {
    const rooms = gameEngine.getPublicRooms();
    res.json({ rooms });
  });

  // User Notification Endpoints (Reliable Server-Side CRUD on profiles.notifications)
  app.post('/api/user/notifications', async (req, res) => {
    try {
      const { userId, notifications } = req.body;
      if (!userId || !Array.isArray(notifications)) {
        return res.status(400).json({ success: false, error: 'Missing userId or notifications array' });
      }
      const success = await updateUserNotificationsInSupabase(userId, notifications);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed updating notifications' });
    }
  });

  app.delete('/api/user/notifications/:id', async (req, res) => {
    try {
      const notificationId = req.params.id;
      const userId = (req.query.userId as string) || (req.body?.userId as string);
      if (!userId || !notificationId) {
        return res.status(400).json({ success: false, error: 'Missing userId or notificationId' });
      }
      const success = await deleteUserNotificationInSupabase(userId, notificationId);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed deleting notification' });
    }
  });

  app.post('/api/user/notifications/clear', async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ success: false, error: 'Missing userId' });
      }
      const success = await clearUserNotificationsInSupabase(userId);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed clearing notifications' });
    }
  });

  app.all('/api/tables/cleanup', async (req, res) => {
    try {
      const gcResult = await gameEngine.runServerAuthoritativeGarbageCollector();
      const activeRooms = gameEngine.getPublicRooms();
      io.emit('rooms:updated', { rooms: activeRooms });
      res.json({
        success: true,
        message: `Garbage collection complete: Cleaned up ${gcResult.purgedMemoryRooms} memory rooms and ${gcResult.purgedSupabaseTables} database records.`,
        gcResult,
        activeRoomsCount: activeRooms.length,
        activeRooms,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to cleanup tables' });
    }
  });

  app.get('/api/gc/status', async (req, res) => {
    try {
      const activeRooms = gameEngine.getPublicRooms();
      res.json({
        status: 'healthy',
        activeRoomsCount: activeRooms.length,
        activeRooms,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ status: 'error', error: err?.message });
    }
  });

  app.delete('/api/tables/:id', async (req, res) => {
    try {
      const roomId = req.params.id;
      gameEngine.destroyRoom(roomId);
      await deleteTableFromSupabase(roomId);
      await gameEngine.purgeZeroPlayerTables();
      res.json({ success: true, message: `Table ${roomId} deleted.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to delete table' });
    }
  });

  app.get('/api/user/:id', (req, res) => {
    const user = db.getUser(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  });

  // Track connected sockets by user ID for targeted broadcasts
  const userSockets = new Map<string, string>(); // userId -> socketId
  const socketUsers = new Map<string, string>(); // socketId -> userId

  // --- Admin API Endpoints ---

  // Verify Admin Status
  app.get('/api/admin/verify', async (req, res) => {
    const userId = (req.query.userId as string) || (req.headers['x-user-id'] as string);
    const email = (req.query.email as string) || (req.headers['x-user-email'] as string);

    if (!userId && !email) {
      return res.status(401).json({ isAdmin: false, message: 'Missing user identification' });
    }

    const isAdmin = await checkIsAdmin(userId, email);
    res.json({ isAdmin, userId, email });
  });

  // Helper function to build accurate admin players snapshot with live table presence
  async function fetchAdminPlayersSnapshot(): Promise<any[]> {
    try {
      const remoteProfiles = await fetchAllProfilesForAdmin();
      const localUsers = db.getAllUsers();

      const isBotId = (id: string) => {
        if (!id) return true;
        const lower = id.toLowerCase();
        return (
          lower.startsWith('bot_') ||
          lower.startsWith('patron_') ||
          lower.startsWith('smart_') ||
          lower.startsWith('seed-') ||
          lower.startsWith('seed_') ||
          lower.startsWith('ai_') ||
          lower.startsWith('bot-')
        );
      };

      const mergedMap = new Map<string, any>();

      for (const u of localUsers) {
        if (isBotId(u.id)) continue;
        mergedMap.set(u.id, {
          id: u.id,
          username: u.username,
          avatar: u.avatar,
          email: u.email,
          coins: u.coins,
          gamesPlayed: u.gamesPlayed || 0,
          gamesWon: u.gamesWon || 0,
          winRate: (u.gamesPlayed || 0) > 0 ? Math.round(((u.gamesWon || 0) / u.gamesPlayed) * 100) : 0,
          totalWinnings: u.totalWinnings || 0,
          biggestWin: u.biggestWin || 0,
          isAdmin: Boolean(u.isAdmin || (u.email && SUPERADMIN_EMAILS.includes(u.email.toLowerCase()))),
          equippedTitle: u.equipped?.title || 'Dice Novice',
          createdAt: u.createdAt || Date.now(),
        });
      }

      for (const p of remoteProfiles) {
        if (isBotId(p.id)) continue;
        const existing = mergedMap.get(p.id) || {};
        const stats = typeof p.stats === 'object' && p.stats !== null ? p.stats : {};
        const cleanEmail = p.email ? p.email.toLowerCase().trim() : undefined;
        const isSuperAdmin = cleanEmail && SUPERADMIN_EMAILS.includes(cleanEmail);
        const isAdmin = Boolean(p.is_admin === true || isSuperAdmin || stats.isAdmin === true);

        const rawCanCreate = p.can_create_table ?? stats.canCreateTable ?? false;
        const permExpiry = p.table_permission_expires_at ?? stats.tablePermissionExpiresAt;
        const isPermExpired = permExpiry ? new Date(permExpiry).getTime() < Date.now() : false;
        const canCreateTable = Boolean(rawCanCreate && !isPermExpired);

        mergedMap.set(p.id, {
          ...existing,
          id: p.id,
          username: p.username || existing.username || 'Festival Player',
          avatar: p.avatar || existing.avatar || '🎲',
          email: p.email || existing.email,
          coins: typeof p.coins === 'number' ? p.coins : (existing.coins || 5000),
          gamesPlayed: p.games_played ?? stats.gamesPlayed ?? existing.gamesPlayed ?? 0,
          gamesWon: p.games_won ?? stats.gamesWon ?? existing.gamesWon ?? 0,
          winRate: (p.games_played ?? stats.gamesPlayed ?? existing.gamesPlayed ?? 0) > 0
            ? Math.round(((p.games_won ?? stats.gamesWon ?? existing.gamesWon ?? 0) / (p.games_played ?? stats.gamesPlayed ?? existing.gamesPlayed ?? 1)) * 100)
            : 0,
          totalWinnings: p.total_winnings ?? stats.totalWinnings ?? existing.totalWinnings ?? 0,
          biggestWin: p.biggest_win ?? stats.biggestWin ?? existing.biggestWin ?? 0,
          isAdmin,
          canCreateTable,
          tableValidityDays: p.table_validity_days ?? stats.tableValidityDays ?? 7,
          tablePermissionExpiresAt: permExpiry,
          createdTables: Array.isArray(p.created_tables) ? p.created_tables : (Array.isArray(stats.createdTables) ? stats.createdTables : []),
          equippedTitle: stats.equipped?.title || existing.equippedTitle || 'Dice Novice',
          createdAt: p.created_at ? new Date(p.created_at).getTime() : (existing.createdAt || Date.now()),
        });
      }

      // Check live table presence & socket online state for each user
      const playersList = Array.from(mergedMap.values()).map((player) => {
        let presence: 'online' | 'in_table' | 'offline' = 'offline';
        let currentTable: { id: string; name: string; code: string; isHost: boolean } | null = null;

        for (const r of (gameEngine as any).rooms.values()) {
          if (r.players && r.players[player.id]) {
            presence = 'in_table';
            currentTable = {
              id: r.id,
              name: r.name,
              code: r.code,
              isHost: Boolean(r.hostId === player.id),
            };
            break;
          }
        }

        if (presence === 'offline' && userSockets.has(player.id)) {
          presence = 'online';
        }

        return {
          ...player,
          presence,
          currentTable,
        };
      });

      // Sort: Online/In-Table players first, then by highest coins
      playersList.sort((a, b) => {
        if (a.presence === 'in_table' && b.presence !== 'in_table') return -1;
        if (b.presence === 'in_table' && a.presence !== 'in_table') return 1;
        if (a.presence === 'online' && b.presence === 'offline') return -1;
        if (b.presence === 'online' && a.presence === 'offline') return 1;
        return (b.coins || 0) - (a.coins || 0);
      });

      return playersList;
    } catch (err) {
      console.warn('Error building admin players snapshot:', err);
      return [];
    }
  }

  // Helper function to build accurate admin tables snapshot with real-time timers, phases & bets
  async function fetchAdminTablesSnapshot(): Promise<any[]> {
    const allRooms: any[] = [];
    const memoryRoomIds = new Set<string>();

    try {
      // 1. Gather active in-memory rooms
      for (const r of (gameEngine as any).rooms.values()) {
        memoryRoomIds.add(r.id);
        const realPlayers = Object.values(r.players || {}).filter(
          (p: any) => !p.id.startsWith('patron_') && !p.id.startsWith('bot_')
        );

        const isSystem = r.id === 'public-royal-table' || r.code === 'ROYAL1' || r.hostId === 'system_host' || r.hostId === 'system';
        const explicitAdmin =
          (r as any).approvedByAdminName ||
          (r as any).approved_by_admin_name ||
          (r as any).approval_meta?.admin_name ||
          (r as any).approvalMeta?.admin_name;

        allRooms.push({
          id: r.id,
          name: r.name,
          code: r.code,
          hostId: r.hostId,
          hostName: r.players[r.hostId]?.username || (r as any).host_name || 'Host',
          isPrivate: r.isPrivate,
          phase: r.phase,
          timer: r.timer,
          bettingDuration: r.settings?.bettingDuration || 18,
          roundNumber: r.roundNumber,
          playerCount: Object.keys(r.players || {}).length,
          realPlayerCount: realPlayers.length,
          players: Object.values(r.players || {}).map((p: any) => ({
            id: p.id,
            username: p.username,
            avatar: p.avatar,
            coins: p.coins,
            currentBet: p.totalBetThisRound || 0,
            bets: p.bets || {},
            isHost: p.isHost,
            isBot: p.id.startsWith('patron_') || p.id.startsWith('bot_'),
          })),
          tableBets: r.tableBets || {},
          totalRoundBets: Object.values(r.tableBets || {}).reduce((a: number, b: any) => a + Number(b || 0), 0),
          avar: (r as any).avar ?? (r as any).settings?.avar ?? 50,
          lastResult: r.lastResult,
          history: (r as any).history || [],
          inMemory: true,
          status: r.phase === 'waiting' ? 'waiting' : 'active',
          approvalStatus: (r as any).approval_status || 'approved',
          approvalMeta: (r as any).approval_meta || (r as any).approvalMeta || {},
          approvedByAdminName: explicitAdmin,
          approved_by_admin_name: explicitAdmin,
          adminApprovalMessage: (r as any).adminApprovalMessage || (r as any).approval_meta?.message,
          expiresAt: r.expiresAt || (r as any).expires_at,
          createdAt: (r as any).createdAt || (r as any).created_at,
          isSystemGenerated: isSystem,
        });
      }

      // 2. Query Supabase for persistent game tables not currently active in memory
      const sb = getSupabaseServerClient();
      if (sb) {
        const { data: dbTables } = await sb
          .from('game_tables')
          .select('*')
          .order('updated_at', { ascending: false });

        if (dbTables && Array.isArray(dbTables)) {
          for (const dt of dbTables) {
            if (dt.id && !memoryRoomIds.has(dt.id)) {
              const statsArr = Array.isArray(dt.player_stats) ? dt.player_stats : [];
              const playersArr = Array.isArray(dt.players) ? dt.players : [];
              const pList = statsArr.length > 0 ? statsArr : playersArr;

              const isSystemDb = dt.id === 'public-royal-table' || dt.code === 'ROYAL1' || dt.host_id === 'system_host' || dt.host_id === 'system';
              const explicitAdminDb =
                dt.approved_by_admin_name ||
                dt.approvedByAdminName ||
                dt.approval_meta?.admin_name ||
                dt.approvalMeta?.admin_name;

              allRooms.push({
                id: dt.id,
                name: dt.name || `Table ${dt.code}`,
                code: dt.code,
                hostId: dt.host_id,
                hostName: dt.host_name || 'Host',
                isPrivate: dt.is_private ?? false,
                phase: dt.status || 'waiting',
                timer: dt.betting_duration || 18,
                bettingDuration: dt.betting_duration || 18,
                roundNumber: dt.table_stats?.totalRounds || 1,
                playerCount: dt.player_count || pList.length || 0,
                realPlayerCount: dt.player_count || pList.length || 0,
                players: pList.map((p: any) => ({
                  id: p.id || '',
                  username: p.username || 'Player',
                  avatar: p.avatar || '🎲',
                  coins: p.coins || 0,
                  currentBet: 0,
                  isHost: p.isHost || false,
                  isBot: false,
                })),
                tableBets: { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 },
                totalRoundBets: 0,
                avar: dt.avar ?? dt.settings?.avar ?? 50,
                inMemory: false,
                status: dt.status || 'waiting',
                approvalStatus: dt.approval_status || (dt.approved ? 'approved' : 'pending'),
                approvalMeta: dt.approval_meta || {},
                approvedByAdminName: explicitAdminDb,
                approved_by_admin_name: explicitAdminDb,
                adminApprovalMessage: dt.admin_approval_message || dt.approval_meta?.message,
                expiresAt: dt.expires_at,
                createdAt: dt.created_at,
                isSystemGenerated: isSystemDb,
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn('Error building admin tables snapshot:', err);
    }

    return allRooms;
  }

  // 1. Get All Players with Live Presence & Table Locations (Excluding Bots)
  app.get('/api/admin/players', async (req, res) => {
    try {
      const playersList = await fetchAdminPlayersSnapshot();
      res.json({
        success: true,
        totalPlayers: playersList.length,
        onlineCount: playersList.filter((p) => p.presence !== 'offline').length,
        players: playersList,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed fetching players' });
    }
  });

  // 2. Grant / Deduct / Set Player Coins (Robust calculation & Supabase persistence)
  app.post('/api/admin/players/:id/coins', async (req, res) => {
    try {
      const targetUserId = req.params.id;
      const { amount, mode = 'grant', reason = 'Admin Adjustment', adminId = 'admin' } = req.body;

      const numAmount = Number(amount);
      if (isNaN(numAmount)) {
        return res.status(400).json({ success: false, message: 'Valid coin amount is required' });
      }

      // 1. Establish accurate current balance (from memory or Supabase)
      let currentCoins: number | null = null;
      const currentLocal = db.getUser(targetUserId);
      if (currentLocal && typeof currentLocal.coins === 'number') {
        currentCoins = currentLocal.coins;
      } else {
        // Query Supabase for authoritative current coins
        const sbClient = getSupabaseServerClient();
        if (sbClient) {
          const { data: remoteData } = await sbClient
            .from('profiles')
            .select('coins, username, avatar')
            .eq('id', targetUserId)
            .maybeSingle();

          if (remoteData && typeof remoteData.coins === 'number') {
            currentCoins = remoteData.coins;
          }
          if (remoteData) {
            db.getOrCreateUser(targetUserId, remoteData.username, remoteData.avatar, currentCoins ?? 5000);
          }
        }
      }

      if (currentCoins === null) {
        currentCoins = 5000;
        db.getOrCreateUser(targetUserId, undefined, undefined, 5000);
      }

      let newBalance = 0;
      let delta = 0;

      if (mode === 'set') {
        newBalance = Math.max(0, Math.floor(Math.abs(numAmount)));
        delta = newBalance - currentCoins;
        db.adminSetCoins(targetUserId, newBalance, adminId, reason);
      } else if (mode === 'deduct') {
        const deductAmt = Math.abs(numAmount);
        newBalance = Math.max(0, Math.floor(currentCoins - deductAmt));
        delta = newBalance - currentCoins;
        db.adminSetCoins(targetUserId, newBalance, adminId, reason);
      } else {
        // default grant
        const grantAmt = Math.abs(numAmount);
        newBalance = Math.max(0, Math.floor(currentCoins + grantAmt));
        delta = newBalance - currentCoins;
        db.adminSetCoins(targetUserId, newBalance, adminId, reason);
      }

      // 2. Create formal coin receipt for audit log & notification
      const receipt = {
        id: `receipt_admin_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        amount: delta,
        type: delta >= 0 ? 'win' : 'loss',
        description: `Admin Treasury: ${reason} (${delta >= 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString()} 🪙)`,
        timestamp: Date.now(),
        balanceAfter: newBalance,
      };

      const customNotification = {
        id: `note_admin_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: delta >= 0 ? '🪙 Treasury Coins Granted' : '🪙 Treasury Coins Deducted',
        message: `${reason} (${delta >= 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString()} 🪙)`,
        type: delta >= 0 ? 'reward' : 'treasury',
        timestamp: Date.now(),
        state: 'not seen',
      };

      // 3. Persist to Supabase
      const sbResult = await updateUserCoinsInSupabase(targetUserId, newBalance, receipt, customNotification);
      const resultingNotification = sbResult.notification || customNotification;

      // 4. Update in-game room state if player is currently in an active table
      for (const r of (gameEngine as any).rooms.values()) {
        if (r.players && r.players[targetUserId]) {
          r.players[targetUserId].coins = newBalance;
          io.to(`room:${r.id}`).emit('room:player_status_changed', {
            userId: targetUserId,
            roomState: r,
          });
        }
      }

      // 5. Notify player directly via Socket.IO for instantaneous live balance animation, notification & sound
      const targetSocketId = userSockets.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('user:balance_updated', {
          coins: newBalance,
          delta,
          reason,
          receipt,
          notification: resultingNotification,
        });
      }

      // Also broadcast general user update event
      io.emit('user:coins_changed', {
        userId: targetUserId,
        coins: newBalance,
      });

      res.json({
        success: true,
        message: `Successfully updated balance to ${newBalance.toLocaleString()} coins (${delta >= 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString()}).`,
        newBalance,
        delta,
        userId: targetUserId,
        notification: resultingNotification,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed updating player coins' });
    }
  });

  // 3. Toggle Admin Status for a Player
  app.post('/api/admin/players/:id/admin', async (req, res) => {
    try {
      const targetUserId = req.params.id;
      const { isAdmin } = req.body;

      db.adminSetIsAdmin(targetUserId, Boolean(isAdmin));
      await updateUserAdminStatusInSupabase(targetUserId, Boolean(isAdmin));

      // Notify player socket if online
      const targetSocketId = userSockets.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('user:admin_status_changed', { isAdmin: Boolean(isAdmin) });
      }

      res.json({
        success: true,
        message: `Admin status for player ${targetUserId} set to ${Boolean(isAdmin)}.`,
        isAdmin: Boolean(isAdmin),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed updating admin status' });
    }
  });

  // 3b. Admin: Grant or Revoke Table Creation Approval with Timed Duration in Days
  app.post('/api/admin/players/:id/table-approval', async (req, res) => {
    try {
      const targetUserId = req.params.id;
      const { canCreate, validityDays = 7 } = req.body;

      const numDays = Math.max(1, parseInt(validityDays, 10) || 7);
      const result = await updateUserTableHostApproval(targetUserId, Boolean(canCreate), numDays);

      // Notify player socket if online
      const targetSocketId = userSockets.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('user:table_approval_changed', {
          canCreateTable: Boolean(canCreate),
          validityDays: numDays,
          expiresAt: result.expiresAt,
        });
      }

      res.json({
        success: result.success,
        message: result.message,
        canCreateTable: Boolean(canCreate),
        validityDays: numDays,
        expiresAt: result.expiresAt,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed updating table host approval' });
    }
  });

  // In-memory cache for pending table requests for instantaneous 0ms reactivity
  const pendingTableRequests = new Map<string, any>();

  // User: Request Table Creation Approval from Admin (for XX hours)
  app.post('/api/tables/request-approval', async (req, res) => {
    try {
      const { userId, username, tableName, isPrivate, bettingDuration, validityHours } = req.body;
      if (!userId) {
        return res.status(400).json({ success: false, message: 'Missing userId' });
      }

      const cleanName = username || 'Player';
      const cleanTableName = tableName?.trim() || `${cleanName}'s Table`;
      const hours = Math.max(1, parseInt(validityHours, 10) || 24);
      const durationSec = Math.max(10, parseInt(bettingDuration, 10) || 20);
      const isPriv = Boolean(isPrivate);

      // Generate table ID and unique room code immediately
      let roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      while (roomCode.length < 6 || gameEngine.getRoomByCode(roomCode)) {
        roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      }
      const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const requestObj = {
        id: requestId,
        tableId: roomId,
        roomCode,
        userId,
        username: cleanName,
        tableName: cleanTableName,
        isPrivate: isPriv,
        bettingDuration: durationSec,
        validityHours: hours,
        status: 'pending',
        createdAt: Date.now(),
      };

      // 1. Immediately create pending table entry in Supabase game_tables with approval_status: 'pending'
      // Timer does NOT start now; expires_at remains null until admin approval!
      const pendingTableRecord = {
        id: roomId,
        code: roomCode,
        name: cleanTableName,
        host_id: userId,
        host_name: cleanName,
        status: 'pending_approval',
        approval_status: 'pending',
        is_private: isPriv,
        betting_duration: durationSec,
        player_count: 0,
        player_stats: [],
        history: [],
        table_stats: { totalRounds: 0, totalBets: 0, totalPayouts: 0 },
        approval_meta: {},
        validity_hours: hours,
        validity_days: Math.max(1, Math.ceil(hours / 24)),
        expires_at: null, // Timer will start ONLY after table has been approved by Admin
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      saveTableToSupabaseSafe(pendingTableRecord).catch(() => {});

      pendingTableRequests.set(requestId, requestObj);
      saveTableRequestToSupabase(requestObj).catch(() => {});

      console.log(`[Table Approval Request] User ${cleanName} (${userId}) requested table '${cleanTableName}' (${roomCode}) for ${hours} hours. Timer is paused/not started until approval.`);

      // 2. Send persistent notification to all Admins in Supabase
      notifyAllAdminsInSupabase(
        '👑 Table Creation Request',
        `${cleanName} has requested to create table for ${hours} hours. Approve or decline.`,
        {
          requestId,
          tableId: roomId,
          roomCode,
          requesterId: userId,
          requesterName: cleanName,
          tableName: cleanTableName,
          validityHours: hours,
        }
      ).catch(() => {});

      // 3. Broadcast real-time alert to all connected sockets
      io.emit('admin:table_request', requestObj);

      res.json({
        success: true,
        message: `Your request to create table '${cleanTableName}' for ${hours} hours was sent to the Administrators! You will receive a notification when approved.`,
        request: requestObj,
        table: pendingTableRecord,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to submit request' });
    }
  });

  // Admin: Get all pending table requests
  app.get('/api/admin/table-requests', async (req, res) => {
    try {
      const supabaseRequests = await fetchPendingTableRequestsFromSupabase();
      for (const r of supabaseRequests) {
        if (!pendingTableRequests.has(r.id)) {
          pendingTableRequests.set(r.id, r);
        }
      }
      const allPending = Array.from(pendingTableRequests.values()).filter((r) => r.status === 'pending');
      res.json({ success: true, requests: allPending });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed fetching table requests' });
    }
  });

  // Get all active & approved tables created by a user (from GameEngine memory and Supabase)
  app.get('/api/user/:id/tables', async (req, res) => {
    try {
      const userId = req.params.id;
      if (!userId) {
        return res.status(400).json({ success: false, tables: [] });
      }

      const tablesMap = new Map<string, any>();
      const nowMs = Date.now();

      // 1. In-memory gameEngine rooms hosted by user
      for (const r of (gameEngine as any).rooms.values()) {
        if (r.hostId === userId) {
          const expMs = r.expiresAt ? (typeof r.expiresAt === 'number' ? r.expiresAt : new Date(r.expiresAt).getTime()) : 0;
          if (expMs > 0 && expMs <= nowMs) continue;

          tablesMap.set(r.id, {
            id: r.id,
            code: r.code,
            name: r.name,
            host_id: r.hostId,
            host_name: r.players[r.hostId]?.username || 'Host',
            leader_id: r.hostId,
            leader_name: r.players[r.hostId]?.username || 'Host',
            approved: true,
            approval_status: 'approved',
            is_private: r.isPrivate,
            betting_duration: r.settings?.bettingDuration || 20,
            player_count: Object.keys(r.players || {}).length,
            status: r.phase === 'waiting' ? 'waiting' : 'active',
            expires_at: r.expiresAt,
            validity_days: r.validityDays,
            created_at: new Date().toISOString(),
          });
        }
      }

      // 2. Query Supabase game_tables for user
      const sbClient = getSupabaseServerClient();
      if (sbClient) {
        const { data: dbTables, error } = await sbClient
          .from('game_tables')
          .select('*')
          .eq('host_id', userId)
          .neq('status', 'closed')
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(dbTables)) {
          for (const t of dbTables) {
            const isPending = t.approval_status === 'pending' || t.status === 'pending_approval' || t.approved === false;
            if (isPending) {
              t.expires_at = null;
            } else if (t.expires_at && new Date(t.expires_at).getTime() <= nowMs) {
              continue;
            }
            if (!tablesMap.has(t.id)) {
              tablesMap.set(t.id, t);
            } else {
              // Merge table details preserving in-memory player count if running
              const existing = tablesMap.get(t.id);
              tablesMap.set(t.id, { ...t, ...existing, expires_at: isPending ? null : (existing.expires_at || t.expires_at) });
            }
          }
        }
      }

      // 3. Include any pending table requests for this user from pendingTableRequests cache
      for (const reqItem of pendingTableRequests.values()) {
        if (reqItem.userId === userId && (reqItem.status === 'pending' || reqItem.status === 'pending_approval')) {
          const reqTableId = reqItem.tableId || reqItem.id;
          if (!tablesMap.has(reqTableId)) {
            tablesMap.set(reqTableId, {
              id: reqTableId,
              code: reqItem.roomCode,
              name: reqItem.tableName,
              host_id: reqItem.userId,
              host_name: reqItem.username || 'Host',
              leader_id: reqItem.userId,
              leader_name: reqItem.username || 'Host',
              status: 'pending_approval',
              approval_status: 'pending',
              approved: false,
              is_private: Boolean(reqItem.isPrivate),
              betting_duration: reqItem.bettingDuration || 20,
              player_count: 0,
              expires_at: null,
              validity_hours: reqItem.validityHours || 24,
              validity_days: Math.max(1, Math.ceil((reqItem.validityHours || 24) / 24)),
              created_at: new Date(reqItem.createdAt || Date.now()).toISOString(),
            });
          }
        }
      }

      const userTables = Array.from(tablesMap.values());
      res.json({ success: true, tables: userTables });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch user tables', tables: [] });
    }
  });

  // Admin: Approve or Decline Table Request with custom message & duration
  app.post('/api/admin/table-requests/:id/decision', async (req, res) => {
    try {
      const requestId = req.params.id;
      const { decision, adminId, adminName, adminMessage, validityHours } = req.body;

      let reqItem = pendingTableRequests.get(requestId);
      if (!reqItem) {
        const dbRequests = await fetchPendingTableRequestsFromSupabase();
        reqItem = dbRequests.find((r) => r.id === requestId);
      }

      if (!reqItem) {
        return res.status(404).json({ success: false, message: 'Table request not found' });
      }

      const isApproved = decision === 'approve';
      const cleanAdminName = adminName || 'Admin';
      const cleanAdminMsg = adminMessage?.trim() || '';
      const effectiveHours = Math.max(1, parseInt(validityHours, 10) || reqItem.validityHours || 24);

      reqItem.status = isApproved ? 'approved' : 'declined';
      reqItem.approvedByAdminId = adminId;
      reqItem.approvedByAdminName = cleanAdminName;
      reqItem.adminMessage = cleanAdminMsg;
      reqItem.validityHours = effectiveHours;

      pendingTableRequests.set(requestId, reqItem);
      saveTableRequestToSupabase(reqItem).catch(() => {});

      let createdTableRecord: any = null;

      // If approved, create/update the approved table in Supabase and GameEngine
      if (isApproved) {
        const days = Math.max(1, Math.ceil(effectiveHours / 24));
        await updateUserTableHostApproval(reqItem.userId, true, days);

        // Use pre-assigned roomCode or generate unique 6-character room code
        let roomCode = reqItem.roomCode || Math.random().toString(36).substring(2, 8).toUpperCase();
        while (roomCode.length < 6 || gameEngine.getRoomByCode(roomCode)) {
          roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        }

        const roomId = reqItem.tableId || `room_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const expiresAt = new Date(Date.now() + effectiveHours * 3600 * 1000).toISOString();

        // 1. Create Room in GameEngine
        const newRoomState: RoomState = {
          id: roomId,
          code: roomCode,
          name: reqItem.tableName.trim() || `${reqItem.username || 'Host'}'s Table`,
          creatorId: reqItem.userId,
          creatorName: reqItem.username || 'Host',
          creator_id: reqItem.userId,
          creator_name: reqItem.username || 'Host',
          leaderId: reqItem.userId,
          leaderName: reqItem.username || 'Host',
          leader_id: reqItem.userId,
          leader_name: reqItem.username || 'Host',
          hostId: reqItem.userId,
          isPrivate: Boolean(reqItem.isPrivate),
          settings: {
            minBet: 10,
            maxBet: 50000,
            bettingDuration: reqItem.bettingDuration || 20,
            payoutDuration: 6,
            autoLoop: true,
            payoutMultiplierType: 'traditional',
          },
          phase: 'waiting',
          timer: reqItem.bettingDuration || 20,
          expiresAt,
          expires_at: expiresAt,
          validityDays: days,
          validity_days: days,
          validityHours: effectiveHours,
          dice: ['burja', 'jhanda', 'itta', 'paan', 'hukum', 'chidi'],
          roundNumber: 1,
          players: {},
          activeBotIds: reqItem.isPrivate ? [] : ['patron_aarav', 'patron_sita', 'patron_dipen', 'patron_maya', 'patron_rohan'],
          tableBets: { jhanda: 0, burja: 0, itta: 0, paan: 0, hukum: 0, chidi: 0 },
          recentHistory: [],
          history: [],
          tableStats: { totalRounds: 0, totalBets: 0, totalPayouts: 0, highestRoundPool: 0 },
        };

        (gameEngine as any).rooms.set(roomId, newRoomState);
        (gameEngine as any).startRoomLoop(roomId);

        // 2. Persist to Supabase game_tables with approval_status: 'approved' and approval_meta
        createdTableRecord = {
          id: roomId,
          code: roomCode,
          name: reqItem.tableName.trim() || `${reqItem.username || 'Host'}'s Table`,
          host_id: reqItem.userId,
          host_name: reqItem.username || 'Host',
          status: 'waiting',
          approval_status: 'approved',
          is_private: Boolean(reqItem.isPrivate),
          betting_duration: reqItem.bettingDuration || 20,
          player_count: 0,
          expires_at: expiresAt,
          player_stats: [],
          history: [],
          table_stats: { totalRounds: 0, totalBets: 0, totalPayouts: 0 },
          approval_meta: {
            admin_id: adminId,
            admin_name: cleanAdminName,
            message: cleanAdminMsg,
            approved_at: new Date().toISOString(),
          },
          created_at: reqItem.createdAt ? new Date(reqItem.createdAt).toISOString() : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        await saveTableToSupabaseSafe(createdTableRecord);
      } else {
        // If declined, update Supabase game_tables entry to declined/closed
        if (reqItem.tableId) {
          const sbClient = getSupabaseServerClient();
          if (sbClient) {
            try {
              await sbClient
                .from('game_tables')
                .update({
                  approval_status: 'declined',
                  status: 'closed',
                  approval_meta: {
                    admin_id: adminId,
                    admin_name: cleanAdminName,
                    message: cleanAdminMsg,
                    declined_at: new Date().toISOString(),
                  },
                  updated_at: new Date().toISOString(),
                })
                .eq('id', reqItem.tableId);
            } catch (e) {}
          }
        }
      }

      // Prepare notification for the player who requested the table
      const playerNotification = {
        id: `note_decision_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: isApproved ? '👑 Table Request Approved!' : 'Table Request Declined',
        message: isApproved
          ? (cleanAdminMsg
              ? `Your request to create table "${reqItem.tableName}" (${effectiveHours} hours) was approved by Admin ${cleanAdminName}: "${cleanAdminMsg}"`
              : `Your request to create table "${reqItem.tableName}" for ${effectiveHours} hours was approved by Admin ${cleanAdminName}.`)
          : (cleanAdminMsg
              ? `Your request to create table "${reqItem.tableName}" was declined by Admin ${cleanAdminName}: "${cleanAdminMsg}"`
              : `Your request to create table "${reqItem.tableName}" was declined by Admin ${cleanAdminName}.`),
        type: isApproved ? 'reward' : 'system',
        timestamp: Date.now(),
        state: 'not seen',
      };

      // Persist notification to requester profile in Supabase
      const sbClient = getSupabaseServerClient();
      if (sbClient && reqItem.userId) {
        try {
          const { data: prof } = await sbClient
            .from('profiles')
            .select('notifications')
            .eq('id', reqItem.userId)
            .maybeSingle();
          const existing = Array.isArray(prof?.notifications) ? prof.notifications : [];
          const updated = [playerNotification, ...existing.filter((n: any) => n.id !== playerNotification.id)].slice(0, 50);
          await sbClient.from('profiles').update({ notifications: updated, updated_at: new Date().toISOString() }).eq('id', reqItem.userId);
        } catch (e) {
          console.warn('[Server] Notice updating player notification in Supabase:', e);
        }
      }

      // Real-time socket dispatch to the player (both direct socket and targeted broadcast)
      const decisionPayload = {
        approved: isApproved,
        requestId,
        targetUserId: reqItem.userId,
        userId: reqItem.userId,
        tableName: reqItem.tableName,
        validityHours: effectiveHours,
        adminName: cleanAdminName,
        adminMessage: cleanAdminMsg,
        notification: playerNotification,
        table: createdTableRecord,
      };

      const targetSocketId = userSockets.get(reqItem.userId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('user:table_request_decided', decisionPayload);
      }
      // Also broadcast with targetUserId so reconnecting or tab-switching clients always receive it
      io.emit('user:table_request_decided', decisionPayload);

      // Broadcast update to all admins and users
      io.emit('admin:table_requests_updated', { requestId, decision });
      io.emit('rooms:updated', { rooms: gameEngine.getPublicRooms() });
      if (isApproved && createdTableRecord) {
        io.emit('table:created', { table: createdTableRecord });
        io.emit('table:approved', { table: createdTableRecord });
      }

      res.json({
        success: true,
        message: `Request for table '${reqItem.tableName}' ${isApproved ? 'approved' : 'declined'} successfully.`,
        notification: playerNotification,
        table: createdTableRecord,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed processing decision' });
    }
  });

  // 4. Get All Active Tables (from memory & Supabase) for Admin Supervision
  app.get('/api/admin/tables', async (req, res) => {
    try {
      const allRooms = await fetchAdminTablesSnapshot();
      res.json({
        success: true,
        activeTablesCount: allRooms.length,
        tables: allRooms,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed fetching tables' });
    }
  });

  // 5. Force Action on Table (Roll Now, Next Round, Terminate/Delete Table)
  app.post('/api/admin/tables/:id/action', async (req, res) => {
    try {
      const roomId = req.params.id;
      const { action } = req.body;
      const room = gameEngine.getRoom(roomId);

      if (!room && action !== 'terminate' && action !== 'delete') {
        return res.status(404).json({ success: false, message: 'Table not found in active memory' });
      }

      if (action === 'roll_now') {
        if (room && room.phase === 'betting') {
          (gameEngine as any).executeRoll(room);
          return res.json({ success: true, message: `Forced immediate dice roll on table "${room.name}".` });
        }
        return res.status(400).json({ success: false, message: 'Table is not currently in betting phase' });
      }

      if (action === 'next_round') {
        if (room) {
          gameEngine.startNewRound(room);
          return res.json({ success: true, message: `Forced advance to Round #${room.roundNumber} on table "${room.name}".` });
        }
      }

      if (action === 'terminate' || action === 'delete') {
        io.to(`room:${roomId}`).emit('room:player_kicked', { userId: 'all', reason: 'Table was closed by Administrator.' });
        io.to(`room:${roomId}`).emit('room:disbanded', { reason: 'Table disbanded by Administrator.' });
        
        if (room) {
          gameEngine.destroyRoom(roomId);
        }
        
        // Permanently delete from Supabase
        await deleteTableFromSupabase(roomId);
        
        // Direct delete fallback with Supabase server client
        const sb = getSupabaseServerClient();
        if (sb) {
          await sb.from('game_tables').delete().eq('id', roomId);
          await sb.from('game_tables').delete().eq('code', roomId);
        }

        await gameEngine.purgeZeroPlayerTables();
        io.emit('rooms:updated', { rooms: gameEngine.getPublicRooms() });
        return res.json({ success: true, message: `Table ${roomId} has been deleted from Supabase and active memory.` });
      }

      res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed executing table action' });
    }
  });

  // Direct DELETE endpoint for deleting a specific row from Supabase & memory
  app.delete('/api/admin/tables/:id', async (req, res) => {
    try {
      const roomId = req.params.id;
      io.to(`room:${roomId}`).emit('room:player_kicked', { userId: 'all', reason: 'Table was closed by Administrator.' });
      gameEngine.destroyRoom(roomId);
      await deleteTableFromSupabase(roomId);
      
      const sb = getSupabaseServerClient();
      if (sb) {
        await sb.from('game_tables').delete().eq('id', roomId);
        await sb.from('game_tables').delete().eq('code', roomId);
      }

      await gameEngine.purgeZeroPlayerTables();
      io.emit('rooms:updated', { rooms: gameEngine.getPublicRooms() });
      res.json({ success: true, message: `Table row ${roomId} deleted successfully.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed deleting table row' });
    }
  });

  // 5b. Update Table A-VAR (Adaptive Volatility & Aggregate Return) Algorithm Setting
  app.post('/api/admin/tables/:id/avar', async (req, res) => {
    try {
      const roomId = req.params.id;
      const { avar } = req.body;
      const numAvar = Number(avar);
      const sanitized = Math.max(0, Math.min(100, Math.round(Number.isFinite(numAvar) ? numAvar : 50)));

      const result = gameEngine.setTableAvar(roomId, sanitized);

      // Broadcast update to all admins and sockets in real time
      io.emit('admin:table_avar_updated', { roomId, avar: sanitized });

      res.json({
        success: true,
        roomId,
        avar: sanitized,
        message: result.message,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed updating table A-VAR' });
    }
  });

  // 6. Global System Broadcast to All Active Sockets & Supabase Profiles
  app.post('/api/admin/broadcast', async (req, res) => {
    try {
      const { message, title = 'Announcement', type = 'info' } = req.body;
      if (!message || !message.trim()) {
        return res.status(400).json({ success: false, message: 'Message cannot be empty' });
      }

      const broadcastPayload = {
        id: `broadcast_${Date.now()}`,
        title: title || 'Announcement',
        message: message.trim(),
        type, // 'info' | 'success' | 'warning'
        timestamp: Date.now(),
      };

      // 1. Send live realtime socket event to all connected sockets
      io.emit('admin:global_broadcast', broadcastPayload);

      // 2. Persist announcement to Supabase profiles.notifications column
      broadcastNotificationToSupabase(title, message, 'announcement').catch((err) => {
        console.warn('Failed writing broadcast to Supabase notifications:', err);
      });

      res.json({
        success: true,
        message: 'Global broadcast sent to all active players and recorded in profiles.',
        broadcast: broadcastPayload,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed sending broadcast' });
    }
  });

  // 7. Global Coin Airdrop to All Online or All Registered Players
  app.post('/api/admin/airdrop', async (req, res) => {
    try {
      const { amount, target = 'online', reason = 'Festival Airdrop', adminId = 'admin' } = req.body;
      const coinAmount = parseInt(amount, 10);
      if (isNaN(coinAmount) || coinAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Valid positive coin amount required' });
      }

      let affectedCount = 0;
      const receiptTemplate = {
        amount: coinAmount,
        type: 'win',
        description: `Grand Airdrop: ${reason} (+${coinAmount.toLocaleString()} 🪙)`,
        timestamp: Date.now(),
      };

      const airdropNote = {
        title: '🎉 Festival Grand Airdrop',
        message: `${reason} (+${coinAmount.toLocaleString()} 🪙)`,
        type: 'reward',
        timestamp: Date.now(),
        state: 'not seen',
      };

      if (target === 'online') {
        // Airdrop to all actively connected sockets
        for (const [userId, socketId] of userSockets.entries()) {
          const user = db.getUser(userId);
          if (user) {
            const resAdj = db.adminAdjustCoins(userId, coinAmount, adminId, reason);
            const receipt = {
              ...receiptTemplate,
              id: `receipt_airdrop_${Date.now()}_${userId}`,
              balanceAfter: resAdj.newBalance,
            };
            const sbResult = await updateUserCoinsInSupabase(userId, resAdj.newBalance, receipt, {
              ...airdropNote,
              id: `note_airdrop_${Date.now()}_${userId}`,
            });

            // Notify active room if present
            for (const r of (gameEngine as any).rooms.values()) {
              if (r.players && r.players[userId]) {
                r.players[userId].coins = resAdj.newBalance;
                io.to(`room:${r.id}`).emit('room:player_status_changed', {
                  userId,
                  roomState: r,
                });
              }
            }

            // Real-time socket event
            io.to(socketId).emit('user:balance_updated', {
              coins: resAdj.newBalance,
              delta: coinAmount,
              reason: `Grand Airdrop: ${reason}`,
              receipt,
              notification: sbResult.notification,
            });
            affectedCount++;
          }
        }
      } else {
        // Airdrop to all registered profiles in Supabase & memory
        const remoteProfiles = await fetchAllProfilesForAdmin();
        const localUsers = db.getAllUsers();
        const allUserIds = new Set<string>([
          ...remoteProfiles.map((p) => p.id),
          ...localUsers.map((u) => u.id),
        ]);

        for (const userId of allUserIds) {
          const user = db.getUser(userId) || { coins: 5000 };
          const resAdj = db.adminAdjustCoins(userId, coinAmount, adminId, reason);
          const receipt = {
            ...receiptTemplate,
            id: `receipt_airdrop_${Date.now()}_${userId}`,
            balanceAfter: resAdj.newBalance,
          };
          const sbResult = await updateUserCoinsInSupabase(userId, resAdj.newBalance, receipt, {
            ...airdropNote,
            id: `note_airdrop_${Date.now()}_${userId}`,
          });

          const socketId = userSockets.get(userId);
          if (socketId) {
            io.to(socketId).emit('user:balance_updated', {
              coins: resAdj.newBalance,
              delta: coinAmount,
              reason: `Grand Airdrop: ${reason}`,
              receipt,
              notification: sbResult.notification,
            });
          }
          affectedCount++;
        }
      }

      // Broadcast celebration banner to all connected players
      io.emit('admin:global_broadcast', {
        id: `airdrop_banner_${Date.now()}`,
        title: '🎉 FESTIVAL AIRDROP!',
        message: `All players received +${coinAmount.toLocaleString()} 🪙! Reason: ${reason}`,
        type: 'success',
        timestamp: Date.now(),
      });

      res.json({
        success: true,
        message: `Successfully airdropped +${coinAmount.toLocaleString()} 🪙 to ${affectedCount} players!`,
        affectedCount,
        amount: coinAmount,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed processing airdrop' });
    }
  });

  // 8. System & Economy Metrics
  app.get('/api/admin/stats', async (req, res) => {
    try {
      const localUsers = db.getAllUsers();
      const totalCoinsInCirculation = localUsers.reduce((sum, u) => sum + (u.coins || 0), 0);
      const activeRooms = gameEngine.getPublicRooms();

      res.json({
        success: true,
        registeredUsers: localUsers.length,
        totalCoinsInCirculation,
        activeRoomsCount: activeRooms.length,
        connectedSocketsCount: userSockets.size,
        serverUptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed fetching stats' });
    }
  });

  // In-memory voice participants per room
  interface VoiceUser {
    socketId: string;
    userId: string;
    username: string;
    avatar: string;
    isMuted: boolean;
    isDeafened: boolean;
    isSpeaking: boolean;
  }
  const voiceRooms = new Map<string, Map<string, VoiceUser>>();

  // Socket.io Real-Time Handlers
  io.on('connection', (socket) => {
    let currentRoomId: string | null = null;
    let currentUserId: string | null = null;

    socket.on('user:init', async (payload: { id: string; username?: string; avatar?: string }, callback) => {
      const user = db.getOrCreateUser(payload.id, payload.username, payload.avatar);
      currentUserId = user.id;
      userSockets.set(user.id, socket.id);
      socketUsers.set(socket.id, user.id);

      // Notify admin live channel of presence update
      io.to('admin_live_channel').emit('user:presence_changed', {
        userId: user.id,
        presence: 'online',
        username: user.username,
        avatar: user.avatar,
        coins: user.coins,
      });

      if (typeof callback === 'function') {
        callback({ success: true, user });
      }
    });

    // Real-Time Admin Live Telemetry Channel Subscriptions
    socket.on('admin:subscribe_live', async () => {
      socket.join('admin_live_channel');
      try {
        const [tables, players] = await Promise.all([
          fetchAdminTablesSnapshot(),
          fetchAdminPlayersSnapshot(),
        ]);
        socket.emit('admin:live_tables_sync', { tables });
        socket.emit('admin:live_players_sync', { players });
      } catch (err) {
        console.warn('[Admin] Error sending initial live telemetry sync:', err);
      }
    });

    socket.on('admin:unsubscribe_live', () => {
      socket.leave('admin_live_channel');
    });

    socket.on('user:update_profile', (payload: { id: string; username?: string; avatar?: string }, callback) => {
      const updated = db.updateProfile(payload.id, { username: payload.username, avatar: payload.avatar });
      if (typeof callback === 'function') {
        callback({ success: !!updated, user: updated });
      }
    });

    socket.on('user:faucet', (payload: { userId: string }, callback) => {
      const result = db.claimFaucet(payload.userId);
      if (typeof callback === 'function') {
        callback(result);
      }
    });

    socket.on('shop:buy', (payload: { userId: string; itemId: string }, callback) => {
      const result = db.purchaseItem(payload.userId, payload.itemId);
      if (typeof callback === 'function') {
        callback(result);
      }
    });

    socket.on('shop:equip', (payload: { userId: string; itemId: string }, callback) => {
      const result = db.equipItem(payload.userId, payload.itemId);
      if (typeof callback === 'function') {
        callback(result);
      }
    });

    socket.on('room:get_public', (callback) => {
      const list = gameEngine.getPublicRooms();
      if (typeof callback === 'function') {
        callback({ rooms: list });
      }
    });

    socket.on('room:create', async (payload: { user: any; name: string; isPrivate: boolean; settings?: any; validityHours?: number; validityDays?: number }, callback) => {
      try {
        const u = payload.user || {};

        // Check if user has approved table creation permission (strictly required for all users including admins)
        let canCreate = Boolean(u.canCreateTable || u.can_create_table);
        let validityHours = payload.validityHours || (payload.validityDays ? payload.validityDays * 24 : 24);

        if (u.id) {
          const sb = getSupabaseServerClient();
          if (sb) {
            const { data: prof } = await sb
              .from('profiles')
              .select('can_create_table, table_permission_expires_at, table_validity_days, stats')
              .eq('id', u.id)
              .maybeSingle();

            if (prof) {
              const profExpiry = prof.table_permission_expires_at || (prof.stats && prof.stats.tablePermissionExpiresAt);
              const notExpired = profExpiry ? new Date(profExpiry).getTime() >= Date.now() : true;
              if (prof.can_create_table && notExpired) {
                canCreate = true;
                const days = prof.table_validity_days || (prof.stats && prof.stats.tableValidityDays) || 1;
                validityHours = payload.validityHours || (days * 24);
              } else {
                canCreate = false;
              }
            }
          }
        }

        if (!canCreate) {
          if (typeof callback === 'function') {
            return callback({
              success: false,
              requiresApproval: true,
              message: 'Table creation approval is required. Request sent, waiting for approval.',
            });
          }
          return;
        }

        const room = gameEngine.createRoom(
          payload.user,
          payload.name,
          payload.isPrivate,
          payload.settings,
          validityHours,
          true
        );
        currentRoomId = room.id;
        currentUserId = payload.user.id;
        const joinResult = gameEngine.joinRoom(socket, room.id, payload.user);

        if (typeof callback === 'function') {
          callback({ success: true, room: joinResult.room || room });
        }
      } catch (err: any) {
        console.warn('[Server] Error handling room:create:', err);
        if (typeof callback === 'function') {
          callback({ success: false, message: err?.message || 'Failed to create room' });
        }
      }
    });

    socket.on('room:join_by_code', async (payload: { code: string; user: any; tableData?: any }, callback) => {
      let room = gameEngine.getRoomByCode(payload.code);
      if (!room) {
        if (payload.tableData && (payload.tableData.approved === false || payload.tableData.approval_status === 'pending' || payload.tableData.status === 'pending_approval')) {
          if (typeof callback === 'function') {
            return callback({ success: false, message: 'This table is pending Admin approval and cannot be entered yet.' });
          }
          return;
        }
        room = await gameEngine.restoreRoomByCode(payload.code, payload.tableData);
      }
      if (!room) {
        if (typeof callback === 'function') {
          return callback({ success: false, message: 'Table not found or pending Admin approval.' });
        }
        return;
      }
      currentRoomId = room.id;
      currentUserId = payload.user.id;
      const joinResult = gameEngine.joinRoom(socket, room.id, payload.user);
      if (typeof callback === 'function') {
        callback(joinResult);
      }
    });

    socket.on('room:restore_and_join', async (payload: { code?: string; roomId?: string; tableData: any; user: any }, callback) => {
      if (payload.tableData && (payload.tableData.approved === false || payload.tableData.approval_status === 'pending' || payload.tableData.status === 'pending_approval')) {
        if (typeof callback === 'function') {
          return callback({ success: false, message: 'This table is pending Admin approval and cannot be entered yet.' });
        }
        return;
      }
      let room: any = null;
      if (payload.code) {
        room = await gameEngine.restoreRoomByCode(payload.code, payload.tableData);
      } else if (payload.roomId) {
        room = await gameEngine.restoreRoomById(payload.roomId, payload.tableData);
      } else if (payload.tableData?.code) {
        room = await gameEngine.restoreRoomByCode(payload.tableData.code, payload.tableData);
      }
      if (!room && payload.tableData) {
        room = gameEngine.instantiateRoomFromRecord(payload.tableData);
      }
      if (!room) {
        if (typeof callback === 'function') {
          return callback({ success: false, message: 'Could not restore table. Table might be pending Admin approval or expired.' });
        }
        return;
      }
      currentRoomId = room.id;
      currentUserId = payload.user.id;
      const joinResult = gameEngine.joinRoom(socket, room.id, payload.user);
      if (typeof callback === 'function') {
        callback(joinResult);
      }
    });

    socket.on('room:join_random', async (payload: { user: any }, callback) => {
      try {
        const u = payload.user || {};
        const tableName = generateRandomTableName();

        // Create a brand new public table with bots
        const room = gameEngine.createRoom(
          u,
          tableName,
          false, // isPrivate = false so other real players can join
          { minBet: 10, maxBet: 50000, bettingDuration: 20, autoLoop: true },
          24,
          true
        );

        // Populate bots for multiplayer gameplay
        room.activeBotIds = ['patron_aarav', 'patron_sita', 'patron_dipen', 'patron_maya', 'patron_rohan'];
        currentRoomId = room.id;
        currentUserId = u.id;
        const joinResult = gameEngine.joinRoom(socket, room.id, u);

        // Sync table to Supabase and broadcast available rooms update
        syncTableStateToSupabaseServer(room).catch(() => {});
        io.emit('rooms:updated', { rooms: gameEngine.getPublicRooms() });

        if (typeof callback === 'function') {
          callback({ success: true, room: joinResult.room || room, created: true });
        }
      } catch (err: any) {
        console.warn('[Server] Error in room:join_random:', err);
        if (typeof callback === 'function') {
          callback({ success: false, message: err?.message || 'Failed creating new public table' });
        }
      }
    });

    socket.on('room:join', async (payload: { roomId: string; user: any; tableData?: any }, callback) => {
      let room = gameEngine.getRoom(payload.roomId);
      if (!room) {
        if (payload.tableData && (payload.tableData.approved === false || payload.tableData.approval_status === 'pending' || payload.tableData.status === 'pending_approval')) {
          if (typeof callback === 'function') {
            return callback({ success: false, message: 'This table is pending Admin approval and cannot be entered yet.' });
          }
          return;
        }
        room = await gameEngine.restoreRoomById(payload.roomId, payload.tableData);
      }
      if (!room) {
        if (typeof callback === 'function') {
          return callback({ success: false, message: 'Table not found, closed, or pending Admin approval.' });
        }
        return;
      }
      currentRoomId = room.id;
      currentUserId = payload.user.id;
      const joinResult = gameEngine.joinRoom(socket, room.id, payload.user);
      if (typeof callback === 'function') {
        callback(joinResult);
      }
    });

    socket.on('room:leave', (payload: { roomId: string; userId: string }) => {
      gameEngine.leaveRoom(socket, payload.roomId, payload.userId);
      currentRoomId = null;
    });

    socket.on('bet:place', (payload: { roomId: string; userId: string; symbol: any; amount: number }, callback) => {
      const result = gameEngine.placeBet(payload.roomId, payload.userId, payload.symbol, payload.amount);
      if (typeof callback === 'function') {
        callback(result);
      }
    });

    socket.on('bet:clear', (payload: { roomId: string; userId: string }, callback) => {
      const result = gameEngine.clearBets(payload.roomId, payload.userId);
      if (typeof callback === 'function') {
        callback(result);
      }
    });

    // Host Actions
    socket.on('host:start_game', (payload: { roomId: string; hostUserId?: string }, callback) => {
      const hostId = payload.hostUserId || currentUserId || '';
      const result = gameEngine.hostStartGame(payload.roomId, hostId);
      if (typeof callback === 'function') {
        callback(result);
      }
    });

    socket.on('host:start_next_round', (payload: { roomId: string; hostUserId?: string }, callback) => {
      const hostId = payload.hostUserId || currentUserId || '';
      const result = gameEngine.hostStartNextRound(payload.roomId, hostId);
      if (typeof callback === 'function') {
        callback(result);
      }
    });

    socket.on('host:roll_now', (payload: { roomId: string; hostUserId?: string }, callback) => {
      const hostId = payload.hostUserId || currentUserId || '';
      const result = gameEngine.forceRollNow(payload.roomId, hostId);
      if (typeof callback === 'function') {
        callback(result);
      }
    });

    socket.on('host:update_settings', (payload: { roomId: string; hostUserId: string; settings: any }, callback) => {
      const result = gameEngine.updateRoomSettings(payload.roomId, payload.hostUserId, payload.settings);
      if (typeof callback === 'function') {
        callback(result);
      }
    });

    const handleKick = (payload: { roomId: string; hostUserId?: string; hostId?: string; targetUserId: string }, callback: any) => {
      const hostId = payload.hostUserId || payload.hostId || currentUserId || '';
      const result = gameEngine.kickPlayer(payload.roomId, hostId, payload.targetUserId);
      if (typeof callback === 'function') {
        callback(result);
      }
    };

    socket.on('host:kick', handleKick);
    socket.on('room:kick', handleKick);

    // Table Leader Transfer Request & Response
    socket.on('table:request_transfer_leadership', (payload: { roomId: string; requesterId?: string; targetUserId: string }, callback) => {
      const requesterId = payload.requesterId || currentUserId || '';
      const result = gameEngine.requestTransferLeadership(payload.roomId, requesterId, payload.targetUserId);
      if (typeof callback === 'function') {
        callback(result);
      }
    });

    socket.on('table:respond_transfer_leadership', (payload: { roomId: string; targetUserId?: string; accepted: boolean }, callback) => {
      const targetUserId = payload.targetUserId || currentUserId || '';
      const result = gameEngine.respondTransferLeadership(payload.roomId, targetUserId, payload.accepted);
      if (typeof callback === 'function') {
        callback(result);
      }
    });

    // Player votes for Next Round during results phase
    socket.on('game:vote_next_round', (payload: { roomId: string; userId: string }, callback) => {
      const result = gameEngine.voteNextRound(payload.roomId, payload.userId);
      if (typeof callback === 'function') {
        callback(result);
      }
    });

    // Admin Real-Time A-VAR Algorithm Adjustment
    socket.on('admin:set_table_avar', (payload: { roomId: string; avar: number }, callback) => {
      const result = gameEngine.setTableAvar(payload.roomId, payload.avar);
      io.emit('admin:table_avar_updated', { roomId: payload.roomId, avar: result.avar });
      if (typeof callback === 'function') {
        callback(result);
      }
    });

    // Chat and Reactions
    socket.on('chat:send', (payload: { roomId: string; sender: any; text: string }) => {
      gameEngine.sendChatMessage(payload.roomId, payload.sender, payload.text);
    });

    socket.on('chat:reaction', (payload: { roomId: string; sender: any; emoji: string }) => {
      gameEngine.sendReaction(payload.roomId, payload.sender, payload.emoji);
    });

    // --- Real-Time Voice Chat Signaling & Audio Relay ---
    socket.on('voice:join', (payload: { roomId: string; user: { id: string; username: string; avatar: string }; isMuted?: boolean; isDeafened?: boolean }, callback) => {
      if (!payload?.roomId || !payload?.user?.id) return;
      const roomId = payload.roomId;
      const voiceRoomKey = `voice:${roomId}`;
      socket.join(voiceRoomKey);

      if (!voiceRooms.has(roomId)) {
        voiceRooms.set(roomId, new Map());
      }
      const roomMap = voiceRooms.get(roomId)!;

      const initialMuted = payload.isMuted !== undefined ? payload.isMuted : true;
      const initialDeafened = payload.isDeafened !== undefined ? payload.isDeafened : false;

      const newVoiceUser: VoiceUser = {
        socketId: socket.id,
        userId: payload.user.id,
        username: payload.user.username || 'Player',
        avatar: payload.user.avatar || '🎲',
        isMuted: initialMuted,
        isDeafened: initialDeafened,
        isSpeaking: false,
      };
      roomMap.set(socket.id, newVoiceUser);

      // Get existing peers in this room
      const existingPeers = Array.from(roomMap.values()).filter((p) => p.socketId !== socket.id);

      // Notify others that a new peer joined voice
      socket.to(voiceRoomKey).emit('voice:user_joined', {
        socketId: socket.id,
        userId: payload.user.id,
        username: payload.user.username,
        avatar: payload.user.avatar,
        isMuted: initialMuted,
        isDeafened: initialDeafened,
        isSpeaking: false,
      });

      if (typeof callback === 'function') {
        callback({
          success: true,
          peers: existingPeers,
          peerSocketIds: existingPeers.map((p) => p.socketId),
        });
      }
    });

    socket.on('voice:leave', (payload: { roomId: string; userId: string }) => {
      if (!payload?.roomId) return;
      const roomId = payload.roomId;
      const voiceRoomKey = `voice:${roomId}`;
      socket.leave(voiceRoomKey);

      const roomMap = voiceRooms.get(roomId);
      if (roomMap) {
        roomMap.delete(socket.id);
        if (roomMap.size === 0) {
          voiceRooms.delete(roomId);
        }
      }

      socket.to(voiceRoomKey).emit('voice:user_left', {
        socketId: socket.id,
        userId: payload.userId || currentUserId,
      });
    });

    socket.on('voice:signal', (payload: { toSocketId: string; signalData: any; fromUserId?: string; fromUsername?: string }) => {
      if (!payload?.toSocketId) return;
      io.to(payload.toSocketId).emit('voice:signal', {
        fromSocketId: socket.id,
        fromUserId: payload.fromUserId || currentUserId,
        fromUsername: payload.fromUsername,
        signalData: payload.signalData,
      });
    });

    socket.on('voice:speaking', (payload: { roomId: string; userId: string; isSpeaking: boolean; volume?: number }) => {
      if (!payload?.roomId) return;
      const roomMap = voiceRooms.get(payload.roomId);
      if (roomMap && roomMap.has(socket.id)) {
        const p = roomMap.get(socket.id)!;
        p.isSpeaking = Boolean(payload.isSpeaking);
      }
      socket.to(`voice:${payload.roomId}`).emit('voice:user_speaking', {
        userId: payload.userId,
        socketId: socket.id,
        isSpeaking: payload.isSpeaking,
        volume: payload.volume ?? 0,
      });
    });

    socket.on('voice:mute_state', (payload: { roomId: string; userId: string; isMuted: boolean; isDeafened?: boolean }) => {
      if (!payload?.roomId) return;
      const roomMap = voiceRooms.get(payload.roomId);
      if (roomMap && roomMap.has(socket.id)) {
        const p = roomMap.get(socket.id)!;
        p.isMuted = payload.isMuted;
        p.isDeafened = payload.isDeafened ?? false;
        if (payload.isMuted) p.isSpeaking = false;
      }
      socket.to(`voice:${payload.roomId}`).emit('voice:user_mute_state', {
        userId: payload.userId,
        socketId: socket.id,
        isMuted: payload.isMuted,
        isDeafened: payload.isDeafened ?? false,
      });
    });

    // Ultra-reliable low-latency audio chunk relay (handles NAT/firewall peer connection fallbacks)
    socket.on('voice:audio_stream', (payload: { roomId: string; userId: string; username: string; audioData: string; sampleRate?: number }) => {
      if (!payload?.roomId || !payload.audioData) return;
      socket.to(`voice:${payload.roomId}`).emit('voice:incoming_audio', {
        fromUserId: payload.userId,
        fromUsername: payload.username,
        audioData: payload.audioData,
        sampleRate: payload.sampleRate || 16000,
      });
    });

    // Real-time ping latency check
    socket.on('ping_check', (clientTimestamp: number, callback) => {
      if (typeof callback === 'function') {
        callback(Date.now());
      }
    });

    socket.on('disconnect', () => {
      if (currentUserId) {
        userSockets.delete(currentUserId);
      }
      socketUsers.delete(socket.id);

      if (currentRoomId) {
        const roomMap = voiceRooms.get(currentRoomId);
        if (roomMap) {
          roomMap.delete(socket.id);
          if (roomMap.size === 0) {
            voiceRooms.delete(currentRoomId);
          }
        }
        socket.to(`voice:${currentRoomId}`).emit('voice:user_left', {
          socketId: socket.id,
          userId: currentUserId,
        });
      }
      if (currentRoomId && currentUserId) {
        gameEngine.handlePlayerDisconnect(currentRoomId, currentUserId);
      }

      // Notify admin live channel on disconnect
      if (currentUserId) {
        io.to('admin_live_channel').emit('user:presence_changed', {
          userId: currentUserId,
          presence: 'offline',
        });
      }
    });
  });

  // Real-time authoritative live broadcaster for Admin View & God Mode
  // Broadcasts active tables every 1 second (1000ms) with zero-lag countdowns and bets
  setInterval(async () => {
    try {
      const adminRoom = io.sockets.adapter.rooms.get('admin_live_channel');
      if (adminRoom && adminRoom.size > 0) {
        const tables = await fetchAdminTablesSnapshot();
        io.to('admin_live_channel').emit('admin:live_tables_sync', { tables });
      }
    } catch (e) {}
  }, 1000);

  // Real-time authoritative live player broadcaster for Admin Players tab (every 2 seconds)
  setInterval(async () => {
    try {
      const adminRoom = io.sockets.adapter.rooms.get('admin_live_channel');
      if (adminRoom && adminRoom.size > 0) {
        const players = await fetchAdminPlayersSnapshot();
        io.to('admin_live_channel').emit('admin:live_players_sync', { players });
      }
    } catch (e) {}
  }, 2000);

  // Vite middleware for development / Static file server for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Automatic Background Table Cleanup:
  // Sweeps every 5 minutes to automatically delete expired tables from GameEngine memory and Supabase game_tables
  setInterval(async () => {
    try {
      const nowMs = Date.now();
      const sb = getSupabaseServerClient();

      // 1. In-memory GameEngine rooms expiration check
      for (const room of (gameEngine as any).rooms.values()) {
        if (room.expiresAt) {
          const expMs = typeof room.expiresAt === 'number' ? room.expiresAt : new Date(room.expiresAt).getTime();
          if (expMs > 0 && expMs <= nowMs) {
            console.log(`[Auto-GC] Table ${room.name} (${room.code} / ${room.id}) expired. Disbanding and deleting.`);
            gameEngine.destroyRoom(room.id);
            io.to(`room:${room.id}`).emit('room:disbanded', { reason: 'Table validity period has expired.' });
            if (sb) {
              await deleteTableFromSupabase(room.id);
            }
          }
        }
      }

      // 2. Direct Supabase game_tables expiration check
      if (sb) {
        const nowIso = new Date().toISOString();
        // Delete any expired tables
        await sb.from('game_tables').delete().not('expires_at', 'is', null).lte('expires_at', nowIso);
        // Delete closed tables
        await sb.from('game_tables').delete().eq('status', 'closed');
      }
    } catch (e) {
      // quiet background notice
    }
  }, 5 * 60 * 1000);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Langur Burja real-time server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
});
