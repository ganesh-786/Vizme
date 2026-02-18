import express from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateApiKey, authenticate } from '../middleware/auth.middleware.js';
import { metricsLimiter } from '../middleware/rateLimiter.js';
import { BadRequestError } from '../middleware/errorHandler.js';
import { recordMetric, getMetrics } from '../services/metrics.service.js';

const router = express.Router();

const METRIC_TYPES = ['counter', 'gauge', 'histogram', 'summary'];

/**
 * Validate metric value based on type
 * @param {any} value - Metric value to validate
 * @param {string} type - Metric type
 * @returns {boolean} - True if valid
 */
const validateMetricValue = (value, type) => {
  const numValue = typeof value === 'number' ? value : parseFloat(value);

  if (isNaN(numValue)) {
    return false;
  }

  // Prometheus counters must be non-negative
  if (type === 'counter' && numValue < 0) {
    return false;
  }

  return true;
};

/**
 * POST /api/v1/metrics
 *
 * Metrics ingestion endpoint (requires API key)
 *
 * This endpoint accepts metrics from clients and stores them in the Prometheus registry.
 * Prometheus will scrape these metrics from the /metrics endpoint.
 *
 * Request body:
 * {
 *   "metrics": [
 *     {
 *       "name": "request_count",
 *       "type": "counter",
 *       "value": 1,
 *       "labels": { "endpoint": "/api/users" }
 *     }
 *   ]
 * }
 */

router.post(
  '/',
  authenticateApiKey,
  metricsLimiter,
  [
    body('metrics')
      .isArray({ min: 1, max: 100 })
      .withMessage('Metrics must be an array with 1-100 items'),
    body('metrics.*.name').trim().isLength({ min: 1 }).withMessage('Metric name is required'),
    body('metrics.*.type')
      .isIn(METRIC_TYPES)
      .withMessage(`Metric type must be one of: ${METRIC_TYPES.join(', ')}`),
    body('metrics.*.value').custom((value) => {
      const numValue = typeof value === 'number' ? value : parseFloat(value);
      if (isNaN(numValue)) {
        throw new Error('Metric value must be a number');
      }
      return true;
    }),
    body('metrics.*.labels').optional().isObject(),
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
            error: `Invalid value for ${metric.type} metric`,
          });
          continue;
        }

        // Record metric in Prometheus registry
        try {
          await recordMetric(
            {
              name: metric.name,
              type: metric.type,
              value: typeof metric.value === 'number' ? metric.value : parseFloat(metric.value),
              labels: metric.labels || {},
            },
            userId
          );

          validMetrics.push({
            name: metric.name,
            type: metric.type,
            value: typeof metric.value === 'number' ? metric.value : parseFloat(metric.value),
            labels: {
              ...metric.labels,
              user_id: userId.toString(),
            },
          });
        } catch (error) {
          errors_list.push({
            index: i,
            error: error.message || 'Failed to record metric',
          });
        }
      }

      if (validMetrics.length === 0) {
        throw new BadRequestError('No valid metrics to process', errors_list);
      }

      res.json({
        success: true,
        data: {
          processed: validMetrics.length,
          total: metrics.length,
          errors: errors_list.length > 0 ? errors_list : undefined,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/metrics
 *
 * Get metrics information (for authenticated users)
 * Note: Actual Prometheus metrics are exposed at /metrics endpoint
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    res.json({
      success: true,
      message: 'View your metrics in Grafana or query Prometheus',
      prometheusUrl: process.env.PROMETHEUS_URL || 'http://localhost:9090',
      grafanaUrl: process.env.GRAFANA_URL || 'http://localhost:3001',
      metricsEndpoint: '/metrics',
    });
  } catch (error) {
    next(error);
  }
});

export { router as metricsRoutes };
