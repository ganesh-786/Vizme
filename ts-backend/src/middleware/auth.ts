// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { authService } from '@/services/auth.service.js';
import { logger } from '@/utils/logger.js';

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res
        .status(401)
        .json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.substring(7);
    const payload = authService.verifyAccessToken(token);

    req.user = payload;
    req.tenantId = payload.tenantId;

    next();
  } catch (error: unknown) {
    const errorName = error instanceof Error ? error.name : undefined;
    if (errorName === 'TokenExpiredError') {
      res.status(401).json({ error: 'Token expired' });
      return;
    }
    if (errorName === 'JsonWebTokenError') {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    logger.error({ error }, 'Authentication error');
    res.status(401).json({ error: 'Authentication failed' });
  }
}
