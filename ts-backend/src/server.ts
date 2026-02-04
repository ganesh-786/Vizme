import { app } from "@/app.js";
import { env } from "@/config/env.js";
import { pool } from "@/db/pool.js";
import { logger } from "@/utils/logger.js";

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "Server listening");
});

let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.warn({ signal }, "Shutdown initiated");

  server.close(async (err) => {
    if (err) {
      logger.error({ err }, "Error closing HTTP server");
    }

    try {
      await pool.end();
      logger.info("Database pool closed");
    } catch (dbErr) {
      logger.error({ err: dbErr }, "Error closing database pool");
    } finally {
      process.exit(err ? 1 : 0);
    }
  });

  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
  shutdown("unhandledRejection");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
  shutdown("uncaughtException");
});
