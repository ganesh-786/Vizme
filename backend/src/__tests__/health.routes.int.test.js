import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const setupApp = async () => {
  vi.resetModules();

  const queryMock = vi.fn();
  const queryScalarMock = vi.fn();
  const pushMetricsToMimirMock = vi.fn();
  const resolveGrafanaConnectionMock = vi.fn();
  const inspectDatasourceHealthInOrgMock = vi.fn();
  const getPipelineTelemetrySnapshotMock = vi.fn();

  vi.doMock('../database/connection.js', () => ({
    query: queryMock,
  }));

  vi.doMock('../services/mimirQuery.service.js', () => ({
    queryScalar: queryScalarMock,
  }));

  vi.doMock('../services/mimir.service.js', () => ({
    pushMetricsToMimir: pushMetricsToMimirMock,
  }));

  vi.doMock('../services/grafanaConnection.service.js', () => ({
    resolveGrafanaConnection: resolveGrafanaConnectionMock,
    grafanaAdminApiHeaders: vi.fn(() => ({})),
  }));

  vi.doMock('../services/grafanaTenant.service.js', () => ({
    inspectDatasourceHealthInOrg: inspectDatasourceHealthInOrgMock,
  }));

  vi.doMock('../middleware/appMetrics.js', () => ({
    getPipelineTelemetrySnapshot: getPipelineTelemetrySnapshotMock,
  }));

  vi.doMock('../config.js', () => ({
    config: {
      metrics: { healthTenantId: '1' },
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

  const { healthRoutes } = await import('../routes/health.routes.js');

  const app = express();
  app.use('/health', healthRoutes);

  return {
    app,
    mocks: {
      queryMock,
      queryScalarMock,
      pushMetricsToMimirMock,
      resolveGrafanaConnectionMock,
      inspectDatasourceHealthInOrgMock,
      getPipelineTelemetrySnapshotMock,
    },
  };
};

describe('health.routes integration reliability', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /health/ready returns 503 when DB check fails', async () => {
    const { app, mocks } = await setupApp();
    mocks.queryMock.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe('unhealthy');
    expect(res.body.error).toBe('Database connection failed');
  });

  it('GET /health/metrics-pipeline returns 503 when direct Mimir query fails', async () => {
    const { app, mocks } = await setupApp();
    mocks.queryScalarMock.mockResolvedValueOnce(null);
    mocks.resolveGrafanaConnectionMock.mockResolvedValueOnce({
      apiBase: null,
      authFailed: false,
      lastError: 'unreachable',
    });
    mocks.getPipelineTelemetrySnapshotMock.mockReturnValue({ recentErrors: 3 });

    const res = await request(app).get('/health/metrics-pipeline');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.directMimirQuery.ok).toBe(false);
    expect(res.body.grafana.reachable).toBe(false);
    expect(res.body.pipelineTelemetry).toEqual({ recentErrors: 3 });
  });

  it('GET /health/metrics-pipeline returns 503 when active write probe throws', async () => {
    const { app, mocks } = await setupApp();
    mocks.queryScalarMock.mockResolvedValueOnce(1);
    mocks.pushMetricsToMimirMock.mockRejectedValueOnce(new Error('write failed'));
    mocks.getPipelineTelemetrySnapshotMock.mockReturnValue({ recentErrors: 1 });

    const res = await request(app).get('/health/metrics-pipeline').query({ active: '1' });

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Metrics pipeline health check failed.');
    expect(res.body.error).toBe('write failed');
  });
});
