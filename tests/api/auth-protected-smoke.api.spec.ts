import { test, expect } from '@playwright/test';

const defaultPassword =
  process.env.E2E_TEST_PASSWORD || 'E2e_test_pass_9a!';

/**
 * One minimal happy path: signup → Bearer GET /api/v1/api-keys.
 * Skips if PostgreSQL is not reachable (readiness not 200).
 */
test.describe('Auth protected smoke (requires DB)', () => {
  test('signup then list API keys with access token', async ({ request }) => {
    const ready = await request.get('/health/ready');
    test.skip(
      ready.status() !== 200,
      'PostgreSQL not reachable (GET /health/ready !== 200); start DB and backend to run this test'
    );

    const email = `pw-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

    const signUp = await request.post('/api/v1/auth/signup', {
      data: {
        email,
        password: defaultPassword,
        name: 'Playwright API smoke',
      },
    });

    expect(signUp.status(), await signUp.text()).toBe(201);
    const created = await signUp.json();
    expect(created.success).toBe(true);
    const accessToken = created.data?.accessToken;
    expect(typeof accessToken).toBe('string');
    expect(accessToken.length).toBeGreaterThan(20);

    const keys = await request.get('/api/v1/api-keys', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(keys.status(), await keys.text()).toBe(200);
    const list = await keys.json();
    expect(list.success).toBe(true);
    expect(Array.isArray(list.data)).toBe(true);
  });
});
