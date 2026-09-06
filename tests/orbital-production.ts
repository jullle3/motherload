// Run against `npm run preview -- --port 4175`.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { OrbitalGame } from '../src/orbital/game';
import { SAVE_KEY } from '../src/orbital/store';

const station = new OrbitalGame(Date.now() - 86400000, 42);
for (const key of Object.keys(station.e.levels) as (keyof typeof station.e.levels)[])
  station.e.levels[key] = 10;
station.state.unlocked = 3;
station.state.selectedRegion = 2;
station.state.expedition = { region: 2, remaining: 1800 };
station.state.bay = station.state.dock = true;
station.state.seen.fill(true);
station.state.displayed.fill(true);
const before = performance.now();
station.advance();
console.log(`Expanded 24-hour catch-up: ${(performance.now() - before).toFixed(1)} ms`);
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), {
      key: SAVE_KEY,
      save: station.save(),
    });
    await page.goto('http://127.0.0.1:4175/');
    for (const game of ['deepfield', 'neon-split', 'orbital-scrapyard']) {
      assert.ok(await page.locator(`a[href="/games/${game}/"]`).count());
      const response = await page.request.get(`http://127.0.0.1:4175/games/${game}/`);
      assert.equal(response.status(), 200);
    }
    await page.locator('a[href="/games/orbital-scrapyard/"]').first().click();
    await page.locator('#world canvas').waitFor();
    assert.ok(await page.locator('#station-app').isVisible());
    await page.screenshot({
      path: `test-results/${channel}-orbital-production.png`,
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      `${channel}: production homepage, all game deep links, expanded Orbital renderer passed`,
    );
  } finally {
    await browser.close();
  }
}
