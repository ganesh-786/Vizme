import { test, expect } from '@playwright/test';

/**
 * Auth contract checks that do not require a seeded user or successful DB writes.
 * Validates JWT middleware behavior and signin validation ordering.
 */
test.describe('Auth API contracts (no DB seed)', () => {
  test('GET protected collection without credentials returns 401', async ({ request }) => {
    const res = await request.get('/api/v1/api-keys');
    expect(res.status(), await res.text()).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({
      success: false,
      error: 'Unauthorized',
    });
  });

  test('GET protected collection with invalid Bearer token returns 401', async ({ request }) => {
    const res = await request.get('/api/v1/api-keys', {
      headers: { Authorization: 'Bearer not-a-real-jwt' },
    });
    expect(res.status(), await res.text()).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  test('POST /api/v1/auth/signin with invalid email returns 400 validation', async ({
    request,
  }) => {
    const res = await request.post('/api/v1/auth/signin', {
      data: { email: 'not-an-email', password: 'any' },
    });
    expect(res.status(), await res.text()).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ success: false });
    expect(Array.isArray(body.details)).toBe(true);
  });
});
