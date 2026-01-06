/**
 * Prometheus Pushgateway Service
 * Handles pushing metrics to Prometheus via Pushgateway
 */

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

class PrometheusService {
  constructor() {
    this.pushgatewayUrl = config.prometheus.pushgatewayUrl;
    this.defaultJob = config.prometheus.jobName;
    this.defaultInstance = config.prometheus.defaultInstance;
  }

  /**
   * Format metric value according to Prometheus format
   * @param {string} name - Metric name
   * @param {number} value - Metric value
   * @param {Object} labels - Metric labels
   * @returns {string} Formatted metric line
   */
  formatMetric(name, value, labels = {}) {
    // Sanitize metric name (Prometheus format: [a-zA-Z_:][a-zA-Z0-9_:]*)
    const sanitizedName = this.sanitizeMetricName(name);
    
    // Format labels
    const labelString = this.formatLabels(labels);
    
    // Format: metric_name{label1="value1",label2="value2"} value timestamp
    return `${sanitizedName}${labelString} ${value}`;
  }

  /**
   * Sanitize metric name to Prometheus format
   * @param {string} name - Original metric name
   * @returns {string} Sanitized metric name
   */
  sanitizeMetricName(name) {
    if (!name || typeof name !== 'string') {
      throw new Error('Metric name must be a non-empty string');
    }

    // Replace invalid characters with underscores
    let sanitized = name
      .replace(/[^a-zA-Z0-9_:]/g, '_')
      .replace(/^[^a-zA-Z_:]/, 'metric_'); // Must start with letter, underscore, or colon

    // Ensure it doesn't exceed max length
    if (sanitized.length > config.metrics.maxMetricNameLength) {
      sanitized = sanitized.substring(0, config.metrics.maxMetricNameLength);
    }

    return sanitized || 'unnamed_metric';
  }

  /**
   * Format labels for Prometheus
   * @param {Object} labels - Label object
   * @returns {string} Formatted label string
   */
  formatLabels(labels) {
    if (!labels || Object.keys(labels).length === 0) {
      return '';
    }

    const labelPairs = [];
    for (const [key, value] of Object.entries(labels)) {
      // Sanitize label name and value
      const sanitizedKey = this.sanitizeLabelName(key);
      const sanitizedValue = this.sanitizeLabelValue(value);
      labelPairs.push(`${sanitizedKey}="${sanitizedValue}"`);
    }

    return `{${labelPairs.join(',')}}`;
  }

  /**
   * Sanitize label name
   * @param {string} name - Label name
   * @returns {string} Sanitized label name
   */
  sanitizeLabelName(name) {
    if (!name || typeof name !== 'string') {
      return 'unknown';
    }
    return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[^a-zA-Z_]/, 'label_');
  }

  /**
   * Sanitize label value (escape quotes and backslashes)
   * @param {any} value - Label value
   * @returns {string} Sanitized label value
   */
  sanitizeLabelValue(value) {
    if (value === null || value === undefined) {
      return 'null';
    }
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
  }

  /**
   * Build Prometheus metrics payload
   * @param {Array} metrics - Array of metric objects
   * @returns {string} Prometheus-formatted metrics text
   */
  buildMetricsPayload(metrics) {
    if (!Array.isArray(metrics) || metrics.length === 0) {
      throw new Error('Metrics array is required and must not be empty');
    }

    const lines = [];
    
    for (const metric of metrics) {
      const { name, value, labels = {}, type = 'gauge' } = metric;

      if (!name || value === undefined || value === null) {
        logger.warn('Skipping invalid metric:', metric);
        continue;
      }

      // Add metric type as comment (optional but helpful)
      if (type === 'counter' || type === 'gauge' || type === 'histogram' || type === 'summary') {
        lines.push(`# TYPE ${this.sanitizeMetricName(name)} ${type}`);
      }

      // Format the metric
      const metricLine = this.formatMetric(name, value, labels);
      lines.push(metricLine);
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Push metrics to Prometheus Pushgateway
   * @param {Array} metrics - Array of metric objects
   * @param {string} job - Job name (optional)
   * @param {string} instance - Instance identifier (optional)
   * @param {Object} additionalLabels - Additional labels to add to all metrics
   * @returns {Promise<Object>} Push result
   */
  async pushMetrics(metrics, job = null, instance = null, additionalLabels = {}) {
    try {
      if (!Array.isArray(metrics) || metrics.length === 0) {
        throw new Error('Metrics array is required and must not be empty');
      }

      // Use provided job/instance or defaults
      const jobName = job || this.defaultJob;
      const instanceName = instance || this.defaultInstance;

      // Merge additional labels into each metric
      const enrichedMetrics = metrics.map(metric => ({
        ...metric,
        labels: {
          ...additionalLabels,
          ...(metric.labels || {})
        }
      }));

      // Build Prometheus-formatted payload
      const payload = this.buildMetricsPayload(enrichedMetrics);

      // Construct Pushgateway URL
      const url = `${this.pushgatewayUrl}/metrics/job/${encodeURIComponent(jobName)}/instance/${encodeURIComponent(instanceName)}`;

      logger.debug(`Pushing ${enrichedMetrics.length} metrics to Prometheus`, {
        url,
        job: jobName,
        instance: instanceName
      });

      // Push to Pushgateway
      const response = await axios.put(url, payload, {
        headers: {
          'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
        },
        timeout: 10000 // 10 second timeout
      });

      logger.info(`Successfully pushed ${enrichedMetrics.length} metrics to Prometheus`, {
        job: jobName,
        instance: instanceName,
        status: response.status
      });

      return {
        success: true,
        metricsCount: enrichedMetrics.length,
        job: jobName,
        instance: instanceName,
        status: response.status
      };
    } catch (error) {
      logger.error('Failed to push metrics to Prometheus', {
        error: error.message,
        stack: error.stack,
        metricsCount: metrics?.length || 0
      });

      // Re-throw with more context
      throw new Error(`Prometheus push failed: ${error.message}`);
    }
  }

  /**
   * Delete metrics from Pushgateway (cleanup)
   * @param {string} job - Job name
   * @param {string} instance - Instance identifier
   * @returns {Promise<Object>} Delete result
   */
  async deleteMetrics(job, instance) {
    try {
      const url = `${this.pushgatewayUrl}/metrics/job/${encodeURIComponent(job)}/instance/${encodeURIComponent(instance)}`;
      
      await axios.delete(url, { timeout: 5000 });
      
      logger.info('Deleted metrics from Pushgateway', { job, instance });
      
      return { success: true, job, instance };
    } catch (error) {
      logger.error('Failed to delete metrics from Pushgateway', {
        error: error.message,
        job,
        instance
      });
      throw new Error(`Prometheus delete failed: ${error.message}`);
    }
  }
}

module.exports = new PrometheusService();

