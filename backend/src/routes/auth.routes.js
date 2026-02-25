/**
 * Auth routes — Keycloak-only (Step 5 Cutover)
 *
 * Legacy signin, signup, and refresh have been removed. Authentication is
 * handled by Keycloak; the frontend uses the Keycloak JS adapter.
 *
 * Optional stub for password-reset-request returns a message directing
 * users to Keycloak (e.g. self-service reset in Keycloak realm).
 */

import express from 'express';
import { body, validationResult } from 'express-validator';
import { authLimiter } from '../middleware/rateLimiter.js';
import { BadRequestError } from '../middleware/errorHandler.js';

const router = express.Router();

// Password reset request — stub: direct users to Keycloak
router.post(
  '/password-reset-request',
  authLimiter,
  [body('email').isEmail().normalizeEmail()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new BadRequestError('Validation failed', errors.array());
      }
      res.json({
        success: true,
        message:
          'Password reset is managed by Keycloak. Use the "Forgot password?" link on the login page or contact your administrator.',
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as authRoutes };
