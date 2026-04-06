import express from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../database/connection.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { BadRequestError, NotFoundError } from '../middleware/errorHandler.js';

const router = express.Router();
router.use(authenticate);
router.use(apiLimiter);

router.get('/', async (req, res, next) => {
  try {
    const r = await query(
      `SELECT id, name, created_at, updated_at FROM sites WHERE user_id = $1 ORDER BY name ASC`,
      [req.user.id]
    );
    res.json({ success: true, data: r.rows });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/',
  [body('name').trim().isLength({ min: 1, max: 255 }).withMessage('name is required')],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) throw new BadRequestError('Validation failed', errors.array());

      const r = await query(
        `INSERT INTO sites (user_id, name) VALUES ($1, $2)
         RETURNING id, name, created_at, updated_at`,
        [req.user.id, req.body.name.trim()]
      );
      res.status(201).json({ success: true, data: r.rows[0] });
    } catch (e) {
      next(e);
    }
  }
);

router.patch(
  '/:id',
  [body('name').optional().trim().isLength({ min: 1, max: 255 })],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) throw new BadRequestError('Validation failed', errors.array());

      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) throw new BadRequestError('Invalid id');

      const exists = await query(`SELECT id FROM sites WHERE id = $1 AND user_id = $2`, [id, req.user.id]);
      if (exists.rows.length === 0) throw new NotFoundError('Site not found');

      if (req.body.name === undefined) throw new BadRequestError('No fields to update');

      const r = await query(
        `UPDATE sites SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3
         RETURNING id, name, created_at, updated_at`,
        [req.body.name.trim(), id, req.user.id]
      );
      res.json({ success: true, data: r.rows[0] });
    } catch (e) {
      next(e);
    }
  }
);

router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw new BadRequestError('Invalid id');

    const r = await query(`DELETE FROM sites WHERE id = $1 AND user_id = $2 RETURNING id`, [id, req.user.id]);
    if (r.rows.length === 0) throw new NotFoundError('Site not found');

    res.json({ success: true, message: 'Site deleted' });
  } catch (e) {
    next(e);
  }
});

export { router as sitesRoutes };
