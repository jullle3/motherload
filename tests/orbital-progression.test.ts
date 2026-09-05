import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runStation } from './orbital-pilot';
for (const hours of [2, 4, 8, 24]) {
  test(`station progression remains funded with visits every ${hours} hours`, () => {
    const run = runStation(hours, 100 + hours);
    assert.ok(run.game.state.dock);
    assert.ok(run.milestones.firstUpgrade <= 60);
    assert.ok(run.milestones.bay <= 900);
    if (hours <= 8) {
      assert.ok(run.milestones.dock >= 48 * 3600);
      assert.ok(run.milestones.dock <= 96 * 3600);
    }
    if (hours === 2) {
      assert.ok(run.milestones.region2 >= 4 * 3600 && run.milestones.region2 <= 8 * 3600);
      assert.ok(run.milestones.region3 >= 18 * 3600 && run.milestones.region3 <= 30 * 3600);
    }
    assert.ok(run.game.e.credits >= 0);
    console.log(
      `Orbital ${hours}h visits: regions at ${(run.milestones.region2 / 3600).toFixed(1)}h / ${(run.milestones.region3 / 3600).toFixed(1)}h; dock ${(run.milestones.dock / 3600).toFixed(1)}h. Reloaded between visits.`,
    );
  });
}
