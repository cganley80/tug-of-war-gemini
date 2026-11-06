/**
 * Tug of War: Citadels of Aethelgard
 * SoundSynthesizer: Procedural Web Audio API Sound System
 * Zero external asset dependencies. Generates physical hits, magic blasts,
 * arrows, artillery, charges, construction, and citadel warnings procedurally.
 */

export class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private volume = 0.5;
  private isUnlocked = false;

  constructor() {
    this.setupUnlockListeners();
  }

  private setupUnlockListeners(): void {
    if (typeof window === 'undefined') return;

    const unlock = () => {
      this.ensureContext();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      this.isUnlocked = true;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('click', unlock);
    };

    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('click', unlock, { once: true });
  }

  private ensureContext(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  public isSoundMuted(): boolean {
    return this.muted;
  }

  public isAudioUnlocked(): boolean {
    return this.isUnlocked;
  }

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx && !this.muted) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  // =========================================================================
  // NOISE BUFFER HELPER
  // =========================================================================
  private createNoiseBuffer(durationSec: number): AudioBuffer | null {
    const ctx = this.ensureContext();
    if (!ctx) return null;

    const bufferSize = ctx.sampleRate * durationSec;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // =========================================================================
  // SOUND EFFECTS
  // =========================================================================

  /**
   * Sword/shield melee strike: metallic impact with quick noise burst and pitch drop.
   */
  public playPhysicalHit(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;

    // Metallic tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.08);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.08);

    // Impact noise burst
    const noiseBuffer = this.createNoiseBuffer(0.06);
    if (noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1800, now);
      filter.Q.setValueAtTime(3, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.35, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.06);
    }
  }

  /**
   * Bow string release whoosh with high-pass snap.
   */
  public playBowShoot(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(850, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.07);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.07);

    // Highpass string snap
    const noiseBuffer = this.createNoiseBuffer(0.04);
    if (noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(2200, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.2, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.04);
    }
  }

  /**
   * Heavy torsion ballista or catapult thud.
   */
  public playBallistaShoot(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.22);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, now);

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  /**
   * Solar magic bell resonance shimmer.
   */
  public playMagicImpact(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;
    const freqs = [880, 1320]; // A5 and E6 harmonic

    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  }

  /**
   * Supernova da Alvorada: Sub-bass boom followed by radiant celestial chord.
   */
  public playSupernova(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;

    // Sub-bass detonation
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(80, now);
    subOsc.frequency.exponentialRampToValueAtTime(30, now + 0.35);

    subGain.gain.setValueAtTime(0.65, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(now);
    subOsc.stop(now + 0.35);

    // Radiant celestial chord (C5, E5, G5, C6)
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + 0.05 * idx);

      gain.gain.setValueAtTime(0.18, now + 0.05 * idx);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + 0.05 * idx);
      osc.stop(now + 0.45);
    });
  }

  /**
   * Cavalry charge: galloping rhythmic thuds + trumpet horn cue.
   */
  public playCavalryCharge(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;

    // Gallop thuds
    [0.0, 0.07, 0.14].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now + offset);
      osc.frequency.exponentialRampToValueAtTime(50, now + offset + 0.05);

      gain.gain.setValueAtTime(0.3, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.05);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + offset);
      osc.stop(now + offset + 0.05);
    });

    // Brassy horn note
    const horn = ctx.createOscillator();
    const hornGain = ctx.createGain();
    horn.type = 'sawtooth';
    horn.frequency.setValueAtTime(349.23, now + 0.15); // F4
    horn.frequency.exponentialRampToValueAtTime(440, now + 0.22); // A4

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now + 0.15);

    hornGain.gain.setValueAtTime(0.25, now + 0.15);
    hornGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    horn.connect(filter);
    filter.connect(hornGain);
    hornGain.connect(this.masterGain);
    horn.start(now + 0.15);
    horn.stop(now + 0.45);
  }

  /**
   * Structure construction hammer strike.
   */
  public playStructureBuild(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;
    [0.0, 0.09].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(idx === 0 ? 620 : 880, now + offset);
      osc.frequency.exponentialRampToValueAtTime(200, now + offset + 0.08);

      gain.gain.setValueAtTime(0.35, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.08);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + offset);
      osc.stop(now + offset + 0.08);
    });
  }

  /**
   * Structure upgrade: triumphant ascending arpeggio.
   */
  public playStructureUpgrade(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);

      gain.gain.setValueAtTime(0.25, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.18);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.18);
    });
  }

  /**
   * Structure sold: coin jingling chime.
   */
  public playStructureSell(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;
    const coinPitches = [2400, 2900, 3400, 3900];
    coinPitches.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.035);

      gain.gain.setValueAtTime(0.15, now + idx * 0.035);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.035 + 0.09);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + idx * 0.035);
      osc.stop(now + idx * 0.035 + 0.09);
    });
  }

  /**
   * Citadel alert: ominous war horn when bastion is damaged or endangered.
   */
  public playCitadelAlert(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;
    const horn = ctx.createOscillator();
    const gain = ctx.createGain();
    horn.type = 'sawtooth';
    horn.frequency.setValueAtTime(174.61, now); // F3
    horn.frequency.linearRampToValueAtTime(155.56, now + 0.5); // Eb3

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(550, now);

    gain.gain.setValueAtTime(0.45, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.35);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    horn.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    horn.start(now);
    horn.stop(now + 0.55);
  }

  /**
   * Victory fanfare.
   */
  public playVictory(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;
    const notes = [
      { f: 523.25, t: 0.0, d: 0.15 },
      { f: 659.25, t: 0.14, d: 0.15 },
      { f: 783.99, t: 0.28, d: 0.18 },
      { f: 1046.5, t: 0.44, d: 0.6 },
    ];

    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, now + n.t);

      gain.gain.setValueAtTime(0.3, now + n.t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + n.t);
      osc.stop(now + n.t + n.d);
    });
  }

  /**
   * Defeat solemn dirge.
   */
  public playDefeat(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.muted) return;

    const now = ctx.currentTime;
    const notes = [
      { f: 329.63, t: 0.0, d: 0.2 },
      { f: 293.66, t: 0.2, d: 0.2 },
      { f: 261.63, t: 0.4, d: 0.25 },
      { f: 220.0, t: 0.65, d: 0.7 },
    ];

    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(n.f, now + n.t);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, now + n.t);

      gain.gain.setValueAtTime(0.3, now + n.t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + n.t);
      osc.stop(now + n.t + n.d);
    });
  }
}
