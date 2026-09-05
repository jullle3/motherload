import { OrbitalGame } from './game';
export const SAVE_KEY = 'orbital-scrapyard.save.v1';
export const SETTINGS_KEY = 'orbital-scrapyard.settings.v1';
export class StationStore {
  protectedOriginal = false;
  notice = '';
  read(now = Date.now()) {
    let raw: string | null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch {
      this.notice =
        'Saving unavailable. This station lasts for this session; export a backup before leaving.';
      return new OrbitalGame(now);
    }
    if (!raw) return new OrbitalGame(now);
    try {
      return OrbitalGame.load(JSON.parse(raw));
    } catch {
      this.protectedOriginal = true;
      this.notice =
        'Your saved file could not be read. The original is preserved. This is a temporary station; export it or explicitly replace the old save in Settings.';
      return new OrbitalGame(now);
    }
  }
  write(game: OrbitalGame, replace = false) {
    if (this.protectedOriginal && !replace) return false;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(game.save()));
      this.protectedOriginal = false;
      this.notice = '';
      return true;
    } catch {
      this.notice =
        'Saving unavailable. This station lasts for this session; export a backup before leaving.';
      return false;
    }
  }
  export(game: OrbitalGame) {
    return JSON.stringify(game.save(), null, 2);
  }
  import(text: string, now = Date.now()) {
    if (text.length > 1000000) throw new Error('Save file is too large.');
    const game = OrbitalGame.load(JSON.parse(text));
    game.state.lastAt = now;
    game.state.carryMs = 0;
    return game;
  }
}
