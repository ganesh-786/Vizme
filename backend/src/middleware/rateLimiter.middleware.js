/**
 * Rate Limiting Middleware
 * Prevents abuse by limiting requests per IP
 */

const rateLimit = require('express-rate-limit');
const config = require('../config');

const rateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    error: true,
    message: config.rateLimit.message,
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000)
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    res.status(429).json({
      error: true,
      message: config.rateLimit.message,
      retryAfter: Math.ceil(config.rateLimit.windowMs / 1000)
    });
  }
});

module.exports = rateLimiter;

