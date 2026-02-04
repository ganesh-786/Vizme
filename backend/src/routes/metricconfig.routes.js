import express from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../database/connection.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { BadRequestError, NotFoundError } from '../middleware/errorHandler.js';

const router = express.Router();

// Get metric configs by API key (for client library)
// This allows the library to automatically fetch configs
router.get('/by-api-key',
  async (req, res, next) => {
    try {
      const apiKey = req.headers['x-api-key'] || req.query.api_key;
      
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          error: 'API key required'
        });
      }

      // Verify API key and get user_id
      const apiKeyResult = await query(
        'SELECT user_id FROM api_keys WHERE api_key = $1 AND is_active = true',
        [apiKey]
      );

      if (apiKeyResult.rows.length === 0) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or inactive API key'
        });
      }

      const userId = apiKeyResult.rows[0].user_id;

      // Get all metric configurations for this user
      const result = await query(
        'SELECT metric_name, metric_type, labels FROM metric_configs WHERE user_id = $1',
        [userId]
      );

      // Convert to the format the library expects
      const configs = {};
      result.rows.forEach(config => {
        if (config.metric_name) {
          // Convert labels array to object format
          let labelsObj = {};
          if (config.labels && Array.isArray(config.labels)) {
            config.labels.forEach(label => {
              if (label && label.name) {
                labelsObj[label.name] = label.value || '';
              }
            });
          } else if (config.labels && typeof config.labels === 'object' && !Array.isArray(config.labels)) {
            labelsObj = config.labels;
          }
          
          configs[config.metric_name] = {
            type: config.metric_type,
            labels: labelsObj
          };
        }
      });

      res.json({
        success: true,
        data: configs
      });
    } catch (error) {
      next(error);
    }
  }
);

// All routes require authentication
router.use(authenticate);
router.use(apiLimiter);

const METRIC_TYPES = ['counter', 'gauge', 'histogram', 'summary'];

// Get all metric configs for user
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, name, description, metric_type, metric_name, labels, help_text, created_at, updated_at FROM metric_configs WHERE user_id = $1 ORDER BY created_at DESC',
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

// Get single metric config
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT id, name, description, metric_type, metric_name, labels, help_text, created_at, updated_at FROM metric_configs WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Metric config not found');
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});


// Create metric config
router.post('/',
  [
    body('name').trim().isLength({ min: 1, max: 255 }).withMessage('Name is required'),
    body('metric_type').isIn(METRIC_TYPES).withMessage(`Metric type must be one of: ${METRIC_TYPES.join(', ')}`),
    body('metric_name').trim().isLength({ min: 1, max: 255 }).matches(/^[a-zA-Z_:][a-zA-Z0-9_:]*$/).withMessage('Metric name must be valid (alphanumeric, underscore, colon)'),
    body('description').optional().trim(),
    body('help_text').optional().trim(),
    body('labels').optional().isArray().withMessage('Labels must be an array'),
    body('labels.*.name').optional().trim().isLength({ min: 1 }),
    body('labels.*.value').optional().trim()
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new BadRequestError('Validation failed', errors.array());
      }

      const { name, description, metric_type, metric_name, labels, help_text } = req.body;

      // Validate metric name format (Prometheus naming convention)
      if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(metric_name)) {
        throw new BadRequestError('Invalid metric name format');
      }

      const result = await query(
        `INSERT INTO metric_configs (user_id, name, description, metric_type, metric_name, labels, help_text)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, description, metric_type, metric_name, labels, help_text, created_at, updated_at`,
        [req.user.id, name, description || null, metric_type, metric_name, JSON.stringify(labels || []), help_text || null]
      );

      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        throw new BadRequestError('Metric name already exists for this user');
      }
      next(error);
    }
  }
);

// Update metric config
router.patch('/:id',
  [
    body('name').optional().trim().isLength({ min: 1, max: 255 }),
    body('description').optional().trim(),
    body('help_text').optional().trim(),
    body('labels').optional().isArray(),
    body('labels.*.name').optional().trim().isLength({ min: 1 }),
    body('labels.*.value').optional().trim()
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new BadRequestError('Validation failed', errors.array());
      }

      const { id } = req.params;
      const { name, description, help_text, labels } = req.body;

      // Verify ownership
      const existing = await query(
        'SELECT id FROM metric_configs WHERE id = $1 AND user_id = $2',
        [id, req.user.id]
      );

      if (existing.rows.length === 0) {
        throw new NotFoundError('Metric config not found');
      }

      // Build update query
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramCount++}`);
        values.push(name);
      }

      if (description !== undefined) {
        updates.push(`description = $${paramCount++}`);
        values.push(description);
      }

      if (help_text !== undefined) {
        updates.push(`help_text = $${paramCount++}`);
        values.push(help_text);
      }

      if (labels !== undefined) {
        updates.push(`labels = $${paramCount++}`);
        values.push(JSON.stringify(labels));
      }

      if (updates.length === 0) {
        throw new BadRequestError('No fields to update');
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id, req.user.id);

      const whereClause = `WHERE id = $${paramCount++} AND user_id = $${paramCount++}`;
      const result = await query(
        `UPDATE metric_configs SET ${updates.join(', ')} ${whereClause} RETURNING id, name, description, metric_type, metric_name, labels, help_text, created_at, updated_at`,
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

// Delete metric config
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM metric_configs WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Metric config not found');
    }

    res.json({
      success: true,
      message: 'Metric config deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

export { router as metricConfigRoutes };
