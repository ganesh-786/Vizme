/**
 * Express Application Setup
 * Configures middleware, routes, and error handling
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const config = require("./config");
const logger = require("./utils/logger");

// Import routes
const metricsRoutes = require("./routes/metrics.routes");
const healthRoutes = require("./routes/health.routes");
const clientLibRoutes = require("./routes/clientlib.routes");
const authRoutes = require("./routes/auth.routes");
const apiKeyRoutes = require("./routes/apikey.routes");
const metricConfigRoutes = require("./routes/metricconfig.routes");

// Import middleware
const errorHandler = require("./middleware/errorHandler.middleware");
const requestLogger = require("./middleware/requestLogger.middleware");

const app = express();

// CORS configuration (must be before other middleware)
// In development, allow all origins; in production, use configured origins
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, or curl requests)
    if (!origin) {
      return callback(null, true);
    }
    
    // In development, allow all origins
    if (config.env === 'development') {
      return callback(null, true);
    }
    
    // Check if '*' is in allowed origins (allow all)
    if (config.cors.allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (config.cors.allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Client-Id",
    "X-API-Key",
    "X-API-Secret",
    "Accept",
    "Origin",
    "X-Requested-With"
  ],
  exposedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200, // Some legacy browsers (IE11, various SmartTVs) choke on 204
  preflightContinue: false
};

app.use(cors(corsOptions));

// Explicit OPTIONS handler for preflight requests (fallback)
app.options('*', cors(corsOptions));

// Security middleware (after CORS) - configure to not interfere with CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false
}));

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logging
if (config.env !== "test") {
  app.use(
    morgan("combined", {
      stream: { write: (message) => logger.info(message.trim()) },
    })
  );
}
app.use(requestLogger);

// API Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/apikeys", apiKeyRoutes);
app.use("/api/v1/metric-configs", metricConfigRoutes);
app.use("/api/v1/metrics", metricsRoutes);
app.use("/api/v1/health", healthRoutes);
app.use("/api/v1/client", clientLibRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    name: "Unified Visibility Platform API",
    version: "1.0.0",
    status: "operational",
    endpoints: {
      health: "/api/v1/health",
      metrics: "/api/v1/metrics",
      clientLibrary: "/api/v1/client/script.js",
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Cannot ${req.method} ${req.path}`,
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app;
