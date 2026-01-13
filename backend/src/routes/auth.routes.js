import express from 'express';
import { query } from '../database/connection.js';
import { BadRequestError } from '../middleware/errorHandler.js';
import { verifyKeycloakToken, syncUserFromKeycloak, recordLogin } from '../middleware/keycloak.middleware.js';

const router = express.Router();

// Keycloak callback endpoint - receives token from frontend after Keycloak login
// NOTE: No rate limiter on this endpoint - it's called during Keycloak init
// and the token itself provides sufficient security
router.post('/callback',
  async (req, res, next) => {
    try {
      const { token } = req.body;

      if (!token) {
        throw new BadRequestError('Token is required');
      }

      // Verify Keycloak token
      const decoded = await verifyKeycloakToken(token);

      // Sync user from Keycloak to PostgreSQL
      const user = await syncUserFromKeycloak(decoded, req);

      // Record login in PostgreSQL
      await recordLogin(user, decoded.sub, req);

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name
          },
          token // Return the Keycloak token
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get current user info
router.get('/me',
  async (req, res, next) => {
    try {
      // This will be protected by authenticate middleware
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'No token provided'
        });
      }

      const token = authHeader.substring(7);
      const decoded = await verifyKeycloakToken(token);
      const user = await syncUserFromKeycloak(decoded);

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Logout endpoint (client-side logout, backend records logout)
router.post('/logout',
  async (req, res, next) => {
    try {
      // Try to get user from token to record logout
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.substring(7);
          const decoded = await verifyKeycloakToken(token);
          
          // Update the most recent login record with logout timestamp
          const result = await query(
            `UPDATE login_records 
             SET logout_timestamp = CURRENT_TIMESTAMP,
                 session_duration = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - login_timestamp))::INTEGER
             WHERE keycloak_id = $1 
               AND logout_timestamp IS NULL
             ORDER BY login_timestamp DESC
             LIMIT 1`,
            [decoded.sub]
          );
        } catch (error) {
          // Ignore errors - logout should succeed even if recording fails
          console.error('Failed to record logout:', error);
        }
      }

      // Keycloak handles logout on its side
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get login history for current user
router.get('/login-history',
  async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'No token provided'
        });
      }

      const token = authHeader.substring(7);
      const decoded = await verifyKeycloakToken(token);
      
      // Get user from database
      const userResult = await query(
        'SELECT id FROM users WHERE keycloak_id = $1',
        [decoded.sub]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      const userId = userResult.rows[0].id;

      // Get login history (last 50 records)
      const historyResult = await query(
        `SELECT 
          id,
          login_timestamp,
          logout_timestamp,
          ip_address,
          user_agent,
          login_status,
          session_duration
         FROM login_records
         WHERE user_id = $1
         ORDER BY login_timestamp DESC
         LIMIT 50`,
        [userId]
      );

      res.json({
        success: true,
        data: {
          loginHistory: historyResult.rows
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as authRoutes };
