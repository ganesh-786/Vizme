import { Registry, Counter, Gauge, Histogram, Summary } from 'prom-client';
import { config } from '../config.js';

/**
 * Prometheus Metrics Service
 *
 * Manages user-submitted metrics with multi-tenant isolation.
 * - Validates and records in prom-client (for cardinality tracking)
 * - User metrics are pushed to Mimir only (via metrics.routes batch push)
 * - /metrics endpoint exposes app metrics only (no user data) for Prometheus scrape
 */

// Create a custom registry for application metrics
// This allows us to separate application metrics from default Node.js metrics
const register = new Registry();

// Set default labels that will be added to all metrics
// This helps with filtering and querying in Prometheus
register.setDefaultLabels({
  app: 'unified-visibility-platform',
  version: '1.0.0'
});

// Track metric instances to avoid duplicates
// Key: `${userId}_${metricName}_${labelHash}`
const metricInstances = new Map();

/**
 * Validate and sanitize labels (max keys, max value length). Prevents cardinality explosion.
 * @param {Object} labels - Raw labels
 * @returns {Object} - Sanitized labels
 * @throws {Error} - If validation fails
 */
const validateAndSanitizeLabels = (labels) => {
  const maxKeys = config.metrics.maxLabelsPerMetric;
  const maxLen = config.metrics.maxLabelValueLength;
  const keys = Object.keys(labels || {}).filter(k => k !== '_type' && k !== '_operation');
  if (keys.length > maxKeys) {
    throw new Error(`Too many labels: max ${maxKeys}, got ${keys.length}`);
  }
  const sanitized = {};
  for (const [key, value] of Object.entries(labels || {})) {
    if (key === '_type' || key === '_operation') continue;
    const strKey = String(key);
    let strVal = String(value);
    if (strVal.length > maxLen) {
      strVal = strVal.slice(0, maxLen);
    }
    sanitized[strKey] = strVal;
  }
  return sanitized;
};

/**
 * Generate a hash from labels object for consistent key generation
 * @param {Object} labels - Metric labels
 * @returns {string} - Hash string
 */
const hashLabels = (labels) => {
  const sorted = Object.keys(labels)
    .sort()
    .map(key => `${key}:${labels[key]}`)
    .join(',');
  return sorted || 'no-labels';
};

/**
 * Get or create a Prometheus metric instance
 * @param {string} userId - User ID
 * @param {string} metricName - Metric name
 * @param {string} metricType - Metric type (counter, gauge, histogram, summary)
 * @param {Object} labels - Metric labels
 * @returns {Counter|Gauge|Histogram|Summary} - Prometheus metric instance
 */
const getOrCreateMetric = (metricName, metricType, labelKeys) => {
  // Cache by metric name + sorted label key names (not values, not userId)
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
        registers: [register]
      });
      break;
    case 'gauge':
      metric = new Gauge({
        name: fullMetricName,
        help: `Gauge metric: ${metricName}`,
        labelNames: allLabelNames,
        registers: [register]
      });
      break;
    case 'histogram':
      metric = new Histogram({
        name: fullMetricName,
        help: `Histogram metric: ${metricName}`,
        labelNames: allLabelNames,
        buckets: [0.1, 0.5, 1, 2.5, 5, 10, 25, 50, 100],
        registers: [register]
      });
      break;
    case 'summary':
      metric = new Summary({
        name: fullMetricName,
        help: `Summary metric: ${metricName}`,
        labelNames: allLabelNames,
        percentiles: [0.01, 0.1, 0.5, 0.9, 0.99],
        registers: [register]
      });
      break;
    default:
      throw new Error(`Unsupported metric type: ${metricType}`);
  }

  metricInstances.set(key, metric);
  return metric;
};

/**
 * Record a metric value
 * @param {Object} metricData - Metric data
 * @param {string} metricData.name - Metric name
 * @param {string} metricData.type - Metric type
 * @param {number} metricData.value - Metric value
 * @param {Object} metricData.labels - Metric labels
 * @param {string} userId - User ID
 */
/** Count unique series per user for cardinality limit. */
const userSeriesCount = new Map();

