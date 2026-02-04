/**
 * Keycloak-based authentication middleware.
 * Validates Keycloak-issued access tokens (JWKS) and resolves/creates app user by keycloak_sub.
 * No local passwords; identity is fully delegated to Keycloak.
 */
import { auth } from 'express-oauth2-jwt-bearer';
import { query } from '../database/connection.js';
import { UnauthorizedError } from './errorHandler.js';

const KEYCLOAK_ISSUER_URI = process.env.KEYCLOAK_ISSUER_URI;
/** When set (e.g. in Docker), backend fetches JWKS from this URL (reachable from container). Token iss still must match KEYCLOAK_ISSUER_URI. */
const KEYCLOAK_INTERNAL_ISSUER_URI = process.env.KEYCLOAK_INTERNAL_ISSUER_URI;
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'metrics-client';
// express-oauth2-jwt-bearer requires audience. Keycloak may put client_id or "account" in aud.
const KEYCLOAK_AUDIENCE = process.env.KEYCLOAK_AUDIENCE;
const audienceList = KEYCLOAK_AUDIENCE
  ? [KEYCLOAK_AUDIENCE]
  : [KEYCLOAK_CLIENT_ID, 'account'];

const authOptions = {
  audience: audienceList,
  tokenSigningAlg: 'RS256',
};
if (KEYCLOAK_INTERNAL_ISSUER_URI) {
  authOptions.issuer = KEYCLOAK_ISSUER_URI?.replace(/\/$/, '');
  authOptions.jwksUri = `${KEYCLOAK_INTERNAL_ISSUER_URI.replace(/\/$/, '')}/protocol/openid-connect/certs`;
} else {
  authOptions.issuerBaseURL = KEYCLOAK_ISSUER_URI;
}
const validateKeycloakJwt = auth(authOptions);

/**
 * Resolve app user from Keycloak token payload.
 * Finds user by keycloak_sub (token 'sub' claim); creates one on first login.
 * Sets req.user = { id, email, name } (local users.id for FK consistency).
 */
export const resolveUserFromToken = async (req, res, next) => {
  try {
    if (!req.auth?.payload) {
      throw new UnauthorizedError('Invalid or missing token');
    }
    const payload = req.auth.payload;
    const keycloakSub = payload.sub; // Keycloak user ID (UUID)
    const email = payload.email || payload.preferred_username || null;
    const name = payload.name || [payload.given_name, payload.family_name].filter(Boolean).join(' ') || null;

    if (!keycloakSub) {
      throw new UnauthorizedError('Token missing subject');
    }

    let result = await query(
      'SELECT id, email, name FROM users WHERE keycloak_sub = $1',
      [keycloakSub]
    );

    if (result.rows.length === 0) {
      // First login: create app user linked to Keycloak (no password)
      result = await query(
        `INSERT INTO users (keycloak_sub, email, name) VALUES ($1, $2, $3)
         ON CONFLICT (keycloak_sub) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, updated_at = CURRENT_TIMESTAMP
         RETURNING id, email, name`,
        [keycloakSub, email || `keycloak-${keycloakSub}`, name]
      );
    }

    if (result.rows.length === 0) {
      throw new UnauthorizedError('User not found');
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Protect routes with Keycloak JWT + app user resolution.
 * Use this where you previously used authenticate (Bearer token required).
 */
export const authenticate = [validateKeycloakJwt, resolveUserFromToken];

/**
 * API key authentication (unchanged): for server-to-server / tracking scripts.
 * Still resolves req.user from api_keys join users (local users.id).
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
