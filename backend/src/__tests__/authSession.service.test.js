import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('../database/connection.js', () => ({
  query: vi.fn(),
}));

vi.mock('../config.js', () => ({
  config: {
    isProduction: false,
    jwt: {
      secret: 'unit-test-secret-value-with-32-plus-length',
      accessExpiry: '15m',
      refreshExpiry: '7d',
    },
  },
}));

import { query } from '../database/connection.js';
import { sha256 } from '../utils/crypto.js';
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  clearAuthCookies,
  generateTokens,
  getAccessTokenFromCookie,
  getRefreshTokenFromRequest,
  rotateRefreshSession,
  setAuthCookies,
  verifyAccessToken,
  verifyRefreshToken,
  verifyRefreshTokenFromDb,
} from '../services/authSession.service.js';

describe('authSession.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates access and refresh tokens with expected type', () => {
    const { accessToken, refreshToken } = generateTokens(42);
    const accessPayload = jwt.verify(accessToken, 'unit-test-secret-value-with-32-plus-length');
    const refreshPayload = jwt.verify(refreshToken, 'unit-test-secret-value-with-32-plus-length');

    expect(accessPayload.userId).toBe(42);
    expect(accessPayload.type).toBe('access');
    expect(refreshPayload.userId).toBe(42);
    expect(refreshPayload.type).toBe('refresh');
  });

  it('verifies access token and rejects wrong token type', () => {
    const refreshOnly = jwt.sign(
      { userId: 5, type: 'refresh' },
      'unit-test-secret-value-with-32-plus-length',
      { expiresIn: '7d' }
    );

    expect(() => verifyAccessToken(refreshOnly)).toThrow(/Invalid token type/);
  });

  it('verifies refresh token and rejects wrong token type', () => {
    const accessOnly = jwt.sign(
      { userId: 5, type: 'access' },
      'unit-test-secret-value-with-32-plus-length',
      { expiresIn: '15m' }
    );

    expect(() => verifyRefreshToken(accessOnly)).toThrow(/Invalid token type/);
  });

  it('prefers refresh token from request body over cookie', () => {
    const req = {
      body: { refreshToken: 'body-token' },
      cookies: { [REFRESH_COOKIE_NAME]: 'cookie-token' },
    };

    expect(getRefreshTokenFromRequest(req)).toBe('body-token');
  });

  it('returns access token from cookies when available', () => {
    const req = {
      cookies: { [ACCESS_COOKIE_NAME]: 'access-cookie-token' },
    };

    expect(getAccessTokenFromCookie(req)).toBe('access-cookie-token');
  });

  it('sets and clears auth cookies with expected options', () => {
    const cookie = vi.fn();
    const clearCookie = vi.fn();
    const res = { cookie, clearCookie };

    setAuthCookies(res, { accessToken: 'a1', refreshToken: 'r1' });
    expect(cookie).toHaveBeenCalledTimes(2);
    expect(cookie).toHaveBeenCalledWith(
      ACCESS_COOKIE_NAME,
      'a1',
      expect.objectContaining({ httpOnly: true, secure: false, sameSite: 'lax', path: '/' })
    );
    expect(cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      'r1',
      expect.objectContaining({ httpOnly: true, secure: false, sameSite: 'lax', path: '/' })
    );

    clearAuthCookies(res);
    expect(clearCookie).toHaveBeenCalledTimes(2);
    expect(clearCookie).toHaveBeenCalledWith(
      ACCESS_COOKIE_NAME,
      expect.objectContaining({ httpOnly: true, secure: false, sameSite: 'lax', path: '/' })
    );
    expect(clearCookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      expect.objectContaining({ httpOnly: true, secure: false, sameSite: 'lax', path: '/' })
    );
  });

  it('rejects refresh verification when token is missing', async () => {
    await expect(verifyRefreshTokenFromDb('')).rejects.toThrow(/Refresh token required/);
  });

  it('maps JWT verification errors to UnauthorizedError', async () => {
    await expect(verifyRefreshTokenFromDb('not-a-jwt')).rejects.toThrow(/Invalid refresh token/);
  });

  it('rejects refresh verification when token is not found in DB', async () => {
    const refreshToken = jwt.sign(
      { userId: 9, type: 'refresh' },
      'unit-test-secret-value-with-32-plus-length',
      { expiresIn: '7d' }
    );
    query.mockResolvedValueOnce({ rows: [] });

    await expect(verifyRefreshTokenFromDb(refreshToken)).rejects.toThrow(
      /Refresh token not found or expired/
    );
    expect(query).toHaveBeenCalledWith(
      'SELECT user_id FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()',
      [sha256(refreshToken)]
    );
  });

  it('verifies refresh token from DB and rotates session', async () => {
    const refreshToken = jwt.sign(
      { userId: 77, type: 'refresh' },
      'unit-test-secret-value-with-32-plus-length',
      { expiresIn: '7d' }
    );

    query
      .mockResolvedValueOnce({ rows: [{ user_id: 77 }] })
      .mockResolvedValueOnce({ rows: [{ user_id: 77 }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 });

    const verification = await verifyRefreshTokenFromDb(refreshToken);
    expect(verification).toEqual({ userId: 77 });

    const rotated = await rotateRefreshSession(refreshToken);
    expect(rotated.userId).toBe(77);
    expect(typeof rotated.accessToken).toBe('string');
    expect(typeof rotated.refreshToken).toBe('string');
    expect(query).toHaveBeenNthCalledWith(
      2,
      'SELECT user_id FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()',
      [sha256(refreshToken)]
    );
    expect(query).toHaveBeenNthCalledWith(3, 'DELETE FROM refresh_tokens WHERE token = $1', [
      sha256(refreshToken),
    ]);
    expect(query).toHaveBeenNthCalledWith(
      4,
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      expect.arrayContaining([77, expect.any(String), expect.any(Date)])
    );
  });
});
