import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, generate, WIDTH, HEIGHT, RELIC, NO_INPUT, UPGRADES, type Input } from '../src/game';
function tick(g: Game, seconds: number, input: Partial<Input> = {}) {
  for (let i = 0; i < seconds * 60; i++) g.step(1 / 60, { ...NO_INPUT, ...input });
}
test('seeded worlds are stable, bounded, and provide enough safe opening ore', () => {
  for (let seed = 0; seed < 100; seed++) {
    const tiles = generate(seed);
    assert.equal(tiles.length, 48 * 160);
    assert.deepEqual(tiles, generate(seed));
    const accessible = tiles.filter(
      (t, i) => i < 12 * WIDTH && i % WIDTH >= 22 && i % WIDTH <= 30 && t.ore === 0,
    );
    assert.ok(accessible.length * 24 >= 1000);
    assert.ok(tiles.slice(0, 12 * WIDTH).every((t) => !t.heat && t.hardness === 0));
    assert.ok(tiles.filter((_, i) => i % WIDTH === 24).every((t) => !t.heat));
    assert.equal(tiles[RELIC].hardness, 3);
  }
});
test('land, drill down, consume fuel, and thrust home through the persistent shaft', () => {
  const g = new Game(1);
  tick(g, 1);
  assert.ok(g.atSurface);
  const fuel = g.rig.fuel;
  tick(g, 3, { down: true });
  assert.ok(g.rig.y > 1);
  assert.ok(g.dug.size >= 3);
  assert.ok(g.rig.fuel < fuel);
  const dug = [...g.dug];
  tick(g, 3, { up: true });
  assert.ok(g.rig.y < 0);
  assert.deepEqual([...g.dug], dug);
  assert.ok(g.solid(-1, 0));
  assert.ok(g.solid(WIDTH, 0));
  assert.ok(g.solid(1, HEIGHT));
});
test('upward drilling mines overhead rock while protecting the station foundation', () => {
  const g = new Game(1);
  g.dug.add(WIDTH + 24);
  g.rig.y = 1.5;
  tick(g, 1, { up: true });
  assert.ok(g.dug.has(24));
  g.rig.x = 20.5;
  g.rig.y = -0.5;
  g.rig.vy = 0;
  tick(g, 2, { down: true });
  assert.ok(!g.dug.has(20));
  assert.match(g.warning, /foundation/);
});
test('full hold prevents destruction of ore; sell only at surface', () => {
  const g = new Game(1);
  g.tiles[24].ore = 0;
  g.rig.cargo = [12, 0, 0];
  tick(g, 1, { down: true });
  assert.ok(!g.dug.has(24));
  assert.match(g.warning, /Cargo full/);
  assert.equal(g.sell(), 288);
  assert.equal(g.money, 288);
  assert.equal(g.cargoCount, 0);
  tick(g, 2, { down: true });
  g.rig.cargo = [1, 0, 0];
  assert.equal(g.sell(), 0);
  assert.equal(g.cargoCount, 1);
});
test('purchases enforce affordability, level cap, and drill gates', () => {
  const g = new Game(1);
  g.tiles[24].hardness = 1;
  tick(g, 1, { down: true });
  assert.match(g.warning, /tier 2/);
  assert.equal(g.buy('drill'), false);
  g.money = 10000;
  assert.ok(g.buy('drill'));
  assert.equal(g.cap('drill'), 1.55);
  tick(g, 1, { down: true });
  assert.ok(g.dug.has(24));
  g.rescue();
  for (const key of ['drill', 'fuel', 'cargo', 'hull'] as const) {
    while (g.upgrades[key] < 3) {
      g.money = 10000;
      assert.ok(g.buy(key));
    }
    assert.equal(g.cap(key), UPGRADES[key].values[3]);
    assert.equal(g.buy(key), false);
  }
});
test('fuel failure rescues without losing money, upgrades, or tunnels', () => {
  const g = new Game(1);
  g.money = 400;
  g.buy('cargo');
  g.dug.add(24);
  g.rig.cargo = [4, 0, 0];
  g.rig.fuel = 0.001;
  tick(g, 0.1, { up: true });
  assert.equal(g.cargoCount, 0);
  assert.equal(g.money, 240);
  assert.equal(g.upgrades.cargo, 1);
  assert.ok(g.dug.has(24));
  assert.equal(g.rig.x, 20.5);
  assert.ok(g.rig.fuel > 99);
  tick(g, 1);
  assert.ok(g.atSurface);
  assert.equal(g.rig.hull, 100);
});
test('long falls are harmless; hot rock still damages the hull and service is surface-only', () => {
  const g = new Game(1);
  for (let y = 0; y < 12; y++) g.dug.add(y * WIDTH + 24);
  tick(g, 3);
  assert.equal(g.rig.hull, 100);
  assert.ok(g.rig.y > 10);
  assert.equal(g.service(), false);
  g.rescue();
  g.rig.x = 24.5;
  g.rig.y = -0.5;
  g.dug.clear();
  g.tiles[24].heat = true;
  tick(g, 0.3, { down: true });
  assert.ok(g.rig.hull < 100);
  g.rig.y = -0.5;
  g.rig.vy = 0;
  assert.ok(g.service());
  assert.equal(g.rig.hull, 100);
});

