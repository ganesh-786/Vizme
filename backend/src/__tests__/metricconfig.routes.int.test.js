import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const setupApp = async () => {
  vi.resetModules();

  const queryMock = vi.fn();

  vi.doMock('../database/connection.js', () => ({
    query: queryMock,
  }));

  vi.doMock('../middleware/auth.middleware.js', () => ({
    authenticate: (req, res, next) => {
      req.user = { id: 88 };
      next();
    },
  }));

  vi.doMock('../middleware/rateLimiter.js', () => ({
    apiLimiter: (req, res, next) => next(),
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

  const { metricConfigRoutes } = await import('../routes/metricconfig.routes.js');
  const { errorHandler } = await import('../middleware/errorHandler.js');

  const app = express();
  app.use(express.json());
  app.use('/api/v1/metric-configs', metricConfigRoutes);
  app.use(errorHandler);

  return {
    app,
    mocks: { queryMock },
  };
};

describe('metricconfig.routes integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/v1/metric-configs returns user metric configurations', async () => {
    const { app, mocks } = await setupApp();
    mocks.queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          name: 'Orders Completed',
          metric_type: 'counter',
          metric_name: 'orders_completed',
          labels: [],
          status: 'active',
        },
      ],
    });

    const res = await request(app).get('/api/v1/metric-configs');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(mocks.queryMock).toHaveBeenCalledWith(
      expect.stringContaining('FROM metric_configs WHERE user_id = $1'),
      [88]
    );
  });

  it('GET /api/v1/metric-configs/by-api-key returns 400 when API key is missing', async () => {
    const { app } = await setupApp();

    const res = await request(app).get('/api/v1/metric-configs/by-api-key');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('API key required');
  });

  it('GET /api/v1/metric-configs/by-api-key returns 401 for invalid key', async () => {
    const { app, mocks } = await setupApp();
    mocks.queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/v1/metric-configs/by-api-key')
      .set('x-api-key', 'mk_invalid');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Invalid or inactive API key');
  });

  it('POST /api/v1/metric-configs creates a metric configuration', async () => {
    const { app, mocks } = await setupApp();
    mocks.queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 15,
          name: 'Checkout Started',
          metric_type: 'counter',
          metric_name: 'checkout_started',
          labels: [],
          help_text: 'Tracks checkout starts',
          status: 'active',
        },
      ],
    });

    const res = await request(app).post('/api/v1/metric-configs').send({
      name: 'Checkout Started',
      metric_type: 'counter',
      metric_name: 'checkout_started',
      labels: [],
      help_text: 'Tracks checkout starts',
      status: 'active',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.metric_name).toBe('checkout_started');
    expect(mocks.queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO metric_configs'),
      expect.arrayContaining([88, 'Checkout Started', 'counter', 'checkout_started'])
    );
  });

  it('PATCH /api/v1/metric-configs/:id returns 400 when no fields are supplied', async () => {
    const { app, mocks } = await setupApp();
    mocks.queryMock.mockResolvedValueOnce({ rows: [{ id: 10 }] });

    const res = await request(app).patch('/api/v1/metric-configs/10').send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('No fields to update');
  });
});
