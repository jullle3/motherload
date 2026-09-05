export const WIDTH = 48,
  HEIGHT = 160,
  RELIC = 153 * WIDTH + 24;
export const ORES = [
  { name: 'Copper', value: 24, color: '#df9772' },
  { name: 'Cobalt', value: 65, color: '#68bfd8' },
  { name: 'Iridium', value: 150, color: '#b7a0ee' },
];
export type Upgrade = 'drill' | 'fuel' | 'cargo' | 'hull';
export const UPGRADES: Record<
  Upgrade,
  { name: string; description: string; costs: number[]; values: number[] }
> = {
  drill: {
    name: 'Drill assembly',
    description: 'Cut faster. Reach harder geology.',
    costs: [480, 2400, 6000],
    values: [1, 1.55, 2.2, 3.1],
  },
  fuel: {
    name: 'Fuel reservoir',
    description: 'More time down. More time to return.',
    costs: [180, 650, 1600],
    values: [100, 160, 250, 380],
  },
  cargo: {
    name: 'Cargo hold',
    description: 'Make every expedition worth more.',
    costs: [160, 550, 1400],
    values: [12, 22, 36, 56],
  },
  hull: {
    name: 'Hull plating',
    description: 'Protection from impact and heat.',
    costs: [140, 500, 1200],
    values: [100, 150, 225, 320],
  },
};
export interface Tile {
  ore: number;
  hardness: number;
  heat: boolean;
}
export interface Input {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}
export const NO_INPUT: Input = { left: false, right: false, up: false, down: false };
export interface Rig {
  x: number;
  y: number;
  vy: number;
  fuel: number;
  hull: number;
  cargo: number[];
  relic: boolean;
}
export interface SaveData {
  version: 1;
  seed: number;
  dug: number[];
  rig: Rig;
  money: number;
  upgrades: Record<Upgrade, number>;
  won: boolean;
  maxDepth: number;
  seconds: number;
}
export type GameEvent = {
  type: 'dig' | 'ore' | 'rescue' | 'relic' | 'win' | 'transaction';
  x?: number;
  y?: number;
  message?: string;
};
function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function generate(seed: number): Tile[] {
  const rng = random(seed);
  return Array.from({ length: WIDTH * HEIGHT }, (_, i) => {
    const y = Math.floor(i / WIDTH),
      x = i % WIDTH,
      zone = y < 45 ? 0 : y < 100 ? 1 : 2;
    return {
      ore: (y < 12 && x >= 17 && x <= 30 && (x + y) % 3 === 0) || rng() < 0.19 ? zone : -1,
      hardness: i === RELIC ? 3 : zone,
      heat: y > 105 && rng() < 0.075 && x !== 24,
    };
  });
}
export class Game {
  tiles: Tile[];
  dug = new Set<number>();
  rig: Rig;
  upgrades: Record<Upgrade, number> = { drill: 0, fuel: 0, cargo: 0, hull: 0 };
  money = 0;
  won = false;
  maxDepth = 0;
  seconds = 0;
  target = -1;
  progress = 0;
  warning = '';
  events: GameEvent[] = [];
  revision = 0;
  thrust = false;
  facing = 0;
  constructor(public seed = Math.floor(Math.random() * 2147483647)) {
    this.tiles = generate(seed);
    this.rig = { x: 24.5, y: -0.5, vy: 0, fuel: 100, hull: 100, cargo: [0, 0, 0], relic: false };
  }
  cap(key: Upgrade) {
    return UPGRADES[key].values[this.upgrades[key]];
  }
  get cargoCount() {
    return this.rig.cargo.reduce((a, b) => a + b, 0);
  }
  get cargoValue() {
    return this.rig.cargo.reduce((a, b, i) => a + b * ORES[i].value, 0);
  }
  get atSurface() {
    return this.rig.y < 0 && Math.abs(this.rig.vy) < 0.1;
  }
  solid(x: number, y: number) {
    if (x < 0 || x >= WIDTH || y >= HEIGHT) return true;
    if (y < 0) return false;
    return !this.dug.has(Math.floor(y) * WIDTH + Math.floor(x));
  }
  blocked(x: number, y: number) {
    return [
      [-0.3, -0.3],
      [0.3, -0.3],
      [-0.3, 0.3],
      [0.3, 0.3],
    ].some(([dx, dy]) => this.solid(x + dx, y + dy));
  }
  step(dt: number, input: Input) {
    this.seconds += dt;
    this.warning = '';
    const r = this.rig;
    this.thrust = input.up;
    const dx = Number(input.right) - Number(input.left);
    if (dx) this.facing = dx;
    if (r.fuel <= 0 || r.hull <= 0) {
      this.rescue();
      return;
    }
    if (dx || input.up || input.down) r.fuel = Math.max(0, r.fuel - dt * (input.up ? 0.85 : 0.5));
    let target = -1;
    if (!input.up) {
      const tx = Math.floor(r.x + (dx ? dx * 0.66 : 0)),
        ty = Math.floor(r.y + (!dx && input.down ? 0.66 : 0));
      if (
        (dx || input.down) &&
        tx >= 0 &&
        tx < WIDTH &&
        ty >= 0 &&
        ty < HEIGHT &&
        this.solid(tx, ty)
      )
        target = ty * WIDTH + tx;
    }
    if (target !== this.target) {
      this.target = target;
      this.progress = 0;
    }
    if (target >= 0) {
      const tile = this.tiles[target];
      if (target < WIDTH && target % WIDTH >= 17 && target % WIDTH <= 21)
        this.warning = 'Station foundation — start your shaft beside the landing pad';
      else if (this.upgrades.drill < tile.hardness)
        this.warning = `Drill tier ${tile.hardness + 1} required — upgrade at the surface`;
      else if (tile.ore >= 0 && this.cargoCount >= this.cap('cargo') && target !== RELIC)
        this.warning = 'Cargo full — return to the surface to sell';
      else {
        this.progress += (dt * this.cap('drill')) / (0.45 + tile.hardness * 0.35);
        r.fuel = Math.max(0, r.fuel - dt * 0.4);
        if (tile.heat) r.hull -= dt * 12;
        if (this.progress >= 1) {
          this.dug.add(target);
          this.revision++;
          this.events.push({
            type: 'dig',
            x: (target % WIDTH) + 0.5,
            y: Math.floor(target / WIDTH) + 0.5,
          });
          if (target === RELIC && !this.won) {
            r.relic = true;
            this.events.push({ type: 'relic', message: 'Alien relic secured. Bring it home.' });
          } else if (tile.ore >= 0) {
            r.cargo[tile.ore]++;
            this.events.push({ type: 'ore' });
          }
          this.progress = 0;
          this.target = -1;
        }
      }
    }
    const nx = r.x + dx * dt * 3.3;
    if (!this.blocked(nx, r.y)) r.x = nx;
    r.vy = input.up ? Math.max(-4.5, r.vy - dt * 19) : Math.min(9, r.vy + dt * 12);
    const ny = Math.max(-3.8, r.y + r.vy * dt);
    if (!this.blocked(r.x, ny)) r.y = ny;
    else {
      if (r.vy > 6) r.hull -= Math.pow(r.vy - 5, 2) * 2.5;
      r.vy = 0;
    }
    this.maxDepth = Math.max(this.maxDepth, Math.max(0, Math.floor(r.y) * 10));
    if (r.fuel <= 0 || r.hull <= 0) {
      this.rescue();
      return;
    }
    if (this.atSurface && r.relic && !this.won) {
      this.won = true;
      r.relic = false;
      this.events.push({
        type: 'win',
        message: 'Recovery complete. The frontier is yours to explore.',
      });
    }
    if (r.fuel < this.cap('fuel') * 0.22 && !this.warning)
      this.warning = 'Low fuel — return to the surface';
  }
  rescue() {
    this.rig.cargo = [0, 0, 0];
    if (this.rig.relic) {
      this.dug.delete(RELIC);
      this.revision++;
    }
    Object.assign(this.rig, {
      x: 20.5,
      y: -0.5,
      vy: 0,
      fuel: this.cap('fuel'),
      hull: this.cap('hull'),
      relic: false,
    });
    this.target = -1;
    this.progress = 0;
    this.events.push({
      type: 'rescue',
      message: 'Rig recovered. Cargo lost; your upgrades and credits are safe.',
    });
  }
  service() {
    if (!this.atSurface) return false;
    this.rig.fuel = this.cap('fuel');
    this.rig.hull = this.cap('hull');
    this.events.push({ type: 'transaction' });
    return true;
  }
  sell() {
    if (!this.atSurface) return 0;
    const value = this.cargoValue;
    this.money += value;
    this.rig.cargo = [0, 0, 0];
    this.events.push({ type: 'transaction' });
    return value;
  }
  buy(key: Upgrade) {
    const level = this.upgrades[key],
      cost = UPGRADES[key].costs[level];
    if (!this.atSurface || cost === undefined || this.money < cost) return false;
    this.money -= cost;
    this.upgrades[key]++;
    this.events.push({ type: 'transaction' });
    return true;
  }
  save(): SaveData {
    return {
      version: 1,
      seed: this.seed,
      dug: [...this.dug],
      rig: structuredClone(this.rig),
      money: this.money,
      upgrades: { ...this.upgrades },
      won: this.won,
      maxDepth: this.maxDepth,
      seconds: this.seconds,
    };
  }
  static load(raw: unknown): Game {
    const s = raw as SaveData;
    const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
    if (
      !s ||
      s.version !== 1 ||
      !Number.isInteger(s.seed) ||
      !Array.isArray(s.dug) ||
      s.dug.some((i) => !Number.isInteger(i) || i < 0 || i >= WIDTH * HEIGHT) ||
      !s.rig ||
      !s.upgrades ||
      !finite(s.money) ||
      s.money < 0 ||
      !finite(s.seconds) ||
      s.seconds < 0 ||
      !finite(s.maxDepth) ||
      s.maxDepth < 0 ||
      typeof s.won !== 'boolean'
    )
      throw new Error('Invalid save');
    for (const key of Object.keys(UPGRADES) as Upgrade[])
      if (!Number.isInteger(s.upgrades[key]) || s.upgrades[key] < 0 || s.upgrades[key] > 3)
        throw new Error('Invalid upgrades');
    const r = s.rig;
    if (
      ![r.x, r.y, r.vy, r.fuel, r.hull].every(finite) ||
      r.x < 0.3 ||
      r.x > WIDTH - 0.3 ||
      r.y < -4 ||
      r.y > HEIGHT - 0.3 ||
      r.fuel < 0 ||
      r.hull < 0 ||
      typeof r.relic !== 'boolean' ||
      !Array.isArray(r.cargo) ||
      r.cargo.length !== 3 ||
      r.cargo.some((n) => !Number.isInteger(n) || n < 0)
    )
      throw new Error('Invalid rig');
    const g = new Game(s.seed);
    Object.assign(g, {
      dug: new Set(s.dug),
      rig: structuredClone(r),
      money: s.money,
      upgrades: { ...s.upgrades },
      won: s.won,
      maxDepth: s.maxDepth,
      seconds: s.seconds,
    });
    if (
      g.cargoCount > g.cap('cargo') ||
      r.fuel > g.cap('fuel') ||
      r.hull > g.cap('hull') ||
      g.blocked(r.x, r.y) ||
      (r.relic && !g.dug.has(RELIC))
    )
      throw new Error('Invalid position or inventory');
    return g;
  }
}
