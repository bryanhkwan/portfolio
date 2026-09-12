import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const destinations = ['projects', 'experience', 'research', 'about', 'contact'] as const;
async function ready(page: Page, hash = '') {
  await page.goto(hash || '');
  await expect(page.locator('.arena-experience')).toHaveAttribute('data-status', 'ready');
  await page.evaluate(() => document.fonts.ready);
}
async function settled(page: Page, phase: string) {
  await expect(page.locator('.arena-experience')).toHaveAttribute('data-phase', phase);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
function errors(page: Page) { const list: string[] = []; page.on('pageerror', error => list.push(error.message)); return list; }
async function viewportOnly(page: Page) {
  expect(await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - innerWidth,
    vertical: document.documentElement.scrollHeight - innerHeight,
    x: scrollX, y: scrollY,
  }))).toEqual({ horizontal: 0, vertical: 0, x: 0, y: 0 });
}
async function readableDisplay(page: Page) {
  const display = page.locator('[data-arena-display]');
  await expect(display).toBeVisible();
  await expect(page.locator('.arena-reading-scroll')).toHaveCount(1);
  const geometry = await display.evaluate(el => {
    const r = el.getBoundingClientRect();
    const nav = document.querySelector('.arena-navigation-shell')!.getBoundingClientRect();
    return { destination: document.querySelector('.arena-experience')!.getAttribute('data-destination'),
      viewport: [innerWidth, innerHeight], screen: { x: r.x, y: r.y, width: r.width, height: r.height }, navTop: nav.top,
      large: r.width >= innerWidth * .75 && r.height >= Math.min(320, innerHeight * .52),
      contained: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= nav.top + 1 };
  });
  expect(geometry, 'The reading screen must fill the view while preserving its navigation').toMatchObject({ large: true, contained: true });
  const scrolling = page.locator('.arena-reading-scroll');
  expect(await scrolling.locator('p').evaluateAll(paragraphs => paragraphs.some(paragraph =>
    parseFloat(getComputedStyle(paragraph).fontSize) >= (innerWidth >= 1000 ? 18 : 16)
  )), 'The destination must offer comfortable body text, not a scaled-down miniature').toBe(true);
  await scrolling.evaluate(el => { el.scrollTop = el.scrollHeight; });
  expect(await scrolling.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop < 2)).toBe(true);
  const lastLink = scrolling.getByRole('link').last();
  await lastLink.focus();
  await expect(lastLink).toBeInViewport();
  await viewportOnly(page);
}

test.beforeEach(async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (isMobile) await page.setViewportSize({ width: 360, height: 800 });
});

