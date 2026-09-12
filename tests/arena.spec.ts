import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const arenaSelector = '.arena-experience';

function runtimeErrors(page: Page, includeConsole = true) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  if (includeConsole) {
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
  }
  return errors;
}

async function readyArena(page: Page) {
  await page.goto('');
  const arena = page.locator(arenaSelector);
  await arena.scrollIntoViewIfNeeded();
  await expect(arena).toHaveAttribute('data-status', 'ready');
  const canvas = arena.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAccessibleName('Interactive x-ray model of Savage Arena');
  await expect(arena.locator('.arena-poster')).toBeHidden();
  await page.evaluate(() => document.fonts.ready);
  await canvas.scrollIntoViewIfNeeded();
  await drawnFrames(page);
  return { arena, canvas };
}

async function drawnFrames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function expectCanvasChanges(canvas: Locator, previous: Buffer) {
  await expect.poll(async () => (await canvasFrame(canvas)).equals(previous), {
    message: 'The rendered arena should change, not only the selected control',
  }).toBe(false);
}

async function canvasFrame(canvas: Locator, path?: string) {
  const page = canvas.page();
  // Keep capture preparation in one browser call: software WebGL can make each
  // additional locator round trip expensive while movement is playing.
  const clip = await page.evaluate(async () => {
    const element = document.querySelector<HTMLCanvasElement>('.arena-experience canvas');
    if (!element) throw new Error('The rendered arena canvas is missing.');
    const initial = element.getBoundingClientRect();
    // Horizontal artwork bleed is intentional. Only scroll when needed to bring
    // the scene vertically into view, then let demand-driven rendering resume.
    if (initial.top < 0 || initial.bottom > innerHeight) {
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    }
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    const bounds = element.getBoundingClientRect();
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
  return page.screenshot({ clip, scale: 'css', path });
}

async function expectCanvasStill(page: Page, canvas: Locator) {
  const before = await canvasFrame(canvas);
  // Observe a real idle interval: a single frame cannot detect ongoing animation.
  await page.waitForTimeout(250);
  expect((await canvasFrame(canvas)).equals(before), 'The paused arena should stop rendering movement').toBe(true);
}

test.beforeEach(async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 360, height: 800 });
});

test('arena camera and structure controls change the rendered model and remain accessible', async ({ page }, testInfo) => {
  const errors = runtimeErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { arena, canvas } = await readyArena(page);
  const views = arena.getByRole('group', { name: 'Arena camera views' });
  await expect(views).toBeVisible();
  await expect(arena).toHaveAttribute('data-camera', 'orbit');
  await expect(views.getByRole('button', { name: 'Orbit', exact: true })).toHaveAttribute('aria-pressed', 'true');

  let previous = await canvasFrame(canvas, testInfo.outputPath('arena-orbit.png'));
  for (const [name, camera] of [['Courtside', 'courtside'], ['Top down', 'top'], ['Orbit', 'orbit']] as const) {
    const button = views.getByRole('button', { name, exact: true });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(arena).toHaveAttribute('data-camera', camera);
    await expect(views.locator('button[aria-pressed="true"]')).toHaveCount(1);
    await expectCanvasChanges(canvas, previous);
    previous = await canvasFrame(canvas, testInfo.outputPath(`arena-${camera}.png`));
  }

  const roof = arena.getByRole('button', { name: 'Roof structure', exact: true });
  await expect(roof).toHaveAttribute('aria-pressed', 'true');
  await roof.click();
  await expect(roof).toHaveAttribute('aria-pressed', 'false');
  await expectCanvasChanges(canvas, previous);
  await roof.click();
  await expect(roof).toHaveAttribute('aria-pressed', 'true');

  for (const name of ['Rotate left', 'Rotate right', 'Reset view']) {
    const button = arena.getByRole('button', { name, exact: true });
    await expect(button).toBeEnabled();
    await button.focus();
    await expect(button).toBeFocused();
  }
  await drawnFrames(page);
  previous = await canvasFrame(canvas);
  await arena.getByRole('button', { name: 'Rotate left', exact: true }).click();
  await expectCanvasChanges(canvas, previous);
  previous = await canvasFrame(canvas);
  await arena.getByRole('button', { name: 'Rotate right', exact: true }).click();
  await expectCanvasChanges(canvas, previous);
  await views.getByRole('button', { name: 'Top down', exact: true }).click();
  await arena.getByRole('button', { name: 'Reset view', exact: true }).click();
  await expect(arena).toHaveAttribute('data-camera', 'orbit');
  await expect(views.getByRole('button', { name: 'Orbit', exact: true })).toHaveAttribute('aria-pressed', 'true');

  const audit = await new AxeBuilder({ page }).include(arenaSelector).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
  expect(errors).toEqual([]);
});

