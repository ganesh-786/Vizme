// src/services/auth.service.ts
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '@/config/env.js';
import { userRepository, User } from '@/repositories/user.repository.js';
import { refreshTokenRepository } from '@/repositories/refreshToken.repository.js';
import { logger } from '@/utils/logger.js';

const SALT_ROUNDS = 12;

export interface TokenPayload {
  sub: string; // user id
  email: string;
  tenantId: string;
  name?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SignupParams {
  email: string;
  password: string;
  name?: string;
}

export interface SigninParams {
  email: string;
  password: string;
}

// Generate unique tenant ID
function generateTenantId(email: string): string {
  const emailPrefix = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  return `${emailPrefix}-${randomSuffix}`.substring(0, 50);
}

// Generate tokens
function generateTokens(user: User): AuthTokens {
  const payload: TokenPayload = {
    sub: user.id,
    email: user.email,
    tenantId: user.tenant_id,
    name: user.name || undefined,
  };

  const accessToken = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY as jwt.SignOptions['expiresIn'],
  });

  // Refresh token is a random string (not JWT)
  const refreshToken = crypto.randomBytes(64).toString('hex');

  return { accessToken, refreshToken };
}

// Parse expiry string to milliseconds
function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7 days

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
}

export const authService = {
  async signup(params: SignupParams) {
    // Check if email exists
    if (await userRepository.emailExists(params.email)) {
      throw new Error('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(params.password, SALT_ROUNDS);

    // Generate tenant ID
    const tenantId = generateTenantId(params.email);

    // Create user
    const user = await userRepository.create({
      email: params.email,
      passwordHash,
      name: params.name,
      tenantId,
    });

    logger.info({ userId: user.id, tenantId }, 'User created');

    // Generate tokens
    const tokens = generateTokens(user);

    // Save refresh token (starts a new token family)
    const refreshExpiry = new Date(
      Date.now() + parseExpiry(env.JWT_REFRESH_EXPIRY)
    );
    await refreshTokenRepository.save(
      user.id,
      tokens.refreshToken,
      refreshExpiry
      // No familyId = new family for new signup
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId: user.tenant_id,
      },
      ...tokens,
    };
  },

  async signin(params: SigninParams) {
    // Find user
    const user = await userRepository.findByEmail(params.email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isValid = await bcrypt.compare(params.password, user.password_hash);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    logger.info({ userId: user.id }, 'User signed in');

    // Generate tokens
    const tokens = generateTokens(user);

    // Save refresh token (starts a new token family for new login)
    const refreshExpiry = new Date(
      Date.now() + parseExpiry(env.JWT_REFRESH_EXPIRY)
    );
    await refreshTokenRepository.save(
      user.id,
      tokens.refreshToken,
      refreshExpiry
      // No familyId = new family for new signin
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId: user.tenant_id,
      },
      ...tokens,
    };
  },

  async refresh(refreshToken: string) {
    // Find refresh token (includes revoked tokens for reuse detection)
    const tokenData = await refreshTokenRepository.findByToken(refreshToken);
    if (!tokenData) {
      throw new Error('Invalid or expired refresh token');
    }

    // SECURITY: Detect refresh token reuse attack
    // If a token that was already used (revoked) is being used again,
    // someone may have stolen the token. Revoke the entire family to protect the user.
    if (tokenData.is_revoked) {
      logger.warn(
        { userId: tokenData.user_id, familyId: tokenData.family_id },
        'Refresh token reuse detected - revoking entire token family'
      );
      await refreshTokenRepository.revokeFamily(tokenData.family_id);
      throw new Error('Token reuse detected. Please login again.');
    }

    // Get user
    const user = await userRepository.findById(tokenData.user_id);
    if (!user) {
      throw new Error('User not found');
    }

    // Mark the old token as revoked (not deleted) to detect reuse
    await refreshTokenRepository.markRevoked(refreshToken);

    // Generate new tokens
    const tokens = generateTokens(user);

    // Save new refresh token in the same family
    const refreshExpiry = new Date(
      Date.now() + parseExpiry(env.JWT_REFRESH_EXPIRY)
    );
    await refreshTokenRepository.save(
      user.id,
      tokens.refreshToken,
      refreshExpiry,
      tokenData.family_id // Continue the same token family
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId: user.tenant_id,
      },
      ...tokens,
    };
  },

  async logout(refreshToken: string) {
    await refreshTokenRepository.deleteByToken(refreshToken);
  },

  async logoutAll(userId: string) {
    await refreshTokenRepository.deleteAllForUser(userId);
  },

  verifyAccessToken(token: string): TokenPayload {
    return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  },
};
