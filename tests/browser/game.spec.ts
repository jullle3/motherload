import { test, expect } from '@playwright/test';
import { Game, WIDTH, RELIC } from '../../src/game';
test('canceling a new world preserves the save; menus retain keyboard focus', async ({ page }) => {
  const g = new Game(123);
  g.money = 777;
  await page.addInitScript((s) => {
    if (!localStorage.getItem('deepfield.save.v1'))
      localStorage.setItem('deepfield.save.v1', JSON.stringify(s));
  }, g.save());
  await page.goto('/');
  await page.locator('#new').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#start')).toContainText('CONTINUE');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('deepfield.save.v1')!).money),
  ).toBe(777);
  await page.locator('#start').click();
  await expect(page.locator('#money')).toContainText('777');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#overlay')).toBeHidden();
  await page.locator('#options summary').click();
  await page.locator('#new-game').click();
  await page.locator('#cancel-new').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#confirm-new')).toBeFocused();
  await page.locator('#confirm-new').click();
  await page.keyboard.press('Escape');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('deepfield.save.v1')!).money),
  ).toBe(0);
});

test('unavailable local storage does not block play', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage blocked', 'SecurityError');
    };
    Storage.prototype.getItem = () => {
      throw new DOMException('Storage blocked', 'SecurityError');
    };
  });
  await page.goto('/');
  await page.locator('#start').click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#save-status')).toContainText('SAVING UNAVAILABLE');
  await expect(page.locator('#overlay')).toBeHidden();
});

