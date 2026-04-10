import express from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateApiKey, authenticate, requireBackendClientRole } from '../middleware/auth.middleware.js';
import { metricsLimiter } from '../middleware/rateLimiter.js';
import { BadRequestError } from '../middleware/errorHandler.js';
import { recordMetricsIngest } from '../middleware/appMetrics.js';
import { recordMetric } from '../services/metrics.service.js';
import { pushMetricsToMimir } from '../services/mimir.service.js';
import { fetchDashboardMetrics } from '../services/mimirQuery.service.js';
import { config } from '../config.js';

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
 * This endpoint accepts metrics from clients, validates them, and forwards them to Mimir.
 * The backend waits for the Mimir remote-write request so ingestion latency is measurable.
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

router.post('/',
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
    const ingestStartedAt = Date.now();
    const requestedCount = Array.isArray(req.body?.metrics) ? req.body.metrics.length : 0;
    let processedCount = 0;
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new BadRequestError('Validation failed', errors.array());
      }

      const { metrics } = req.body;
      const tenantId = req.tenant?.id ?? req.user.id;

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

        // Record metric in Prometheus registry + Mimir (labels must match for cardinality)
        try {
          const mergedLabels = { ...(metric.labels || {}) };
          if (req.apiKey.site_id != null) {
            mergedLabels.site_id = String(req.apiKey.site_id);
          }

          recordMetric(
            {
              name: metric.name,
              type: metric.type,
              value: typeof metric.value === 'number' ? metric.value : parseFloat(metric.value),
              labels: mergedLabels,
              operation: metric.operation,
            },
            tenantId
          );

          validMetrics.push({
            name: metric.name,
            type: metric.type,
            value: typeof metric.value === 'number' ? metric.value : parseFloat(metric.value),
            labels: {
              ...mergedLabels,
              user_id: tenantId.toString(),
              tenant_id: tenantId.toString(),
            },
            operation: metric.operation,
          });
        } catch (error) {
          errors_list.push({
            index: i,
            error: error.message || 'Failed to record metric'
          });
        }
      }

      if (validMetrics.length === 0) {
        throw new BadRequestError('No valid metrics to process', errors_list);
      }

      processedCount = validMetrics.length;

      // Batch push to Mimir (hard tenant isolation) and wait for completion so
      // the request reflects actual ingestion latency instead of a fire-and-forget enqueue.
      const pushSummary = await pushMetricsToMimir(
        validMetrics.map((m) => ({
          name: m.name,
          type: m.type,
          value: m.value,
          labels: m.labels || {},
          operation: m.operation,
          userId: String(tenantId),
        })),
        { mode: 'ingest', throwOnFailure: true }
      );

      recordMetricsIngest({
        durationMs: Date.now() - ingestStartedAt,
        batchSize: metrics.length,
        processed: validMetrics.length,
        total: metrics.length,
        outcome: 'success',
      });

      res.json({
        success: true,
        data: {
          processed: validMetrics.length,
          total: metrics.length,
          mimirAccepted: Boolean(pushSummary?.ok),
          mimirWriteDurationMs: pushSummary?.durationMs ?? null,
          errors: errors_list.length > 0 ? errors_list : undefined
        }
      });
    } catch (error) {
      recordMetricsIngest({
        durationMs: Date.now() - ingestStartedAt,
        batchSize: requestedCount,
        processed: processedCount,
        total: requestedCount,
        outcome: 'error',
        error,
      });
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
router.get('/',
  authenticate,
  requireBackendClientRole('API_USER'),
  async (req, res, next) => {
    try {
      res.json({
        success: true,
        message: 'View your metrics in Grafana (Mimir). User metrics are isolated per tenant.',
        grafanaUrl: config.urls.grafana,
        mimirUrl: config.urls.mimir
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/metrics/dashboard
 *
 * Fetch dashboard metrics from Mimir (tenant-isolated).
 * Returns stats and timeseries for the custom metrics dashboard.
 */
router.get('/dashboard',
  authenticate,
  requireBackendClientRole('API_USER'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant?.id ?? req.user.id;
      const data = await fetchDashboardMetrics(tenantId, req.query.site_id, {
        includeSeries: req.query.include_series === '1' || req.query.include_series === 'true',
        includeDetails: req.query.include_details === '1' || req.query.include_details === 'true',
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

export { router as metricsRoutes };
