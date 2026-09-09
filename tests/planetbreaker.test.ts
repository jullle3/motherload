import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlanetGame } from '../src/planetbreaker/game';
import { KEYS, OFFLINE_CAP, PLANET } from '../src/planetbreaker/config';

test('automatic attacks earn credits, purchases deduct the preview price, upgrades double output', () => {
  const g = new PlanetGame();
  g.tick(2);
  assert.equal(g.state.credits, 2);
  assert.equal(g.state.damage, 2);
  assert.equal(g.buy('missile'), false);
  g.offline(500);
  const cost = g.cost('laser'),
    credits = g.state.credits;
  assert.equal(g.buy('laser'), true);
  assert.equal(g.state.credits, credits - cost);
  const output = g.income;
  assert.equal(g.upgrade('laser'), true);
  assert.equal(g.income, output * 2);
});
test('manual shots are optional, targeted, and limited to five per second', () => {
  const g = new PlanetGame();
  assert.equal(g.fire([0, 0, 1]), true);
  assert.equal(g.fire(), false);
  assert.deepEqual(g.state.scars[0], [0, 0, 1]);
  g.tick(0.2);
  assert.equal(g.fire(), true);
  assert.equal(g.state.manualShots, 2);
});
test('simulation and saved damage are deterministic across a reload', () => {
  const a = new PlanetGame();
  a.tick(23);
  const b = PlanetGame.restore(a.save(1000));
  a.tick(37);
  b.tick(37);
  assert.deepEqual(a.save(2000), b.save(2000));
});
test('offline production is capped, never damages the planet, and ignores negative elapsed time', () => {
  const g = new PlanetGame();
  g.tick(4);
  const damage = g.state.damage;
  assert.equal(g.offline(OFFLINE_CAP * 2), OFFLINE_CAP);
  assert.equal(g.state.damage, damage);
  assert.equal(g.offline(-10), 0);
  assert.equal(g.offline(NaN), 0);
});
test('completion caps damage and payouts, stops production, and restores correctly', () => {
  const g = new PlanetGame();
  g.state.damage = PLANET.integrity - 1;
  g.tick(2);
  assert.equal(g.state.damage, PLANET.integrity);
  assert.equal(g.state.credits, 1);
  assert.equal(g.complete, true);
  const save = g.save(10);
  g.tick(60);
  assert.equal(g.offline(100), 0);
  assert.equal(g.fire(), false);
  assert.equal(g.buy('laser'), false);
  assert.deepEqual(g.save(10), save);
  assert.equal(PlanetGame.restore(save).complete, true);
});
test('save validation rejects corrupt state and impossible fleet data', () => {
  const valid = new PlanetGame().save();
  for (const patch of [
    { credits: NaN },
    { damage: -1 },
    { random: 0 },
    { counts: {} },
    { scars: [[0, 0, 0]] },
    { completedAt: 0 },
    { upgrades: { laser: 9 } },
  ])
    assert.throws(() => PlanetGame.restore({ ...valid, ...patch }));
});
test('scar and event buffers stay bounded under a large fleet', () => {
  const g = new PlanetGame();
  for (const k of KEYS) g.state.counts[k] = 100;
  for (let i = 0; i < 100; i++) g.tick(60);
  assert.ok(g.events.length <= 48);
  assert.ok(g.state.scars.length <= 96);
  assert.ok(g.state.surfaceDamage.some((n) => n > 0));
  assert.deepEqual(PlanetGame.restore(g.save()).state.surfaceDamage, g.state.surfaceDamage);
});

export function simulate(clicks = false) {
  const g = new PlanetGame();
  let seconds = 0;
  while (!g.complete && seconds < 30000) {
    g.tick(1);
    if (clicks) {
      g.fire();
      g.tick(0.2);
      g.fire();
      seconds += 0.2;
    }
    seconds++;
    g.events.length = 0;
    if (Math.floor(seconds) % 20 === 0) {
      // Spend on the available purchase with the shortest payback period.
      for (let i = 0; i < 30; i++) {
        const options = KEYS.flatMap((k) => [
          {
            key: k,
            upgrade: false,
            cost: g.cost(k),
            gain: g.power(k) / { laser: 2, missile: 4, plasma: 5, siege: 8 }[k],
            eligible: g.unlocked(k) && g.state.counts[k] < 100,
          },
          {
            key: k,
            upgrade: true,
            cost: g.upgradeCost(k),
            gain: g.rate(k),
            eligible: g.state.counts[k] > 0 && g.state.upgrades[k] < 3,
          },
        ])
          .filter((o) => o.eligible)
          .sort((a, b) => a.cost / a.gain - b.cost / b.gain);
        const best = options[0];
        if (!best || best.cost > g.state.credits) break;
        if (best.upgrade) g.upgrade(best.key);
        else g.buy(best.key);
      }
    }
  }
  return { seconds, state: g.state };
}
test('regular purchasing completes the first planet in 60–120 minutes without manual shots', () => {
  const result = simulate();
  console.log(
    `Planetbreaker automatic balance: ${(result.seconds / 60).toFixed(1)} minutes`,
    result.state.counts,
    result.state.upgrades,
  );
  assert.equal(result.state.damage, PLANET.integrity);
  assert.ok(result.seconds >= 3600 && result.seconds <= 7200);
  const manual = simulate(true);
  console.log(`Planetbreaker manual balance: ${(manual.seconds / 60).toFixed(1)} minutes`);
  assert.ok(manual.seconds < result.seconds);
});
