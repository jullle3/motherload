import { test, expect } from '@playwright/test';
import { Game } from '../../src/game';

test('collection opens Deepfield, preserves existing saves, and links back home', async ({
  page,
}, testInfo) => {
  const game = new Game(1);
  game.money = 432;
  await page.addInitScript((save) => {
    if (!localStorage.getItem('deepfield.save.v1'))
      localStorage.setItem('deepfield.save.v1', JSON.stringify(save));
  }, game.save());
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Small games.');
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-launcher.png`,
    fullPage: true,
  });
  const play = page.getByRole('link', { name: 'PLAY DEEPFIELD', exact: false }).last();
  await play.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/games\/deepfield\/$/);
  await expect(page.locator('#start')).toContainText('CONTINUE');
  await page.locator('#start').click();
  await expect(page.locator('#money')).toContainText('432');
  await page.reload();
  await expect(page.locator('#start')).toContainText('CONTINUE');
  await page.getByRole('link', { name: 'ALL GAMES' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('h1')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-launcher-mobile.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
