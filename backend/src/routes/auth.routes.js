/**
 * Authentication Routes
 * Handles user authentication endpoints
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const authController = require('../api/controllers/auth.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

const router = express.Router();

// Validation middleware
const validateSignup = [
  body('email')
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('firstName')
    .trim()
    .notEmpty()
    .withMessage('First name is required')
    .isLength({ max: 100 })
    .withMessage('First name must not exceed 100 characters'),
  body('lastName')
    .trim()
    .notEmpty()
    .withMessage('Last name is required')
    .isLength({ max: 100 })
    .withMessage('Last name must not exceed 100 characters'),
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

const validateSignin = [
  body('email')
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
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
router.post('/signup', validateSignup, authController.signup);
router.post('/signin', validateSignin, authController.signin);
router.get('/me', authenticateToken, authController.getProfile);

module.exports = router;

