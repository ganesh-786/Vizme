import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

function uniqueEmail(): string {
  const id = globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return `test+${id}@vizme-e2e.local`;
}

/**
 * Seeded auth has no access token; dashboard mount fires API calls that would
 * 401 → failed refresh → client logout. Stub the initial dashboard reads so the
 * session stays stable until we exercise the real Log Out control.
 */
async function stubDashboardReads(page: Page) {
  await page.route('**/api/v1/metric-configs', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET' || path !== '/api/v1/metric-configs') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [] }),
    });
  });

  await page.route('**/api/v1/api-keys', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET' || path !== '/api/v1/api-keys') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [] }),
    });
  });

  await page.route('**/api/v1/auth/onboarding-status', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          has_metric_configs: false,
          metric_configs_count: 0,
          has_api_key: false,
          onboarding_completed_at: null,
          is_setup_complete: false,
        },
      }),
    });
  });
}

async function stubLogoutPost(
  page: Page,
  options: { status: number; body?: string }
): Promise<void> {
  const { status, body = JSON.stringify({ success: false, error: 'logout failed' }) } = options;
  await page.route('**/api/v1/auth/logout', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      body,
    });
  });
}

async function stubDashboardAndLogoutApi(page: Page) {
  await stubDashboardReads(page);
  await stubLogoutPost(page, { status: 200, body: JSON.stringify({ success: true }) });
}

/** `/sites` (Properties) only loads this list; stub it so seeded auth is not cleared by 401/refresh. */
async function stubSitesListGet(page: Page) {
  await page.route('**/api/v1/sites', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET' || path !== '/api/v1/sites') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [] }),
    });
  });
}

async function openAccountMenuAndLogOut(page: Page) {
  await page.getByRole('button', { name: /account menu/i }).hover();
  await expect(page.getByRole('menu')).toBeVisible();
  await page
    .getByRole('menuitem', { name: /log out/i })
    .evaluate((el: HTMLElement) => el.click());
}

test.describe('Logout flow', () => {
  test('log out clears session and returns to login', async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          user: { id: 'e2e-logout-user', email: 'logout-e2e@vizme.local' },
        })
      );
    });
    const page = await context.newPage();
    await stubDashboardAndLogoutApi(page);

    try {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: /dashboard overview/i })).toBeVisible({
        timeout: 10_000,
      });

      // Hover keeps the menu open; programmatic click on Log Out avoids crossing the
      // avatar–dropdown gap (mouseleave there closes the panel before a real click lands).
      await openAccountMenuAndLogOut(page);

      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
      await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible();

      await expect
        .poll(async () => page.evaluate(() => localStorage.getItem('auth-storage')))
        .toBeNull();
    } finally {
      await context.close();
    }
  });

  test('log out still clears session when logout API errors', async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          user: { id: 'e2e-logout-fail-api', email: 'logout-fail-api@vizme.local' },
        })
      );
    });
    const page = await context.newPage();
    await stubDashboardReads(page);
    await stubLogoutPost(page, { status: 503 });

    try {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: /dashboard overview/i })).toBeVisible({
        timeout: 10_000,
      });

      await openAccountMenuAndLogOut(page);

      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
      await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible();

      await expect
        .poll(async () => page.evaluate(() => localStorage.getItem('auth-storage')))
        .toBeNull();
    } finally {
      await context.close();
    }
  });

  test('log out from Properties page returns to login', async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          user: { id: 'e2e-logout-sites', email: 'logout-sites@vizme.local' },
        })
      );
    });
    const page = await context.newPage();
    await stubSitesListGet(page);
    await stubLogoutPost(page, { status: 200, body: JSON.stringify({ success: true }) });

    try {
      await page.goto('/sites');
      await expect(page.getByRole('heading', { name: /^properties$/i })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page).toHaveURL(/\/sites/);

      await openAccountMenuAndLogOut(page);

      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
      await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible();

      await expect
        .poll(async () => page.evaluate(() => localStorage.getItem('auth-storage')))
        .toBeNull();
    } finally {
      await context.close();
    }
  });

  /**
   * Full stack: no route stubs. Requires API on :3000 (Vite proxies /api in dev; CI starts backend).
   */
  test('after signup, log out clears session and returns to login', async ({ page }) => {
    const email = uniqueEmail();
    const password = 'SecurePass123!';

    await page.goto('/signup');
    await page.getByLabel(/full name/i).fill('E2E Signup Logout');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password$/i).fill(password);
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText(/account created successfully/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('heading', { name: /dashboard overview/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

    await openAccountMenuAndLogOut(page);

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible();

    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('auth-storage')))
      .toBeNull();
  });
});
