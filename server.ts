import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { db, SHOP_ITEMS } from './server/db.js';
import { GameEngine } from './server/gameEngine.js';
import {
  deleteTableFromSupabase,
  fetchAllProfilesForAdmin,
  updateUserCoinsInSupabase,
  updateUserAdminStatusInSupabase,
  checkIsAdmin,
  SUPERADMIN_EMAILS,
  getSupabaseServerClient,
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

  // 1. Get All Players with Live Presence & Table Locations (Excluding Bots)
  app.get('/api/admin/players', async (req, res) => {
    try {
      // 1. Fetch remote profiles from Supabase
      const remoteProfiles = await fetchAllProfilesForAdmin();

      // 2. Fetch local memory profiles from DB
      const localUsers = db.getAllUsers();

      // Helper to identify bots/seed users
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

      // Merge both sources (deduped by ID)
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
          equippedTitle: stats.equipped?.title || existing.equippedTitle || 'Dice Novice',
          createdAt: p.created_at ? new Date(p.created_at).getTime() : (existing.createdAt || Date.now()),
        });
      }

      // Check live table presence & socket online state for each user
      const playersList = Array.from(mergedMap.values()).map((player) => {
        let presence: 'online' | 'in_table' | 'offline' = 'offline';
        let currentTable: { id: string; name: string; code: string; isHost: boolean } | null = null;

        // Check if player is currently in any active room in GameEngine
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

      // 2. Create formal coin receipt for audit log
      const receipt = {
        id: `receipt_admin_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        amount: delta,
        type: delta >= 0 ? 'win' : 'loss',
        description: `Admin Treasury: ${reason} (${delta >= 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString()} 🪙)`,
        timestamp: Date.now(),
        balanceAfter: newBalance,
      };

      // 3. Persist to Supabase
      await updateUserCoinsInSupabase(targetUserId, newBalance, receipt);

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

      // 5. Notify player directly via Socket.IO for instantaneous live balance animation & sound
      const targetSocketId = userSockets.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('user:balance_updated', {
          coins: newBalance,
          delta,
          reason,
          receipt,
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

  // 4. Get All Active Tables (from memory & Supabase) for Admin Supervision
  app.get('/api/admin/tables', async (req, res) => {
    try {
      const allRooms: any[] = [];
      const memoryRoomIds = new Set<string>();

      // 1. Gather active in-memory rooms
      for (const r of (gameEngine as any).rooms.values()) {
        memoryRoomIds.add(r.id);
        const realPlayers = Object.values(r.players || {}).filter(
          (p: any) => !p.id.startsWith('patron_') && !p.id.startsWith('bot_')
        );

        allRooms.push({
          id: r.id,
          name: r.name,
          code: r.code,
          hostId: r.hostId,
          hostName: r.players[r.hostId]?.username || 'Host',
          isPrivate: r.isPrivate,
          phase: r.phase,
          timer: r.timer,
          roundNumber: r.roundNumber,
          playerCount: Object.keys(r.players || {}).length,
          realPlayerCount: realPlayers.length,
          players: Object.values(r.players || {}).map((p: any) => ({
            id: p.id,
            username: p.username,
            avatar: p.avatar,
            coins: p.coins,
            currentBet: p.totalBetThisRound,
            isHost: p.isHost,
            isBot: p.id.startsWith('patron_') || p.id.startsWith('bot_'),
          })),
          tableBets: r.tableBets,
          totalRoundBets: Object.values(r.tableBets || {}).reduce((a: number, b: any) => a + Number(b || 0), 0),
          lastResult: r.lastResult,
          inMemory: true,
          status: r.phase === 'waiting' ? 'waiting' : 'active',
        });
      }

      // 2. Query Supabase for any persistent database table rows not already in memory
      try {
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

                allRooms.push({
                  id: dt.id,
                  name: dt.name || `Table ${dt.code}`,
                  code: dt.code,
                  hostId: dt.host_id,
                  hostName: dt.host_name || 'Host',
                  isPrivate: dt.is_private ?? false,
                  phase: dt.status || 'waiting',
                  timer: dt.betting_duration || 18,
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
                  inMemory: false,
                  status: dt.status || 'waiting',
                });
              }
            }
          }
        }
      } catch (sbErr) {
        console.warn('Failed querying Supabase game_tables for admin list:', sbErr);
      }

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

  // 6. Global System Broadcast to All Active Sockets
  app.post('/api/admin/broadcast', (req, res) => {
    try {
      const { message, title = 'Announcement', type = 'info' } = req.body;
      if (!message || !message.trim()) {
        return res.status(400).json({ success: false, message: 'Message cannot be empty' });
      }

      const broadcastPayload = {
        id: `broadcast_${Date.now()}`,
        title,
        message: message.trim(),
        type, // 'info' | 'success' | 'warning'
        timestamp: Date.now(),
      };

      // Send to all connected sockets
      io.emit('admin:global_broadcast', broadcastPayload);

      res.json({
        success: true,
        message: 'Global broadcast sent to all active players.',
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
            await updateUserCoinsInSupabase(userId, resAdj.newBalance, receipt);

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
          await updateUserCoinsInSupabase(userId, resAdj.newBalance, receipt);

          const socketId = userSockets.get(userId);
          if (socketId) {
            io.to(socketId).emit('user:balance_updated', {
              coins: resAdj.newBalance,
              delta: coinAmount,
              reason: `Grand Airdrop: ${reason}`,
              receipt,
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

    socket.on('user:init', (payload: { id: string; username?: string; avatar?: string }, callback) => {
      const user = db.getOrCreateUser(payload.id, payload.username, payload.avatar);
      currentUserId = user.id;
      userSockets.set(user.id, socket.id);
      socketUsers.set(socket.id, user.id);
      if (typeof callback === 'function') {
        callback({ success: true, user });
      }
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

    socket.on('room:create', (payload: { user: any; name: string; isPrivate: boolean; settings?: any }, callback) => {
      const room = gameEngine.createRoom(payload.user, payload.name, payload.isPrivate, payload.settings);
      currentRoomId = room.id;
      currentUserId = payload.user.id;
      const joinResult = gameEngine.joinRoom(socket, room.id, payload.user);
      if (typeof callback === 'function') {
        callback({ success: true, room: joinResult.room || room });
      }
    });

    socket.on('room:join_by_code', async (payload: { code: string; user: any; tableData?: any }, callback) => {
      let room = gameEngine.getRoomByCode(payload.code);
      if (!room) {
        room = await gameEngine.restoreRoomByCode(payload.code, payload.tableData);
      }
      if (!room) {
        if (typeof callback === 'function') {
          return callback({ success: false, message: 'Invalid Room Code. Table not found.' });
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
          return callback({ success: false, message: 'Could not restore table.' });
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

    socket.on('room:join_random', (payload: { user: any }, callback) => {
      const publicRooms = gameEngine.getPublicRooms();
      const availableRooms = (publicRooms || []).filter((r) => r.playerCount < 16);
      if (availableRooms.length > 0) {
        // Prefer active public rooms with players that still have open seats
        const sorted = [...availableRooms].sort((a, b) => b.playerCount - a.playerCount);
        const targetRoomId = sorted[0].id;
        currentRoomId = targetRoomId;
        currentUserId = payload.user.id;
        const joinResult = gameEngine.joinRoom(socket, targetRoomId, payload.user);
        if (typeof callback === 'function') {
          callback({ ...joinResult, created: false });
        }
      } else {
        // Automatically create a public table with random matching enabled
        const autoRoomName = `${payload.user.username || 'Player'}'s Table`;
        const newRoom = gameEngine.createRoom(payload.user, autoRoomName, false, { bettingDuration: 20 });
        currentRoomId = newRoom.id;
        currentUserId = payload.user.id;
        const joinResult = gameEngine.joinRoom(socket, newRoom.id, payload.user);
        if (typeof callback === 'function') {
          callback({ success: true, room: joinResult.room || newRoom, created: true });
        }
      }
    });

    socket.on('room:join', async (payload: { roomId: string; user: any; tableData?: any }, callback) => {
      let room = gameEngine.getRoom(payload.roomId);
      if (!room) {
        room = await gameEngine.restoreRoomById(payload.roomId, payload.tableData);
      }
      if (!room) {
        if (typeof callback === 'function') {
          return callback({ success: false, message: 'Table not found or closed.' });
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
      gameEngine.purgeZeroPlayerTables().catch(() => {});
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
      gameEngine.purgeZeroPlayerTables().catch(() => {});
    });
  });

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

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Langur Burja real-time server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
});
