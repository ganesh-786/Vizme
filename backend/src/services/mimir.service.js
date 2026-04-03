/**
 * Grafana Mimir integration - push user metrics with hard tenant isolation.
 * Uses X-Scope-OrgID header for tenant ID (user_id).
 * Metrics are pushed via Prometheus remote write API.
 *
 * Maintains cumulative state for counter metrics so Mimir always receives
 * monotonically increasing values (required by Prometheus remote-write protocol).
 * Gauge inc/dec operations also accumulate correctly.
 * State is in-memory; a backend restart triggers a counter-reset which
 * Prometheus/Mimir handle gracefully via built-in reset detection.
 */
import { pushTimeseries } from 'prometheus-remote-write';
import { config } from '../config.js';
import { logger } from '../logger.js';

const MIMIR_PUSH_URL = `${config.urls.mimir.replace(/\/$/, '')}/api/v1/push`;

/**
 * In-memory cumulative state for Mimir remote-write values.
 * Key: `${tenantId}::user_metric_${name}::${sortedLabelPairs}`
 */
/**
 * Stores cumulative counter/gauge values AND the full label set so the
 * heartbeat can re-push current values periodically, keeping increase()
 * accurate even when real events are sparse.
 * Value: { value: number, labels: object } (labels include __name__)
 */
const cumulativeState = new Map();

function hashLabels(labels) {
  return Object.entries(labels)
    .filter(([k]) => k !== '__name__')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',') || '_';
}

/**
 * Resolve the value to push to Mimir based on metric type and operation.
 * - counter: accumulate into monotonically increasing value
 * - gauge set: store absolute value
 * - gauge inc/dec: accumulate relative change
 * - histogram/summary: pass raw observation
 */
function resolveValue(metric, tenantId, fullLabels) {
  const type = (metric.type || 'gauge').toLowerCase();
  const operation = metric.operation || 'set';
  const fullName = `user_metric_${metric.name}`;
  const labelHash = hashLabels({ ...(metric.labels || {}), __name__: fullName });
  const stateKey = `${tenantId}::${fullName}::${labelHash}`;

  const entry = cumulativeState.get(stateKey);
  const currentValue = entry ? entry.value : 0;

  if (type === 'counter') {
    const next = currentValue + Math.abs(metric.value);
    cumulativeState.set(stateKey, { value: next, labels: fullLabels, tenantId });
    return next;
  }

  if (type === 'gauge') {
    let next;
    switch (operation) {
      case 'increment':
        next = currentValue + Math.abs(metric.value);
        break;
      case 'decrement':
        next = currentValue - Math.abs(metric.value);
        break;
      case 'set':
      default:
        next = metric.value;
        break;
    }
    cumulativeState.set(stateKey, { value: next, labels: fullLabels, tenantId });
    return next;
  }

  return metric.value;
}

/**
 * Push a single metric to Mimir with tenant isolation.
 * @param {Object} params
 * @param {string} params.name - Metric name (will be prefixed with user_metric_)
 * @param {string} params.type - counter, gauge, histogram, summary
 * @param {number} params.value - Metric value
 * @param {Object} params.labels - Metric labels
 * @param {string} params.operation - set, increment, decrement
 * @param {string} params.userId - Tenant ID = X-Scope-OrgID
 */
export async function pushMetricToMimir({ name, type, value, labels = {}, operation, userId }) {
  const base = config.urls.mimir || '';
  if (!base) return;

  const fullName = `user_metric_${name}`;
  const metricLabels = { ...labels, __name__: fullName };
  const resolved = resolveValue({ name, type, value, labels, operation }, String(userId), metricLabels);

  try {
    await pushTimeseries(
      {
        labels: metricLabels,
        samples: [{ value: resolved, timestamp: Date.now() }],
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
 * @param {Array<{name, type, value, labels, operation, userId}>} metrics
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
    const timeseries = tenantMetrics.map((m) => {
      const fullLabels = { ...(m.labels || {}), __name__: `user_metric_${m.name}` };
      const resolved = resolveValue(m, tenantId, fullLabels);
      return {
        labels: fullLabels,
        samples: [{ value: resolved, timestamp: Date.now() }],
      };
    });
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

/**
 * Clear cumulative state for a tenant (e.g. on user deletion).
 * @param {string} tenantId
 */
export function clearTenantState(tenantId) {
  const prefix = `${tenantId}::`;
  for (const key of cumulativeState.keys()) {
    if (key.startsWith(prefix)) cumulativeState.delete(key);
  }
}

/**
 * Counter heartbeat — periodically re-pushes the current cumulative value
 * for every tracked series so that PromQL increase() has dense samples and
 * does not over-extrapolate on sparse event data (e.g. a few orders/day).
 */
let _heartbeatTimer = null;

export function startCounterHeartbeat(intervalMs = 60_000) {
  if (_heartbeatTimer) return;
  const mimirUrl = config.urls.mimir?.replace(/\/$/, '');
  if (!mimirUrl) return;
  const pushUrl = `${mimirUrl}/api/v1/push`;

  _heartbeatTimer = setInterval(async () => {
    if (cumulativeState.size === 0) return;

    const byTenant = new Map();
    for (const [, entry] of cumulativeState) {
      if (!entry.labels || !entry.tenantId) continue;
      const tid = entry.tenantId;
      if (!byTenant.has(tid)) byTenant.set(tid, []);
      byTenant.get(tid).push({
        labels: entry.labels,
        samples: [{ value: entry.value, timestamp: Date.now() }],
      });
    }

    for (const [tenantId, timeseries] of byTenant) {
      try {
        await pushTimeseries(timeseries, {
          url: pushUrl,
          headers: { 'X-Scope-OrgID': tenantId, 'Content-Encoding': 'snappy' },
        });
      } catch (err) {
        logger.warn({ err, tenantId }, 'Counter heartbeat push failed');
      }
    }
  }, intervalMs);
}

export function stopCounterHeartbeat() {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
}
