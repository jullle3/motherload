import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, NO_INPUT, TURBO, WIDTH, RELIC, type Input } from '../src/game';
function tick(g: Game, seconds: number, input: Partial<Input> = {}) {
  for (let i = 0; i < Math.round(seconds * 60); i++) g.step(1 / 60, { ...NO_INPUT, ...input });
}
function underground(level = 1) {
  const g = new Game(1);
  g.rig.y = 30.5;
  g.dug.add(30 * WIDTH + 24);
  g.upgrades.turbo = level;
  return g;
}

test('turbo requires installation and both up and space', () => {
  const g = underground(0);
  tick(g, 0.1, { up: true, turbo: true });
  assert.equal(g.turboActive, false);
  assert.match(g.warning, /Install/);
  const installed = underground();
  tick(installed, 0.1, { turbo: true });
  assert.equal(installed.turboActive, false);
  tick(installed, 0.1, { up: true });
  assert.equal(installed.turboActive, false);
  tick(installed, 0.1, { up: true, turbo: true });
  assert.equal(installed.turboActive, true);
});
test('entry turbo is a finite burst that mines its path and uses extra fuel', () => {
  const g = underground();
  const start = g.rig.y;
  tick(g, 0.6, { up: true, turbo: true });
  assert.equal(g.turboActive, false);
  assert.ok(start - g.rig.y > 5.8 && start - g.rig.y < 6.1);
  assert.ok(g.dug.size >= 7);
  assert.ok(g.cargoCount > 0);
  assert.ok(g.discoveredOres.has(0));
  assert.ok(Math.abs(g.rig.fuel - (100 - TURBO.fuelPerSecond * 0.6)) < 0.01);
  assert.equal(g.turboCooldown, TURBO.cooldown);
  assert.ok(!g.blocked(g.rig.x, g.rig.y));
  tick(g, 7, { up: true, turbo: true });
  assert.equal(g.events.filter((e) => e.type === 'turbo').length, 1);
  tick(g, 0.1);
  tick(g, 0.1, { up: true, turbo: true });
  assert.equal(g.events.filter((e) => e.type === 'turbo').length, 2);
});
test('release cancels turbo immediately; recharge prevents early reuse', () => {
  const g = underground();
  tick(g, 0.1, { up: true, turbo: true });
  tick(g, 1 / 60, { up: true });
  assert.equal(g.turboActive, false);
  assert.equal(g.turboCooldown, TURBO.cooldown);
  tick(g, 0.1, { up: true, turbo: true });
  assert.equal(g.turboActive, false);
  tick(g, 6);
  tick(g, 0.1, { up: true, turbo: true });
  assert.equal(g.turboActive, true);
});
test('upgrades buy longer bursts; old saves load without turbo and cooldown survives reload', () => {
  const g = new Game(1);
  g.money = 4000;
  for (const duration of [0.6, 1.2, 2]) {
    assert.ok(g.buy('turbo'));
    assert.equal(g.cap('turbo'), duration);
  }
  assert.equal(g.buy('turbo'), false);
  assert.equal(g.money, 100);
  const deep = underground(3);
  tick(deep, 0.2, { up: true, turbo: true });
  const restored = Game.load(deep.save());
  assert.equal(restored.turboActive, false);
  assert.equal(restored.turboCooldown, 6);
  assert.equal(restored.upgrades.turbo, 3);
  const legacy = new Game(9).save();
  delete legacy.upgrades.turbo;
  delete legacy.turboCooldown;
  assert.equal(Game.load(legacy).upgrades.turbo, 0);
  assert.throws(() => Game.load({ ...legacy, turboCooldown: 99 }));
});
test('turbo breaks hard rock, respects cargo limits and station foundations, and preserves relic gating', () => {
  const hard = underground();
  hard.tiles[29 * WIDTH + 24].hardness = 2;
  tick(hard, 0.2, { up: true, turbo: true });
  assert.ok(hard.dug.has(29 * WIDTH + 24));
  const full = underground();
  full.rig.cargo = [12, 0, 0];
  full.tiles[29 * WIDTH + 24].ore = 0;
  tick(full, 0.2, { up: true, turbo: true });
  assert.ok(!full.dug.has(29 * WIDTH + 24));
  assert.equal(full.cargoCount, 12);
  assert.ok(!full.blocked(full.rig.x, full.rig.y));
  const foundation = underground();
  foundation.rig.x = 20.5;
  foundation.rig.y = 1.5;
  foundation.dug.add(WIDTH + 20);
  tick(foundation, 0.2, { up: true, turbo: true });
  assert.ok(!foundation.dug.has(20));
  const relic = underground();
  relic.rig.y = 154.5;
  relic.dug.add(RELIC + WIDTH);
  tick(relic, 0.2, { up: true, turbo: true });
  assert.ok(!relic.dug.has(RELIC));
  assert.equal(relic.rig.relic, false);
});
test('turbo clears both sides of a tile seam without clipping; hot blocks retain their danger', () => {
  const g = underground();
  g.rig.x = 24.95;
  g.dug.add(30 * WIDTH + 25);
  g.tiles[29 * WIDTH + 24].heat = true;
  tick(g, 0.4, { up: true, turbo: true, right: true });
  assert.ok(!g.blocked(g.rig.x, g.rig.y));
  assert.ok(g.rig.hull < 100);
  assert.ok(g.rig.y < 27);
});
