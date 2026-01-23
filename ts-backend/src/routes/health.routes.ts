import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { healthController } from "../controllers/health.controller.js";

export const healthRoutes = Router();
healthRoutes.get("/", asyncHandler(healthController));