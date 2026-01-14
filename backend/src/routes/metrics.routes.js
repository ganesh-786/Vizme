import express from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateApiKey, authenticate } from '../middleware/auth.middleware.js';
import { metricsLimiter } from '../middleware/rateLimiter.js';
import { BadRequestError } from '../middleware/errorHandler.js';

const router = express.Router();

const METRIC_TYPES = ['counter', 'gauge', 'histogram', 'summary'];
const METRIC_TTL_MS = parseInt(process.env.METRIC_TTL_MS || '300000', 10); // Default: 5 minutes
const CLEANUP_INTERVAL_MS = parseInt(process.env.METRIC_CLEANUP_INTERVAL_MS || '60000', 10); // Default: 1 minute

// In-memory storage for metrics
// Structure: Map<userId, Map<metricKey, { name, type, value, labels, timestamp }>>
// metricKey = `${metricName}_${JSON.stringify(sortedLabels)}`
const metricsStore = new Map();

// Cleanup expired metrics periodically
const cleanupExpiredMetrics = () => {
  const now = Date.now();
  let totalCleaned = 0;

  for (const [userId, userMetrics] of metricsStore.entries()) {
    for (const [metricKey, metric] of userMetrics.entries()) {
      if (now - metric.timestamp > METRIC_TTL_MS) {
        userMetrics.delete(metricKey);
        totalCleaned++;
      }
    }
    
    // Remove user entry if no metrics left
    if (userMetrics.size === 0) {
      metricsStore.delete(userId);
    }
  }

  if (totalCleaned > 0) {
    console.log(`Cleaned up ${totalCleaned} expired metrics`);
  }
};

// Start cleanup interval
setInterval(cleanupExpiredMetrics, CLEANUP_INTERVAL_MS);

// Validate metric value
const validateMetricValue = (value, type) => {
  const numValue = typeof value === 'number' ? value : parseFloat(value);
  
  if (isNaN(numValue) || !isFinite(numValue)) {
    return false;
  }

  // Prometheus values must be non-negative for counters
  if (type === 'counter' && numValue < 0) {
    return false;
  }

  return true;
};

// Validate metric name format (Prometheus naming convention)
const validateMetricName = (name) => {
  return /^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name);
};

// Generate metric key from name and labels
const getMetricKey = (name, labels) => {
  // Sort labels to ensure consistent key generation
  const sortedLabels = Object.keys(labels || {})
    .sort()
    .reduce((acc, key) => {
      acc[key] = labels[key];
      return acc;
    }, {});
  
  return `${name}_${JSON.stringify(sortedLabels)}`;
};

// Store metric in memory
const storeMetric = (metric, userId) => {
  if (!metricsStore.has(userId)) {
    metricsStore.set(userId, new Map());
  }

  const userMetrics = metricsStore.get(userId);
  const metricKey = getMetricKey(metric.name, metric.labels);
  
  // For counters, increment existing value; for others, replace
  if (metric.type === 'counter' && userMetrics.has(metricKey)) {
    const existing = userMetrics.get(metricKey);
    existing.value += metric.value;
    existing.timestamp = Date.now();
  } else {
    userMetrics.set(metricKey, {
      name: metric.name,
      type: metric.type,
      value: metric.value,
      labels: metric.labels || {},
      timestamp: Date.now()
    });
  }
};

