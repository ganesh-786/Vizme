// src/routes/apiKey.routes.ts
import { Router } from "express";
import {
  getAllApiKeys,
  getApiKeyById,
  createApiKey,
  updateApiKey,
  deleteApiKey,
} from "../controllers/apiKey.controller.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const apiKeyRoutes = Router();

// All routes require authentication
apiKeyRoutes.use(authenticate);

apiKeyRoutes.get("/", asyncHandler(getAllApiKeys));
apiKeyRoutes.get("/:id", asyncHandler(getApiKeyById));
apiKeyRoutes.post("/", asyncHandler(createApiKey));
apiKeyRoutes.patch("/:id", asyncHandler(updateApiKey));
apiKeyRoutes.delete("/:id", asyncHandler(deleteApiKey));
