export const WIDTH = 48,
  HEIGHT = 160,
  RELIC = 153 * WIDTH + 24;
export interface OreDefinition {
  name: string;
  value: number;
  color: string;
  rare?: boolean;
}
export const ORES: OreDefinition[] = [
  { name: 'Copper', value: 24, color: '#df9772' },
  { name: 'Cobalt', value: 65, color: '#68bfd8' },
  { name: 'Iridium', value: 150, color: '#b7a0ee' },
  { name: 'Diamond', value: 900, color: '#d5f8ff', rare: true },
  { name: 'Ruby', value: 600, color: '#ff587a', rare: true },
  { name: 'Void crystal', value: 1600, color: '#a6ffd5', rare: true },
];
// Probabilities per empty rock block; every type can occur in every biome.
export const RARE_ORES = [
  { ore: 3, surfaceChance: 0.0004, deepestChance: 0.0022 },
  { ore: 4, surfaceChance: 0.0006, deepestChance: 0.003 },
  { ore: 5, surfaceChance: 0.0001, deepestChance: 0.0006 },
];
export function rareOreChance(ore: (typeof RARE_ORES)[number], depth: number) {
  const progress = Math.max(0, Math.min(1, depth / (HEIGHT - 1)));
  return ore.surfaceChance + (ore.deepestChance - ore.surfaceChance) * progress ** 1.6;
}
const emptyCargo = () => ORES.map(() => 0);
export type Upgrade = 'drill' | 'fuel' | 'cargo' | 'hull' | 'turbo';
export const TURBO = { speed: 10, cooldown: 6, fuelPerSecond: 4 };
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
    description: 'Protection from extreme underground heat.',
    costs: [140, 500, 1200],
    values: [100, 150, 225, 320],
  },
  turbo: {
    name: 'Turbo thruster',
    description: 'Burst upward through rock. Hold UP + SPACE.',
    costs: [300, 1000, 2600],
    values: [0, 0.6, 1.2, 2],
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
  turbo: boolean;
}
export const NO_INPUT: Input = { left: false, right: false, up: false, down: false, turbo: false };
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
  blockProgress?: [number, number][];
  rig: Rig;
  money: number;
  upgrades: Record<Exclude<Upgrade, 'turbo'>, number> & { turbo?: number };
  won: boolean;
  maxDepth: number;
  seconds: number;
  discoveredOres?: number[];
  turboCooldown?: number;
}
export type GameEvent = {
  type: 'dig' | 'ore' | 'rescue' | 'relic' | 'win' | 'transaction' | 'turbo';
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
  // Keep rare placement independent so the original geology and ore streams stay unchanged.
  const rareRng = random(seed ^ 0x4d3a91e7);
  return Array.from({ length: WIDTH * HEIGHT }, (_, i) => {
    const y = Math.floor(i / WIDTH),
      x = i % WIDTH,
      zone = y < 45 ? 0 : y < 100 ? 1 : 2;
    const tile = {
      ore: (y < 12 && x >= 17 && x <= 30 && (x + y) % 3 === 0) || rng() < 0.19 ? zone : -1,
      hardness: i === RELIC ? 3 : zone,
      heat: y > 105 && rng() < 0.075 && x !== 24,
    };
    let roll = rareRng();
    if (tile.ore === -1 && i !== RELIC && !(y === 0 && x >= 17 && x <= 21)) {
      for (const rare of RARE_ORES) {
        const chance = rareOreChance(rare, y);
        if (roll < chance) {
          tile.ore = rare.ore;
          break;
        }
        roll -= chance;
      }
    }
    return tile;
  });
}
export class Game {
  tiles: Tile[];
  dug = new Set<number>();
  blockProgress = new Map<number, number>();
  discoveredOres = new Set<number>();
  rig: Rig;
  upgrades: Record<Upgrade, number> = { drill: 0, fuel: 0, cargo: 0, hull: 0, turbo: 0 };
  turboActive = false;
  turboRemaining = 0;
  turboCooldown = 0;
  private turboHeld = false;
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
    this.rig = { x: 24.5, y: -0.5, vy: 0, fuel: 100, hull: 100, cargo: emptyCargo(), relic: false };
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
  private miningWarning(target: number, turbo = false) {
    const tile = this.tiles[target];
    if (target < WIDTH && target % WIDTH >= 17 && target % WIDTH <= 21)
      return 'Station foundation — start your shaft beside the landing pad';
    if ((!turbo || target === RELIC) && this.upgrades.drill < tile.hardness)
      return `Drill tier ${tile.hardness + 1} required — upgrade at the surface`;
    if (tile.ore >= 0 && target !== RELIC && this.cargoCount >= this.cap('cargo'))
      return 'Cargo full — return to the surface to sell';
    return '';
  }
  private mine(target: number) {
    if (this.dug.has(target)) return;
    const tile = this.tiles[target];
    this.dug.add(target);
    this.blockProgress.delete(target);
    this.revision++;
    this.events.push({
      type: 'dig',
      x: (target % WIDTH) + 0.5,
      y: Math.floor(target / WIDTH) + 0.5,
    });
    if (target === RELIC && !this.won) {
      this.rig.relic = true;
      this.events.push({ type: 'relic', message: 'Alien relic secured. Bring it home.' });
    } else if (tile.ore >= 0) {
      this.rig.cargo[tile.ore] = (this.rig.cargo[tile.ore] ?? 0) + 1;
      this.discoveredOres.add(tile.ore);
      const ore = ORES[tile.ore];
      this.events.push({
        type: 'ore',
        message: ore.rare
          ? `Rare find: ${ore.name} · ${ore.value.toLocaleString('en-US')} cr`
          : undefined,
      });
    }
  }
  private stopTurbo() {
    if (this.turboActive) this.turboCooldown = TURBO.cooldown;
    this.turboActive = false;
    this.turboRemaining = 0;
    this.rig.vy = Math.max(this.rig.vy, -4.5);
  }
  private clearTurboPath(x: number, y: number) {
    if (x - 0.3 < 0 || x + 0.3 >= WIDTH || y + 0.3 >= HEIGHT) return false;
    const tiles: number[] = [];
    for (let row = Math.floor(y - 0.3); row <= Math.floor(y + 0.3); row++) {
      if (row < 0) continue;
      for (let col = Math.floor(x - 0.3); col <= Math.floor(x + 0.3); col++) {
        const target = row * WIDTH + col;
        if (!this.dug.has(target)) tiles.push(target);
      }
    }
    for (const target of tiles) {
      const reason = this.miningWarning(target, true);
      if (reason) {
        this.warning = reason;
        return false;
      }
    }
    const oreCount = tiles.filter((i) => i !== RELIC && this.tiles[i].ore >= 0).length;
    if (this.cargoCount + oreCount > this.cap('cargo')) {
      this.warning = 'Cargo full — return to the surface to sell';
      return false;
    }
    for (const target of tiles) {
      if (this.tiles[target].heat) this.rig.hull -= 6;
      this.mine(target);
    }
    return true;
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
    this.turboCooldown = Math.max(0, this.turboCooldown - dt);
    if (this.turboActive && (!input.up || !input.turbo || this.turboRemaining <= 0))
      this.stopTurbo();
    const boostRequested = input.up && input.turbo;
    if (boostRequested) {
      if (this.upgrades.turbo === 0)
        this.warning = 'Install a turbo thruster at the surface workshop';
      else if (this.turboCooldown > 0) this.warning = 'Turbo recharging';
      else if (!this.turboHeld && !this.turboActive) {
        this.turboActive = true;
        this.turboRemaining = this.cap('turbo');
        this.events.push({ type: 'turbo' });
      } else if (!this.turboActive) this.warning = 'Release Space to boost again';
    }
    this.turboHeld = boostRequested;
    if (dx || input.up || input.down)
      r.fuel = Math.max(
        0,
        r.fuel - dt * (this.turboActive ? TURBO.fuelPerSecond : input.up ? 0.85 : 0.5),
      );
    let target = -1;
    if (!this.turboActive) {
      const tx = Math.floor(r.x + (!input.up && dx ? dx * 0.66 : 0)),
        ty = Math.floor(r.y + (input.up ? -0.66 : !dx && input.down ? 0.66 : 0));
      if (
        (dx || input.down || input.up) &&
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
      this.progress = this.blockProgress.get(target) ?? 0;
    }
    if (target >= 0) {
      const tile = this.tiles[target];
      const reason = this.miningWarning(target);
      if (reason) this.warning = reason;
      else {
        this.progress += (dt * this.cap('drill')) / (0.45 + tile.hardness * 0.35);
        r.fuel = Math.max(0, r.fuel - dt * 0.4);
        if (tile.heat) r.hull -= dt * 12;
        if (this.progress >= 1) {
          this.mine(target);
          this.progress = 0;
          this.target = -1;
        } else {
          this.blockProgress.set(target, this.progress);
        }
      }
    }
    const nx = r.x + dx * dt * 3.3;
    if (this.turboActive && dx && !this.clearTurboPath(nx, r.y)) this.stopTurbo();
    if (!this.blocked(nx, r.y)) r.x = nx;
    r.vy = this.turboActive
      ? -TURBO.speed
      : input.up
        ? Math.max(-4.5, r.vy - dt * 19)
        : Math.min(9, r.vy + dt * 12);
    const ny = Math.max(-3.8, r.y + r.vy * dt);
    if (this.turboActive && !this.clearTurboPath(r.x, ny)) this.stopTurbo();
    if (!this.blocked(r.x, ny)) r.y = ny;
    else {
      r.vy = 0;
    }
    if (this.turboActive) {
      this.turboRemaining = Math.max(0, this.turboRemaining - dt);
      if (this.turboRemaining < 1e-8) this.stopTurbo();
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
    this.stopTurbo();
    this.rig.cargo = emptyCargo();
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
    this.rig.cargo = emptyCargo();
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
      blockProgress: [...this.blockProgress],
      rig: { ...structuredClone(this.rig), cargo: ORES.map((_, i) => this.rig.cargo[i] ?? 0) },
      money: this.money,
      upgrades: { ...this.upgrades },
      won: this.won,
      maxDepth: this.maxDepth,
      seconds: this.seconds,
      discoveredOres: [...this.discoveredOres],
      turboCooldown: this.turboActive ? TURBO.cooldown : this.turboCooldown,
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
    if (
      s.discoveredOres !== undefined &&
      (!Array.isArray(s.discoveredOres) ||
        s.discoveredOres.some((i) => !Number.isInteger(i) || i < 0 || i >= ORES.length))
    )
      throw new Error('Invalid ore discoveries');
    const upgrades = { turbo: 0, ...s.upgrades };
    if (
      s.turboCooldown !== undefined &&
      (!finite(s.turboCooldown) || s.turboCooldown < 0 || s.turboCooldown > TURBO.cooldown)
    )
      throw new Error('Invalid turbo cooldown');
    for (const key of Object.keys(UPGRADES) as Upgrade[])
      if (!Number.isInteger(upgrades[key]) || upgrades[key] < 0 || upgrades[key] > 3)
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
      (r.cargo.length !== 3 && r.cargo.length !== ORES.length) ||
      r.cargo.some((n) => !Number.isInteger(n) || n < 0)
    )
      throw new Error('Invalid rig');
    const g = new Game(s.seed);
    if (
      s.blockProgress !== undefined &&
      (!Array.isArray(s.blockProgress) ||
        s.blockProgress.some(
          (entry) =>
            !Array.isArray(entry) ||
            entry.length !== 2 ||
            !Number.isInteger(entry[0]) ||
            entry[0] < 0 ||
            entry[0] >= WIDTH * HEIGHT ||
            !finite(entry[1]) ||
            entry[1] <= 0 ||
            entry[1] >= 1,
        ))
    )
      throw new Error('Invalid block progress');
    Object.assign(g, {
      dug: new Set(s.dug),
      blockProgress: new Map((s.blockProgress ?? []).filter(([index]) => !s.dug.includes(index))),
      rig: { ...structuredClone(r), cargo: ORES.map((_, i) => r.cargo[i] ?? 0) },
      money: s.money,
      upgrades,
      turboCooldown: s.turboCooldown ?? 0,
      won: s.won,
      maxDepth: s.maxDepth,
      seconds: s.seconds,
    });
    // Older saves retain discovery history through already excavated ore and carried cargo.
    g.discoveredOres = new Set(
      s.discoveredOres ??
        s.dug
          .filter(
            (i) =>
              i !== RELIC && g.tiles[i].ore >= 0 && (r.cargo.length !== 3 || g.tiles[i].ore < 3),
          )
          .map((i) => g.tiles[i].ore),
    );
    r.cargo.forEach((count, i) => {
      if (count > 0) g.discoveredOres.add(i);
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
