// src/middleware/apiKeyAuth.ts
import { Request, Response, NextFunction } from "express";
import { apiKeyService } from "../services/apiKey.service.js";
import { apiKeyRepository, ApiKey } from "../repositories/apiKey.repository.js";
import { logger } from "../utils/logger.js";

// Extend Express Request for API key auth
declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
      apiKeyTenantId?: string;
    }
  }
}

/**
 * Middleware to authenticate requests using API keys
 * Used for SDK/external service authentication
 *
 * Supports:
 * - Header: X-API-Key: <key>
 * - Header: Authorization: Bearer <key>
 * - Query param: ?api_key=<key> (not recommended, but supported)
 */
export async function authenticateApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Extract API key from various sources
    let apiKey: string | undefined;

    // 1. Check X-API-Key header (preferred)
    const xApiKey = req.headers["x-api-key"];
    if (xApiKey && typeof xApiKey === "string") {
      apiKey = xApiKey;
    }

    // 2. Check Authorization header with Bearer prefix
    if (!apiKey) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        // Check if it looks like an API key (starts with vizme_)
        if (token.startsWith("vizme_")) {
          apiKey = token;
        }
      }
    }

    // 3. Check query parameter (fallback, not recommended)
    if (!apiKey && req.query.api_key && typeof req.query.api_key === "string") {
      apiKey = req.query.api_key;
      logger.warn(
        { ip: req.ip },
        "API key passed via query parameter - this is not recommended",
      );
    }

    if (!apiKey) {
      res.status(401).json({
        error: "API key is required",
        hint: "Provide API key via X-API-Key header",
      });
      return;
    }

    // Validate the API key
    const result = await apiKeyService.validateApiKey(apiKey);

    if (!result.valid) {
      res.status(401).json({ error: result.error });
      return;
    }

    // Attach to request
    req.apiKey = result.apiKey;
    req.apiKeyTenantId = result.tenantId;
    req.tenantId = result.tenantId; // Also set tenantId for compatibility

    next();
  } catch (error) {
    logger.error({ error }, "API key authentication error");
    res.status(500).json({ error: "Authentication failed" });
  }
}

/**
 * Middleware factory to check for specific scopes
 */
export function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.apiKey) {
      res.status(401).json({ error: "API key is required" });
      return;
    }

    if (!apiKeyService.hasScope(req.apiKey, scope)) {
      res.status(403).json({
        error: "Insufficient permissions",
        required_scope: scope,
      });
      return;
    }

    next();
  };
}

/**
 * Optional API key authentication (doesn't fail if no key provided)
 * Useful for endpoints that work differently with/without auth
 */
export async function optionalApiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const xApiKey = req.headers["x-api-key"];
    if (!xApiKey || typeof xApiKey !== "string") {
      next();
      return;
    }

    const result = await apiKeyService.validateApiKey(xApiKey);
    if (result.valid) {
      req.apiKey = result.apiKey;
      req.apiKeyTenantId = result.tenantId;
      req.tenantId = result.tenantId;
    }

    next();
  } catch (error) {
    // Don't fail, just continue without auth
    next();
  }
}
