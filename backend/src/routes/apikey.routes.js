/**
 * API Key Routes
 * Handles API key management endpoints
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const apiKeyController = require('../api/controllers/apikey.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Validation middleware
const validateCreate = [
  body('keyName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Key name must not exceed 100 characters'),
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
router.post('/', validateCreate, apiKeyController.createApiKey);
router.get('/', apiKeyController.listApiKeys);
router.delete('/:id', apiKeyController.deleteApiKey);

module.exports = router;

