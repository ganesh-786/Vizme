/**
 * Configuration Management
 * Centralized configuration for the application
 */

require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  
  server: {
    port: parseInt(process.env.PORT || process.env.API_PORT || '8000', 10),
    host: process.env.HOST || '0.0.0.0'
  },

  cors: {
    allowedOrigins: process.env.CORS_ORIGINS 
      ? process.env.CORS_ORIGINS.split(',')
      : ['*'] // Allow all origins in development
  },

  prometheus: {
    pushgatewayUrl: process.env.PROMETHEUS_PUSHGATEWAY_URL || 'http://prometheus-pushgateway:9091',
    jobName: process.env.PROMETHEUS_JOB_NAME || 'unified_visibility_platform',
    defaultInstance: process.env.PROMETHEUS_INSTANCE || 'api-server'
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10), // 100 requests per window
    message: 'Too many requests from this IP, please try again later.'
  },

  metrics: {
    maxBatchSize: parseInt(process.env.MAX_BATCH_SIZE || '100', 10),
    maxMetricNameLength: parseInt(process.env.MAX_METRIC_NAME_LENGTH || '200', 10),
    maxLabelCount: parseInt(process.env.MAX_LABEL_COUNT || '20', 10)
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json'
  },

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || process.env.POSTGRES_DB || 'visibility_platform',
    user: process.env.DB_USER || process.env.POSTGRES_USER || 'postgres',
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'postgres'
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10)
  }
};

// Validation
if (!config.prometheus.pushgatewayUrl) {
  throw new Error('PROMETHEUS_PUSHGATEWAY_URL is required');
}

module.exports = config;

