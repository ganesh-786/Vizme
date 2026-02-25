/**
 * Authentication Middleware — Keycloak-Only (Step 5 Cutover)
 *
 * All user authentication is via Keycloak OIDC tokens. Legacy JWT and
 * dual-auth support have been removed.
 *
 * The `authenticateApiKey` middleware is unchanged — API key auth remains
 * independent (metrics ingestion, tracker.js, by-api-key).
 */

import { query } from '../database/connection.js';
import { UnauthorizedError } from './errorHandler.js';
import { authenticateKeycloak } from './keycloak.middleware.js';

// Re-export Keycloak middleware as the single authenticate middleware
export const authenticate = authenticateKeycloak;

// ─── API Key Authentication (unchanged) ─────────────────────────────────

/**
 * API key authentication — independent of user auth.
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
