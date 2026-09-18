import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { db, SHOP_ITEMS } from './server/db.js';
import { GameEngine } from './server/gameEngine.js';

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

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
      await gameEngine.purgeZeroPlayerTables();
      const activeRooms = gameEngine.getPublicRooms();
      res.json({ success: true, message: 'Purged redundant tables from Supabase', activeRoomsCount: activeRooms.length });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to cleanup tables' });
    }
  });

  app.get('/api/user/:id', (req, res) => {
    const user = db.getUser(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
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
    socket.on('voice:join', (payload: { roomId: string; user: { id: string; username: string; avatar: string } }, callback) => {
      if (!payload?.roomId || !payload?.user?.id) return;
      const roomId = payload.roomId;
      const voiceRoomKey = `voice:${roomId}`;
      socket.join(voiceRoomKey);

      if (!voiceRooms.has(roomId)) {
        voiceRooms.set(roomId, new Map());
      }
      const roomMap = voiceRooms.get(roomId)!;

      const newVoiceUser: VoiceUser = {
        socketId: socket.id,
        userId: payload.user.id,
        username: payload.user.username || 'Player',
        avatar: payload.user.avatar || '🎲',
        isMuted: false,
        isDeafened: false,
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
        isMuted: false,
        isDeafened: false,
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
    socket.on('voice:audio_stream', (payload: { roomId: string; userId: string; username: string; audioData: string }) => {
      if (!payload?.roomId || !payload.audioData) return;
      socket.to(`voice:${payload.roomId}`).emit('voice:incoming_audio', {
        fromUserId: payload.userId,
        fromUsername: payload.username,
        audioData: payload.audioData,
      });
    });

    // Real-time ping latency check
    socket.on('ping_check', (clientTimestamp: number, callback) => {
      if (typeof callback === 'function') {
        callback(Date.now());
      }
    });

    socket.on('disconnect', () => {
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
