import { test, expect } from '@playwright/test';
import { freshSave } from '../../src/neon/game';
import { pilot } from '../neon-pilot';

test('normal keyboard play clears a stage, unlocks the next, and survives reload', async ({
  page,
}, info) => {
  // A deterministic animation clock replays a real input solution without altering game state.
  await page.addInitScript(() => {
    let now = 0,
      id = 0;
    const callbacks = new Map<number, FrameRequestCallback>();
    Object.defineProperty(performance, 'now', { value: () => now });
    window.requestAnimationFrame = (callback) => {
      callbacks.set(++id, callback);
      return id;
    };
    window.cancelAnimationFrame = (callbackId) => {
      callbacks.delete(callbackId);
    };
    (window as unknown as { testFrame: () => void }).testFrame = () => {
      now += 1000 / 60 + 0.000001;
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback(now));
    };
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/games/neon-split/');
  // DOM clicks avoid Playwright waiting for animation frames in this clock-controlled test.
  await page.locator('#solo').dispatchEvent('click');
  await page.locator('#continue').dispatchEvent('click');
  const solution = pilot(0, 'solo');
  await page.evaluate(
    ({ trace, ticks }) => {
      const keys = new Set<string>();
      const setKeys = (desired: string[]) => {
        for (const key of [...keys])
          if (!desired.includes(key)) {
            window.dispatchEvent(new KeyboardEvent('keyup', { code: key, bubbles: true }));
            keys.delete(key);
          }
        for (const key of desired)
          if (!keys.has(key)) {
            window.dispatchEvent(new KeyboardEvent('keydown', { code: key, bubbles: true }));
            keys.add(key);
          }
      };
      let move = 0;
      for (let tick = 0; tick < ticks + 2; tick++) {
        const action = trace.find((action) => action.ticks === tick);
        if (action) move = action.moves[0];
        setKeys(['Space', ...(move < 0 ? ['KeyA'] : move > 0 ? ['KeyD'] : [])]);
        (window as unknown as { testFrame: () => void }).testFrame();
      }
      setKeys([]);
    },
    { trace: solution.trace, ticks: solution.ticks },
  );
  await expect(page.locator('#dialog-title')).toHaveText('Beautifully burst.');
  await expect(page.locator('#next')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('neon-split.save.v1')!));
  expect(saved.solo.unlocked).toBe(2);
  expect(saved.solo.best['0'].score).toBeGreaterThan(0);
  expect(saved.coop.unlocked).toBe(1);
  await page.screenshot({ path: `test-results/${info.project.name}-neon-clear.png` });
  await page.locator('#next').dispatchEvent('click');
  await expect(page.locator('#stage-name')).toHaveText('Two to tango');
  await page.reload();
  await page.locator('#solo').dispatchEvent('click');
  await expect(page.locator('[data-stage="1"]')).toBeEnabled();
});

test('Neon Split launches from the collection and solo play freezes on blur', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.getByRole('link', { name: 'Play Neon Split', exact: true }).click();
  await expect(page).toHaveURL(/\/games\/neon-split\/$/);
  await page.screenshot({ path: `test-results/${info.project.name}-neon-title.png` });
  await page.locator('#solo').click();
  await expect(page.locator('[data-stage="1"]')).toBeDisabled();
  await page.locator('#continue').click();
  await expect(page.locator('#overlay')).toBeHidden();
  await expect(page.locator('#status')).toContainText('HOLD FIRE');
  await page.keyboard.down('Space');
  await page.keyboard.down('a');
  await page.waitForTimeout(250);
  await page.keyboard.up('a');
  await expect(page.locator('#score')).not.toHaveText('0', { timeout: 12000 });
  await page.keyboard.up('Space');
  await page.screenshot({ path: `test-results/${info.project.name}-neon-play.png` });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#dialog-title')).toHaveText('The chaos can wait.');
  const time = await page.locator('#time').textContent();
  await page.waitForTimeout(1200);
  await expect(page.locator('#time')).toHaveText(time!);
  await page.locator('#low').check();
  await page.locator('#reduced').check();
  await page.locator('#resume').click();
  await expect(page.locator('#status')).toHaveText('GET READY');
  await page.keyboard.press('Escape');
  await expect(page.locator('#resume')).toBeVisible();
  await page.locator('#select').click();
  await page.locator('#back').click();
  await page.locator('#coop').click();
  await page.locator('#continue').click();
  await expect(page.locator('#district')).toContainText('CO-OP');
  await expect(page.locator('#powers')).toContainText('P2');
  await page.keyboard.press('f');
  await expect(page.locator('#fullscreen')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('f');
  await expect(page.locator('#fullscreen')).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('link', { name: 'ALL GAMES' }).click();
  await expect(page.locator('h1')).toContainText('Small games.');
  expect(errors).toEqual([]);
});

test('saved mode unlocks, direct reload, keyboard focus and all stage menus work', async ({
  page,
}, info) => {
  const save = freshSave();
  save.solo.unlocked = 15;
  save.solo.best['0'] = { score: 3400, time: 18 };
  save.coop.unlocked = 3;
  await page.addInitScript(
    (s) => localStorage.setItem('neon-split.save.v1', JSON.stringify(s)),
    save,
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/games/neon-split/');
  await page.keyboard.press('Tab');
  await expect(page.locator('#solo')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-stage="14"]')).toBeEnabled();
  await expect(page.locator('[data-stage="0"]')).toContainText(/3[,.]400/);
  await page.screenshot({ path: `test-results/${info.project.name}-neon-stages.png` });
  await page.locator('[data-stage="14"]').click();
  await expect(page.locator('#stage-name')).toHaveText('One last pop');
  await expect(page.locator('#status')).toContainText('HOLD FIRE');
  await page.keyboard.down('Space');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('Space');
  await page.screenshot({ path: `test-results/${info.project.name}-neon-stage15.png` });
  await page.reload();
  await page.locator('#coop').click();
  await expect(page.locator('[data-stage="2"]')).toBeEnabled();
  await expect(page.locator('[data-stage="3"]')).toBeDisabled();
});

test('corrupt or unavailable storage does not prevent starting', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('neon-split.save.v1', '{invalid');
  });
  await page.goto('/games/neon-split/');
  await expect(page.locator('#status')).toContainText('could not be loaded');
  await page.locator('#solo').click();
  await page.locator('#continue').click();
  await expect(page.locator('#overlay')).toBeHidden();
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('Unavailable');
    };
    Storage.prototype.setItem = () => {
      throw new Error('Unavailable');
    };
  });
  await page.reload();
  await page.locator('#solo').click();
  await page.locator('#continue').click();
  await expect(page.locator('#overlay')).toBeHidden();
});
