// src/controllers/metrics.controller.ts
import { Request, Response } from "express";
import { z } from "zod";
import { metricConfigRepository } from "../repositories/metricConfig.repository.js";
import { apiKeyRepository } from "../repositories/apiKey.repository.js";
import { logger } from "../utils/logger.js";

// Schema for incoming metrics
const metricDataSchema = z.object({
  metrics: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        value: z.number(),
        labels: z.record(z.string(), z.string()).optional(),
        timestamp: z.number().optional(), // Unix timestamp in ms
      }),
    )
    .min(1)
    .max(100), // Limit batch size
});

/**
 * Ingest metrics from SDK
 * POST /api/v1/ingest/metrics
 *
 * Headers:
 *   X-API-Key: vizme_xxx_xxx
 *
 * Body:
 * {
 *   "metrics": [
 *     { "name": "page_views", "value": 1, "labels": { "page": "/home" } }
 *   ]
 * }
 */
export async function ingestMetrics(
  req: Request,
  res: Response,
): Promise<void | Response> {
  try {
    if (!req.apiKey || !req.apiKeyTenantId) {
      return res.status(401).json({ error: "API key authentication required" });
    }

    // Validate request body
    const data = metricDataSchema.parse(req.body);

    // Get valid metric configs for this tenant
    const validConfigs = await metricConfigRepository.findActiveByTenant(
      req.apiKeyTenantId,
    );
    const validMetricNames = new Set(validConfigs.map((c) => c.metric_name));

    // Process metrics
    const accepted: string[] = [];
    const rejected: { name: string; reason: string }[] = [];

    for (const metric of data.metrics) {
      // Check if metric is configured
      if (!validMetricNames.has(metric.name)) {
        rejected.push({
          name: metric.name,
          reason: "Metric not configured",
        });
        continue;
      }

      // TODO: Store metric in your time-series database
      // This is where you'd send to InfluxDB, TimescaleDB, Prometheus, etc.
      // For now, just log it
      logger.info(
        {
          tenantId: req.apiKeyTenantId,
          metric: metric.name,
          value: metric.value,
          labels: metric.labels,
        },
        "Metric received",
      );

      accepted.push(metric.name);
    }

    // Log usage
    await apiKeyRepository
      .logUsage(
        req.apiKey.id,
        req.apiKeyTenantId,
        "/api/v1/ingest/metrics",
        "POST",
        200,
        req.ip || null,
        req.headers["user-agent"] || null,
      )
      .catch((err) => {
        logger.error({ error: err }, "Failed to log API key usage");
      });

    res.json({
      success: true,
      accepted: accepted.length,
      rejected: rejected.length,
      details: rejected.length > 0 ? { rejected } : undefined,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Invalid request body",
        details: error.issues,
      });
    }
    logger.error({ error }, "Metrics ingestion error");
    res.status(500).json({ error: "Failed to process metrics" });
  }
}

/**
 * Get metric configs for SDK initialization
 * GET /api/v1/sdk/config
 */
export async function getSdkConfig(
  req: Request,
  res: Response,
): Promise<void | Response> {
  try {
    if (!req.apiKeyTenantId) {
      return res.status(401).json({ error: "API key authentication required" });
    }

    const configs = await metricConfigRepository.findActiveByTenant(
      req.apiKeyTenantId,
    );

    // Return simplified config for SDK
    const sdkConfig = configs.map((c) => ({
      name: c.metric_name,
      type: c.metric_type,
      help: c.help_text,
      labels: c.labels,
      buckets: c.buckets,
      quantiles: c.quantiles,
    }));

    res.json({ config: sdkConfig });
  } catch (error) {
    logger.error({ error }, "Get SDK config error");
    res.status(500).json({ error: "Failed to fetch configuration" });
  }
}
