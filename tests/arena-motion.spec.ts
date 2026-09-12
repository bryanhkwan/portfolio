import { test, expect, type Locator, type Page } from '@playwright/test';

type MotionTrace = {
  states: { state: string | null; at: number }[];
  clickedAt: number | null;
  releasedAt: number | null;
};
type ArenaTestWindow = Window & {
  arenaMotionTrace?: MotionTrace;
  arenaGlitchTrace?: { count: number; active: boolean; at: number }[];
};

async function readyArena(page: Page) {
  await page.goto('');
  const arena = page.locator('.arena-experience');
  await arena.scrollIntoViewIfNeeded();
  await expect(arena).toHaveAttribute('data-status', 'ready');
  const canvas = arena.getByRole('img', { name: 'Interactive x-ray model of Savage Arena', exact: true });
  await expect(canvas).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();
  return { arena, canvas };
}

function runtimeErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

async function rotation(canvas: Locator) {
  const attribute = await canvas.getAttribute('data-rotation');
  expect(attribute, 'The rotation reading must come from the rendered arena').not.toBeNull();
  const value = Number(attribute);
  expect(Number.isFinite(value)).toBe(true);
  return value;
}

async function canvasFrame(page: Page) {
  // A single browser round trip keeps software WebGL capture responsive.
  const clip = await page.evaluate(async () => {
    const canvas = document.querySelector<HTMLCanvasElement>('.arena-experience canvas');
    if (!canvas) throw new Error('The arena canvas is missing.');
    const initial = canvas.getBoundingClientRect();
    if (initial.top < 0 || initial.bottom > innerHeight) {
      canvas.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    }
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const bounds = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.ceil(bounds.x));
    const y = Math.max(0, Math.ceil(bounds.y));
    return {
      x, y,
      width: Math.min(innerWidth, Math.floor(bounds.right)) - x,
      height: Math.min(innerHeight, Math.floor(bounds.bottom)) - y,
    };
  });
  expect(clip.width).toBeGreaterThan(0);
  expect(clip.height).toBeGreaterThan(0);
  return page.screenshot({ clip, scale: 'css' });
}

async function watchMotion(page: Page) {
  await page.evaluate(() => {
    const arena = document.querySelector('.arena-experience');
    if (!arena) throw new Error('The arena is missing.');
    const trace: MotionTrace = { states: [], clickedAt: null, releasedAt: null };
    (window as ArenaTestWindow).arenaMotionTrace = trace;
    new MutationObserver(() => {
      trace.states.push({ state: arena.getAttribute('data-motion'), at: performance.now() });
    }).observe(arena, { attributes: true, attributeFilter: ['data-motion'] });
    document.addEventListener('pointerup', () => { trace.releasedAt = performance.now(); }, { capture: true });
    arena.addEventListener('click', event => {
      if ((event.target as Element).closest('button')?.textContent?.trim() === 'Top down') {
        trace.clickedAt = performance.now();
      }
    }, { capture: true });
  });
}

test.beforeEach(async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 360, height: 800 });
});

