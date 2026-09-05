import { STAGES, type Platform, type Power, type Size } from './stages';
export const ARENA = { width: 960, height: 540, ceiling: 48, floor: 500 };
export const TUNING = {
  radius: [12, 22, 36, 52],
  speed: [165, 140, 115, 90],
  bounce: [220, 290, 360, 430],
  gravity: 600,
  playerSpeed: 270,
  playerWidth: 24,
  playerHeight: 36,
  harpoonSpeed: 760,
  fireDelay: 0.22,
  countdown: 2,
  resumeCountdown: 1.2,
  doubleDuration: 10,
  slowDuration: 6,
  pickupDuration: 8,
  maxParticles: 160,
};
export type Mode = 'solo' | 'coop';
export type Phase = 'ready' | 'playing' | 'paused' | 'cleared' | 'over';
export interface InputAction {
  move: number;
  fire: boolean;
}
export interface Player {
  id: number;
  x: number;
  double: number;
  shield: boolean;
  invincible: number;
  fireCooldown: number;
}
export interface Bubble {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: Size;
}
export interface Harpoon {
  id: number;
  owner: number;
  x: number;
  tip: number;
}
export interface Pickup {
  id: number;
  x: number;
  y: number;
  life: number;
  power: Power;
}
export interface GameEvent {
  type: 'pop' | 'fire' | 'hit' | 'pickup' | 'clear';
  x: number;
  y: number;
  power?: Power;
  size?: Size;
}
export interface Best {
  score: number;
  time: number;
}
export interface Progress {
  unlocked: number;
  best: Record<string, Best>;
}
export interface SaveData {
  version: 1;
  solo: Progress;
  coop: Progress;
}
export const freshSave = (): SaveData => ({
  version: 1,
  solo: { unlocked: 1, best: {} },
  coop: { unlocked: 1, best: {} },
});
export function loadSave(raw: unknown): SaveData {
  const s = raw as SaveData;
  if (!s || s.version !== 1) throw new Error('Invalid save');
  for (const mode of ['solo', 'coop'] as const) {
    const progress = s[mode];
    if (
      !progress ||
      !Number.isInteger(progress.unlocked) ||
      progress.unlocked < 1 ||
      progress.unlocked > STAGES.length ||
      !progress.best ||
      typeof progress.best !== 'object' ||
      Array.isArray(progress.best)
    )
      throw new Error('Invalid progress');
    for (const [key, best] of Object.entries(progress.best)) {
      if (
        !/^(0|[1-9]\d*)$/.test(key) ||
        Number(key) >= progress.unlocked ||
        !best ||
        !Number.isInteger(best.score) ||
        best.score < 0 ||
        best.score > 1000000 ||
        !Number.isFinite(best.time) ||
        best.time < 0
      )
        throw new Error('Invalid result');
    }
  }
  return structuredClone(s);
}
export function recordClear(save: SaveData, game: NeonGame) {
  if (game.phase !== 'cleared') return;
  const progress = save[game.mode];
  progress.unlocked = Math.max(progress.unlocked, Math.min(STAGES.length, game.stageIndex + 2));
  const previous = progress.best[game.stageIndex];
  progress.best[game.stageIndex] = {
    score: Math.max(previous?.score ?? 0, game.score),
    time: Math.min(previous?.time ?? Infinity, game.elapsed),
  };
}

