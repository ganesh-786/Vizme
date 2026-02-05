import express, { type RequestHandler } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { healthRoutes } from "./routes/health.routes.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { authRoutes } from "./routes/auth.routes.js";

export const app = express();

app.disable("x-powered-by");

const httpLogger = pinoHttp.default({ logger }) as RequestHandler;
app.use(httpLogger);
app.use(helmet() as RequestHandler);

const corsOptions =
  env.NODE_ENV === "development"
    ? { origin: true }
    : env.FRONTEND_URL
      ? { origin: env.FRONTEND_URL, credentials: true }
      : { origin: false };

app.use(cors(corsOptions));
app.use(cookieParser());

app.use(
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.use(express.json() as RequestHandler);

app.use("/health", healthRoutes);
app.use("/api/v1/auth", authRoutes);

app.use(notFound);
app.use(errorHandler);
