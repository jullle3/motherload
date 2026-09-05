export class AudioSystem {
  context?: AudioContext;
  muted = false;
  engine?: OscillatorNode;
  gain?: GainNode;
  lastWarning = 0;
  start() {
    if (!this.context) {
      this.context = new AudioContext();
      this.engine = this.context.createOscillator();
      this.gain = this.context.createGain();
      this.engine.type = 'sawtooth';
      this.engine.frequency.value = 48;
      this.gain.gain.value = 0;
      this.engine.connect(this.gain).connect(this.context.destination);
      this.engine.start();
    }
    void this.context.resume();
  }
  tone(freq: number, duration = 0.12) {
    if (!this.context || this.muted) return;
    const osc = this.context.createOscillator(),
      gain = this.context.createGain(),
      t = this.context.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.65, t + duration);
    gain.gain.setValueAtTime(0.045, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(this.context.destination);
    osc.start();
    osc.stop(t + duration);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  update(active: boolean, drilling: boolean, low: boolean, turbo = false) {
    if (!this.context || !this.gain || !this.engine) return;
    this.gain.gain.setTargetAtTime(
      active && !this.muted ? (turbo ? 0.024 : 0.016) : 0,
      this.context.currentTime,
      0.08,
    );
    this.engine.frequency.setTargetAtTime(
      turbo ? 135 : drilling ? 85 : 48,
      this.context.currentTime,
      0.05,
    );
    if (low && active && Date.now() - this.lastWarning > 5000) {
      this.tone(480, 0.25);
      this.lastWarning = Date.now();
    }
  }
}
