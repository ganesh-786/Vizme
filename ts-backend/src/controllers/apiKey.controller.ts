// src/controllers/apiKey.controller.ts
import { Request, Response } from "express";
import { z } from "zod";
import { apiKeyService } from "../services/apiKey.service.js";

const createSchema = z.object({
  key_name: z.string().min(1, "Key name is required").max(255),
  expires_in_days: z.number().int().min(1).max(365).optional(),
  rate_limit_per_minute: z.number().int().min(1).max(100000).optional(),
  scopes: z
    .array(z.enum(["metrics:write", "metrics:read", "config:read"]))
    .optional(),
});

const updateSchema = z.object({
  key_name: z.string().min(1).max(255).optional(),
  is_active: z.boolean().optional(),
  rate_limit_per_minute: z.number().int().min(1).max(100000).optional(),
  scopes: z
    .array(z.enum(["metrics:write", "metrics:read", "config:read"]))
    .optional(),
});

export async function getAllApiKeys(
  req: Request,
  res: Response,
): Promise<void | Response> {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const keys = await apiKeyService.getAll(req.user.sub);
    res.json({ data: keys });
  } catch (error: any) {
    console.error("Get API keys error:", error);
    res.status(500).json({ error: "Failed to fetch API keys" });
  }
}

export async function getApiKeyById(
  req: Request,
  res: Response,
): Promise<void | Response> {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const key = await apiKeyService.getById(id, req.user.sub);
    res.json({ data: key });
  } catch (error: any) {
    if (error.message === "API key not found") {
      return res.status(404).json({ error: error.message });
    }
    console.error("Get API key error:", error);
    res.status(500).json({ error: "Failed to fetch API key" });
  }
}

export async function createApiKey(
  req: Request,
  res: Response,
): Promise<void | Response> {
  try {
    if (!req.user?.sub || !req.tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = createSchema.parse(req.body);
    const result = await apiKeyService.create(req.user.sub, req.tenantId, data);

    // Return the full API key only once during creation
    res.status(201).json({
      data: {
        ...result.key,
        api_key: result.api_key, // Full key - shown only once!
      },
      warning: "Store this API key securely. It will not be shown again.",
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    if (error.message.includes("already exists")) {
      return res.status(400).json({ error: error.message });
    }
    console.error("Create API key error:", error);
    res.status(500).json({ error: "Failed to create API key" });
  }
}

export async function updateApiKey(
  req: Request,
  res: Response,
): Promise<void | Response> {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const data = updateSchema.parse(req.body);
    const key = await apiKeyService.update(id, req.user.sub, data);

    res.json({ data: key });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    if (error.message === "API key not found") {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes("already exists")) {
      return res.status(400).json({ error: error.message });
    }
    console.error("Update API key error:", error);
    res.status(500).json({ error: "Failed to update API key" });
  }
}

export async function deleteApiKey(
  req: Request,
  res: Response,
): Promise<void | Response> {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    await apiKeyService.delete(id, req.user.sub);
    res.json({ message: "API key deleted successfully" });
  } catch (error: any) {
    if (error.message === "API key not found") {
      return res.status(404).json({ error: error.message });
    }
    console.error("Delete API key error:", error);
    res.status(500).json({ error: "Failed to delete API key" });
  }
}
