import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { errorHandler } from "./src/middleware/errorHandler.js";
import { authRoutes } from "./src/routes/auth.routes.js";
import { apiKeyRoutes } from "./src/routes/apiKey.routes.js";
import { metricConfigRoutes } from "./src/routes/metricconfig.routes.js";
import { codeGenerationRoutes } from "./src/routes/codeGeneration.routes.js";
import { metricsRoutes } from "./src/routes/metrics.routes.js";
import { healthRoutes } from "./src/routes/health.routes.js";
import { initDatabase } from "./src/database/connection.js";
import { authenticate } from "./src/middleware/keycloak.middleware.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
// Configure helmet to allow DevTools and development tools
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "http://localhost:*", "ws://localhost:*"], // Allow DevTools connections
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow DevTools
}));
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(morgan("combined"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Root route - provide API info
app.get("/", (req, res) => {
  res.json({
    message: "Unified Visibility Platform API",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      api: "/api/v1",
      docs: "See API documentation for available endpoints"
    }
  });
});

// Health check
app.use("/health", healthRoutes);

// API Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/api-keys", apiKeyRoutes);
app.use("/api/v1/metric-configs", metricConfigRoutes);
app.use("/api/v1/code-generation", codeGenerationRoutes);
app.use("/api/v1/metrics", metricsRoutes);

// Error handling
app.use(errorHandler);

// Initialize database and start server
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
    });
  })
  .catch((error) => {
    console.error("❌ Failed to initialize database:", error);
    process.exit(1);
  });

export default app;
