/**
 * Centralized configuration with production-grade env validation.
 * Fails fast on startup if required production vars are missing.
 */

const isProduction = process.env.NODE_ENV === 'production';

const requiredProduction = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET'];

const requiredAll = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];

function getEnv(key, defaultValue) {
  const value = process.env[key];
  if (value !== undefined && value !== '') return value;
  return defaultValue;
}

function validateEnv() {
  const required = isProduction ? requiredProduction : requiredAll;
  const missing = required.filter((key) => !process.env[key] || process.env[key] === '');
  if (missing.length > 0) {
    const message = `Missing required environment variables: ${missing.join(', ')}. ${
      isProduction ? 'JWT_SECRET is required in production.' : 'Set them in .env or environment.'
    }`;
    throw new Error(message);
  }
  // In production, reject default/weak JWT_SECRET
  if (isProduction) {
    const secret = process.env.JWT_SECRET;
    if (
      !secret ||
      secret.length < 32 ||
      /change-in-production|your-secret|dev|test/i.test(secret)
    ) {
      throw new Error(
        'JWT_SECRET must be set to a strong random value (min 32 chars) in production. Do not use default or example values.'
      );
    }
  }
}

export const config = {
  env: getEnv('NODE_ENV', 'development'),
  isProduction,
  port: parseInt(getEnv('PORT', '3000'), 10),

  db: {
    host: getEnv('DB_HOST', 'localhost'),
    port: parseInt(getEnv('DB_PORT', '5432'), 10),
    database: getEnv('DB_NAME', 'metrics_db'),
    user: getEnv('DB_USER', 'postgres'),
    password: getEnv('DB_PASSWORD', ''),
    ssl: getEnv('DB_SSL', 'false') === 'true',
    sslRejectUnauthorized:
      getEnv('DB_SSL_REJECT_UNAUTHORIZED', isProduction ? 'true' : 'false') === 'true',
  },

  jwt: {
    secret:
      process.env.JWT_SECRET || (isProduction ? undefined : 'dev-secret-change-in-production'),
    accessExpiry: getEnv('JWT_ACCESS_EXPIRY', '15m'),
    refreshExpiry: getEnv('JWT_REFRESH_EXPIRY', '7d'),
  },

  cors: {
    frontendUrl: getEnv('FRONTEND_URL', 'http://localhost:5173'),
    /** Comma-separated allowed origins for metrics/tracker (e.g. https://app.example.com,https://cdn.example.com). In production set this; * means allow any (less secure). */
    allowedMetricsOrigins: getEnv('ALLOWED_METRICS_ORIGINS', '*')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },

  api: {
    baseUrl: getEnv('API_BASE_URL', 'http://localhost:3000'),
  },

  urls: {
    prometheus: getEnv('PROMETHEUS_URL', 'http://localhost:9090'),
    grafana: getEnv('GRAFANA_URL', 'http://localhost:3001'),
    mimir: getEnv('MIMIR_URL', 'http://localhost:9009'),
  },

  grafana: {
    /** Must match Grafana admin credentials. Prefer GRAFANA_ADMIN_*, fallback to GF_SECURITY_ADMIN_*. */
    adminUser: getEnv('GRAFANA_ADMIN_USER', getEnv('GF_SECURITY_ADMIN_USER', 'admin')),
    adminPassword: getEnv('GRAFANA_ADMIN_PASSWORD', getEnv('GF_SECURITY_ADMIN_PASSWORD', 'admin')),
  },

  /** Grafana embed token expiry (e.g. '15m', '1h'). Production: 15m. Dev: 1h for convenience. */
  grafanaEmbedTokenExpiry: getEnv('GRAFANA_EMBED_TOKEN_EXPIRY', isProduction ? '15m' : '1h'),

  /** Rate limits: requests per minute. Production: tune per tier. */
  rateLimit: {
    metricsMax: parseInt(getEnv('METRICS_RATE_LIMIT_MAX', '500'), 10),
    authMax: parseInt(getEnv('AUTH_RATE_LIMIT_MAX', '5'), 10),
    apiMax: parseInt(getEnv('API_RATE_LIMIT_MAX', '100'), 10),
    grafanaEmbedMax: parseInt(getEnv('GRAFANA_EMBED_RATE_LIMIT_MAX', '30'), 10),
  },

  /** Optional basic auth for /metrics (Prometheus scrape). Set both to enable. */
  metricsScrapeAuth: {
    username: getEnv('METRICS_SCRAPE_USER', ''),
    password: getEnv('METRICS_SCRAPE_PASSWORD', ''),
  },

  /** Label validation: max keys and max chars per value. Prevents cardinality explosion. */
  metrics: {
    maxLabelsPerMetric: parseInt(getEnv('METRICS_MAX_LABELS', '10'), 10),
    maxLabelValueLength: parseInt(getEnv('METRICS_MAX_LABEL_VALUE_LENGTH', '128'), 10),
    maxSeriesPerUser: parseInt(getEnv('METRICS_MAX_SERIES_PER_USER', '1000'), 10),
  },
};

/** Call at application startup to fail fast if required env is missing. */
export function validateConfig() {
  validateEnv();
}

export default config;
