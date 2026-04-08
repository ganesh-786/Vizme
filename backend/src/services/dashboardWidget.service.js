/**
 * Dashboard widget definitions for config-driven KPI dashboards (Postgres).
 */
import { query } from '../database/connection.js';

const METRIC_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function assertSafeMetricName(name) {
  if (!name || !METRIC_NAME_RE.test(String(name))) {
    throw new Error('metric_name must match /^[a-zA-Z_][a-zA-Z0-9_]*$/');
  }
}

function sanitizeMetricNames(metricNames = []) {
  return [...new Set(
    (metricNames || [])
      .map((name) => String(name || '').replace(/[^a-zA-Z0-9_]/g, ''))
      .filter(Boolean)
  )];
}

/**
 * BuildPromQL label matcher fragment: user_id=~"^id$"[,site_id=~"^sid$"]
 */
export function buildTenantLabelFilter(userId, siteId) {
  const uid = String(userId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  let f = `user_id=~"^${uid}$"`;
  if (siteId != null && siteId !== '') {
    const sid = String(siteId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    f += `,site_id=~"^${sid}$"`;
  }
  return f;
}

/**
 * Instantiate widget PromQL (scalar instant query).
 */
export function promqlForWidget(widget, userId, siteId) {
  const filter = buildTenantLabelFilter(userId, siteId);
  const name = widget.metric_name;

  if (widget.query_kind === 'custom' && widget.promql_custom) {
    return widget.promql_custom.replace(/\{user_filter\}/g, filter);
  }

  const selector = `user_metric_${name}{${filter}}`;

  if (widget.query_kind === 'max_latest') {
    return `max(${selector}) or vector(0)`;
  }

  // increase_24h (default for counters)
  return `sum(increase(${selector}[24h])) or vector(0)`;
}

/**
 * Range query selector for a single metric (featured chart).
 */
export function promqlRangeForMetricName(metricName, userId, siteId) {
  assertSafeMetricName(metricName);
  const filter = buildTenantLabelFilter(userId, siteId);
  return `user_metric_${metricName}{${filter}}`;
}

export function promqlSelectorForMetricNames(metricNames, userId, siteId) {
  const safe = sanitizeMetricNames(metricNames);
  const filter = buildTenantLabelFilter(userId, siteId);
  if (safe.length === 0) return `{__name__=~"user_metric_.+", ${filter}}`;
  if (safe.length === 1) return `user_metric_${safe[0]}{${filter}}`;
  return `{__name__=~"user_metric_(${safe.join('|')})", ${filter}}`;
}

export function promqlCountDistinctMetricNames(metricNames, userId, siteId) {
  const selector = promqlSelectorForMetricNames(metricNames, userId, siteId);
  return `count(count by (__name__) (${selector})) or vector(0)`;
}

/**
 * Multi-series: all user_metric_* for tenant (and optional site).
 */
export function promqlMultiSeriesSelector(userId, siteId, metricNames = null) {
  return promqlSelectorForMetricNames(metricNames, userId, siteId);
}

function parseUserId(userId) {
  const n = typeof userId === 'number' ? userId : parseInt(String(userId), 10);
  if (Number.isNaN(n)) throw new Error('Invalid user id');
  return n;
}

/**
 * Widgets for dashboard scope: site-specific rows, or account-level (site_id IS NULL) when siteId absent.
 */
export async function listDashboardWidgetsForScope(userId, siteId) {
  const uid = parseUserId(userId);
  if (siteId != null && siteId !== '') {
    const sid = parseInt(String(siteId), 10);
    if (Number.isNaN(sid)) return [];
    const own = await query(
      `SELECT s.id FROM sites s WHERE s.id = $1 AND s.user_id = $2`,
      [sid, uid]
    );
    if (own.rows.length === 0) return [];
    const r = await query(
      `SELECT * FROM dashboard_widgets
       WHERE user_id = $1 AND site_id = $2
       ORDER BY section ASC, sort_order ASC, id ASC`,
      [uid, sid]
    );
    return r.rows;
  }

  const r = await query(
    `SELECT * FROM dashboard_widgets
     WHERE user_id = $1 AND site_id IS NULL
     ORDER BY section ASC, sort_order ASC, id ASC`,
    [uid]
  );
  return r.rows;
}

export async function ensureSiteOwnedByUser(siteId, userId) {
  const sid = parseInt(String(siteId), 10);
  if (Number.isNaN(sid)) return null;
  const r = await query(`SELECT id FROM sites WHERE id = $1 AND user_id = $2`, [sid, userId]);
  return r.rows[0]?.id ?? null;
}
