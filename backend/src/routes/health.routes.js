import express from 'express';
import { query } from '../database/connection.js';

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
