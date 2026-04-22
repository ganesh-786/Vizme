import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const setupApp = async () => {
  vi.resetModules();

  const queryMock = vi.fn();
  const ensureSiteOwnedByUserMock = vi.fn();

  vi.doMock('../database/connection.js', () => ({
    query: queryMock,
  }));

  vi.doMock('../middleware/auth.middleware.js', () => ({
    authenticate: (req, res, next) => {
      req.user = { id: 55 };
      next();
    },
  }));

  vi.doMock('../middleware/rateLimiter.js', () => ({
    apiLimiter: (req, res, next) => next(),
  }));

  vi.doMock('../services/dashboardWidget.service.js', () => ({
    ensureSiteOwnedByUser: ensureSiteOwnedByUserMock,
  }));

  vi.doMock('../config.js', () => ({
    config: {
      isProduction: false,
    },
  }));

  vi.doMock('../logger.js', () => ({
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }));

  const { apiKeyRoutes } = await import('../routes/apikey.routes.js');
  const { errorHandler } = await import('../middleware/errorHandler.js');

  const app = express();
  app.use(express.json());
  app.use('/api/v1/api-keys', apiKeyRoutes);
  app.use(errorHandler);

  return {
    app,
    mocks: {
      queryMock,
      ensureSiteOwnedByUserMock,
    },
  };
};

describe('apikey.routes integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/v1/api-keys returns masked keys for current user', async () => {
    const { app, mocks } = await setupApp();
    mocks.queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          key_name: 'Account API Key',
          key_prefix: 'mk_abcd123',
          metric_config_id: null,
          site_id: null,
          is_active: true,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const res = await request(app).get('/api/v1/api-keys');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data[0].masked_key).toBe('mk_abcd123••••••••');
    expect(mocks.queryMock).toHaveBeenCalledWith(
      expect.stringContaining('FROM api_keys WHERE user_id = $1'),
      [55]
    );
  });

  it('POST /api/v1/api-keys/ensure returns existing key when present', async () => {
    const { app, mocks } = await setupApp();
    mocks.queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 9,
          key_name: 'Account API Key',
          key_prefix: 'mk_exist99',
          site_id: null,
          is_active: true,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const res = await request(app).post('/api/v1/api-keys/ensure').send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.is_new).toBe(false);
    expect(res.body.data.masked_key).toBe('mk_exist99••••••••');
  });

  it('POST /api/v1/api-keys creates a new scoped key when site is valid', async () => {
    const { app, mocks } = await setupApp();
    mocks.ensureSiteOwnedByUserMock.mockResolvedValueOnce(true);
    mocks.queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 14,
          key_name: 'Checkout Key',
          key_prefix: 'mk_newkey1',
          site_id: 3,
          is_active: true,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const res = await request(app).post('/api/v1/api-keys').send({
      key_name: 'Checkout Key',
      site_id: 3,
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.key_name).toBe('Checkout Key');
    expect(res.body.data.site_id).toBe(3);
    expect(res.body.data.api_key).toMatch(/^mk_/);
    expect(res.body.data.masked_key).toContain('••••••••');
    expect(mocks.ensureSiteOwnedByUserMock).toHaveBeenCalledWith(3, 55);
  });

  it('PATCH /api/v1/api-keys/:id returns 400 when no fields provided', async () => {
    const { app, mocks } = await setupApp();
    mocks.queryMock.mockResolvedValueOnce({ rows: [{ id: 3 }] });

    const res = await request(app).patch('/api/v1/api-keys/3').send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('No fields to update');
  });

  it('DELETE /api/v1/api-keys/:id returns 404 when key does not exist', async () => {
    const { app, mocks } = await setupApp();
    mocks.queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete('/api/v1/api-keys/999');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('API key not found');
  });
});
