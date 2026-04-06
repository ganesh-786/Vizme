import express from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../database/connection.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { BadRequestError, NotFoundError } from '../middleware/errorHandler.js';
import {
  assertSafeMetricName,
  ensureSiteOwnedByUser,
} from '../services/dashboardWidget.service.js';

const router = express.Router();
router.use(authenticate);
router.use(apiLimiter);

const QUERY_KINDS = ['increase_24h', 'max_latest', 'custom'];
const FORMATS = ['currency', 'number', 'percent', 'integer'];

router.get('/', async (req, res, next) => {
  try {
    const siteId = req.query.site_id;
    let sql =
      `SELECT id, user_id, site_id, metric_name, query_kind, promql_custom, title, subtitle,
              section, sort_order, format, currency_code, include_in_multi_chart, featured_chart,
              created_at, updated_at
       FROM dashboard_widgets WHERE user_id = $1`;
    const params = [req.user.id];
    if (siteId === 'null' || siteId === '') {
      sql += ` AND site_id IS NULL`;
    } else if (siteId != null && siteId !== undefined && siteId !== '') {
      const sid = parseInt(String(siteId), 10);
      if (Number.isNaN(sid)) throw new BadRequestError('Invalid site_id');
      params.push(sid);
      sql += ` AND site_id = $${params.length}`;
    }
    sql += ` ORDER BY section ASC, sort_order ASC, id ASC`;

    const r = await query(sql, params);
    res.json({ success: true, data: r.rows });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw new BadRequestError('Invalid id');

    const r = await query(
      `SELECT id, user_id, site_id, metric_name, query_kind, promql_custom, title, subtitle,
              section, sort_order, format, currency_code, include_in_multi_chart, featured_chart,
              created_at, updated_at
       FROM dashboard_widgets WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );
    if (r.rows.length === 0) throw new NotFoundError('Widget not found');
    res.json({ success: true, data: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/',
  [
    body('metric_name').trim().isLength({ min: 1, max: 255 }),
    body('query_kind').isIn(QUERY_KINDS),
    body('title').trim().isLength({ min: 1, max: 255 }),
    body('subtitle').optional().isString(),
    body('section').optional().trim().isLength({ max: 100 }),
    body('sort_order').optional().isInt(),
    body('format').optional().isIn(FORMATS),
    body('currency_code').optional().trim().isLength({ min: 1, max: 10 }),
    body('include_in_multi_chart').optional().isBoolean(),
    body('featured_chart').optional().isBoolean(),
    body('promql_custom').optional().isString(),
    body('site_id').optional({ nullable: true }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) throw new BadRequestError('Validation failed', errors.array());

      assertSafeMetricName(req.body.metric_name);

      const { query_kind, promql_custom } = req.body;
      if (query_kind === 'custom' && (!promql_custom || !String(promql_custom).trim())) {
        throw new BadRequestError('promql_custom required when query_kind is custom');
      }

      let siteId = null;
      if (req.body.site_id != null && req.body.site_id !== '') {
        const sid = parseInt(String(req.body.site_id), 10);
        const ok = await ensureSiteOwnedByUser(sid, req.user.id);
        if (!ok) throw new BadRequestError('site_id not found');
        siteId = sid;
      }

      const r = await query(
        `INSERT INTO dashboard_widgets (
           user_id, site_id, metric_name, query_kind, promql_custom, title, subtitle, section, sort_order,
           format, currency_code, include_in_multi_chart, featured_chart
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id, user_id, site_id, metric_name, query_kind, promql_custom, title, subtitle,
                   section, sort_order, format, currency_code, include_in_multi_chart, featured_chart,
                   created_at, updated_at`,
        [
          req.user.id,
          siteId,
          req.body.metric_name.trim(),
          query_kind,
          query_kind === 'custom' ? promql_custom.trim() : null,
          req.body.title.trim(),
          req.body.subtitle ?? null,
          req.body.section ?? 'primary',
          req.body.sort_order ?? 0,
          req.body.format ?? 'number',
          (req.body.currency_code ?? 'USD').trim(),
          req.body.include_in_multi_chart ?? false,
          req.body.featured_chart ?? false,
        ]
      );
      res.status(201).json({ success: true, data: r.rows[0] });
    } catch (e) {
      next(e);
    }
  }
);

router.patch(
  '/:id',
  [
    body('metric_name').optional().trim().isLength({ min: 1, max: 255 }),
    body('query_kind').optional().isIn(QUERY_KINDS),
    body('title').optional().trim().isLength({ min: 1, max: 255 }),
    body('subtitle').optional(),
    body('section').optional().trim().isLength({ max: 100 }),
    body('sort_order').optional().isInt(),
    body('format').optional().isIn(FORMATS),
    body('currency_code').optional().trim().isLength({ min: 1, max: 10 }),
    body('include_in_multi_chart').optional().isBoolean(),
    body('featured_chart').optional().isBoolean(),
    body('promql_custom').optional().isString(),
    body('site_id').optional().custom((v) => v === null || v === undefined || Number.isInteger(v) || /^\d+$/.test(String(v))),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) throw new BadRequestError('Validation failed', errors.array());

      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) throw new BadRequestError('Invalid id');

      const existing = await query(
        `SELECT id, query_kind FROM dashboard_widgets WHERE id = $1 AND user_id = $2`,
        [id, req.user.id]
      );
      if (existing.rows.length === 0) throw new NotFoundError('Widget not found');

      if (req.body.metric_name) assertSafeMetricName(req.body.metric_name);

      const updates = [];
      const values = [];
      let n = 1;

      const fields = [
        'metric_name',
        'query_kind',
        'promql_custom',
        'title',
        'subtitle',
        'section',
        'sort_order',
        'format',
        'currency_code',
        'include_in_multi_chart',
        'featured_chart',
      ];

      for (const f of fields) {
        if (req.body[f] !== undefined) {
          updates.push(`${f} = $${n++}`);
          values.push(req.body[f]);
        }
      }

      if (req.body.site_id !== undefined) {
        let siteId = null;
        if (req.body.site_id != null && req.body.site_id !== '') {
          const sid = parseInt(String(req.body.site_id), 10);
          const ok = await ensureSiteOwnedByUser(sid, req.user.id);
          if (!ok) throw new BadRequestError('site_id not found');
          siteId = sid;
        }
        updates.push(`site_id = $${n++}`);
        values.push(siteId);
      }

      const nextKind = req.body.query_kind ?? existing.rows[0].query_kind;
      if (nextKind === 'custom') {
        const pc = req.body.promql_custom;
        if (pc !== undefined && !String(pc).trim()) {
          throw new BadRequestError('promql_custom cannot be empty for custom queries');
        }
      }

      if (updates.length === 0) throw new BadRequestError('No fields to update');

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id, req.user.id);

      const r = await query(
        `UPDATE dashboard_widgets SET ${updates.join(', ')}
         WHERE id = $${n++} AND user_id = $${n++}
         RETURNING id, user_id, site_id, metric_name, query_kind, promql_custom, title, subtitle,
                   section, sort_order, format, currency_code, include_in_multi_chart, featured_chart,
                   created_at, updated_at`,
        values
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

    const r = await query(
      `DELETE FROM dashboard_widgets WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, req.user.id]
    );
    if (r.rows.length === 0) throw new NotFoundError('Widget not found');
    res.json({ success: true, message: 'Widget deleted' });
  } catch (e) {
    next(e);
  }
});

export { router as dashboardWidgetsRoutes };
