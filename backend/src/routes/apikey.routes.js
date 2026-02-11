import express from 'express';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import { query } from '../database/connection.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { BadRequestError, NotFoundError } from '../middleware/errorHandler.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);
router.use(apiLimiter);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a cryptographically-random API key prefixed with `mk_`. */
const generateApiKey = () => {
  return `mk_${crypto.randomBytes(32).toString('hex')}`;
};

/**
 * Return a masked representation of an API key suitable for display.
 * Only the first 7 characters are kept; the rest is replaced with dots.
 */
const maskApiKey = (key) => {
  if (!key) return '';
  return `${key.substring(0, 7)}${'••••••••••••'}`;
};

// ---------------------------------------------------------------------------
// GET / — List all API keys for the authenticated user (masked, never raw)
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, key_name, metric_config_id, is_active, created_at, updated_at
       FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );

    // Attach a masked representation; raw key is never returned in list.
    const data = result.rows.map((row) => ({
      ...row,
      masked_key: 'mk_••••••••••••', // constant mask — no partial leak
    }));

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /ensure — Idempotent: return existing key or create one for a given
//                metric configuration.  Raw key is returned ONLY on creation.
// ---------------------------------------------------------------------------
router.post(
  '/ensure',
  [
    body('metric_config_id')
      .optional({ nullable: true })
      .isInt()
      .withMessage('metric_config_id must be an integer'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new BadRequestError('Validation failed', errors.array());
      }

      const metricConfigId = req.body.metric_config_id ?? null;

      // If metric_config_id supplied, verify ownership
      let configName = 'Default Key';
      if (metricConfigId) {
        const configCheck = await query(
          'SELECT id, name FROM metric_configs WHERE id = $1 AND user_id = $2',
          [metricConfigId, req.user.id]
        );
        if (configCheck.rows.length === 0) {
          throw new NotFoundError('Metric config not found');
        }
        configName = configCheck.rows[0].name;
      }

      // Look for an existing active key for this (user, metric_config) pair.
      // `IS NOT DISTINCT FROM` handles both NULL and non-NULL correctly.
      const existing = await query(
        `SELECT id, key_name, metric_config_id, is_active, created_at, updated_at
         FROM api_keys
         WHERE user_id = $1
           AND (metric_config_id IS NOT DISTINCT FROM $2)
           AND is_active = true
         LIMIT 1`,
        [req.user.id, metricConfigId]
      );

      if (existing.rows.length > 0) {
        return res.json({
          success: true,
          data: {
            ...existing.rows[0],
            masked_key: 'mk_••••••••••••',
          },
          is_new: false,
        });
      }

      // ---- No existing key — generate one --------------------------------
      const apiKey = generateApiKey();
      const keyName = metricConfigId ? configName : 'Default Key';

      let result;
      try {
        result = await query(
          `INSERT INTO api_keys (user_id, key_name, api_key, metric_config_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id, key_name, api_key, metric_config_id, is_active, created_at`,
          [req.user.id, keyName, apiKey, metricConfigId]
        );
      } catch (err) {
        // Handle race condition: unique constraint violation means another
        // concurrent request already created the key — just return it.
        if (err.code === '23505') {
          const retry = await query(
            `SELECT id, key_name, metric_config_id, is_active, created_at, updated_at
             FROM api_keys
             WHERE user_id = $1
               AND (metric_config_id IS NOT DISTINCT FROM $2)
               AND is_active = true
             LIMIT 1`,
            [req.user.id, metricConfigId]
          );
          return res.json({
            success: true,
            data: {
              ...retry.rows[0],
              masked_key: 'mk_••••••••••••',
            },
            is_new: false,
          });
        }
        throw err;
      }

      const newRow = result.rows[0];

      res.status(201).json({
        success: true,
        data: {
          id: newRow.id,
          key_name: newRow.key_name,
          api_key: newRow.api_key, // returned ONLY this one time
          masked_key: maskApiKey(newRow.api_key),
          metric_config_id: newRow.metric_config_id,
          is_active: newRow.is_active,
          created_at: newRow.created_at,
        },
        is_new: true,
        message:
          'API key created and copied to your clipboard. It will be masked from now on.',
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST / — Manual key creation (existing flow, now also returns masked_key)
// ---------------------------------------------------------------------------
router.post(
  '/',
  [
    body('key_name')
      .trim()
      .isLength({ min: 1, max: 255 })
      .withMessage('Key name is required'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new BadRequestError('Validation failed', errors.array());
      }

      const { key_name } = req.body;
      const apiKey = generateApiKey();

      const result = await query(
        'INSERT INTO api_keys (user_id, key_name, api_key) VALUES ($1, $2, $3) RETURNING id, key_name, api_key, is_active, created_at',
        [req.user.id, key_name, apiKey]
      );

      const newRow = result.rows[0];

      res.status(201).json({
        success: true,
        data: {
          ...newRow,
          masked_key: maskApiKey(newRow.api_key),
        },
        message:
          'API key created successfully. Store it securely — it will not be shown again.',
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /:id/copy — Return the raw API key for clipboard copy only.
//                   The frontend must NEVER render this value in the DOM.
// ---------------------------------------------------------------------------
router.post('/:id/copy', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT api_key FROM api_keys WHERE id = $1 AND user_id = $2 AND is_active = true',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('API key not found or inactive');
    }

    res.json({
      success: true,
      data: { api_key: result.rows[0].api_key },
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// PATCH /:id — Update API key (name or active status)
// ---------------------------------------------------------------------------
router.patch(
  '/:id',
  [
    body('key_name').optional().trim().isLength({ min: 1, max: 255 }),
    body('is_active').optional().isBoolean(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new BadRequestError('Validation failed', errors.array());
      }

      const { id } = req.params;
      const { key_name, is_active } = req.body;

      // Verify ownership
      const existing = await query(
        'SELECT id FROM api_keys WHERE id = $1 AND user_id = $2',
        [id, req.user.id]
      );

      if (existing.rows.length === 0) {
        throw new NotFoundError('API key not found');
      }

      // Build update query
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (key_name !== undefined) {
        updates.push(`key_name = $${paramCount++}`);
        values.push(key_name);
      }

      if (is_active !== undefined) {
        updates.push(`is_active = $${paramCount++}`);
        values.push(is_active);
      }

      if (updates.length === 0) {
        throw new BadRequestError('No fields to update');
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id, req.user.id);

      const whereClause = `WHERE id = $${paramCount++} AND user_id = $${paramCount++}`;
      const result = await query(
        `UPDATE api_keys SET ${updates.join(', ')} ${whereClause} RETURNING id, key_name, is_active, updated_at`,
        values
      );

      res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /:id — Revoke / delete API key
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM api_keys WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('API key not found');
    }

    res.json({
      success: true,
      message: 'API key deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export { router as apiKeyRoutes };
