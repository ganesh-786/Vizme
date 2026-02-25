import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { errorHandler } from "./src/middleware/errorHandler.js";
import { requestIdMiddleware } from "./src/middleware/requestId.js";
import { appMetricsMiddleware, getAppMetrics } from "./src/middleware/appMetrics.js";
import { authRoutes } from "./src/routes/auth.routes.js";
import { apiKeyRoutes } from "./src/routes/apikey.routes.js";
import { metricConfigRoutes } from "./src/routes/metricconfig.routes.js";
import { codeGenerationRoutes } from "./src/routes/codeGeneration.routes.js";
import { metricsRoutes } from "./src/routes/metrics.routes.js";
import { healthRoutes } from "./src/routes/health.routes.js";
import { trackerRoutes } from "./src/routes/tracker.routes.js";
import { grafanaRoutes, grafanaProxyMiddleware } from "./src/routes/grafana.routes.js";
import { initDatabase } from "./src/database/connection.js";
import { getMetrics } from "./src/services/metrics.service.js";
import { config, validateConfig } from "./src/config.js";
import { logger } from "./src/logger.js";
import pinoHttp from "pino-http";

dotenv.config();

// Fail fast if required env is missing (production requires JWT_SECRET)
validateConfig();

const app = express();
const PORT = config.port;

logger.info({
  port: PORT,
  env: config.env,
  dbHost: config.db.host,
  frontendUrl: config.cors.frontendUrl,
}, 'Starting backend');

// Security: Helmet with production-safe defaults (CSP only in production)
let grafanaOrigin = null;
try {
  if (config.urls.grafana && config.urls.grafana.startsWith('http')) {
    grafanaOrigin = new URL(config.urls.grafana).origin;
  }
} catch (_) {}

app.use(helmet({
  contentSecurityPolicy: config.isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      frameSrc: ["'self'", grafanaOrigin].filter(Boolean),
      frameAncestors: ["'self'", config.cors.frontendUrl].filter(Boolean),
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", config.api.baseUrl].filter(Boolean),
    },
  } : false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// Request ID and structured request logging
app.use(requestIdMiddleware);
app.use(pinoHttp({
  logger,
  genReqId: (req) => req.id,
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
}));

// Application metrics (request count, duration)
app.use(appMetricsMiddleware);

// CORS: metrics/tracker endpoints allow cross-origin for client sites; use allowlist in production
const allowedMetricsOrigins = config.cors.allowedMetricsOrigins;
const isPublicApiPath = (path) =>
  path.startsWith('/api/v1/metrics') ||
  path === '/api/v1/metric-configs/by-api-key' ||
  path === '/api/v1/tracker.js';

app.use((req, res, next) => {
  if (isPublicApiPath(req.path)) {
    const origin = req.headers.origin;
    const allowOrigin = (allowedMetricsOrigins.includes('*') || !origin)
      ? '*'
      : allowedMetricsOrigins.includes(origin)
        ? origin
        : null;
    res.setHeader('Access-Control-Allow-Origin', allowOrigin || allowedMetricsOrigins[0] || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  }
  next();
});

app.use((req, res, next) => {
  if (isPublicApiPath(req.path)) return next();
  cors({
    origin: config.cors.frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  })(req, res, next);
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health (liveness: /health/live, readiness: /health/ready, legacy: /health)
app.use("/health", healthRoutes);

// Prometheus: expose app + user metrics
app.get("/metrics", async (req, res) => {
  try {
    const [appMetricsText, userMetricsText] = await Promise.all([
      getAppMetrics(),
      getMetrics(),
    ]);
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    const combined = [appMetricsText, userMetricsText].filter(Boolean).join('\n');
    res.end(combined || '# No metrics yet\n');
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, 'Metrics endpoint error');
    res.status(500).set('Content-Type', 'text/plain').end(`# Error: ${error.message}\n`);
  }
});

// API Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/api-keys", apiKeyRoutes);
app.use("/api/v1/metric-configs", metricConfigRoutes);
app.use("/api/v1/code-generation", codeGenerationRoutes);
app.use("/api/v1/metrics", metricsRoutes);
app.use("/api/v1", trackerRoutes);
app.use("/api/v1/grafana", grafanaRoutes);
app.use("/grafana", grafanaProxyMiddleware);

app.use(errorHandler);

let dbInitialized = false;
let dbInitPromise = null;

const startDatabaseInit = async () => {
  try {
    await initDatabase(5, 5000);
    dbInitialized = true;
    logger.info('Database ready');
  } catch (error) {
    logger.error({ err: error }, 'Database initialization failed');
    dbInitialized = false;
  }
};

dbInitPromise = startDatabaseInit();

app.listen(PORT, () => {
  logger.info({
    port: PORT,
    api: `http://localhost:${PORT}/api/v1`,
    health: `http://localhost:${PORT}/health`,
  }, 'Server listening');
});

export { dbInitialized, dbInitPromise };
export default app;
