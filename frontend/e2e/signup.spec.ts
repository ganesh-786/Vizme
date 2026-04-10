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

  test('duplicate email shows error message', async ({ page, context }) => {
    const email = uniqueEmail();

    // First signup
    await page.getByLabel(/full name/i).fill('First User');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password$/i).fill('SecurePass123!');
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page).not.toHaveURL(/\/signup/, { timeout: 10_000 });

    // Open fresh page to avoid stale auth state
    const freshPage = await context.newPage();
    await freshPage.goto('/signup');
    await freshPage.getByLabel(/full name/i).waitFor({ state: 'visible' });
    await freshPage.getByLabel(/full name/i).fill('Duplicate User');
    await freshPage.getByLabel(/email/i).fill(email);
    await freshPage.getByLabel(/^password$/i).fill('SecurePass123!');
    await freshPage.getByRole('button', { name: /create account/i }).click();

    await expect(
      freshPage.getByText(/already exists/i)
    ).toBeVisible({ timeout: 10_000 });
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
