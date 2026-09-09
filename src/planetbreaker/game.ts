import { KEYS, OFFLINE_CAP, PLANET, WEAPONS, type WeaponKey } from './config';
export type Point = [number, number, number];
export type Attack = { weapon: WeaponKey; point: Point; manual: boolean; power: number };
export type Save = {
  version: 1;
  planet: string;
  seed: number;
  random: number;
  credits: number;
  earned: number;
  damage: number;
  elapsed: number;
  shots: number;
  manualShots: number;
  counts: Record<WeaponKey, number>;
  upgrades: Record<WeaponKey, number>;
  timers: Record<WeaponKey, number>;
  scars: Point[];
  surfaceDamage: number[];
  savedAt: number;
  completedAt: number | null;
};
const record = (laser = 0): Record<WeaponKey, number> => ({
  laser,
  missile: 0,
  plasma: 0,
  siege: 0,
});
export class PlanetGame {
  state: Save;
  events: Attack[] = [];
  private manualCooldown = 0;
  constructor(seed = PLANET.seed) {
    this.state = {
      version: 1,
      planet: PLANET.id,
      seed,
      random: seed,
      credits: 0,
      earned: 0,
      damage: 0,
      elapsed: 0,
      shots: 0,
      manualShots: 0,
      counts: record(1),
      upgrades: record(),
      timers: record(),
      scars: [],
      surfaceDamage: Array(2048).fill(0),
      savedAt: Date.now(),
      completedAt: null,
    };
  }
  get complete() {
    return this.state.damage >= PLANET.integrity;
  }
  get fraction() {
    return this.state.damage / PLANET.integrity;
  }
  power(key: WeaponKey) {
    return WEAPONS[key].damage * 2 ** this.state.upgrades[key];
  }
  rate(key: WeaponKey) {
    return (this.state.counts[key] * this.power(key)) / WEAPONS[key].period;
  }
  get income() {
    return KEYS.reduce((n, k) => n + this.rate(k), 0);
  }
  cost(key: WeaponKey) {
    return Math.ceil(WEAPONS[key].cost * 1.19 ** this.state.counts[key]);
  }
  upgradeCost(key: WeaponKey) {
    return Math.ceil(WEAPONS[key].cost * 8 * 5 ** this.state.upgrades[key]);
  }
  unlocked(key: WeaponKey) {
    return this.state.earned >= WEAPONS[key].unlock;
  }
  buy(key: WeaponKey) {
    const cost = this.cost(key);
    if (
      this.complete ||
      !this.unlocked(key) ||
      this.state.credits < cost ||
      this.state.counts[key] >= 100
    )
      return false;
    this.state.credits -= cost;
    this.state.counts[key]++;
    return true;
  }
  upgrade(key: WeaponKey) {
    const cost = this.upgradeCost(key);
    if (
      this.complete ||
      !this.state.counts[key] ||
      this.state.upgrades[key] >= 3 ||
      this.state.credits < cost
    )
      return false;
    this.state.credits -= cost;
    this.state.upgrades[key]++;
    return true;
  }
  private random() {
    let x = this.state.random | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state.random = x >>> 0;
    return this.state.random / 4294967296;
  }
  private target(): Point {
    const z = this.random() * 2 - 1,
      a = this.random() * Math.PI * 2,
      r = Math.sqrt(1 - z * z);
    return [r * Math.cos(a), z, r * Math.sin(a)];
  }
  private hit(key: WeaponKey, power: number, manual: boolean, point = this.target()) {
    if (this.complete) return;
    const actual = Math.min(power, PLANET.integrity - this.state.damage);
    this.state.damage += actual;
    this.state.credits += actual;
    this.state.earned += actual;
    this.state.shots++;
    if (manual) this.state.manualShots++;
    // Keep a bounded recent scar history; large-scale missing crust follows total damage.
    if (this.state.scars.length >= 96) this.state.scars.shift();
    this.state.scars.push([...point]);
    const u = (Math.atan2(point[2], -point[0]) / (Math.PI * 2) + 1) % 1;
    const v = Math.acos(Math.max(-1, Math.min(1, point[1]))) / Math.PI;
    const cell = Math.min(31, Math.floor(v * 32)) * 64 + Math.floor(u * 64);
    this.state.surfaceDamage[cell] = Math.min(255, this.state.surfaceDamage[cell] + 1);
    if (this.events.length < 48) this.events.push({ weapon: key, point, manual, power });
    if (this.complete) this.state.completedAt = this.state.elapsed;
  }
  fire(point?: Point) {
    if (this.complete || this.manualCooldown > 0) return false;
    this.manualCooldown = 0.2;
    // Two clicks/second add about 20% output; clicking is always optional.
    this.hit('laser', Math.max(1, this.income * 0.1), true, point);
    return true;
  }
  tick(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0 || this.complete) return;
    this.manualCooldown = Math.max(0, this.manualCooldown - seconds);
    // Small deterministic steps keep upgrade-independent weapon clocks reproducible.
    let remaining = Math.min(seconds, 60);
    while (remaining > 1e-8 && !this.complete) {
      const dt = Math.min(0.1, remaining);
      remaining -= dt;
      this.state.elapsed += dt;
      for (const k of KEYS) {
        if (!this.state.counts[k]) continue;
        this.state.timers[k] += dt;
        if (this.state.timers[k] + 1e-8 >= WEAPONS[k].period) {
          this.state.timers[k] = Math.max(0, this.state.timers[k] - WEAPONS[k].period);
          this.hit(k, this.power(k) * this.state.counts[k], false);
        }
      }
    }
  }
  offline(seconds: number) {
    if (!Number.isFinite(seconds) || this.complete) return 0;
    const amount = Math.max(0, Math.min(OFFLINE_CAP, seconds)) * this.income;
    this.state.credits += amount;
    this.state.earned += amount;
    return amount;
  }
  save(now = Date.now()): Save {
    return { ...structuredClone(this.state), savedAt: now };
  }
  static restore(raw: unknown): PlanetGame {
    if (!raw || typeof raw !== 'object') throw Error('Invalid save');
    const s = raw as Save;
    const finite = (n: unknown, max = 1e15) =>
      typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
    if (
      s.version !== 1 ||
      s.planet !== PLANET.id ||
      !finite(s.seed, 0xffffffff) ||
      !Number.isInteger(s.seed) ||
      !s.seed ||
      !finite(s.random, 0xffffffff) ||
      !Number.isInteger(s.random) ||
      !s.random ||
      !finite(s.damage, PLANET.integrity) ||
      !finite(s.credits) ||
      !finite(s.earned) ||
      s.credits > s.earned ||
      !finite(s.elapsed) ||
      !finite(s.savedAt) ||
      !finite(s.shots) ||
      !finite(s.manualShots) ||
      s.manualShots > s.shots ||
      !Number.isInteger(s.shots) ||
      !Number.isInteger(s.manualShots)
    )
      throw Error('Invalid save');
    for (const k of KEYS) {
      if (
        !finite(s.counts?.[k], 100) ||
        !Number.isInteger(s.counts[k]) ||
        !finite(s.upgrades?.[k], 3) ||
        !Number.isInteger(s.upgrades[k]) ||
        !finite(s.timers?.[k], WEAPONS[k].period) ||
        (s.upgrades[k] > 0 && !s.counts[k])
      )
        throw Error('Invalid fleet');
    }
    if (
      !s.counts.laser ||
      !Array.isArray(s.scars) ||
      s.scars.length > 96 ||
      s.scars.some(
        (p) =>
          !Array.isArray(p) ||
          p.length !== 3 ||
          p.some((v) => typeof v !== 'number' || !Number.isFinite(v)) ||
          Math.abs(Math.hypot(...p) - 1) > 0.01,
      )
    )
      throw Error('Invalid surface');
    if (
      (s.completedAt !== null && !finite(s.completedAt, s.elapsed)) ||
      (s.damage === PLANET.integrity) !== (s.completedAt !== null)
    )
      throw Error('Invalid completion');
    if (
      s.surfaceDamage !== undefined &&
      (!Array.isArray(s.surfaceDamage) ||
        s.surfaceDamage.length !== 2048 ||
        s.surfaceDamage.some((n) => !finite(n, 255) || !Number.isInteger(n)))
    )
      throw Error('Invalid damage map');
    const game = new PlanetGame(s.seed);
    game.state = {
      ...structuredClone(s),
      surfaceDamage: s.surfaceDamage ? [...s.surfaceDamage] : Array(2048).fill(0),
    };
    return game;
  }
}
