import { test, expect } from '@playwright/test';

function uniqueEmail(): string {
  const id = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  return `logout+${id}@vizme-e2e.local`;
}

async function signupAndAuthenticate(page, email: string) {
  await page.goto('/signup');
  await page.getByLabel(/full name/i).fill('Logout E2E User');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password$/i).fill('SecurePass123!');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).not.toHaveURL(/\/signup/, { timeout: 10_000 });
}

test.describe('Logout flow', () => {
  test('shows Log Out action in account menu for authenticated users', async ({ page }) => {
    const email = uniqueEmail();
    await signupAndAuthenticate(page, email);

    await page.getByRole('button', { name: /account menu/i }).hover();
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /log out/i })).toBeVisible();
  });

  test('logging out redirects to /login and clears local auth storage', async ({ page }) => {
    const email = uniqueEmail();
    await signupAndAuthenticate(page, email);

    await page.getByRole('button', { name: /account menu/i }).hover();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.getByRole('menuitem', { name: /log out/i }).click();

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await expect(
      page.getByRole('heading', { name: /sign in to your account/i })
    ).toBeVisible();

    await expect
      .poll(
        async () =>
          page.evaluate(() => window.localStorage.getItem('auth-storage')),
        { timeout: 10_000 }
      )
      .toBeNull();
  });

  test('after logout, protected routes redirect back to /login', async ({ page }) => {
    const email = uniqueEmail();
    await signupAndAuthenticate(page, email);

    await page.getByRole('button', { name: /account menu/i }).hover();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.getByRole('menuitem', { name: /log out/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    await page.goto('/');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await expect(
      page.getByRole('heading', { name: /sign in to your account/i })
    ).toBeVisible();
  });

  test('user can sign in again after logging out', async ({ page }) => {
    const email = uniqueEmail();
    const password = 'SecurePass123!';
    await signupAndAuthenticate(page, email);

    await page.getByRole('button', { name: /account menu/i }).hover();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.getByRole('menuitem', { name: /log out/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    await page.getByLabel(/email address/i).fill(email);
    await page.getByLabel(/^password$/i).fill(password);
    await page.getByRole('button', { name: /^sign in$/i }).click();

    await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
    await expect(
      page.getByRole('heading', { name: /dashboard overview/i })
    ).toBeVisible({ timeout: 10_000 });
  });
});
