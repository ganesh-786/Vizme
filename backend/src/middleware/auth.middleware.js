import { query } from '../database/connection.js';
import { UnauthorizedError } from './errorHandler.js';
import {
  generateAccessToken,
  getAccessTokenFromCookie,
  getRefreshTokenFromRequest,
  setAuthCookies,
  verifyAccessToken,
  verifyRefreshTokenFromDb,
} from '../services/authSession.service.js';
import { sha256 } from '../utils/crypto.js';

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

  const { userId } = await verifyRefreshTokenFromDb(refreshToken);
  const accessToken = generateAccessToken(userId);
  setAuthCookies(res, { accessToken });
  return verifyAccessToken(accessToken);
}

export const authenticate = async (req, res, next) => {
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

export const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;

    if (!apiKey) {
      throw new UnauthorizedError('API key required');
    }

    const keyHash = sha256(apiKey);
    const result = await query(
      'SELECT ak.*, u.id as user_id, u.email FROM api_keys ak JOIN users u ON ak.user_id = u.id WHERE ak.api_key = $1 AND ak.is_active = true',
      [keyHash]
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