test('entrance and film-room flights move the camera, survive resize, and support skipping', async ({ page }) => {
  const problems = errors(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await ready(page);
  const arena = page.locator('.arena-experience'), canvas = arena.locator('canvas');
  const position = await canvas.getAttribute('data-camera-position');
  await page.getByRole('link', { name: 'Enter the arena', exact: true }).click();
  await settled(page, 'overview');
  expect(await canvas.getAttribute('data-camera-position')).not.toBe(position);
  await expect(canvas).toHaveAttribute('data-roof-visible', 'false');
  await expect(canvas).toHaveAttribute('data-scoreboard-visible', 'true');
  await expect(page.locator('[data-anchor]:visible')).toHaveCount(5);
  await page.getByRole('link', { name: 'Return to Home Court entrance', exact: true }).click();
  await settled(page, 'exterior');
  // Activate the real Skip button as it appears. Protocol/scroll checks on a software GPU
  // can themselves outlast the entire 2.7s entrance, so observe this transient control in-page.
  const skipped = await page.evaluate(() => new Promise<boolean>(resolve => {
    const root = document.querySelector('.arena-experience')!;
    const observer = new MutationObserver(() => {
      const skip = root.querySelector<HTMLButtonElement>('.arena-travel-status button');
      if (skip?.textContent?.includes('Skip entrance')) { observer.disconnect(); clearTimeout(timeout); skip.click(); resolve(true); }
    });
    const timeout = setTimeout(() => { observer.disconnect(); resolve(false); }, 5000);
    observer.observe(root, { childList: true, subtree: true });
    root.querySelector<HTMLAnchorElement>('.arena-enter')!.click();
  }));
  expect(skipped).toBe(true); await settled(page, 'overview');

  const viewport = page.viewportSize()!;
  const resized = { width: viewport.width > 500 ? viewport.width - 80 : viewport.width + 10, height: viewport.height - 40 };
  // Resize from the actual transition event, rather than waiting for an automation
  // round trip that can itself outlast a camera flight on a software GPU.
  await page.exposeFunction('resizeArenaDuringFlight', () => page.setViewportSize(resized));
  await page.evaluate(() => {
    const root = document.querySelector('.arena-experience')!;
    const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
    const observed = window as unknown as Window & {
      resizeArenaDuringFlight(): Promise<void>;
      arenaFlightResized?: boolean;
      arenaFlightFrames?: { position: string; time: number; width: number; height: number }[];
      stopArenaFlightObserver?: () => void;
    };
    observed.arenaFlightFrames = []; observed.arenaFlightResized = false;
    let requested = false, previousRender = canvas.dataset.renderCount;
    const observer = new MutationObserver(() => {
      if (root.getAttribute('data-phase') !== 'travelling') return;
      if (!requested) {
        requested = true;
        void observed.resizeArenaDuringFlight().then(() => { observed.arenaFlightResized = true; });
      }
      if (canvas.dataset.renderCount === previousRender) return;
      previousRender = canvas.dataset.renderCount;
      observed.arenaFlightFrames!.push({ position: canvas.dataset.cameraPosition!, time: performance.now(), width: innerWidth, height: innerHeight });
    });
    observer.observe(root, { attributes: true, subtree: true });
    observed.stopArenaFlightObserver = () => observer.disconnect();
  });
  await page.locator('.arena-chapter-nav [data-destination="research"]').click();
  await settled(page, 'section');
  await expect.poll(() => page.evaluate(() => (window as Window & { arenaFlightResized?: boolean }).arenaFlightResized)).toBe(true);
  const frames = await page.evaluate(() => {
    const observed = window as Window & {
      arenaFlightFrames?: { position: string; time: number; width: number; height: number }[];
      stopArenaFlightObserver?: () => void;
    };
    observed.stopArenaFlightObserver?.(); return observed.arenaFlightFrames!;
  });
  const afterResize = frames.filter(frame => frame.width === resized.width && frame.height === resized.height);
  expect(new Set(afterResize.map(frame => frame.position)).size, 'Resizing must preserve at least two distinct moving camera frames before the reading view').toBeGreaterThanOrEqual(2);
  expect(afterResize.at(-1)!.time).toBeGreaterThan(afterResize[0].time);
  await expect(page.locator('.arena-chapter')).toHaveAttribute('data-chapter', 'research');
  await readableDisplay(page);
  expect(problems).toEqual([]);
});

test('every stadium location changes the rendered view, opens its content, and returns focus', async ({ page }, testInfo) => {
  const problems = errors(page); await ready(page);
  await page.getByRole('link', { name: 'Enter the arena', exact: true }).click(); await settled(page, 'overview');
  const canvas = page.locator('.arena-canvas-host canvas');
  for (const id of destinations) {
    const overview = await canvas.screenshot({ scale: 'css' });
    await page.locator(`[data-anchor="${id}"]`).click(); await settled(page, 'section');
    await expect(page.locator('.arena-chapter')).toHaveAttribute('data-chapter', id);
    await expect(page.locator('#arena-chapter-title')).not.toBeEmpty();
    await expect(page.locator('#arena-chapter-title')).toBeFocused();
    await readableDisplay(page);
    await expect(page.locator(`.arena-chapter-nav [data-destination="${id}"]`)).toHaveAttribute('aria-current', 'location');
    expect((await canvas.screenshot({ scale: 'css' })).equals(overview), `${id} must change the actual rendered image`).toBe(false);
    await page.locator('.arena-chapter').screenshot({ path: testInfo.outputPath(`${id}.png`), scale: 'css' });
    await page.getByRole('button', { name: 'Close section and return to arena overview' }).click(); await settled(page, 'overview');
    await expect(page.locator(`[data-anchor="${id}"]`)).toBeFocused();
  }
  expect(problems).toEqual([]);
});

test('project selection and the full CourtVision round trip keep working links', async ({ page }) => {
  await ready(page);
  await page.getByRole('link', { name: 'Or go straight to the projects' }).click(); await settled(page, 'section');
  const panel = page.locator('.arena-chapter');
  for (const [name, path] of [['Basketball', 'basketball'], ['Astros', 'astros'], ['Volleyball', 'volleyball']]) {
    await panel.getByRole('button', { name, exact: true }).click();
    await expect(panel.locator('.arena-primary-link')).toHaveAttribute('href', `/portfolio/work/${path}/`);
  }
  await panel.getByRole('button', { name: 'CourtVision', exact: true }).click();
  await panel.getByRole('link', { name: 'Explore CourtVision' }).click();
  await expect(page).toHaveURL(/\/work\/courtvision\/$/);
  await expect(page.locator('.replay-console')).toBeVisible();
  await page.getByRole('link', { name: 'Return to Home Court' }).click();
  await expect(page).toHaveURL(/#arena-projects$/); await settled(page, 'section');
  await expect(page.locator('.arena-chapter')).toContainText('CourtVision');
});

test('jumbotron roles, film-room chapters, and story-wall chapters update their steady displays', async ({ page }) => {
  await ready(page, '#arena-experience'); await settled(page, 'section');
  const panel = page.locator('.arena-chapter');
  const canvas = page.locator('.arena-canvas-host canvas');
  const experienceCamera = await canvas.getAttribute('data-camera-position');
  await expect(page.locator('#arena-chapter-title')).toContainText('University of Toledo');
  await panel.getByRole('group', { name: 'Experience employer' }).getByRole('button', { name: 'Modern Builders Supply', exact: true }).click();
  await expect(page.locator('#arena-chapter-title')).toContainText('Modern Builders');
  await expect(panel).toContainText('SQL-driven workflows');
  await expect(panel.getByRole('link', { name: /Recommendation letter/ })).toHaveAttribute('href', '/portfolio/recommendation.pdf');
  await panel.getByRole('button', { name: 'Toledo Athletics', exact: true }).click();
  await expect(page.locator('#arena-chapter-title')).toContainText('University of Toledo');
  expect(await canvas.getAttribute('data-camera-position')).toBe(experienceCamera);

  await page.locator('.arena-chapter-nav [data-destination="research"]').click(); await settled(page, 'section');
  const researchCamera = await canvas.getAttribute('data-camera-position');
  for (const name of ['Approach', 'Findings', 'Limitations', 'Question']) {
    const button = panel.getByRole('group', { name: 'Research chapters' }).getByRole('button', { name, exact: true });
    await button.click(); await expect(button).toHaveAttribute('aria-pressed', 'true');
    if (name === 'Approach') await expect(panel).toContainText('217');
    if (name === 'Findings') await expect(panel.locator('.arena-research-chart img')).toHaveAttribute('src', /nba-players-by-country\.png$/);
    if (name === 'Limitations') await expect(panel).toContainText('The relationships are correlational');
    if (name === 'Question') await expect(page.locator('#arena-chapter-title')).toContainText('Talent is global.');
    expect(await canvas.getAttribute('data-camera-position')).toBe(researchCamera);
    await viewportOnly(page);
  }
  await expect(panel.getByRole('link', { name: 'Manuscript (PDF)' })).toHaveAttribute('href', '/portfolio/talent-environment-research.pdf');

  await page.locator('.arena-chapter-nav [data-destination="about"]').click(); await settled(page, 'section');
  const aboutCamera = await canvas.getAttribute('data-camera-position');
  await panel.getByRole('button', { name: 'Education', exact: true }).click();
  await expect(panel).toContainText('Marketing & Professional Sales');
  await panel.getByRole('button', { name: 'How I work', exact: true }).click();
  await expect(panel).toContainText('Find the decision.');
  expect(await canvas.getAttribute('data-camera-position')).toBe(aboutCamera);
});

test('selecting the court and jumbotron geometry opens their destinations without a label click', async ({ page }) => {
  await ready(page, '#arena-overview'); await settled(page, 'overview');
  for (const id of ['experience', 'projects']) {
    const scene = (await page.locator('.arena-scene').boundingBox())!;
    const leader = page.locator(`[data-leader="${id}"]`);
    const x = scene.x + Number(await leader.getAttribute('x1'));
    const y = scene.y + Number(await leader.getAttribute('y1'));
    // Hide only the HTML hit targets for this test; the actual camera projection,
    // visible geometry, pointer events and raycaster remain in use.
    await page.locator('.arena-hotspots').evaluate(el => { (el as HTMLElement).style.pointerEvents = 'none'; });
    await page.locator('[data-anchor]').evaluateAll(links => links.forEach(link => { (link as HTMLElement).style.pointerEvents = 'none'; }));
    await page.mouse.click(x, y);
    await settled(page, 'section');
    await expect(page.locator('.arena-chapter')).toHaveAttribute('data-chapter', id);
    await page.getByRole('button', { name: 'Close section and return to arena overview' }).click();
    await settled(page, 'overview');
  }
});

test('deep links, Back and Forward, refresh, and interrupted travel restore the correct section', async ({ page }) => {
  const problems = errors(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await ready(page, '#arena-projects');
  await settled(page, 'section');
  await page.evaluate(() => {
    const root = document.querySelector('.arena-experience')!;
    const observed = window as Window & { readingVisibleDuringTravel?: boolean[] };
    observed.readingVisibleDuringTravel = [];
    new MutationObserver(() => {
      if (root.getAttribute('data-phase') !== 'travelling') return;
      const display = root.querySelector<HTMLElement>('[data-arena-display]');
      observed.readingVisibleDuringTravel?.push(Boolean(display?.querySelector('.arena-chapter')
        && display.checkVisibility({ opacityProperty: true, visibilityProperty: true })));
    }).observe(root, { attributes: true, childList: true, subtree: true });
  });
  await page.locator('.arena-chapter-nav [data-destination="experience"]').click();
  await page.locator('.arena-chapter-nav [data-destination="research"]').click();
  await page.locator('.arena-chapter-nav [data-destination="contact"]').click(); await settled(page, 'section');
  await expect(page.locator('.arena-chapter')).toHaveAttribute('data-chapter', 'contact');
  expect(await page.evaluate(() => (window as Window & { readingVisibleDuringTravel?: boolean[] }).readingVisibleDuringTravel)).not.toContain(true);
  await page.goBack(); await settled(page, 'section');
  await expect(page.locator('.arena-chapter')).toHaveAttribute('data-chapter', 'research');
  await page.goForward(); await expect(page.locator('.arena-chapter')).toHaveAttribute('data-chapter', 'contact');
  await page.reload(); await settled(page, 'section');
  await expect(page.locator('.arena-chapter')).toHaveAttribute('data-chapter', 'contact');
  await readableDisplay(page);
  await page.getByRole('link', { name: 'Skip to portfolio navigation', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('#arena-menu')))).toBe(true);
  await expect(page.locator('.arena-chapter')).toHaveAttribute('data-chapter', 'contact');
  await page.locator('.arena-canvas-host canvas').focus(); await page.keyboard.press('Home'); await settled(page, 'overview');
  await expect(page).toHaveURL(/#arena-overview$/);
  await page.locator('.arena-chapter-nav [data-destination="projects"]').click(); await settled(page, 'section');
  await page.locator('#arena-chapter-title').focus(); await page.keyboard.press('Escape'); await settled(page, 'overview');
  await page.keyboard.press('Escape'); await settled(page, 'exterior');
  await expect(page.getByRole('link', { name: 'Enter the arena', exact: true })).toBeFocused();
  expect(problems).toEqual([]);
});

test('overview labels fit small screens and all sections pass accessibility checks', async ({ page }, testInfo) => {
  await ready(page, '#arena-overview'); await settled(page, 'overview');
  for (const [width, height] of [[320, 700], [360, 800], [844, 390], [768, 900], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.locator('[data-anchor]').evaluateAll(links => links.every(link => {
      const r = link.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && r.height >= 44;
    }))).toBe(true);
    await viewportOnly(page);
  }
  const audit = async () => {
    const result = await new AxeBuilder({ page }).include('.arena-experience').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(node => node.target) }))).toEqual([]);
  };
  await audit();
  for (const id of destinations) {
    await page.locator(`.arena-chapter-nav [data-destination="${id}"]`).focus(); await page.keyboard.press('Enter'); await settled(page, 'section'); await audit();
  }
  await page.screenshot({ path: testInfo.outputPath('home-court-contact.png'), scale: 'css' });
});

