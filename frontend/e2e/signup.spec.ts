import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';

function uniqueEmail(): string {
  const id = crypto.randomBytes(4).toString('hex');
  return `test+${id}@vizme-e2e.local`;
}

test.describe('Signup flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signup');
  });

  test('renders the signup form with all fields', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /sign up/i })
    ).toBeVisible();
    await expect(page.getByLabel(/full name/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /create account/i })
    ).toBeVisible();
  });

  test('requires email and password fields', async ({ page }) => {
    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/^password$/i);

    await expect(emailInput).toHaveAttribute('required', '');
    await expect(passwordInput).toHaveAttribute('required', '');
    await expect(passwordInput).toHaveAttribute('minlength', '8');
  });

  test('successful signup redirects away from /signup', async ({ page }) => {
    await page.getByLabel(/full name/i).fill('E2E Test User');
    await page.getByLabel(/email/i).fill(uniqueEmail());
    await page.getByLabel(/^password$/i).fill('SecurePass123!');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(
      page.getByRole('button', { name: /creating account/i })
    ).toBeVisible();

    await expect(page.getByText(/account created successfully/i)).toBeVisible({
      timeout: 10_000,
    });

    await expect(page).not.toHaveURL(/\/signup/, { timeout: 10_000 });
  });

  test('duplicate email shows error message', async ({ page, browser }) => {
    const email = uniqueEmail();
    let signupCount = 0;
    await page.route('**/api/v1/auth/signup', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }

      signupCount += 1;
      if (signupCount === 1) {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              user: { id: 'mock-user-1', email },
              accessToken: 'mock-token-1',
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'An account with this email already exists.' }),
      });
    });

    // First signup
    await page.getByLabel(/full name/i).fill('First User');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password$/i).fill('SecurePass123!');
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page).not.toHaveURL(/\/signup/, { timeout: 10_000 });

    // Fresh guest context to avoid GuestRoute redirect, with duplicate response mocked.
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    try {
      await guestPage.route('**/api/v1/auth/signup', async (route) => {
        if (route.request().method() !== 'POST') {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'An account with this email already exists.' }),
        });
      });

      await guestPage.goto('/signup');
      await guestPage.getByLabel(/full name/i).fill('Duplicate User');
      await guestPage.getByLabel(/email/i).fill(email);
      await guestPage.getByLabel(/^password$/i).fill('SecurePass123!');
      await guestPage.getByRole('button', { name: /create account/i }).click();

      await expect(
        guestPage
          .locator('.error-message')
          .filter({ hasText: /already exists/i })
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await guestContext.close();
    }
  });

  test('password visibility toggle works', async ({ page }) => {
    const passwordInput = page.getByPlaceholder('••••••••');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: /show password/i }).click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    await page.getByRole('button', { name: /hide password/i }).click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('has navigation link to login page', async ({ page }) => {
    const loginLink = page.getByRole('link', { name: /sign in/i });
    await expect(loginLink).toBeVisible();
    await expect(loginLink).toHaveAttribute('href', '/login');
  });
});
