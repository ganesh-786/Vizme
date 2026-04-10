import { defineConfig } from '@playwright/test';

/**
 * API-first Playwright layer: hits the Express backend directly.
 * E2E (browser + SPA) is intentionally not configured yet — add a project when approved.
 */
const apiBaseURL = process.env.PLAYWRIGHT_API_URL || 'http://localhost:3000';
const frontendOrigin =
  process.env.PLAYWRIGHT_FRONTEND_ORIGIN || 'http://localhost:5173';

export default defineConfig({
  testDir: './tests/api',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Auth routes use a strict rate limit (default 5/min); keep workers low unless you raise AUTH_RATE_LIMIT_MAX.
  workers: process.env.PW_WORKERS ? parseInt(process.env.PW_WORKERS, 10) : 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: apiBaseURL,
    extraHTTPHeaders: {
      Origin: frontendOrigin,
    },
  },
});
