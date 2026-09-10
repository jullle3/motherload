import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { PlanetGame } from '../../src/planetbreaker/game';
import { BOOST_KEYS, BOOSTS, SAVE_KEY } from '../../src/planetbreaker/config';

test('rotation advances on render frames rather than stepping at the simulation tick rate', async ({
  page,
}) => {
  await page.goto('/games/planetbreaker/');
  await expect(page.locator('canvas')).toBeVisible();
  const result = await page.evaluate(async () => {
    const path = '/src/planetbreaker/render.ts';
    const { PlanetView } = await import(path);
    const original = PlanetView.prototype.render;
    const samples: number[] = [];
    PlanetView.prototype.render = function (...args: unknown[]) {
      original.apply(this, args);
      samples.push(this.world.rotation.y);
    };
    await new Promise((resolve) => setTimeout(resolve, 1600));
    PlanetView.prototype.render = original;
    return {
      frames: samples.length,
      moving: samples.slice(1).filter((n, i) => n > samples[i] + 1e-7).length,
    };
  });
  console.log(`Smooth rotation: ${result.moving}/${result.frames - 1} frames advanced`);
  expect(result.frames).toBeGreaterThan(15);
  expect(result.moving / (result.frames - 1)).toBeGreaterThan(0.9);
  await page.locator('#settings').click();
  await page.getByLabel('Reduced motion & flashes').check();
  await page.locator('#close-dialog').click();
});

for (const phone of [false, true])
  test.describe(phone ? 'mobile rewards' : 'desktop rewards', () => {
    test.use({
      viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      hasTouch: phone,
    });
    for (const key of BOOST_KEYS)
      test(`${key} can be collected once, saved, and displayed`, async ({ page }, info) => {
        const g = new PlanetGame();
        g.state.counts = { laser: 17, missile: 9, plasma: 2, siege: 1 };
        g.state.damage = 24000;
        g.state.earned = 50000;
        g.state.credits = 500;
        g.state.reward.available = key;
        g.state.reward.flyRemaining = 11;
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
        await expect(page.locator('#reward-drone')).toBeVisible();
        await page.screenshot({
          path: `test-results/${info.project.name}-${phone ? 'phone' : 'desktop'}-${key}-flyby.png`,
          fullPage: true,
        });
        if (phone) {
          // Real touch coordinates: a fly-by deliberately never becomes "stable".
          const box = (await page.locator('#reward-drone').boundingBox())!;
          await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        } else {
          await page.locator('#collect-reward').focus();
          await page.keyboard.press('Enter');
        }
        await expect(page.locator('#boost-badge')).toContainText(BOOSTS[key].name.toUpperCase());
        await expect(page.locator('#reward-drone')).toBeHidden();
        const saved = await page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key)!),
          SAVE_KEY,
        );
        expect(saved.reward.collected).toBe(1);
        expect(saved.manualShots).toBe(0);
        expect(saved.reward.active).toBe(key);
        await page.waitForTimeout(1200);
        await page.screenshot({
          path: `test-results/${info.project.name}-${phone ? 'phone' : 'desktop'}-${key}-active.png`,
          fullPage: true,
        });
        await page.reload();
        await expect(page.locator('#boost-badge')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        expect(errors).toEqual([]);
      });
  });

test('legacy fleet migrates, reduced-motion drone stays still, and audio preferences persist', async ({
  page,
}) => {
  await page.clock.install();
  const g = new PlanetGame();
  g.state.damage = 24000;
  g.state.earned = 24000;
  g.state.counts = { laser: 17, missile: 9, plasma: 2, siege: 0 };
  const { motionTime, autoShots, reward, ...old } = g.save();
  await page.addInitScript(
    ({ key, save }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save));
    },
    { key: SAVE_KEY, save: { ...old, version: 1 } },
  );
  await page.goto('/games/planetbreaker/');
  await expect(page.locator('#game')).toBeVisible();
  // The live fleet can fire while the browser initializes; exact migration is
  // covered in the simulation test, so allow subsequent legitimate damage.
  expect(Number.parseFloat(await page.locator('#integrity').innerText())).toBeLessThan(92);
  await expect(page.locator('#damage-label')).toContainText('SURFACE');
  await expect(page.locator('#count-missile')).toHaveText('× 9');
  await page.locator('#settings').click();
  await page.getByLabel('Reduced motion & flashes').check();
  await page.locator('#setting-volume').focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowRight');
  await page.locator('#close-dialog').click();
  await page.reload();
  await page.locator('#settings').click();
  await expect(page.locator('#setting-volume')).toHaveValue('25');
  await page.locator('#close-dialog').click();
  await page.addInitScript(key=>{
    const save=JSON.parse(localStorage.getItem(key)!);
    save.reward.available='overdrive';save.reward.flyRemaining=14;
    save.reward.active=null;save.reward.remaining=0;save.savedAt=Date.now();
    localStorage.setItem(key,JSON.stringify(save));
  },SAVE_KEY);
  await page.reload();
  await expect(page.locator('#reward-drone')).toBeVisible();
  const before = await page.locator('#reward-drone').boundingBox();
  await page.clock.runFor(1000);
  const after = await page.locator('#reward-drone').boundingBox();
  expect(after?.x).toBe(before?.x);
  expect(after?.y).toBe(before?.y);
});