test('the arena never scrolls the document and large displays remain usable in portrait and landscape', async ({ page }) => {
  test.setTimeout(90000);
  await ready(page);
  for (const [width, height] of [[1440, 900], [320, 700], [360, 800], [844, 390]]) {
    await page.setViewportSize({ width, height });
    const close = page.getByRole('button', { name: 'Close section and return to arena overview' });
    if (await close.isVisible()) { await close.click(); await settled(page, 'overview'); }
    await page.getByRole('link', { name: 'Return to Home Court entrance', exact: true }).click(); await settled(page, 'exterior');
    await page.mouse.move(width * .15, height * .45); await page.mouse.wheel(0, 1200);
    await page.keyboard.press('PageDown'); await viewportOnly(page);
    await page.getByRole('link', { name: 'Enter the arena', exact: true }).click(); await settled(page, 'overview');
    for (const id of destinations) {
      await page.locator(`.arena-chapter-nav [data-destination="${id}"]`).click(); await settled(page, 'section');
      await readableDisplay(page);
      const scroller = page.locator('.arena-reading-scroll');
      await scroller.evaluate(el => { el.scrollTop = 0; });
      const bounds = (await scroller.boundingBox())!;
      await page.mouse.move(bounds.x + bounds.width * .7, bounds.y + bounds.height * .7); await page.mouse.wheel(0, 3000);
      await viewportOnly(page);
    }
  }
});

