import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { errorHandler } from "./src/middleware/errorHandler.js";
import { authRoutes } from "./src/routes/auth.routes.js";
import { apiKeyRoutes } from "./src/routes/apikey.routes.js";
import { metricConfigRoutes } from "./src/routes/metricconfig.routes.js";
import { codeGenerationRoutes } from "./src/routes/codeGeneration.routes.js";
import { metricsRoutes } from "./src/routes/metrics.routes.js";
import { healthRoutes } from "./src/routes/health.routes.js";
import { trackerRoutes } from "./src/routes/tracker.routes.js";
import { initDatabase } from "./src/database/connection.js";
import { getMetrics } from "./src/services/metrics.service.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Log startup configuration (non-sensitive)
console.log("🔧 Starting backend server...");
console.log("📋 Configuration:");
console.log(`   - Port: ${PORT}`);
console.log(`   - Environment: ${process.env.NODE_ENV || "development"}`);
console.log(`   - Database Host: ${process.env.DB_HOST || "localhost"}`);
console.log(`   - Database Port: ${process.env.DB_PORT || "5432"}`);
console.log(`   - Database Name: ${process.env.DB_NAME || "metrics_db"}`);
console.log(`   - Database User: ${process.env.DB_USER || "postgres"}`);
console.log(`   - Database SSL: ${process.env.DB_SSL || "false"}`);
console.log(`   - Frontend URL: ${process.env.FRONTEND_URL || "http://localhost:5173"}`);

// Validate required environment variables
const requiredEnvVars = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error("❌ Missing required environment variables:");
  missingVars.forEach(varName => console.error(`   - ${varName}`));
  console.error("💡 Make sure .env file exists in docker/ directory with all required variables");
  console.error("💡 Or set them in docker-compose.yml environment section");
}

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP entirely for testing
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

const adminFrontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

// Custom CORS middleware that handles metrics endpoint differently
app.use((req, res, next) => {
  // For metrics endpoint, allow any origin (with credentials if browser sends them)
  if (req.path.startsWith('/api/v1/metrics') || req.path === '/api/v1/metric-configs/by-api-key') {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    // DO NOT set Access-Control-Allow-Credentials
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    
    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    return next();
  }
  
  // For all other routes, use standard CORS
  next();
});

// Apply CORS for non-metrics routes
app.use((req, res, next) => {
  // Skip if already handled (metrics endpoint or metric-configs/by-api-key)
  if (req.path.startsWith('/api/v1/metrics') || req.path === '/api/v1/metric-configs/by-api-key') {
    return next();
  }
  
  cors({
    origin: adminFrontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  })(req, res, next);
});

app.use(morgan("combined"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.use("/health", healthRoutes);

/**
 * Prometheus Metrics Endpoint
 * 
 * Exposes metrics in Prometheus format for scraping.
 * This endpoint should be accessible by Prometheus server.
 * 
 * Best Practices:
 * - No authentication required (Prometheus needs access)
 * - Returns metrics in Prometheus text format
 * - Fast response time (Prometheus scrapes frequently)
 */
app.get("/metrics", async (req, res) => {
  try {
    console.log('📊 Metrics endpoint accessed');
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    const metrics = await getMetrics();
    if (!metrics || metrics.length === 0) {
      res.end('# No metrics available yet\n# Send metrics via POST /api/v1/metrics first\n');
    } else {
      console.log('📊 Metrics generated, length:', metrics.length);
      res.end(metrics);  // ✅ Send the actual metrics
    }
  } catch (error) {
    console.error('Error generating metrics:', error);
    console.error('Error stack:', error.stack);
    res.status(500).end(`# Error generating metrics: ${error.message}\n`);
  }
});

// API Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/api-keys", apiKeyRoutes);
app.use("/api/v1/metric-configs", metricConfigRoutes);
app.use("/api/v1/code-generation", codeGenerationRoutes);
app.use("/api/v1/metrics", metricsRoutes);
app.use("/api/v1", trackerRoutes);

// Error handling
app.use(errorHandler);

// Start server immediately, initialize database in background with retries
let dbInitialized = false;
let dbInitPromise = null;

// Initialize database with retry logic
const startDatabaseInit = async () => {
  try {
    await initDatabase(5, 5000); // 5 retries, 5 second delay
    dbInitialized = true;
    console.log("✅ Database ready");
  } catch (error) {
    console.error("❌ Database initialization failed after all retries");
    console.error("⚠️  Server is running but database operations will fail");
    console.error("💡 Check your .env file and database connectivity");
    dbInitialized = false;
  }
};

// Start database initialization in background
dbInitPromise = startDatabaseInit();

// Start server immediately (don't wait for DB)
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🌐 API available at http://localhost:${PORT}/api/v1`);
  console.log(`🏥 Health check at http://localhost:${PORT}/health`);
  console.log(`⏳ Database initialization in progress...`);
});

// Export db status for health checks
export { dbInitialized, dbInitPromise };

export default app;
