import express from 'express';
import { authenticate, isPlatformAdmin } from '../middleware/auth.middleware.js';
import { ForbiddenError } from '../middleware/errorHandler.js';

const router = express.Router();

// All /api/v1/admin routes require an authenticated admin.
router.use(authenticate);
router.use((req, res, next) => {
  // `req.keycloakPayload` is attached by `authenticate` (keycloak.middleware.js).
  if (!req.keycloakPayload || !isPlatformAdmin(req.keycloakPayload)) {
    return next(new ForbiddenError('Admin access required'));
  }
  next();
});

// Minimal admin endpoint to validate role protection (PLATFORM_ADMIN or API_ADMIN).
router.get('/ping', async (req, res) => {
  res.json({
    success: true,
    data: {
      message: 'admin ok',
      user: req.user,
      timestamp: new Date().toISOString(),
    },
  });
});

export { router as adminRoutes };

