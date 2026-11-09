/**
 * Procedurally synthesised firework sounds (Web Audio). No audio files are
 * downloaded and nothing plays until the browser allows it (first gesture).
 * The master bus also feeds a MediaStream so recordings include sound.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private recordDest: MediaStreamAudioDestinationNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  private lastCrackle = 0;

  /** Must be called from a user gesture (tap/click/key). */
  unlock(): void {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      try {
        this.recordDest = this.ctx.createMediaStreamDestination();
        comp.connect(this.recordDest);
      } catch {
        this.recordDest = null;
      }
      this.noise = this.makeNoise(2);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.03);
    }
  }

  /** Audio track for video recording (null if unavailable or muted). */
  recordingTrack(): MediaStreamTrack | null {
    if (this.muted || !this.recordDest) return null;
    return this.recordDest.stream.getAudioTracks()[0] ?? null;
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === "running") void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private ok(): boolean {
    return !!this.ctx && !!this.master && !this.muted && this.ctx.state === "running";
  }

  private noiseSource(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    return src;
  }

  /** Thump + fizz when a rocket leaves the tube. */
  launch(volume = 1, whistle = false): void {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(3000, t + 1.2);
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18 * volume, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    src.connect(bp).connect(g).connect(this.master!);
    src.start(t, Math.random());
    src.stop(t + 1.4);

    if (whistle) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(1400, t);
      o.frequency.exponentialRampToValueAtTime(2600 + Math.random() * 600, t + 1.3);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.06 * volume, t + 0.1);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(og).connect(this.master!);
      o.start(t);
      o.stop(t + 1.5);
    }
  }

  /** Main shell explosion: low thump + noisy crack + rumble tail. */
  boom(volume = 1, size = 1, delay = 0): void {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const v = Math.min(1, volume);

    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(110 / Math.sqrt(size), t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.6);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.9 * v, t + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(og).connect(this.master!);
    o.start(t);
    o.stop(t + 1);

    const src = this.noiseSource();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(5000, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 1.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.75 * v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    src.connect(lp).connect(g).connect(this.master!);
    src.start(t, Math.random());
    src.stop(t + 2.3);
  }

  /** Burst of tiny crackles (rate-limited). */
  crackle(amount = 1, volume = 1): void {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    if (now - this.lastCrackle < 0.07) return;
    this.lastCrackle = now;
    const n = Math.min(14, 3 + Math.round(amount));
    for (let k = 0; k < n; k++) {
      const t = now + Math.random() * 0.12;
      const src = this.noiseSource();
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 2500 + Math.random() * 3000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35 * volume * (0.4 + Math.random() * 0.6), t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.03);
      src.connect(hp).connect(g).connect(this.master!);
      src.start(t, Math.random());
      src.stop(t + 0.08);
    }
  }

  /** Short pop for roman candle shots. */
  pop(volume = 1): void {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 600 + Math.random() * 300;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7 * volume, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    src.connect(bp).connect(g).connect(this.master!);
    src.start(t, Math.random());
    src.stop(t + 0.3);
  }

  /** Sputtering fuse: crackly high hiss that gets busier near the end. */
  fuse(duration: number, volume = 1): void {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 4200;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    const steps = Math.max(8, Math.round(duration * 25));
    const curve = new Float32Array(steps);
    for (let i = 0; i < steps; i++) {
      const k = i / (steps - 1);
      curve[i] = (0.03 + Math.random() * 0.07 + k * 0.08) * volume;
    }
    curve[steps - 1] = 0.0001;
    g.gain.setValueCurveAtTime(curve, t, duration);
    src.connect(bp).connect(g).connect(this.master!);
    src.start(t, Math.random());
    src.stop(t + duration + 0.05);
  }

  /** The bomb going off: hard crack plus a deep, long thump. */
  blast(volume = 1): void {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.9);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(1.2 * volume, t + 0.005);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    o.connect(og).connect(this.master!);
    o.start(t);
    o.stop(t + 1.4);

    const crack = this.noiseSource();
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t);
    cg.gain.exponentialRampToValueAtTime(1.0 * volume, t + 0.002);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    crack.connect(cg).connect(this.master!);
    crack.start(t, Math.random());
    crack.stop(t + 0.2);

    const rum = this.noiseSource();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 2.5);
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.0001, t);
    rg.gain.exponentialRampToValueAtTime(0.8 * volume, t + 0.01);
    rg.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    rum.connect(lp).connect(rg).connect(this.master!);
    rum.start(t, Math.random());
    rum.stop(t + 3.1);
  }

  /** Continuous hiss for fountains. */
  hiss(duration: number, volume = 1): void {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 * volume, t + 0.4);
    g.gain.setValueAtTime(0.12 * volume, t + Math.max(0.5, duration - 0.8));
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(hp).connect(g).connect(this.master!);
    src.start(t, Math.random());
    src.stop(t + duration + 0.1);
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.recordDest = null;
  }
}
