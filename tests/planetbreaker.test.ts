import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlanetGame } from '../src/planetbreaker/game';
import { BOOST_KEYS, KEYS, OFFLINE_CAP, PLANET, layerProgress } from '../src/planetbreaker/config';

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
  assert.deepEqual(g.state.scars[0], g.events[0].point);
  assert.ok(g.events[0].point[2] > 0.99);
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

export function simulate(
  clicks = false,
  policy: 'mixed' | 'efficient' | 'structures' = 'mixed',
  collect = false,
) {
  const g = new PlanetGame();
  let seconds = 0;
  const checkpoints: number[] = [];
  let appearance = 0,
    available = false;
  while (!g.complete && seconds < 30000) {
    if (clicks) {
      g.fire();
      g.tick(0.5);
      g.fire();
      g.tick(0.5);
    } else g.tick(1);
    if (g.state.reward.available && !available) {
      appearance++;
      available = true;
    }
    if (!g.state.reward.available) available = false;
    if (collect && g.state.reward.available && appearance % 2 === 1) g.collectReward();
    seconds++;
    g.events.length = 0;
    if ([300, 900, 1800].includes(seconds)) checkpoints.push(g.fraction);
    if (Math.floor(seconds) % (policy === 'efficient' ? 20 : 60) === 0) {
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
            eligible: policy !== 'structures' && g.state.counts[k] > 0 && g.state.upgrades[k] < 3,
          },
        ])
          .filter((o) => o.eligible && (policy === 'efficient' || o.cost <= g.state.credits))
          .sort((a, b) =>
            policy === 'mixed' ? a.cost - b.cost : a.cost / a.gain - b.cost / b.gain,
          );
        const best = options[0];
        if (!best || best.cost > g.state.credits) break;
        if (best.upgrade) g.upgrade(best.key);
        else g.buy(best.key);
      }
    }
  }
  return { seconds, state: g.state, checkpoints };
}
test('ordinary buying reaches clear milestones and finishes within 35–50 minutes', () => {
  const result = simulate();
  console.log(
    `Planetbreaker automatic balance: ${(result.seconds / 60).toFixed(1)} minutes`,
    result.state.counts,
    result.state.upgrades,
  );
  assert.equal(result.state.damage, PLANET.integrity);
  assert.ok(result.seconds >= 2100 && result.seconds <= 3000);
  assert.ok(result.checkpoints[0] > 0.004);
  assert.ok(result.checkpoints[1] > 0.1);
  assert.ok(result.checkpoints[2] > 0.4);
  const manual = simulate(true);
  console.log(`Planetbreaker manual balance: ${(manual.seconds / 60).toFixed(1)} minutes`);
  assert.ok(manual.seconds < result.seconds);
  const boosted = simulate(false, 'mixed', true);
  console.log(`Occasional rewards: ${(boosted.seconds / 60).toFixed(1)} minutes`);
  assert.ok(boosted.seconds >= 2100 && boosted.seconds <= 3000);
  const efficient = simulate(false, 'efficient'),
    structures = simulate(false, 'structures');
  console.log(
    `Efficient: ${(efficient.seconds / 60).toFixed(1)} minutes; structures only: ${(structures.seconds / 60).toFixed(1)} minutes`,
  );
  assert.ok(efficient.seconds < result.seconds);
  assert.ok(structures.seconds < 90 * 60);
  assert.ok(structures.checkpoints[1] > 0.05);
});

test('reported fleet migrates with all possessions and 9% visible destruction', () => {
  const g = new PlanetGame();
  g.state.counts = { laser: 17, missile: 9, plasma: 2, siege: 0 };
  g.state.damage = 24_000;
  g.state.earned = 24_000;
  g.state.credits = 400;
  g.state.elapsed = 900;
  const { motionTime, autoShots, reward, ...old } = g.save();
  const restored = PlanetGame.restore({ ...old, version: 1 });
  assert.equal(restored.fraction, 0.09);
  assert.equal(restored.baseIncome, 143);
  assert.deepEqual(restored.state.counts, g.state.counts);
  assert.equal(restored.state.credits, 400);
  assert.equal(restored.state.elapsed, 900);
  assert.deepEqual(PlanetGame.restore(restored.save()).state.reward, restored.state.reward);
  const completed = PlanetGame.restore({ ...old, version: 1, damage: 5_000_000 });
  assert.equal(completed.complete, true);
  assert.equal(completed.state.completedAt, 900);
  assert.equal(layerProgress(80_000).name, 'MANTLE');
  assert.equal(layerProgress(880_000).name, 'CORE');
});
test('three reward types are offered before repeats; missed drones cannot pay out', () => {
  const g = new PlanetGame();
  g.tick(45);
  const seen = new Set();
  for (let i = 0; i < 3; i++) {
    const r = g.state.reward;
    assert.ok(r.available);
    seen.add(r.available);
    g.tick(14);
    assert.equal(g.collectReward(), null);
    const delay = r.next;
    assert.ok(delay >= 75 && delay <= 105);
    g.tick(60);
    g.tick(delay - 60);
  }
  assert.equal(seen.size, 3);
});
test('boost multipliers, expiry, auto-fire counts and offline exclusions are exact', () => {
  for (const key of BOOST_KEYS) {
    const g = new PlanetGame();
    g.state.reward.available = key;
    g.state.reward.flyRemaining = 14;
    assert.equal(g.collectReward(), key);
    assert.equal(g.collectReward(), null);
    const reward = structuredClone(g.state.reward);
    assert.equal(g.offline(10), 10);
    assert.deepEqual(g.state.reward, reward);
    g.state.credits = g.state.earned = 0;
    g.tick(30);
    assert.equal(g.state.reward.active, null);
    assert.equal(g.state.manualShots, 0);
    assert.ok(
      Math.abs(g.state.damage - (key === 'overdrive' ? 60 : key === 'autofire' ? 330 : 30)) <
        0.0001,
    );
    assert.ok(
      Math.abs(g.state.credits - (key === 'overdrive' ? 120 : key === 'surge' ? 90 : 330)) < 0.0001,
    );
    if (key === 'autofire') assert.equal(g.state.autoShots, 150);
  }
});
test('reward and damage results are identical across a mid-boost save and reload', () => {
  const a = new PlanetGame();
  a.state.reward.available = 'autofire';
  a.state.reward.flyRemaining = 14;
  a.collectReward();
  a.tick(7.3);
  const b = PlanetGame.restore(a.save());
  a.tick(22.7);
  b.tick(22.7);
  assert.deepEqual(a.save(1), b.save(1));
  assert.throws(() =>
    PlanetGame.restore({ ...a.save(), reward: { ...a.state.reward, remaining: 50 } }),
  );
});
