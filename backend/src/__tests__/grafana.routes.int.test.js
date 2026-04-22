import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const setupApp = async () => {
  vi.resetModules();

  const resolveGrafanaConnectionMock = vi.fn();
  const ensureGrafanaTenantMock = vi.fn();
  const verifyMetricsDashboardInOrgMock = vi.fn();
  const reprovisionTenantDashboardMock = vi.fn();
  const verifyMimirDatasourceInOrgMock = vi.fn();
  const inspectDatasourceHealthInOrgMock = vi.fn();

  vi.doMock('../middleware/rateLimiter.js', () => ({
    grafanaEmbedLimiter: (req, res, next) => next(),
  }));

  vi.doMock('../middleware/auth.middleware.js', () => ({
    authenticate: (req, res, next) => {
      req.user = { id: 101, email: 'user@example.com', name: 'Demo User' };
      next();
    },
  }));

  vi.doMock('../services/grafanaConnection.service.js', () => ({
    resolveGrafanaConnection: resolveGrafanaConnectionMock,
  }));

  vi.doMock('../services/grafanaTenant.service.js', () => ({
    ensureGrafanaTenant: ensureGrafanaTenantMock,
    inspectDatasourceHealthInOrg: inspectDatasourceHealthInOrgMock,
    reprovisionTenantDashboard: reprovisionTenantDashboardMock,
    verifyMetricsDashboardInOrg: verifyMetricsDashboardInOrgMock,
    verifyMimirDatasourceInOrg: verifyMimirDatasourceInOrgMock,
  }));

  vi.doMock('../services/grafanaEmbedSession.service.js', () => ({
    clearGrafanaEmbedCookie: vi.fn(),
    GRAFANA_EMBED_COOKIE: 'vizme_grafana_embed',
    setGrafanaEmbedCookie: vi.fn(),
  }));

  vi.doMock('../config.js', () => ({
    config: {
      jwt: {
        secret: 'test-secret-value-with-32-plus-characters',
      },
      cors: {
        frontendUrl: 'http://localhost:5173',
      },
      api: {
        baseUrl: 'http://localhost:3000',
      },
      grafana: {
        embedPublicBaseUrl: '',
        embedTokenExpiry: '15m',
        serveSubpath: true,
      },
      grafanaEmbedTokenExpiry: '15m',
      urls: {
        grafana: 'http://grafana:3001',
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

  const { grafanaRoutes } = await import('../routes/grafana.routes.js');
  const { errorHandler } = await import('../middleware/errorHandler.js');

  const app = express();
  app.use('/api/v1/grafana', grafanaRoutes);
  app.use(errorHandler);

  return {
    app,
    mocks: {
      resolveGrafanaConnectionMock,
      ensureGrafanaTenantMock,
      verifyMetricsDashboardInOrgMock,
      reprovisionTenantDashboardMock,
      verifyMimirDatasourceInOrgMock,
      inspectDatasourceHealthInOrgMock,
    },
  };
};

describe('grafana.routes integration reliability', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 503 with auth code when Grafana admin auth fails', async () => {
    const { app, mocks } = await setupApp();
    mocks.resolveGrafanaConnectionMock.mockResolvedValueOnce({
      apiBase: null,
      authFailed: true,
    });

    const res = await request(app).get('/api/v1/grafana/embed-url');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('grafana_admin_auth');
  });

  it('returns 503 with unreachable code when Grafana cannot be reached', async () => {
    const { app, mocks } = await setupApp();
    mocks.resolveGrafanaConnectionMock.mockResolvedValueOnce({
      apiBase: null,
      authFailed: false,
    });

    const res = await request(app).get('/api/v1/grafana/embed-url');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('grafana_unreachable');
  });

  it('returns 503 when tenant provisioning does not complete', async () => {
    const { app, mocks } = await setupApp();
    mocks.resolveGrafanaConnectionMock.mockResolvedValueOnce({
      apiBase: 'http://grafana:3001',
      origin: 'http://grafana:3001',
      authFailed: false,
    });
    mocks.ensureGrafanaTenantMock.mockResolvedValueOnce(null);

    const res = await request(app).get('/api/v1/grafana/embed-url');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('grafana_tenant_setup');
  });

  it('returns 503 when tenant datasource is unhealthy', async () => {
    const { app, mocks } = await setupApp();
    mocks.resolveGrafanaConnectionMock.mockResolvedValueOnce({
      apiBase: 'http://grafana:3001',
      origin: 'http://grafana:3001',
      authFailed: false,
    });
    mocks.ensureGrafanaTenantMock.mockResolvedValueOnce(77);
    mocks.verifyMetricsDashboardInOrgMock.mockResolvedValueOnce(true);
    mocks.verifyMimirDatasourceInOrgMock.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    mocks.ensureGrafanaTenantMock.mockResolvedValueOnce(77);
    mocks.inspectDatasourceHealthInOrgMock.mockResolvedValueOnce({
      ok: false,
      message: 'Datasource test query failed',
    });

    const res = await request(app).get('/api/v1/grafana/embed-url');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('grafana_mimir_datasource_unhealthy');
    expect(res.body.details).toEqual(expect.objectContaining({ ok: false }));
  });

  it('returns 503 when dashboard is still missing after reprovision attempt', async () => {
    const { app, mocks } = await setupApp();
    mocks.resolveGrafanaConnectionMock.mockResolvedValueOnce({
      apiBase: 'http://grafana:3001',
      origin: 'http://grafana:3001',
      authFailed: false,
    });
    mocks.ensureGrafanaTenantMock.mockResolvedValueOnce(77);
    mocks.verifyMetricsDashboardInOrgMock.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    mocks.reprovisionTenantDashboardMock.mockResolvedValueOnce(false);

    const res = await request(app).get('/api/v1/grafana/embed-url');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Grafana dashboard missing');
    expect(mocks.reprovisionTenantDashboardMock).toHaveBeenCalledWith(101);
  });
});
