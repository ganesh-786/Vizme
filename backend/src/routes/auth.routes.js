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
import { query } from '../database/connection.js';
import { authenticate } from '../middleware/auth.middleware.js';
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

// ---------------------------------------------------------------------------
// GET /onboarding-status — Returns the user's setup progress.
//   Checks: has metric configs, has user-level API key, onboarding completed.
// ---------------------------------------------------------------------------
router.get('/onboarding-status', authenticate, async (req, res, next) => {
  try {
    const [configsResult, keyResult, userResult] = await Promise.all([
      query(
        'SELECT COUNT(*)::int AS count FROM metric_configs WHERE user_id = $1',
        [req.user.id]
      ),
      query(
        `SELECT id FROM api_keys
         WHERE user_id = $1 AND metric_config_id IS NULL AND is_active = true
         LIMIT 1`,
        [req.user.id]
      ),
      query(
        'SELECT onboarding_completed_at FROM users WHERE id = $1',
        [req.user.id]
      ),
    ]);

    const hasMetricConfigs = configsResult.rows[0].count > 0;
    const hasApiKey = keyResult.rows.length > 0;
    const onboardingCompletedAt = userResult.rows[0]?.onboarding_completed_at || null;
    const isSetupComplete = hasMetricConfigs && hasApiKey && onboardingCompletedAt !== null;

    res.json({
      success: true,
      data: {
        has_metric_configs: hasMetricConfigs,
        metric_configs_count: configsResult.rows[0].count,
        has_api_key: hasApiKey,
        onboarding_completed_at: onboardingCompletedAt,
        is_setup_complete: isSetupComplete,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /onboarding-complete — Marks the user's onboarding as done.
// ---------------------------------------------------------------------------
router.post('/onboarding-complete', authenticate, async (req, res, next) => {
  try {
    await query(
      `UPDATE users SET onboarding_completed_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND onboarding_completed_at IS NULL`,
      [req.user.id]
    );

    res.json({
      success: true,
      message: 'Onboarding marked as complete.',
    });
  } catch (error) {
    next(error);
  }
});

export { router as authRoutes };
