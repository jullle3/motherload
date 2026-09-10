import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEYS } from '../src/planetbreaker/config';
import { PlanetGame } from '../src/planetbreaker/game';
import {
  aimFor,
  crustPresent,
  length,
  lerp,
  muzzle,
  solid,
  toLocal,
  toWorld,
  trace,
  type Point,
  type Trajectory,
} from '../src/planetbreaker/targeting';

function clear(path: Trajectory, fraction: number, angle: number, speed: number) {
  for (let i = 0; i < path.path.length - 1; i++) {
    const p = lerp(path.path[i], path.path[i + 1], 0.5),
      t = (i + 0.5) / (path.path.length - 1);
    assert.ok(
      !solid(toLocal(p, angle + speed * path.duration * t), fraction),
      `Path enters solid planet at ${i}/${path.path.length} (${fraction})`,
    );
  }
  const endpoint = path.path.at(-1)!;
  const expected = toWorld(path.contact, angle + speed * path.duration);
  assert.ok(Math.hypot(...endpoint.map((n, i) => n - expected[i])) < 1e-7);
}
test('straight, far-side, limb, rotating, and curved shots stop at their first contact', () => {
  const source: Point = [0, 0, 8];
  for (const aim of [
    [0, 0, -5],
    [1.75, 0, 0],
    [-1, 1, 0],
  ] as Point[])
    for (const curved of [false, true]) {
      const path = trace(source, aim, 0, 0.6, 0.035, 1.1, curved);
      assert.ok(path);
      clear(path, 0, 0.6, 0.035);
      assert.ok(path.path.at(-1)![2] > 0);
      assert.ok(Math.abs(path.radius - 1.8) < 0.00001);
    }
});
test('every satellite phase has clear trajectories into remaining crust or exposed core', () => {
  let coreHits = 0;
  for (const fraction of [0, 0.35, 0.65, 0.85, 0.99])
    for (const time of [0, 15, 60, 180])
      for (const key of KEYS)
        for (let i = 0; i < 3; i++) {
          const source = muzzle(key, i, time);
          assert.ok(length(source) > 1.9);
          const path = trace(
            source,
            aimFor(source, 0.3 + i * 0.2, 0.37),
            fraction,
            time * 0.035,
            0.035,
            key === 'missile' ? 1.1 : key === 'siege' ? 0.65 : 0.32,
            key === 'missile',
          );
          assert.ok(path);
          clear(path, fraction, time * 0.035, 0.035);
          if (path.radius < 1.4) coreHits++;
          else assert.ok(crustPresent(path.point, fraction) || path.radius > 1.7999);
        }
  assert.ok(coreHits > 20);
});
test('manual opposite-side requests resolve on the near side; misses do not earn credits', () => {
  const g = new PlanetGame();
  assert.equal(g.fireRay([0, 0, 8], [0, 0, -8]), true);
  assert.ok(g.events[0].path.at(-1)![2] > 0);
  assert.deepEqual(g.state.scars[0], g.events[0].point);
  g.tick(0.2);
  const before = g.state.credits;
  assert.equal(g.fireRay([0, 0, 8], [20, 20, 8]), false);
  assert.equal(g.state.credits, before);
});
test('simulation chooses emitters and paths, and rendering limits never change earnings', () => {
  const a = new PlanetGame(),
    b = new PlanetGame();
  a.state.counts.missile = b.state.counts.missile = 7;
  for (let i = 0; i < 40; i++) {
    a.tick(1);
    a.events.length = 0;
    b.tick(1);
  }
  assert.deepEqual(a.save(0), b.save(0));
  for (const e of b.events) {
    clear(e, 0, e.launchedAt * 0.035, 0.035);
    assert.equal(e.source.length, 3);
    assert.ok(e.emitter >= 0 && e.emitter < 3);
  }
});
