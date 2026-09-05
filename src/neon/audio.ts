import type { GameEvent } from './game';
export class NeonAudio {
  private context?: AudioContext;
  private voices = 0;
  private lastFire = -Infinity;
  muted = false;
  start() {
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
    } catch {
      /* Sound is optional. */
    }
  }
  play(event: GameEvent) {
    const c = this.context;
    if (!c || c.state !== 'running' || this.muted || this.voices > 12) return;
    if (event.type === 'fire' && c.currentTime - this.lastFire < 0.08) return;
    if (event.type === 'fire') this.lastFire = c.currentTime;
    const oscillator = c.createOscillator(),
      gain = c.createGain();
    const [from, to, duration] = {
      fire: [480, 160, 0.09],
      pop: [650 + (3 - (event.size ?? 0)) * 110, 220, 0.14],
      hit: [140, 45, 0.28],
      pickup: [520, 1040, 0.22],
      clear: [440, 1320, 0.6],
    }[event.type];
    oscillator.type = event.type === 'hit' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(from, c.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(to, c.currentTime + duration);
    gain.gain.setValueAtTime(0.0001, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.065, c.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(c.destination);
    this.voices++;
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      this.voices--;
    };
    oscillator.start();
    oscillator.stop(c.currentTime + duration);
  }
}
