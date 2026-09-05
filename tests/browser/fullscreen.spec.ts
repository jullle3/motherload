import { test, expect } from '@playwright/test';

test('fullscreen enters, resizes the canvas, and exits without interrupting play', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/games/deepfield/');
  await page.locator('#start').click();
  const toggle = page.locator('#fullscreen');
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement))
    .toBe(true);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toContainText('EXIT FULLSCREEN');
  await expect(page.locator('#overlay')).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = document.getElementById('world')!;
        const canvas = host.querySelector('canvas')!;
        return (
          Math.abs(canvas.getBoundingClientRect().width - host.clientWidth) < 2 &&
          Math.abs(canvas.getBoundingClientRect().height - host.clientHeight) < 2
        );
      }),
    )
    .toBe(true);
  await toggle.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  // Browser-driven exit (including Escape) also synchronizes the button.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => document.exitFullscreen());
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#overlay')).toBeHidden();
  expect(errors).toEqual([]);
});

test('fullscreen rejection leaves the game and toggle usable', async ({ page }) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error('Denied'));
  });
  await page.goto('/games/deepfield/');
  await page.locator('#start').click();
  await page.locator('#fullscreen').click();
  await expect(page.locator('#toast')).toContainText('Fullscreen could not start');
  await expect(page.locator('#fullscreen')).toBeEnabled();
  await expect(page.locator('#fullscreen')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#overlay')).toBeHidden();
});
