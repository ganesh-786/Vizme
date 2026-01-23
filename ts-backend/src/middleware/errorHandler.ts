import type { Request, Response, NextFunction } from "express";

/**
 * Express error-handling middleware.
 * Catches any error passed to next() or thrown in async routes,
 * and responds with a standardized 500 Internal Server Error JSON response.
 * 
 * - err: The error that occurred (can be any type).
 * - _req: The Express Request object (unused here).
 * - res: The Express Response object.
 * - _next: The Express NextFunction (unused here).
 *
 * This middleware should be registered after all other route handlers.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  // Extract error message if available, or provide a generic fallback
  const message = err instanceof Error ? err.message : "Unknown error";

  // Respond with HTTP 500 and error details in JSON format
  res.status(500).json({ error: "InternalServerError", message });
}