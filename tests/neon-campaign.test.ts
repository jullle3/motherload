import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, loadSave, recordClear } from '../src/neon/game';
import { pilot } from './neon-pilot';

for (const mode of ['solo', 'coop'] as const) {
  test(`all 15 ${mode} stages can be cleared using normal controls and persist their results`, () => {
    let save = freshSave();
    let seconds = 0,
      livesLost = 0;
    for (let stage = 0; stage < 15; stage++) {
      assert.equal(save[mode].unlocked, Math.min(15, stage + 1));
      // Denser crossover stages need the test player's longer lookahead.
      const horizon =
        mode === 'coop' && stage === 14 ? 60 : mode === 'solo' && [4, 9].includes(stage) ? 48 : 36;
      const { game, ticks, retries } = pilot(stage, mode, horizon);
      assert.equal(game.phase, 'cleared', `${mode} stage ${stage + 1} must be completable`);
      assert.equal(retries, 0);
      assert.equal(game.bubbles.length, 0);
      assert.ok(game.score > 0);
      seconds += ticks / 60;
      livesLost += 3 - game.lives;
      recordClear(save, game);
      save = loadSave(JSON.parse(JSON.stringify(save)));
      assert.ok(save[mode].best[stage]);
    }
    assert.equal(save[mode === 'solo' ? 'coop' : 'solo'].unlocked, 1);
    console.log(
      `Neon Split ${mode}: 15 stages cleared, ${Math.round(seconds)} simulated seconds, ${livesLost} lives lost, progress reloaded after every stage.`,
    );
  });
}
