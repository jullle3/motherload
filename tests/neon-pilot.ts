import { NeonGame, type InputAction, type Mode } from '../src/neon/game';

// Test-only lookahead player. Every action goes through the ordinary simulation.
function copy(game: NeonGame): NeonGame {
  const clone = Object.assign(Object.create(NeonGame.prototype), structuredClone(game)) as NeonGame;
  clone.events = [];
  return clone;
}
export function pilot(stage: number, mode: Mode, horizon = 36) {
  const game = new NeonGame(stage, mode);
  let ticks = 0,
    retries = 0;
  let actions: InputAction[] = game.players.map(() => ({ move: 0, fire: true }));
  const trace: { ticks: number; moves: number[] }[] = [];
  while (ticks < 60 * 180 && game.phase !== 'cleared') {
    if (game.phase === 'over') {
      retries++;
      if (retries > 2) break;
      game.retry();
    }
    if (game.phase === 'playing' && ticks % 9 === 0) {
      let best = -Infinity;
      for (const move1 of [0, -1, 1])
        for (const move2 of mode === 'coop' ? [0, -1, 1] : [0]) {
          const moves = [move1, move2],
            sim = copy(game);
          const input = sim.players.map((_, i) => ({ move: moves[i], fire: true }));
          for (let step = 0; step < horizon && sim.phase === 'playing'; step++)
            sim.step(1 / 60, input);
          let value = (sim.lives - game.lives) * 100000 + (sim.pops - game.pops) * 800;
          if (sim.phase === 'cleared') value += 100000;
          for (const p of sim.players) {
            const distance = Math.min(500, ...sim.bubbles.map((b) => Math.abs(b.x - p.x)));
            value -= distance * 0.3;
            value -= Math.abs(p.x - 480) * 0.015;
            value -= Math.abs(moves[p.id]) * 2;
            value += p.shield ? 60 : 0;
            for (const b of sim.bubbles)
              if (b.y > 390) value -= Math.max(0, 110 - Math.abs(b.x - p.x)) * 0.5;
          }
          if (value > best) {
            best = value;
            actions = input;
          }
        }
      trace.push({ ticks, moves: actions.map((a) => a.move) });
    }
    game.step(1 / 60, actions);
    game.events = [];
    ticks++;
  }
  return { game, ticks, retries, trace };
}
