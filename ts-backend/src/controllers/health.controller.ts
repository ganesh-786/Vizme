import type { Request, Response } from "express";
import { checkHealth } from "../services/health.service.js";

// Controller handler for health check endpoint.
// Responds with general API status ("up") and database connectivity status.
export async function healthController(_req: Request, res: Response) {
  const status = await checkHealth();
  res.json({ status: "up", db: status.ok });
}