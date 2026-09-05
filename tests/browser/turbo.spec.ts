import { test, expect } from '@playwright/test';
import { Game, WIDTH } from '../../src/game';

test('workshop installs and upgrades turbo, with a readable HUD at 720p', async ({
  page,
}, testInfo) => {
  const g = new Game(1);
  g.money = 4000;
  await page.addInitScript(
    (s) => localStorage.setItem('deepfield.save.v1', JSON.stringify(s)),
    g.save(),
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/games/deepfield/');
  await page.locator('#start').click();
  await expect(page.locator('#dock')).toBeVisible();
  await page.keyboard.press('e');
  const upgrade = page.locator('[data-upgrade="turbo"]');
  await expect(upgrade).toContainText('INSTALL');
  await upgrade.click();
  await expect(page.locator('#turbo-text')).toContainText('0.6 s');
  await expect(upgrade.locator('..')).toContainText('1.2 s burst');
  await page.screenshot({ path: `test-results/${testInfo.project.name}-turbo-workshop.png` });
  await upgrade.click();
  await expect(page.locator('#turbo-text')).toContainText('1.2 s');
  await upgrade.click();
  await expect(page.locator('#turbo-text')).toContainText('2 s');
  await expect(upgrade).toBeDisabled();
  await page.keyboard.press('e');
  await expect(page.locator('#turbo-hud')).toBeVisible();
  const world = await page.locator('.game-shell').boundingBox();
  const hud = await page.locator('#turbo-hud').boundingBox();
  expect(hud!.x).toBeGreaterThanOrEqual(world!.x);
  expect(hud!.y + hud!.height).toBeLessThan(world!.y + world!.height);
});

test('upward mining works and space boosts through blocks before recharging', async ({
  page,
}, testInfo) => {
  const g = new Game(1);
  g.upgrades.turbo = 1;
  g.rig.y = 30.5;
  g.dug.add(30 * WIDTH + 24);
  await page.addInitScript((s) => {
    if (!localStorage.getItem('deepfield.save.v1'))
      localStorage.setItem('deepfield.save.v1', JSON.stringify(s));
  }, g.save());
  await page.goto('/games/deepfield/');
  await page.locator('#start').click();
  await page.keyboard.down('w');
  await expect(page.locator('#depth')).not.toHaveText('300');
  await page.keyboard.up('w');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('deepfield.save.v1')!));
  expect(before.dug.length).toBeGreaterThan(1);
  await page.keyboard.down('w');
  await page.keyboard.down('Space');
  await expect(page.locator('#turbo-text')).toContainText('RECHARGE');
  await page.keyboard.up('Space');
  await page.keyboard.up('w');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('deepfield.save.v1')!));
  expect(before.rig.y - after.rig.y).toBeGreaterThan(4);
  expect(after.dug.length - before.dug.length).toBeGreaterThan(4);
  expect(after.turboCooldown).toBeGreaterThan(0);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-turbo-hud.png` });
  await page.reload();
  await page.locator('#start').click();
  await expect(page.locator('#turbo-hud')).toBeVisible();
  await expect(page.locator('#turbo-text')).toContainText('RECHARGE');
});
