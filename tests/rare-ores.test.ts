import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, generate, WIDTH, HEIGHT, RELIC, ORES, NO_INPUT } from '../src/game';

test('ultra-rare deposits occur in all biomes and become more frequent deeper down', () => {
  const counts = Array.from({ length: 3 }, () => [0, 0, 0]);
  for (let seed = 0; seed < 200; seed++) {
    const tiles = generate(seed);
    assert.deepEqual(tiles, generate(seed));
    tiles.forEach((tile, index) => {
      assert.ok(tile.ore >= -1 && tile.ore < ORES.length);
      if (tile.ore < 3) return;
      const row = Math.floor(index / WIDTH);
      assert.notEqual(index, RELIC);
      assert.ok(!(row === 0 && index >= 17 && index <= 21));
      counts[row < 45 ? 0 : row < 100 ? 1 : 2][tile.ore - 3]++;
    });
  }
  for (let ore = 0; ore < 3; ore++) {
    const rates = counts.map((zone, i) => zone[ore] / ([45, 55, 60][i] * WIDTH * 200));
    assert.ok(rates[0] > 0);
    assert.ok(rates[1] > rates[0]);
    assert.ok(rates[2] > rates[1]);
    assert.ok(rates[2] < 0.01);
  }
  assert.ok(counts.flat().reduce((a, b) => a + b, 0) / (200 * WIDTH * HEIGHT) < 0.01);
});

test('rare finds collect, reveal, sell, persist, and are lost in rescue', () => {
  for (let ore = 3; ore < ORES.length; ore++) {
    const g = new Game(1);
    g.tiles[24].ore = ore;
    for (let step = 0; step < 45; step++) g.step(1 / 60, { ...NO_INPUT, down: true });
    assert.equal(g.rig.cargo[ore], 1);
    assert.ok(g.discoveredOres.has(ore));
    assert.equal(g.cargoValue, ORES[ore].value);
    assert.ok(g.events.some((event) => event.message?.includes(`Rare find: ${ORES[ore].name}`)));
    const loaded = Game.load(g.save());
    assert.deepEqual(loaded.rig.cargo, g.rig.cargo);
    assert.ok(loaded.discoveredOres.has(ore));
    loaded.rig.y = -0.5;
    loaded.rig.vy = 0;
    assert.equal(loaded.sell(), ORES[ore].value);
    assert.equal(loaded.rig.cargo.length, ORES.length);
    loaded.rig.cargo[ore] = 1;
    loaded.rescue();
    assert.equal(loaded.cargoCount, 0);
    assert.equal(loaded.money, ORES[ore].value);
    assert.ok(loaded.discoveredOres.has(ore));
  }
});

test('a full hold preserves a rare deposit', () => {
  const g = new Game(1);
  g.tiles[24].ore = 3;
  g.rig.cargo[0] = 12;
  for (let step = 0; step < 90; step++) g.step(1 / 60, { ...NO_INPUT, down: true });
  assert.ok(!g.dug.has(24));
  assert.ok(!g.discoveredOres.has(3));
  assert.match(g.warning, /Cargo full/);
});

test('legacy cargo migrates without inventing rare discoveries in old tunnels', () => {
  const g = new Game(1);
  const rareIndex = g.tiles.findIndex((tile) => tile.ore >= 3);
  assert.ok(rareIndex >= 0);
  g.dug.add(rareIndex);
  g.money = 125;
  const save = g.save();
  save.rig.cargo = [1, 2, 0];
  delete save.discoveredOres;
  const loaded = Game.load(save);
  assert.deepEqual(loaded.rig.cargo, [1, 2, 0, 0, 0, 0]);
  assert.deepEqual([...loaded.discoveredOres], [0, 1]);
  assert.ok(loaded.dug.has(rareIndex));
  assert.equal(loaded.money, 125);
  save.rig.cargo = [0, 0, 0, 0];
  assert.throws(() => Game.load(save), /Invalid rig/);
});
