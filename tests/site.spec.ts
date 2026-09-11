import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const routes = ['', 'work/', 'work/basketball/', 'work/courtvision/', 'work/astros/', 'work/volleyball/', 'research/', 'about/'];
test('all pages render without runtime errors, broken resources, or horizontal overflow', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400 && new URL(response.url()).origin === new URL(testInfo.project.use.baseURL as string || 'http://127.0.0.1:4322').origin) errors.push(`${response.status()} ${response.url()}`); });
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.locator('h1')).toBeVisible();
    await page.locator('.site-footer').scrollIntoViewIfNeeded();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), { message: `Overflow on ${route}` }).toBe(true);
  }
  expect(errors).toEqual([]);
});
test('scouting priorities change the actual ranking and shot controls update accessible output', async ({ page }) => {
  await page.goto('');
  await page.locator('.scouting-lab').scrollIntoViewIfNeeded();
  const priority = page.getByLabel('What does the team need?');
  await expect(priority).toBeEnabled();
  await expect(page.locator('.rank-row').first()).toContainText('Sample B');
  await priority.selectOption('shooting');
  await expect(page.locator('.rank-row').first()).toContainText('Sample A');
  await expect(page.locator('.rank-row').first()).toContainText('82.4');
  await priority.selectOption('defense');
  await expect(page.locator('.rank-row').first()).toContainText('Sample C');
  await page.getByText('How the score works').click();
  await expect(page.getByText(/defense × 0.70/)).toBeVisible();
  await page.getByRole('button', { name: 'Shot profile', exact: true }).click();
  await page.getByLabel('Player', { exact: true }).selectOption('a');
  await expect(page.locator('.shot-court')).toHaveAttribute('aria-label', /Sample A/);
  await page.getByRole('button', { name: 'Zones', exact: true }).click();
  await expect(page.locator('.shot-court')).toHaveAttribute('aria-label', /Left side: \d+ attempts; Interior:/);
  await expect(page.locator('.zone-count')).toHaveCount(4);
});
test('project filters and the updated CourtVision case lead to the intended content', async ({ page }) => {
  await page.goto('work/');
  await page.getByRole('button', { name: 'Vision', exact: true }).click();
  await expect(page.locator('.index-project:visible')).toHaveCount(1);
  await expect(page.locator('.result-count')).toHaveText('1 project');
  await page.getByRole('button', { name: 'All work', exact: true }).click();
  await expect(page.locator('.index-project:visible')).toHaveCount(9);
  const privateRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('courtvision.bryanhkwan.workers.dev') || request.url().endsWith('.mp4')) privateRequests.push(request.url()); });
  await page.goto('work/courtvision/');
  await expect(page.locator('h1')).toHaveText('CourtVision.');
  await expect(page.locator('.replay-console')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Coach sign in' })).toHaveAttribute('href', 'https://courtvision.bryanhkwan.workers.dev/v2/');
  await expect(page.locator('video, img[src*="compvision/"]')).toHaveCount(0);
  await expect(page.locator('#approach')).toContainText('Keep the teaching moment.');
  expect(privateRequests).toHaveLength(0);
});
test('legacy URLs and document links remain available', async ({ page, request }) => {
  await page.goto('projects.html#basketball');
  await expect(page).toHaveURL(/\/work\/#basketball$/);
  await page.goto('computer-vision.html');
  await expect(page).toHaveURL(/\/work\/courtvision\/$/);
  await page.goto('proof.html');
  await expect(page).toHaveURL(/\/work\/basketball\/#validation$/);
  for (const resource of ['BryanKwan_Updated_Resume.pdf', 'recommendation.pdf', 'mac-tournament-model-validation.html.pdf', 'talent-environment-research.pdf', 'compvision/all_players.png']) {
    const response = await request.head(resource); expect(response.status(), resource).toBe(200);
  }
});
test('keyboard navigation and mobile menu are usable', async ({ page, isMobile }) => {
  await page.goto('');
  if (!isMobile) { await page.keyboard.press('Tab'); await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused(); }
  if (isMobile) {
    const toggle = page.locator('.menu-toggle');
    await toggle.click(); await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Work', exact: true })).toBeVisible();
    await page.keyboard.press('Escape'); await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  }
  await page.locator('.scouting-lab').scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Shot profile', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Shot profile', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.shot-court')).toBeVisible();
});
test('core routes and interactive states pass automated accessibility checks', async ({ page }) => {
  for (const route of ['', 'work/', 'work/courtvision/', 'work/astros/', 'research/', 'about/']) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), route).toEqual([]);
  }
});
test('the portfolio is readable and navigable without JavaScript', async ({ browser, baseURL, isMobile }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: isMobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(baseURL!);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.replay-court')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play sample replay' })).toBeDisabled();
  await expect(page.locator('.rank-row').first()).toContainText('Sample B');
  await expect(page.getByRole('button', { name: 'Shot profile', exact: true })).toBeDisabled();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Work', exact: true })).toBeVisible();
  await page.goto(new URL('work/', baseURL).href);
  await expect(page.locator('.index-project:visible')).toHaveCount(9);
  await expect(page.getByRole('button', { name: 'Vision', exact: true })).toBeDisabled();
  await context.close();
});
test('reduced motion and representative layouts', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('');
  await expect(page.getByRole('button', { name: 'Play sample replay' })).toBeEnabled();
  expect(await page.locator('.hero-line > span').first().evaluate(el => getComputedStyle(el).transform)).toBe('none');
  await page.screenshot({ path: testInfo.outputPath('courtside-home.png'), fullPage: true, scale: 'css' });
  await page.locator('.scouting-lab').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Shot profile', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('courtside-shot-profile.png'), fullPage: false, scale: 'css' });
  await page.goto('work/astros/');
  await page.locator('#evidence').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('courtside-case-study.png'), fullPage: true, scale: 'css' });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('work/courtvision/');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('');
    await page.evaluate(() => document.fonts.ready);
    expect(await page.locator('.hero-line > span').evaluateAll(elements => elements.every(el => {
      const range = document.createRange(); range.selectNodeContents(el);
      return range.getBoundingClientRect().width <= el.getBoundingClientRect().width + 1;
    })), `Hero text must fit at ${width}px`).toBe(true);
  }
});

