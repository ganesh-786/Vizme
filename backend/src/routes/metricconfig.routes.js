/**
 * Metric Configuration Routes
 * Handles metric configuration endpoints
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const metricConfigController = require('../api/controllers/metricconfig.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Validation middleware
const validateCreate = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 100 })
    .withMessage('Name must not exceed 100 characters'),
  body('metricName')
    .trim()
    .notEmpty()
    .withMessage('Metric name is required')
    .isLength({ max: 200 })
    .withMessage('Metric name must not exceed 200 characters')
    .matches(/^[a-zA-Z_:][a-zA-Z0-9_:]*$/)
    .withMessage('Metric name must follow Prometheus naming conventions'),
  body('metricType')
    .optional()
    .isIn(['counter', 'gauge', 'histogram', 'summary'])
    .withMessage('Metric type must be one of: counter, gauge, histogram, summary'),
  body('labels')
    .optional()
    .isObject()
    .withMessage('Labels must be an object'),
  body('autoTrack')
    .optional()
    .isBoolean()
    .withMessage('autoTrack must be a boolean'),
  body('trackingEvents')
    .optional()
    .isArray()
    .withMessage('trackingEvents must be an array'),
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

const validateUpdate = [
  body('name')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Name must not exceed 100 characters'),
  body('metricName')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Metric name must not exceed 200 characters'),
  body('metricType')
    .optional()
    .isIn(['counter', 'gauge', 'histogram', 'summary'])
    .withMessage('Metric type must be one of: counter, gauge, histogram, summary'),
  body('labels')
    .optional()
    .isObject()
    .withMessage('Labels must be an object'),
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

// Routes
router.post('/', validateCreate, metricConfigController.createMetricConfig);
router.get('/', metricConfigController.listMetricConfigs);
router.get('/:id', metricConfigController.getMetricConfig);
router.put('/:id', validateUpdate, metricConfigController.updateMetricConfig);
router.delete('/:id', metricConfigController.deleteMetricConfig);
router.post('/:id/generate-code', metricConfigController.generateCode);

module.exports = router;

