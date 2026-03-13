/**
 * Mimir Prometheus API query service.
 * Queries Mimir with X-Scope-OrgID for tenant-isolated metrics.
 */
import { config } from '../config.js';
import { logger } from '../logger.js';

const MIMIR_BASE = (config.urls.mimir || process.env.MIMIR_URL || 'http://localhost:9009').replace(
  /\/$/,
  ''
);
const QUERY_URL = `${MIMIR_BASE}/prometheus/api/v1/query`;
const QUERY_RANGE_URL = `${MIMIR_BASE}/prometheus/api/v1/query_range`;

/**
 * Run a PromQL instant query against Mimir for a tenant.
 * Sums all series values (for queries that return multiple series).
 * @param {string} tenantId - X-Scope-OrgID (user_id)
 * @param {string} query - PromQL expression
 * @returns {Promise<number|null>} - Scalar value or null
 */
export async function queryScalar(tenantId, query) {
  try {
    const url = `${QUERY_URL}?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'X-Scope-OrgID': String(tenantId) },
    });
    if (!res.ok) {
      logger.warn({ status: res.status, tenantId }, 'mimirQuery: non-OK response');
      return null;
    }
    const data = await res.json();
    if (data?.status !== 'success') return 0;
    const resultType = data?.data?.resultType;
    const result = data?.data?.result;
    if (resultType === 'scalar' && Array.isArray(result)) {
      const val = result[1];
      return val != null && !Number.isNaN(parseFloat(val)) ? parseFloat(val) : 0;
    }
    if (!Array.isArray(result)) return 0;
    let total = 0;
    for (const r of result) {
      const val = r?.value?.[1];
      if (val != null && !Number.isNaN(parseFloat(val))) {
        total += parseFloat(val);
      }
    }
    return total;
  } catch (err) {
    logger.warn({ err: err?.message, tenantId, query: query?.slice(0, 80) }, 'mimirQuery: scalar failed');
    return null;
  }
}

/**
 * Run a PromQL range query against Mimir for a tenant.
 * @param {string} tenantId - X-Scope-OrgID (user_id)
 * @param {string} query - PromQL expression
 * @param {number} start - Unix timestamp (seconds)
 * @param {number} end - Unix timestamp (seconds)
 * @param {number} step - Step in seconds (default 60)
 * @returns {Promise<Array<{metric: object, values: Array<[number, string]>}>|null>}
 */
export async function queryRange(tenantId, query, start, end, step = 60) {
  try {
    const params = new URLSearchParams({
      query,
      start: String(start),
      end: String(end),
      step: String(step),
    });
    const res = await fetch(`${QUERY_RANGE_URL}?${params}`, {
      headers: { 'X-Scope-OrgID': String(tenantId) },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.result ?? [];
  } catch (err) {
    logger.warn({ err: err?.message, tenantId, query: query?.slice(0, 60) }, 'mimirQuery: range failed');
    return null;
  }
}

/**
 * Fetch all dashboard metrics for a tenant (24h window).
 * @param {string} userId - Tenant ID
 * @returns {Promise<object>} - Dashboard data
 */
export async function fetchDashboardMetrics(userId) {
  const uid = String(userId);
  const userFilter = `user_id=~"^${uid}$"`;

  // Revenue: support total_revenue, revenue, totalRevenue; increase() for counter (recommended), delta() for gauge
  const revenueMetricRegex = `user_metric_(total_revenue|revenue|totalRevenue)`;
  const revenueSelector = `{__name__=~"${revenueMetricRegex}", ${userFilter}}`;
  const queries = {
    ordersCompleted: `increase(user_metric_orders_completed{${userFilter}}[24h]) or vector(0)`,
    productsSold: `sum(increase(user_metric_products_sold{${userFilter}}[24h])) or vector(0)`,
    // avgOrderValue computed server-side from revenue/orders
    pageViews: `sum(count_over_time(user_metric_page_view{${userFilter}}[24h])) or vector(0)`,
    addToCart: `sum(increase(user_metric_add_to_cart{${userFilter}}[24h])) or vector(0)`,
    checkoutStarted: `sum(increase(user_metric_checkout_started{${userFilter}}[24h])) or vector(0)`,
    metricSeriesCount: `count({__name__=~"user_metric_.+", ${userFilter}}) or vector(0)`,
    cartItemsCount: `max(user_metric_cart_items_count{${userFilter}}) or vector(0)`,
    cartValueTotal: `max(user_metric_cart_value_total{${userFilter}}) or vector(0)`,
  };

  // Revenue: use increase() only for counter - sum of order amounts on checkout in 24h.
  // Client must increment('total_revenue', orderAmount) when checkout completes. Do NOT use delta()
  // to avoid gauge extrapolation causing value to grow on each dashboard refresh.
  const [revenue, orders, products, pageViews, addToCart, checkout, seriesCount, cartItems, cartValue] =
    await Promise.all([
      queryScalar(uid, `sum(increase(${revenueSelector}[24h])) or vector(0)`),
      queryScalar(uid, queries.ordersCompleted),
      queryScalar(uid, queries.productsSold),
      queryScalar(uid, queries.pageViews),
      queryScalar(uid, queries.addToCart),
      queryScalar(uid, queries.checkoutStarted),
      queryScalar(uid, queries.metricSeriesCount),
      queryScalar(uid, queries.cartItemsCount),
      queryScalar(uid, queries.cartValueTotal),
    ]);

  const rev = revenue ?? 0;
  const ord = orders ?? 0;
  const avgOrder = ord > 0 ? rev / ord : 0;

  const end = Math.floor(Date.now() / 1000);
  const start = end - 24 * 3600;
  const timeseriesQuery = `{__name__=~"user_metric_.+", ${userFilter}}`;
  const timeseriesData = await queryRange(uid, timeseriesQuery, start, end, 300);

  const revenueOverTime = await queryRange(
    uid,
    revenueSelector,
    start,
    end,
    300
  );

  return {
    stats: {
      totalRevenue: revenue ?? 0,
      ordersCompleted: Math.round(orders ?? 0),
      productsSold: Math.round(products ?? 0),
      avgOrderValue: Math.round(avgOrder),
      pageViews: Math.round(pageViews ?? 0),
      addToCart: Math.round(addToCart ?? 0),
      checkoutStarted: Math.round(checkout ?? 0),
      metricSeriesCount: Math.round(seriesCount ?? 0),
      cartItemsCount: Math.round(cartItems ?? 0),
      cartValueTotal: Math.round(cartValue ?? 0),
    },
    timeseries: (timeseriesData || []).map((r) => ({
      metric: r.metric,
      values: (r.values || []).map(([t, v]) => ({ time: t, value: parseFloat(v) })),
    })),
    revenueOverTime: (revenueOverTime || []).flatMap((r) =>
      (r.values || []).map(([t, v]) => ({ time: Number(t), value: parseFloat(v) }))
    ),
  };
}