test('reduced motion stays idle and CourtVision movement plays and stops only when requested', async ({ page }) => {
  const errors = runtimeErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { arena, canvas } = await readyArena(page);
  const layer = arena.getByRole('button', { name: 'CourtVision layer', exact: true });
  await expect(layer).toHaveAttribute('aria-pressed', 'false');
  await expect(arena.getByRole('button', { name: 'Play movement', exact: true })).toHaveCount(0);
  await expectCanvasStill(page, canvas);

  await layer.click();
  await expect(layer).toHaveAttribute('aria-pressed', 'true');
  await expect(arena.locator('.arena-description')).toContainText('Illustrative movement');
  await expect(arena.getByRole('button', { name: 'Play movement', exact: true })).toBeEnabled();
  await expectCanvasStill(page, canvas);

  const beforePlay = await canvasFrame(canvas);
  await arena.getByRole('button', { name: 'Play movement', exact: true }).click();
  await expect(arena.getByRole('button', { name: 'Pause movement', exact: true })).toBeEnabled();
  await expectCanvasChanges(canvas, beforePlay);
  await arena.getByRole('button', { name: 'Pause movement', exact: true }).click();
  await expect(arena.getByRole('button', { name: 'Play movement', exact: true })).toBeEnabled();
  await expectCanvasStill(page, canvas);

  await arena.getByRole('button', { name: 'Play movement', exact: true }).click();
  await layer.click();
  await expect(layer).toHaveAttribute('aria-pressed', 'false');
  await expect(arena.getByRole('button', { name: 'Pause movement', exact: true })).toHaveCount(0);
  await expect(arena.getByRole('button', { name: 'Play movement', exact: true })).toHaveCount(0);
  await expect(arena.locator('.arena-description')).not.toContainText('Illustrative movement');
  await expectCanvasStill(page, canvas);
  expect(errors).toEqual([]);
});

test('desktop dragging rotates the actual arena', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The touch layout uses explicit drag opt-in controls.');
  const errors = runtimeErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { canvas } = await readyArena(page);
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const previous = await canvasFrame(canvas);
  const x = bounds!.x + bounds!.width * 0.45;
  const y = bounds!.y + bounds!.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + Math.min(140, bounds!.width * 0.2), y + 30, { steps: 8 });
  await page.mouse.up();
  await expectCanvasChanges(canvas, previous);
  expect(errors).toEqual([]);
});

test('360px touch layout exposes drag opt-in and fits the viewport', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Touch controls are specific to the mobile project.');
  const errors = runtimeErrors(page);
  const { arena } = await readyArena(page);
  const enable = arena.getByRole('button', { name: 'Enable drag controls', exact: true });
  await expect(enable).toBeVisible();
  await enable.click();
  await expect(arena.getByRole('button', { name: 'Disable drag controls', exact: true })).toBeVisible();
  await arena.getByRole('button', { name: 'Disable drag controls', exact: true }).click();
  await expect(enable).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});

test('WebGL failure keeps the illustrated arena and portfolio navigation available', async ({ page }) => {
  // Three.js may log its expected context-creation error; uncaught exceptions still fail this test.
  const errors = runtimeErrors(page, false);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: function (this: HTMLCanvasElement, contextId: string, ...args: unknown[]) {
        if (['webgl', 'webgl2', 'experimental-webgl'].includes(contextId)) return null;
        return Reflect.apply(original, this, [contextId, ...args]);
      },
    });
  });
  await page.goto('');
  const arena = page.locator(arenaSelector);
  await arena.scrollIntoViewIfNeeded();
  await expect(arena).toHaveAttribute('data-status', 'fallback');
  await expect(arena.locator('.arena-poster')).toBeVisible();
  await expect(page.locator('h1')).toBeVisible();
  await page.getByRole('link', { name: 'Browse all work', exact: true }).click();
  await expect(page).toHaveURL(/\/work\/$/);
  await expect(page.locator('h1')).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('arena poster is visible and the portfolio remains navigable', async ({ page }) => {
    await page.goto('');
    const arena = page.locator(arenaSelector);
    await expect(arena.locator('.arena-poster')).toBeVisible();
    await expect(page.locator('h1')).toBeVisible();
    await page.getByRole('link', { name: 'Browse all work', exact: true }).click();
    await expect(page).toHaveURL(/\/work\/$/);
    await expect(page.locator('h1')).toBeVisible();
  });
});
