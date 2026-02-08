// src/routes/metrics.routes.ts
import { Router } from "express";
import {
  ingestMetrics,
  getSdkConfig,
} from "../controllers/metrics.controller.js";
import { authenticateApiKey, requireScope } from "../middleware/apiKeyAuth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const metricsRoutes = Router();

// All routes require API key authentication
metricsRoutes.use(authenticateApiKey);

// Ingest metrics (requires metrics:write scope)
metricsRoutes.post(
  "/ingest/metrics",
  requireScope("metrics:write"),
  asyncHandler(ingestMetrics),
);

// Get SDK config (requires config:read or metrics:write scope)
metricsRoutes.get("/sdk/config", asyncHandler(getSdkConfig));
