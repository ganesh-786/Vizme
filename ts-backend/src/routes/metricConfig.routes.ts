// src/routes/metricConfig.routes.ts
import { Router } from "express";
import {
  getAllMetricConfigs,
  getMetricConfigById,
  createMetricConfig,
  updateMetricConfig,
  deleteMetricConfig,
} from "../controllers/metricConfig.controller.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const metricConfigRoutes = Router();

// All routes require authentication
metricConfigRoutes.use(authenticate);

metricConfigRoutes.get("/", asyncHandler(getAllMetricConfigs));
metricConfigRoutes.get("/:id", asyncHandler(getMetricConfigById));
metricConfigRoutes.post("/", asyncHandler(createMetricConfig));
metricConfigRoutes.patch("/:id", asyncHandler(updateMetricConfig));
metricConfigRoutes.delete("/:id", asyncHandler(deleteMetricConfig));
