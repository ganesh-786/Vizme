import { test, expect } from '@playwright/test';

async function stubDashboardReads(page) {
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

test.describe('Login flow', () => {
  test('renders login form with required fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible();

    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /sign up/i })).toHaveAttribute('href', '/signup');
  });

  test('invalid credentials keep user on login and show an error', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel(/email address/i).fill('unknown+e2e@vizme-e2e.local');
    await page.getByLabel(/^password$/i).fill('WrongPass123!');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    const errorMessage = page.locator('.error-message');
    await expect(errorMessage).toBeVisible({ timeout: 10_000 });
    await expect(errorMessage).not.toBeEmpty();
    await expect(page).toHaveURL(/\/login/);
  });

  test('password visibility toggle works on login form', async ({ page }) => {
    await page.goto('/login');

    const passwordInput = page.getByPlaceholder('••••••••');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: /show password/i }).click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    await page.getByRole('button', { name: /hide password/i }).click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('requires email and password fields', async ({ page }) => {
    await page.goto('/login');

    const emailInput = page.getByLabel(/email address/i);
    const passwordInput = page.getByLabel(/^password$/i);

    await expect(emailInput).toHaveAttribute('required', '');
    await expect(passwordInput).toHaveAttribute('required', '');
  });

  test('sign up link navigates to signup page', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('link', { name: /sign up/i }).click();
    await expect(page).toHaveURL(/\/signup/);
    await expect(page.getByRole('heading', { name: /sign up/i })).toBeVisible();
  });

  test('authenticated user is redirected away from /login', async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          user: { id: 'e2e-user', email: 'e2e-user@vizme.local' },
        })
      );
    });
    const page = await context.newPage();
    await stubDashboardReads(page);

    try {
      await page.goto('/login');
      await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
      await expect(
        page.getByRole('heading', { name: /dashboard overview/i })
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.close();
    }
  });
});
