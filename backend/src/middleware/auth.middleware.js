/**
 * Authentication Middleware
 * Validates JWT tokens and API keys
 */

const jwt = require('jsonwebtoken');
const { User, ApiKey } = require('../models');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Middleware to authenticate JWT tokens
 */
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: true,
        message: 'Authentication token required'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, config.auth.jwtSecret);

    // Find user
    const user = await User.findByPk(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({
        error: true,
        message: 'Invalid or inactive user'
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: true,
        message: 'Invalid authentication token'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: true,
        message: 'Authentication token expired'
      });
    }

    logger.error('Authentication error', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: true,
      message: 'Authentication failed'
    });
  }
}

/**
 * Middleware to authenticate API keys (optional)
 */
async function authenticateApiKey(req, res, next) {
  try {
    const apiKey = req.headers['x-api-key'];
    const apiSecret = req.headers['x-api-secret'];

    // If no API key provided, continue without authentication
    if (!apiKey) {
      return next();
    }

    // Find API key
    const keyRecord = await ApiKey.findOne({
      where: { apiKey, isActive: true },
      include: [{
        model: User,
        as: 'user',
        where: { isActive: true },
        required: true
      }]
    });

    if (!keyRecord) {
      return res.status(401).json({
        error: true,
        message: 'Invalid API key'
      });
    }

    // Verify API secret if provided
    if (apiSecret && !keyRecord.verifySecret(apiSecret)) {
      return res.status(401).json({
        error: true,
        message: 'Invalid API secret'
      });
    }

    // Check expiration
    if (keyRecord.expiresAt && new Date() > keyRecord.expiresAt) {
      return res.status(401).json({
        error: true,
        message: 'API key has expired'
      });
    }

    // Update last used
    await keyRecord.update({ lastUsedAt: new Date() });

    // Attach user and API key to request
    req.user = keyRecord.user;
    req.apiKey = keyRecord;

    next();
  } catch (error) {
    logger.error('API key authentication error', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: true,
      message: 'API key authentication failed'
    });
  }
}

/**
 * Optional authentication - doesn't fail if no token provided
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, config.auth.jwtSecret);
      const user = await User.findByPk(decoded.id);
      if (user && user.isActive) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Ignore errors for optional auth
    next();
  }
}

module.exports = {
  authenticateToken,
  authenticateApiKey,
  optionalAuth
};

