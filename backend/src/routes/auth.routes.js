import express from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../database/connection.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { BadRequestError, UnauthorizedError } from '../middleware/errorHandler.js';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

// Helper: Generate tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId, type: 'access' }, JWT_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRY,
  });

  const refreshToken = jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRY,
  });

  return { accessToken, refreshToken };
};

// Helper: Store refresh token
const storeRefreshToken = async (userId, token) => {
  const decoded = jwt.decode(token);
  const expiresAt = new Date(decoded.exp * 1000);

  await query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)', [
    userId,
    token,
    expiresAt,
  ]);
};

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
router.post('/refresh', [body('refreshToken').notEmpty()], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new BadRequestError('Validation failed', errors.array());
    }

    const { refreshToken } = req.body;

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_SECRET);
    } catch (error) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (decoded.type !== 'refresh') {
      throw new UnauthorizedError('Invalid token type');
    }

    // Check if token exists in database
    const tokenResult = await query(
      'SELECT user_id FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()',
      [refreshToken]
    );

    if (tokenResult.rows.length === 0) {
      throw new UnauthorizedError('Refresh token not found or expired');
    }

    const userId = tokenResult.rows[0].user_id;

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(userId);

    // Rotate refresh token
    await query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    await storeRefreshToken(userId, newRefreshToken);

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

      const result = await query('SELECT id FROM users WHERE email = $1', [email]);

      // Don't reveal if user exists (security best practice)
      res.json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent',
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
         WHERE user_id = $1 AND metric_config_id IS NULL AND is_active = true
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

// POST /api/v1/auth/grafana-session
// Called by frontend before redirecting to Grafana
// Validates JWT and sets an HttpOnly cookie for Grafana access
router.post('/grafana-session', authenticate, (req, res) => {
  const grafanaToken = jwt.sign(
    { userId: req.user.id, email: req.user.email, name: req.user.name, type: 'grafana' },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.cookie('vizme_grafana_session', grafanaToken, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    path: '/',
    domain: 'localhost',
  });

  res.json({ success: true });
});

// GET /api/v1/auth/verify-grafana
// Called by Nginx auth_request for every Grafana request
// Validates the cookie and returns user info in headers
router.get('/verify-grafana', (req, res) => {
  try {
    const token = req.cookies?.vizme_grafana_session;
    if (!token) {
      return res.status(401).json({ error: 'No session' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'grafana') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    // Pass user identity back via response header
    res.set('X-Grafana-User', decoded.email);
    res.set('X-Grafana-Name', decoded.name);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid session' });
  }
});

export { router as authRoutes };
