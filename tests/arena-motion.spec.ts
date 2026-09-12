import { test, expect, type Page } from '@playwright/test';
async function ready(page: Page) {
  await page.goto(''); const arena = page.locator('.arena-experience');
  await expect(arena).toHaveAttribute('data-status', 'ready'); return { arena, canvas: arena.locator('canvas') };
}

test('clockwise motion is automatic and pauses only during a held drag', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' }); const { arena, canvas } = await ready(page);
  const angle = Number(await canvas.getAttribute('data-rotation'));
  await expect.poll(async () => Number(await canvas.getAttribute('data-rotation'))).toBeLessThan(angle);
  if (isMobile) await arena.getByRole('button', { name: 'Enable drag', exact: true }).click();
  const box = (await canvas.boundingBox())!;
  const defaultCamera = await canvas.getAttribute('data-camera-position');
  const x = box.x + box.width * .2, y = box.y + box.height * .75;
  await page.mouse.move(x, y); await page.mouse.down();
  const held = await canvas.getAttribute('data-rotation'); const before = await canvas.getAttribute('data-camera-position');
  await page.mouse.move(x + 75, y + 20, { steps: 8 });
  await expect.poll(() => canvas.getAttribute('data-camera-position')).not.toBe(before);
  await page.waitForTimeout(3100); expect(await canvas.getAttribute('data-rotation')).toBe(held);
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-camera-position', defaultCamera!, { timeout: 7000 });
  // Returning resets orientation to zero. Measure clockwise movement from that new origin.
  const resumed = Number(await canvas.getAttribute('data-rotation'));
  await expect.poll(async () => Number(await canvas.getAttribute('data-rotation'))).toBeLessThan(resumed);
});

test('reduced motion still supports every destination and remembers explicit motion choices', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); const { arena, canvas } = await ready(page);
  await expect(arena).toHaveAttribute('data-effects', 'false');
  const angle = await canvas.getAttribute('data-rotation'); await page.waitForTimeout(250);
  expect(await canvas.getAttribute('data-rotation')).toBe(angle);
  await arena.getByRole('link', { name: 'Enter the arena', exact: true }).click();
  await expect(arena).toHaveAttribute('data-phase', 'overview');
  await expect(arena.getByRole('button', { name: 'Skip entrance' })).toHaveCount(0);
  await arena.getByRole('button', { name: 'Enable motion', exact: true }).click();
  await page.evaluate(() => {
    const root = document.querySelector('.arena-experience')!;
    const observed = window as Window & { arenaTravelPhases?: string[] };
    observed.arenaTravelPhases = [];
    new MutationObserver(() => observed.arenaTravelPhases?.push(root.getAttribute('data-phase') ?? '')).observe(root, { attributes: true, attributeFilter: ['data-phase'] });
  });
  await arena.locator('[data-destination="research"]').click();
  await expect(arena).toHaveAttribute('data-phase', 'section');
  // A slow automation round trip can outlast a short flight; assert the observed transition.
  expect(await page.evaluate(() => (window as Window & { arenaTravelPhases?: string[] }).arenaTravelPhases)).toContain('travelling');
  await page.reload(); await expect(arena).toHaveAttribute('data-status', 'ready');
  await expect(arena).toHaveAttribute('data-effects', 'true');
  await page.evaluate(() => {
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => { document.documentElement.dataset.testMotionPreference = 'changed'; }, { once: true });
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // Wait for the browser's media event before switching back, avoiding coalesced emulation updates.
  await expect(page.locator('html')).toHaveAttribute('data-test-motion-preference', 'changed');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(arena).toHaveAttribute('data-effects', 'false');
});

test('reading stays at the selected view beyond the old reset and glitch intervals', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' }); const { arena, canvas } = await ready(page);
  await arena.getByRole('link', { name: 'Or go straight to the projects' }).click();
  await expect(arena).toHaveAttribute('data-phase', 'section');
  await expect(canvas).toHaveAttribute('data-roof-visible', 'false');
  const camera = await canvas.getAttribute('data-camera-position');
  await page.evaluate(() => {
    const c = document.querySelector('canvas')!;
    const observed = window as Window & { arenaGlitches?: number };
    observed.arenaGlitches = 0;
    new MutationObserver(() => { if (c.dataset.glitch === 'true') observed.arenaGlitches = (observed.arenaGlitches ?? 0) + 1; }).observe(c, { attributes: true, attributeFilter: ['data-glitch'] });
  });
  await page.waitForTimeout(6500);
  expect(await canvas.getAttribute('data-camera-position')).toBe(camera);
  await expect(arena).toHaveAttribute('data-phase', 'section');
  expect(await page.evaluate(() => (window as Window & { arenaGlitches?: number }).arenaGlitches)).toBe(0);
  const frames = await canvas.getAttribute('data-render-count');
  await page.waitForTimeout(300);
  expect(await canvas.getAttribute('data-render-count'), 'Inactive atmosphere and destinations must stop rendering while reading').toBe(frames);
});

test('motion controls work when storage is blocked and rendering stops when the document is hidden', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => { for (const name of ['getItem', 'setItem', 'removeItem']) Object.defineProperty(Storage.prototype, name, { value: () => { throw new DOMException('Storage blocked', 'SecurityError'); } }); });
  const { arena, canvas } = await ready(page);
  await arena.getByRole('button', { name: 'Enable motion', exact: true }).click(); await expect(arena).toHaveAttribute('data-effects', 'true');
  // Simulate the Page Visibility API signal in the current document so the
  // renderer's suspension path is deterministic in both headed and headless CI.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const count = await canvas.getAttribute('data-render-count'); await page.waitForTimeout(400);
  expect(await canvas.getAttribute('data-render-count')).toBe(count);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => canvas.getAttribute('data-render-count')).not.toBe(count);
  await arena.getByRole('button', { name: 'Pause motion', exact: true }).click(); await expect(arena).toHaveAttribute('data-effects', 'false');
});
