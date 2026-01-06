/**
 * Health Check Routes
 * Provides health and status endpoints
 */

const express = require('express');
const healthController = require('../api/controllers/health.controller');

const router = express.Router();

// GET /api/v1/health - Health check endpoint
router.get('/', healthController.healthCheck);

// GET /api/v1/health/ready - Readiness probe
router.get('/ready', healthController.readinessCheck);

// GET /api/v1/health/live - Liveness probe
router.get('/live', healthController.livenessCheck);

module.exports = router;

