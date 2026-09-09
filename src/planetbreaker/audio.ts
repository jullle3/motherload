import type { BoostKey, WeaponKey } from './config';

export class PlanetAudio {
  private context?: BaseAudioContext;
  private live?: AudioContext;
  private master?: GainNode;
  private bus?: DynamicsCompressorNode;
  private noise?: AudioBuffer;
  private voiceEnds: number[] = [];
  private last = new Map<string, number>();
  private _muted = false;
  private _volume = 0.5;
  constructor(context?: BaseAudioContext) {
    if (context) this.initialize(context);
  }
  get muted() {
    return this._muted;
  }
  set muted(value: boolean) {
    this._muted = value;
    this.level();
  }
  get volume() {
    return this._volume;
  }
  set volume(value: number) {
    this._volume = Math.max(0, Math.min(1, value));
    this.level();
  }
  private level() {
    if (this.context && this.master)
      this.master.gain.setTargetAtTime(
        this._muted ? 0 : this._volume,
        this.context.currentTime,
        0.03,
      );
  }
  private initialize(c: BaseAudioContext) {
    this.context = c;
    this.master = c.createGain();
    this.bus = c.createDynamicsCompressor();
    this.bus.threshold.value = -18;
    this.bus.knee.value = 14;
    this.bus.ratio.value = 8;
    this.bus.attack.value = 0.003;
    this.bus.release.value = 0.18;
    this.bus.connect(this.master);
    this.master.connect(c.destination);
    this.master.gain.value = this._muted ? 0 : this._volume;
    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const samples = this.noise.getChannelData(0);
    let seed = 7213;
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      samples[i] = (seed / 4294967296) * 2 - 1;
    }
  }
  unlock() {
    try {
      if (!this.context) {
        this.live = new AudioContext();
        this.initialize(this.live);
      }
      void this.live?.resume();
    } catch {
      /* Sound is optional. */
    }
  }
  suspend() {
    void this.live?.suspend().catch(() => {});
  }
  resume() {
    if (!this._muted) void this.live?.resume().catch(() => {});
  }
  private voice(
    kind: 'sine' | 'triangle' | 'noise',
    frequency: number,
    endFrequency: number,
    duration: number,
    amplitude: number,
    pan: number,
    at: number,
    attack = 0.025,
  ) {
    const c = this.context;
    this.voiceEnds = this.voiceEnds.filter((end) => end > at);
    if (!c || !this.bus || this.voiceEnds.length >= 24) return;
    const end = at + duration + 0.01;
    this.voiceEnds.push(end);
    const source = kind === 'noise' ? c.createBufferSource() : c.createOscillator();
    const filter = c.createBiquadFilter(),
      gain = c.createGain(),
      stereo = c.createStereoPanner();
    if (kind === 'noise') {
      (source as AudioBufferSourceNode).buffer = this.noise!;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(frequency, at);
      filter.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
    } else {
      const o = source as OscillatorNode;
      o.type = kind;
      o.frequency.setValueAtTime(frequency, at);
      o.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
      filter.type = 'lowpass';
      filter.frequency.value = 2200;
    }
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(amplitude, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    stereo.pan.value = Math.max(-0.75, Math.min(0.75, pan));
    source.connect(filter);
    filter.connect(gain);
    gain.connect(stereo);
    stereo.connect(this.bus);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      stereo.disconnect();
      const i = this.voiceEnds.indexOf(end);
      if (i >= 0) this.voiceEnds.splice(i, 1);
    };
    source.start(at);
    source.stop(at + duration + 0.01);
  }
  play(key: WeaponKey, pan = 0, at = this.context?.currentTime ?? 0) {
    if (
      !this.context ||
      this._muted ||
      (this.live && this.live.state !== 'running') ||
      at - (this.last.get(key) ?? -Infinity) < 0.12
    )
      return;
    this.last.set(key, at);
    const variation = 1 + Math.sin(at * 7.7) * 0.025;
    if (key === 'laser') {
      this.voice('sine', 670 * variation, 490, 0.18, 0.045, pan, at, 0.012);
      this.voice('noise', 1700, 700, 0.2, 0.018, pan, at);
    }
    if (key === 'missile') {
      this.voice('noise', 1400, 170, 0.46, 0.1, pan, at, 0.055);
      this.voice('sine', 110, 58, 0.38, 0.055, pan, at, 0.03);
    }
    if (key === 'plasma') {
      this.voice('sine', 190 * variation, 135, 0.6, 0.065, pan, at, 0.07);
      this.voice('sine', 285 * variation, 202, 0.5, 0.025, pan, at, 0.06);
      this.voice('noise', 900, 250, 0.5, 0.035, pan, at);
    }
    if (key === 'siege') {
      this.voice('sine', 78 * variation, 40, 0.8, 0.12, pan, at, 0.035);
      this.voice('noise', 550, 90, 0.7, 0.11, pan, at, 0.025);
    }
  }
  cue(kind: BoostKey | 'purchase' | 'upgrade', at = this.context?.currentTime ?? 0) {
    if (!this.context || this._muted) return;
    const notes =
      kind === 'purchase'
        ? [440, 554]
        : kind === 'upgrade'
          ? [440, 554, 660]
          : kind === 'surge'
            ? [523, 659, 784]
            : kind === 'autofire'
              ? [392, 523, 659]
              : [349, 440, 523];
    notes.forEach((f, i) => {
      this.voice('sine', f, f, 0.45, 0.045, 0, at + i * 0.085);
      this.voice('sine', f, f, 0.35, 0.012, 0.3, at + i * 0.085 + 0.16);
    });
    if (kind === 'overdrive') this.voice('noise', 300, 1700, 0.8, 0.065, 0, at, 0.3);
  }
}
