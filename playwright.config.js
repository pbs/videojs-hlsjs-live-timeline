// Drives the demo's production build, as deployed. The stream is a real test channel, so these need network access.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5176',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } }],
  webServer: {
    command: 'npm run build:demo && npm run preview:demo',
    url: 'http://localhost:5176/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
