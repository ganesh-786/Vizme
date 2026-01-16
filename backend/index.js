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
import { trackerRoutes } from "./src/routes/tracker.routes.js";  // NEW
import { initDatabase } from "./src/database/connection.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP entirely for testing
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(morgan("combined"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.use("/health", healthRoutes);

// API Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/api-keys", apiKeyRoutes);
app.use("/api/v1/metric-configs", metricConfigRoutes);
app.use("/api/v1/code-generation", codeGenerationRoutes);
app.use("/api/v1/metrics", metricsRoutes);
app.use("/api/v1", trackerRoutes);  // NEW - Must be after /metrics to avoid conflicts

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