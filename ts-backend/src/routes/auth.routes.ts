// src/routes/auth.routes.ts
import { Router } from 'express';
import {
  signup,
  signin,
  refresh,
  logout,
  logoutAll,
  me,
} from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const authRoutes = Router();

// Public routes
authRoutes.post('/signup', asyncHandler(signup));
authRoutes.post('/signin', asyncHandler(signin));
authRoutes.post('/refresh', asyncHandler(refresh));
authRoutes.post('/logout', asyncHandler(logout));

// Protected routes
authRoutes.get('/me', authenticate, asyncHandler(me));
authRoutes.post('/logout-all', authenticate, asyncHandler(logoutAll));
