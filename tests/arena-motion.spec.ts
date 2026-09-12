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
  const x = box.x + box.width * .2, y = box.y + box.height * .75;
  await page.mouse.move(x, y); await page.mouse.down();
  const held = await canvas.getAttribute('data-rotation'); const before = await canvas.getAttribute('data-camera-position');
  await page.mouse.move(x + 75, y + 20, { steps: 8 });
  await expect.poll(() => canvas.getAttribute('data-camera-position')).not.toBe(before);
  await page.waitForTimeout(3100); expect(await canvas.getAttribute('data-rotation')).toBe(held);
  await page.mouse.up();
  await expect.poll(async () => Number(await canvas.getAttribute('data-rotation')), { timeout: 7000 }).toBeLessThan(Number(held));
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
  await arena.locator('[data-destination="research"]').click();
  await expect(arena).toHaveAttribute('data-phase', 'travelling');
  await expect(arena).toHaveAttribute('data-phase', 'section');
  await page.reload(); await expect(arena).toHaveAttribute('data-status', 'ready');
  await expect(arena).toHaveAttribute('data-effects', 'true');
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.emulateMedia({ reducedMotion: 'reduce' });
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
});

test('motion controls work when storage is blocked and rendering stops offscreen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => { for (const name of ['getItem', 'setItem', 'removeItem']) Object.defineProperty(Storage.prototype, name, { value: () => { throw new DOMException('Storage blocked', 'SecurityError'); } }); });
  const { arena, canvas } = await ready(page);
  await arena.getByRole('button', { name: 'Enable motion', exact: true }).click(); await expect(arena).toHaveAttribute('data-effects', 'true');
  await page.locator('.site-footer').scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
  const count = await canvas.getAttribute('data-render-count'); await page.waitForTimeout(400);
  expect(await canvas.getAttribute('data-render-count')).toBe(count);
  await canvas.scrollIntoViewIfNeeded(); await expect.poll(() => canvas.getAttribute('data-render-count')).not.toBe(count);
  await arena.getByRole('button', { name: 'Pause motion', exact: true }).click(); await expect(arena).toHaveAttribute('data-effects', 'false');
});
