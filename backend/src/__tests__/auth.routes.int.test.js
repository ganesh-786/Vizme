import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';

const setupApp = async () => {
  vi.resetModules();

  const queryMock = vi.fn();
  const compareMock = vi.fn();
  const hashMock = vi.fn();
  const generateTokensMock = vi.fn();
  const storeRefreshTokenMock = vi.fn();
  const setAuthCookiesMock = vi.fn();
  const clearAuthCookiesMock = vi.fn();
  const rotateRefreshSessionMock = vi.fn();
  const revokeRefreshTokenMock = vi.fn();
  const getRefreshTokenFromRequestMock = vi.fn();
  const clearGrafanaEmbedCookieMock = vi.fn();
  const ensureGrafanaTenantMock = vi.fn().mockResolvedValue('org-1');

  vi.doMock('../database/connection.js', () => ({
    query: queryMock,
  }));

  vi.doMock('bcryptjs', () => ({
    default: {
      compare: compareMock,
      hash: hashMock,
    },
  }));

  vi.doMock('../middleware/rateLimiter.js', () => ({
    authLimiter: (req, res, next) => next(),
  }));

  vi.doMock('../middleware/auth.middleware.js', () => ({
    authenticate: (req, res, next) => {
      req.user = { id: 1 };
      next();
    },
  }));

  vi.doMock('../services/authSession.service.js', () => ({
    clearAuthCookies: clearAuthCookiesMock,
    generateTokens: generateTokensMock,
    getRefreshTokenFromRequest: getRefreshTokenFromRequestMock,
    revokeRefreshToken: revokeRefreshTokenMock,
    rotateRefreshSession: rotateRefreshSessionMock,
    setAuthCookies: setAuthCookiesMock,
    storeRefreshToken: storeRefreshTokenMock,
    verifyRefreshToken: vi.fn(),
  }));

  vi.doMock('../services/grafanaEmbedSession.service.js', () => ({
    clearGrafanaEmbedCookie: clearGrafanaEmbedCookieMock,
  }));

  vi.doMock('../services/grafanaTenant.service.js', () => ({
    ensureGrafanaTenant: ensureGrafanaTenantMock,
  }));

  vi.doMock('../logger.js', () => ({
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }));

  vi.doMock('../config.js', () => ({
    config: {
      isProduction: false,
    },
  }));

  const { authRoutes } = await import('../routes/auth.routes.js');
  const { errorHandler, UnauthorizedError } = await import('../middleware/errorHandler.js');

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/v1/auth', authRoutes);
  app.use(errorHandler);

  return {
    app,
    mocks: {
      queryMock,
      compareMock,
      hashMock,
      generateTokensMock,
      storeRefreshTokenMock,
      setAuthCookiesMock,
      clearAuthCookiesMock,
      rotateRefreshSessionMock,
      revokeRefreshTokenMock,
      getRefreshTokenFromRequestMock,
      clearGrafanaEmbedCookieMock,
      ensureGrafanaTenantMock,
    },
    UnauthorizedError,
  };
};

describe('auth.routes integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POST /signup creates a user and returns auth payload', async () => {
    const { app, mocks } = await setupApp();
    mocks.queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [{ id: 10, email: 'new@example.com', name: 'New User' }],
    });
    mocks.hashMock.mockResolvedValue('hashed-password');
    mocks.generateTokensMock.mockReturnValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    mocks.storeRefreshTokenMock.mockResolvedValue(undefined);

    const res = await request(app).post('/api/v1/auth/signup').send({
      email: 'new@example.com',
      password: 'password123',
      name: 'New User',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('new@example.com');
    expect(mocks.queryMock).toHaveBeenNthCalledWith(1, 'SELECT id FROM users WHERE email = $1', [
      'new@example.com',
    ]);
    expect(mocks.storeRefreshTokenMock).toHaveBeenCalledWith(10, 'refresh-token');
    expect(mocks.setAuthCookiesMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ accessToken: 'access-token', refreshToken: 'refresh-token' })
    );
  });

  it('POST /signup returns 400 for duplicate email', async () => {
    const { app, mocks } = await setupApp();
    mocks.queryMock.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const res = await request(app).post('/api/v1/auth/signup').send({
      email: 'exists@example.com',
      password: 'password123',
      name: 'Existing User',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/already exists/);
  });

  it('POST /signin returns 401 when password is invalid', async () => {
    const { app, mocks } = await setupApp();
    mocks.queryMock.mockResolvedValueOnce({
      rows: [{ id: 11, email: 'user@example.com', name: 'User', password_hash: 'hash' }],
    });
    mocks.compareMock.mockResolvedValue(false);

    const res = await request(app).post('/api/v1/auth/signin').send({
      email: 'user@example.com',
      password: 'wrong-password',
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('POST /refresh returns new access token on valid refresh session', async () => {
    const { app, mocks } = await setupApp();
    mocks.getRefreshTokenFromRequestMock.mockReturnValue('refresh-token');
    mocks.rotateRefreshSessionMock.mockResolvedValue({
      userId: 22,
      accessToken: 'next-access-token',
      refreshToken: 'next-refresh-token',
    });

    const res = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: 'refresh-token',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBe('next-access-token');
    expect(mocks.setAuthCookiesMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        accessToken: 'next-access-token',
        refreshToken: 'next-refresh-token',
      })
    );
  });

  it('POST /refresh clears cookies when refresh token is invalid', async () => {
    const { app, mocks, UnauthorizedError } = await setupApp();
    mocks.getRefreshTokenFromRequestMock.mockReturnValue('bad-token');
    mocks.rotateRefreshSessionMock.mockRejectedValue(
      new UnauthorizedError('Invalid refresh token')
    );

    const res = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: 'bad-token',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
    expect(mocks.clearAuthCookiesMock).toHaveBeenCalledTimes(1);
    expect(mocks.clearGrafanaEmbedCookieMock).toHaveBeenCalledTimes(1);
  });
});
