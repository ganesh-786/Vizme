/**
 * Mimir Prometheus API query service.
 * Queries Mimir with X-Scope-OrgID for tenant-isolated metrics.
 */
import { config } from '../config.js';
import { logger } from '../logger.js';
import { recordMimirQuery } from '../middleware/appMetrics.js';
import {
  buildTenantLabelFilter,
  listDashboardWidgetsForScope,
  promqlCountDistinctMetricNames,
  promqlForWidget,
  promqlRangeForMetricName,
  promqlSelectorForMetricNames,
  promqlMultiSeriesSelector,
} from './dashboardWidget.service.js';

const MIMIR_BASE = (config.urls.mimir || process.env.MIMIR_URL || 'http://localhost:9009').replace(
  /\/$/,
  ''
);
const QUERY_URL = `${MIMIR_BASE}/prometheus/api/v1/query`;
const QUERY_RANGE_URL = `${MIMIR_BASE}/prometheus/api/v1/query_range`;
const DASHBOARD_LOOKBACK_SECONDS = 24 * 3600;
const MIN_RANGE_STEP_SECONDS = 15;
const SHORT_RANGE_STEP_SECONDS = 60;
const MEDIUM_RANGE_STEP_SECONDS = 300;
const LONG_RANGE_STEP_SECONDS = 900;
const RECENT_COUNTER_WINDOW = '2m';
const RECENT_PERFORMANCE_WINDOW = '15m';

const MOVIE_METRIC_NAMES = [
  'ticket_purchase_completed',
  'movie_book_now',
  'featured_movie_book',
  'movie_select',
];
const REVENUE_METRIC_NAMES = ['total_revenue', 'revenue', 'totalRevenue'];
const ORDER_COMPLETED_METRIC_NAMES = ['orders_completed', 'checkout_completed'];
const PAGE_VIEW_METRIC_NAMES = ['page_view', 'page_views'];
const PRODUCT_SOLD_METRIC_NAMES = ['products_sold', 'product_sold'];
const ADD_TO_CART_METRIC_NAMES = ['add_to_cart', 'addtocart'];
const ECOMMERCE_SIGNAL_METRIC_NAMES = [
  ...REVENUE_METRIC_NAMES,
  ...ORDER_COMPLETED_METRIC_NAMES,
  ...PRODUCT_SOLD_METRIC_NAMES,
  ...ADD_TO_CART_METRIC_NAMES,
  'checkout_started',
];
const SHARED_ENGAGEMENT_METRIC_NAMES = [
  'javascript_errors',
  'promise_rejections',
  'scroll_depth',
  'max_scroll_depth',
  'time_on_page',
  'user_interaction',
];
const ECOMMERCE_DASHBOARD_METRIC_NAMES = [
  ...REVENUE_METRIC_NAMES,
  ...ORDER_COMPLETED_METRIC_NAMES,
  ...PRODUCT_SOLD_METRIC_NAMES,
  ...PAGE_VIEW_METRIC_NAMES,
  ...ADD_TO_CART_METRIC_NAMES,
  'checkout_started',
  'cart_items_count',
  'cart_value_total',
  ...SHARED_ENGAGEMENT_METRIC_NAMES,
];
const MOVIE_DASHBOARD_METRIC_NAMES = [
  ...MOVIE_METRIC_NAMES,
  ...REVENUE_METRIC_NAMES,
  ...PAGE_VIEW_METRIC_NAMES,
  ...SHARED_ENGAGEMENT_METRIC_NAMES,
];

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export function recommendRangeStepSeconds(start, end) {
  const safeStart = Math.floor(Number(start) || 0);
  const safeEnd = Math.floor(Number(end) || 0);
  const rangeSeconds = Math.max(safeEnd - safeStart, MIN_RANGE_STEP_SECONDS);
  if (rangeSeconds <= 6 * 3600) return MIN_RANGE_STEP_SECONDS;
  if (rangeSeconds <= DASHBOARD_LOOKBACK_SECONDS) return SHORT_RANGE_STEP_SECONDS;
  if (rangeSeconds <= 7 * 24 * 3600) return MEDIUM_RANGE_STEP_SECONDS;
  return LONG_RANGE_STEP_SECONDS;
}