export const recordMetric = (metricData, userId) => {
  const { name, type, value, labels = {} } = metricData;
  if (process.env.NODE_ENV === 'development') {
    console.log(`[DEBUG] recordMetric called: name=${name}, type=${type}, value=${value}`);
  }

  // Validate and sanitize labels
  const sanitizedLabels = validateAndSanitizeLabels(labels);

  // Cardinality limit: reject if user exceeds max series
  const maxSeries = config.metrics.maxSeriesPerUser;
  const labelHash = hashLabels(sanitizedLabels);
  const seriesKey = `${userId}_${name}_${labelHash}`;
  const currentCount = userSeriesCount.get(userId) ?? new Set();
  if (!currentCount.has(seriesKey) && currentCount.size >= maxSeries) {
    throw new Error(`Cardinality limit exceeded: max ${maxSeries} series per user`);
  }

  // Validate value
  const numValue = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(numValue)) {
    throw new Error(`Invalid metric value: ${value}`);
  }

  // Validate counter values (must be non-negative)
  if (type.toLowerCase() === 'counter' && numValue < 0) {
    throw new Error('Counter metrics cannot have negative values');
  }

  // Get or create the metric instance
  const metric = getOrCreateMetric(name, type, Object.keys(sanitizedLabels));

  // Prepare labels with user_id
  const metricLabels = {
    ...sanitizedLabels,
    user_id: userId.toString()
  };

  // Record the metric based on type
  try {
    switch (type.toLowerCase()) {
      case 'counter':
        // For counters, we typically increment, but allow setting absolute value
        // If value is 0 or positive, we'll set it (assuming it's a delta)
        if (numValue > 0) {
          metric.inc(metricLabels, numValue);
        }
        break;

        case 'gauge':
          const operation = metricData.operation || (numValue < 0 ? 'decrement' : numValue>0 ? 'increment' : 'set');
          if (operation === 'set') {
            metric.set(metricLabels, Math.abs(numValue));
          } else if (operation === 'increment') {
            metric.inc(metricLabels, Math.abs(numValue));
          } else if (operation === 'decrement') {
            metric.dec(metricLabels, Math.abs(numValue));
          } else {
            throw new Error(`Unsupported operation: ${operation}`);
          }
          break;

      case 'histogram':
        // Histograms observe values
        metric.observe(metricLabels, numValue);
        break;

      case 'summary':
        // Summaries observe values
        metric.observe(metricLabels, numValue);
        break;
    }

    // Store in memory for reference (optional, for debugging/querying)
    const key = `${userId}_${name}_${labelHash}`;
    metricsStore.set(key, {
      name,
      type,
      value: numValue,
      labels: metricLabels,
      timestamp: Date.now()
    });
    currentCount.add(seriesKey);
    userSeriesCount.set(userId, currentCount);

  } catch (error) {
    console.error(`Error recording metric ${name}:`, error);
    throw error;
  }
};

/**
 * Get metrics in Prometheus format
 * This is called by the /metrics endpoint for Prometheus scraping
 * @returns {Promise<string>} - Prometheus metrics in text format
 */
export const getMetrics = async () => {
  return register.metrics();
};

/**
 * Get metrics registry
 * Useful for adding custom metrics or accessing the registry directly
 * @returns {Registry} - Prometheus registry
 */
export const getRegistry = () => {
  return register;
};

/**
 * Clear metrics for a specific user (optional cleanup).
 * Note: Clears metricsStore and userSeriesCount only. prom-client does not support
 * removing metrics from the registry; existing series remain until backend restart.
 * @param {string} userId - User ID
 */
export const clearUserMetrics = (userId) => {
  const keysToDelete = [];
  for (const [key] of metricsStore) {
    if (key.startsWith(`${userId}_`)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => metricsStore.delete(key));
  userSeriesCount.delete(userId);
};

/**
 * Get metrics statistics (for debugging/monitoring)
 * @returns {Object} - Statistics about stored metrics
 */
export const getMetricsStats = () => {
  return {
    totalMetrics: metricsStore.size,
    totalInstances: metricInstances.size,
    registryMetrics: register.getMetricsAsArray().length
  };
};
