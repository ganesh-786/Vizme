/**
 * Application metrics for production observability: request count and duration.
 * Uses a separate Prometheus registry so /metrics can expose both app and user metrics.
 */

import { Registry, Counter, Histogram } from 'prom-client';

export const appRegistry = new Registry();
appRegistry.setDefaultLabels({ service: 'vizme-backend' });

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [appRegistry],
});

const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [appRegistry],
});

function normalizeRoute(path) {
  if (!path) return 'unknown';
  // Normalize IDs and variable segments to avoid cardinality explosion
  const normalized = path
    .replace(/\/api\/v1\/metric-configs\/[^/]+/g, '/api/v1/metric-configs/:id')
    .replace(/\/api\/v1\/api-keys\/[^/]+/g, '/api/v1/api-keys/:id')
    .replace(/\/api\/v1\/auth\/[^/]+/g, '/api/v1/auth/:action');
  return normalized || 'unknown';
}

/**
 * Middleware that records request count and duration. Must run early (after requestId).
 */
export function appMetricsMiddleware(req, res, next) {
  const start = Date.now();
  const route = normalizeRoute(req.path);

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const status = String(res.statusCode);
    const method = req.method || 'unknown';

    httpRequestsTotal.inc({ method, route, status }, 1);
    httpRequestDurationSeconds.observe({ method, route, status }, duration);
  });

  next();
}

export async function getAppMetrics() {
  return appRegistry.metrics();
}
