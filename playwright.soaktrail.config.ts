import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/soaktrail-specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,

  use: {
    baseURL: 'http://localhost:4322',
    trace: 'on-first-retry',
  },

  webServer: {
    command: 'cd sites/soaktrail && npx astro dev --port 4322',
    url: 'http://localhost:4322',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
