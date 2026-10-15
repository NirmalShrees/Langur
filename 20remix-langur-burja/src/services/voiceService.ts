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
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
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
  private pcmSourceNode: MediaStreamAudioSourceNode | null = null;
  private pcmSilentGain: GainNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private animationFrameId: number | null = null;

  // Adaptive Noise Floor Tracking for Local Mic
  private localNoiseFloor = 0.006;
  private localConsecutiveSpeechFrames = 0;
  private localConsecutiveSilenceFrames = 0;

  // WebRTC Peer connections: socketId -> RTCPeerConnection
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  // Pending ICE candidates queue: socketId -> RTCIceCandidateInit[]
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  // Remote audio elements: userId -> HTMLAudioElement
  private audioElements: Map<string, HTMLAudioElement> = new Map();

  // Web Audio PCM Streaming Timeline: userId -> next playback schedule timestamp
  private peerScheduledAudioTime: Map<string, number> = new Map();
  private peerGainNodes: Map<string, GainNode> = new Map();

  // SocketId to UserId mapping
  private socketToUser: Map<string, string> = new Map();
  private userToSocket: Map<string, string> = new Map();
  private fallbackSpeakingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

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

    this.socket.on(
      'voice:user_joined',
      async (data: {
        socketId: string;
        userId: string;
        username: string;
        avatar: string;
        isMuted?: boolean;
        isDeafened?: boolean;
      }) => {
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
          // As existing peer, initiate WebRTC offer to the newly joined peer
          await this.createPeerConnection(data.socketId, data.userId, true);
        }
      }
    );

    this.socket.on('voice:user_left', (data: { socketId: string; userId: string }) => {
      this.closePeer(data.socketId, data.userId);
    });

    this.socket.on(
      'voice:signal',
      async (data: { fromSocketId: string; fromUserId: string; signalData: any }) => {
        await this.handleSignal(data.fromSocketId, data.fromUserId, data.signalData);
      }
    );

    this.socket.on(
      'voice:user_speaking',
      (data: { userId: string; isSpeaking: boolean; volume?: number }) => {
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
      }
    );

    this.socket.on(
      'voice:user_mute_state',
      (data: { userId: string; isMuted: boolean; isDeafened: boolean }) => {
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
      }
    );

    // High-Fidelity Real-Time PCM Audio Stream Relay
    this.socket.on(
      'voice:incoming_audio',
      async (data: {
        fromUserId: string;
        fromUsername?: string;
        audioData: string | number[];
        sampleRate?: number;
      }) => {
        if (this.state.isDeafened || !this.state.isConnected) return;
        if (!data?.fromUserId || data.fromUserId === this.currentUser?.id) return;

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

        // Clear existing silence timer
        const existingTimer = this.fallbackSpeakingTimers.get(peerId);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        const timer = setTimeout(() => {
          if (this.state.peers[peerId]) {
            this.state.peers[peerId].isSpeaking = false;
            this.state.peers[peerId].volumeLevel = 0;
            this.notify();
          }
          this.fallbackSpeakingTimers.delete(peerId);
        }, 320);
        this.fallbackSpeakingTimers.set(peerId, timer);

        // Play incoming PCM audio chunk through Web Audio API pipeline
        this.playPcmAudioChunk(peerId, data.audioData, data.sampleRate || 16000);
      }
    );
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
      
      // Default to standard system/browser default mic unless explicitly configured
      if (!this.state.selectedDeviceId) {
        this.state.selectedDeviceId = 'default';
      }
      this.notify();
      return audioInputs;
    } catch {
      return [];
    }
  }

  public ensureAudioContext(): AudioContext | null {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx && (!this.audioContext || this.audioContext.state === 'closed')) {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
      return this.audioContext;
    } catch {
      return null;
    }
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
   */
  public async joinVoice(
    roomId: string,
    user: { id: string; username: string; avatar: string }
  ): Promise<boolean> {
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
                  // Initiate WebRTC offer to existing peers
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

    return true;
  }

  /**
   * Leaves the table voice channel and releases resources
   */
  public leaveVoice() {
    if (this.socket && this.roomId && this.currentUser) {
      this.socket.emit('voice:leave', { roomId: this.roomId, userId: this.currentUser.id });
    }

    this.stopPcmAudioStreaming();
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
    this.pendingCandidates.clear();

    // Clean up audio elements
    this.audioElements.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    });
    this.audioElements.clear();

    this.peerScheduledAudioTime.clear();
    this.peerGainNodes.clear();

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
   * @param forceUnmute If true, immediately activates audio transmission without needing a second toggle.
   */
  public async initMicrophone(forceUnmute = true): Promise<boolean> {
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        this.state.error = 'Microphone API not supported on this browser';
        this.notify();
        return false;
      }

      // 1. Ensure and resume AudioContext immediately inside user-initiated action
      this.ensureAudioContext();
      if (this.audioContext && this.audioContext.state === 'suspended') {
        await this.audioContext.resume().catch(() => {});
      }

      // 2. Clean up previous streams and audio processing graph
      this.stopPcmAudioStreaming();
      this.stopVAD();
      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => track.stop());
        this.localStream = null;
      }

      let stream: MediaStream | null = null;
      const chosenId = this.state.selectedDeviceId;

      // Tier 1: Try with audio processing flags (using default active mic if chosenId is default)
      try {
        const audioConstraints: MediaTrackConstraints = {
          echoCancellation: this.state.echoCancellation,
          noiseSuppression: this.state.noiseSuppression,
          autoGainControl: true,
        };
        if (chosenId && chosenId !== 'default' && chosenId !== 'communications') {
          audioConstraints.deviceId = { ideal: chosenId };
        }
        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: false,
        });
      } catch (t1Err) {
        console.warn('[VoiceService] Tier 1 mic capture fallback:', t1Err);
      }

      // Tier 2: Try standard audio with echo cancellation
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: this.state.echoCancellation,
              noiseSuppression: this.state.noiseSuppression,
            },
            video: false,
          });
        } catch (t2Err) {
          console.warn('[VoiceService] Tier 2 mic capture fallback:', t2Err);
        }
      }

      // Tier 3: Basic audio capture
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
        } catch (t3Err: any) {
          console.error('[VoiceService] All microphone capture tiers failed:', t3Err);
          this.state.error = 'Microphone permission needed. Please allow microphone access in your browser.';
          this.notify();
          return false;
        }
      }

      this.localStream = stream;

      // 3. Set track enablement based on forceUnmute
      if (forceUnmute) {
        this.state.isMuted = false;
        this.state.error = null;
      }

      // Detect active hardware deviceId
      const activeTrack = stream.getAudioTracks()[0];
      if (activeTrack) {
        activeTrack.enabled = !this.state.isMuted;
        // Re-enumerate devices with newly granted permission
        this.loadInputDevices().catch(() => {});
      }

      // 4. Update tracks on all active peer connections and trigger renegotiation
      if (activeTrack) {
        this.peerConnections.forEach(async (pc, peerSid) => {
          try {
            const senders = pc.getSenders();
            const audioSender = senders.find((s) => !s.track || s.track.kind === 'audio');
            if (audioSender) {
              await audioSender.replaceTrack(activeTrack).catch(() => {});
            } else {
              pc.addTrack(activeTrack, stream!);
            }
            this.renegotiatePeer(peerSid, pc);
          } catch (e) {
            console.warn('[VoiceService] Peer track attach notice:', e);
          }
        });
      }

      // 5. Start Voice Activity Detection and PCM Audio Streaming if unmuted
      if (!this.state.isMuted) {
        this.startVAD(stream);
        this.startPcmAudioStreaming(stream);
      }

      // 6. Broadcast updated mute state to the room
      if (this.socket && this.roomId && this.currentUser) {
        this.socket.emit('voice:mute_state', {
          roomId: this.roomId,
          userId: this.currentUser.id,
          isMuted: this.state.isMuted,
          isDeafened: this.state.isDeafened,
        });
      }

      this.notify();
      return true;
    } catch (err: any) {
      console.warn('[VoiceService] Microphone access note:', err?.message || err);
      this.state.error = err?.message || 'Microphone error';
      this.notify();
      return false;
    }
  }

  /**
   * Renegotiates an active WebRTC peer connection after track addition
   */
  private async renegotiatePeer(peerSocketId: string, pc: RTCPeerConnection) {
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
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
      console.warn('[VoiceService] renegotiatePeer notice:', err);
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
   * Real-Time Low-Latency Web Audio PCM Streamer (16kHz 16-bit Mono)
   */
  private startPcmAudioStreaming(stream: MediaStream) {
    try {
      this.ensureAudioContext();
      if (!this.audioContext || this.state.isMuted) return;

      this.stopPcmAudioStreaming();

      const source = this.audioContext.createMediaStreamSource(stream);
      this.pcmSourceNode = source;

      // 2048 buffer size = responsive transmission (~40ms - 120ms per slice depending on sampleRate)
      const processor = this.audioContext.createScriptProcessor(2048, 1, 1);
      this.processorNode = processor;

      processor.onaudioprocess = (e) => {
        if (!this.state.isConnected || this.state.isMuted) return;

        const inputBuffer = e.inputBuffer.getChannelData(0);
        let sumSquares = 0;
        for (let i = 0; i < inputBuffer.length; i++) {
          const val = inputBuffer[i];
          sumSquares += val * val;
        }
        const rms = Math.sqrt(sumSquares / inputBuffer.length);

        // Transmit audio as long as there is any signal above absolute silence (rms > 0.0008)
        if (rms < 0.0008) return;

        // Convert Float32Array (-1.0 to 1.0) to Int16 PCM array
        const pcm16 = new Int16Array(inputBuffer.length);
        for (let i = 0; i < inputBuffer.length; i++) {
          const s = Math.max(-1, Math.min(1, inputBuffer[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Convert Int16Array to Base64
        const uint8 = new Uint8Array(pcm16.buffer);
        let binary = '';
        const len = uint8.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        const base64Audio = btoa(binary);

        if (this.socket && this.roomId && this.currentUser) {
          this.socket.emit('voice:audio_stream', {
            roomId: this.roomId,
            userId: this.currentUser.id,
            username: this.currentUser.username,
            audioData: base64Audio,
            sampleRate: this.audioContext?.sampleRate || 16000,
          });
        }
      };

      source.connect(processor);
      // Connect to a silent dummy destination so onaudioprocess fires continuously
      const silentGain = this.audioContext.createGain();
      silentGain.gain.value = 0;
      this.pcmSilentGain = silentGain;
      processor.connect(silentGain);
      silentGain.connect(this.audioContext.destination);
    } catch (err) {
      console.warn('[VoiceService] startPcmAudioStreaming notice:', err);
    }
  }

  private stopPcmAudioStreaming() {
    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {}
      this.processorNode = null;
    }
    if (this.pcmSourceNode) {
      try {
        this.pcmSourceNode.disconnect();
      } catch {}
      this.pcmSourceNode = null;
    }
    if (this.pcmSilentGain) {
      try {
        this.pcmSilentGain.disconnect();
      } catch {}
      this.pcmSilentGain = null;
    }
  }

  /**
   * Plays incoming PCM audio slice with continuous seamless scheduling
   */
  private playPcmAudioChunk(
    fromUserId: string,
    audioData: string | number[],
    sampleRate = 16000
  ) {
    if (this.state.isDeafened) return;

    try {
      const ctx = this.ensureAudioContext();
      if (!ctx || ctx.state === 'closed') return;

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      let int16Array: Int16Array;
      if (typeof audioData === 'string') {
        const binaryStr = atob(audioData);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        int16Array = new Int16Array(bytes.buffer);
      } else {
        int16Array = new Int16Array(audioData);
      }

      // Convert Int16 PCM to Float32 AudioBuffer
      const numSamples = int16Array.length;
      const audioBuffer = ctx.createBuffer(1, numSamples, sampleRate);
      const channelData = audioBuffer.getChannelData(0);

      for (let i = 0; i < numSamples; i++) {
        channelData[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7fff);
      }

      // Setup gain node per peer for individual volume control
      let gainNode = this.peerGainNodes.get(fromUserId);
      if (!gainNode) {
        gainNode = ctx.createGain();
        gainNode.connect(ctx.destination);
        this.peerGainNodes.set(fromUserId, gainNode);
      }
      const peerVol = this.state.peers[fromUserId]?.volume ?? 1.0;
      gainNode.gain.value = this.state.isDeafened ? 0 : peerVol;

      // Jitter buffer timeline scheduling
      const currentTime = ctx.currentTime;
      let scheduledTime = this.peerScheduledAudioTime.get(fromUserId) || currentTime;
      if (scheduledTime < currentTime) {
        scheduledTime = currentTime + 0.015; // 15ms lead-in buffer
      }

      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(gainNode);
      sourceNode.start(scheduledTime);

      this.peerScheduledAudioTime.set(fromUserId, scheduledTime + audioBuffer.duration);
    } catch (err) {
      console.warn('[VoiceService] playPcmAudioChunk notice:', err);
    }
  }

  /**
   * WebRTC Peer Connection handling with ICE Buffering & Transceivers
   */
  private async createPeerConnection(
    peerSocketId: string,
    peerUserId: string,
    isInitiator: boolean
  ): Promise<RTCPeerConnection> {
    const existing = this.peerConnections.get(peerSocketId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnections.set(peerSocketId, pc);
    this.pendingCandidates.set(peerSocketId, []);

    // Attach local mic tracks or audio transceiver
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    } else {
      try {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      } catch {}
    }

    pc.onnegotiationneeded = async () => {
      try {
        if (pc.signalingState !== 'stable') return;
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
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
        console.warn('[VoiceService] onnegotiationneeded notice:', err);
      }
    };

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
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
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

        // Drain any pending ICE candidates now that remote description is set
        const queued = this.pendingCandidates.get(fromSocketId) || [];
        for (const candidate of queued) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch {}
        }
        this.pendingCandidates.set(fromSocketId, []);

        if (signalData.sdp.type === 'offer') {
          const answer = await pc.createAnswer({ offerToReceiveAudio: true });
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
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
        } else {
          // Buffer candidate until remote description is set
          const list = this.pendingCandidates.get(fromSocketId) || [];
          list.push(signalData.candidate);
          this.pendingCandidates.set(fromSocketId, list);
        }
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
  }

  private closePeer(peerSocketId: string, peerUserId?: string) {
    const pc = this.peerConnections.get(peerSocketId);
    if (pc) {
      try {
        pc.close();
      } catch {}
      this.peerConnections.delete(peerSocketId);
    }
    this.pendingCandidates.delete(peerSocketId);

    const userId = peerUserId || this.socketToUser.get(peerSocketId);
    if (userId) {
      const audio = this.audioElements.get(userId);
      if (audio) {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
        this.audioElements.delete(userId);
      }
      this.peerScheduledAudioTime.delete(userId);
      this.peerGainNodes.delete(userId);

      delete this.state.peers[userId];
      this.userToSocket.delete(userId);
      this.socketToUser.delete(peerSocketId);
      this.notify();
    }
  }

  // --- Public Controls ---

  /**
   * Toggles microphone mute state with immediate responsive audio engagement.
   */
  public async toggleMute(): Promise<boolean> {
    const wantUnmute = this.state.isMuted;

    this.ensureAudioContext();
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume().catch(() => {});
    }

    if (wantUnmute) {
      const isStreamActive =
        this.localStream &&
        this.localStream.getAudioTracks().length > 0 &&
        this.localStream.getAudioTracks().some((t) => t.readyState === 'live');

      if (!isStreamActive) {
        const ok = await this.initMicrophone(true);
        if (!ok) {
          this.state.isMuted = true;
          this.state.error = 'Microphone permission needed to speak';
          this.notify();
          return true;
        }
      } else if (this.localStream) {
        this.state.isMuted = false;
        this.state.error = null;
        this.localStream.getAudioTracks().forEach((t) => {
          t.enabled = true;
        });

        const activeTrack = this.localStream.getAudioTracks()[0];
        if (activeTrack) {
          this.peerConnections.forEach(async (pc, peerSid) => {
            try {
              const senders = pc.getSenders();
              const audioSender = senders.find((s) => !s.track || s.track.kind === 'audio');
              if (audioSender) {
                await audioSender.replaceTrack(activeTrack).catch(() => {});
              }
              this.renegotiatePeer(peerSid, pc);
            } catch (e) {
              console.warn('[VoiceService] Peer track re-attach notice:', e);
            }
          });
        }

        this.startVAD(this.localStream);
        this.startPcmAudioStreaming(this.localStream);
      }
      this.state.isMuted = false;
      this.state.error = null;
    } else {
      this.state.isMuted = true;
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach((t) => {
          t.enabled = false;
        });
      }
      this.stopPcmAudioStreaming();
      this.state.isSpeaking = false;
      this.state.localVolumeLevel = 0;
      this.lastSpeakingState = false;
      this.localConsecutiveSpeechFrames = 0;
      this.localConsecutiveSilenceFrames = 0;
      this.broadcastSpeakingState(false, 0);
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
   */
  public toggleDeafen(): boolean {
    const newDeafened = !this.state.isDeafened;
    this.state.isDeafened = newDeafened;

    // If deafened, also mute microphone
    if (newDeafened && !this.state.isMuted) {
      this.toggleMute();
    }

    // Mute or unmute all remote audio elements & Web Audio gains
    this.audioElements.forEach((el) => {
      el.muted = newDeafened;
    });
    this.peerGainNodes.forEach((gain, userId) => {
      const vol = this.state.peers[userId]?.volume ?? 1.0;
      gain.gain.value = newDeafened ? 0 : vol;
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
      const gain = this.peerGainNodes.get(userId);
      if (gain) {
        gain.gain.value = this.state.isDeafened ? 0 : Math.max(0, Math.min(1, volume));
      }
      this.notify();
    }
  }

  public async setInputDevice(deviceId: string) {
    this.state.selectedDeviceId = deviceId;
    this.notify();
    if (this.state.isConnected && !this.state.isMuted) {
      await this.initMicrophone(true);
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
