/**
 * Auth routes — legacy session (signup/signin/refresh) plus Keycloak-oriented stubs.
 * When AUTH_PROVIDER=keycloak, clients typically use Keycloak for credentials;
 * these routes remain for legacy and transitional setups.
 */

import express from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import { query } from '../database/connection.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { BadRequestError, UnauthorizedError } from '../middleware/errorHandler.js';
import {
  clearAuthCookies,
  generateTokens,
  getRefreshTokenFromRequest,
  revokeRefreshToken,
  rotateRefreshSession,
  setAuthCookies,
  storeRefreshToken,
  verifyRefreshToken,
} from '../services/authSession.service.js';
import { clearGrafanaEmbedCookie } from '../services/grafanaEmbedSession.service.js';
import { ensureGrafanaTenant } from '../services/grafanaTenant.service.js';
import { logger } from '../logger.js';

const AUTH_PROVIDER = process.env.AUTH_PROVIDER || 'legacy';

const router = express.Router();

function grafanaLoginFromUser(user) {
  const raw = (user?.email || '').trim().toLowerCase();
  if (raw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    return raw.replace(/[^a-z0-9@._+-]/gi, '_').slice(0, 190);
  }
  return `vizme_user_${user?.id}`;
}

function warmGrafanaTenant(user) {
  if (!user?.id) return;
  ensureGrafanaTenant(user.id, { grafanaLogin: grafanaLoginFromUser(user) })
    .then((orgId) => {
      if (!orgId) {
        logger.warn({ userId: user.id }, 'warmGrafanaTenant: tenant not ready during auth');
      }
    })
    .catch((error) => {
      logger.warn(
        { err: error?.message, userId: user.id },
        'warmGrafanaTenant: tenant provisioning warm-up failed'
      );
    });
}

// Signup
router.post(
  '/signup',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('name').optional().trim().isLength({ min: 1 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new BadRequestError('Validation failed', errors.array());
      }

      const { email, password, name } = req.body;

      // Check if user exists
      const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existingUser.rows.length > 0) {
        throw new BadRequestError('User with this email already exists');
      }

      // Hash password (12+ rounds)
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user
      const result = await query(
        'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
        [email, passwordHash, name || null]
      );

      const user = result.rows[0];
      const { accessToken, refreshToken } = generateTokens(user.id);
      await storeRefreshToken(user.id, refreshToken);
      setAuthCookies(res, { accessToken, refreshToken });
      warmGrafanaTenant(user);

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
          },
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Signin
router.post(
  '/signin',
  authLimiter,
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new BadRequestError('Validation failed', errors.array());
      }

      const { email, password } = req.body;

      // Find user
      const result = await query(
        'SELECT id, email, password_hash, name FROM users WHERE email = $1',
        [email]
      );
      if (result.rows.length === 0) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const user = result.rows[0];

      // Verify password
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        throw new UnauthorizedError('Invalid email or password');
      }

      // Generate tokens
      const { accessToken, refreshToken } = generateTokens(user.id);

      // Rotate refresh token (delete old ones for this user)
      await query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);
      await storeRefreshToken(user.id, refreshToken);
      setAuthCookies(res, { accessToken, refreshToken });
      warmGrafanaTenant(user);

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
          },
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Refresh token
router.post('/refresh', [body('refreshToken').optional().notEmpty()], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new BadRequestError('Validation failed', errors.array());
    }

    const refreshToken = getRefreshTokenFromRequest(req);
    const { accessToken, refreshToken: newRefreshToken } = await rotateRefreshSession(refreshToken);
    setAuthCookies(res, { accessToken, refreshToken: newRefreshToken });

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/session',
  [body('refreshToken').optional().notEmpty()],
  authenticate,
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new BadRequestError('Validation failed', errors.array());
      }

      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedError('No token provided');
      }

      const accessToken = authHeader.substring(7);
      const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';

      if (refreshToken) {
        const decoded = verifyRefreshToken(refreshToken);
        if (String(decoded.userId) !== String(req.user.id)) {
          throw new UnauthorizedError('Invalid refresh token');
        }

        const tokenResult = await query(
          'SELECT 1 FROM refresh_tokens WHERE token = $1 AND user_id = $2 AND expires_at > NOW()',
          [refreshToken, req.user.id]
        );
        if (tokenResult.rows.length === 0) {
          throw new UnauthorizedError('Refresh token not found or expired');
        }
      }

      setAuthCookies(res, { accessToken, ...(refreshToken ? { refreshToken } : {}) });
      res.json({
        success: true,
        data: { sessionSynced: true },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post('/logout', async (req, res, next) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }
    clearAuthCookies(res);
    clearGrafanaEmbedCookie(res);
    res.json({
      success: true,
      message: 'Signed out successfully.',
    });
  } catch (error) {
    next(error);
  }
});

// Password reset request (simplified - in production, send email)
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

      const { email } = req.body;

      await query('SELECT id FROM users WHERE email = $1', [email]);

      const keycloakMessage =
        'Password reset is managed by Keycloak. Use the "Forgot password?" link on the login page or contact your administrator.';
      const legacyMessage = 'If an account exists with this email, a password reset link has been sent';

      res.json({
        success: true,
        message: AUTH_PROVIDER === 'keycloak' ? keycloakMessage : legacyMessage,
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
    // Run all checks in parallel for performance
    const [configsResult, keyResult, userResult] = await Promise.all([
      query('SELECT COUNT(*)::int AS count FROM metric_configs WHERE user_id = $1', [req.user.id]),
      query(
        `SELECT id FROM api_keys
         WHERE user_id = $1 AND metric_config_id IS NULL AND site_id IS NULL AND is_active = true
         LIMIT 1`,
        [req.user.id]
      ),
      query('SELECT onboarding_completed_at FROM users WHERE id = $1', [req.user.id]),
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
//   Called after the user finishes the Code Generation step.
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
