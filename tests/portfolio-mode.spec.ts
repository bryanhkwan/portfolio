import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const mode = (page: Page) => page.getByRole('navigation', { name: 'Portfolio view', exact: true });
const projectCases = ['courtvision', 'basketball', 'astros', 'volleyball'];
const savedView = (page: Page) => page.evaluate(() => localStorage.getItem('portfolio-view'));

async function quickView(page: Page) {
  await expect(page).toHaveURL(/\/overview\/(?:#.*)?$/);
  await expect(mode(page).getByRole('link', { name: 'Quick view', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('h1')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('mode choices persist while browser history and explicit arena links retain their destinations', async ({ page }) => {
  await page.goto('');
  await mode(page).getByRole('link', { name: 'Quick view', exact: true }).click();
  await quickView(page);
  expect(await savedView(page)).toBe('quick');

  // A cached preference must not bounce Back straight into the page being left.
  await page.goBack();
  await expect(page).toHaveURL(/\/portfolio\/$/);
  await expect(mode(page).getByRole('link', { name: 'Interactive', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await savedView(page)).toBe('quick');
  await page.goForward();
  await quickView(page);

  await page.locator('a[href="/portfolio/work/courtvision/"]').first().click();
  await expect(page).toHaveURL(/\/work\/courtvision\/$/);
  const returnLink = page.locator('[data-portfolio-return]');
  await expect(returnLink).toHaveText(/Back to Quick view/);
  await expect(returnLink).toHaveAttribute('href', '/portfolio/overview/#projects');
  await returnLink.click();
  await quickView(page);
  await expect(page.locator('#projects')).toBeInViewport();

  await page.goto('');
  await quickView(page);
  await expect(page.locator('canvas, astro-island')).toHaveCount(0);

  // A shared destination is more specific than the visitor's saved landing view.
  await page.goto('#arena-research');
  await expect(page).toHaveURL(/#arena-research$/);
  await expect(page.locator('.arena-experience')).toHaveAttribute('data-phase', 'section');
  await expect(page.locator('.arena-chapter')).toHaveAttribute('data-chapter', 'research');
  expect(await savedView(page)).toBe('quick');

  await mode(page).getByRole('link', { name: 'Quick view', exact: true }).click();
  await quickView(page);
  // Modified clicks may open another tab; they must not change this tab's preference.
  await page.evaluate(() => {
    const preventNavigation = (event: Event) => event.preventDefault();
    window.addEventListener('click', preventNavigation, { once: true });
    document.querySelector<HTMLAnchorElement>('[data-portfolio-view="arena"]')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }),
    );
  });
  expect(await savedView(page)).toBe('quick');
  await mode(page).getByRole('link', { name: 'Interactive', exact: true }).click();
  await expect(page).toHaveURL(/#arena-home$/);
  expect(await savedView(page)).toBe('arena');
  await page.goto('');
  await expect(page).toHaveURL(/\/portfolio\/$/);
  await expect(mode(page).getByRole('link', { name: 'Interactive', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('Quick view exposes the evidence and contact links without a 3D runtime or animation', async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const errors: string[] = [], interactiveRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', resource => {
    if (/\/_astro\/[^/]*(?:SavageArena|ArenaChapter|CourtReplay|three|gsap|react|client|engine|journey)[^/]*\.js(?:\?|$)/i.test(resource.url())) {
      interactiveRequests.push(resource.url());
    }
  });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    const scope = window as Window & { portfolioWebGLRequests?: number };
    scope.portfolioWebGLRequests = 0;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
      if (String(args[0]).startsWith('webgl') || args[0] === 'experimental-webgl') scope.portfolioWebGLRequests!++;
      return Reflect.apply(original, this, args);
    } as typeof original;
  });
  await page.goto('overview/');
  await quickView(page);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('canvas, astro-island, video[autoplay], audio[autoplay]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { portfolioWebGLRequests?: number }).portfolioWebGLRequests)).toBe(0);
  expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  expect(interactiveRequests).toEqual([]);
  expect(await savedView(page), 'Opening a shared Quick view link must not silently change a preference').toBeNull();
  for (const id of ['projects', 'experience', 'research', 'about', 'contact']) {
    await expect(page.locator(`#${id}`)).toBeVisible();
  }
  for (const name of ['CourtVision', 'University of Toledo', 'Modern Builders']) {
    await expect(page.locator('main')).toContainText(name);
  }
  for (const project of projectCases) {
    const link = page.locator(`a[href="/portfolio/work/${project}/"]`).first();
    await expect(link).toBeVisible();
    expect((await request.get(`work/${project}/`)).status(), project).toBe(200);
  }
  const resume = page.locator('a[href$="BryanKwan_Updated_Resume.pdf"]').first();
  await expect(resume).toBeVisible();
  expect((await request.head('BryanKwan_Updated_Resume.pdf')).status()).toBe(200);
  await expect(page.locator('a[href^="mailto:"]').first()).toBeVisible();
  await expect(page.locator('a[href="https://www.linkedin.com/in/bryanhkwan/"]').first()).toBeVisible();
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations.map(v => ({ id: v.id, nodes: v.nodes.map(node => node.target) }))).toEqual([]);
  expect(errors).toEqual([]);
});

test('Quick view and its native mode links remain useful without JavaScript', async ({ browser, baseURL, isMobile }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: isMobile ? { width: 360, height: 800 } : { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await page.goto(new URL('overview/', baseURL).href);
    await quickView(page);
    await expect(page.locator('canvas, astro-island')).toHaveCount(0);
    for (const id of ['projects', 'experience', 'research', 'about', 'contact']) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
    for (const project of projectCases) {
      await expect(page.locator(`a[href="/portfolio/work/${project}/"]`).first()).toBeVisible();
    }
    await mode(page).getByRole('link', { name: 'Interactive', exact: true }).click();
    await expect(page).toHaveURL(/#arena-home$/);
    await expect(page.locator('.arena-poster')).toBeVisible();
    await mode(page).getByRole('link', { name: 'Quick view', exact: true }).click();
    await quickView(page);
    await page.locator('a[href="/portfolio/work/basketball/"]').first().click();
    await expect(page.locator('h1')).toBeVisible();
    const quickLink = page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Quick view', exact: true });
    await expect(quickLink).toBeVisible();
    await quickLink.click();
    await quickView(page);
  } finally {
    await context.close();
  }
});

test('blocking browser storage does not break mode navigation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    for (const name of ['getItem', 'setItem']) {
      Object.defineProperty(Storage.prototype, name, {
        configurable: true,
        value: () => { throw new DOMException('Storage is unavailable', 'SecurityError'); },
      });
    }
  });
  await page.goto('overview/');
  await quickView(page);
  await mode(page).getByRole('link', { name: 'Interactive', exact: true }).click();
  await expect(page).toHaveURL(/#arena-home$/);
  await expect(page.locator('.arena-experience')).toHaveAttribute('data-status', 'ready');
  await mode(page).getByRole('link', { name: 'Quick view', exact: true }).click();
  await quickView(page);
  expect(errors).toEqual([]);
});

test('mode controls stay reachable on small screens and Quick view scrolls and prints as a normal document', async ({ page }) => {
  for (const viewport of [{ width: 320, height: 720 }, { width: 360, height: 800 }, { width: 844, height: 390 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await page.goto('overview/');
    await page.evaluate(() => document.fonts.ready);
    await quickView(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${viewport.width}px must not scroll sideways`).toBe(true);
    for (const name of ['Interactive', 'Quick view']) {
      const link = mode(page).getByRole('link', { name, exact: true });
      await expect(link).toBeInViewport();
      const bounds = await link.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(40);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await page.evaluate(() => scrollY), 'Quick view must have ordinary document scrolling').toBeGreaterThan(100);
    await expect(page.locator('#contact')).toBeInViewport();
    await expect(mode(page).getByRole('link', { name: 'Interactive', exact: true })).toBeInViewport();
    await page.goto('#arena-home');
    for (const name of ['Interactive', 'Quick view']) {
      await expect(mode(page).getByRole('link', { name, exact: true })).toBeInViewport();
    }
  }

  await page.goto('overview/');
  await page.emulateMedia({ media: 'print' });
  for (const id of ['projects', 'experience', 'research', 'about', 'contact']) {
    await expect(page.locator(`#${id}`)).toBeVisible();
  }
  expect(await page.evaluate(() => [document.documentElement, document.body, document.querySelector('main')!].every(element => {
    const style = getComputedStyle(element);
    return style.overflowY !== 'hidden' && style.overflowY !== 'clip' && style.position !== 'fixed';
  })), 'Printing must not clip the overview into the arena viewport').toBe(true);
  expect(await page.locator('header').first().evaluate(element => {
    const style = getComputedStyle(element);
    return style.display === 'none' || !['fixed', 'sticky'].includes(style.position);
  }), 'Print must not repeat a sticky header over the evidence').toBe(true);
});