test('boost timers freeze while hidden, expire in visible time, and give no offline bonus', async ({
  page,
}) => {
  const g = new PlanetGame();
  g.state.reward.active = 'overdrive';
  g.state.reward.remaining = 30;
  await page.addInitScript(
    ({ key, save }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save));
    },
    { key: SAVE_KEY, save: g.save() },
  );
  await page.clock.install();
  await page.goto('/games/planetbreaker/');
  await expect(page.locator('#boost-badge')).toBeVisible();
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
  expect(after.reward.remaining).toBe(before.reward.remaining);
  expect(after.damage).toBe(before.damage);
  expect(after.credits - before.credits).toBeCloseTo(60, 0);
  for (let i = 0; i < 31; i++) await page.clock.fastForward(1000);
  await expect(page.locator('#boost-badge')).toBeHidden();
});

test('isolated weapons and dense boosted audio stay below clipping and produce an audition file', async ({
  page,
}, info) => {
  await page.goto('/games/planetbreaker/');
  const result = await page.evaluate(async () => {
    const path = '/src/planetbreaker/audio.ts';
    const { PlanetAudio } = await import(path);
    const c = new OfflineAudioContext(2, 44100 * 12, 44100),
      audio = new PlanetAudio(c);
    audio.volume = 0.5;
    const keys = ['laser', 'missile', 'plasma', 'siege'] as const;
    keys.forEach((key, i) => audio.play(key, i % 2 ? 0.4 : -0.4, i * 1.2));
    audio.cue('overdrive', 5);
    audio.cue('surge', 6);
    audio.cue('autofire', 7);
    for (let t = 8; t < 11.5; t += 0.2)
      keys.forEach((key, i) => audio.play(key, (i - 1.5) * 0.3, t));
    const buffer = await c.startRendering();
    let peak = 0,
      sum = 0;
    const count = buffer.length,
      data = new ArrayBuffer(44 + count * 4),
      view = new DataView(data);
    const str = (at: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
    };
    str(0, 'RIFF');
    view.setUint32(4, 36 + count * 4, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, 44100, true);
    view.setUint32(28, 176400, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    str(36, 'data');
    view.setUint32(40, count * 4, true);
    const windows: number[] = [];
    for (let i = 0; i < count; i++)
      for (let channel = 0; channel < 2; channel++) {
        const sample = buffer.getChannelData(channel)[i];
        peak = Math.max(peak, Math.abs(sample));
        sum += sample * sample;
        view.setInt16(
          44 + (i * 2 + channel) * 2,
          Math.max(-32767, Math.min(32767, Math.round(sample * 32767))),
          true,
        );
        const window = Math.floor(i / 44100);
        windows[window] = Math.max(windows[window] ?? 0, Math.abs(sample));
      }
    let binary = '';
    const bytes = new Uint8Array(data);
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.slice(i, i + 8192));
    return { peak, rms: Math.sqrt(sum / (count * 2)), windows, wav: btoa(binary) };
  });
  console.log(`Planetbreaker audio peak ${result.peak.toFixed(3)}, RMS ${result.rms.toFixed(4)}`);
  expect(result.peak).toBeLessThan(0.8);
  expect(result.peak).toBeGreaterThan(0.02);
  expect(result.windows[10]).toBeGreaterThan(0.01);
  await writeFile(
    `test-results/${info.project.name}-planetbreaker-audition.wav`,
    Buffer.from(result.wav, 'base64'),
  );
});
