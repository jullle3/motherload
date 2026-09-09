import {
  KEYS,
  OFFLINE_CAP,
  PLANET,
  WEAPONS,
  BOOST_KEYS,
  layerProgress,
  type BoostKey,
  type WeaponKey,
} from './config';
import {
  aimFor,
  autoSource,
  muzzle,
  toWorld,
  trace,
  type Point,
  type Trajectory,
} from './targeting';
export type { Point } from './targeting';
export type Attack = Trajectory & {
  weapon: WeaponKey;
  manual: boolean;
  auto: boolean;
  power: number;
  emitter: number;
  launchedAt: number;
};
export type Reward = {
  random: number;
  bag: BoostKey[];
  next: number;
  available: BoostKey | null;
  flyRemaining: number;
  active: BoostKey | null;
  remaining: number;
  autoTimer: number;
  collected: number;
};
export type Save = {
  version: 2;
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
  motionTime: number;
  autoShots: number;
  reward: Reward;
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
  reducedMotion = false;
  camera: Point = [0, 0.15, 8.3];
  private manualCooldown = 0;
  constructor(seed = PLANET.seed) {
    this.state = {
      version: 2,
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
      motionTime: 0,
      autoShots: 0,
      reward: {
        random: (seed ^ 0x5f3759df) >>> 0 || 1,
        bag: [],
        next: 45,
        available: null,
        flyRemaining: 0,
        active: null,
        remaining: 0,
        autoTimer: 0,
        collected: 0,
      },
    };
  }
  get complete() {
    return this.state.damage >= PLANET.integrity;
  }
  get fraction() {
    return layerProgress(this.state.damage).fraction;
  }
  power(key: WeaponKey) {
    return WEAPONS[key].damage * 2 ** this.state.upgrades[key];
  }
  rate(key: WeaponKey) {
    return (this.state.counts[key] * this.power(key)) / WEAPONS[key].period;
  }
  get baseIncome() {
    return KEYS.reduce((n, k) => n + this.rate(k), 0);
  }
  get angle() {
    return this.state.motionTime * 0.035;
  }
  get fireMultiplier() {
    return this.state.reward.active === 'overdrive' ? 2 : 1;
  }
  get damageRate() {
    return (
      this.baseIncome * this.fireMultiplier +
      (this.state.reward.active === 'autofire' ? this.manualPower * 10 : 0)
    );
  }
  get income() {
    return this.state.reward.active === 'overdrive'
      ? this.baseIncome * 4
      : this.state.reward.active === 'surge'
        ? this.baseIncome * 3
        : this.damageRate;
  }
  get manualPower() {
    return Math.max(1, this.baseIncome * 0.1);
  }
  recommendation() {
    if (this.complete) return null;
    return (
      KEYS.flatMap((key) => [
        {
          key,
          upgrade: false,
          cost: this.cost(key),
          gain: this.power(key) / WEAPONS[key].period,
          ok: this.unlocked(key) && this.state.counts[key] < 100,
        },
        {
          key,
          upgrade: true,
          cost: this.upgradeCost(key),
          gain: this.rate(key),
          ok: this.state.counts[key] > 0 && this.state.upgrades[key] < 3,
        },
      ])
        .filter((p) => p.ok && p.cost <= this.state.credits)
        .sort((a, b) => a.cost / a.gain - b.cost / b.gain)[0] ?? null
    );
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
  private hit(
    key: WeaponKey,
    power: number,
    manual: boolean,
    auto = false,
    emitter = 0,
    supplied?: { source: Point; aim: Point },
  ) {
    if (this.complete) return false;
    const source =
      supplied?.source ??
      (manual
        ? this.camera
        : auto
          ? autoSource(this.state.motionTime)
          : muzzle(key, emitter, this.state.motionTime));
    const aim = supplied?.aim ?? aimFor(source, this.random(), this.random());
    const flight = key === 'missile' ? 1.1 : key === 'siege' ? 0.65 : 0.32;
    const path = trace(
      source,
      aim,
      this.fraction,
      this.angle,
      this.reducedMotion ? 0 : 0.035,
      flight,
      key === 'missile',
    );
    if (!path) return false;
    const point = path.point;
    const actual = Math.min(power, PLANET.integrity - this.state.damage);
    this.state.damage += actual;
    const multiplier =
      this.state.reward.active === 'surge'
        ? 3
        : !manual && !auto && this.state.reward.active === 'overdrive'
          ? 2
          : 1;
    this.state.credits += actual * multiplier;
    this.state.earned += actual * multiplier;
    this.state.shots++;
    if (manual) this.state.manualShots++;
    if (auto) this.state.autoShots++;
    // Keep a bounded recent scar history; large-scale missing crust follows total damage.
    if (this.state.scars.length >= 96) this.state.scars.shift();
    this.state.scars.push([...point]);
    const u = (Math.atan2(point[2], -point[0]) / (Math.PI * 2) + 1) % 1;
    const v = Math.acos(Math.max(-1, Math.min(1, point[1]))) / Math.PI;
    const cell = Math.min(31, Math.floor(v * 32)) * 64 + Math.floor(u * 64);
    this.state.surfaceDamage[cell] = Math.min(255, this.state.surfaceDamage[cell] + 1);
    if (this.events.length < 48)
      this.events.push({
        ...path,
        weapon: key,
        manual,
        auto,
        power,
        emitter,
        launchedAt: this.state.elapsed,
      });
    if (this.complete) {
      this.state.completedAt = this.state.elapsed;
      this.state.reward.active = null;
      this.state.reward.available = null;
      this.state.reward.remaining = 0;
      this.state.reward.flyRemaining = 0;
    }
    return true;
  }
  fire(point?: Point) {
    const supplied = point
      ? { source: this.camera, aim: toWorld(point.map((n) => n * 1.799) as Point, this.angle) }
      : undefined;
    return this.manualFire(supplied);
  }
  fireRay(source: Point, aim: Point) {
    return this.manualFire({ source, aim });
  }
  private manualFire(supplied?: { source: Point; aim: Point }) {
    if (this.complete || this.manualCooldown > 0) return false;
    if (!this.hit('laser', this.manualPower, true, false, 0, supplied)) return false;
    this.manualCooldown = 0.2;
    return true;
  }
  private rewardRandom() {
    let x = this.state.reward.random;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state.reward.random = x >>> 0;
    return this.state.reward.random / 4294967296;
  }
  private scheduleReward() {
    this.state.reward.next = 75 + 30 * this.rewardRandom();
  }
  collectReward() {
    const r = this.state.reward;
    if (this.complete || !r.available || r.active) return null;
    r.active = r.available;
    r.available = null;
    r.flyRemaining = 0;
    r.remaining = 30;
    r.autoTimer = 0;
    r.collected++;
    return r.active;
  }
  private rewardTick(dt: number) {
    const r = this.state.reward;
    if (r.active) {
      r.remaining = r.remaining - dt < 1e-8 ? 0 : r.remaining - dt;
      if (r.active === 'autofire') {
        r.autoTimer += dt;
        while (r.autoTimer >= 0.2 - 1e-8 && !this.complete) {
          r.autoTimer = Math.max(0, r.autoTimer - 0.2);
          this.hit('laser', this.manualPower * 2, false, true);
        }
      }
      if (!r.remaining) {
        r.active = null;
        r.autoTimer = 0;
        this.scheduleReward();
      }
    } else if (r.available) {
      r.flyRemaining = r.flyRemaining - dt < 1e-8 ? 0 : r.flyRemaining - dt;
      if (!r.flyRemaining) {
        r.available = null;
        this.scheduleReward();
      }
    } else {
      r.next = r.next - dt < 1e-8 ? 0 : r.next - dt;
      if (!r.next) {
        if (!r.bag.length) {
          r.bag = [...BOOST_KEYS];
          for (let i = r.bag.length - 1; i > 0; i--) {
            const j = Math.floor(this.rewardRandom() * (i + 1));
            [r.bag[i], r.bag[j]] = [r.bag[j], r.bag[i]];
          }
        }
        r.available = r.bag.pop()!;
        r.flyRemaining = 14;
      }
    }
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
      if (!this.reducedMotion) this.state.motionTime += dt;
      for (const k of KEYS) {
        if (!this.state.counts[k]) continue;
        this.state.timers[k] += dt * this.fireMultiplier;
        if (this.state.timers[k] + 1e-8 >= WEAPONS[k].period) {
          this.state.timers[k] = Math.max(0, this.state.timers[k] - WEAPONS[k].period);
          const salvo = Math.min(3, this.state.counts[k]);
          for (let i = 0; i < salvo; i++)
            this.hit(k, (this.power(k) * this.state.counts[k]) / salvo, false, false, i);
        }
      }
      if (!this.complete) this.rewardTick(dt);
    }
  }
  offline(seconds: number) {
    if (!Number.isFinite(seconds) || this.complete) return 0;
    const amount = Math.max(0, Math.min(OFFLINE_CAP, seconds)) * this.baseIncome;
    this.state.credits += amount;
    this.state.earned += amount;
    return amount;
  }
  save(now = Date.now()): Save {
    return { ...structuredClone(this.state), savedAt: now };
  }
  static restore(raw: unknown): PlanetGame {
    if (!raw || typeof raw !== 'object') throw Error('Invalid save');
    const s = raw as Save & { version: number };
    const legacy = (raw as { version: number }).version === 1;
    const finite = (n: unknown, max = 1e15) =>
      typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
    if (
      (!legacy && s.version !== 2) ||
      s.planet !== PLANET.id ||
      !finite(s.seed, 0xffffffff) ||
      !Number.isInteger(s.seed) ||
      !s.seed ||
      !finite(s.random, 0xffffffff) ||
      !Number.isInteger(s.random) ||
      !s.random ||
      !finite(s.damage, legacy ? 80_000_000 : PLANET.integrity) ||
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
      (s.damage === (legacy ? 80_000_000 : PLANET.integrity)) !== (s.completedAt !== null)
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
    if (!legacy) {
      const r = s.reward;
      if (
        !finite(s.motionTime, s.elapsed + 0.01) ||
        !finite(s.autoShots, s.shots) ||
        !Number.isInteger(s.autoShots) ||
        s.autoShots + s.manualShots > s.shots ||
        !r ||
        !finite(r.random, 0xffffffff) ||
        !Number.isInteger(r.random) ||
        !r.random ||
        !Array.isArray(r.bag) ||
        r.bag.length > 3 ||
        new Set(r.bag).size !== r.bag.length ||
        r.bag.some((k) => !BOOST_KEYS.includes(k)) ||
        !finite(r.next, 105) ||
        !finite(r.flyRemaining, 14) ||
        !finite(r.remaining, 30) ||
        !finite(r.autoTimer, 0.2) ||
        !finite(r.collected) ||
        !Number.isInteger(r.collected) ||
        (r.available !== null && !BOOST_KEYS.includes(r.available)) ||
        (r.active !== null && !BOOST_KEYS.includes(r.active)) ||
        (r.active !== null && r.available !== null) ||
        !!r.active !== r.remaining > 0 ||
        !!r.available !== r.flyRemaining > 0
      )
        throw Error('Invalid reward state');
    }
    game.state = {
      ...game.state,
      ...structuredClone(s),
      version: 2,
      damage: Math.min(PLANET.integrity, s.damage),
      completedAt: s.damage >= PLANET.integrity ? (s.completedAt ?? s.elapsed) : s.completedAt,
      motionTime: legacy ? s.elapsed : s.motionTime,
      autoShots: legacy ? 0 : s.autoShots,
      reward: legacy ? game.state.reward : structuredClone(s.reward),
      surfaceDamage: s.surfaceDamage ? [...s.surfaceDamage] : Array(2048).fill(0),
    };
    if (game.complete) {
      game.state.reward.active = null;
      game.state.reward.available = null;
      game.state.reward.remaining = 0;
      game.state.reward.flyRemaining = 0;
    }
    return game;
  }
}
