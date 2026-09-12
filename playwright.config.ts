import { defineConfig, devices } from '@playwright/test';
const external = process.env.TEST_BASE_URL;
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', fullyParallel: true,
  timeout: 45000, expect: { timeout: 8000 }, retries: process.env.CI ? 1 : 0,
  workers: 2, reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: external || 'http://127.0.0.1:4322/portfolio/', channel: process.env.CI ? undefined : 'chrome',
    // GitHub runners have no GPU; explicitly enable software WebGL for the arena.
    launchOptions: process.env.CI ? { args: ['--enable-unsafe-swiftshader'] } : undefined,
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: external ? undefined : { command: 'npm run preview -- --port 4322 --ignore-lock', env: { ASTRO_PREVIEW_BACKGROUND: '1' }, url: 'http://127.0.0.1:4322/portfolio/', reuseExistingServer: !process.env.CI, timeout: 30000 },
});
