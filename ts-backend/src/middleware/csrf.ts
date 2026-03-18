import type { NextFunction, Request, Response } from 'express';
import { env } from '@/config/env.js';

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  if (!env.CSRF_PROTECTION_ENABLED) {
    next();
    return;
  }

  const csrfCookie = req.cookies?.[CSRF_COOKIE];
  const csrfHeader = req.get(CSRF_HEADER);

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }

  // Optional strict origin validation for browser clients in production.
  if (env.NODE_ENV === 'production' && env.FRONTEND_URL) {
    const origin = req.get('origin');
    if (origin && origin !== env.FRONTEND_URL) {
      res.status(403).json({ error: 'Invalid request origin' });
      return;
    }
  }

  next();
}
