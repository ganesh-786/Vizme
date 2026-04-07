import express from 'express';
import { query } from '../database/connection.js';
import {
  grafanaAdminApiHeaders,
  resolveGrafanaConnection,
} from '../services/grafanaConnection.service.js';

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
    res.status(ok ? 200 : 503).json({
      success: ok,
      grafanaUrl: conn.apiBase,
      status,
      adminUser: conn.adminCredentials?.user || null,
      message: ok
        ? 'Metrics dashboard provisioned in org 1'
        : `Dashboard not ready: ${status} ${text?.slice(0, 150)}`,
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
