export class StationAudio {
  muted = false;
  private context?: AudioContext;
  start() {
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
    } catch {
      /* Audio is optional. */
    }
  }
  play(discovery = false) {
    const c = this.context;
    if (!c || c.state !== 'running' || this.muted) return;
    for (let i = 0; i < (discovery ? 3 : 2); i++) {
      const o = c.createOscillator(),
        gain = c.createGain(),
        start = c.currentTime + i * 0.08;
      o.type = 'sine';
      o.frequency.value = [440, 554, 660][i];
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.04, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      o.connect(gain);
      gain.connect(c.destination);
      o.start(start);
      o.stop(start + 0.26);
      o.onended = () => {
        o.disconnect();
        gain.disconnect();
      };
    }
  }
}
