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
import { recordMimirWrite } from '../middleware/appMetrics.js';

const DEFAULT_HEARTBEAT_INTERVAL_MS = Math.max(
  parseInt(String(config.metrics?.heartbeatIntervalMs ?? 15_000), 10) || 15_000,
  5_000
);

// ---------------------------------------------------------------------------
// Circuit breaker — protects against cascading failures when Mimir is down.
// States: CLOSED (normal) → OPEN (failing, reject writes) → HALF_OPEN (probe)
// ---------------------------------------------------------------------------
const CB_FAILURE_THRESHOLD = 5;
const CB_RESET_TIMEOUT_MS = 30_000;

const circuitBreaker = {
  state: 'CLOSED',
  failures: 0,
  lastFailureAt: 0,

  recordSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  },

  recordFailure() {
    this.failures++;
    this.lastFailureAt = Date.now();
    if (this.failures >= CB_FAILURE_THRESHOLD) {
      this.state = 'OPEN';
      logger.warn({ failures: this.failures }, 'Mimir circuit breaker OPEN');
    }
  },

  canAttempt() {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN' && Date.now() - this.lastFailureAt >= CB_RESET_TIMEOUT_MS) {
      this.state = 'HALF_OPEN';
      return true;
    }
    return this.state === 'HALF_OPEN';
  },
};

export function getMimirCircuitState() {
  return circuitBreaker.state;
}

/**
 * In-memory cumulative state for Mimir remote-write values.
 * Key: `${tenantId}::user_metric_${name}::${sortedLabelPairs}`
 */
/**
 * Stores cumulative values and the full label set for series that need
 * periodic re-pushes. We only heartbeat counters because gauges are read
 * directly and do not require synthetic density for increase().
 * Value: { value: number, labels: object, tenantId: string, heartbeatEligible: boolean }
 */
const cumulativeState = new Map();

function hashLabels(labels) {
  return Object.entries(labels)
    .filter(([k]) => k !== '__name__')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',') || '_';
}

function prepareSample(metric, tenantId) {
  const type = (metric.type || 'gauge').toLowerCase();
  const operation = metric.operation || 'set';
  const fullName = `user_metric_${metric.name}`;
  const fullLabels = { ...(metric.labels || {}), __name__: fullName };
  const labelHash = hashLabels(fullLabels);
  const stateKey = `${tenantId}::${fullName}::${labelHash}`;

  const entry = cumulativeState.get(stateKey);
  const currentValue = entry ? entry.value : 0;

  if (type === 'counter') {
    const next = currentValue + Math.abs(metric.value);
    return {
      labels: fullLabels,
      sampleValue: next,
      nextState: {
        stateKey,
        entry: { value: next, labels: fullLabels, tenantId, heartbeatEligible: true },
      },
    };
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
    return {
      labels: fullLabels,
      sampleValue: next,
      nextState: {
        stateKey,
        entry: { value: next, labels: fullLabels, tenantId, heartbeatEligible: false },
      },
    };
  }

  return {
    labels: fullLabels,
    sampleValue: metric.value,
    nextState: null,
  };
}

function commitPreparedStates(preparedSeries) {
  for (const prepared of preparedSeries) {
    if (!prepared?.nextState?.stateKey || !prepared?.nextState?.entry) continue;
    cumulativeState.set(prepared.nextState.stateKey, prepared.nextState.entry);
  }
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
  return pushMetricsToMimir(
    [{ name, type, value, labels, operation, userId }],
    { mode: 'single', throwOnFailure: false }
  );
}

/**
 * Push multiple metrics to Mimir in a single request per tenant (batched).
 * @param {Array<{name, type, value, labels, operation, userId}>} metrics
 */
