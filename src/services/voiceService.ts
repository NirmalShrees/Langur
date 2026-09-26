import { Socket } from 'socket.io-client';

export interface VoicePeer {
  socketId: string;
  userId: string;
  username: string;
  avatar?: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  volume: number; // 0.0 to 1.0
  volumeLevel: number; // Live 0 to 100 for visualizer
}

export interface VoiceState {
  isConnected: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  localVolumeLevel: number;
  inputDevices: MediaDeviceInfo[];
  selectedDeviceId: string;
  peers: Record<string, VoicePeer>; // keyed by userId
  error: string | null;
  pushToTalk: boolean;
  echoCancellation: boolean;
  noiseSuppression: boolean;
}

type StateListener = (state: VoiceState) => void;

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

class VoiceService {
  private socket: Socket | null = null;
  private roomId: string | null = null;
  private currentUser: { id: string; username: string; avatar: string } | null = null;

  private localStream: MediaStream | null = null;
  public audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private animationFrameId: number | null = null;

  // Adaptive Noise Floor Tracking for Local Mic
  private localNoiseFloor = 0.006;
  private localConsecutiveSpeechFrames = 0;
  private localConsecutiveSilenceFrames = 0;

  // Peer connections: socketId -> RTCPeerConnection
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  // Remote audio elements: userId -> HTMLAudioElement
  private audioElements: Map<string, HTMLAudioElement> = new Map();
  // Remote audio analyzers for real-time local speaking detection
  private remoteAnalysers: Map<
    string,
    {
      analyser: AnalyserNode;
      source: MediaStreamAudioSourceNode;
      noiseFloor: number;
      silenceFrames: number;
      speechFrames: number;
    }
  > = new Map();

  // SocketId to UserId mapping
  private socketToUser: Map<string, string> = new Map();
  private userToSocket: Map<string, string> = new Map();
  private fallbackSpeakingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  // Web Audio fallback streamer
  private mediaRecorder: MediaRecorder | null = null;

  // Sound is ON by default (isDeafened: false), Mic is OFF by default (isMuted: true)
  private state: VoiceState = {
    isConnected: false,
    isConnecting: false,
    isMuted: true,
    isDeafened: false,
    isSpeaking: false,
    localVolumeLevel: 0,
    inputDevices: [],
    selectedDeviceId: '',
    peers: {},
    error: null,
    pushToTalk: false,
    echoCancellation: true,
    noiseSuppression: true,
  };

