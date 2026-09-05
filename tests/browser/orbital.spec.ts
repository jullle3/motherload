import { test, expect } from '@playwright/test';
import { OrbitalGame } from '../../src/orbital/game';
import { SAVE_KEY } from '../../src/orbital/store';
function fixture(expanded = false) {
  const g = new OrbitalGame(Date.now(), 12345);
  g.e.credits = g.e.earned = expanded ? 10000000 : 10000;
  g.e.levels.storage = expanded ? 10 : 2;
  g.e.levels.electronics = 1;
  g.e.alloy = 100;
  g.e.circuits = 40;
  g.e.reserves = { alloy: 100, circuits: 40 };
  g.state.finds[0] = 2;
  g.state.seen[0] = true;
  if (expanded) {
    for (const key of Object.keys(g.e.levels) as (keyof typeof g.e.levels)[]) g.e.levels[key] = 10;
    g.state.bay = g.state.dock = true;
    g.state.unlocked = 3;
    g.state.selectedRegion = 2;
    g.state.expedition = { region: 2, remaining: 1800 };
    g.state.finds.fill(2);
    g.state.seen.fill(true);
    g.state.displayed.fill(true);
  }
  return g.save();
}
test('station upgrades, restores finds and grants offline results only once', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    ({ key, save }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save));
      const realNow = Date.now;
      let offset = 0;
      Date.now = () => realNow() + offset;
      (window as unknown as { jump: (seconds: number) => void }).jump = (seconds) => {
        offset += seconds * 1000;
        document.dispatchEvent(new Event('visibilitychange'));
      };
    },
    { key: SAVE_KEY, save: fixture() },
  );
  await page.goto('/games/orbital-scrapyard/');
  await expect(page.locator('#station-app')).toBeVisible();
  await expect(page.locator('#world canvas')).toBeVisible();
  await page.locator('.machine-shortcuts [data-machine="drone"]').click();
  await page.locator('[data-buy="drone"]').click();
  await expect(page.locator('.level')).toContainText('LEVEL 1');
  await page.locator('.machine-shortcuts [data-machine="bay"]').click();
  await page.locator('[data-build="bay"]').click();
  await page.locator('.tabs [data-tab="collection"]').click();
  await expect(page.locator('[data-discovery="1"]')).toBeDisabled();
  await page.locator('[data-discovery="0"]').click();
  await page.locator('[data-restore="0"][data-destination="display"]').click();
  await page.evaluate(() => (window as unknown as { jump: (n: number) => void }).jump(180));
  await expect(page.locator('#dialog')).toBeVisible();
  await expect(page.locator('#dialog')).toContainText('1 restorations completed');
  await page.locator('#return-close').click();
  await expect(page.locator('#bonus')).toHaveText('+1%');
  const before = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  await page.reload();
  await expect(page.locator('#dialog')).not.toBeVisible();
  const after = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(after.restorations).toBe(before.restorations);
  expect(after.trips).toBe(before.trips);
  await page.screenshot({
    path: `test-results/${info.project.name}-orbital-station.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test('only one tab can write the station and another can reconnect after it closes', async ({
  page,
  context,
}) => {
  await page.goto('/games/orbital-scrapyard/');
  await expect(page.locator('#station-app')).toBeVisible();
  const other = await context.newPage();
  await other.goto('/games/orbital-scrapyard/');
  await expect(other.locator('#lock-screen')).toBeVisible();
  await expect(other.locator('#station-app')).toBeHidden();
  await page.close();
  await other.locator('#reconnect').click();
  await expect(other.locator('#station-app')).toBeVisible();
  await other.close();
});
test('save export, import preview, cancellation and replacement protect current progress', async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, save }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save));
    },
    { key: SAVE_KEY, save: fixture() },
  );
  await page.goto('/games/orbital-scrapyard/');
  await expect(page.locator('#station-app')).toBeVisible();
  await page.locator('#settings').click();
  const download = page.waitForEvent('download');
  await page.locator('#export').click();
  expect((await download).suggestedFilename()).toBe('orbital-scrapyard-save.json');
  const imported = fixture(true);
  imported.economy.credits = 123456;
  imported.lastAt = 0;
  const file = {
    name: 'station.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(imported)),
  };
  await page.locator('#import-file').setInputFiles(file);
  await expect(page.locator('#dialog')).toContainText('123,456 credits');
  await page.locator('#cancel-import').click();
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).unlocked, SAVE_KEY),
  ).toBe(1);
  await page.locator('#import-file').setInputFiles(file);
  await page.locator('#confirm-import').click();
  await expect(page.locator('#credits')).toContainText('123,456');
  await expect(page.locator('#bonus')).not.toHaveText('+0%');
  await expect(page.locator('#dialog')).not.toBeVisible();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(saved.unlocked).toBe(3);
  expect(saved.lastAt).toBeGreaterThan(Date.now() - 10000);
  expect(saved.playedSeconds).toBe(imported.playedSeconds);
  await page
    .locator('#import-file')
    .setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"version":99}'),
    });
  await expect(page.locator('#toast')).toContainText('Import failed');
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).unlocked, SAVE_KEY),
  ).toBe(3);
});
test('corrupt originals are preserved and unavailable storage allows play and export', async ({
  page,
}) => {
  await page.addInitScript((key) => localStorage.setItem(key, '{broken'), SAVE_KEY);
  await page.goto('/games/orbital-scrapyard/');
  await expect(page.locator('#notice')).toContainText('original is preserved');
  await page.waitForTimeout(1100);
  expect(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toBe('{broken');
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('Unavailable');
    };
    Storage.prototype.setItem = () => {
      throw new Error('Unavailable');
    };
  });
  await page.reload();
  await expect(page.locator('#notice')).toContainText('Saving unavailable');
  const download = page.waitForEvent('download');
  await page.locator('#export-footer').click();
  expect((await download).suggestedFilename()).toBe('orbital-scrapyard-save.json');
});
test('expanded station fits phones and all management controls are reachable', async ({
  page,
}, info) => {
  await page.addInitScript(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), {
    key: SAVE_KEY,
    save: fixture(true),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/games/orbital-scrapyard/');
  await expect(page.locator('#station-app')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({
    path: `test-results/${info.project.name}-orbital-phone.png`,
    fullPage: true,
  });
  await page.locator('.tabs [data-tab="expeditions"]').click();
  await expect(page.locator('#panel')).toContainText('Alien Graveyard');
  await page.locator('.tabs [data-tab="collection"]').click();
  await page.locator('[data-discovery="11"]').click();
  await expect(page.locator('#panel')).toContainText('The first voyager');
  await page.locator('.machine-shortcuts [data-machine="market"]').click();
  await page.locator('[data-reserve="alloy"]').fill('50');
  await page.locator('[data-reserve="alloy"]').press('Tab');
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).economy.reserves.alloy,
      SAVE_KEY,
    ),
  ).toBe(50);
  await page.locator('#settings').click();
  await page.locator('#low-setting').check();
  await page.locator('#motion-setting').check();
  await page.locator('#close-dialog').click();
  await page.locator('.machine-shortcuts [data-machine="dock"]').click();
  await expect(page.locator('#panel')).toContainText('DOCK OPERATIONAL');
});
