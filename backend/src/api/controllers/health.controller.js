/**
 * Health Controller
 * Handles health check endpoints
 */

const axios = require('axios');
const config = require('../../config');
const logger = require('../../utils/logger');

class HealthController {
  /**
   * Basic health check
   * GET /api/v1/health
   */
  healthCheck(req, res) {
    res.status(200).json({
      status: 'healthy',
      service: 'unified-visibility-platform-api',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.env
    });
  }

  /**
   * Readiness check (checks dependencies)
   * GET /api/v1/health/ready
   */
  async readinessCheck(req, res) {
    try {
      const checks = {
        api: 'ok',
        prometheus: 'unknown'
      };

      // Check Prometheus Pushgateway connectivity
      try {
        const response = await axios.get(`${config.prometheus.pushgatewayUrl}/metrics`, {
          timeout: 3000
        });
        checks.prometheus = response.status === 200 ? 'ok' : 'degraded';
      } catch (error) {
        checks.prometheus = 'unavailable';
        logger.warn('Prometheus Pushgateway health check failed', {
          error: error.message
        });
      }

      const isReady = checks.prometheus === 'ok' || checks.prometheus === 'degraded';

      res.status(isReady ? 200 : 503).json({
        status: isReady ? 'ready' : 'not ready',
        checks,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Readiness check failed', { error: error.message });
      res.status(503).json({
        status: 'not ready',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Liveness check (checks if service is alive)
   * GET /api/v1/health/live
   */
  livenessCheck(req, res) {
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  }
}

module.exports = new HealthController();

