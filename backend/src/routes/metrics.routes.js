import express from 'express';
import axios from 'axios';
import { body, validationResult } from 'express-validator';
import { authenticateApiKey, authenticate } from '../middleware/auth.middleware.js';
import { metricsLimiter } from '../middleware/rateLimiter.js';
import { BadRequestError } from '../middleware/errorHandler.js';
import { query } from '../database/connection.js';

const router = express.Router();

const PUSHGATEWAY_URL = process.env.PUSHGATEWAY_URL || 'http://localhost:9091';
const METRIC_TYPES = ['counter', 'gauge', 'histogram', 'summary'];

// Validate metric value
const validateMetricValue = (value, type) => {
  const numValue = typeof value === 'number' ? value : parseFloat(value);
  
  if (isNaN(numValue)) {
    return false;
  }

  // Prometheus values must be non-negative for counters
  if (type === 'counter' && numValue < 0) {
    return false;
  }

  return true;
};

// Push metric to Prometheus Pushgateway
const pushToPrometheus = async (metric, userId) => {
  const { name, type, value, labels } = metric;

  // Build Prometheus metric format
  const labelString = Object.entries(labels || {})
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`)
    .join(',');
  
    const metricLine = labelString 
    ? `${name}{${labelString}} ${value}`
    : `${name} ${value}`;

  // Pushgateway requires TYPE declaration and trailing newline
  const metricString = `# TYPE ${name} ${type}\n${metricLine}\n`;

  // Push to Pushgateway
  // Format: /metrics/job/<job_name>/<label>/<label_value>
  const jobName = `user_${userId}`;
  const pushUrl = `${PUSHGATEWAY_URL}/metrics/job/${jobName}`;

  try {
    await axios.post(pushUrl, metricString, {
      headers: {
        'Content-Type': 'text/plain'
      },
      timeout: 5000
    });
  } catch (error) {
    console.error('Failed to push to Pushgateway:', error.message);
    throw new Error('Failed to push metric to Prometheus');
  }
};

// Metrics ingestion endpoint (requires API key)
router.post('/',
    // Add CORS middleware
    (req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }
      next();
    },
    authenticateApiKey,
    metricsLimiter,
  [
    body('metrics').isArray({ min: 1, max: 100 }).withMessage('Metrics must be an array with 1-100 items'),
    body('metrics.*.name').trim().isLength({ min: 1 }).withMessage('Metric name is required'),
    body('metrics.*.type').isIn(METRIC_TYPES).withMessage(`Metric type must be one of: ${METRIC_TYPES.join(', ')}`),
    body('metrics.*.value').custom((value) => {
      const numValue = typeof value === 'number' ? value : parseFloat(value);
      if (isNaN(numValue)) {
        throw new Error('Metric value must be a number');
      }
      return true;
    }),
    body('metrics.*.labels').optional().isObject()
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
        
        // Validate metric value
        if (!validateMetricValue(metric.value, metric.type)) {
          errors_list.push({
            index: i,
            error: `Invalid value for ${metric.type} metric`
          });
          continue;
        }

        // Verify metric config exists (optional - can allow custom metrics)
        // For MVP, we'll allow any metric but log it
        validMetrics.push({
          name: metric.name,
          type: metric.type,
          value: typeof metric.value === 'number' ? metric.value : parseFloat(metric.value),
          labels: {
            ...metric.labels,
            user_id: userId.toString()
          }
        });
      }

      if (validMetrics.length === 0) {
        throw new BadRequestError('No valid metrics to process', errors_list);
      }

      // Push to Prometheus Pushgateway
      const pushPromises = validMetrics.map(metric => pushToPrometheus(metric, userId));
      await Promise.allSettled(pushPromises);

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

// Get metrics (for authenticated users to view their metrics)
router.get('/',
  authenticate,
  async (req, res, next) => {
    try {
      // This would typically query Prometheus API or a metrics database
      // For MVP, we'll return a message directing to Grafana
      res.json({
        success: true,
        message: 'View your metrics in Grafana',
        grafanaUrl: process.env.GRAFANA_URL || 'http://localhost:3001'
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as metricsRoutes };

