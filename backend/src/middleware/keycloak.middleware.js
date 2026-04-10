/**
 * Keycloak OIDC Token Validation Middleware
 *
 * Validates Keycloak-issued JWTs by fetching the JWKS (public keys) from the
 * Keycloak server and verifying the token signature + standard claims.
 *
 * After validation the middleware resolves (or auto-creates) a local `users`
 * row so that `req.user` always contains the same `{ id, email, name }` shape
 * the rest of the application expects.
 *
 * ─── Environment variables used ───
 *   KEYCLOAK_URL            – e.g. http://keycloak:8080  (internal Docker URL for JWKS fetching)
 *   KEYCLOAK_ISSUER_URL     – e.g. http://localhost:8080 (public URL that appears in the token's `iss` claim)
 *                              Defaults to KEYCLOAK_URL if not set.
 *   KEYCLOAK_REALM          – e.g. unified-visibility
 *   KEYCLOAK_CLIENT_ID      – e.g. uv-backend  (used as expected `azp` / audience)
 *   KEYCLOAK_FRONTEND_CLIENT_ID – e.g. uv-frontend (also accepted as audience)
 */

import * as jose from 'jose';
import { query } from '../database/connection.js';
import { ForbiddenError, UnauthorizedError } from './errorHandler.js';
import { resolveTenantContextForUser } from '../services/tenant.service.js';

// ─── Configuration ──────────────────────────────────────────────────────────

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://keycloak:8080';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'unified-visibility';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'uv-backend';
const KEYCLOAK_FRONTEND_CLIENT_ID = process.env.KEYCLOAK_FRONTEND_CLIENT_ID || 'uv-frontend';

// In Docker, the backend reaches Keycloak via the internal hostname (e.g. http://keycloak:8080),
// but tokens are issued with the *public* URL (e.g. http://localhost:8080) in their `iss` claim.
// KEYCLOAK_ISSUER_URL lets you set the public-facing URL separately for issuer validation.
const KEYCLOAK_ISSUER_URL = process.env.KEYCLOAK_ISSUER_URL || KEYCLOAK_URL;

// The issuer that Keycloak tokens will have in the `iss` claim
const ISSUER = `${KEYCLOAK_ISSUER_URL}/realms/${KEYCLOAK_REALM}`;

