// src/controllers/metricConfig.controller.ts
import { Request, Response } from "express";
import { z } from "zod";
import { metricConfigService } from "../services/metricConfig.service.js";

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(1000).optional(),
  metric_name: z
    .string()
    .min(1, "Metric name is required")
    .max(255)
    .regex(/^[a-zA-Z_:][a-zA-Z0-9_:]*$/, "Invalid metric name format"),
  metric_type: z.enum(["counter", "gauge", "histogram", "summary"]),
  help_text: z.string().max(1000).optional(),
  labels: z.array(z.string().max(64)).max(10).optional(),
  buckets: z.array(z.number().positive()).max(20).optional(),
  quantiles: z.array(z.number().min(0).max(1)).max(10).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  metric_name: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z_:][a-zA-Z0-9_:]*$/)
    .optional(),
  metric_type: z.enum(["counter", "gauge", "histogram", "summary"]).optional(),
  help_text: z.string().max(1000).optional(),
  labels: z.array(z.string().max(64)).max(10).optional(),
  buckets: z.array(z.number().positive()).max(20).optional(),
  quantiles: z.array(z.number().min(0).max(1)).max(10).optional(),
  is_active: z.boolean().optional(),
});

export async function getAllMetricConfigs(
  req: Request,
  res: Response,
): Promise<void | Response> {
  try {
    if (!req.tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const configs = await metricConfigService.getAll(req.tenantId);
    res.json({ data: configs });
  } catch (error: any) {
    console.error("Get metric configs error:", error);
    res.status(500).json({ error: "Failed to fetch metric configurations" });
  }
}

export async function getMetricConfigById(
  req: Request,
  res: Response,
): Promise<void | Response> {
  try {
    if (!req.tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const config = await metricConfigService.getById(id, req.tenantId);
    res.json({ data: config });
  } catch (error: any) {
    if (error.message === "Metric configuration not found") {
      return res.status(404).json({ error: error.message });
    }
    console.error("Get metric config error:", error);
    res.status(500).json({ error: "Failed to fetch metric configuration" });
  }
}

export async function createMetricConfig(
  req: Request,
  res: Response,
): Promise<void | Response> {
  try {
    if (!req.user?.sub || !req.tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = createSchema.parse(req.body);
    const config = await metricConfigService.create(
      req.user.sub,
      req.tenantId,
      data,
    );

    res.status(201).json({ data: config });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    if (
      error.message.includes("already exists") ||
      error.message.includes("Invalid")
    ) {
      return res.status(400).json({ error: error.message });
    }
    console.error("Create metric config error:", error);
    res.status(500).json({ error: "Failed to create metric configuration" });
  }
}

export async function updateMetricConfig(
  req: Request,
  res: Response,
): Promise<void | Response> {
  try {
    if (!req.tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const data = updateSchema.parse(req.body);
    const config = await metricConfigService.update(id, req.tenantId, data);

    res.json({ data: config });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    if (error.message === "Metric configuration not found") {
      return res.status(404).json({ error: error.message });
    }
    if (
      error.message.includes("already exists") ||
      error.message.includes("Invalid")
    ) {
      return res.status(400).json({ error: error.message });
    }
    console.error("Update metric config error:", error);
    res.status(500).json({ error: "Failed to update metric configuration" });
  }
}

export async function deleteMetricConfig(
  req: Request,
  res: Response,
): Promise<void | Response> {
  try {
    if (!req.tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    await metricConfigService.delete(id, req.tenantId);
    res.json({ message: "Metric configuration deleted successfully" });
  } catch (error: any) {
    if (error.message === "Metric configuration not found") {
      return res.status(404).json({ error: error.message });
    }
    console.error("Delete metric config error:", error);
    res.status(500).json({ error: "Failed to delete metric configuration" });
  }
}
