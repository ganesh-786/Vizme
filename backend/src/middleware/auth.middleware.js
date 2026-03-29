/**
 * Authentication Middleware — Dual-Auth Support
 *
 * Supports three modes controlled by the AUTH_PROVIDER env var:
 *   "legacy"   – (default) use the existing JWT-secret-based validation only
 *   "keycloak" – use Keycloak OIDC token validation only
 *   "both"     – try Keycloak first; if it fails, fall back to legacy JWT
 *
 * The `authenticateApiKey` middleware is NOT affected — API key auth remains
 * completely independent of the auth provider setting.
 */

import jwt from 'jsonwebtoken';
import { query } from '../database/connection.js';
import { UnauthorizedError } from './errorHandler.js';
import { authenticateKeycloak } from './keycloak.middleware.js';

const AUTH_PROVIDER = (process.env.AUTH_PROVIDER || 'legacy').toLowerCase();

// Log which auth provider is active at startup
console.log(`🔐 Auth provider: ${AUTH_PROVIDER}`);

// ─── Legacy JWT Authentication (unchanged logic) ───────────────────────────

/**
 * Original JWT authentication using the shared JWT_SECRET.
 * Exactly the same logic that existed before Keycloak integration.
 */
const authenticateLegacy = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');

    // Verify user still exists
    const result = await query('SELECT id, email, name FROM users WHERE id = $1', [decoded.userId]);

    if (result.rows.length === 0) {
      throw new UnauthorizedError('User not found');
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Invalid or expired token'));
    }
    next(error);
  }
};

// ─── Dual-Auth: Try Keycloak, then fall back to Legacy ─────────────────────

/**
 * When AUTH_PROVIDER=both, try Keycloak validation first.
 * If that fails (e.g. the token was issued by the legacy system), fall back
 * to the legacy JWT middleware.
 *
 * This allows a seamless transition period where both old and new tokens work.
 */
const authenticateBoth = async (req, res, next) => {
  // Try Keycloak first.
  // We pass a custom callback as the `next` parameter to authenticateKeycloak.
  // If Keycloak succeeds, it calls our callback with no error — we then call
  // the real Express `next()` to continue to the route handler.
  // If Keycloak fails, we fall back to legacy JWT.
  authenticateKeycloak(req, res, (keycloakError) => {
    if (!keycloakError) {
      // Keycloak succeeded — call the real next() to continue to the route handler
      return next();
    }

    // Keycloak failed — try legacy JWT
    // Reset req.user in case Keycloak partially set it
    req.user = undefined;
    req.keycloakPayload = undefined;

    authenticateLegacy(req, res, next);
  });
};

// ─── Main Authenticate Export ───────────────────────────────────────────────

/**
 * The main `authenticate` middleware used by all protected routes.
 * Behavior depends on the AUTH_PROVIDER environment variable.
 */
export const authenticate = async (req, res, next) => {
  switch (AUTH_PROVIDER) {
    case 'keycloak':
      return authenticateKeycloak(req, res, next);

    case 'both':
      return authenticateBoth(req, res, next);

    case 'legacy':
    default:
      return authenticateLegacy(req, res, next);
  }
};

// ─── API Key Authentication (unchanged) ─────────────────────────────────────

/**
 * API key authentication — completely independent of AUTH_PROVIDER.
 * Used for metrics ingestion, tracker.js, and metric-configs/by-api-key.
 */
export const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;

    if (!apiKey) {
      throw new UnauthorizedError('API key required');
    }

    const result = await query(
      'SELECT ak.*, u.id as user_id, u.email FROM api_keys ak JOIN users u ON ak.user_id = u.id WHERE ak.api_key = $1 AND ak.is_active = true',
      [apiKey]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedError('Invalid or inactive API key');
    }

    req.apiKey = result.rows[0];
    req.user = { id: result.rows[0].user_id, email: result.rows[0].email };
    next();
  } catch (error) {
    next(error);
  }
};