// JWKS URI for fetching Keycloak's public signing keys (uses internal URL)
const JWKS_URI = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`;

// ─── JWKS Cache ─────────────────────────────────────────────────────────────
// `jose.createRemoteJWKSet` automatically fetches, caches, and rotates keys.
let jwks = null;

/**
 * Returns (and lazily creates) the remote JWKS keyset.
 * Separated into a function so we can re-create it if the Keycloak URL
 * ever changes at runtime (unlikely, but defensive).
 */
const getJWKS = () => {
  if (!jwks) {
    jwks = jose.createRemoteJWKSet(new URL(JWKS_URI), {
      cooldownDuration: 30_000,   // Don't re-fetch more than once per 30 s
      cacheMaxAge: 600_000,       // Cache keys for 10 minutes
    });
    console.log(`🔑 Keycloak JWKS endpoint: ${JWKS_URI}`);
    console.log(`🔑 Keycloak expected issuer: ${ISSUER}`);
  }
  return jwks;
};

// ─── Token Verification ─────────────────────────────────────────────────────

/**
 * Verify a Keycloak-issued JWT.
 *
 * @param {string} token  – Raw JWT string (without "Bearer " prefix)
 * @returns {object}       – The verified payload (claims)
 * @throws {UnauthorizedError} on any verification failure
 */
export const verifyKeycloakToken = async (token) => {
  try {
    const { payload } = await jose.jwtVerify(token, getJWKS(), {
      issuer: ISSUER,
      // Accept tokens issued to either the frontend or backend client
      audience: undefined, // Keycloak doesn't always set `aud`; we check `azp` below
    });

    // Keycloak sets `azp` (authorized party) to the client that requested the token.
    // Accept tokens from both the frontend and backend clients.
    const azp = payload.azp;
    if (azp && azp !== KEYCLOAK_CLIENT_ID && azp !== KEYCLOAK_FRONTEND_CLIENT_ID) {
      throw new Error(`Token was issued to unexpected client: ${azp}`);
    }

    return payload;
  } catch (error) {
    // Provide clear messages for common failure scenarios
    if (error.code === 'ERR_JWKS_NO_MATCHING_KEY') {
      throw new UnauthorizedError('Keycloak token signature could not be verified (key not found)');
    }
    if (error.code === 'ERR_JWT_EXPIRED') {
      throw new UnauthorizedError('Keycloak token has expired');
    }
    if (error.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') {
      throw new UnauthorizedError(`Keycloak token claim validation failed: ${error.message}`);
    }
    // Re-throw our own UnauthorizedError as-is
    if (error.name === 'UnauthorizedError') {
      throw error;
    }
    throw new UnauthorizedError(`Keycloak token validation failed: ${error.message}`);
  }
};

// ─── User Resolution ────────────────────────────────────────────────────────

/**
 * Given a verified Keycloak token payload, resolve or create the
 * corresponding local user row and return `{ id, email, name }`.
 *
 * Resolution order:
 *   1. Lookup by `keycloak_id` (fastest — direct mapping)
 *   2. Lookup by `email` (handles users who existed before Keycloak)
 *   3. Auto-create a new local user (for Keycloak-first registrations)
 *
 * If an existing user is found by email but has no `keycloak_id` yet,
 * the column is back-filled so future lookups use step 1.
 */
export const resolveLocalUser = async (keycloakPayload) => {
  const keycloakId = keycloakPayload.sub;  // Keycloak UUID
  const email = keycloakPayload.email;
  const name = keycloakPayload.name
    || keycloakPayload.preferred_username
    || keycloakPayload.given_name
    || null;

  if (!keycloakId) {
    throw new UnauthorizedError('Keycloak token missing "sub" claim');
  }
  if (!email) {
    throw new UnauthorizedError('Keycloak token missing "email" claim');
  }

  // 1. Fast path — lookup by keycloak_id
  const byKcId = await query(
    'SELECT id, email, name FROM users WHERE keycloak_id = $1',
    [keycloakId]
  );
  if (byKcId.rows.length > 0) {
    return byKcId.rows[0];
  }

  // 2. Lookup by email (pre-existing user, migration scenario)
  const byEmail = await query(
    'SELECT id, email, name FROM users WHERE email = $1',
    [email]
  );
  if (byEmail.rows.length > 0) {
    // Back-fill keycloak_id so future requests hit the fast path
    await query(
      'UPDATE users SET keycloak_id = $1, updated_at = NOW() WHERE id = $2',
      [keycloakId, byEmail.rows[0].id]
    );
    console.log(`🔗 Linked Keycloak user ${keycloakId} to existing local user ${byEmail.rows[0].id} (${email})`);
    return byEmail.rows[0];
  }

  // 3. Auto-create — user registered through Keycloak but has no local row yet
  //    We use a placeholder password_hash since auth is handled by Keycloak.
  const placeholder = '__keycloak_managed__';
  const created = await query(
    `INSERT INTO users (email, password_hash, name, keycloak_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, name`,
    [email, placeholder, name, keycloakId]
  );
  console.log(`✨ Auto-created local user ${created.rows[0].id} for Keycloak user ${keycloakId} (${email})`);
  return created.rows[0];
};

// ─── Express Middleware ─────────────────────────────────────────────────────

/**
 * Express middleware that validates a Keycloak Bearer token, resolves the
 * local user, and sets `req.user` and `req.keycloakPayload`.
 *
 * Usage:
 *   import { authenticateKeycloak } from './keycloak.middleware.js';
 *   router.get('/protected', authenticateKeycloak, handler);
 */
export const authenticateKeycloak = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.substring(7);

    // Verify the token against Keycloak's JWKS
    const payload = await verifyKeycloakToken(token);

    // Resolve or create the local user
    const user = await resolveLocalUser(payload);

    // Attach to request — same shape the rest of the app expects
    req.user = user;
    const requestedTenant = req.headers['x-tenant-id'];
    const tenant = await resolveTenantContextForUser(user.id, requestedTenant);
    req.tenant = tenant;

    // Also attach the raw Keycloak payload for role checks, etc.
    req.keycloakPayload = payload;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Utility: extract realm roles from a Keycloak token payload.
 * Returns an array of role name strings, e.g. ["user", "admin"].
 */
export const getKeycloakRoles = (payload) => {
  return payload?.realm_access?.roles || [];
};

/**
 * Extract client roles for a given Keycloak client id from the token payload.
 * @param {object} payload  Verified JWT payload
 * @param {string} clientId  e.g. uv-backend (same as KEYCLOAK_CLIENT_ID)
 * @returns {string[]}
 */
export const getKeycloakClientRoles = (payload, clientId) => {
  if (!clientId || !payload?.resource_access) return [];
  const entry = payload.resource_access[clientId];
  return entry?.roles || [];
};

export const hasRealmRole = (payload, role) => {
  return getKeycloakRoles(payload).includes(role);
};

export const hasClientRole = (payload, clientId, role) => {
  return getKeycloakClientRoles(payload, clientId).includes(role);
};

/** True if realm PLATFORM_ADMIN or client API_ADMIN on the configured backend client. */
export const isPlatformAdmin = (payload) => {
  return hasRealmRole(payload, 'PLATFORM_ADMIN')
    || hasClientRole(payload, KEYCLOAK_CLIENT_ID, 'API_ADMIN');
};

/**
 * Middleware factory: require one or more Keycloak realm roles.
 * Must be used AFTER `authenticateKeycloak` (needs `req.keycloakPayload`).
 * Missing roles → 403 Forbidden (authenticated but not allowed).
 *
 * Usage:
 *   router.get('/admin', authenticateKeycloak, requireRole('PLATFORM_ADMIN'), handler);
 */
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.keycloakPayload) {
      return next(new UnauthorizedError('Authentication required'));
    }
    const userRoles = getKeycloakRoles(req.keycloakPayload);
    const hasRole = roles.some((r) => userRoles.includes(r));
    if (!hasRole) {
      return next(new ForbiddenError(`Required realm role(s): ${roles.join(', ')}`));
    }
    next();
  };
};

/**
 * Middleware factory: require at least one of the given client roles for `clientId`.
 * Must be used AFTER `authenticateKeycloak`.
 *
 * Usage:
 *   router.get('/x', authenticateKeycloak, requireClientRole(KEYCLOAK_CLIENT_ID, 'API_USER'), handler);
 */
export const requireClientRole = (clientId, ...clientRoles) => {
  return (req, res, next) => {
    if (!req.keycloakPayload) {
      return next(new UnauthorizedError('Authentication required'));
    }
    const userRoles = getKeycloakClientRoles(req.keycloakPayload, clientId);
    const hasRole = clientRoles.some((r) => userRoles.includes(r));
    if (!hasRole) {
      return next(
        new ForbiddenError(`Required client role(s) on ${clientId}: ${clientRoles.join(', ')}`)
      );
    }
    next();
  };
};

/**
 * Shorthand for client roles on the backend Keycloak client (KEYCLOAK_CLIENT_ID).
 * Prefer this on routes so callers do not repeat the client id.
 */
export const requireBackendClientRole = (...clientRoles) =>
  requireClientRole(KEYCLOAK_CLIENT_ID, ...clientRoles);
