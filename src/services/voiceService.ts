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
  private audioContext: AudioContext | null = null;
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

  // Web Audio fallback streamer
  private mediaRecorder: MediaRecorder | null = null;

  private state: VoiceState = {
    isConnected: false,
    isConnecting: false,
    isMuted: false,
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

    this.socket.on('voice:user_joined', async (data: { socketId: string; userId: string; username: string; avatar: string }) => {
      if (!this.state.isConnected || !this.localStream) return;
      this.socketToUser.set(data.socketId, data.userId);
      this.userToSocket.set(data.userId, data.socketId);

      this.state.peers[data.userId] = {
        socketId: data.socketId,
        userId: data.userId,
        username: data.username,
        avatar: data.avatar,
        isSpeaking: false,
        isMuted: false,
        isDeafened: false,
        volume: 1.0,
        volumeLevel: 0,
      };
      this.notify();

      // Initiate WebRTC offer as the existing peer
      await this.createPeerConnection(data.socketId, data.userId, true);
    });

    this.socket.on('voice:user_left', (data: { socketId: string; userId: string }) => {
      this.closePeer(data.socketId, data.userId);
    });

    this.socket.on('voice:signal', async (data: { fromSocketId: string; fromUserId: string; signalData: any }) => {
      await this.handleSignal(data.fromSocketId, data.fromUserId, data.signalData);
    });

    this.socket.on('voice:user_speaking', (data: { userId: string; isSpeaking: boolean; volume: number }) => {
      if (this.state.peers[data.userId]) {
        // Only update if peer is not muted
        if (this.state.peers[data.userId].isMuted) {
          this.state.peers[data.userId].isSpeaking = false;
          this.state.peers[data.userId].volumeLevel = 0;
        } else {
          this.state.peers[data.userId].isSpeaking = Boolean(data.isSpeaking);
          this.state.peers[data.userId].volumeLevel = data.isSpeaking ? Math.max(15, data.volume ?? 50) : 0;
        }
        this.notify();
      }
    });

    this.socket.on('voice:user_mute_state', (data: { userId: string; isMuted: boolean; isDeafened: boolean }) => {
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

    // Fallback audio playback (if peer-to-peer WebRTC is restricted)
    this.socket.on('voice:incoming_audio', async (data: { fromUserId: string; audioData: string }) => {
      if (this.state.isDeafened || !this.state.isConnected) return;
      if (data.fromUserId === this.currentUser?.id) return;
      this.playFallbackAudioChunk(data.fromUserId, data.audioData);
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
      if (!navigator.mediaDevices?.enumerateDevices) return [];
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

  /**
   * Connects to the table's voice channel
   */
  public async joinVoice(roomId: string, user: { id: string; username: string; avatar: string }): Promise<boolean> {
    if (this.state.isConnected && this.roomId === roomId) return true;

    this.roomId = roomId;
    this.currentUser = user;
    this.state.isConnecting = true;
    this.state.error = null;
    this.notify();

    try {
      // 1. Get microphone access
      await this.initMicrophone();

      // 2. Load available devices
      await this.loadInputDevices();

      // 3. Join voice room on socket server
      if (this.socket && this.socket.connected) {
        this.socket.emit(
          'voice:join',
          { roomId, user },
          async (res: { success: boolean; peerSocketIds?: string[] }) => {
            if (res?.success && res.peerSocketIds) {
              for (const peerSid of res.peerSocketIds) {
                await this.createPeerConnection(peerSid, '', false);
              }
            }
          }
        );
      }

      this.state.isConnected = true;
      this.state.isConnecting = false;
      this.notify();

      // Start fallback chunk streamer
      this.startFallbackAudioStream();

      return true;
    } catch (err: any) {
      console.warn('[VoiceService] Failed to join voice:', err);
      this.state.isConnected = false;
      this.state.isConnecting = false;
      this.state.error = err?.message || 'Could not access microphone';
      this.notify();
      return false;
    }
  }

  /**
   * Leaves the table voice channel and releases microphone
   */
  public leaveVoice() {
    if (this.socket && this.roomId && this.currentUser) {
      this.socket.emit('voice:leave', { roomId: this.roomId, userId: this.currentUser.id });
    }

    this.stopFallbackAudioStream();
    this.stopVAD();

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }

    // Clean up remote analyzers
    this.remoteAnalysers.forEach(({ source }) => {
      try {
        source.disconnect();
      } catch {}
    });
    this.remoteAnalysers.clear();

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }

    // Close peer connections
    this.peerConnections.forEach((pc) => {
      try {
        pc.close();
      } catch {}
    });
    this.peerConnections.clear();

    // Remove audio elements
    this.audioElements.forEach((el) => {
      try {
        el.pause();
        el.srcObject = null;
        el.remove();
      } catch {}
    });
    this.audioElements.clear();

    this.socketToUser.clear();
    this.userToSocket.clear();

    this.roomId = null;
    this.state.isConnected = false;
    this.state.isConnecting = false;
    this.state.isSpeaking = false;
    this.state.localVolumeLevel = 0;
    this.state.peers = {};
    this.lastSpeakingState = false;
    this.localConsecutiveSpeechFrames = 0;
    this.localConsecutiveSilenceFrames = 0;
    this.notify();
  }

  /**
   * Initializes local microphone stream and VAD analyzer
   */
  private async initMicrophone() {
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

    // Apply mute state
    this.localStream.getAudioTracks().forEach((t) => {
      t.enabled = !this.state.isMuted;
    });

    // Start Voice Activity Detection
    this.startVAD(stream);
  }

  /**
   * Highly efficient & robust Voice Activity Detection (VAD)
   * Uses precision Float32 Time-Domain RMS with Adaptive Noise Floor Tracking
   * and dual-threshold hysteresis (fast attack < 20ms, crisp decay ~120ms).
   */
  private startVAD(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtx();
      }

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.15; // Low smoothing for instant real-time reactivity

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

        // Read precision Float32 audio time-domain waveform (-1.0 to 1.0)
        this.analyser.getFloatTimeDomainData(floatData);

        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
          const val = floatData[i];
          sumSquares += val * val;
        }
        const rms = Math.sqrt(sumSquares / bufferLength);

        // If user is muted, immediately zero out speaking and volume
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

        // Dynamically track background noise floor when not speaking
        if (rms < this.localNoiseFloor * 1.8 + 0.005) {
          this.localNoiseFloor = this.localNoiseFloor * 0.96 + rms * 0.04;
        }

        // Adaptive thresholds:
        // Attack threshold: Requires clear vocal onset above noise floor
        const speechAttackThreshold = Math.max(0.016, this.localNoiseFloor * 2.6 + 0.010);
        // Release threshold: Sustains speech during vocalization, but cuts immediately on silence
        const speechReleaseThreshold = Math.max(0.011, this.localNoiseFloor * 1.9 + 0.006);

        // Scale RMS to a calibrated 0-100 visual volume meter level
        const volumeFactor = Math.max(0, rms - this.localNoiseFloor);
        const normalizedVolume = Math.min(100, Math.round(Math.pow(volumeFactor * 22, 0.78) * 100));
        this.state.localVolumeLevel = normalizedVolume;

        const isCurrentlyLoud = rms >= (this.lastSpeakingState ? speechReleaseThreshold : speechAttackThreshold);

        if (isCurrentlyLoud) {
          this.localConsecutiveSpeechFrames++;
          this.localConsecutiveSilenceFrames = 0;

          // Fast Attack: Trigger speaking state after ~2 consecutive frames (>25ms of real sound)
          if (this.localConsecutiveSpeechFrames >= 2 && !this.lastSpeakingState) {
            this.state.isSpeaking = true;
            this.lastSpeakingState = true;
            this.notify();
            this.broadcastSpeakingState(true, normalizedVolume);
          } else if (this.lastSpeakingState) {
            // Periodic real-time update of volume level to peers
            const now = Date.now();
            if (now - this.lastBroadcastVolumeTime > 100) {
              this.lastBroadcastVolumeTime = now;
              this.broadcastSpeakingState(true, normalizedVolume);
            }
          }
        } else {
          this.localConsecutiveSilenceFrames++;
          this.localConsecutiveSpeechFrames = 0;

          // Crisp Release: Turn off speaking indicator cleanly after ~7 silent frames (~110ms)
          // This avoids syllable jitter while ensuring instant visual stop when player finishes talking.
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

    // Add local tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
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
        console.warn('[VoiceService] createOffer error:', err);
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
          const answer = await pc.createAnswer();
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
      console.warn('[VoiceService] Signal error:', err);
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
              // Update remote noise floor
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
    } catch (err) {
      // AudioContext fallback to socket relay
    }
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

      this.mediaRecorder.start(200); // 200ms low-latency chunks
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

  public toggleMute(): boolean {
    const newMuted = !this.state.isMuted;
    this.state.isMuted = newMuted;

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((t) => {
        t.enabled = !newMuted;
      });
    }

    if (newMuted) {
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
        isMuted: newMuted,
        isDeafened: this.state.isDeafened,
      });
    }

    this.notify();
    return newMuted;
  }

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
    if (this.state.isConnected) {
      // Reinitialize mic with new device
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
