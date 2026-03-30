import { Registry, Counter, Gauge, Histogram, Summary } from 'prom-client';
import { query } from '../database/connection.js';

const register = new Registry();

register.setDefaultLabels({
  app: 'unified-visibility-platform',
  version: '1.0.0',
});

const metricsStore = new Map();
const metricInstances = new Map();

// --- Batch persistence ---
// Accumulate DB writes and flush periodically to avoid
// hammering PostgreSQL on every single recordMetric call.
const pendingUpserts = new Map(); // key -> { userId, name, type, value, labels }
let flushTimer = null;
const FLUSH_INTERVAL_MS = 5000; // flush every 5 seconds

const scheduleFlush = () => {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushToDb().catch((err) => console.error('Failed to flush metrics to DB:', err));
  }, FLUSH_INTERVAL_MS);
};

const flushToDb = async () => {
  if (pendingUpserts.size === 0) return;

  const entries = [...pendingUpserts.values()];
  pendingUpserts.clear();

  // Build a single multi-row upsert for efficiency
  const values = [];
  const placeholders = [];
  let idx = 1;

  for (const entry of entries) {
    placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`);
    values.push(entry.userId, entry.name, entry.type, entry.value, JSON.stringify(entry.labels));
    idx += 5;
  }

  const sql = `
    INSERT INTO metric_values (user_id, metric_name, metric_type, value, labels)
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (user_id, metric_name, labels)
    DO UPDATE SET
      value = EXCLUDED.value,
      metric_type = EXCLUDED.metric_type,
      updated_at = CURRENT_TIMESTAMP
  `;

  await query(sql, values);
};

// --- End batch persistence ---

const hashLabels = (labels) => {
  const sorted = Object.keys(labels)
    .sort()
    .map((key) => `${key}:${labels[key]}`)
    .join(',');
  return sorted || 'no-labels';
};

const getOrCreateMetric = (metricName, metricType, labelKeys) => {
  const allLabelNames = [...labelKeys, 'user_id'].sort();
  const key = `${metricName}_${allLabelNames.join(',')}`;

  if (metricInstances.has(key)) {
    return metricInstances.get(key);
  }

  let metric;
  const fullMetricName = `user_metric_${metricName}`;

  switch (metricType.toLowerCase()) {
    case 'counter':
      metric = new Counter({
        name: fullMetricName,
        help: `Counter metric: ${metricName}`,
        labelNames: allLabelNames,
        registers: [register],
      });
      break;
    case 'gauge':
      metric = new Gauge({
        name: fullMetricName,
        help: `Gauge metric: ${metricName}`,
        labelNames: allLabelNames,
        registers: [register],
      });
      break;
    case 'histogram':
      metric = new Histogram({
        name: fullMetricName,
        help: `Histogram metric: ${metricName}`,
        labelNames: allLabelNames,
        buckets: [0.1, 0.5, 1, 2.5, 5, 10, 25, 50, 100],
        registers: [register],
      });
      break;
    case 'summary':
      metric = new Summary({
        name: fullMetricName,
        help: `Summary metric: ${metricName}`,
        labelNames: allLabelNames,
        percentiles: [0.01, 0.1, 0.5, 0.9, 0.99],
        registers: [register],
      });
      break;
    default:
      throw new Error(`Unsupported metric type: ${metricType}`);
  }

  metricInstances.set(key, metric);
  return metric;
};

/**
 * Resolve the current absolute value for a counter or gauge so we
 * can persist it. For counters we read back the running total from
 * the Prometheus metric instance; for gauges we store the latest
 * set/inc/dec result.
 */
const resolveCurrentValue = async (metricName, metricLabels) => {
  const fullMetricName = `user_metric_${metricName}`;
  const promMetric = register.getSingleMetric(fullMetricName);
  if (!promMetric) return 0;

  // prom-client exposes .get() which returns { values: [...] }
  const snapshot = await promMetric.get();
  for (const entry of snapshot.values) {
    const labelsMatch = Object.keys(metricLabels).every(
      (k) => String(entry.labels[k]) === String(metricLabels[k])
    );
    if (labelsMatch) {
      return entry.value;
    }
  }
  return 0;
};

export const recordMetric = async (metricData, userId) => {
  const { name, type, value, labels = {} } = metricData;

  const numValue = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(numValue)) {
    throw new Error(`Invalid metric value: ${value}`);
  }

  if (type.toLowerCase() === 'counter' && numValue < 0) {
    throw new Error('Counter metrics cannot have negative values');
  }

  const metric = getOrCreateMetric(name, type, Object.keys(labels));

  const metricLabels = {
    ...labels,
    user_id: userId.toString(),
  };

  try {
    switch (type.toLowerCase()) {
      case 'counter':
        if (numValue > 0) {
          metric.inc(metricLabels, numValue);
        }
        break;
      case 'gauge': {
        const operation =
          metricData.operation || (numValue < 0 ? 'decrement' : numValue > 0 ? 'increment' : 'set');
        if (operation === 'set') {
          metric.set(metricLabels, Math.abs(numValue));
        } else if (operation === 'increment') {
          metric.inc(metricLabels, Math.abs(numValue));
        } else if (operation === 'decrement') {
          metric.dec(metricLabels, Math.abs(numValue));
        }
        break;
      }
      case 'histogram':
      case 'summary':
        metric.observe(metricLabels, numValue);
        break;
    }

    // --- Persist to DB (counters & gauges only) ---
    if (type.toLowerCase() === 'counter' || type.toLowerCase() === 'gauge') {
      const currentValue = await resolveCurrentValue(name, metricLabels);
      const persistKey = `${userId}_${name}_${hashLabels(labels)}`;
      pendingUpserts.set(persistKey, {
        userId,
        name,
        type: type.toLowerCase(),
        value: currentValue,
        labels: metricLabels,
      });
      scheduleFlush();
    }

    const labelHash = hashLabels(labels);
    const key = `${userId}_${name}_${labelHash}`;
    metricsStore.set(key, {
      name,
      type,
      value: numValue,
      labels: metricLabels,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error(`Error recording metric ${name}:`, error);
    throw error;
  }
};

/**
 * Restore persisted counter and gauge values from PostgreSQL
 * into the Prometheus registry. Call this once at startup
 * after the database is ready.
 */
export const restoreMetrics = async () => {
  try {
    const result = await query(
      'SELECT user_id, metric_name, metric_type, value, labels FROM metric_values'
    );

    if (!result.rows.length) {
      console.log('No persisted metrics to restore');
      return;
    }

    let restored = 0;

    for (const row of result.rows) {
      const { user_id, metric_name, metric_type, value, labels } = row;

      // labels already contains user_id from when it was stored
      const labelKeys = Object.keys(labels).filter((k) => k !== 'user_id');
      const metric = getOrCreateMetric(metric_name, metric_type, labelKeys);

      try {
        switch (metric_type) {
          case 'counter':
            // Counter.inc(labels, amount) — restore accumulated total
            if (value > 0) {
              metric.inc(labels, value);
            }
            break;
          case 'gauge':
            metric.set(labels, value);
            break;
          // Histograms/summaries are not restored — Prometheus
          // handles counter-like resets for _sum and _count, and
          // bucket state can't be meaningfully reconstructed.
        }
        restored++;
      } catch (err) {
        console.error(`Failed to restore metric ${metric_name} for user ${user_id}:`, err.message);
      }
    }

    console.log(`Restored ${restored} metrics from database`);
  } catch (error) {
    console.error('Failed to restore metrics:', error);
  }
};

// Flush remaining metrics on process shutdown
const gracefulShutdown = async () => {
  try {
    await flushToDb();
  } catch (err) {
    console.error('Failed to flush metrics on shutdown:', err);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export const getMetrics = async () => {
  return register.metrics();
};

export const getRegistry = () => {
  return register;
};

export const clearUserMetrics = (userId) => {
  const keysToDelete = [];
  for (const [key] of metricsStore) {
    if (key.startsWith(`${userId}_`)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach((key) => {
    metricsStore.delete(key);
    metricInstances.delete(key);
  });
};

export const getMetricsStats = () => {
  return {
    totalMetrics: metricsStore.size,
    totalInstances: metricInstances.size,
    registryMetrics: register.getMetricsAsArray().length,
  };
};
