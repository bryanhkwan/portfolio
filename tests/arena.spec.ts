import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const destinations = ['projects', 'experience', 'research', 'about', 'contact'] as const;
const headings = ['A different angle on the game.', 'Where the work meets the world.', 'Talent is global. Opportunity is local.', 'Rooted in Toledo. Always curious.', 'Let’s build the next chapter.'];
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

test.beforeEach(async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (isMobile) await page.setViewportSize({ width: 360, height: 800 });
});

test('the entrance moves the actual camera, reveals the roof, and can be skipped', async ({ page }) => {
  const problems = errors(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await ready(page);
  const arena = page.locator('.arena-experience'), canvas = arena.locator('canvas');
  const position = await canvas.getAttribute('data-camera-position');
  await page.getByRole('link', { name: 'Enter the arena', exact: true }).click();
  await expect(arena).toHaveAttribute('data-phase', 'entering');
  await expect.poll(() => canvas.getAttribute('data-camera-position')).not.toBe(position);
  await page.getByRole('button', { name: 'Skip entrance' }).click();
  await settled(page, 'overview');
  await expect(canvas).toHaveAttribute('data-roof-visible', 'false');
  await expect(canvas).toHaveAttribute('data-scoreboard-visible', 'true');
  await expect(page.locator('[data-anchor]:visible')).toHaveCount(5);
  expect(problems).toEqual([]);
});

test('every stadium location changes the rendered view, opens its content, and returns focus', async ({ page }, testInfo) => {
  const problems = errors(page); await ready(page);
  await page.getByRole('link', { name: 'Enter the arena', exact: true }).click(); await settled(page, 'overview');
  const canvas = page.locator('.arena-canvas-host canvas');
  for (const [index, id] of destinations.entries()) {
    const overview = await canvas.screenshot({ scale: 'css' });
    await page.locator(`[data-anchor="${id}"]`).click(); await settled(page, 'section');
    await expect(page.locator('#arena-chapter-title')).toHaveText(headings[index]);
    await expect(page.locator('#arena-chapter-title')).toBeFocused();
    expect(await page.evaluate(() => {
      const panel = document.querySelector('.arena-chapter')!.getBoundingClientRect();
      const nav = document.querySelector('.arena-navigation-shell')!.getBoundingClientRect();
      return nav.top >= panel.bottom;
    }), 'Section navigation must not overlap the reading panel').toBe(true);
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

test('selecting the court geometry opens Projects without a label click', async ({ page }) => {
  await ready(page, '#arena-overview'); await settled(page, 'overview');
  const scene = (await page.locator('.arena-scene').boundingBox())!;
  const leader = page.locator('[data-leader="projects"]');
  await page.mouse.click(scene.x + Number(await leader.getAttribute('x1')) + 8, scene.y + Number(await leader.getAttribute('y1')) + 9);
  await settled(page, 'section');
  await expect(page.locator('.arena-chapter')).toHaveAttribute('data-chapter', 'projects');
});

test('deep links, Back and Forward, refresh, and interrupted travel restore the correct section', async ({ page }) => {
  const problems = errors(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await ready(page, '#arena-projects');
  await settled(page, 'section');
  await page.locator('.arena-chapter-nav [data-destination="experience"]').click();
  await page.locator('.arena-chapter-nav [data-destination="research"]').click();
  await page.locator('.arena-chapter-nav [data-destination="contact"]').click(); await settled(page, 'section');
  await expect(page.locator('.arena-chapter')).toHaveAttribute('data-chapter', 'contact');
  await page.goBack(); await settled(page, 'section');
  await expect(page.locator('.arena-chapter')).toHaveAttribute('data-chapter', 'research');
  await page.goForward(); await expect(page.locator('.arena-chapter')).toHaveAttribute('data-chapter', 'contact');
  await page.reload(); await settled(page, 'section');
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
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.locator('[data-anchor]').evaluateAll(links => links.every(link => {
      const r = link.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.height >= 44;
    }))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
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
  await page.locator('.arena-chapter-nav [data-destination="contact"]').click();
  await expect(page.locator('.arena-chapter').getByRole('link', { name: /bryan.kwan@/ })).toHaveAttribute('href', 'mailto:bryan.kwan@rockets.utoledo.edu');
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
