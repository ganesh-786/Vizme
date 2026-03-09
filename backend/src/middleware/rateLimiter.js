import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

// Auth endpoints: configurable (default 5/min)
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.rateLimit.authMax,
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Metrics ingestion: configurable per API key (default 500/min for production)
export const metricsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.rateLimit.metricsMax,
  message: {
    success: false,
    error: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.headers['x-api-key'] || req.query.api_key || req.ip;
  }
});

// General API: configurable (default 100/min)
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.rateLimit.apiMax,
  message: {
    success: false,
    error: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Grafana embed URL: configurable (default 30/min per user)
export const grafanaEmbedLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.rateLimit.grafanaEmbedMax,
  message: {
    success: false,
    error: 'Too many embed requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
