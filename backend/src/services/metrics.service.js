import { Registry, Counter, Gauge, Histogram, Summary } from 'prom-client';

/**
 * Prometheus Metrics Service
 * 
 * This service manages Prometheus metrics using the prom-client library.
 * Metrics are stored in memory and exposed via /metrics endpoint for Prometheus scraping.
 * 
 * Best Practices:
 * - Use appropriate metric types (Counter, Gauge, Histogram, Summary)
 * - Label metrics with user_id for multi-tenancy
 * - Register all metrics in a single registry
 * - Expose metrics endpoint for Prometheus scraping
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

// In-memory storage for user-submitted metrics
// Key: `${userId}_${metricName}_${labelHash}`
// Value: { type, value, labels, timestamp }
const metricsStore = new Map();

// Track metric instances to avoid duplicates
// Key: `${userId}_${metricName}_${labelHash}`
const metricInstances = new Map();

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

//Helper: get current gauge value for an exact label-set ( used to clamp decrements)
const getCurrentGaugeValue = (gauge, metricLabels) => {
  const snapshot = gauge.get(); // {name , help. type. values: [..,..]}
  const targetHash = hashLabels(metricLabels); //this will use sorted keys

  const point = snapshot?.values?.find(v=> {
    const vHash = hashLabels(v.labels || {});
    return vHash === targetHash; //compare hashes instead of objects for performance
  });
  return typeof point?.value === 'number' ? point.value : 0;
};
/**
 * Get or create a Prometheus metric instance
 * @param {string} userId - User ID
 * @param {string} metricName - Metric name
 * @param {string} metricType - Metric type (counter, gauge, histogram, summary)
 * @param {Object} labels - Metric labels
 * @returns {Counter|Gauge|Histogram|Summary} - Prometheus metric instance
 */
const getOrCreateMetric = (userId, metricName, metricType, labels) => {
  const labelHash = hashLabels(labels);
  const key = `${userId}_${metricName}_${labelHash}`;

  // Return existing instance if available
  if (metricInstances.has(key)) {
    return metricInstances.get(key);
  }

  // Create labels with user_id included
  const metricLabels = {
    ...labels,
    user_id: userId.toString()
  };

  // Create appropriate metric type
  let metric;
  const fullMetricName = `user_metric_${metricName}`;

  switch (metricType.toLowerCase()) {
    case 'counter':
      metric = new Counter({
        name: fullMetricName,
        help: `Counter metric: ${metricName}`,
        labelNames: Object.keys(metricLabels),
        registers: [register]
      });
      break;

    case 'gauge':
      metric = new Gauge({
        name: fullMetricName,
        help: `Gauge metric: ${metricName}`,
        labelNames: Object.keys(metricLabels),
        registers: [register]
      });
      break;

    case 'histogram':
      metric = new Histogram({
        name: fullMetricName,
        help: `Histogram metric: ${metricName}`,
        labelNames: Object.keys(metricLabels),
        buckets: [0.1, 0.5, 1, 2.5, 5, 10, 25, 50, 100], // Default buckets
        registers: [register]
      });
      break;

    case 'summary':
      metric = new Summary({
        name: fullMetricName,
        help: `Summary metric: ${metricName}`,
        labelNames: Object.keys(metricLabels),
        percentiles: [0.01, 0.1, 0.5, 0.9, 0.99], // Default percentiles
        registers: [register]
      });
      break;

    default:
      throw new Error(`Unsupported metric type: ${metricType}`);
  }

  // Cache the instance
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
export const recordMetric = (metricData, userId) => {
  const { name, type, value, labels = {} } = metricData;

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
  const metric = getOrCreateMetric(userId, name, type, labels);

  // Prepare labels with user_id
  const metricLabels = {
    ...labels,
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

      case 'gauge':{
        const delta = numValue;

        console.log('📊 [GAUGE] Processing:', {
          delta,
          metricLabels: JSON.stringify(metricLabels),
          labelsHash: hashLabels(metricLabels)
        });

        if(delta > 0){
          const before = getCurrentGaugeValue(metric, metricLabels);
          metric.inc(metricLabels, delta);
          const after = getCurrentGaugeValue(metric, metricLabels);
          console.log('📈 [GAUGE] Increment:', { before, delta, after });
          break;
        }

        if(delta < 0){
          const current = getCurrentGaugeValue(metric, metricLabels);
          console.log('📉 [GAUGE] Decrement attempt:', { current, delta });
          const decAmount = Math.min(current, Math.abs(delta));
          if(decAmount > 0) {
            metric.dec(metricLabels, decAmount);
            const after = getCurrentGaugeValue(metric, metricLabels);
            console.log('📉 [GAUGE] Decrement:', { before: current, decAmount, after });
          } else {
            console.log('⚠️ [GAUGE] Cannot decrement - current is 0 or labels not found');
          }
          break;
        }

        break;
      }

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
    const labelHash = hashLabels(labels);
    const key = `${userId}_${name}_${labelHash}`;
    metricsStore.set(key, {
      name,
      type,
      value: numValue,
      labels: metricLabels,
      timestamp: Date.now()
    });

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
 * Clear metrics for a specific user (optional cleanup)
 * @param {string} userId - User ID
 */
export const clearUserMetrics = (userId) => {
  const keysToDelete = [];
  for (const [key] of metricsStore) {
    if (key.startsWith(`${userId}_`)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => {
    metricsStore.delete(key);
    metricInstances.delete(key);
  });
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