function alignRangeBounds(start, end, step) {
  const safeStep = Math.max(
    Math.floor(Number(step) || MIN_RANGE_STEP_SECONDS),
    MIN_RANGE_STEP_SECONDS
  );
  const safeStart = Math.floor(Number(start) || 0);
  const safeEnd = Math.max(Math.floor(Number(end) || 0), safeStart + safeStep);
  return {
    start: Math.floor(safeStart / safeStep) * safeStep,
    end: Math.ceil(safeEnd / safeStep) * safeStep,
    step: safeStep,
  };
}

function currentDashboardWindow() {
  const end = Math.floor(Date.now() / 1000);
  return {
    end,
    start: end - DASHBOARD_LOOKBACK_SECONDS,
  };
}

/**
 * Run a PromQL instant query against Mimir for a tenant.
 * Sums all series values (for queries that return multiple series).
 * @param {string} tenantId - X-Scope-OrgID (user_id)
 * @param {string} query - PromQL expression
 * @returns {Promise<number|null>} - Scalar value or null
 */
export async function queryScalar(tenantId, query, options = {}) {
  const queryKind = options.queryKind || 'scalar';
  const startedAt = Date.now();
  try {
    const url = `${QUERY_URL}?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'X-Scope-OrgID': String(tenantId) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      recordMimirQuery({
        queryKind,
        durationMs: Date.now() - startedAt,
        outcome: 'error',
        resultSeries: 0,
        error: `HTTP ${res.status}: ${body.slice(0, 160)}`,
      });
      logger.warn(
        { status: res.status, tenantId, body: body.slice(0, 160) },
        'mimirQuery: non-OK response'
      );
      return null;
    }
    const data = await res.json();
    if (data?.status !== 'success') {
      recordMimirQuery({
        queryKind,
        durationMs: Date.now() - startedAt,
        outcome: 'error',
        resultSeries: Array.isArray(data?.data?.result) ? data.data.result.length : 0,
        error: data?.error || 'Mimir query returned non-success status',
      });
      return null;
    }
    const resultType = data?.data?.resultType;
    const result = data?.data?.result;
    if (resultType === 'scalar' && Array.isArray(result)) {
      const val = result[1];
      recordMimirQuery({
        queryKind,
        durationMs: Date.now() - startedAt,
        outcome: 'success',
        resultSeries: 1,
      });
      return val != null && !Number.isNaN(parseFloat(val)) ? parseFloat(val) : 0;
    }
    if (!Array.isArray(result)) {
      recordMimirQuery({
        queryKind,
        durationMs: Date.now() - startedAt,
        outcome: 'success',
        resultSeries: 0,
      });
      return 0;
    }
    let total = 0;
    for (const r of result) {
      const val = r?.value?.[1];
      if (val != null && !Number.isNaN(parseFloat(val))) {
        total += parseFloat(val);
      }
    }
    recordMimirQuery({
      queryKind,
      durationMs: Date.now() - startedAt,
      outcome: 'success',
      resultSeries: result.length,
    });
    return total;
  } catch (err) {
    recordMimirQuery({
      queryKind,
      durationMs: Date.now() - startedAt,
      outcome: 'error',
      resultSeries: 0,
      error: err,
    });
    logger.warn(
      { err: err?.message, tenantId, query: query?.slice(0, 80) },
      'mimirQuery: scalar failed'
    );
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
export async function queryRange(tenantId, query, start, end, step = null, options = {}) {
  const queryKind = options.queryKind || 'range';
  const aligned = alignRangeBounds(start, end, step ?? recommendRangeStepSeconds(start, end));
  const startedAt = Date.now();
  try {
    const params = new URLSearchParams({
      query,
      start: String(aligned.start),
      end: String(aligned.end),
      step: String(aligned.step),
    });
    const res = await fetch(`${QUERY_RANGE_URL}?${params}`, {
      headers: { 'X-Scope-OrgID': String(tenantId) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      recordMimirQuery({
        queryKind,
        durationMs: Date.now() - startedAt,
        outcome: 'error',
        resultSeries: 0,
        stepSeconds: aligned.step,
        error: `HTTP ${res.status}: ${body.slice(0, 160)}`,
      });
      return null;
    }
    const data = await res.json();
    const result = data?.data?.result ?? [];
    recordMimirQuery({
      queryKind,
      durationMs: Date.now() - startedAt,
      outcome: data?.status === 'success' ? 'success' : 'error',
      resultSeries: Array.isArray(result) ? result.length : 0,
      stepSeconds: aligned.step,
      ...(data?.status === 'success'
        ? {}
        : { error: data?.error || 'Mimir range query returned non-success status' }),
    });
    return Array.isArray(result) ? result : [];
  } catch (err) {
    recordMimirQuery({
      queryKind,
      durationMs: Date.now() - startedAt,
      outcome: 'error',
      resultSeries: 0,
      stepSeconds: aligned.step,
      error: err,
    });
    logger.warn(
      { err: err?.message, tenantId, query: query?.slice(0, 60) },
      'mimirQuery: range failed'
    );
    return null;
  }
}

/**
 * Clamp a timing metric to [0, max]. Values outside this range indicate
 * measurement bugs (e.g. loadEventEnd read before it is populated, producing
 * negative epoch-offset values). Returns 0 for out-of-range data so PromQL
 * averages are not polluted by historical bad samples.
 */
const MAX_REASONABLE_TIMING_MS = 120_000;
function clampTimingMs(val, max = MAX_REASONABLE_TIMING_MS) {
  const n = Number(val ?? 0);
  return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n) : 0;
}

/** PromQL fragment: ticketing / cinema counters from the browser SDK (Movie_ticketBooking demo). */
const MOVIE_COUNTER_REGEX = `user_metric_(${MOVIE_METRIC_NAMES.join('|')})`;

/** Ecommerce-style counters used to infer store traffic vs ticketing-only (counters / typical funnel). */
const ECOMMERCE_SIGNAL_REGEX = `user_metric_(${ECOMMERCE_SIGNAL_METRIC_NAMES.join('|')})`;

/**
 * Infer dashboard vertical from 24h activity (no DB flag). Widget mode bypasses this.
 * @returns {'ecommerce'|'movie'|'mixed'}
 */
export async function detectDashboardVertical(userId, siteId = null) {
  const uid = String(userId);
  const userFilter = buildTenantLabelFilter(userId, siteId);

  const movieQuery = `sum(increase({__name__=~"${MOVIE_COUNTER_REGEX}", ${userFilter}}[24h])) or vector(0)`;
  const ecoQuery = `sum(increase({__name__=~"${ECOMMERCE_SIGNAL_REGEX}", ${userFilter}}[24h])) or vector(0)`;

  const [movieSig, ecoSig] = await Promise.all([
    queryScalar(uid, movieQuery),
    queryScalar(uid, ecoQuery),
  ]);

  const m = movieSig ?? 0;
  const e = ecoSig ?? 0;

  if (m > 0 && e === 0) return 'movie';
  if (e > 0 && m === 0) return 'ecommerce';
  if (m > 0 && e > 0) return 'mixed';
  return 'ecommerce';
}

function normalizeRangeSeries(result) {
  return (result || []).map((series) => ({
    metric: series.metric,
    values: (series.values || []).map(([time, value]) => ({
      time: Number(time),
      value: parseFloat(value),
    })),
  }));
}

function flattenRangeSeries(result, filterFn = null) {
  return (result || []).flatMap((series) =>
    (series.values || [])
      .map(([time, value]) => ({ time: Number(time), value: parseFloat(value) }))
      .filter((point) => (typeof filterFn === 'function' ? filterFn(point) : true))
  );
}

function buildOptionalPerformanceStats(performance = {}, includeDetails = false) {
  if (!includeDetails) {
    return {
      pageLoadTime: 0,
      ttfb: 0,
      domContentLoaded: 0,
      fcp: 0,
      lcp: 0,
      fid: 0,
      cls: 0,
    };
  }

  return {
    pageLoadTime: clampTimingMs(performance.pageLoadTime),
    ttfb: clampTimingMs(performance.ttfb),
    domContentLoaded: clampTimingMs(performance.domContentLoaded),
    fcp: clampTimingMs(performance.fcp),
    lcp: clampTimingMs(performance.lcp),
    fid: clampTimingMs(performance.fid),
    cls: clampTimingMs(performance.cls, 10_000),
  };
}

/**
 * Ticketing / cinema-oriented dashboard (24h). Shares RUM stats with legacy layout.
 */
export async function fetchMovieDashboardMetrics(userId, siteId = null, options = {}) {
  const uid = String(userId);
  const includeSeries = normalizeBoolean(options.includeSeries, false);
  const includeDetails = normalizeBoolean(options.includeDetails, false);
  const userFilter = buildTenantLabelFilter(userId, siteId);
  const pageViewSelector = promqlSelectorForMetricNames(PAGE_VIEW_METRIC_NAMES, userId, siteId);
  const movieSelector = promqlSelectorForMetricNames(MOVIE_METRIC_NAMES, userId, siteId);
  const revenueForTickets = promqlSelectorForMetricNames(REVENUE_METRIC_NAMES, userId, siteId);
  const performanceJobs = includeDetails
    ? [
        queryScalar(
          uid,
          `avg(avg_over_time(user_metric_page_load_time{${userFilter}}[${RECENT_PERFORMANCE_WINDOW}])) or vector(0)`
        ),
        queryScalar(
          uid,
          `avg(avg_over_time(user_metric_ttfb{${userFilter}}[${RECENT_PERFORMANCE_WINDOW}])) or vector(0)`
        ),
        queryScalar(
          uid,
          `avg(avg_over_time(user_metric_dom_content_loaded{${userFilter}}[${RECENT_PERFORMANCE_WINDOW}])) or vector(0)`
        ),
        queryScalar(
          uid,
          `avg(avg_over_time(user_metric_fcp{${userFilter}}[${RECENT_PERFORMANCE_WINDOW}])) or vector(0)`
        ),
        queryScalar(
          uid,
          `avg(avg_over_time(user_metric_lcp{${userFilter}}[${RECENT_PERFORMANCE_WINDOW}])) or vector(0)`
        ),
        queryScalar(
          uid,
          `avg(avg_over_time(user_metric_fid{${userFilter}}[${RECENT_PERFORMANCE_WINDOW}])) or vector(0)`
        ),
        queryScalar(
          uid,
          `avg(avg_over_time(user_metric_cls{${userFilter}}[${RECENT_PERFORMANCE_WINDOW}])) or vector(0)`
        ),
      ]
    : [];

  const [
    ticketsSold,
    bookNowClicks,
    featuredBookClicks,
    pageViews,
    seriesCount,
    jsErrors,
    promiseRejections,
    scrollDepth,
    maxScrollDepth,
    timeOnPage,
    interactions,
    ticketRevenue,
    ...performanceResults
  ] = await Promise.all([
    queryScalar(
      uid,
      `sum(increase(user_metric_ticket_purchase_completed{${userFilter}}[24h])) or vector(0)`
    ),
    queryScalar(uid, `sum(increase(user_metric_movie_book_now{${userFilter}}[24h])) or vector(0)`),
    queryScalar(
      uid,
      `sum(increase(user_metric_featured_movie_book{${userFilter}}[24h])) or vector(0)`
    ),
    queryScalar(uid, `sum(increase(${pageViewSelector}[24h])) or vector(0)`),
    queryScalar(uid, promqlCountDistinctMetricNames(MOVIE_DASHBOARD_METRIC_NAMES, userId, siteId)),
    queryScalar(
      uid,
      `sum(increase(user_metric_javascript_errors{${userFilter}}[24h])) or vector(0)`
    ),
    queryScalar(
      uid,
      `sum(increase(user_metric_promise_rejections{${userFilter}}[24h])) or vector(0)`
    ),
    queryScalar(uid, `avg(user_metric_scroll_depth{${userFilter}}) or vector(0)`),
    queryScalar(uid, `avg(user_metric_max_scroll_depth{${userFilter}}) or vector(0)`),
    queryScalar(
      uid,
      `avg(avg_over_time(user_metric_time_on_page{${userFilter}}[24h])) or vector(0)`
    ),
    queryScalar(
      uid,
      `sum(increase(user_metric_user_interaction{${userFilter}}[24h])) or vector(0)`
    ),
    queryScalar(uid, `sum(increase(${revenueForTickets}[24h])) or vector(0)`),
    ...performanceJobs,
  ]);

  const performance = includeDetails
    ? {
        pageLoadTime: performanceResults[0],
        ttfb: performanceResults[1],
        domContentLoaded: performanceResults[2],
        fcp: performanceResults[3],
        lcp: performanceResults[4],
        fid: performanceResults[5],
        cls: performanceResults[6],
      }
    : {};

  let timeseriesData = [];
  let ticketActivityOverTime = [];
  let perfOverTime = [];
  let errorsOverTime = [];

  if (includeSeries) {
    const { start, end } = currentDashboardWindow();
    const step = recommendRangeStepSeconds(start, end);
    [timeseriesData, ticketActivityOverTime, perfOverTime, errorsOverTime] = await Promise.all([
      queryRange(
        uid,
        promqlSelectorForMetricNames(MOVIE_DASHBOARD_METRIC_NAMES, userId, siteId),
        start,
        end,
        step
      ),
      queryRange(
        uid,
        `sum(increase(${movieSelector}[${RECENT_COUNTER_WINDOW}])) or vector(0)`,
        start,
        end,
        step
      ),
      includeDetails
        ? queryRange(
            uid,
            `avg(avg_over_time(user_metric_page_load_time{${userFilter}}[${RECENT_PERFORMANCE_WINDOW}]))`,
            start,
            end,
            step
          )
        : Promise.resolve([]),
      queryRange(
        uid,
        `sum(increase(user_metric_javascript_errors{${userFilter}}[${RECENT_COUNTER_WINDOW}])) or vector(0)`,
        start,
        end,
        step
      ),
    ]);
  }

  return {
    stats: {
      ticketsSold: Math.round(ticketsSold ?? 0),
      bookNowClicks: Math.round(bookNowClicks ?? 0),
      featuredBookClicks: Math.round(featuredBookClicks ?? 0),
      ticketRevenue: ticketRevenue ?? 0,
      pageViews: Math.round(pageViews ?? 0),
      metricSeriesCount: Math.round(seriesCount ?? 0),
      ...buildOptionalPerformanceStats(performance, includeDetails),
      jsErrors: Math.round(jsErrors ?? 0),
      promiseRejections: Math.round(promiseRejections ?? 0),
      avgScrollDepth: Math.round(scrollDepth ?? 0),
      avgMaxScrollDepth: Math.round(maxScrollDepth ?? 0),
      avgTimeOnPage: Math.round(timeOnPage ?? 0),
      totalInteractions: Math.round(interactions ?? 0),
    },
    timeseries: normalizeRangeSeries(timeseriesData),
    revenueOverTime: flattenRangeSeries(ticketActivityOverTime),
    performanceOverTime: flattenRangeSeries(
      perfOverTime,
      (point) => point.value >= 0 && point.value <= MAX_REASONABLE_TIMING_MS
    ),
    errorsOverTime: flattenRangeSeries(errorsOverTime),
  };
}

/**
 * Legacy ecommerce-oriented dashboard (24h). Optional siteId narrows metrics by site_id label.
 */
export async function fetchLegacyDashboardMetrics(userId, siteId = null, options = {}) {
  const uid = String(userId);
  const includeSeries = normalizeBoolean(options.includeSeries, false);
  const includeDetails = normalizeBoolean(options.includeDetails, false);
  const userFilter = buildTenantLabelFilter(userId, siteId);
  const revenueSelector = promqlSelectorForMetricNames(REVENUE_METRIC_NAMES, userId, siteId);
  const ordersSelector = promqlSelectorForMetricNames(ORDER_COMPLETED_METRIC_NAMES, userId, siteId);
  const pageViewSelector = promqlSelectorForMetricNames(PAGE_VIEW_METRIC_NAMES, userId, siteId);
  const productsSoldSelector = promqlSelectorForMetricNames(
    PRODUCT_SOLD_METRIC_NAMES,
    userId,
    siteId
  );
  const addToCartSelector = promqlSelectorForMetricNames(ADD_TO_CART_METRIC_NAMES, userId, siteId);
  const performanceJobs = includeDetails
    ? [
        queryScalar(
          uid,
          `avg(avg_over_time(user_metric_page_load_time{${userFilter}}[${RECENT_PERFORMANCE_WINDOW}])) or vector(0)`
        ),
        queryScalar(
          uid,
          `avg(avg_over_time(user_metric_ttfb{${userFilter}}[${RECENT_PERFORMANCE_WINDOW}])) or vector(0)`
        ),
        queryScalar(
          uid,
          `avg(avg_over_time(user_metric_dom_content_loaded{${userFilter}}[${RECENT_PERFORMANCE_WINDOW}])) or vector(0)`
        ),
        queryScalar(
          uid,
          `avg(avg_over_time(user_metric_fcp{${userFilter}}[${RECENT_PERFORMANCE_WINDOW}])) or vector(0)`
        ),
        queryScalar(
          uid,
          `avg(avg_over_time(user_metric_lcp{${userFilter}}[${RECENT_PERFORMANCE_WINDOW}])) or vector(0)`
        ),
        queryScalar(
          uid,
          `avg(avg_over_time(user_metric_fid{${userFilter}}[${RECENT_PERFORMANCE_WINDOW}])) or vector(0)`
        ),
        queryScalar(
          uid,
          `avg(avg_over_time(user_metric_cls{${userFilter}}[${RECENT_PERFORMANCE_WINDOW}])) or vector(0)`
        ),
      ]
    : [];

  const [
    revenue,
    orders,
    products,
    pageViews,
    addToCart,
    checkout,
    seriesCount,
    cartItems,
    cartValue,
    jsErrors,
    promiseRejections,
    scrollDepth,
    maxScrollDepth,
    timeOnPage,
    interactions,
    ...performanceResults
  ] = await Promise.all([
    queryScalar(uid, `sum(increase(${revenueSelector}[24h])) or vector(0)`),
    queryScalar(uid, `sum(increase(${ordersSelector}[24h])) or vector(0)`),
    queryScalar(uid, `sum(increase(${productsSoldSelector}[24h])) or vector(0)`),
    queryScalar(uid, `sum(increase(${pageViewSelector}[24h])) or vector(0)`),
    queryScalar(uid, `sum(increase(${addToCartSelector}[24h])) or vector(0)`),
    queryScalar(
      uid,
      `sum(increase(user_metric_checkout_started{${userFilter}}[24h])) or vector(0)`
    ),
    queryScalar(
      uid,
      promqlCountDistinctMetricNames(ECOMMERCE_DASHBOARD_METRIC_NAMES, userId, siteId)
    ),
    queryScalar(uid, `max(user_metric_cart_items_count{${userFilter}}) or vector(0)`),
    queryScalar(uid, `max(user_metric_cart_value_total{${userFilter}}) or vector(0)`),
    queryScalar(
      uid,
      `sum(increase(user_metric_javascript_errors{${userFilter}}[24h])) or vector(0)`
    ),
    queryScalar(
      uid,
      `sum(increase(user_metric_promise_rejections{${userFilter}}[24h])) or vector(0)`
    ),
    queryScalar(uid, `avg(user_metric_scroll_depth{${userFilter}}) or vector(0)`),
    queryScalar(uid, `avg(user_metric_max_scroll_depth{${userFilter}}) or vector(0)`),
    queryScalar(
      uid,
      `avg(avg_over_time(user_metric_time_on_page{${userFilter}}[24h])) or vector(0)`
    ),
    queryScalar(
      uid,
      `sum(increase(user_metric_user_interaction{${userFilter}}[24h])) or vector(0)`
    ),
    ...performanceJobs,
  ]);

  const rev = revenue ?? 0;
  const ord = orders ?? 0;
  const avgOrder = ord > 0 ? rev / ord : 0;
  const performance = includeDetails
    ? {
        pageLoadTime: performanceResults[0],
        ttfb: performanceResults[1],
        domContentLoaded: performanceResults[2],
        fcp: performanceResults[3],
        lcp: performanceResults[4],
        fid: performanceResults[5],
        cls: performanceResults[6],
      }
    : {};

  if (process.env.MIMIR_DEBUG === '1') {
    logger.info(
      {
        userId: uid,
        siteId: siteId ?? null,
        raw: {
          revenue,
          orders,
          products,
          pageViews,
          addToCart,
          checkout,
          seriesCount,
          cartItems,
          cartValue,
        },
        computed: { totalRevenue: rev, avgOrderValue: Math.round(avgOrder) },
      },
      'mimirQuery: fetchLegacyDashboardMetrics raw results'
    );
  }

  let timeseriesData = [];
  let revenueOverTime = [];
  let perfOverTime = [];
  let errorsOverTime = [];

  if (includeSeries) {
    const { start, end } = currentDashboardWindow();
    const step = recommendRangeStepSeconds(start, end);
    [timeseriesData, revenueOverTime, perfOverTime, errorsOverTime] = await Promise.all([
      queryRange(
        uid,
        promqlSelectorForMetricNames(ECOMMERCE_DASHBOARD_METRIC_NAMES, userId, siteId),
        start,
        end,
        step
      ),
      queryRange(uid, revenueSelector, start, end, step),
      includeDetails
        ? queryRange(
            uid,
            `avg(avg_over_time(user_metric_page_load_time{${userFilter}}[${RECENT_PERFORMANCE_WINDOW}]))`,
            start,
            end,
            step
          )
        : Promise.resolve([]),
      queryRange(
        uid,
        `sum(increase(user_metric_javascript_errors{${userFilter}}[${RECENT_COUNTER_WINDOW}])) or vector(0)`,
        start,
        end,
        step
      ),
    ]);
  }

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
      cartValueTotal: cartValue ?? 0,
      ...buildOptionalPerformanceStats(performance, includeDetails),
      jsErrors: Math.round(jsErrors ?? 0),
      promiseRejections: Math.round(promiseRejections ?? 0),
      avgScrollDepth: Math.round(scrollDepth ?? 0),
      avgMaxScrollDepth: Math.round(maxScrollDepth ?? 0),
      avgTimeOnPage: Math.round(timeOnPage ?? 0),
      totalInteractions: Math.round(interactions ?? 0),
    },
    timeseries: normalizeRangeSeries(timeseriesData),
    revenueOverTime: flattenRangeSeries(revenueOverTime),
    performanceOverTime: flattenRangeSeries(
      perfOverTime,
      (point) => point.value >= 0 && point.value <= MAX_REASONABLE_TIMING_MS
    ),
    errorsOverTime: flattenRangeSeries(errorsOverTime),
  };
}

/**
 * Config-driven dashboard from dashboard_widgets rows (widget KPI contract).
 */
export async function fetchConfigDrivenDashboardMetrics(userId, siteId, widgets, options = {}) {
  const uid = String(userId);
  const includeSeries = normalizeBoolean(options.includeSeries, false);
  const { start, end } = currentDashboardWindow();
  const step = recommendRangeStepSeconds(start, end);

  const scalars = await Promise.all(
    widgets.map((w) => queryScalar(uid, promqlForWidget(w, userId, siteId)))
  );

  const featuredByIndex = new Map();
  let multiSeries = [];

  if (includeSeries) {
    const featuredJobs = widgets.map((w, i) => ({ w, i })).filter(({ w }) => w.featured_chart);
    const featuredRanges = await Promise.all(
      featuredJobs.map(({ w }) =>
        queryRange(uid, promqlRangeForMetricName(w.metric_name, userId, siteId), start, end, step)
      )
    );

    featuredJobs.forEach((job, j) => {
      featuredByIndex.set(job.i, flattenRangeSeries(featuredRanges[j]));
    });

    const multiMetricNames = widgets
      .filter((w) => w.include_in_multi_chart)
      .map((w) => w.metric_name);
    if (multiMetricNames.length > 0) {
      const ts = await queryRange(
        uid,
        promqlMultiSeriesSelector(userId, siteId, multiMetricNames),
        start,
        end,
        step
      );
      multiSeries = normalizeRangeSeries(ts);
    }
  }

  const widgetPayloads = widgets.map((w, i) => ({
    id: w.id,
    title: w.title,
    subtitle: w.subtitle,
    section: w.section || 'primary',
    sortOrder: w.sort_order,
    format: w.format,
    currencyCode: w.currency_code,
    metricName: w.metric_name,
    queryKind: w.query_kind,
    includeInMultiChart: w.include_in_multi_chart,
    featuredChart: w.featured_chart,
    value: scalars[i] ?? 0,
    featuredSeries: featuredByIndex.get(i) ?? null,
  }));

  const siteNum =
    siteId != null && siteId !== '' && !Number.isNaN(parseInt(String(siteId), 10))
      ? parseInt(String(siteId), 10)
      : null;

  return {
    dashboardMode: 'widgets',
    siteId: siteNum,
    widgets: widgetPayloads,
    multiSeries,
  };
}

function normalizeSiteQueryParam(siteId) {
  if (siteId === undefined || siteId === null || siteId === '') return null;
  const s = String(siteId);
  if (s === 'null' || s === 'undefined') return null;
  return s;
}

/**
 * Fetch dashboard: dashboard_widgets when defined; else legacy layout with auto vertical (ecommerce | movie | mixed).
 * @param {string|number} userId
 * @param {string|null|undefined} siteId - query param from dashboard (optional)
 */
export async function fetchDashboardMetrics(userId, siteId = null, options = {}) {
  const normalizedSite = normalizeSiteQueryParam(siteId);
  const widgets = await listDashboardWidgetsForScope(userId, normalizedSite);
  const normalizedOptions = {
    includeSeries: normalizeBoolean(options.includeSeries, false),
    includeDetails: normalizeBoolean(options.includeDetails, false),
  };

  if (widgets.length > 0) {
    const cfg = await fetchConfigDrivenDashboardMetrics(
      userId,
      normalizedSite,
      widgets,
      normalizedOptions
    );
    const siteNum =
      normalizedSite != null && !Number.isNaN(parseInt(String(normalizedSite), 10))
        ? parseInt(String(normalizedSite), 10)
        : null;
    return {
      ...cfg,
      dashboardFlavor: 'widgets',
      siteId: siteNum,
    };
  }

  const siteNum =
    normalizedSite != null && !Number.isNaN(parseInt(String(normalizedSite), 10))
      ? parseInt(String(normalizedSite), 10)
      : null;

  const vertical = await detectDashboardVertical(userId, normalizedSite);

  if (vertical === 'movie') {
    const movie = await fetchMovieDashboardMetrics(userId, normalizedSite, normalizedOptions);
    return {
      dashboardMode: 'legacy',
      dashboardFlavor: 'movie',
      siteId: siteNum,
      ...movie,
    };
  }

  if (vertical === 'mixed') {
    const [eco, movie] = await Promise.all([
      fetchLegacyDashboardMetrics(userId, normalizedSite, normalizedOptions),
      fetchMovieDashboardMetrics(userId, normalizedSite, normalizedOptions),
    ]);
    return {
      dashboardMode: 'legacy',
      dashboardFlavor: 'mixed',
      siteId: siteNum,
      stats: eco.stats,
      movieStats: {
        ticketsSold: movie.stats.ticketsSold,
        bookNowClicks: movie.stats.bookNowClicks,
        featuredBookClicks: movie.stats.featuredBookClicks,
        ticketRevenue: movie.stats.ticketRevenue,
      },
      movieActivityOverTime: movie.revenueOverTime,
      timeseries: eco.timeseries,
      revenueOverTime: eco.revenueOverTime,
      performanceOverTime: eco.performanceOverTime,
      errorsOverTime: eco.errorsOverTime,
    };
  }

  const legacy = await fetchLegacyDashboardMetrics(userId, normalizedSite, normalizedOptions);
  return {
    dashboardMode: 'legacy',
    dashboardFlavor: 'ecommerce',
    siteId: siteNum,
    ...legacy,
  };
}
