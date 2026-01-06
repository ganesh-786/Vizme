/**
 * Metrics Controller
 * Handles business logic for metrics operations
 */

const prometheusService = require('../../tsdb/prometheus.service');
const logger = require('../../utils/logger');
const config = require('../../config');
const { ApiKey } = require('../../models');

class MetricsController {
  /**
   * Push metrics to Prometheus
   * POST /api/v1/metrics
   */
  async pushMetrics(req, res, next) {
    try {
      const { metrics, job, instance, labels: additionalLabels = {} } = req.body;

      // Validate metrics array
      if (!Array.isArray(metrics) || metrics.length === 0) {
        return res.status(400).json({
          error: true,
          message: 'Metrics array is required and must not be empty'
        });
      }

      // Validate each metric
      const validatedMetrics = [];
      for (const metric of metrics) {
        // Validate label count
        if (metric.labels && Object.keys(metric.labels).length > config.metrics.maxLabelCount) {
          logger.warn('Metric has too many labels, truncating', {
            metricName: metric.name,
            labelCount: Object.keys(metric.labels).length
          });
          // Truncate labels to max count
          const labelEntries = Object.entries(metric.labels).slice(0, config.metrics.maxLabelCount);
          metric.labels = Object.fromEntries(labelEntries);
        }

        validatedMetrics.push({
          name: metric.name,
          value: Number(metric.value),
          labels: metric.labels || {},
          type: metric.type || 'gauge'
        });
      }

      // Extract client identifier from headers or request
      const clientId = req.headers['x-client-id'] || req.ip || 'unknown';
      const userAgent = req.get('user-agent') || 'unknown';

      // Get user info from API key if authenticated
      let userId = null;
      if (req.apiKey) {
        userId = req.apiKey.userId;
      }

      // Add default labels
      const enrichedLabels = {
        ...additionalLabels,
        client_id: clientId,
        source: 'api',
        user_agent: userAgent.substring(0, 100), // Limit length
        ...(userId && { user_id: userId })
      };

      // Push to Prometheus
      const result = await prometheusService.pushMetrics(
        validatedMetrics,
        job,
        instance,
        enrichedLabels
      );

      logger.info('Metrics pushed successfully', {
        count: validatedMetrics.length,
        job: result.job,
        instance: result.instance,
        clientId
      });

      // Return success response
      res.status(200).json({
        success: true,
        message: 'Metrics pushed successfully',
        data: {
          metricsCount: result.metricsCount,
          job: result.job,
          instance: result.instance,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Error pushing metrics', {
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  }
}

module.exports = new MetricsController();