test('CourtVision walkthrough responds to view, time and teaching-moment controls', async ({ page }) => {
  await page.goto('');
  const time = page.getByRole('slider', { name: 'Replay time' });
  await expect(time).toBeEnabled();
  await time.fill('4.8');
  await expect(page.locator('.replay-time')).toHaveText('00:04.8');
  await expect(page.locator('.console-note')).toContainText('weak-side player');
  await page.getByRole('button', { name: 'Movement', exact: true }).click();
  await expect(page.locator('.replay-court polyline')).toHaveCount(6);
  await page.getByRole('button', { name: 'Mark moment' }).click();
  await expect(page.getByRole('status')).toContainText('00:04.8');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('.saved-moment')).toHaveCount(0);
  await page.getByRole('button', { name: 'Shot map', exact: true }).click();
  await expect(page.locator('.replay-court')).toHaveAttribute('aria-label', /7 makes and 5 misses/);
  await expect(time).toHaveCount(0);
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await expect(time).toHaveValue('4.8');
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
});

test('replay is user-controlled and pauses when the stage leaves view', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('');
  const time = page.getByRole('slider', { name: 'Replay time' });
  await expect(time).toBeEnabled();
  await expect(time).toHaveValue('2.4');
  await page.getByRole('button', { name: 'Play sample replay' }).click();
  await expect.poll(async()=>Number(await time.inputValue())).toBeGreaterThan(2.5);
  await page.getByRole('button', { name: 'Pause sample replay' }).click();
  const paused = await time.inputValue();
  await page.waitForTimeout(150);
  expect(await time.inputValue()).toBe(paused);
  await page.getByRole('button', { name: 'Play sample replay' }).click();
  await page.locator('.site-footer').scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Play sample replay' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Pause sample replay' })).toHaveCount(0);
});
