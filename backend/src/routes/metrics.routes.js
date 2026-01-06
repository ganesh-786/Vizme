/**
 * Metrics Routes
 * Handles metric ingestion endpoints
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const metricsController = require('../api/controllers/metrics.controller');
const rateLimiter = require('../middleware/rateLimiter.middleware');
const { authenticateApiKey, optionalAuth } = require('../middleware/auth.middleware');
const config = require('../config');

const router = express.Router();

// Validation middleware for metrics
const validateMetrics = [
  body('metrics')
    .isArray({ min: 1, max: config.metrics.maxBatchSize })
    .withMessage(`Metrics must be an array with 1-${config.metrics.maxBatchSize} items`),
  
  body('metrics.*.name')
    .notEmpty()
    .withMessage('Metric name is required')
    .isLength({ max: config.metrics.maxMetricNameLength })
    .withMessage(`Metric name must not exceed ${config.metrics.maxMetricNameLength} characters`),
  
  body('metrics.*.value')
    .notEmpty()
    .withMessage('Metric value is required')
    .custom((value) => {
      if (typeof value !== 'number' || isNaN(value)) {
        throw new Error('Metric value must be a valid number');
      }
      return true;
    }),
  
  body('metrics.*.labels')
    .optional()
    .isObject()
    .withMessage('Labels must be an object'),
  
  body('metrics.*.type')
    .optional()
    .isIn(['counter', 'gauge', 'histogram', 'summary'])
    .withMessage('Metric type must be one of: counter, gauge, histogram, summary'),
  
  body('job')
    .optional()
    .isString()
    .isLength({ max: 200 })
    .withMessage('Job name must be a string with max 200 characters'),
  
  body('instance')
    .optional()
    .isString()
    .isLength({ max: 200 })
    .withMessage('Instance must be a string with max 200 characters'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: true,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  }
];

// POST /api/v1/metrics - Push metrics to Prometheus
// API key authentication is optional but recommended
router.post('/', rateLimiter, authenticateApiKey, validateMetrics, metricsController.pushMetrics);

// POST /api/v1/metrics/batch - Alias for POST /api/v1/metrics
router.post('/batch', rateLimiter, authenticateApiKey, validateMetrics, metricsController.pushMetrics);

module.exports = router;

