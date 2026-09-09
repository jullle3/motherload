import type { WeaponKey } from './config';
export class PlanetAudio {
  muted = false;
  private context?: AudioContext;
  private last = 0;
  unlock() {
    try {
      this.context ??= new AudioContext();
      void this.context.resume();
    } catch {
      /* Sound is optional. */
    }
  }
  play(key: WeaponKey) {
    const c = this.context;
    if (!c || this.muted || c.state !== 'running' || c.currentTime - this.last < 0.13) return;
    this.last = c.currentTime;
    const o = c.createOscillator(),
      g = c.createGain();
    const frequency = { laser: 520, missile: 140, plasma: 260, siege: 65 }[key];
    o.type = key === 'laser' ? 'sine' : 'triangle';
    o.frequency.setValueAtTime(frequency, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(35, c.currentTime + 0.45);
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.055, c.currentTime + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.51);
  }
}
