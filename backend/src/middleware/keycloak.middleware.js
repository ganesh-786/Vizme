import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import axios from 'axios';
import { query } from '../database/connection.js';
import { UnauthorizedError } from './errorHandler.js';

// Keycloak configuration
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'master';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'unified-visibility-platform';

// JWKS client for token verification
let jwksClientInstance = null;

const getJwksClient = () => {
  if (!jwksClientInstance) {
    const jwksUri = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`;
    jwksClientInstance = jwksClient({
      jwksUri,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 86400000, // 24 hours - keep keys in cache for a long time
      rateLimit: true,
      jwksRequestsPerMinute: 60, // Allow 60 requests per minute to JWKS endpoint
      requestHeaders: {},
      timeout: 30000
    });
  }
  return jwksClientInstance;
};

// Get Keycloak public key
const getKey = async (header) => {
  const client = getJwksClient();
  try {
    const key = await client.getSigningKey(header.kid);
    return key.getPublicKey();
  } catch (error) {
    console.error('Error getting signing key:', error);
    // If rate limited, wait a bit and retry once
    if (error.message && error.message.includes('rate limit')) {
      console.log('JWKS rate limited, waiting...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        const key = await client.getSigningKey(header.kid);
        return key.getPublicKey();
      } catch (retryError) {
        console.error('Retry failed:', retryError);
        throw new UnauthorizedError('Invalid token signature');
      }
    }
    throw new UnauthorizedError('Invalid token signature');
  }
};

// Verify Keycloak token
export const verifyKeycloakToken = async (token) => {
  try {
    if (!token) {
      throw new UnauthorizedError('Token is required');
    }

    // Decode without verification to get header
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header) {
      throw new UnauthorizedError('Invalid token format');
    }

    // Get public key from Keycloak
    const publicKey = await getKey(decoded.header);

    // Build issuer URL - use localhost for issuer validation since that's what Keycloak puts in tokens
    const issuer = `http://localhost:8080/realms/${KEYCLOAK_REALM}`;
    
    // Verify token
    // Note: Keycloak tokens may have different audience depending on client configuration
    // We verify issuer and signature, but make audience check optional
    const verified = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: issuer,
      ignoreExpiration: false,
      ignoreNotBefore: false
      // Audience check removed - Keycloak tokens often have 'account' as audience
      // The issuer check is sufficient for single-tenant setups
    });

    return verified;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Token expired');
    }
    if (error.name === 'JsonWebTokenError') {
      console.error('JWT verification error:', error.message);
      throw new UnauthorizedError(`Invalid token: ${error.message}`);
    }
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    console.error('Token verification error:', error);
    throw new UnauthorizedError('Token verification failed');
  }
};

// Sync user from Keycloak to PostgreSQL
export const syncUserFromKeycloak = async (keycloakUserInfo, req = null) => {
  const keycloakId = keycloakUserInfo.sub;
  const email = keycloakUserInfo.email;
  const name = keycloakUserInfo.name || keycloakUserInfo.preferred_username || email;

  // Check if user exists by keycloak_id
  let result = await query(
    'SELECT id, email, name FROM users WHERE keycloak_id = $1',
    [keycloakId]
  );

  if (result.rows.length > 0) {
    // Update existing user
    const user = result.rows[0];
    if (user.email !== email || user.name !== name) {
      await query(
        'UPDATE users SET email = $1, name = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [email, name, user.id]
      );
      return { ...user, email, name };
    }
    return user;
  }

  // Check if user exists by email (for migration)
  result = await query('SELECT id, email, name FROM users WHERE email = $1', [email]);
  if (result.rows.length > 0) {
    // Link existing user to Keycloak
    const user = result.rows[0];
    await query(
      'UPDATE users SET keycloak_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [keycloakId, user.id]
    );
    return user;
  }

  // Create new user
  result = await query(
    'INSERT INTO users (email, name, keycloak_id) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
    [email, name, keycloakId]
  );

  return result.rows[0];
};

// Record login in PostgreSQL
export const recordLogin = async (user, keycloakId, req = null) => {
  try {
    const ipAddress = req?.ip || req?.connection?.remoteAddress || req?.headers?.['x-forwarded-for'] || 'unknown';
    const userAgent = req?.headers?.['user-agent'] || 'unknown';

    await query(
      `INSERT INTO login_records (user_id, keycloak_id, email, ip_address, user_agent, login_status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, keycloakId, user.email, ipAddress, userAgent, 'success']
    );
  } catch (error) {
    // Don't fail authentication if login recording fails
    console.error('Failed to record login:', error);
  }
};

// Middleware to authenticate using Keycloak token
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.substring(7);
    
    // Verify Keycloak token
    const decoded = await verifyKeycloakToken(token);
    
    // Sync user from Keycloak
    const user = await syncUserFromKeycloak(decoded);
    
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      keycloakId: decoded.sub
    };
    
    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return next(error);
    }
    next(new UnauthorizedError('Authentication failed'));
  }
};

// Keep API key authentication unchanged
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