test('HTML reading surfaces align with the physical destination screens', async ({ page }) => {
  await ready(page, '#arena-experience'); await settled(page, 'section');
  for (const id of destinations) {
    await page.locator(`.arena-chapter-nav [data-destination="${id}"]`).click(); await settled(page, 'section');
    await expect.poll(() => page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.arena-canvas-host canvas')!;
      const bounds = JSON.parse(canvas.dataset.screenBounds ?? 'null');
      if (!bounds) return false;
      const scene = document.querySelector('.arena-scene')!.getBoundingClientRect();
      const display = document.querySelector('[data-arena-display]')!.getBoundingClientRect();
      return Math.abs(display.x - scene.x - bounds.x) < 3 && Math.abs(display.y - scene.y - bounds.y) < 3
        && Math.abs(display.width - bounds.width) < 3 && Math.abs(display.height - bounds.height) < 3;
    }), { message: `${id} HTML content must sit on the modeled display` }).toBe(true);
  }
});

test('failed WebGL and context loss preserve section navigation and links', async ({ page }) => {
  const problems = errors(page);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: function (this: HTMLCanvasElement, id: string, ...args: unknown[]) {
      return id.includes('webgl') ? null : Reflect.apply(original, this, [id, ...args]);
    } });
  });
  await page.goto(''); await expect(page.locator('.arena-experience')).toHaveAttribute('data-status', 'fallback');
  await expect(page.locator('.arena-poster')).toBeVisible();
  await page.getByRole('link', { name: 'Enter the arena', exact: true }).click();
  await settled(page, 'overview');
  await expect(page.locator('.arena-chapter-nav [data-destination="projects"]')).toBeFocused();
  await page.locator('.arena-chapter-nav [data-destination="contact"]').click();
  await expect(page.locator('.arena-chapter').getByRole('link', { name: /bryan.kwan@/ })).toHaveAttribute('href', 'mailto:bryan.kwan@rockets.utoledo.edu');
  await readableDisplay(page);
  expect(problems).toEqual([]);
});

test('context loss during travel settles on readable content', async ({ page }) => {
  const problems = errors(page); await page.emulateMedia({ reducedMotion: 'no-preference' }); await ready(page, '#arena-overview');
  await page.locator('.arena-chapter-nav [data-destination="experience"]').click();
  await page.locator('canvas').first().evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await expect(page.locator('.arena-experience')).toHaveAttribute('data-status', 'fallback');
  await expect(page.locator('.arena-chapter')).toContainText('Modern Builders Supply');
  await page.locator('.arena-chapter-nav [data-destination="projects"]').click();
  await expect(page.locator('.arena-chapter')).toContainText('CourtVision'); expect(problems).toEqual([]);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('the illustrated hero and direct project route remain usable', async ({ page }) => {
    await page.goto(''); await expect(page.locator('.arena-poster')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('BRYAN KWAN');
    await page.getByRole('link', { name: 'Enter the arena', exact: true }).click();
    await expect(page).toHaveURL(/\/work\/$/); await expect(page.locator('.index-project')).toHaveCount(9);
  });
});
