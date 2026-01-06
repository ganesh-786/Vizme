/**
 * Unified Visibility Platform - Backend API Server
 * Main entry point for the metrics collection API
 */

require("dotenv").config();
const app = require("./app");
const config = require("./config");
const logger = require("./utils/logger");
const { initializeDatabase } = require("./models");

const PORT = config.server.port || 8000;

// Initialize database and start server
let server;

async function startServer() {
  try {
    // Initialize database connection
    await initializeDatabase();

    // Start server
    server = app.listen(PORT, () => {
      logger.info(
        `🚀 Unified Visibility Platform API Server running on port ${PORT}`
      );
      logger.info(`📊 Environment: ${config.env}`);
      logger.info(`🔗 Health check: http://localhost:${PORT}/api/v1/health`);
      logger.info(`📝 API Documentation: http://localhost:${PORT}/api/v1`);
    });

    // Handle server errors (like port already in use)
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        logger.error(`❌ Port ${PORT} is already in use!`, {
          error: error.message,
          suggestion:
            "Stop the Docker backend container or use a different port",
          commands: [
            "docker-compose stop backend",
            "or set PORT=8001 in .env file",
          ],
        });
      } else {
        logger.error("Server error:", {
          error: error.message,
          stack: error.stack,
        });
      }
      process.exit(1);
    });

    return server;
  } catch (error) {
    logger.error("Failed to start server", {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM signal received: closing HTTP server");
  if (server) {
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
  }
});

process.on("SIGINT", () => {
  logger.info("SIGINT signal received: closing HTTP server");
  if (server) {
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
  }
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  logger.error("Unhandled Promise Rejection:", err);
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  }
});

module.exports = server;
