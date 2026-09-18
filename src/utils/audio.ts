/**
 * Web Audio API synthesizer for Langur Burja game effects
 * Generates procedural realistic sound effects for dice rattles, table bounces, chip clicks, and win fanfares.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  public setMuted(muted: boolean): boolean {
    this.isMuted = muted;
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Sound of chips placing on betting squares
   */
  public playChipSound() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(2200, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.06);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.06);
    } catch {
      // Audio context blocked or unsupported
    }
  }

  /**
   * 3... 2... 1... 0 Countdown tick sound
   */
  public playCountdownTick(count: number) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      const freq = count === 0 ? 1040 : count === 1 ? 880 : count === 2 ? 660 : 520;
      osc.type = count <= 1 ? 'square' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.9, now + (count === 0 ? 0.20 : 0.12));

      gain.gain.setValueAtTime(count === 0 ? 0.28 : 0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (count === 0 ? 0.22 : 0.16));

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + (count === 0 ? 0.23 : 0.17));
    } catch {
      // Audio context error
    }
  }

  /**
   * Shaking dice in wooden/brass cup - layered with metallic resonance and tumbling noise
   */
  public playDiceShakeSound() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // 1. Tumbling noise burst
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.7);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * (0.8 + Math.sin(i * 0.05) * 0.2);
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, now);
      filter.Q.setValueAtTime(3.5, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.01, now);
      noiseGain.gain.linearRampToValueAtTime(0.28, now + 0.1);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);

      whiteNoise.start(now);
      whiteNoise.stop(now + 0.7);

      // 2. Brass cup metallic resonance ringers (multi-tone clatter)
      const resonantFrequencies = [880, 1320, 1760, 2400];
      resonantFrequencies.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const resGain = this.ctx!.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq + (Math.random() - 0.5) * 40, now);

        const startTime = now + (idx * 0.08) + Math.random() * 0.04;
        resGain.gain.setValueAtTime(0, startTime);
        resGain.gain.linearRampToValueAtTime(0.08, startTime + 0.02);
        resGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.25);

        osc.connect(resGain);
        resGain.connect(this.ctx!.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.28);
      });
    } catch {
      // Audio context error
    }
  }

  /**
   * Cup lift whoosh sound effect
   */
  public playCupLiftSound() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.25);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.26);
    } catch {}
  }

  /**
   * Dice landing & bouncing on felt table - wooden clack with acoustic body
   */
  public playDiceLandSound() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      // Pitch variation for organic feel
      const baseFreq = 260 + (Math.random() - 0.5) * 60;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.07);

      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.075);
    } catch {
      // Audio context error
    }
  }

  /**
   * Winning celebration chord
   */
  public playWinFanfare() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      const now = this.ctx.currentTime;

      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0, now + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.4);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.45);
      });
    } catch {
      // Audio context error
    }
  }

  public playWinCelebration() {
    this.playWinFanfare();
  }

  /**
   * Jackpot chord
   */
  public playJackpotSound() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const notes = [440, 554.37, 659.25, 880, 1108.73, 1318.51];
      const now = this.ctx.currentTime;

      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = 'sawtooth';
        const startTime = now + idx * 0.06;

        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.18, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.65);
      });
    } catch {
      // Audio context error
    }
  }
}

export const sound = new SoundEngine();
