import express from 'express';
import { query } from '../database/connection.js';
import { config } from '../config.js';
import { getPipelineTelemetrySnapshot } from '../middleware/appMetrics.js';
import { pushMetricsToMimir } from '../services/mimir.service.js';
import { queryScalar } from '../services/mimirQuery.service.js';
import {
  grafanaAdminApiHeaders,
  resolveGrafanaConnection,
} from '../services/grafanaConnection.service.js';
import { inspectDatasourceHealthInOrg } from '../services/grafanaTenant.service.js';

const router = express.Router();

const healthy = (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
};

/** Liveness: process is running. No dependencies. */
router.get('/live', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

/** Grafana connectivity check. Useful for debugging tenant setup issues. */
router.get('/grafana', async (req, res) => {
  try {
    const conn = await resolveGrafanaConnection({ force: true });
    if (!conn.apiBase) {
      return res.status(503).json({
        success: false,
        grafanaUrl: conn.candidates?.[0] || null,
        candidatesTried: conn.candidates || [],
        message: conn.authFailed
          ? 'Grafana admin authentication failed. The backend tried the configured admin login and known Grafana fallbacks.'
          : 'Cannot reach Grafana. Ensure Grafana is running and reachable from the backend.',
      });
    }

    res.json({
      success: true,
      grafanaUrl: conn.apiBase,
      origin: conn.origin,
      adminUser: conn.adminCredentials?.user || null,
      message: 'Grafana reachable with valid admin credentials',
      candidatesTried: conn.candidates || [],
    });
  } catch (err) {
    res.status(503).json({
      success: false,
      grafanaUrl: null,
      error: err.message,
      code: err.cause?.code,
      message: 'Cannot reach Grafana. Ensure Grafana is running and reachable from the backend.',
    });
  }
});

/** Grafana readiness: metrics dashboard provisioned in org 1. Use after volume reset to verify tenant setup will succeed. */
router.get('/grafana-ready', async (req, res) => {
  try {
    const conn = await resolveGrafanaConnection({ force: true });
    if (!conn.apiBase) {
      return res.status(503).json({
        success: false,
        grafanaUrl: conn.candidates?.[0] || null,
        candidatesTried: conn.candidates || [],
        message: conn.authFailed
          ? 'Grafana admin authentication failed before readiness checks could run.'
          : 'Cannot reach Grafana or dashboard not yet provisioned.',
      });
    }

    const url = `${conn.apiBase}/api/dashboards/uid/metrics`;
    const r = await fetch(url, {
      headers: {
        ...grafanaAdminApiHeaders(),
        'X-Grafana-Org-Id': '1',
      },
    });
    const ok = r.ok;
    const status = r.status;
    const text = await r.text();
    const [mimirDatasource, prometheusDatasource] = await Promise.all([
      inspectDatasourceHealthInOrg(1, 'mimir', conn.apiBase),
      inspectDatasourceHealthInOrg(1, 'prometheus', conn.apiBase),
    ]);
    const ready = ok && mimirDatasource.ok && prometheusDatasource.ok;
    res.status(ready ? 200 : 503).json({
      success: ready,
      grafanaUrl: conn.apiBase,
      status,
      adminUser: conn.adminCredentials?.user || null,
      dashboard: {
        ready: ok,
        status,
        message: ok
          ? 'Metrics dashboard provisioned in org 1'
          : `Dashboard not ready: ${status} ${text?.slice(0, 150)}`,
      },
      datasources: {
        mimir: mimirDatasource,
        prometheus: prometheusDatasource,
      },
      message: ready
        ? 'Grafana dashboard and datasources are ready'
        : 'Grafana is reachable, but the dashboard or one or more datasources are not ready.',
    });
  } catch (err) {
    res.status(503).json({
      success: false,
      grafanaUrl: null,
      error: err.message,
      code: err.cause?.code,
      message: 'Cannot reach Grafana or dashboard not yet provisioned.',
    });
  }
});

/**
 * Metrics pipeline readiness and debug data.
 * Default mode is read-only. Pass `?active=1` to run a low-cardinality write probe.
 */
router.get('/metrics-pipeline', async (req, res) => {
  const tenantId = String(req.query.tenant_id || config.metrics.healthTenantId || '1');
  const activeProbe =
    String(req.query.active || '').toLowerCase() === '1' ||
    String(req.query.active || '').toLowerCase() === 'true';

  try {
    const directQueryValue = await queryScalar(tenantId, 'vector(1)', { queryKind: 'probe' });
    const directQueryOk = directQueryValue != null;

    let writeProbe = {
      active: activeProbe,
      ok: !activeProbe,
      message: activeProbe
        ? null
        : 'Skipped active write probe. Pass ?active=1 for end-to-end write validation.',
    };

    if (activeProbe) {
      const probeValue = Date.now();
      const writeSummary = await pushMetricsToMimir(
        [
          {
            name: 'pipeline_healthcheck',
            type: 'gauge',
            value: probeValue,
            labels: { source: 'healthcheck' },
            operation: 'set',
            userId: tenantId,
          },
        ],
        { mode: 'probe', throwOnFailure: true }
      );
      const readBack = await queryScalar(
        tenantId,
        'max(user_metric_pipeline_healthcheck{source="healthcheck"}) or vector(0)',
        { queryKind: 'probe' }
      );
      writeProbe = {
        active: true,
        ok: Number(readBack) === probeValue,
        durationMs: writeSummary.durationMs,
        expectedValue: probeValue,
        observedValue: readBack,
        message:
          Number(readBack) === probeValue
            ? 'Mimir write and immediate read-back succeeded.'
            : 'Mimir write probe completed but the read-back value did not match.',
      };
    }

    const grafanaConn = await resolveGrafanaConnection({ force: true });
    let grafana = {
      reachable: Boolean(grafanaConn.apiBase),
      apiBase: grafanaConn.apiBase || null,
      authFailed: grafanaConn.authFailed || false,
      lastError: grafanaConn.lastError || null,
      datasources: {
        mimir: null,
        prometheus: null,
      },
    };

    if (grafanaConn.apiBase) {
      const [mimirDatasource, prometheusDatasource] = await Promise.all([
        inspectDatasourceHealthInOrg(1, 'mimir', grafanaConn.apiBase),
        inspectDatasourceHealthInOrg(1, 'prometheus', grafanaConn.apiBase),
      ]);
      grafana = {
        ...grafana,
        datasources: {
          mimir: mimirDatasource,
          prometheus: prometheusDatasource,
        },
      };
    }

    const success =
      directQueryOk &&
      (!activeProbe || writeProbe.ok) &&
      grafana.reachable &&
      grafana.datasources.mimir?.ok === true &&
      grafana.datasources.prometheus?.ok === true;

    res.status(success ? 200 : 503).json({
      success,
      tenantId,
      directMimirQuery: {
        ok: directQueryOk,
        value: directQueryValue,
        message: directQueryOk
          ? 'Backend can query Mimir directly.'
          : 'Backend could not query Mimir directly.',
      },
      writeProbe,
      grafana,
      pipelineTelemetry: getPipelineTelemetrySnapshot(),
    });
  } catch (err) {
    res.status(503).json({
      success: false,
      tenantId,
      error: err.message,
      message: 'Metrics pipeline health check failed.',
      pipelineTelemetry: getPipelineTelemetrySnapshot(),
    });
  }
});

/** Readiness: DB is reachable. Use for load balancer / k8s readiness probe. */
router.get('/ready', async (req, res) => {
  try {
    await query('SELECT 1');
    healthy(req, res);
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: 'Database connection failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/** Combined health (backward compatible): same as ready. */
router.get('/', async (req, res) => {
  try {
    await query('SELECT NOW()');
    healthy(req, res);
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: 'Database connection failed',
      timestamp: new Date().toISOString(),
    });
  }
});

export { router as healthRoutes };
