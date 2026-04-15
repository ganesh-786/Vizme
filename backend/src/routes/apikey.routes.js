import express from 'express';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import { query } from '../database/connection.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { BadRequestError, NotFoundError } from '../middleware/errorHandler.js';
import { ensureSiteOwnedByUser } from '../services/dashboardWidget.service.js';
import { sha256 } from '../utils/crypto.js';

const router = express.Router();

router.use(authenticate);
router.use(apiLimiter);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a cryptographically-random API key prefixed with `mk_`. */
const generateApiKey = () => {
  return `mk_${crypto.randomBytes(32).toString('hex')}`;
};

const KEY_PREFIX_LENGTH = 10;

// ---------------------------------------------------------------------------
// GET / — List all API keys for the authenticated user (masked, never raw)
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, key_name, key_prefix, metric_config_id, site_id, is_active, created_at, updated_at
       FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );

    const data = result.rows.map((row) => ({
      ...row,
      masked_key: row.key_prefix ? `${row.key_prefix}••••••••` : 'mk_••••••••••••',
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
// GET /user-key — Return the authenticated user's primary (user-level) API
//                 key.  This is the single key that covers ALL metric configs.
//                 Returns masked key only (raw key is shown once at creation).
// ---------------------------------------------------------------------------
router.get('/user-key', async (req, res, next) => {
  try {
    const existing = await query(
      `SELECT id, key_name, key_prefix, site_id, is_active, created_at, updated_at
       FROM api_keys
       WHERE user_id = $1
         AND metric_config_id IS NULL
         AND site_id IS NULL
         AND is_active = true
       ORDER BY created_at ASC
       LIMIT 1`,
      [req.user.id]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return res.json({
        success: true,
        data: {
          ...row,
          masked_key: row.key_prefix ? `${row.key_prefix}••••••••` : 'mk_••••••••••••',
        },
        has_key: true,
      });
    }

    res.json({
      success: true,
      data: null,
      has_key: false,
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /ensure — Idempotent: return existing user-level key or create one.
//                Raw key is returned ONLY on creation.
//
//                Industry-standard model: ONE key per user that covers all
//                current and future metric configurations automatically.
// ---------------------------------------------------------------------------
router.post('/ensure', async (req, res, next) => {
  try {
    const existing = await query(
      `SELECT id, key_name, key_prefix, site_id, is_active, created_at, updated_at
       FROM api_keys
       WHERE user_id = $1
         AND metric_config_id IS NULL
         AND site_id IS NULL
         AND is_active = true
       ORDER BY created_at ASC
       LIMIT 1`,
      [req.user.id]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return res.json({
        success: true,
        data: {
          ...row,
          masked_key: row.key_prefix ? `${row.key_prefix}••••••••` : 'mk_••••••••••••',
        },
        is_new: false,
      });
    }

    const rawKey = generateApiKey();
    const keyName = 'Account API Key';
    const keyHash = sha256(rawKey);
    const keyPrefix = rawKey.substring(0, KEY_PREFIX_LENGTH);

    let result;
    try {
      result = await query(
        `INSERT INTO api_keys (user_id, key_name, api_key, key_prefix, metric_config_id)
         VALUES ($1, $2, $3, $4, NULL)
         RETURNING id, key_name, key_prefix, is_active, created_at`,
        [req.user.id, keyName, keyHash, keyPrefix]
      );
    } catch (err) {
      if (err.code === '23505') {
        const retry = await query(
          `SELECT id, key_name, key_prefix, site_id, is_active, created_at, updated_at
           FROM api_keys
           WHERE user_id = $1
             AND metric_config_id IS NULL
             AND site_id IS NULL
             AND is_active = true
           ORDER BY created_at ASC
           LIMIT 1`,
          [req.user.id]
        );
        const row = retry.rows[0];
        return res.json({
          success: true,
          data: {
            ...row,
            masked_key: row.key_prefix ? `${row.key_prefix}••••••••` : 'mk_••••••••••••',
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
        api_key: rawKey,
        masked_key: `${newRow.key_prefix}••••••••`,
        is_active: newRow.is_active,
        created_at: newRow.created_at,
      },
      is_new: true,
      message:
        'API key created. Store it now — it will not be shown again.',
    });
  } catch (error) {
    next(error);
  }
});

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
    body('site_id').optional({ nullable: true }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new BadRequestError('Validation failed', errors.array());
      }

      const { key_name } = req.body;
      let siteId = null;
      if (req.body.site_id != null && req.body.site_id !== '') {
        const sid = parseInt(String(req.body.site_id), 10);
        if (Number.isNaN(sid)) throw new BadRequestError('Invalid site_id');
        const ok = await ensureSiteOwnedByUser(sid, req.user.id);
        if (!ok) throw new BadRequestError('site_id not found');
        siteId = sid;
      }

      const rawKey = generateApiKey();
      const keyHash = sha256(rawKey);
      const keyPrefix = rawKey.substring(0, KEY_PREFIX_LENGTH);

      const result = await query(
        'INSERT INTO api_keys (user_id, key_name, api_key, key_prefix, site_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, key_name, key_prefix, site_id, is_active, created_at',
        [req.user.id, key_name, keyHash, keyPrefix, siteId]
      );

      const newRow = result.rows[0];

      res.status(201).json({
        success: true,
        data: {
          ...newRow,
          api_key: rawKey,
          masked_key: `${newRow.key_prefix}••••••••`,
        },
        message:
          'API key created. Store it securely — it will not be shown again.',
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /:id/copy is intentionally removed — hashed keys cannot be retrieved.
// Raw keys are shown only once at creation time.

// ---------------------------------------------------------------------------
// PATCH /:id — Update API key (name or active status)
// ---------------------------------------------------------------------------
router.patch(
  '/:id',
  [
    body('key_name').optional().trim().isLength({ min: 1, max: 255 }),
    body('is_active').optional().isBoolean(),
    body('site_id').optional({ nullable: true }),
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

      if (req.body.site_id !== undefined) {
        let siteId = null;
        if (req.body.site_id != null && req.body.site_id !== '') {
          const sid = parseInt(String(req.body.site_id), 10);
          if (Number.isNaN(sid)) throw new BadRequestError('Invalid site_id');
          const ok = await ensureSiteOwnedByUser(sid, req.user.id);
          if (!ok) throw new BadRequestError('site_id not found');
          siteId = sid;
        }
        updates.push(`site_id = $${paramCount++}`);
        values.push(siteId);
      }

      if (updates.length === 0) {
        throw new BadRequestError('No fields to update');
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id, req.user.id);

      const whereClause = `WHERE id = $${paramCount++} AND user_id = $${paramCount++}`;
      const result = await query(
        `UPDATE api_keys SET ${updates.join(', ')} ${whereClause} RETURNING id, key_name, site_id, is_active, updated_at`,
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
