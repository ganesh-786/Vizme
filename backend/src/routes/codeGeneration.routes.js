import express from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../database/connection.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { BadRequestError, NotFoundError } from '../middleware/errorHandler.js';
import { generateMinimalSnippet } from '../services/codeGenerator.service.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);
router.use(apiLimiter);

/**
 * POST /api/v1/code-generation
 * 
 * Generates minimal tracking snippet (Google Analytics style).
 * The snippet is only ~150 bytes and loads the full library from tracker.js.
 *
 * `api_key_id` is now optional — when omitted the user's primary
 * (user-level) API key is resolved automatically.  The generated snippet
 * covers ALL metric configurations for the user.
 */
router.post('/',
  [
    body('api_key_id').optional({ nullable: true }).isInt().withMessage('api_key_id must be an integer'),
    body('auto_track').optional().isBoolean(),
    body('custom_events').optional().isBoolean()
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new BadRequestError('Validation failed', errors.array());
      }

      const { api_key_id, auto_track = true, custom_events = true } = req.body;

      // ----- Resolve API key -------------------------------------------------
      let apiKeyRow;

      if (api_key_id) {
        // Explicit key ID provided — verify ownership
        const apiKeyResult = await query(
          'SELECT id, api_key FROM api_keys WHERE id = $1 AND user_id = $2 AND is_active = true',
          [api_key_id, req.user.id]
        );
        if (apiKeyResult.rows.length === 0) {
          throw new NotFoundError('API key not found or inactive');
        }
        apiKeyRow = apiKeyResult.rows[0];
      } else {
        // Auto-resolve: pick the user's primary user-level key
        const apiKeyResult = await query(
          `SELECT id, api_key FROM api_keys
           WHERE user_id = $1 AND metric_config_id IS NULL AND is_active = true
           ORDER BY created_at ASC LIMIT 1`,
          [req.user.id]
        );
        if (apiKeyResult.rows.length === 0) {
          throw new NotFoundError(
            'No active API key found. Please generate an API key first.'
          );
        }
        apiKeyRow = apiKeyResult.rows[0];
      }

      const apiKey = apiKeyRow.api_key;

      // ----- Fetch ALL metric configs (snippet covers everything) -----------
      const allConfigsResult = await query(
        'SELECT id, name, metric_name FROM metric_configs WHERE user_id = $1',
        [req.user.id]
      );

      // ----- Generate minimal snippet ----------------------------------------
      const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
      const code = generateMinimalSnippet({
        apiKey,
        baseUrl,
        autoTrack: auto_track,
        customEvents: custom_events
      });

      // ----- Mark onboarding complete (idempotent) --------------------------
      await query(
        `UPDATE users SET onboarding_completed_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND onboarding_completed_at IS NULL`,
        [req.user.id]
      );

      res.json({
        success: true,
        data: {
          code,
          apiKeyId: apiKeyRow.id,
          metricConfigs: allConfigsResult.rows.map(c => ({
            id: c.id,
            name: c.name,
            metric_name: c.metric_name
          })),
          note: 'This snippet covers ALL your metrics. The full library loads automatically from the server.'
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as codeGenerationRoutes };
