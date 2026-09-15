import { test, expect, type FrameLocator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const demoUrl = 'https://courtvision.bryanhkwan.workers.dev/v2/demo/';
const replayUrl = `${demoUrl}?page=shots&event_id=shot_004&view=replay`;
const embedded = (page: Page) => page.frameLocator('iframe[title="CourtVision 3D replay"]');
interface ReplayDiagnostics {
  renderer_ready: boolean;
  player_asset: { status: string };
  replay_time_s: number;
  replay_timeline: { start_s: number; release_s: number; end_s: number };
  camera_view: string;
  camera_position: number[];
  player_positions: { marker_id: string; x: number; y: number; z: number; avatar_geometry: string }[];
}
const diagnostics = (viewer: FrameLocator) => viewer.locator('#courtvision-viewer').evaluate(() => (
  window as unknown as { CourtVision3D: { getDiagnostics(): ReplayDiagnostics } }
).CourtVision3D.getDiagnostics());

async function seekTimeline(viewer: FrameLocator, fraction = .1) {
  const timeline = viewer.getByRole('slider', { name: 'Replay timeline', exact: true });
  await timeline.scrollIntoViewIfNeeded();
  const bounds = (await timeline.boundingBox())!;
  // Native pointer input lets the browser choose a valid step relative to the
  // source timestamp, whose minimum is not an integer number of milliseconds.
  await timeline.click({ position: { x: bounds.width * fraction, y: bounds.height / 2 } });
  return Number(await timeline.inputValue());
}

async function loadPreview(page: Page) {
  await page.goto('work/courtvision/');
  await page.locator('.replay-console').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Load 3D replay', exact: true }).click();
  const viewer = embedded(page);
  await expect(viewer.locator('#courtvision-viewer')).toHaveAttribute('data-state', 'ready', { timeout: 20000 });
  await expect(viewer.locator('#courtvision-stage canvas')).toBeVisible();
  return viewer;
}

test('CourtVision loads its real replay only on request and renders time and camera changes', async ({ page }) => {
  if (process.env.CI) test.setTimeout(120000);
  const resources: string[] = [], errors: string[] = [];
  page.on('request', request => resources.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto('work/courtvision/');
  await page.locator('.replay-console').scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Load 3D replay', exact: true })).toBeEnabled();
  await expect(page.locator('.replay-poster')).toBeVisible();
  const posterBounds = (await page.locator('.replay-poster').boundingBox())!;
  const consoleBounds = (await page.locator('.replay-console').boundingBox())!;
  expect(posterBounds.width, 'The still must fit inside its console, even when the stage has a minimum height').toBeLessThanOrEqual(consoleBounds.width + 1);
  await expect(page.locator('iframe[title="CourtVision 3D replay"]')).toHaveCount(0);
  expect(resources.filter(url => /courtvision\.bryanhkwan\.workers\.dev|\/previews\/courtvision\/(?:\?|$)|\/courtvision\/[^?]+\.(?:js|json|glb|gltf)(?:\?|$)/.test(url)), 'Reading the case must not initialize the renderer or contact the live demo').toEqual([]);
  await page.getByRole('button', { name: 'Load 3D replay', exact: true }).click();
  const viewer = embedded(page), state = viewer.locator('#courtvision-viewer');
  await expect(state).toHaveAttribute('data-state', 'ready', { timeout: 20000 });
  await expect(state).toHaveAttribute('data-playing', 'false');
  await expect.poll(async () => (await diagnostics(viewer)).player_asset.status).toBe('ready');
  const initial = await diagnostics(viewer);
  expect(initial.renderer_ready).toBe(true);
  expect(initial.replay_time_s).toBeCloseTo(initial.replay_timeline.release_s, 2);
  expect(initial.player_positions.some(player => player.avatar_geometry === 'blender-skinned-constellation-v1'), 'The actual Blender player model must be visible, not only downloaded').toBe(true);
  const timeline = viewer.getByRole('slider', { name: 'Replay timeline', exact: true });
  await expect(timeline).toBeEnabled();
  const canvas = viewer.locator('#courtvision-stage canvas');
  await expect(canvas).toBeVisible();
  const release = await canvas.screenshot({ scale: 'css' });
  const requestedTime = await seekTimeline(viewer, .65);
  await expect.poll(async () => (await diagnostics(viewer)).replay_time_s).toBeCloseTo(requestedTime, 2);
  expect((await diagnostics(viewer)).player_positions.map(({ marker_id, x, y, z }) => ({ marker_id, x, y, z }))).not.toEqual(initial.player_positions.map(({ marker_id, x, y, z }) => ({ marker_id, x, y, z })));
  const orbit = await canvas.screenshot({ scale: 'css' });
  expect(orbit.equals(release), 'Scrubbing must change the rendered players, not just a timestamp').toBe(false);
  await viewer.getByRole('button', { name: 'Top', exact: true }).click();
  await expect(viewer.getByRole('button', { name: 'Top', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect((await diagnostics(viewer)).camera_view).toBe('top');
  expect((await diagnostics(viewer)).camera_position).not.toEqual(initial.camera_position);
  expect((await canvas.screenshot({ scale: 'css' })).equals(orbit), 'A camera selection must change the actual court rendering').toBe(false);
  await viewer.getByRole('button', { name: 'Orbit', exact: true }).click();
  await expect(viewer.getByRole('button', { name: 'Orbit', exact: true })).toHaveAttribute('aria-pressed', 'true');
  for (const asset of ['constellation-court-v1.glb', 'constellation-player-v1.glb']) {
    expect(resources.some(url => new URL(url).pathname.endsWith(`/${asset}`)), `The real ${asset} must be requested`).toBe(true);
  }
  expect(resources.filter(url => /courtvision\.bryanhkwan\.workers\.dev/.test(url)), 'The embedded preview must work without the external API').toEqual([]);
  expect(errors).toEqual([]);
  const audit = await new AxeBuilder({ page }).include('.replay-console').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
});

test('CourtVision replay stays user controlled and pauses when its parent leaves view', async ({ page }) => {
  if (process.env.CI) test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Install before navigation, let loading proceed normally, then control only
  // playback time. The real 2.37-second clip must not finish while a software
  // renderer is waiting to dispatch the test's next pointer or keyboard action.
  await page.clock.install({ time: new Date('2026-09-15T12:00:00Z') });
  const viewer = await loadPreview(page), state = viewer.locator('#courtvision-viewer');
  await page.clock.pauseAt(new Date('2026-09-15T12:05:00Z'));
  const timeline = viewer.getByRole('slider', { name: 'Replay timeline', exact: true });
  await expect(state).toHaveAttribute('data-playing', 'false');
  const start = await seekTimeline(viewer);
  await viewer.getByRole('button', { name: 'Play replay', exact: true }).click();
  await page.clock.runFor(200);
  await expect.poll(async () => Number(await timeline.inputValue())).toBeGreaterThan(start + .1);
  await viewer.getByRole('button', { name: 'Pause replay', exact: true }).click();
  await expect(state).toHaveAttribute('data-playing', 'false');
  const paused = await timeline.inputValue();
  await page.clock.runFor(200);
  expect(await timeline.inputValue()).toBe(paused);
  // This source clip is only 2.37 seconds long. Rewind before testing offscreen
  // pause so a near-end manual pause cannot turn this into an end-of-clip test.
  await timeline.press('Home');
  await viewer.getByRole('button', { name: 'Play replay', exact: true }).click();
  await expect(state).toHaveAttribute('data-playing', 'true');
  await page.clock.runFor(100);
  await page.locator('.site-footer').scrollIntoViewIfNeeded();
  await expect(state).toHaveAttribute('data-playing', 'false');
  const offscreen = await timeline.inputValue();
  expect(Number(offscreen), 'Leaving the viewport must pause before the source clip finishes').toBeLessThan(Number(await timeline.getAttribute('max')) - .02);
  await page.locator('.replay-console').scrollIntoViewIfNeeded();
  await page.clock.runFor(200);
  expect(await timeline.inputValue(), 'Returning to the preview must not restart it').toBe(offscreen);
  await page.clock.resume();
  await page.getByRole('button', { name: 'Close 3D replay', exact: true }).click();
  await expect(page.locator('iframe[title="CourtVision 3D replay"]')).toHaveCount(0);
  await expect(page.locator('.replay-poster')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load 3D replay', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Load 3D replay', exact: true })).toBeFocused();

  // A device can lose WebGL after a successful load. Recover the poster and
  // keyboard position rather than leaving focus inside the discarded frame.
  await page.getByRole('button', { name: 'Load 3D replay', exact: true }).click();
  await expect(state).toHaveAttribute('data-state', 'ready', { timeout: 20000 });
  await viewer.getByRole('button', { name: 'Play replay', exact: true }).focus();
  await expect(page.locator('iframe[title="CourtVision 3D replay"]')).toBeFocused();
  await viewer.locator('#courtvision-stage canvas').dispatchEvent('webglcontextlost');
  await expect(page.locator('.replay-console')).toHaveAttribute('data-preview-state', 'error');
  await expect(page.locator('iframe[title="CourtVision 3D replay"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry 3D replay', exact: true })).toBeFocused();
});

test('CourtVision offers the live demo if WebGL is unavailable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
      if (/webgl/i.test(String(args[0]))) return null;
      return Reflect.apply(original, this, args);
    } as typeof original;
  });
  // The standalone viewer keeps its own readable fallback; the parent replaces
  // a failed iframe with the poster and a retry action instead of a blank box.
  await page.goto('previews/courtvision/');
  await expect(page.locator('#courtvision-viewer')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#courtvision-fallback')).toBeVisible();
  await expect(page.locator('#courtvision-fallback').getByRole('link', { name: 'Open full CourtVision demo' })).toHaveAttribute('href', replayUrl);
  await page.goto('work/courtvision/');
  await page.locator('.replay-console').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Load 3D replay', exact: true }).click();
  await expect(page.locator('.replay-console')).toHaveAttribute('data-preview-state', 'error');
  await expect(page.locator('.replay-console')).toContainText('The 3D preview could not load.');
  await expect(page.locator('.replay-console').getByRole('link', { name: 'Try live demo' })).toHaveAttribute('href', demoUrl);
  await expect(page.getByRole('button', { name: 'Retry 3D replay', exact: true })).toBeEnabled();
  await expect(page.locator('iframe[title="CourtVision 3D replay"]')).toHaveCount(0);
  await expect(page.locator('.replay-poster')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the CourtVision demo is available from the case, Quick view, and arena projects', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of ['work/courtvision/', 'overview/', '#arena-projects']) {
    await page.goto(route);
    if (route.startsWith('#')) await expect(page.locator('.arena-experience')).toHaveAttribute('data-phase', 'section');
    const demo = page.locator(`a[href="${demoUrl}"]`).first();
    await expect(demo, route).toBeVisible();
    await expect(demo, route).toHaveAttribute('target', '_blank');
    await expect(demo, route).toHaveAttribute('rel', /noopener/);
  }
});
