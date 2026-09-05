import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OrbitalGame } from '../src/orbital/game';
import { CONFIG, DISCOVERIES, MACHINE_KEYS, REGIONS } from '../src/orbital/config';
function advance(g: OrbitalGame, seconds: number) {
  return g.advance(g.state.lastAt + seconds * 1000);
}
function funded() {
  const g = new OrbitalGame(1000000, 12345);
  g.e.credits = g.e.earned = 10000000;
  g.e.levels.storage = 10;
  g.e.alloy = 3000;
  g.e.circuits = 1000;
  return g;
}

test('first upgrade is affordable within a minute and locked electronics cannot stall the starting factory', () => {
  const g = new OrbitalGame(0, 123);
  advance(g, 60);
  assert.ok(g.e.credits >= g.cost('drone').credits);
  assert.ok(g.buy('drone'));
  const before = g.e.earned;
  advance(g, 3600);
  assert.ok(g.e.earned > before + 1000);
  assert.ok(g.e.electronicScrap < 2);
});
test('recipes conserve materials and respect buffer backpressure', () => {
  const g = new OrbitalGame(0, 123);
  g.e.levels.electronics = 1;
  g.reserve('alloy', 150);
  g.reserve('circuits', 150);
  g.e.metal = 4;
  g.e.electronicScrap = 4;
  advance(g, 1);
  assert.equal(g.e.metal + g.e.alloy * 2, 4);
  assert.equal(g.e.electronicScrap + g.e.circuits * 2, 4);
  assert.equal(g.e.salvage[0], 1);
  g.e.alloy = 150;
  g.e.circuits = 150;
  g.e.metal = 150;
  g.e.electronicScrap = 150;
  g.e.salvage = [150, 0, 0];
  const inventory = structuredClone(g.e);
  advance(g, 30);
  assert.deepEqual(g.e, inventory);
  g.reserve('alloy', 0);
  g.reserve('circuits', 0);
  advance(g, 10);
  assert.ok(g.e.credits > 0);
  assert.ok(g.e.salvage[0] < 150);
});
test('upgrade prices, caps, production rates and material reservations are enforced', () => {
  const g = funded();
  for (const key of MACHINE_KEYS) {
    const rate = g.rate(key);
    while (g.e.levels[key] < 10) assert.ok(g.buy(key));
    assert.ok(g.rate(key) >= rate);
    assert.equal(g.buy(key), false);
  }
  g.reserve('alloy', Infinity);
  assert.equal(g.e.reserves.alloy, 5);
  g.reserve('alloy', 999999);
  assert.equal(g.e.reserves.alloy, g.capacity);
  g.reserve('circuits', -1);
  assert.equal(g.e.reserves.circuits, 0);
});
test('24-hour catch-up equals 86400 live seconds, reload cannot double-claim and backwards clocks grant nothing', () => {
  const online = new OrbitalGame(1000, 789),
    offline = new OrbitalGame(1000, 789);
  online.e.levels.electronics = offline.e.levels.electronics = 1;
  for (let second = 1; second <= 86400; second++) online.advance(1000 + second * 1000);
  const summary = offline.advance(1000 + 86400000);
  assert.deepEqual(offline.save(), online.save());
  assert.equal(summary.credited, 86400);
  const reloaded = OrbitalGame.load(offline.save());
  const before = reloaded.save();
  reloaded.advance(before.lastAt);
  reloaded.advance(before.lastAt - 100000);
  assert.deepEqual(reloaded.save(), before);
  const capped = new OrbitalGame(0, 789);
  const capSummary = advance(capped, 86400 * 4);
  assert.equal(capSummary.credited, 86400);
  assert.ok(capSummary.capped);
  assert.equal(capped.state.playedSeconds, 86400);
  assert.equal(advance(capped, 0).credits, 0);
});
test('expedition selection applies next trip, seeded finds survive reload and rare guarantees hold', () => {
  const g = funded();
  assert.ok(g.unlockRegion(1));
  assert.equal(g.state.expedition.region, 0);
  advance(g, 300);
  assert.equal(g.state.expedition.region, 1);
  assert.equal(g.state.expedition.remaining, 900);
  const a = OrbitalGame.load(g.save()),
    b = OrbitalGame.load(g.save());
  advance(a, 1800);
  advance(b, 1800);
  assert.deepEqual(a.save(), b.save());
  for (let region = 0; region < 3; region++) {
    g.state.unlocked = 3;
    g.state.selectedRegion = region;
    g.state.expedition = { region, remaining: 1 };
    g.state.pity[region] = REGIONS[region].pity - 1;
    const before = [...g.state.finds];
    advance(g, 1);
    assert.ok(
      g.state.finds[region * 4 + 2] > before[region * 4 + 2] ||
        g.state.finds[region * 4 + 3] > before[region * 4 + 3],
    );
  }
});
test('restoration consumes one find and costs once, serial queue completes offline and display bonuses never stack', () => {
  const g = funded();
  assert.ok(g.buildBay());
  g.state.finds[0] = 4;
  g.state.seen[0] = true;
  const credits = g.e.credits,
    alloy = g.e.alloy;
  assert.ok(g.queueRestore(0, 'display'));
  assert.equal(g.e.credits, credits - DISCOVERIES[0].restore.credits);
  assert.equal(g.e.alloy, alloy - DISCOVERIES[0].restore.alloy);
  assert.equal(g.queueRestore(0, 'display'), false);
  assert.ok(g.queueRestore(0, 'sell'));
  assert.ok(g.queueRestore(0, 'sell'));
  assert.equal(g.queueRestore(0, 'sell'), false);
  const loaded = OrbitalGame.load(g.save());
  advance(loaded, 120);
  assert.equal(loaded.state.displayed[0], true);
  assert.equal(loaded.bonus, 1.01);
  assert.equal(loaded.state.queue.length, 2);
  advance(loaded, 240);
  assert.equal(loaded.state.queue.length, 0);
  assert.equal(loaded.state.restorations, 3);
  assert.equal(loaded.queueRestore(0, 'display'), false);
  loaded.e.alloy = loaded.e.circuits = 0;
  assert.ok(loaded.dismantle(0));
  assert.equal(loaded.e.alloy, 12);
  assert.equal(loaded.state.seen[0], true);
  assert.equal(loaded.bonus, 1.01);
});
test('full production buffers do not discard discovery stacks, and dismantling requires room', () => {
  const g = new OrbitalGame(0, 123);
  g.e.alloy = g.capacity;
  g.reserve('alloy', g.capacity);
  advance(g, 3600);
  assert.equal(
    g.state.finds.reduce((a, b) => a + b, 0),
    12,
  );
  g.state.finds[0] = 1;
  g.state.seen[0] = true;
  assert.equal(g.dismantle(0), false);
  assert.equal(g.state.finds[0], 1);
});
test('save validation rejects malformed, impossible and incompatible states', () => {
  const g = new OrbitalGame(100, 123);
  advance(g, 800);
  const raw = g.save();
  assert.deepEqual(OrbitalGame.load(JSON.parse(JSON.stringify(raw))).save(), raw);
  for (const broken of [
    { ...raw, version: 2 },
    { ...raw, queue: [null] },
    { ...raw, selectedRegion: 3 },
    { ...raw, pity: [99, 0, 0] },
    { ...raw, seed: -1 },
    { ...raw, economy: { ...raw.economy, alloy: Infinity } },
    { ...raw, finds: [1] },
  ])
    assert.throws(() => OrbitalGame.load(broken));
  const overcap = g.save();
  overcap.economy.alloy = 1e9;
  assert.throws(() => OrbitalGame.load(overcap));
});
test('dock is gated and its permanent bonus applies once', () => {
  const g = funded();
  assert.equal(g.buildDock(), false);
  assert.ok(g.unlockRegion(1));
  assert.ok(g.unlockRegion(2));
  g.e.alloy = 3000;
  g.e.circuits = 1000;
  assert.ok(g.buildDock());
  assert.equal(g.bonus, 1 + CONFIG.dockBonus);
  assert.equal(g.buildDock(), false);
});
