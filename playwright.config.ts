import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
const executablePath = process.env.PLAYWRIGHT_CHROME_PATH;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  use: { baseURL, trace: 'retain-on-failure', ...devices['Desktop Chrome'], ...(executablePath ? { launchOptions: { executablePath } } : {}) },
  webServer: process.env.PLAYWRIGHT_NO_SERVER
    ? undefined
    : { command: 'pnpm start', url: baseURL, reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