test('ambient effects rotate clockwise, pause visibly, and glitch every six active seconds', async ({ page }) => {
  const errors = runtimeErrors(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const { arena, canvas } = await readyArena(page);
  await expect(arena).toHaveAttribute('data-effects', 'true');
  await expect(arena).toHaveAttribute('data-motion', 'orbiting');
  const before = await rotation(canvas);
  const frame = await canvasFrame(page);
  await page.waitForTimeout(400);
  expect(await rotation(canvas), 'Negative Y rotation is clockwise when viewed from above').toBeLessThan(before);
  expect((await canvasFrame(page)).equals(frame), 'Ambient motion must change the rendered image').toBe(false);

  await arena.getByRole('button', { name: 'Pause effects', exact: true }).click();
  await expect(arena).toHaveAttribute('data-effects', 'false');
  await expect(arena).toHaveAttribute('data-motion', 'paused');
  await expect(canvas).toHaveAttribute('data-glitch', 'false');
  await page.waitForTimeout(300);
  const pausedRotation = await rotation(canvas);
  const pausedCount = await canvas.getAttribute('data-glitch-count');
  const pausedFrame = await canvasFrame(page);
  await page.waitForTimeout(400);
  expect(await rotation(canvas)).toBe(pausedRotation);
  expect(await canvas.getAttribute('data-glitch-count')).toBe(pausedCount);
  expect((await canvasFrame(page)).equals(pausedFrame), 'Pausing also freezes the surrounding smoke').toBe(true);

  await page.evaluate(() => {
    const element = document.querySelector('.arena-experience canvas');
    if (!element) throw new Error('The arena canvas is missing.');
    const trace: { count: number; active: boolean; at: number }[] = [];
    (window as ArenaTestWindow).arenaGlitchTrace = trace;
    let previous = Number(element.getAttribute('data-glitch-count'));
    new MutationObserver(() => {
      const count = Number(element.getAttribute('data-glitch-count'));
      if (count > previous) {
        trace.push({ count, active: element.getAttribute('data-glitch') === 'true', at: performance.now() });
        previous = count;
      }
      // The intensity envelope starts at zero on the scheduled frame. Confirm
      // that the burst becomes visible on a following rendered frame as well.
      const burst = trace.at(-1);
      if (burst?.count === count && element.getAttribute('data-glitch') === 'true') burst.active = true;
    }).observe(element, { attributes: true, attributeFilter: ['data-glitch-count', 'data-glitch'] });
  });
  await arena.getByRole('button', { name: 'Resume effects', exact: true }).click();
  await canvas.scrollIntoViewIfNeeded();
  await expect(arena).toHaveAttribute('data-motion', 'orbiting');
  await page.waitForFunction(() => (window as ArenaTestWindow).arenaGlitchTrace?.[1]?.active, undefined, { timeout: 18000 });
  const bursts = await page.evaluate(() => (window as ArenaTestWindow).arenaGlitchTrace!);
  expect(bursts[0].active).toBe(true);
  expect(bursts[1].active).toBe(true);
  expect(bursts[1].count).toBe(bursts[0].count + 1);
  const cadence = bursts[1].at - bursts[0].at;
  expect(cadence, 'The repeat interval should be six seconds, allowing one delayed software-rendered frame').toBeGreaterThanOrEqual(5500);
  expect(cadence).toBeLessThan(8000);
  await expect(canvas).toHaveAttribute('data-glitch', 'false');
  expect(errors).toEqual([]);
});

test('three idle seconds restore the default camera without changing selected layers', async ({ page }) => {
  const errors = runtimeErrors(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const { arena, canvas } = await readyArena(page);
  const roof = arena.getByRole('button', { name: 'Roof structure', exact: true });
  const tracking = arena.getByRole('button', { name: 'CourtVision layer', exact: true });
  await roof.click();
  await tracking.click();
  await watchMotion(page);
  await arena.getByRole('button', { name: 'Top down', exact: true }).click();
  await expect(arena).toHaveAttribute('data-camera', 'top');
  await expect(arena).toHaveAttribute('data-motion', 'waiting');
  await canvas.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => (window as ArenaTestWindow).arenaMotionTrace?.states.some(event => event.state === 'returning'), undefined, { timeout: 6000 });
  const trace = await page.evaluate(() => (window as ArenaTestWindow).arenaMotionTrace!);
  const returning = trace.states.find(event => event.state === 'returning')!;
  expect(trace.clickedAt).not.toBeNull();
  expect(returning.at - trace.clickedAt!).toBeGreaterThanOrEqual(2900);
  expect(returning.at - trace.clickedAt!).toBeLessThan(4500);
  await expect(arena).toHaveAttribute('data-camera', 'orbit');
  await expect(arena).toHaveAttribute('data-motion', 'orbiting');
  await expect(roof).toHaveAttribute('aria-pressed', 'false');
  await expect(tracking).toHaveAttribute('aria-pressed', 'true');
  const resetAngle = await rotation(canvas);
  expect(Math.abs(resetAngle)).toBeLessThan(0.25);
  await page.waitForTimeout(300);
  expect(await rotation(canvas)).toBeLessThan(resetAngle);
  expect(errors).toEqual([]);
});

test('a held mouse drag stays interactive and starts the idle countdown only on release', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The touch layout has its own explicit drag opt-in coverage.');
  const errors = runtimeErrors(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const { arena, canvas } = await readyArena(page);
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const x = bounds!.x + bounds!.width * 0.45;
  const y = bounds!.y + bounds!.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(arena).toHaveAttribute('data-motion', 'interacting');
  const before = await canvasFrame(page);
  const heldRotation = await rotation(canvas);
  await page.mouse.move(x + 120, y + 30, { steps: 8 });
  await page.waitForTimeout(3500);
  await expect(arena).toHaveAttribute('data-motion', 'interacting');
  expect(await rotation(canvas), 'Auto-rotation must not fight the held pointer').toBe(heldRotation);
  expect((await canvasFrame(page)).equals(before), 'Dragging must still move the rendered view').toBe(false);
  await watchMotion(page);
  await page.mouse.up();
  await expect(arena).toHaveAttribute('data-motion', 'waiting');
  await page.waitForFunction(() => (window as ArenaTestWindow).arenaMotionTrace?.states.some(event => event.state === 'returning'), undefined, { timeout: 6000 });
  const trace = await page.evaluate(() => (window as ArenaTestWindow).arenaMotionTrace!);
  const returning = trace.states.find(event => event.state === 'returning')!;
  expect(trace.releasedAt).not.toBeNull();
  expect(returning.at - trace.releasedAt!).toBeGreaterThanOrEqual(2900);
  expect(returning.at - trace.releasedAt!).toBeLessThan(4500);
  await expect(arena).toHaveAttribute('data-motion', 'orbiting');
  expect(errors).toEqual([]);
});

test('reduced motion starts still, allows explicit effects, and stops when the preference changes', async ({ page }) => {
  const errors = runtimeErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { arena, canvas } = await readyArena(page);
  await expect(arena).toHaveAttribute('data-effects', 'false');
  await expect(arena).toHaveAttribute('data-motion', 'paused');
  await expect(canvas).toHaveAttribute('data-glitch', 'false');
  const before = await rotation(canvas);
  await page.waitForTimeout(400);
  expect(await rotation(canvas)).toBe(before);
  await arena.getByRole('button', { name: 'Resume effects', exact: true }).click();
  await expect(arena).toHaveAttribute('data-effects', 'true');
  await canvas.scrollIntoViewIfNeeded();
  await expect.poll(() => rotation(canvas)).toBeLessThan(before);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(arena).toHaveAttribute('data-effects', 'false');
  await expect(arena).toHaveAttribute('data-motion', 'paused');
  await expect(arena.getByRole('button', { name: 'Resume effects', exact: true })).toBeEnabled();
  const stopped = await rotation(canvas);
  await page.waitForTimeout(400);
  expect(await rotation(canvas)).toBe(stopped);
  expect(errors).toEqual([]);
});
