/**
 * Authentication middleware — Keycloak and/or legacy JWT (see AUTH_PROVIDER).
 * API key auth is independent of AUTH_PROVIDER.
 */

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

const AUTH_PROVIDER = process.env.AUTH_PROVIDER || 'legacy';

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

const authenticateBoth = async (req, res, next) => {
  authenticateKeycloak(req, res, (keycloakError) => {
    if (!keycloakError) {
      return next();
    }

    req.user = undefined;
    req.keycloakPayload = undefined;

    authenticateLegacy(req, res, next);
  });
};

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

/**
 * API key authentication — independent of AUTH_PROVIDER.
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
