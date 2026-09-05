import { OrbitalGame } from '../src/orbital/game';
import { CONFIG, REGIONS, type Cost } from '../src/orbital/config';
export function runStation(visitHours = 4, seed = 123) {
  let game = new OrbitalGame(0, seed);
  let elapsed = 0;
  const milestones: Record<string, number> = {};
  const log: string[] = [];
  const prepare = (cost: Cost) => {
    while (game.capacity < Math.max(cost.alloy, cost.circuits) && game.buy('storage')) {
      /* Expand to hold the goal. */
    }
    if (game.capacity > Math.max(cost.alloy, cost.circuits)) game.reserveFor(cost);
  };
  while (elapsed < 7 * 86400 && !game.state.dock) {
    elapsed += elapsed < 1800 ? 60 : visitHours * 3600;
    game.advance(elapsed * 1000);
    if (!game.e.levels.drone && game.buy('drone')) milestones.firstUpgrade ??= elapsed;
    if (!game.state.bay) {
      prepare(CONFIG.bayCost);
      if (game.buildBay()) milestones.bay ??= elapsed;
    }
    if (!game.e.levels.electronics) game.buy('electronics');
    const goal =
      game.state.unlocked < 3
        ? REGIONS[game.state.unlocked]
        : { milestone: CONFIG.dockMilestone, cost: CONFIG.dockCost };
    if (game.e.earned >= goal.milestone * 0.4) prepare(goal.cost);
    if (game.state.unlocked < 3) {
      if (game.unlockRegion(game.state.unlocked)) {
        milestones[`region${game.state.unlocked}`] = elapsed;
        log.push(`Region ${game.state.unlocked} at ${(elapsed / 3600).toFixed(1)}h`);
      }
    } else if (game.buildDock()) milestones.dock = elapsed;
    // Reserve enough cash for an imminent route, otherwise improve the limiting machine.
    const budgetFloor = game.e.earned >= goal.milestone * 0.7 ? goal.cost.credits : 0;
    for (let n = 0; n < 30; n++) {
      const bottleneck = game.bottleneck().machine;
      if (
        game.e.levels[bottleneck] >= 10 ||
        game.e.credits - game.cost(bottleneck).credits < budgetFloor ||
        !game.buy(bottleneck)
      )
        break;
    }
    game = OrbitalGame.load(JSON.parse(JSON.stringify(game.save())));
  }
  return { game, milestones, elapsed, log };
}
