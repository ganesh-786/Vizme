import { test, expect } from '@playwright/test';

test.describe('auth smoke - unauthenticated guards', () => {
  test('protected route redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/sites');

    await expect
      .poll(() => page.url(), { timeout: 20_000 })
      .toMatch(/(\/login$|\/realms\/)/);
  });

  test('guest login route is reachable when unauthenticated', async ({ page }) => {
    await page.goto('/login');

    await expect
      .poll(() => page.url(), { timeout: 20_000 })
      .toMatch(/(\/login$|\/realms\/)/);
  });
});
