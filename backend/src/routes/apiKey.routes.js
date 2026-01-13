import express from 'express';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import { query } from '../database/connection.js';
import { authenticate } from '../middleware/keycloak.middleware.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { BadRequestError, NotFoundError } from '../middleware/errorHandler.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);
router.use(apiLimiter);

// Generate API key
const generateApiKey = () => {
  return `mk_${crypto.randomBytes(32).toString('hex')}`;
};

// Get all API keys for user
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, key_name, api_key, is_active, created_at, updated_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// Create new API key
router.post('/',
  [
    body('key_name').trim().isLength({ min: 1, max: 255 }).withMessage('Key name is required')
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

      res.status(201).json({
        success: true,
        data: result.rows[0],
        message: 'API key created successfully. Store it securely - it will not be shown again.'
      });
    } catch (error) {
      next(error);
    }
  }
);

// Update API key (name or active status)
router.patch('/:id',
  [
    body('key_name').optional().trim().isLength({ min: 1, max: 255 }),
    body('is_active').optional().isBoolean()
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
        data: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

// Delete API key
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
      message: 'API key deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

export { router as apiKeyRoutes };

