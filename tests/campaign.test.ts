import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, NO_INPUT, WIDTH, HEIGHT, UPGRADES, type Input } from '../src/game';

// A conservative pilot uses vertical shafts and returns before fuel or hull runs out.
// It earns every credit and purchases upgrades through the actual simulation API.
for (const seed of [12, 47, 123])
  test(`campaign ${seed} can fund its upgrades and recover the relic without cheats`, () => {
    let g = new Game(seed),
      trips = 0;
    const step = (input: Partial<Input>) => {
      g.step(1 / 60, { ...NO_INPUT, ...input });
      assert.ok(!g.events.some((e) => e.type === 'rescue'), 'pilot must return safely');
      g.events = [];
    };
    const until = (done: () => boolean, input: Partial<Input>, limit = 18000) => {
      let i = 0;
      while (!done() && i++ < limit) step(input);
      assert.ok(done(), 'navigation must complete');
    };
    const surface = () => {
      until(() => g.rig.y < -2, { up: true });
      until(() => Math.abs(g.rig.x - 20.5) < 0.06, {
        up: true,
        left: g.rig.x > 20.5,
        right: g.rig.x < 20.5,
      });
      until(() => g.atSurface, {});
      g.sell();
    };
    while (!g.won && trips++ < 100) {
      if (g.atSurface) {
        if (g.money >= UPGRADES.drill.costs[g.upgrades.drill]) g.buy('drill');
        for (const key of ['cargo', 'fuel', 'hull'] as const)
          if (g.upgrades[key] < 2 && g.money >= UPGRADES[key].costs[g.upgrades[key]] + 200)
            g.buy(key);
        g.service();
      }
      const candidates = Array.from({ length: 26 }, (_, i) => 22 + i)
        .map((x) => {
          let y = 0;
          while (y < HEIGHT && g.dug.has(y * WIDTH + x)) y++;
          return { x, y };
        })
        .filter((p) => p.y < HEIGHT && g.tiles[p.y * WIDTH + p.x].hardness <= g.upgrades.drill);
      candidates.sort((a, b) => b.y - a.y || Math.abs(a.x - 24) - Math.abs(b.x - 24));
      assert.ok(candidates.length);
      const x = candidates[0].x + 0.5;
      until(() => g.rig.y < -2, { up: true });
      until(() => Math.abs(g.rig.x - x) < 0.06, {
        up: true,
        left: g.rig.x > x,
        right: g.rig.x < x,
      });
      let elapsed = 0;
      do {
        step({ down: true });
        elapsed += 1 / 60;
      } while (
        elapsed < 240 &&
        !g.rig.relic &&
        !/tier|Cargo full/.test(g.warning) &&
        g.rig.hull > 45 &&
        g.rig.fuel > (Math.max(0, g.rig.y) / 4.5) * 0.85 + 12
      );
      surface();
      // Save/reload every expedition to exercise persistence throughout progression.
      g = Game.load(JSON.parse(JSON.stringify(g.save())));
    }
    assert.ok(g.won, 'campaign objective must be achievable');
    console.log(
      `Campaign pilot: ${trips} expeditions, ${(g.seconds / 60).toFixed(1)} simulated minutes, ${g.dug.size} blocks, drill tier ${g.upgrades.drill + 1}.`,
    );
  });
