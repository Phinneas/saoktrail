import { defineConfig, devices } from '@playwright/test';

// Separate config for soaktrail.com-specific regression tests (tests/soaktrail-specs/).
// The root playwright.config.ts only scans tests/specs and serves the desert site's
// static dist/ — it never picks these up, so this suite was never actually run.
export default defineConfig({
  testDir: './tests/soaktrail-specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,

  use: {
    baseURL: 'http://localhost:4325',
    trace: 'on-first-retry',
  },

  webServer: {
    command: 'cd sites/soaktrail && npx astro dev --port 4325',
    url: 'http://localhost:4325',
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
