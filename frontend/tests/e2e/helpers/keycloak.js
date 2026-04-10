import { expect } from '@playwright/test';

export async function loginThroughKeycloak(page, { username, password } = {}) {
  if (!username || !password) {
    throw new Error('Missing Keycloak credentials for e2e login');
  }

  await page.goto('/login');

  const userField = page.locator('input[name="username"]');
  const passField = page.locator('input[name="password"]');
  const submitButton = page.locator('button[type="submit"], input[type="submit"]');

  await expect(userField).toBeVisible({ timeout: 20_000 });
  await userField.fill(username);
  await passField.fill(password);
  await submitButton.first().click();
}