export async function pushMetricsToMimir(metrics, options = {}) {
  const { mode = 'batch', throwOnFailure = false } = options;
  if (!metrics.length) {
    return {
      ok: true,
      mode,
      sampleCount: 0,
      tenantCount: 0,
      successfulTenants: [],
      failedTenants: [],
      durationMs: 0,
    };
  }
  const mimirUrl = config.urls.mimir?.replace(/\/$/, '');
  if (!mimirUrl) {
    const missingUrlError = new Error('MIMIR_URL is not configured');
    missingUrlError.status = 503;
    if (throwOnFailure) throw missingUrlError;
    return {
      ok: false,
      mode,
      sampleCount: metrics.length,
      tenantCount: 0,
      successfulTenants: [],
      failedTenants: [{ tenantId: null, error: missingUrlError.message }],
      durationMs: 0,
    };
  }

  const pushUrl = `${mimirUrl}/api/v1/push`;
  const byTenant = new Map();
  const startedAt = Date.now();
  for (const m of metrics) {
    const tid = String(m.userId);
    if (!byTenant.has(tid)) byTenant.set(tid, []);
    byTenant.get(tid).push(m);
  }

  const summary = {
    ok: true,
    mode,
    sampleCount: metrics.length,
    tenantCount: byTenant.size,
    successfulTenants: [],
    failedTenants: [],
    durationMs: 0,
  };

  if (!circuitBreaker.canAttempt()) {
    summary.ok = false;
    for (const tenantId of byTenant.keys()) {
      summary.failedTenants.push({ tenantId, error: 'Circuit breaker OPEN — Mimir unavailable' });
    }
    summary.durationMs = Date.now() - startedAt;
    if (throwOnFailure) {
      const cbError = new Error('Mimir circuit breaker is open');
      cbError.status = 503;
      cbError.details = summary;
      throw cbError;
    }
    return summary;
  }

  for (const [tenantId, tenantMetrics] of byTenant) {
    const preparedSeries = tenantMetrics.map((m) => prepareSample(m, tenantId));
    const timestamp = Date.now();
    const timeseries = preparedSeries.map((prepared) => ({
      labels: prepared.labels,
      samples: [{ value: prepared.sampleValue, timestamp }],
    }));
    const tenantStartedAt = Date.now();
    try {
      await pushTimeseries(timeseries, {
        url: pushUrl,
        headers: {
          'X-Scope-OrgID': tenantId,
          'Content-Encoding': 'snappy',
        },
      });
      commitPreparedStates(preparedSeries);
      circuitBreaker.recordSuccess();
      summary.successfulTenants.push(tenantId);
      recordMimirWrite({
        mode,
        durationMs: Date.now() - tenantStartedAt,
        outcome: 'success',
        sampleCount: timeseries.length,
        tenantCount: 1,
      });
    } catch (err) {
      circuitBreaker.recordFailure();
      summary.ok = false;
      summary.failedTenants.push({
        tenantId,
        error: err?.message || 'Mimir remote-write failed',
      });
      recordMimirWrite({
        mode,
        durationMs: Date.now() - tenantStartedAt,
        outcome: 'error',
        sampleCount: timeseries.length,
        tenantCount: 1,
        error: err,
      });
      logger.warn({ err, tenantId, count: tenantMetrics.length }, 'Mimir batch push failed');
    }
  }

  summary.durationMs = Date.now() - startedAt;
  if (!summary.ok && throwOnFailure) {
    const writeError = new Error('Mimir remote-write failed');
    writeError.status = 502;
    writeError.details = summary;
    throw writeError;
  }
  return summary;
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
let _heartbeatInFlight = false;

export function startCounterHeartbeat(intervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS) {
  if (_heartbeatTimer) return;
  const mimirUrl = config.urls.mimir?.replace(/\/$/, '');
  if (!mimirUrl) return;
  const pushUrl = `${mimirUrl}/api/v1/push`;
  const safeIntervalMs = Math.max(parseInt(String(intervalMs), 10) || DEFAULT_HEARTBEAT_INTERVAL_MS, 5_000);

  _heartbeatTimer = setInterval(async () => {
    if (cumulativeState.size === 0 || _heartbeatInFlight || !circuitBreaker.canAttempt()) return;
    _heartbeatInFlight = true;

    try {
      const byTenant = new Map();
      const timestamp = Date.now();
      for (const [, entry] of cumulativeState) {
        if (!entry.labels || !entry.tenantId || !entry.heartbeatEligible) continue;
        const tid = entry.tenantId;
        if (!byTenant.has(tid)) byTenant.set(tid, []);
        byTenant.get(tid).push({
          labels: entry.labels,
          samples: [{ value: entry.value, timestamp }],
        });
      }

      for (const [tenantId, timeseries] of byTenant) {
        const tenantStartedAt = Date.now();
        try {
          await pushTimeseries(timeseries, {
            url: pushUrl,
            headers: { 'X-Scope-OrgID': tenantId, 'Content-Encoding': 'snappy' },
          });
          recordMimirWrite({
            mode: 'heartbeat',
            durationMs: Date.now() - tenantStartedAt,
            outcome: 'success',
            sampleCount: timeseries.length,
            tenantCount: 1,
          });
        } catch (err) {
          recordMimirWrite({
            mode: 'heartbeat',
            durationMs: Date.now() - tenantStartedAt,
            outcome: 'error',
            sampleCount: timeseries.length,
            tenantCount: 1,
            error: err,
          });
          logger.warn({ err, tenantId }, 'Counter heartbeat push failed');
        }
      }
    } finally {
      _heartbeatInFlight = false;
    }
  }, safeIntervalMs);
  _heartbeatTimer.unref?.();
  return safeIntervalMs;
}

export function stopCounterHeartbeat() {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
  _heartbeatInFlight = false;
}
