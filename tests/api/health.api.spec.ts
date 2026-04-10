import { test, expect } from '@playwright/test';

test.describe('Health API', () => {
  test('GET /health/live returns process liveness', async ({ request }) => {
    const res = await request.get('/health/live');
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'ok' });
  });

  test('GET /health/ready reflects database connectivity', async ({ request }) => {
    const res = await request.get('/health/ready');
    const status = res.status();
    expect([200, 503], `unexpected status ${status}`).toContain(status);
    const body = await res.json();
    if (status === 200) {
      expect(body).toMatchObject({ success: true, status: 'healthy' });
    } else {
      expect(body).toMatchObject({ success: false, status: 'unhealthy' });
    }
  });
});
