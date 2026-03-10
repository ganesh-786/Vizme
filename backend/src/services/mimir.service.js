/**
 * Grafana Mimir integration - push user metrics with hard tenant isolation.
 * Uses X-Scope-OrgID header for tenant ID (user_id).
 * Metrics are pushed via Prometheus remote write API.
 */
import { pushTimeseries } from 'prometheus-remote-write';
import { config } from '../config.js';
import { logger } from '../logger.js';

const MIMIR_PUSH_URL = `${config.urls.mimir.replace(/\/$/, '')}/api/v1/push`;

/**
 * Push a single metric to Mimir with tenant isolation.
 * @param {Object} params
 * @param {string} params.name - Metric name (will be prefixed with user_metric_)
 * @param {string} params.type - counter, gauge, histogram, summary
 * @param {number} params.value - Metric value
 * @param {Object} params.labels - Metric labels (user_id added automatically by Mimir via header)
 * @param {string} params.userId - Tenant ID = X-Scope-OrgID
 */
export async function pushMetricToMimir({ name, type, value, labels = {}, userId }) {
  const base = config.urls.mimir || '';
  if (!base) return;

  const fullName = `user_metric_${name}`;
  const metricLabels = { ...labels, __name__: fullName };

  try {
    await pushTimeseries(
      {
        labels: metricLabels,
        samples: [{ value, timestamp: Date.now() }],
      },
      {
        url: MIMIR_PUSH_URL,
        headers: {
          'X-Scope-OrgID': String(userId),
          'Content-Encoding': 'snappy',
        },
      }
    );
  } catch (err) {
    logger.warn({ err, userId, metric: name }, 'Mimir push failed');
  }
}

/**
 * Push multiple metrics to Mimir in a single request per tenant (batched).
 * @param {Array<{name, type, value, labels, userId}>} metrics
 */
export async function pushMetricsToMimir(metrics) {
  if (!metrics.length) return;
  const mimirUrl = config.urls.mimir?.replace(/\/$/, '');
  if (!mimirUrl) return;

  const pushUrl = `${mimirUrl}/api/v1/push`;
  const byTenant = new Map();
  for (const m of metrics) {
    const tid = String(m.userId);
    if (!byTenant.has(tid)) byTenant.set(tid, []);
    byTenant.get(tid).push(m);
  }

  for (const [tenantId, tenantMetrics] of byTenant) {
    const timeseries = tenantMetrics.map((m) => ({
      labels: { ...(m.labels || {}), __name__: `user_metric_${m.name}` },
      samples: [{ value: m.value, timestamp: Date.now() }],
    }));
    try {
      await pushTimeseries(timeseries, {
        url: pushUrl,
        headers: {
          'X-Scope-OrgID': tenantId,
          'Content-Encoding': 'snappy',
        },
      });
    } catch (err) {
      logger.warn({ err, tenantId, count: tenantMetrics.length }, 'Mimir batch push failed');
    }
  }
}
