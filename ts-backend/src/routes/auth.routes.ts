// src/routes/auth.routes.ts
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  signup,
  signin,
  googleSignin,
  refresh,
  logout,
  logoutAll,
  me,
} from '@/controllers/auth.controller.js';
import { authenticate } from '@/middleware/auth.js';
import { requireCsrf } from '@/middleware/csrf.js';
import { asyncHandler } from '@/utils/asyncHandler.js';
import { env } from '@/config/env.js';

export const authRoutes = Router();
const authWriteLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: Math.min(env.RATE_LIMIT_MAX, 50),
  standardHeaders: true,
  legacyHeaders: false,
});

// Public routes
authRoutes.post('/signup', authWriteLimiter, asyncHandler(signup));
authRoutes.post('/signin', authWriteLimiter, asyncHandler(signin));
authRoutes.post('/google', authWriteLimiter, asyncHandler(googleSignin));
authRoutes.post('/refresh', authWriteLimiter, requireCsrf, asyncHandler(refresh));
authRoutes.post('/logout', authWriteLimiter, requireCsrf, asyncHandler(logout));

// Protected routes
authRoutes.get('/me', authenticate, asyncHandler(me));
authRoutes.post('/logout-all', authenticate, requireCsrf, asyncHandler(logoutAll));
