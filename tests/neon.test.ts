import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NeonGame, TUNING, ARENA, sweep, freshSave, loadSave, recordClear } from '../src/neon/game';
import { STAGES } from '../src/neon/stages';
const idle = [
  { move: 0, fire: false },
  { move: 0, fire: false },
];
function tick(g: NeonGame, seconds: number, fire = false) {
  for (let i = 0; i < Math.round(seconds * 60); i++)
    g.step(1 / 60, [
      { move: 0, fire },
      { move: 0, fire },
    ]);
}
function playing(mode: 'solo' | 'coop' = 'solo', stage = 0) {
  const g = new NeonGame(stage, mode);
  tick(g, 2.1);
  assert.equal(g.phase, 'playing');
  return g;
}

test('15 authored stages have safe spawns, valid drops, and traversable platform gaps', () => {
  assert.equal(STAGES.length, 15);
  STAGES.forEach((stage, index) => {
    assert.equal(stage.theme, Math.floor(index / 5));
    assert.equal(index < 5, stage.platforms.length === 0);
    for (const b of [...stage.bubbles, ...stage.coop]) {
      const r = TUNING.radius[b.size];
      assert.ok(b.x >= r && b.x <= 960 - r && b.y >= 48 + r && b.y < 400);
      for (const p of stage.platforms)
        assert.ok(b.x + r <= p.x || b.x - r >= p.x + p.w || b.y + r <= p.y || b.y - r >= p.y + p.h);
    }
    for (const p of stage.platforms) {
      assert.ok(p.x >= 104 && p.x + p.w <= 856);
      assert.ok(p.y >= 160 && p.y + p.h < 300);
    }
    assert.equal(new Set(stage.drops.map((d) => d.after)).size, stage.drops.length);
    assert.ok(stage.drops.every((d) => d.after > 0));
  });
});
test('each bubble splits once per harpoon; smallest bubbles disappear and award score', () => {
  for (const size of [0, 1, 2, 3] as const) {
    const g = playing();
    g.bubbles = [{ id: 999, x: 480, y: 400, vx: 0, vy: 0, size }];
    g.harpoons = [{ id: 888, owner: 0, x: 480, tip: 410 }];
    g.step(1 / 60, idle);
    assert.equal(g.harpoons.length, 0);
    assert.equal(g.bubbles.length, size === 0 ? 0 : 2);
    assert.equal(g.pops, 1);
    if (size) {
      assert.ok(g.bubbles.every((b) => b.size === size - 1));
      assert.ok(g.bubbles[0].vx < 0 && g.bubbles[1].vx > 0);
    } else {
      assert.equal(g.phase, 'cleared');
      assert.equal(g.score, 100 + g.bonus);
    }
  }
});
test('swept collision catches fast movement and bubbles bounce off walls, floor and platforms', () => {
  assert.ok(sweep(0, 10, 1000, 0, { x: 500, y: 0, w: 10, h: 20 }));
  assert.equal(sweep(0, 30, 1000, 0, { x: 500, y: 0, w: 10, h: 20 }), null);
  const g = playing('solo', 5);
  g.bubbles = [{ id: 999, x: 30, y: 400, vx: -2000, vy: 0, size: 0 }];
  g.step(1 / 60, idle);
  assert.ok(g.bubbles[0].x >= 12 && g.bubbles[0].vx > 0);
  g.bubbles = [{ id: 999, x: 100, y: 480, vx: 0, vy: 1000, size: 0 }];
  g.step(1 / 60, idle);
  assert.ok(g.bubbles[0].y <= 488 && g.bubbles[0].vy < 0);
  g.bubbles = [{ id: 999, x: 450, y: 195, vx: 0, vy: 2000, size: 0 }];
  g.step(1 / 60, idle);
  assert.ok(g.bubbles[0].y < 208 && g.bubbles[0].vy < 0);
});
test('harpoons stop at platforms and ceiling, held fire repeats and obeys per-player limits', () => {
  const g = playing('coop', 5);
  g.harpoons = [{ id: 900, owner: 0, x: 480, tip: 236 }];
  g.step(1 / 60, idle);
  assert.equal(g.harpoons.length, 0);
  g.harpoons = [{ id: 901, owner: 0, x: 50, tip: 50 }];
  g.step(1 / 60, idle);
  assert.equal(g.harpoons.length, 0);
  for (let i = 0; i < 60; i++) {
    g.step(1 / 60, [
      { move: 0, fire: true },
      { move: 0, fire: true },
    ]);
    for (const p of g.players) assert.ok(g.harpoons.filter((h) => h.owner === p.id).length <= 1);
  }
  assert.ok(g.events.filter((e) => e.type === 'fire').length >= 4);
  g.collect(g.players[0], 'double');
  tick(g, 0.25, true);
  assert.ok(g.harpoons.filter((h) => h.owner === 0).length <= 2);
  const double = playing();
  double.players[0].x = 50;
  double.collect(double.players[0], 'double');
  tick(double, 0.25, true);
  assert.equal(double.harpoons.length, 2);
});
test('simultaneous co-op hits cost one shared life, reset the attempt, and permit fresh retries', () => {
  const g = playing('coop');
  const causeHit = () => {
    g.bubbles = g.players.map((p, id) => ({
      id: 800 + id,
      x: p.x,
      y: 475,
      vx: 0,
      vy: 0,
      size: 0 as const,
    }));
    g.step(1 / 60, idle);
  };
  g.score = 100;
  g.slow = 3;
  causeHit();
  assert.equal(g.lives, 2);
  assert.equal(g.phase, 'ready');
  assert.equal(g.score, 0);
  assert.equal(g.elapsed, 0);
  assert.equal(g.slow, 0);
  tick(g, 2.1);
  causeHit();
  tick(g, 2.1);
  causeHit();
  assert.equal(g.phase, 'over');
  assert.equal(g.lives, 0);
  g.retry();
  assert.equal(g.phase, 'ready');
  assert.equal(g.lives, 3);
});
test('power-ups refresh instead of stack, shield absorbs a hit, pickups expire and slow affects only bubbles', () => {
  const g = playing();
  g.collect(g.players[0], 'shield');
  g.bubbles = [{ id: 99, x: 480, y: 475, vx: 0, vy: 0, size: 0 }];
  g.step(1 / 60, idle);
  assert.equal(g.lives, 3);
  assert.equal(g.players[0].shield, false);
  assert.ok(g.players[0].invincible > 0);
  g.collect(g.players[0], 'double');
  g.players[0].double = 5;
  g.collect(g.players[0], 'double');
  assert.equal(g.players[0].double, 10);
  const slow = playing(),
    normal = playing();
  slow.collect(slow.players[0], 'slow');
  const input = [{ move: 1, fire: true }];
  slow.step(0.1, input);
  normal.step(0.1, input);
  assert.equal(slow.players[0].x, normal.players[0].x);
  assert.ok(slow.bubbles[0].x < normal.bubbles[0].x);
  assert.equal(slow.harpoons[0].tip, normal.harpoons[0].tip);
  slow.pickups = [{ id: 999, x: 10, y: 100, life: 0.01, power: 'shield' }];
  slow.step(0.02, idle);
  assert.equal(slow.pickups.length, 0);
  slow.players[0].double = 0.01;
  slow.slow = 0.01;
  slow.step(0.02, idle);
  assert.equal(slow.players[0].double, 0);
  assert.equal(slow.slow, 0);
});
test('pause freezes everything and resume counts down without advancing the attempt', () => {
  const g = playing();
  g.pause();
  const snapshot = JSON.stringify(g);
  tick(g, 5, true);
  assert.equal(JSON.stringify(g), snapshot);
  g.resume();
  const elapsed = g.elapsed;
  tick(g, 0.5, true);
  assert.equal(g.phase, 'ready');
  assert.equal(g.elapsed, elapsed);
  tick(g, 1);
  assert.equal(g.phase, 'playing');
});
test('clears persist independent mode unlocks, high scores and best times; invalid saves fail', () => {
  const save = freshSave(),
    g = playing();
  recordClear(save, g);
  assert.equal(save.solo.unlocked, 1);
  g.bubbles = [];
  g.step(1 / 60, idle);
  recordClear(save, g);
  assert.equal(save.solo.unlocked, 2);
  assert.equal(save.coop.unlocked, 1);
  assert.deepEqual(loadSave(JSON.parse(JSON.stringify(save))), save);
  assert.throws(() => loadSave({ ...save, version: 2 }));
  assert.throws(() => loadSave({ ...save, solo: { unlocked: 16, best: {} } }));
  assert.throws(() =>
    loadSave({ ...save, solo: { unlocked: 1, best: { 0: { score: -1, time: 0 } } } }),
  );
});
