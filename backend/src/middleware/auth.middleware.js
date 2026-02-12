import { query } from '../database/connection.js';
import { UnauthorizedError } from './errorHandler.js';
import {
  getAccessTokenFromCookie,
  getRefreshTokenFromRequest,
  rotateRefreshSession,
  setAuthCookies,
  verifyAccessToken,
} from '../services/authSession.service.js';
import { authenticateKeycloak } from './keycloak.middleware.js';

const AUTH_PROVIDER = (process.env.AUTH_PROVIDER || 'legacy').toLowerCase();

// Log which auth provider is active at startup
console.log(`🔐 Auth provider: ${AUTH_PROVIDER}`);

const SAFE_COOKIE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

async function resolveUser(userId) {
  const result = await query('SELECT id, email, name FROM users WHERE id = $1', [userId]);

  if (result.rows.length === 0) {
    throw new UnauthorizedError('User not found');
  }

  return result.rows[0];
}

async function authenticateWithCookieSession(req, res) {
  if (!SAFE_COOKIE_METHODS.has(req.method)) {
    throw new UnauthorizedError('No token provided');
  }

  const accessCookie = getAccessTokenFromCookie(req);

  if (accessCookie) {
    try {
      return verifyAccessToken(accessCookie);
    } catch (error) {
      if (error.name !== 'TokenExpiredError') {
        throw new UnauthorizedError('Invalid or expired token');
      }
    }
  }

  const refreshToken = getRefreshTokenFromRequest(req);
  if (!refreshToken) {
    throw new UnauthorizedError('No token provided');
  }

  const session = await rotateRefreshSession(refreshToken);
  setAuthCookies(res, session);
  return verifyAccessToken(session.accessToken);
}

const authenticateLegacy = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let decoded;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      decoded = verifyAccessToken(token);
      if (!getAccessTokenFromCookie(req) && SAFE_COOKIE_METHODS.has(req.method)) {
        setAuthCookies(res, { accessToken: token });
      }
    } else {
      decoded = await authenticateWithCookieSession(req, res);
    }

    req.user = await resolveUser(decoded.userId);
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
