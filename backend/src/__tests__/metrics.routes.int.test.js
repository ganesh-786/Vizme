import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const setupApp = async () => {
  vi.resetModules();

  const recordMetricMock = vi.fn();
  const pushMetricsToMimirMock = vi.fn();
  const fetchDashboardMetricsMock = vi.fn();
  const recordMetricsIngestMock = vi.fn();

  vi.doMock('../middleware/auth.middleware.js', () => ({
    authenticateApiKey: (req, res, next) => {
      req.user = { id: 42 };
      req.apiKey = { site_id: 7 };
      next();
    },
    authenticate: (req, res, next) => {
      req.user = { id: 42 };
      next();
    },
  }));

  vi.doMock('../middleware/rateLimiter.js', () => ({
    metricsLimiter: (req, res, next) => next(),
  }));

  vi.doMock('../middleware/appMetrics.js', () => ({
    recordMetricsIngest: recordMetricsIngestMock,
  }));

  vi.doMock('../services/metrics.service.js', () => ({
    recordMetric: recordMetricMock,
  }));

  vi.doMock('../services/mimir.service.js', () => ({
    pushMetricsToMimir: pushMetricsToMimirMock,
  }));

  vi.doMock('../services/mimirQuery.service.js', () => ({
    fetchDashboardMetrics: fetchDashboardMetricsMock,
  }));

  vi.doMock('../config.js', () => ({
    config: {
      urls: {
        grafana: 'http://grafana:3001',
        mimir: 'http://mimir:9009',
      },
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

  const { metricsRoutes } = await import('../routes/metrics.routes.js');
  const { errorHandler } = await import('../middleware/errorHandler.js');

  const app = express();
  app.use(express.json());
  app.use('/api/v1/metrics', metricsRoutes);
  app.use(errorHandler);

  return {
    app,
    mocks: {
      recordMetricMock,
      pushMetricsToMimirMock,
      fetchDashboardMetricsMock,
      recordMetricsIngestMock,
    },
  };
};

describe('metrics.routes integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POST /api/v1/metrics ingests valid metrics and forwards to Mimir', async () => {
    const { app, mocks } = await setupApp();
    mocks.pushMetricsToMimirMock.mockResolvedValue({ ok: true, durationMs: 21 });

    const res = await request(app).post('/api/v1/metrics').send({
      metrics: [{ name: 'orders_completed', type: 'counter', value: 1, labels: { env: 'prod' } }],
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.processed).toBe(1);
    expect(res.body.data.mimirAccepted).toBe(true);
    expect(mocks.recordMetricMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'orders_completed',
        type: 'counter',
        value: 1,
        labels: { env: 'prod', site_id: '7' },
      }),
      42
    );
    expect(mocks.pushMetricsToMimirMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          name: 'orders_completed',
          type: 'counter',
          value: 1,
          userId: '42',
          labels: { env: 'prod', site_id: '7', user_id: '42' },
        }),
      ],
      { mode: 'ingest', throwOnFailure: true }
    );
  });

  it('POST /api/v1/metrics returns 400 when request fails validation', async () => {
    const { app } = await setupApp();

    const res = await request(app).post('/api/v1/metrics').send({
      metrics: [{ name: '', type: 'counter', value: 'not-a-number' }],
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Validation failed/);
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('POST /api/v1/metrics returns 400 when all metrics are invalid after processing', async () => {
    const { app, mocks } = await setupApp();
    mocks.recordMetricMock.mockImplementation(() => {
      throw new Error('metric rejected');
    });

    const res = await request(app).post('/api/v1/metrics').send({
      metrics: [{ name: 'orders_completed', type: 'counter', value: 1, labels: { env: 'prod' } }],
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('No valid metrics to process');
    expect(res.body.details[0]).toEqual(expect.objectContaining({ index: 0, error: 'metric rejected' }));
  });

  it('GET /api/v1/metrics/dashboard returns dashboard payload', async () => {
    const { app, mocks } = await setupApp();
    mocks.fetchDashboardMetricsMock.mockResolvedValue({
      dashboardMode: 'legacy',
      stats: { totalRevenue: 100 },
    });

    const res = await request(app)
      .get('/api/v1/metrics/dashboard')
      .query({ include_series: 'true', include_details: '1', site_id: '12' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.stats.totalRevenue).toBe(100);
    expect(mocks.fetchDashboardMetricsMock).toHaveBeenCalledWith(42, '12', {
      includeSeries: true,
      includeDetails: true,
    });
  });

  it('POST /api/v1/metrics returns 502 when Mimir push fails', async () => {
    const { app, mocks } = await setupApp();
    const mimirError = new Error('Mimir remote-write failed');
    mimirError.status = 502;
    mocks.pushMetricsToMimirMock.mockRejectedValue(mimirError);

    const res = await request(app).post('/api/v1/metrics').send({
      metrics: [{ name: 'orders_completed', type: 'counter', value: 1, labels: { env: 'prod' } }],
    });

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Mimir remote-write failed');
    expect(mocks.recordMetricsIngestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'error',
        processed: 1,
        total: 1,
      })
    );
  });
});
