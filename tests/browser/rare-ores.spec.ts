import { test, expect } from '@playwright/test';
import { Game, WIDTH, ORES } from '../../src/game';

test('mining a diamond reveals its cargo entry and persists across reload', async ({ page }) => {
  const g = new Game(1);
  const index = g.tiles.findIndex((tile, i) => tile.ore === 3 && i > WIDTH);
  expect(index).toBeGreaterThan(WIDTH);
  g.upgrades.drill = 3;
  g.rig.x = (index % WIDTH) + 0.5;
  g.rig.y = Math.floor(index / WIDTH) - 0.5;
  g.dug.add(index - WIDTH);
  await page.addInitScript((save) => {
    if (!localStorage.getItem('deepfield.save.v1'))
      localStorage.setItem('deepfield.save.v1', JSON.stringify(save));
  }, g.save());
  await page.goto('/games/deepfield/');
  await page.locator('#start').click();
  await expect(page.locator('[data-ore="3"]')).toHaveCount(0);
  await page.keyboard.down('s');
  await expect(page.locator('[data-ore="3"]')).toContainText('Diamond');
  await page.keyboard.up('s');
  await expect(page.locator('#toast')).toContainText('Rare find: Diamond');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.reload();
  await page.locator('#start').click();
  await expect(page.locator('[data-ore="3"] b')).toHaveText('1');
});

test('all discovered resources fit the cargo HUD at 720p', async ({ page }, testInfo) => {
  const g = new Game(1);
  g.rig.cargo = ORES.map(() => 1);
  g.discoveredOres = new Set(ORES.map((_, i) => i));
  await page.addInitScript(
    (save) => localStorage.setItem('deepfield.save.v1', JSON.stringify(save)),
    g.save(),
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/games/deepfield/');
  await page.locator('#start').click();
  const hud = await page.locator('.cargo-hud').boundingBox();
  const boxes = await page.locator('[data-ore]').evaluateAll((chips) =>
    chips.map((chip) => {
      const box = chip.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    }),
  );
  expect(boxes).toHaveLength(ORES.length);
  for (const box of boxes) {
    expect(box.x).toBeGreaterThanOrEqual(hud!.x);
    expect(box.x + box.width).toBeLessThanOrEqual(hud!.x + hud!.width);
    expect(box.y + box.height).toBeLessThan(720);
  }
  await page.screenshot({ path: `test-results/${testInfo.project.name}-rare-cargo.png` });
});
