import { test, expect } from '@playwright/test';
import { loginThroughKeycloak } from './helpers/keycloak';

const username = process.env.E2E_KEYCLOAK_USERNAME;
const password = process.env.E2E_KEYCLOAK_PASSWORD;
const hasCredentials = Boolean(username && password);

test.describe('auth smoke - authenticated access (real Keycloak)', () => {
  test.skip(
    !hasCredentials,
    'Set E2E_KEYCLOAK_USERNAME and E2E_KEYCLOAK_PASSWORD to run real login smoke tests.'
  );

  test('authenticated user reaches dashboard and protected pages', async ({ page }) => {
    await loginThroughKeycloak(page, { username, password });

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Dashboard Overview' })).toBeVisible();

    await page.goto('/sites');
    await expect(page).toHaveURL(/\/sites$/);
    await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible();
  });
});
