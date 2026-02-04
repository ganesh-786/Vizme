import express from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../database/connection.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { BadRequestError, NotFoundError } from '../middleware/errorHandler.js';
import { generateMinimalSnippet } from '../services/codeGenerator.service.js';

const router = express.Router();

// All routes require Keycloak JWT authentication
router.use(...authenticate);
router.use(apiLimiter);

/**
 * POST /api/v1/code-generation
 * 
 * Generates minimal tracking snippet (Google Analytics style)
 * The snippet is only ~150 bytes and loads the full library from tracker.js
 */
router.post('/',
  [
    body('metric_config_id').optional().isInt(),
    body('api_key_id').isInt().withMessage('API key ID is required'),
    body('auto_track').optional().isBoolean(),
    body('custom_events').optional().isBoolean()
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new BadRequestError('Validation failed', errors.array());
      }

      const { metric_config_id, api_key_id, auto_track = true, custom_events = true } = req.body;

      // Verify API key ownership
      const apiKeyResult = await query(
        'SELECT api_key FROM api_keys WHERE id = $1 AND user_id = $2 AND is_active = true',
        [api_key_id, req.user.id]
      );

      if (apiKeyResult.rows.length === 0) {
        throw new NotFoundError('API key not found or inactive');
      }

      const apiKey = apiKeyResult.rows[0].api_key;

      // Get metric configs (for response metadata, not used in snippet)
      let metricConfigs = [];
      if (metric_config_id) {
        const configResult = await query(
          'SELECT * FROM metric_configs WHERE id = $1 AND user_id = $2',
          [metric_config_id, req.user.id]
        );
        if (configResult.rows.length === 0) {
          throw new NotFoundError('Metric config not found');
        }
        metricConfigs = configResult.rows;
      } else {
        // Get all metric configs for user
        const allConfigsResult = await query(
          'SELECT * FROM metric_configs WHERE user_id = $1',
          [req.user.id]
        );
        metricConfigs = allConfigsResult.rows;
      }

      // Generate minimal snippet (not full code anymore)
      const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
      const code = generateMinimalSnippet({
        apiKey,
        baseUrl,
        autoTrack: auto_track,
        customEvents: custom_events
      });

      res.json({
        success: true,
        data: {
          code,
          apiKeyId: api_key_id,
          metricConfigs: metricConfigs.map(c => ({
            id: c.id,
            name: c.name,
            metric_name: c.metric_name
          })),
          note: 'This is a minimal snippet. The full library loads automatically from the server.'
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as codeGenerationRoutes };