test('ore is discovered only on collection and stays known after sale, rescue, and reload', () => {
  const g = new Game(1);
  assert.equal(g.discoveredOres.size, 0);
  g.tiles[24].ore = 0;
  tick(g, 1, { down: true });
  assert.deepEqual([...g.discoveredOres], [0]);
  g.rig.x = 20.5;
  g.rig.y = -0.5;
  g.rig.vy = 0;
  g.sell();
  g.rescue();
  assert.equal(g.cargoCount, 0);
  assert.deepEqual([...Game.load(g.save()).discoveredOres], [0]);
  const fresh = new Game(1);
  fresh.tiles[24].ore = 0;
  fresh.rig.cargo = [12, 0, 0];
  tick(fresh, 1, { down: true });
  assert.equal(fresh.discoveredOres.size, 0);
});

test('legacy saves infer discoveries from excavated ore without revealing other resources', () => {
  const g = new Game(1);
  const copper = g.tiles.findIndex((t) => t.ore === 0);
  g.dug.add(copper);
  const legacy = g.save();
  delete legacy.discoveredOres;
  const loaded = Game.load(legacy);
  assert.deepEqual([...loaded.discoveredOres], [0]);
  assert.throws(() => Game.load({ ...legacy, discoveredOres: [9] }));
});
test('relic occupies a reserved slot, resets after rescue, and wins at surface', () => {
  const g = new Game(1);
  g.upgrades.drill = 3;
  g.upgrades.fuel = 3;
  g.rig.fuel = 380;
  g.dug.add(RELIC - WIDTH);
  g.rig.x = 24.5;
  g.rig.y = 152.5;
  g.rig.cargo = [12, 0, 0];
  tick(g, 1, { down: true });
  assert.ok(g.rig.relic);
  assert.equal(g.cargoCount, 12);
  g.rescue();
  assert.ok(!g.dug.has(RELIC));
  assert.ok(!g.rig.relic);
  g.rig.x = 24.5;
  g.rig.y = 152.5;
  tick(g, 1, { down: true });
  assert.ok(g.rig.relic);
  g.rig.x = 20.5;
  g.rig.y = -0.5;
  g.rig.vy = 0;
  tick(g, 1);
  assert.ok(g.won);
  assert.ok(!g.rig.relic);
  assert.ok(g.events.some((e) => e.type === 'win'));
});
test('blocks retain independent drilling progress after stopping and switching targets', () => {
  const g = new Game(1);
  tick(g, 0.2, { down: true });
  const first = g.progress;
  assert.ok(first > 0 && first < 1);
  tick(g, 1);
  assert.equal(g.blockProgress.get(24), first);
  g.rig.x = 25.5;
  tick(g, 0.1, { down: true });
  const second = g.progress;
  assert.ok(second > 0 && second < first);
  g.rig.x = 24.5;
  tick(g, 0.1, { down: true });
  assert.ok(g.progress > first);
  assert.equal(g.blockProgress.get(25), second);
  tick(g, 0.2, { down: true });
  assert.ok(g.dug.has(24));
  assert.ok(!g.blockProgress.has(24));
});

test('partial drilling survives rescue and save/load with legacy compatibility', () => {
  const g = new Game(1);
  tick(g, 0.2, { down: true });
  const progress = g.progress;
  g.rescue();
  const loaded = Game.load(JSON.parse(JSON.stringify(g.save())));
  assert.equal(loaded.blockProgress.get(24), progress);
  loaded.rig.x = 24.5;
  tick(loaded, 0.3, { down: true });
  assert.ok(loaded.dug.has(24));
  assert.ok(!loaded.blockProgress.has(24));
  const legacy = g.save();
  delete legacy.blockProgress;
  assert.equal(Game.load(legacy).blockProgress.size, 0);
  for (const entry of [
    [-1, 0.5],
    [WIDTH * HEIGHT, 0.5],
    [24, -0.1],
    [24, 1],
    [24, NaN],
  ]) {
    assert.throws(() => Game.load({ ...legacy, blockProgress: [entry] }), /Invalid block progress/);
  }
});

test('turbo clears stored progress when breaking a partially mined block', () => {
  const g = new Game(1);
  g.dug.add(WIDTH + 24);
  g.rig.y = 1.5;
  tick(g, 0.1, { up: true });
  assert.ok(g.blockProgress.has(24));
  g.upgrades.turbo = 1;
  tick(g, 0.2, { up: true, turbo: true });
  assert.ok(g.dug.has(24));
  assert.ok(!g.blockProgress.has(24));
});

test('saves round-trip and reject malformed or incompatible data', () => {
  const g = new Game(47);
  tick(g, 3, { down: true });
  g.money = 200;
  const raw = JSON.parse(JSON.stringify(g.save()));
  assert.deepEqual(Game.load(raw).save(), g.save());
  assert.throws(() => Game.load({ ...raw, version: 2 }));
  assert.throws(() => Game.load({ ...raw, dug: [999999] }));
  assert.throws(() => Game.load({ ...raw, rig: { ...raw.rig, cargo: [999, 0, 0] } }));
  assert.throws(() => Game.load({ ...raw, upgrades: { ...raw.upgrades, drill: 5 } }));
});
