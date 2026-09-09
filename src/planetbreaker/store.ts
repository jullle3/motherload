import { SAVE_KEY } from './config';
import { PlanetGame } from './game';
export class PlanetStore {
  warning = '';
  invalid = false;
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        try {
          return PlanetGame.restore(JSON.parse(raw));
        } catch {
          this.invalid = true;
          this.warning =
            'Your existing save could not be read. It is preserved. Reset it in settings to save a new run.';
        }
      }
    } catch {
      this.warning = 'Storage is unavailable. This run is session-only.';
    }
    return new PlanetGame();
  }
  save(game: PlanetGame) {
    if (this.invalid) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(game.save()));
    } catch {
      this.warning = 'Storage is unavailable. This run is session-only.';
    }
  }
}
