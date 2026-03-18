// src/services/auth.service.ts
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
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

export interface GoogleSigninParams {
  idToken: string;
}

type PgError = {
  code?: string;
  constraint?: string;
};

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

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

  const value = parseInt(match[1], 10);
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

async function issueSession(user: User, familyId?: string) {
  const tokens = generateTokens(user);
  const refreshExpiry = new Date(Date.now() + parseExpiry(env.JWT_REFRESH_EXPIRY));
  await refreshTokenRepository.save(
    user.id,
    tokens.refreshToken,
    refreshExpiry,
    familyId
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
}

async function createLocalUserWithRetries(
  params: SignupParams,
  passwordHash: string
): Promise<User> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await userRepository.create({
        email: params.email,
        passwordHash,
        name: params.name,
        tenantId: generateTenantId(params.email),
      });
    } catch (error: unknown) {
      const pgError = error as PgError;
      if (pgError.code !== '23505') {
        throw error;
      }

      if (pgError.constraint === 'users_email_key') {
        throw new Error('Email already registered');
      }

      // Retry on tenant_id collision; email collision should fail immediately.
      if (pgError.constraint !== 'users_tenant_id_key' || attempt === maxAttempts) {
        throw error;
      }
    }
  }

  throw new Error('Failed to create user');
}

async function createGoogleUserWithRetries(
  email: string,
  name: string | undefined,
  googleSub: string
): Promise<User> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await userRepository.createGoogleUser({
        email,
        name,
        tenantId: generateTenantId(email),
        googleSub,
      });
    } catch (error: unknown) {
      const pgError = error as PgError;
      if (pgError.code !== '23505') {
        throw error;
      }

      if (pgError.constraint === 'users_email_key') {
        throw new Error('Account already exists with password login');
      }

      if (pgError.constraint !== 'users_tenant_id_key' || attempt === maxAttempts) {
        throw error;
      }
    }
  }

  throw new Error('Failed to create Google user');
}

export const authService = {
  async signup(params: SignupParams) {
    // Check if email exists
    if (await userRepository.emailExists(params.email)) {
      throw new Error('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(params.password, SALT_ROUNDS);

    const user = await createLocalUserWithRetries(params, passwordHash);

    logger.info({ userId: user.id, tenantId: user.tenant_id }, 'User created');
    return issueSession(user);
  },

  async signin(params: SigninParams) {
    // Find user
    const user = await userRepository.findByEmail(params.email);
    if (!user) {
      throw new Error('Invalid email or password');
    }
    if (!user.password_hash) {
      throw new Error('Use Google sign in for this account');
    }

    // Verify password
    const isValid = await bcrypt.compare(params.password, user.password_hash);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    logger.info({ userId: user.id }, 'User signed in');

    return issueSession(user);
  },

  async signinWithGoogle(params: GoogleSigninParams) {
    const ticket = await googleClient.verifyIdToken({
      idToken: params.idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload) {
      throw new Error('Invalid Google token payload');
    }

    const googleSub = payload.sub;
    const email = payload.email?.toLowerCase();
    const name = payload.name;

    if (!googleSub || !email) {
      throw new Error('Google token missing required identity fields');
    }
    if (!payload.email_verified) {
      throw new Error('Google email is not verified');
    }

    let user = await userRepository.findByGoogleSub(googleSub);

    if (!user) {
      const existingUser = await userRepository.findByEmail(email);
      if (existingUser) {
        if (existingUser.password_hash) {
          throw new Error('Account already exists with password login');
        }
        user = await userRepository.linkGoogleToUser(existingUser.id, googleSub);
        if (!user) {
          throw new Error('Failed to link Google account');
        }
      } else {
        user = await createGoogleUserWithRetries(email, name || undefined, googleSub);
      }
    }

    logger.info({ userId: user.id }, 'User signed in with Google');
    return issueSession(user);
  },

  async refresh(refreshToken: string) {
    // Find refresh token (includes revoked tokens for reuse detection)
    const tokenData = await refreshTokenRepository.findByToken(refreshToken);
    if (!tokenData) {
      throw new Error('Invalid or expired refresh token');
    }

    const consumed = await refreshTokenRepository.consumeForRotation(refreshToken);

    if (tokenData.is_revoked) {
      logger.warn(
        { userId: tokenData.user_id, familyId: tokenData.family_id },
        'Refresh token reuse detected - revoking entire token family'
      );
      await refreshTokenRepository.revokeFamily(tokenData.family_id);
      throw new Error('Token reuse detected. Please login again.');
    }
    if (!consumed) {
      throw new Error('Invalid or expired refresh token');
    }

    // Get user
    const user = await userRepository.findById(consumed.user_id);
    if (!user) {
      throw new Error('User not found');
    }
    return issueSession(user, consumed.family_id);
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
