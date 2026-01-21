import rateLimit from 'express-rate-limit';

// Auth endpoints: 5 requests per minute
export const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Metrics ingestion: 100 requests per minute per API key
export const metricsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: {
    success: false,
    error: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use API key as the key for rate limiting
    return req.headers['x-api-key'] || req.query.api_key || req.ip;
  }
});

// General API: 100 requests per minute
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: {
    success: false,
    error: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