// Swept point against a rectangle: used for moving circles against expanded obstacles.
export function sweep(
  x: number,
  y: number,
  dx: number,
  dy: number,
  rect: Platform,
): { t: number; nx: number; ny: number } | null {
  let enter = -Infinity,
    leave = Infinity,
    nx = 0,
    ny = 0;
  for (const [p, d, min, max, ax, ay] of [
    [x, dx, rect.x, rect.x + rect.w, 1, 0],
    [y, dy, rect.y, rect.y + rect.h, 0, 1],
  ]) {
    if (Math.abs(d) < 1e-10) {
      if (p < min || p > max) return null;
      continue;
    }
    const a = (min - p) / d,
      b = (max - p) / d;
    const near = Math.min(a, b),
      far = Math.max(a, b);
    if (near > enter) {
      enter = near;
      nx = ax * (d > 0 ? -1 : 1);
      ny = ay * (d > 0 ? -1 : 1);
    }
    leave = Math.min(leave, far);
  }
  return enter <= leave && leave >= 0 && enter >= -1e-8 && enter <= 1
    ? { t: Math.max(0, enter), nx, ny }
    : null;
}
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
export class NeonGame {
  players: Player[] = [];
  bubbles: Bubble[] = [];
  harpoons: Harpoon[] = [];
  pickups: Pickup[] = [];
  events: GameEvent[] = [];
  phase: Phase = 'ready';
  lives = 3;
  elapsed = 0;
  score = 0;
  bonus = 0;
  slow = 0;
  countdown = TUNING.countdown;
  pops = 0;
  private nextId = 1;
  constructor(
    public stageIndex = 0,
    public mode: Mode = 'solo',
  ) {
    if (!Number.isInteger(stageIndex) || !STAGES[stageIndex]) throw new Error('Invalid stage');
    this.reset();
  }
  get stage() {
    return STAGES[this.stageIndex];
  }
  reset() {
    this.elapsed = this.score = this.bonus = this.slow = this.pops = 0;
    this.harpoons = [];
    this.pickups = [];
    this.events = [];
    this.players = (this.mode === 'solo' ? [480] : [390, 570]).map((x, id) => ({
      id,
      x,
      double: 0,
      shield: false,
      invincible: 0,
      fireCooldown: 0,
    }));
    this.bubbles = [...this.stage.bubbles, ...(this.mode === 'coop' ? this.stage.coop : [])].map(
      (b) => ({
        id: this.nextId++,
        x: b.x,
        y: b.y,
        size: b.size,
        vx: b.direction * TUNING.speed[b.size],
        vy: 0,
      }),
    );
    this.countdown = TUNING.countdown;
    this.phase = 'ready';
  }
  retry() {
    this.lives = 3;
    this.reset();
  }
  pause() {
    if (this.phase === 'playing' || this.phase === 'ready') this.phase = 'paused';
  }
  resume() {
    if (this.phase === 'paused') {
      this.countdown = Math.max(TUNING.resumeCountdown, this.countdown);
      this.phase = 'ready';
    }
  }
  collect(player: Player, power: Power) {
    if (power === 'double') player.double = TUNING.doubleDuration;
    if (power === 'shield') player.shield = true;
    if (power === 'slow') this.slow = TUNING.slowDuration;
    this.events.push({ type: 'pickup', x: player.x, y: ARENA.floor - 20, power });
  }
  private pop(bubble: Bubble) {
    this.bubbles = this.bubbles.filter((b) => b.id !== bubble.id);
    this.score += [100, 80, 60, 40][bubble.size];
    this.pops++;
    this.events.push({ type: 'pop', x: bubble.x, y: bubble.y, size: bubble.size });
    if (bubble.size > 0) {
      const size = (bubble.size - 1) as Size,
        r = TUNING.radius[size];
      for (const direction of [-1, 1])
        this.bubbles.push({
          id: this.nextId++,
          size,
          x: clamp(bubble.x + direction * (r * 0.3), r, ARENA.width - r),
          y: clamp(bubble.y, ARENA.ceiling + r, ARENA.floor - r),
          vx: direction * TUNING.speed[size],
          vy: -TUNING.bounce[size],
        });
    }
    const drop = this.stage.drops.find((d) => d.after === this.pops);
    if (drop)
      this.pickups.push({
        id: this.nextId++,
        x: clamp(bubble.x, 20, 940),
        y: bubble.y,
        life: TUNING.pickupDuration,
        power: drop.power,
      });
  }
  private hit(player: Player): boolean {
    if (player.invincible > 0) return false;
    if (player.shield) {
      player.shield = false;
      player.invincible = 1.5;
      this.events.push({ type: 'hit', x: player.x, y: ARENA.floor - 18 });
      return false;
    }
    const event: GameEvent = { type: 'hit', x: player.x, y: ARENA.floor - 18 };
    this.lives--;
    this.reset();
    this.events.push(event);
    if (!this.lives) this.phase = 'over';
    return true;
  }
  private moveBubble(b: Bubble, dt: number) {
    const r = TUNING.radius[b.size];
    b.vy += TUNING.gravity * dt;
    let remaining = dt;
    for (let pass = 0; pass < 5 && remaining > 1e-7; pass++) {
      const dx = b.vx * remaining,
        dy = b.vy * remaining;
      const obstacles: Platform[] = [
        { x: -1000, y: -1000, w: 1000, h: 2000 },
        { x: ARENA.width, y: -1000, w: 1000, h: 2000 },
        { x: -1000, y: -1000, w: 3000, h: ARENA.ceiling + 1000 },
        { x: -1000, y: ARENA.floor, w: 3000, h: 1000 },
        ...this.stage.platforms,
      ];
      let first: ReturnType<typeof sweep> = null;
      for (const p of obstacles) {
        const contact = sweep(b.x, b.y, dx, dy, {
          x: p.x - r,
          y: p.y - r,
          w: p.w + r * 2,
          h: p.h + r * 2,
        });
        if (contact && (!first || contact.t < first.t)) first = contact;
      }
      const t = first?.t ?? 1;
      b.x += dx * t;
      b.y += dy * t;
      if (!first) break;
      b.x += first.nx * 0.001;
      b.y += first.ny * 0.001;
      if (first.nx) b.vx = -b.vx;
      if (first.ny) b.vy = first.ny < 0 ? -TUNING.bounce[b.size] : Math.abs(b.vy);
      remaining *= 1 - t;
    }
  }
  step(dt: number, inputs: InputAction[]) {
    if (this.phase === 'ready') {
      this.countdown = Math.max(0, this.countdown - dt);
      if (!this.countdown) this.phase = 'playing';
      return;
    }
    if (this.phase !== 'playing' || dt <= 0) return;
    // Small physics slices plus swept tests keep thin ropes and fast bubbles reliable.
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    for (let n = 0; n < steps; n++) {
      this.advance(dt / steps, inputs);
      if (this.phase !== 'playing') break;
    }
  }
  private advance(dt: number, inputs: InputAction[]) {
    this.elapsed += dt;
    const slow = this.slow > 0 ? 0.5 : 1;
    this.slow = Math.max(0, this.slow - dt);
    const oldPlayers = this.players.map((p) => p.x);
    for (const p of this.players) {
      const input = inputs[p.id] ?? { move: 0, fire: false };
      p.x = clamp(p.x + clamp(input.move, -1, 1) * TUNING.playerSpeed * dt, 14, ARENA.width - 14);
      p.double = Math.max(0, p.double - dt);
      p.invincible = Math.max(0, p.invincible - dt);
      p.fireCooldown = Math.max(0, p.fireCooldown - dt);
      if (
        input.fire &&
        p.fireCooldown <= 0 &&
        this.harpoons.filter((h) => h.owner === p.id).length < (p.double > 0 ? 2 : 1)
      ) {
        this.harpoons.push({ id: this.nextId++, owner: p.id, x: p.x, tip: ARENA.floor - 28 });
        p.fireCooldown = TUNING.fireDelay;
        this.events.push({ type: 'fire', x: p.x, y: ARENA.floor - 28 });
      }
    }
    const oldBubbles = new Map(this.bubbles.map((b) => [b.id, { x: b.x, y: b.y }]));
    for (const b of this.bubbles) this.moveBubble(b, dt * slow);
    for (const h of [...this.harpoons]) {
      const nextTip = Math.max(ARENA.ceiling, h.tip - TUNING.harpoonSpeed * dt);
      let stop = ARENA.ceiling;
      for (const p of this.stage.platforms)
        if (h.x >= p.x && h.x <= p.x + p.w && p.y + p.h <= h.tip + 0.01)
          stop = Math.max(stop, p.y + p.h);
      const tip = Math.max(stop, nextTip);
      const hits = this.bubbles
        .filter((b) => {
          const old = oldBubbles.get(b.id);
          if (!old) return false;
          const r = TUNING.radius[b.size];
          const closestY = clamp(b.y, tip, ARENA.floor);
          return (
            Math.hypot(b.x - h.x, b.y - closestY) <= r + 2 ||
            !!sweep(old.x, old.y, b.x - old.x, b.y - old.y, {
              x: h.x - r - 2,
              y: tip - r,
              w: r * 2 + 4,
              h: ARENA.floor - tip + r * 2,
            })
          );
        })
        .sort((a, b) => b.y - a.y);
      h.tip = tip;
      if (hits[0]) {
        this.pop(hits[0]);
        this.harpoons = this.harpoons.filter((other) => other.id !== h.id);
      } else if (nextTip <= stop)
        this.harpoons = this.harpoons.filter((other) => other.id !== h.id);
    }
    for (const pickup of this.pickups) {
      pickup.life -= dt;
      pickup.y = Math.min(ARENA.floor - 12, pickup.y + 190 * dt);
      if (pickup.life <= 0) continue;
      const p = this.players.find(
        (p) => Math.abs(p.x - pickup.x) < 26 && pickup.y >= ARENA.floor - TUNING.playerHeight - 12,
      );
      if (p) {
        this.collect(p, pickup.power);
        pickup.life = 0;
      }
    }
    this.pickups = this.pickups.filter((p) => p.life > 0);
    for (const b of this.bubbles) {
      const old = oldBubbles.get(b.id) ?? b,
        r = TUNING.radius[b.size];
      for (const p of this.players) {
        const px = clamp(b.x, p.x - 12, p.x + 12),
          py = clamp(b.y, ARENA.floor - TUNING.playerHeight, ARENA.floor);
        const contact =
          Math.hypot(b.x - px, b.y - py) <= r ||
          sweep(
            old.x - oldPlayers[p.id],
            old.y,
            b.x - p.x - (old.x - oldPlayers[p.id]),
            b.y - old.y,
            {
              x: -12 - r,
              y: ARENA.floor - TUNING.playerHeight - r,
              w: 24 + 2 * r,
              h: TUNING.playerHeight + 2 * r,
            },
          );
        if (contact && this.hit(p)) return;
      }
    }
    if (this.bubbles.length === 0) {
      this.phase = 'cleared';
      this.bonus = Math.max(0, 3000 - Math.floor(this.elapsed * 20));
      this.score += this.bonus;
      this.events.push({ type: 'clear', x: 480, y: 240 });
    }
  }
}