  private listeners: Set<StateListener> = new Set();
  private lastSpeakingState = false;
  private lastBroadcastVolumeTime = 0;

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const currentState = this.getState();
    this.listeners.forEach((l) => l(currentState));
  }

  public getState(): VoiceState {
    return { ...this.state, peers: { ...this.state.peers } };
  }

  public setSocket(socket: Socket | null) {
    if (this.socket === socket) return;
    this.cleanupSocketListeners();
    this.socket = socket;
    if (this.socket) {
      this.setupSocketListeners();
    }
  }

  private setupSocketListeners() {
    if (!this.socket) return;

    this.socket.on('voice:user_joined', async (data: { socketId: string; userId: string; username: string; avatar: string; isMuted?: boolean; isDeafened?: boolean }) => {
      if (!data?.userId || data.userId === this.currentUser?.id) return;
      this.socketToUser.set(data.socketId, data.userId);
      this.userToSocket.set(data.userId, data.socketId);

      this.state.peers[data.userId] = {
        socketId: data.socketId,
        userId: data.userId,
        username: data.username || 'Player',
        avatar: data.avatar || '🎲',
        isSpeaking: false,
        isMuted: data.isMuted !== undefined ? data.isMuted : true,
        isDeafened: data.isDeafened !== undefined ? data.isDeafened : false,
        volume: 1.0,
        volumeLevel: 0,
      };
      this.notify();

      if (this.state.isConnected) {
        // As an existing connected peer, initiate WebRTC offer to the newly joined peer
        await this.createPeerConnection(data.socketId, data.userId, true);
      }
    });

    this.socket.on('voice:user_left', (data: { socketId: string; userId: string }) => {
      this.closePeer(data.socketId, data.userId);
    });

    this.socket.on('voice:signal', async (data: { fromSocketId: string; fromUserId: string; signalData: any }) => {
      await this.handleSignal(data.fromSocketId, data.fromUserId, data.signalData);
    });

    this.socket.on('voice:user_speaking', (data: { userId: string; isSpeaking: boolean; volume?: number }) => {
      if (!data?.userId || data.userId === this.currentUser?.id) return;

      const peer = this.state.peers[data.userId];
      if (!peer) {
        this.state.peers[data.userId] = {
          socketId: this.userToSocket.get(data.userId) || '',
          userId: data.userId,
          username: 'Player',
          avatar: '🎲',
          isSpeaking: Boolean(data.isSpeaking),
          isMuted: false,
          isDeafened: false,
          volume: 1.0,
          volumeLevel: data.isSpeaking ? Math.max(25, data.volume ?? 50) : 0,
        };
      } else {
        if (peer.isMuted) {
          peer.isSpeaking = false;
          peer.volumeLevel = 0;
        } else {
          peer.isSpeaking = Boolean(data.isSpeaking);
          peer.volumeLevel = data.isSpeaking ? Math.max(25, data.volume ?? 50) : 0;
        }
      }
      this.notify();
    });

    this.socket.on('voice:user_mute_state', (data: { userId: string; isMuted: boolean; isDeafened: boolean }) => {
      if (!data?.userId) return;
      if (this.state.peers[data.userId]) {
        this.state.peers[data.userId].isMuted = data.isMuted;
        this.state.peers[data.userId].isDeafened = data.isDeafened;
        if (data.isMuted) {
          this.state.peers[data.userId].isSpeaking = false;
          this.state.peers[data.userId].volumeLevel = 0;
        }
        this.notify();
      }
    });

    // Fallback audio playback (if peer-to-peer WebRTC is restricted or delayed)
    this.socket.on('voice:incoming_audio', async (data: { fromUserId: string; fromUsername?: string; audioData: string }) => {
      if (this.state.isDeafened || !this.state.isConnected) return;
      if (!data?.fromUserId || data.fromUserId === this.currentUser?.id) return;

      // Immediately activate visual speaking indicator for remote user
      const peerId = data.fromUserId;
      if (!this.state.peers[peerId]) {
        this.state.peers[peerId] = {
          socketId: this.userToSocket.get(peerId) || '',
          userId: peerId,
          username: data.fromUsername || 'Player',
          avatar: '🎲',
          isSpeaking: true,
          isMuted: false,
          isDeafened: false,
          volume: 1.0,
          volumeLevel: 65,
        };
      } else {
        this.state.peers[peerId].isSpeaking = true;
        this.state.peers[peerId].volumeLevel = 65;
      }
      this.notify();

      // Clear existing silence timer if any
      const existingTimer = this.fallbackSpeakingTimers.get(peerId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Reset speaking indicator ~320ms after chunk finishes
      const timer = setTimeout(() => {
        if (this.state.peers[peerId]) {
          this.state.peers[peerId].isSpeaking = false;
          this.state.peers[peerId].volumeLevel = 0;
          this.notify();
        }
        this.fallbackSpeakingTimers.delete(peerId);
      }, 320);
      this.fallbackSpeakingTimers.set(peerId, timer);

      this.playFallbackAudioChunk(peerId, data.audioData);
    });
  }

  private cleanupSocketListeners() {
    if (!this.socket) return;
    this.socket.off('voice:user_joined');
    this.socket.off('voice:user_left');
    this.socket.off('voice:signal');
    this.socket.off('voice:user_speaking');
    this.socket.off('voice:user_mute_state');
    this.socket.off('voice:incoming_audio');
  }

  public async loadInputDevices(): Promise<MediaDeviceInfo[]> {
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === 'audioinput');
      this.state.inputDevices = audioInputs;
      if (!this.state.selectedDeviceId && audioInputs.length > 0) {
        this.state.selectedDeviceId = audioInputs[0].deviceId;
      }
      this.notify();
      return audioInputs;
    } catch {
      return [];
    }
  }

  public ensureAudioContext() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx && (!this.audioContext || this.audioContext.state === 'closed')) {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
    } catch {}
  }

  public resumeAllAudio() {
    this.ensureAudioContext();
    this.audioElements.forEach((el) => {
      el.muted = this.state.isDeafened;
      el.play().catch(() => {});
    });
  }

  /**
   * Connects to the table's voice channel.
   * By default, audio listening is ON immediately, and mic is MUTED by default.
   * Joining voice never blocks or throws if microphone permissions are not yet given.
   */
  public async joinVoice(roomId: string, user: { id: string; username: string; avatar: string }): Promise<boolean> {
    if (this.state.isConnected && this.roomId === roomId) return true;

    this.roomId = roomId;
    this.currentUser = user;
    this.state.isConnecting = true;
    this.state.isMuted = true; // Mic is OFF by default
    this.state.isDeafened = false; // Speaker/Sound is ON by default (hearable)
    this.state.error = null;
    this.notify();

    this.ensureAudioContext();
    this.resumeAllAudio();
    this.loadInputDevices().catch(() => {});

    // Join voice room on socket server immediately
    if (this.socket && this.socket.connected) {
      this.socket.emit(
        'voice:join',
        {
          roomId,
          user,
          isMuted: this.state.isMuted,
          isDeafened: this.state.isDeafened,
        },
        async (res: { success: boolean; peers?: any[]; peerSocketIds?: string[] }) => {
          if (res?.success) {
            if (res.peers && Array.isArray(res.peers)) {
              for (const p of res.peers) {
                if (p.userId && p.userId !== user.id) {
                  this.socketToUser.set(p.socketId, p.userId);
                  this.userToSocket.set(p.userId, p.socketId);
                  this.state.peers[p.userId] = {
                    socketId: p.socketId,
                    userId: p.userId,
                    username: p.username || 'Player',
                    avatar: p.avatar || '🎲',
                    isSpeaking: Boolean(p.isSpeaking),
                    isMuted: p.isMuted !== undefined ? Boolean(p.isMuted) : true,
                    isDeafened: p.isDeafened !== undefined ? Boolean(p.isDeafened) : false,
                    volume: 1.0,
                    volumeLevel: p.isSpeaking ? 50 : 0,
                  };
                  // We initiate WebRTC offer to existing peers so connection is established right away
                  await this.createPeerConnection(p.socketId, p.userId, true);
                }
              }
              this.notify();
            } else if (res.peerSocketIds) {
              for (const peerSid of res.peerSocketIds) {
                await this.createPeerConnection(peerSid, '', true);
              }
            }
          }
        }
      );
    }

    this.state.isConnected = true;
    this.state.isConnecting = false;
    this.notify();

    // If local stream was previously active and unmuted, re-attach
    if (!this.state.isMuted && this.localStream) {
      this.startFallbackAudioStream();
    }

    return true;
  }

  /**
   * Leaves the table voice channel and releases resources
   */
  public leaveVoice() {
    if (this.socket && this.roomId && this.currentUser) {
      this.socket.emit('voice:leave', { roomId: this.roomId, userId: this.currentUser.id });
    }

    this.stopFallbackAudioStream();
    this.stopVAD();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    // Close all peer connections
    this.peerConnections.forEach((pc) => {
      try {
        pc.close();
      } catch {}
    });
    this.peerConnections.clear();

    // Clean up audio elements
    this.audioElements.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    });
    this.audioElements.clear();

    // Clean up remote analysers
    this.remoteAnalysers.forEach((entry) => {
      try {
        entry.source.disconnect();
      } catch {}
    });
    this.remoteAnalysers.clear();

    this.socketToUser.clear();
    this.userToSocket.clear();
    this.fallbackSpeakingTimers.forEach((t) => clearTimeout(t));
    this.fallbackSpeakingTimers.clear();

    this.state.isConnected = false;
    this.state.isConnecting = false;
    this.state.isSpeaking = false;
    this.state.localVolumeLevel = 0;
    this.state.peers = {};
    this.state.error = null;
    this.lastSpeakingState = false;
    this.localConsecutiveSpeechFrames = 0;
    this.localConsecutiveSilenceFrames = 0;
    this.notify();
  }

  /**
   * Initializes local microphone stream and VAD analyzer (called when user unmutes)
   */
  public async initMicrophone(): Promise<boolean> {
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        return false;
      }

      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: this.state.selectedDeviceId ? { exact: this.state.selectedDeviceId } : undefined,
          echoCancellation: this.state.echoCancellation,
          noiseSuppression: this.state.noiseSuppression,
          autoGainControl: true,
        },
        video: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.localStream = stream;

      // Apply current mute state to audio tracks
      this.localStream.getAudioTracks().forEach((t) => {
        t.enabled = !this.state.isMuted;
      });

      // Update tracks on all active peer connections
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        this.peerConnections.forEach((pc) => {
          const senders = pc.getSenders();
          const audioSender = senders.find((s) => s.track && s.track.kind === 'audio');
          if (audioSender) {
            audioSender.replaceTrack(audioTrack).catch(() => {});
          } else {
            try {
              pc.addTrack(audioTrack, stream);
            } catch (e) {}
          }
        });
      }

      // Start Voice Activity Detection
      this.startVAD(stream);
      return true;
    } catch (err: any) {
      console.warn('[VoiceService] Microphone access note:', err?.message || err);
      return false;
    }
  }

  /**
   * Highly efficient & robust Voice Activity Detection (VAD)
   */
  private startVAD(stream: MediaStream) {
    try {
      this.ensureAudioContext();
      if (!this.audioContext) return;

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.15;

      this.micSource = this.audioContext.createMediaStreamSource(stream);
      this.micSource.connect(this.analyser);

      const bufferLength = this.analyser.fftSize;
      const floatData = new Float32Array(bufferLength);

      this.localNoiseFloor = 0.005;
      this.localConsecutiveSpeechFrames = 0;
      this.localConsecutiveSilenceFrames = 0;

      const processAudioFrame = () => {
        if (!this.analyser || !this.state.isConnected) return;

        if (this.audioContext?.state === 'suspended') {
          this.audioContext.resume().catch(() => {});
        }

        this.analyser.getFloatTimeDomainData(floatData);

        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
          const val = floatData[i];
          sumSquares += val * val;
        }
        const rms = Math.sqrt(sumSquares / bufferLength);

        // If user is muted, zero out speaking state immediately
        if (this.state.isMuted) {
          if (this.state.isSpeaking || this.state.localVolumeLevel > 0) {
            this.state.isSpeaking = false;
            this.state.localVolumeLevel = 0;
            this.lastSpeakingState = false;
            this.notify();
            this.broadcastSpeakingState(false, 0);
          }
          this.animationFrameId = requestAnimationFrame(processAudioFrame);
          return;
        }

        // Dynamically track background noise floor when quiet
        if (rms < this.localNoiseFloor * 1.8 + 0.005) {
          this.localNoiseFloor = this.localNoiseFloor * 0.96 + rms * 0.04;
        }

        const speechAttackThreshold = Math.max(0.016, this.localNoiseFloor * 2.6 + 0.010);
        const speechReleaseThreshold = Math.max(0.011, this.localNoiseFloor * 1.9 + 0.006);

        const volumeFactor = Math.max(0, rms - this.localNoiseFloor);
        const normalizedVolume = Math.min(100, Math.round(Math.pow(volumeFactor * 22, 0.78) * 100));
        this.state.localVolumeLevel = normalizedVolume;

        const isCurrentlyLoud = rms >= (this.lastSpeakingState ? speechReleaseThreshold : speechAttackThreshold);

        if (isCurrentlyLoud) {
          this.localConsecutiveSpeechFrames++;
          this.localConsecutiveSilenceFrames = 0;

          if (this.localConsecutiveSpeechFrames >= 2 && !this.lastSpeakingState) {
            this.state.isSpeaking = true;
            this.lastSpeakingState = true;
            this.notify();
            this.broadcastSpeakingState(true, normalizedVolume);
          } else if (this.lastSpeakingState) {
            const now = Date.now();
            if (now - this.lastBroadcastVolumeTime > 100) {
              this.lastBroadcastVolumeTime = now;
              this.broadcastSpeakingState(true, normalizedVolume);
            }
          }
        } else {
          this.localConsecutiveSilenceFrames++;
          this.localConsecutiveSpeechFrames = 0;

          if (this.localConsecutiveSilenceFrames >= 7 && this.lastSpeakingState) {
            this.state.isSpeaking = false;
            this.lastSpeakingState = false;
            this.notify();
            this.broadcastSpeakingState(false, 0);
          }
        }

        this.animationFrameId = requestAnimationFrame(processAudioFrame);
      };

      processAudioFrame();
    } catch (err) {
      console.warn('[VoiceService] VAD initialization notice:', err);
    }
  }

  private stopVAD() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {}
      this.micSource = null;
    }
  }

  private broadcastSpeakingState(isSpeaking: boolean, volume: number) {
    if (this.socket && this.roomId && this.currentUser) {
      this.socket.emit('voice:speaking', {
        roomId: this.roomId,
        userId: this.currentUser.id,
        isSpeaking,
        volume: isSpeaking ? Math.max(15, volume) : 0,
      });
    }
  }

  /**
   * WebRTC Peer Connection handling
   */
  private async createPeerConnection(peerSocketId: string, peerUserId: string, isInitiator: boolean): Promise<RTCPeerConnection> {
    const existing = this.peerConnections.get(peerSocketId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnections.set(peerSocketId, pc);

    // If local mic stream is active, attach tracks; otherwise add receive-only transceiver
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    } else {
      try {
        pc.addTransceiver('audio', { direction: 'recvonly' });
      } catch {}
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && this.socket) {
        this.socket.emit('voice:signal', {
          toSocketId: peerSocketId,
          fromUserId: this.currentUser?.id,
          fromUsername: this.currentUser?.username,
          signalData: { candidate: event.candidate },
        });
      }
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        this.attachRemoteAudio(peerSocketId, peerUserId, remoteStream);
      } else if (event.track) {
        const stream = new MediaStream([event.track]);
        this.attachRemoteAudio(peerSocketId, peerUserId, stream);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.closePeer(peerSocketId, peerUserId);
      }
    };

    if (isInitiator) {
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
        });
        await pc.setLocalDescription(offer);
        if (this.socket) {
          this.socket.emit('voice:signal', {
            toSocketId: peerSocketId,
            fromUserId: this.currentUser?.id,
            fromUsername: this.currentUser?.username,
            signalData: { sdp: pc.localDescription },
          });
        }
      } catch (err) {
        console.warn('[VoiceService] createOffer notice:', err);
      }
    }

    return pc;
  }

  private async handleSignal(fromSocketId: string, fromUserId: string, signalData: any) {
    let pc = this.peerConnections.get(fromSocketId);
    if (!pc) {
      pc = await this.createPeerConnection(fromSocketId, fromUserId, false);
    }

    if (fromUserId) {
      this.socketToUser.set(fromSocketId, fromUserId);
      this.userToSocket.set(fromUserId, fromSocketId);
    }

    try {
      if (signalData.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
        if (signalData.sdp.type === 'offer') {
          const answer = await pc.createAnswer({
            offerToReceiveAudio: true,
          });
          await pc.setLocalDescription(answer);
          if (this.socket) {
            this.socket.emit('voice:signal', {
              toSocketId: fromSocketId,
              fromUserId: this.currentUser?.id,
              fromUsername: this.currentUser?.username,
              signalData: { sdp: pc.localDescription },
            });
          }
        }
      } else if (signalData.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
      }
    } catch (err) {
      console.warn('[VoiceService] Signal notice:', err);
    }
  }

  private attachRemoteAudio(peerSocketId: string, peerUserId: string, stream: MediaStream) {
    const userId = peerUserId || this.socketToUser.get(peerSocketId) || peerSocketId;

    let audio = this.audioElements.get(userId);
    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      (audio as any).playsInline = true;
      document.body.appendChild(audio);
      this.audioElements.set(userId, audio);
    }

    audio.srcObject = stream;
    audio.muted = this.state.isDeafened;
    audio.volume = this.state.peers[userId]?.volume ?? 1.0;
    audio.play().catch(() => {});

    // Set up real-time Web Audio Analyser directly on the remote incoming stream
    try {
      this.ensureAudioContext();
      if (this.audioContext && this.audioContext.state !== 'closed') {
        const source = this.audioContext.createMediaStreamSource(stream);
        const analyser = this.audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.15;
        source.connect(analyser);

        const remoteEntry = {
          analyser,
          source,
          noiseFloor: 0.005,
          silenceFrames: 0,
          speechFrames: 0,
        };
        this.remoteAnalysers.set(userId, remoteEntry);

        const floatData = new Float32Array(analyser.fftSize);

        const processRemoteAudio = () => {
          if (!this.state.isConnected || !this.remoteAnalysers.has(userId)) return;

          analyser.getFloatTimeDomainData(floatData);

          let sumSquares = 0;
          for (let i = 0; i < floatData.length; i++) {
            const val = floatData[i];
            sumSquares += val * val;
          }
          const rms = Math.sqrt(sumSquares / floatData.length);

          const peer = this.state.peers[userId];
          if (peer) {
            if (peer.isMuted) {
              if (peer.isSpeaking) {
                peer.isSpeaking = false;
                peer.volumeLevel = 0;
                this.notify();
              }
            } else {
              if (rms < remoteEntry.noiseFloor * 1.8 + 0.005) {
                remoteEntry.noiseFloor = remoteEntry.noiseFloor * 0.96 + rms * 0.04;
              }

              const attackThresh = Math.max(0.016, remoteEntry.noiseFloor * 2.6 + 0.010);
              const releaseThresh = Math.max(0.011, remoteEntry.noiseFloor * 1.9 + 0.006);

              const isLoud = rms >= (peer.isSpeaking ? releaseThresh : attackThresh);

              if (isLoud) {
                remoteEntry.speechFrames++;
                remoteEntry.silenceFrames = 0;
                if (remoteEntry.speechFrames >= 2 && !peer.isSpeaking) {
                  peer.isSpeaking = true;
                  peer.volumeLevel = Math.min(100, Math.round(Math.pow(rms * 22, 0.78) * 100));
                  this.notify();
                }
              } else {
                remoteEntry.silenceFrames++;
                remoteEntry.speechFrames = 0;
                if (remoteEntry.silenceFrames >= 7 && peer.isSpeaking) {
                  peer.isSpeaking = false;
                  peer.volumeLevel = 0;
                  this.notify();
                }
              }
            }
          }

          requestAnimationFrame(processRemoteAudio);
        };

        requestAnimationFrame(processRemoteAudio);
      }
    } catch (err) {}
  }

  private closePeer(peerSocketId: string, peerUserId?: string) {
    const pc = this.peerConnections.get(peerSocketId);
    if (pc) {
      try {
        pc.close();
      } catch {}
      this.peerConnections.delete(peerSocketId);
    }

    const userId = peerUserId || this.socketToUser.get(peerSocketId);
    if (userId) {
      const audio = this.audioElements.get(userId);
      if (audio) {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
        this.audioElements.delete(userId);
      }
      const remoteA = this.remoteAnalysers.get(userId);
      if (remoteA) {
        try {
          remoteA.source.disconnect();
        } catch {}
        this.remoteAnalysers.delete(userId);
      }
      delete this.state.peers[userId];
      this.userToSocket.delete(userId);
      this.socketToUser.delete(peerSocketId);
      this.notify();
    }
  }

  /**
   * Fallback Audio Streamer for strict NAT / restricted container environments
   */
  private startFallbackAudioStream() {
    if (!this.localStream) return;
    try {
      if (typeof MediaRecorder === 'undefined') return;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : '';

      const options = mimeType ? { mimeType, audioBitsPerSecond: 24000 } : { audioBitsPerSecond: 24000 };
      this.mediaRecorder = new MediaRecorder(this.localStream, options);

      this.mediaRecorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0 && this.state.isSpeaking && !this.state.isMuted) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result as string;
            if (this.socket && this.roomId && this.currentUser && base64) {
              this.socket.emit('voice:audio_stream', {
                roomId: this.roomId,
                userId: this.currentUser.id,
                username: this.currentUser.username,
                audioData: base64,
              });
            }
          };
          reader.readAsDataURL(e.data);
        }
      };

      this.mediaRecorder.start(200);
    } catch (err) {
      console.warn('[VoiceService] Fallback stream notice:', err);
    }
  }

  private stopFallbackAudioStream() {
    if (this.mediaRecorder) {
      try {
        if (this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        }
      } catch {}
      this.mediaRecorder = null;
    }
  }

  private playFallbackAudioChunk(fromUserId: string, audioData: string) {
    if (this.state.isDeafened) return;
    try {
      const audio = new Audio(audioData);
      audio.volume = this.state.peers[fromUserId]?.volume ?? 1.0;
      audio.play().catch(() => {});
    } catch {}
  }

  // --- Public Controls ---

  /**
   * Toggles microphone mute state.
   * If unmuting for the first time, prompts for microphone access.
   */
  public async toggleMute(): Promise<boolean> {
    const wantUnmute = this.state.isMuted;

    if (wantUnmute) {
      if (!this.localStream) {
        const ok = await this.initMicrophone();
        if (!ok) {
          this.state.isMuted = true;
          this.state.error = 'Microphone permission needed to speak';
          this.notify();
          return true;
        }
      } else {
        this.localStream.getAudioTracks().forEach((t) => {
          t.enabled = true;
        });
      }
      this.state.isMuted = false;
      this.state.error = null;
      this.startFallbackAudioStream();
    } else {
      this.state.isMuted = true;
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach((t) => {
          t.enabled = false;
        });
      }
      this.state.isSpeaking = false;
      this.state.localVolumeLevel = 0;
      this.lastSpeakingState = false;
      this.localConsecutiveSpeechFrames = 0;
      this.localConsecutiveSilenceFrames = 0;
      this.broadcastSpeakingState(false, 0);
      this.stopFallbackAudioStream();
    }

    if (this.socket && this.roomId && this.currentUser) {
      this.socket.emit('voice:mute_state', {
        roomId: this.roomId,
        userId: this.currentUser.id,
        isMuted: this.state.isMuted,
        isDeafened: this.state.isDeafened,
      });
    }

    this.notify();
    return this.state.isMuted;
  }

  /**
   * Toggles deafen state (hearing other players).
   * Turning sound off only affects this user locally and never disrupts others.
   */
  public toggleDeafen(): boolean {
    const newDeafened = !this.state.isDeafened;
    this.state.isDeafened = newDeafened;

    // If deafened, also mute microphone
    if (newDeafened && !this.state.isMuted) {
      this.toggleMute();
    }

    // Mute or unmute all remote audio elements
    this.audioElements.forEach((el) => {
      el.muted = newDeafened;
    });

    if (this.socket && this.roomId && this.currentUser) {
      this.socket.emit('voice:mute_state', {
        roomId: this.roomId,
        userId: this.currentUser.id,
        isMuted: this.state.isMuted,
        isDeafened: newDeafened,
      });
    }

    this.notify();
    return newDeafened;
  }

  public setPeerVolume(userId: string, volume: number) {
    if (this.state.peers[userId]) {
      this.state.peers[userId].volume = volume;
      const audio = this.audioElements.get(userId);
      if (audio) {
        audio.volume = Math.max(0, Math.min(1, volume));
      }
      this.notify();
    }
  }

  public async setInputDevice(deviceId: string) {
    this.state.selectedDeviceId = deviceId;
    this.notify();
    if (this.state.isConnected && !this.state.isMuted) {
      if (this.localStream) {
        this.localStream.getTracks().forEach((t) => t.stop());
      }
      this.stopVAD();
      await this.initMicrophone();
    }
  }

  public setPushToTalk(enabled: boolean) {
    this.state.pushToTalk = enabled;
    if (enabled && !this.state.isMuted) {
      this.toggleMute();
    }
    this.notify();
  }

  public setEchoCancellation(enabled: boolean) {
    this.state.echoCancellation = enabled;
    this.notify();
  }

  public setNoiseSuppression(enabled: boolean) {
    this.state.noiseSuppression = enabled;
    this.notify();
  }
}

export const voiceService = new VoiceService();

// Global touch/click trigger to immediately lift mobile browser autoplay blocks
if (typeof window !== 'undefined') {
  const handleUserGesture = () => {
    voiceService.resumeAllAudio();
  };
  window.addEventListener('click', handleUserGesture, { passive: true });
  window.addEventListener('touchstart', handleUserGesture, { passive: true });
}
