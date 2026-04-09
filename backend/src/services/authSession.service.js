import jwt from 'jsonwebtoken';
import { query } from '../database/connection.js';
import { config } from '../config.js';
import { UnauthorizedError } from '../middleware/errorHandler.js';

export const ACCESS_COOKIE_NAME = 'vizme_access_token';
export const REFRESH_COOKIE_NAME = 'vizme_refresh_token';

function parseExpiryToMs(str, fallbackMs) {
  const match = String(str || '').match(/^(\d+)(m|h|d)$/);
  if (!match) return fallbackMs;
  const num = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 'm') return num * 60 * 1000;
  if (unit === 'h') return num * 60 * 60 * 1000;
  if (unit === 'd') return num * 24 * 60 * 60 * 1000;
  return fallbackMs;
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}

export function generateTokens(userId) {
  const accessToken = jwt.sign({ userId, type: 'access' }, config.jwt.secret, {
    expiresIn: config.jwt.accessExpiry,
  });

  const refreshToken = jwt.sign({ userId, type: 'refresh' }, config.jwt.secret, {
    expiresIn: config.jwt.refreshExpiry,
  });

  return { accessToken, refreshToken };
}

export async function storeRefreshToken(userId, token) {
  const decoded = jwt.decode(token);
  const expiresAt = new Date(decoded.exp * 1000);

  await query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)', [
    userId,
    token,
    expiresAt,
  ]);
}

export async function revokeRefreshToken(token) {
  if (!token) return;
  await query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
}

export function verifyAccessToken(token) {
  const decoded = jwt.verify(token, config.jwt.secret);
  if (decoded.type !== 'access') {
    throw new UnauthorizedError('Invalid token type');
  }
  return decoded;
}

export function verifyRefreshToken(token) {
  const decoded = jwt.verify(token, config.jwt.secret);
  if (decoded.type !== 'refresh') {
    throw new UnauthorizedError('Invalid token type');
  }
  return decoded;
}

export function getRefreshTokenFromRequest(req) {
  const bodyToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';
  return bodyToken || req.cookies?.[REFRESH_COOKIE_NAME] || null;
}

export function getAccessTokenFromCookie(req) {
  return req.cookies?.[ACCESS_COOKIE_NAME] || null;
}

export function setAuthCookies(res, { accessToken, refreshToken }) {
  if (accessToken) {
    res.cookie(
      ACCESS_COOKIE_NAME,
      accessToken,
      cookieOptions(parseExpiryToMs(config.jwt.accessExpiry, 15 * 60 * 1000))
    );
  }

  if (refreshToken) {
    res.cookie(
      REFRESH_COOKIE_NAME,
      refreshToken,
      cookieOptions(parseExpiryToMs(config.jwt.refreshExpiry, 7 * 24 * 60 * 60 * 1000))
    );
  }
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE_NAME, cookieOptions(undefined));
  res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions(undefined));
}

/**
 * Verify a refresh token against the DB without revoking it.
 * Safe for concurrent GET requests — no side effects on the token table.
 */
export async function verifyRefreshTokenFromDb(refreshToken) {
  if (!refreshToken) {
    throw new UnauthorizedError('Refresh token required');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Invalid refresh token');
    }
    throw error;
  }

  const tokenResult = await query(
    'SELECT user_id FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()',
    [refreshToken]
  );

  if (tokenResult.rows.length === 0) {
    throw new UnauthorizedError('Refresh token not found or expired');
  }

  return { userId: tokenResult.rows[0].user_id ?? decoded.userId };
}

export function generateAccessToken(userId) {
  return jwt.sign({ userId, type: 'access' }, config.jwt.secret, {
    expiresIn: config.jwt.accessExpiry,
  });
}

export async function rotateRefreshSession(refreshToken) {
  if (!refreshToken) {
    throw new UnauthorizedError('Refresh token required');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Invalid refresh token');
    }
    throw error;
  }

  const tokenResult = await query(
    'SELECT user_id FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()',
    [refreshToken]
  );

  if (tokenResult.rows.length === 0) {
    throw new UnauthorizedError('Refresh token not found or expired');
  }

  const userId = tokenResult.rows[0].user_id ?? decoded.userId;
  const nextSession = generateTokens(userId);

  await revokeRefreshToken(refreshToken);
  await storeRefreshToken(userId, nextSession.refreshToken);

  return {
    userId,
    ...nextSession,
  };
}