test('heavily excavated terrain keeps rendering', async ({ page }, testInfo) => {
  const g = new Game(77);
  for (let i = WIDTH; i < WIDTH * 120; i++) g.dug.add(i);
  g.rig.y = 80.5;
  await page.addInitScript(
    (s) => localStorage.setItem('deepfield.save.v1', JSON.stringify(s)),
    g.save(),
  );
  await page.goto('/');
  await page.locator('#start').click();
  const timing = await page.evaluate(
    () =>
      new Promise<{ frames: number; averageMs: number }>((resolve) => {
        const start = performance.now();
        let frames = 0;
        function count(now: number) {
          frames++;
          if (now - start >= 2000) resolve({ frames, averageMs: (now - start) / frames });
          else requestAnimationFrame(count);
        }
        requestAnimationFrame(count);
      }),
  );
  console.log(`${testInfo.project.name} excavated-world frame timing: ${JSON.stringify(timing)}`);
  expect(timing.frames).toBeGreaterThan(10);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-deep-world.png` });
});
test('launch, mine, return, trade, save, and reload', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: /BEGIN EXPEDITION/ })).toBeVisible();
  await page.screenshot({ path: `test-results/${testInfo.project.name}-title.png` });
  await page.getByRole('button', { name: /BEGIN EXPEDITION/ }).click();
  await expect(page.locator('#dock')).toBeVisible();
  await page.keyboard.down('s');
  await page.waitForTimeout(4000);
  await page.keyboard.up('s');
  await expect(page.locator('#depth')).not.toHaveText('0');
  await page.screenshot({ path: `test-results/${testInfo.project.name}-mining.png` });
  await page.keyboard.down('w');
  await page.waitForTimeout(4000);
  await page.keyboard.up('w');
  // Land on the protected station foundation rather than falling back into our shaft.
  await page.keyboard.down('a');
  await page.waitForTimeout(1250);
  await page.keyboard.up('a');
  await page.waitForTimeout(1800);
  await expect(page.locator('#dock')).toBeVisible();
  await page.keyboard.press('e');
  await expect(page.getByText('Ready for another descent?')).toBeVisible();
  await page.getByRole('button', { name: /REFUEL \+ REPAIR/ }).click();
  await expect(page.locator('#fuel-text')).toHaveText('100 / 100');
  if (await page.locator('#sell').isEnabled()) await page.locator('#sell').click();
  await page.screenshot({ path: `test-results/${testInfo.project.name}-workshop.png` });
  await page.locator('#close-shop').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#overlay')).toBeHidden();
  const raw = await page.evaluate(() => localStorage.getItem('deepfield.save.v1'));
  expect(raw).toBeTruthy();
  expect(JSON.parse(raw!).dug.length).toBeGreaterThan(0);
  await page.reload();
  await page.getByRole('button', { name: /CONTINUE EXPEDITION/ }).click();
  await expect(page.locator('#overlay')).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: `test-results/${testInfo.project.name}-desktop.png` });
  expect(errors).toEqual([]);
});

test('background simulation and autosave continue without animation frames or held keys', async ({
  page,
}) => {
  await page.clock.install();
  const g = new Game(8);
  for (let y = 0; y < 20; y++) g.dug.add(y * WIDTH + 24);
  g.rig.y = 1.5;
  await page.addInitScript((s) => {
    localStorage.setItem('deepfield.save.v1', JSON.stringify(s));
    const original = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      original((time) => {
        if (!document.hidden) callback(time);
      });
  }, g.save());
  await page.goto('/');
  await page.locator('#start').click();
  await page.keyboard.down('w');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    window.dispatchEvent(new Event('blur'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('deepfield.save.v1')!));
  await page.clock.runFor(100);
  await page.clock.fastForward(9500);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('deepfield.save.v1')!));
  expect(after.seconds - before.seconds).toBeGreaterThan(8);
  expect(after.rig.y).toBeGreaterThan(before.rig.y + 5);
  expect(after.rig.fuel).toBe(before.rig.fuel);
  await expect(page.locator('#overlay')).toBeHidden();
  await page.evaluate(() =>
    Object.defineProperty(document, 'hidden', { configurable: true, value: false }),
  );
  await page.keyboard.up('w');
});
test('deep relic recovery survives reload and completes at the surface', async ({ page }) => {
  test.setTimeout(90000);
  const g = new Game(9);
  g.upgrades = { drill: 3, fuel: 3, cargo: 3, hull: 3, turbo: 0 };
  g.rig.fuel = 380;
  g.rig.hull = 320;
  g.rig.x = 24.5;
  g.rig.y = 152.5;
  for (let y = 0; y < 153; y++) g.dug.add(y * WIDTH + 24);
  await page.addInitScript((s) => {
    if (!localStorage.getItem('deepfield.save.v1'))
      localStorage.setItem('deepfield.save.v1', JSON.stringify(s));
  }, g.save());
  await page.goto('/');
  await page.getByRole('button', { name: /CONTINUE EXPEDITION/ }).click();
  await page.keyboard.down('s');
  await page.waitForTimeout(900);
  await page.keyboard.up('s');
  await expect(page.locator('#relic-status')).toContainText('bring it to the surface');
  await page.keyboard.press('Escape');
  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('deepfield.save.v1')!));
  expect(raw.rig.relic).toBe(true);
  expect(raw.dug).toContain(RELIC);
  await page.reload();
  await page.getByRole('button', { name: /CONTINUE EXPEDITION/ }).click();
  await expect(page.locator('#relic-status')).toContainText('bring it to the surface');
  await page.keyboard.down('w');
  await expect(page.locator('#depth')).toHaveText('0', { timeout: 60000 });
  await page.waitForTimeout(900);
  await page.keyboard.down('a');
  await page.waitForTimeout(1200);
  await page.keyboard.up('a');
  await page.keyboard.up('w');
  await expect(page.locator('#relic-status')).toContainText('Relic recovered', {
    timeout: 10000,
  });
});

test('in-game HUD hides the objective and reveals ore only after mining', async ({
  page,
}, testInfo) => {
  const g = new Game(1);
  // Seed 1 has copper in the opening shaft, discovered through normal drilling.
  await page.addInitScript((s) => {
    if (!localStorage.getItem('deepfield.save.v1'))
      localStorage.setItem('deepfield.save.v1', JSON.stringify(s));
  }, g.save());
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.locator('#start').click();
  await expect(page.locator('aside')).toHaveCount(0);
  await expect(page.locator('#relic-status')).toBeHidden();
  await expect(page.locator('#ore-list')).toBeHidden();
  await expect(page.getByText('PRIMARY CONTRACT')).toHaveCount(0);
  await expect(page.getByText('1,530 m')).toHaveCount(0);
  const world = await page.locator('.game-shell').boundingBox();
  expect(world!.width).toBeGreaterThan(1200);
  for (const selector of ['.rig-hud', '.cargo-hud', '.hud-credits', '.coordinates']) {
    const box = await page.locator(selector).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(world!.x);
    expect(box!.x + box!.width).toBeLessThanOrEqual(world!.x + world!.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(world!.y + world!.height);
  }
  await page.screenshot({ path: `test-results/${testInfo.project.name}-hud-undiscovered.png` });
  await page.keyboard.down('s');
  await expect(page.locator('#ore-list')).toContainText('Copper', { timeout: 7000 });
  await page.keyboard.up('s');
  await expect(page.locator('#ore-list')).not.toContainText('Cobalt');
  await expect(page.locator('#ore-list')).not.toContainText('Iridium');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.reload();
  await page.locator('#start').click();
  await expect(page.locator('#ore-list')).toContainText('Copper');
  await page.screenshot({ path: `test-results/${testInfo.project.name}-hud-discovered.png` });
});
