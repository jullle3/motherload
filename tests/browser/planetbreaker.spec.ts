import { test, expect } from '@playwright/test';
import { PlanetGame } from '../../src/planetbreaker/game';
import { PLANET, SAVE_KEY } from '../../src/planetbreaker/config';

test('Planetbreaker starts, fires, buys, upgrades, saves and links home', async ({
  page,
}, info) => {
  const g = new PlanetGame();
  g.offline(1000);
  await page.addInitScript(
    ({ key, save }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save));
    },
    { key: SAVE_KEY, save: g.save() },
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/games/planetbreaker/');
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await page.locator('#buy-laser').click();
  await expect(page.locator('#count-laser')).toHaveText('× 2');
  await page.locator('#upgrade-laser').click();
  await expect(page.locator('#tier-laser')).toHaveText('TIER 2 / 4');
  await page.locator('#fire').click();
  await page.locator('#fullscreen').click();
  if (await page.evaluate(() => !!document.fullscreenElement))
    await page.locator('#fullscreen').click();
  await page.reload();
  await expect(page.locator('#count-laser')).toHaveText('× 2');
  await page.screenshot({
    path: `test-results/${info.project.name}-planetbreaker-pristine.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByLabel('Reduced motion & flashes').check();
  await page.getByLabel('Lower effects quality').check();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('link', { name: 'ALL GAMES' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('link', { name: 'PLAY PLANETBREAKER', exact: false }).last(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
for (const [name, fraction] of [
  ['scarred', 0.18],
  ['fractured', 0.48],
  ['core', 0.82],
  ['complete', 1],
] as const) {
  test(`Planetbreaker ${name} surface renders and restores`, async ({ page }, info) => {
    const g = new PlanetGame();
    g.offline(80000);
    g.state.counts = { laser: 8, missile: 5, plasma: 3, siege: 2 };
    for (let i = 0; i < 12; i++) {
      g.tick(10);
      g.events.length = 0;
    }
    g.state.damage = PLANET.integrity * fraction;
    if (fraction === 1) g.state.completedAt = g.state.elapsed;
    await page.addInitScript(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), {
      key: SAVE_KEY,
      save: g.save(),
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('/games/planetbreaker/');
    await expect(page.locator('canvas')).toBeVisible();
    await page.waitForTimeout(fraction === 1 ? 8000 : 1600);
    await page.screenshot({
      path: `test-results/${info.project.name}-planetbreaker-${name}.png`,
      fullPage: true,
    });
    if (fraction === 1) {
      await expect(page.locator('#complete')).toBeVisible();
      await page.locator('#replay').click();
      await page.locator('#confirm-reset').click();
      await expect(page.locator('#complete')).toBeHidden();
      await expect(page.locator('#count-laser')).toHaveText('× 1');
    }
    expect(errors).toEqual([]);
  });
}
test('a second tab cannot run the same saved fleet', async ({ page, context }) => {
  await page.goto('/games/planetbreaker/');
  await expect(page.locator('#game')).toBeVisible();
  const second = await context.newPage();
  await second.goto('/games/planetbreaker/');
  await expect(second.locator('#lock')).toBeVisible();
  await page.close();
  await second.locator('#reconnect').click();
  await expect(second.locator('#game')).toBeVisible();
});

test('offline credits are claimed once without offline damage', async ({ page }) => {
  const g = new PlanetGame();
  g.state.damage = 1000;
  await page.addInitScript(
    ({ key, save }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save));
    },
    { key: SAVE_KEY, save: g.save(Date.now() - 3600_000) },
  );
  await page.goto('/games/planetbreaker/');
  await expect(page.locator('#game')).toBeVisible();
  const first = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(first.credits).toBeGreaterThanOrEqual(3600);
  expect(first.damage).toBe(1000);
  await page.reload();
  await expect(page.locator('#game')).toBeVisible();
  const second = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(second.credits - first.credits).toBeLessThan(20);
  expect(second.damage - first.damage).toBeLessThan(10);
});

test('storage failure remains playable and reset leaves other game saves intact', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('deepfield.save.v1', 'keep-me');
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'planetbreaker.save.v1')
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await page.goto('/games/planetbreaker/');
  await expect(page.locator('#warning')).toContainText('session-only');
  await page.locator('#fire').click();
  await page.locator('#settings').click();
  await page.locator('#reset-run').click();
  await page.locator('#confirm-reset').click();
  expect(await page.evaluate(() => localStorage.getItem('deepfield.save.v1'))).toBe('keep-me');
  await expect(page.locator('#count-laser')).toHaveText('× 1');
});

test('hidden tabs earn income and resume without extra damage', async ({ page }) => {
  await page.clock.install();
  await page.goto('/games/planetbreaker/');
  await expect(page.locator('#game')).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const before = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  await page.clock.fastForward(60_000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const after = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(after.damage).toBe(before.damage);
  expect(after.credits - before.credits).toBeCloseTo(60, 0);
});

test.describe('phone layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('planet, touch targeting, and arsenal fit a narrow screen', async ({ page }, info) => {
    await page.goto('/games/planetbreaker/');
    await expect(page.locator('canvas')).toBeVisible();
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;
    await canvas.tap({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect(page.locator('#credits')).not.toHaveText('0');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({
      path: `test-results/${info.project.name}-planetbreaker-mobile.png`,
      fullPage: true,
    });
    const frames = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const start = performance.now();
          let count = 0;
          function frame(t: number) {
            count++;
            if (t - start > 2000) resolve(count);
            else requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        }),
    );
    console.log(`Planetbreaker phone render: ${frames / 2} fps`);
    expect(frames).toBeGreaterThan(10);
    await page.locator('#fire').tap();
  });
});