// Generate Prometheus metrics format
const generatePrometheusMetrics = (userId) => {
  const userMetrics = metricsStore.get(userId);
  
  if (!userMetrics || userMetrics.size === 0) {
    return '';
  }

  const lines = [];
  const now = Date.now();
  
  // Group metrics by name and type for proper Prometheus format
  const metricGroups = new Map();
  
  for (const metric of userMetrics.values()) {
    // Skip expired metrics
    if (now - metric.timestamp > METRIC_TTL_MS) {
      continue;
    }

    const groupKey = `${metric.name}_${metric.type}`;
    if (!metricGroups.has(groupKey)) {
      metricGroups.set(groupKey, []);
    }
    metricGroups.get(groupKey).push(metric);
  }

  // Format each metric group
  for (const [groupKey, metrics] of metricGroups.entries()) {
    const [metricName, metricType] = groupKey.split('_');
    
    // Add help and type comments (Prometheus format)
    lines.push(`# HELP ${metricName} User metric: ${metricName}`);
    lines.push(`# TYPE ${metricName} ${metricType}`);
    
    // Add metric values
    for (const metric of metrics) {
      const labels = metric.labels || {};
      const labelString = Object.entries(labels)
        .map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`)
        .join(',');
      
      const metricLine = labelString
        ? `${metricName}{${labelString}} ${metric.value}`
        : `${metricName} ${metric.value}`;
      
      lines.push(metricLine);
    }
  }

  return lines.join('\n') + '\n';
};

// Metrics ingestion endpoint (requires API key)
router.post('/',
  authenticateApiKey,
  metricsLimiter,
  [
    body('metrics').isArray({ min: 1, max: 100 }).withMessage('Metrics must be an array with 1-100 items'),
    body('metrics.*.name').trim().isLength({ min: 1, max: 255 }).withMessage('Metric name is required and must be <= 255 chars'),
    body('metrics.*.type').isIn(METRIC_TYPES).withMessage(`Metric type must be one of: ${METRIC_TYPES.join(', ')}`),
    body('metrics.*.value').custom((value) => {
      const numValue = typeof value === 'number' ? value : parseFloat(value);
      if (isNaN(numValue) || !isFinite(numValue)) {
        throw new Error('Metric value must be a valid number');
      }
      return true;
    }),
    body('metrics.*.labels').optional().isObject().withMessage('Labels must be an object')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new BadRequestError('Validation failed', errors.array());
      }

      const { metrics } = req.body;
      const userId = req.user.id;

      // Validate and process each metric
      const validMetrics = [];
      const errors_list = [];

      for (let i = 0; i < metrics.length; i++) {
        const metric = metrics[i];
        
        // Validate metric name format
        if (!validateMetricName(metric.name)) {
          errors_list.push({
            index: i,
            error: `Invalid metric name format: ${metric.name}. Must match Prometheus naming convention`
          });
          continue;
        }

        // Validate metric value
        if (!validateMetricValue(metric.value, metric.type)) {
          errors_list.push({
            index: i,
            error: `Invalid value for ${metric.type} metric: ${metric.value}`
          });
          continue;
        }

        // Validate labels (if provided)
        if (metric.labels && typeof metric.labels !== 'object') {
          errors_list.push({
            index: i,
            error: 'Labels must be an object'
          });
          continue;
        }

        // Prepare metric for storage
        validMetrics.push({
          name: metric.name,
          type: metric.type,
          value: typeof metric.value === 'number' ? metric.value : parseFloat(metric.value),
          labels: {
            ...(metric.labels || {}),
            user_id: userId.toString()
          }
        });
      }

      if (validMetrics.length === 0) {
        throw new BadRequestError('No valid metrics to process', errors_list);
      }

      // Store metrics in memory
      for (const metric of validMetrics) {
        storeMetric(metric, userId);
      }

      res.json({
        success: true,
        data: {
          processed: validMetrics.length,
          total: metrics.length,
          errors: errors_list.length > 0 ? errors_list : undefined
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Prometheus metrics endpoint (for scraping)
// This endpoint exposes metrics in Prometheus exposition format
// Can be accessed with API key or JWT token
router.get('/metrics',
  authenticateApiKey, // Supports both API key and JWT via authenticateApiKey
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const prometheusMetrics = generatePrometheusMetrics(userId);

      // Set proper content type for Prometheus
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(prometheusMetrics || '# No metrics available\n');
    } catch (error) {
      next(error);
    }
  }
);

// Alternative endpoint that also supports JWT authentication
router.get('/prometheus',
  authenticate, // JWT authentication
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const prometheusMetrics = generatePrometheusMetrics(userId);

      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(prometheusMetrics || '# No metrics available\n');
    } catch (error) {
      next(error);
    }
  }
);

// Get metrics (for authenticated users to view their metrics as JSON)
router.get('/',
  authenticate,
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const userMetrics = metricsStore.get(userId);
      
      if (!userMetrics || userMetrics.size === 0) {
        return res.json({
          success: true,
          data: {
            metrics: [],
            count: 0,
            message: 'No metrics available'
          }
        });
      }

      const now = Date.now();
      const metrics = [];
      
      for (const metric of userMetrics.values()) {
        // Only return non-expired metrics
        if (now - metric.timestamp <= METRIC_TTL_MS) {
          metrics.push({
            name: metric.name,
            type: metric.type,
            value: metric.value,
            labels: metric.labels,
            timestamp: new Date(metric.timestamp).toISOString(),
            age_seconds: Math.floor((now - metric.timestamp) / 1000)
          });
        }
      }

      // Sort by timestamp (newest first)
      metrics.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      res.json({
        success: true,
        data: {
          metrics,
          count: metrics.length,
          ttl_seconds: Math.floor(METRIC_TTL_MS / 1000)
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get metrics statistics
router.get('/stats',
  authenticate,
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const userMetrics = metricsStore.get(userId);
      
      if (!userMetrics || userMetrics.size === 0) {
        return res.json({
          success: true,
          data: {
            total_metrics: 0,
            unique_metric_names: 0,
            by_type: []
          }
        });
      }

      const now = Date.now();
      const activeMetrics = Array.from(userMetrics.values())
        .filter(m => now - m.timestamp <= METRIC_TTL_MS);
      
      const uniqueNames = new Set(activeMetrics.map(m => m.name));
      const byType = {};
      
      activeMetrics.forEach(metric => {
        byType[metric.type] = (byType[metric.type] || 0) + 1;
      });

      res.json({
        success: true,
        data: {
          total_metrics: activeMetrics.length,
          unique_metric_names: uniqueNames.size,
          by_type: Object.entries(byType).map(([type, count]) => ({ type, count }))
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as metricsRoutes };