import express from 'express';
import { query } from '../database/connection.js';
import { config } from '../config.js';

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
  const grafanaBase =
    process.env.GRAFANA_INTERNAL_URL || config.urls.grafana || 'http://localhost:3001';
  const base = grafanaBase.includes('/grafana')
    ? grafanaBase
    : `${grafanaBase.replace(/\/$/, '')}/grafana`;
  const url = `${base}/api/org`;
  const adminUser = config.grafana?.adminUser || process.env.GRAFANA_ADMIN_USER || 'admin';
  const adminPass = config.grafana?.adminPassword || process.env.GRAFANA_ADMIN_PASSWORD || 'admin';
  const auth = Buffer.from(`${adminUser}:${adminPass}`).toString('base64');

  try {
    const r = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const ok = r.ok;
    const status = r.status;
    const text = await r.text();
    res.json({
      success: ok,
      grafanaUrl: base,
      status,
      message: ok ? 'Grafana reachable' : `Grafana returned ${status}: ${text?.slice(0, 200)}`,
    });
  } catch (err) {
    res.status(503).json({
      success: false,
      grafanaUrl: base,
      error: err.message,
      code: err.cause?.code,
      message:
        'Cannot reach Grafana. Ensure Grafana is running. For Docker: use GRAFANA_INTERNAL_URL=http://grafana:3000. For local dev: use GRAFANA_URL=http://localhost:3001.',
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
