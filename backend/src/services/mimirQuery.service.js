/**
 * Mimir Prometheus API query service.
 * Queries Mimir with X-Scope-OrgID for tenant-isolated metrics.
 */
import { config } from '../config.js';
import { logger } from '../logger.js';
import {
  buildTenantLabelFilter,
  listDashboardWidgetsForScope,
  promqlForWidget,
  promqlRangeForMetricName,
  promqlMultiSeriesSelector,
} from './dashboardWidget.service.js';

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
    if (data?.status !== 'success') return null;
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
 * Clamp a timing metric to [0, max]. Values outside this range indicate
 * measurement bugs (e.g. loadEventEnd read before it is populated, producing
 * negative epoch-offset values). Returns 0 for out-of-range data so PromQL
 * averages are not polluted by historical bad samples.
 */
const MAX_REASONABLE_TIMING_MS = 120_000;
function clampTimingMs(val, max = MAX_REASONABLE_TIMING_MS) {
  const n = Number(val ?? 0);
  return (Number.isFinite(n) && n > 0 && n <= max) ? Math.round(n) : 0;
}

/** PromQL fragment: ticketing / cinema counters from the browser SDK (Movie_ticketBooking demo). */
const MOVIE_COUNTER_REGEX =
  'user_metric_(ticket_purchase_completed|movie_book_now|featured_movie_book|movie_select)';

/** Ecommerce-style counters used to infer store traffic vs ticketing-only (counters / typical funnel). */
const ECOMMERCE_SIGNAL_REGEX =
  'user_metric_(total_revenue|revenue|totalRevenue|orders_completed|products_sold|product_sold|add_to_cart|addtocart|checkout_started)';

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

/**
 * Ticketing / cinema-oriented dashboard (24h). Shares RUM stats with legacy layout.
 */
export async function fetchMovieDashboardMetrics(userId, siteId = null) {
  const uid = String(userId);
  const userFilter = buildTenantLabelFilter(userId, siteId);
  const pageViewSelector = `{__name__=~"user_metric_(page_view|page_views)", ${userFilter}}`;
  const movieSelector = `{__name__=~"${MOVIE_COUNTER_REGEX}", ${userFilter}}`;
  const revenueForTickets = `{__name__=~"user_metric_(total_revenue|revenue|totalRevenue)", ${userFilter}}`;

  const [
    ticketsSold,
    bookNowClicks,
    featuredBookClicks,
    pageViews,
    seriesCount,
    pageLoadTime,
    ttfb,
    domContentLoaded,
    fcp,
    lcp,
    fid,
    cls,
    jsErrors,
    promiseRejections,
    scrollDepth,
    maxScrollDepth,
    timeOnPage,
    interactions,
    ticketRevenue,
  ] = await Promise.all([
    queryScalar(uid, `sum(increase(user_metric_ticket_purchase_completed{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `sum(increase(user_metric_movie_book_now{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `sum(increase(user_metric_featured_movie_book{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `sum(increase(${pageViewSelector}[24h])) or vector(0)`),
    queryScalar(uid, `count({__name__=~"user_metric_.+", ${userFilter}}) or vector(0)`),
    queryScalar(uid, `avg(avg_over_time(user_metric_page_load_time{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `avg(avg_over_time(user_metric_ttfb{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `avg(avg_over_time(user_metric_dom_content_loaded{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `avg(avg_over_time(user_metric_fcp{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `avg(avg_over_time(user_metric_lcp{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `avg(avg_over_time(user_metric_fid{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `avg(avg_over_time(user_metric_cls{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `sum(increase(user_metric_javascript_errors{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `sum(increase(user_metric_promise_rejections{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `avg(user_metric_scroll_depth{${userFilter}}) or vector(0)`),
    queryScalar(uid, `avg(user_metric_max_scroll_depth{${userFilter}}) or vector(0)`),
    queryScalar(uid, `avg(avg_over_time(user_metric_time_on_page{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `sum(increase(user_metric_user_interaction{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `sum(increase(${revenueForTickets}[24h])) or vector(0)`),
  ]);

  const end = Math.floor(Date.now() / 1000);
  const start = end - 24 * 3600;

  const [timeseriesData, ticketActivityOverTime, perfOverTime, errorsOverTime] = await Promise.all([
    queryRange(uid, `{__name__=~"user_metric_.+", ${userFilter}}`, start, end, 300),
    queryRange(
      uid,
      `sum(increase(${movieSelector}[15m])) or vector(0)`,
      start,
      end,
      300
    ),
    queryRange(uid, `avg(avg_over_time(user_metric_page_load_time{${userFilter}}[5m]))`, start, end, 300),
    queryRange(uid, `sum(increase(user_metric_javascript_errors{${userFilter}}[5m])) or vector(0)`, start, end, 300),
  ]);

  return {
    stats: {
      ticketsSold: Math.round(ticketsSold ?? 0),
      bookNowClicks: Math.round(bookNowClicks ?? 0),
      featuredBookClicks: Math.round(featuredBookClicks ?? 0),
      ticketRevenue: ticketRevenue ?? 0,
      pageViews: Math.round(pageViews ?? 0),
      metricSeriesCount: Math.round(seriesCount ?? 0),
      pageLoadTime: clampTimingMs(pageLoadTime),
      ttfb: clampTimingMs(ttfb),
      domContentLoaded: clampTimingMs(domContentLoaded),
      fcp: clampTimingMs(fcp),
      lcp: clampTimingMs(lcp),
      fid: clampTimingMs(fid),
      cls: clampTimingMs(cls, 10_000),
      jsErrors: Math.round(jsErrors ?? 0),
      promiseRejections: Math.round(promiseRejections ?? 0),
      avgScrollDepth: Math.round(scrollDepth ?? 0),
      avgMaxScrollDepth: Math.round(maxScrollDepth ?? 0),
      avgTimeOnPage: Math.round(timeOnPage ?? 0),
      totalInteractions: Math.round(interactions ?? 0),
    },
    timeseries: (timeseriesData || []).map((r) => ({
      metric: r.metric,
      values: (r.values || []).map(([t, v]) => ({ time: t, value: parseFloat(v) })),
    })),
    revenueOverTime: (ticketActivityOverTime || []).flatMap((r) =>
      (r.values || []).map(([t, v]) => ({ time: Number(t), value: parseFloat(v) }))
    ),
    performanceOverTime: (perfOverTime || []).flatMap((r) =>
      (r.values || [])
        .map(([t, v]) => ({ time: Number(t), value: parseFloat(v) }))
        .filter((p) => p.value >= 0 && p.value <= MAX_REASONABLE_TIMING_MS)
    ),
    errorsOverTime: (errorsOverTime || []).flatMap((r) =>
      (r.values || []).map(([t, v]) => ({ time: Number(t), value: parseFloat(v) }))
    ),
  };
}

/**
 * Legacy ecommerce-oriented dashboard (24h). Optional siteId narrows metrics by site_id label.
 */
export async function fetchLegacyDashboardMetrics(userId, siteId = null) {
  const uid = String(userId);
  const userFilter = buildTenantLabelFilter(userId, siteId);

  const revenueMetricRegex = `user_metric_(total_revenue|revenue|totalRevenue)`;
  const revenueSelector = `{__name__=~"${revenueMetricRegex}", ${userFilter}}`;
  const pageViewSelector = `{__name__=~"user_metric_(page_view|page_views)", ${userFilter}}`;
  const productsSoldSelector = `{__name__=~"user_metric_(products_sold|product_sold)", ${userFilter}}`;
  const addToCartSelector = `{__name__=~"user_metric_(add_to_cart|addtocart)", ${userFilter}}`;

  const [
    revenue, orders, products, pageViews, addToCart, checkout, seriesCount, cartItems, cartValue,
    pageLoadTime, ttfb, domContentLoaded, fcp, lcp, fid, cls,
    jsErrors, promiseRejections,
    scrollDepth, maxScrollDepth, timeOnPage, interactions,
  ] = await Promise.all([
    queryScalar(uid, `sum(increase(${revenueSelector}[24h])) or vector(0)`),
    queryScalar(uid, `sum(increase(user_metric_orders_completed{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `sum(increase(${productsSoldSelector}[24h])) or vector(0)`),
    queryScalar(uid, `sum(increase(${pageViewSelector}[24h])) or vector(0)`),
    queryScalar(uid, `sum(increase(${addToCartSelector}[24h])) or vector(0)`),
    queryScalar(uid, `sum(increase(user_metric_checkout_started{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `count({__name__=~"user_metric_.+", ${userFilter}}) or vector(0)`),
    queryScalar(uid, `max(user_metric_cart_items_count{${userFilter}}) or vector(0)`),
    queryScalar(uid, `max(user_metric_cart_value_total{${userFilter}}) or vector(0)`),
    queryScalar(uid, `avg(avg_over_time(user_metric_page_load_time{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `avg(avg_over_time(user_metric_ttfb{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `avg(avg_over_time(user_metric_dom_content_loaded{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `avg(avg_over_time(user_metric_fcp{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `avg(avg_over_time(user_metric_lcp{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `avg(avg_over_time(user_metric_fid{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `avg(avg_over_time(user_metric_cls{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `sum(increase(user_metric_javascript_errors{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `sum(increase(user_metric_promise_rejections{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `avg(user_metric_scroll_depth{${userFilter}}) or vector(0)`),
    queryScalar(uid, `avg(user_metric_max_scroll_depth{${userFilter}}) or vector(0)`),
    queryScalar(uid, `avg(avg_over_time(user_metric_time_on_page{${userFilter}}[24h])) or vector(0)`),
    queryScalar(uid, `sum(increase(user_metric_user_interaction{${userFilter}}[24h])) or vector(0)`),
  ]);

  const rev = revenue ?? 0;
  const ord = orders ?? 0;
  const avgOrder = ord > 0 ? rev / ord : 0;

  if (process.env.MIMIR_DEBUG === '1') {
    logger.info(
      {
        userId: uid,
        siteId: siteId ?? null,
        raw: { revenue, orders, products, pageViews, addToCart, checkout, seriesCount, cartItems, cartValue },
        computed: { totalRevenue: rev, avgOrderValue: Math.round(avgOrder) },
      },
      'mimirQuery: fetchLegacyDashboardMetrics raw results'
    );
  }

  const end = Math.floor(Date.now() / 1000);
  const start = end - 24 * 3600;

  const [timeseriesData, revenueOverTime, perfOverTime, errorsOverTime] = await Promise.all([
    queryRange(uid, `{__name__=~"user_metric_.+", ${userFilter}}`, start, end, 300),
    queryRange(uid, revenueSelector, start, end, 300),
    queryRange(uid, `avg(avg_over_time(user_metric_page_load_time{${userFilter}}[5m]))`, start, end, 300),
    queryRange(uid, `sum(increase(user_metric_javascript_errors{${userFilter}}[5m])) or vector(0)`, start, end, 300),
  ]);

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
      pageLoadTime: clampTimingMs(pageLoadTime),
      ttfb: clampTimingMs(ttfb),
      domContentLoaded: clampTimingMs(domContentLoaded),
      fcp: clampTimingMs(fcp),
      lcp: clampTimingMs(lcp),
      fid: clampTimingMs(fid),
      cls: clampTimingMs(cls, 10_000),
      jsErrors: Math.round(jsErrors ?? 0),
      promiseRejections: Math.round(promiseRejections ?? 0),
      avgScrollDepth: Math.round(scrollDepth ?? 0),
      avgMaxScrollDepth: Math.round(maxScrollDepth ?? 0),
      avgTimeOnPage: Math.round(timeOnPage ?? 0),
      totalInteractions: Math.round(interactions ?? 0),
    },
    timeseries: (timeseriesData || []).map((r) => ({
      metric: r.metric,
      values: (r.values || []).map(([t, v]) => ({ time: t, value: parseFloat(v) })),
    })),
    revenueOverTime: (revenueOverTime || []).flatMap((r) =>
      (r.values || []).map(([t, v]) => ({ time: Number(t), value: parseFloat(v) }))
    ),
    performanceOverTime: (perfOverTime || []).flatMap((r) =>
      (r.values || [])
        .map(([t, v]) => ({ time: Number(t), value: parseFloat(v) }))
        .filter((p) => p.value >= 0 && p.value <= MAX_REASONABLE_TIMING_MS)
    ),
    errorsOverTime: (errorsOverTime || []).flatMap((r) =>
      (r.values || []).map(([t, v]) => ({ time: Number(t), value: parseFloat(v) }))
    ),
  };
}

/**
 * Config-driven dashboard from dashboard_widgets rows (widget KPI contract).
 */
export async function fetchConfigDrivenDashboardMetrics(userId, siteId, widgets) {
  const uid = String(userId);
  const end = Math.floor(Date.now() / 1000);
  const start = end - 24 * 3600;
  const step = 300;

  const scalars = await Promise.all(widgets.map((w) => queryScalar(uid, promqlForWidget(w, userId, siteId))));

  const featuredJobs = widgets.map((w, i) => ({ w, i })).filter(({ w }) => w.featured_chart);
  const featuredRanges = await Promise.all(
    featuredJobs.map(({ w }) =>
      queryRange(uid, promqlRangeForMetricName(w.metric_name, userId, siteId), start, end, step)
    )
  );

  const featuredByIndex = new Map();
  featuredJobs.forEach((job, j) => {
    featuredByIndex.set(
      job.i,
      (featuredRanges[j] || []).flatMap((r) =>
        (r.values || []).map(([t, v]) => ({ time: Number(t), value: parseFloat(v) }))
      )
    );
  });

  const multiMetricNames = widgets.filter((w) => w.include_in_multi_chart).map((w) => w.metric_name);
  let multiSeries = [];
  if (multiMetricNames.length > 0) {
    const ts = await queryRange(
      uid,
      promqlMultiSeriesSelector(userId, siteId, multiMetricNames),
      start,
      end,
      step
    );
    multiSeries = (ts || []).map((r) => ({
      metric: r.metric,
      values: (r.values || []).map(([t, v]) => ({ time: t, value: parseFloat(v) })),
    }));
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
export async function fetchDashboardMetrics(userId, siteId = null) {
  const normalizedSite = normalizeSiteQueryParam(siteId);
  const widgets = await listDashboardWidgetsForScope(userId, normalizedSite);

  if (widgets.length > 0) {
    const cfg = await fetchConfigDrivenDashboardMetrics(userId, normalizedSite, widgets);
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
    const movie = await fetchMovieDashboardMetrics(userId, normalizedSite);
    return {
      dashboardMode: 'legacy',
      dashboardFlavor: 'movie',
      siteId: siteNum,
      ...movie,
    };
  }

  if (vertical === 'mixed') {
    const [eco, movie] = await Promise.all([
      fetchLegacyDashboardMetrics(userId, normalizedSite),
      fetchMovieDashboardMetrics(userId, normalizedSite),
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

  const legacy = await fetchLegacyDashboardMetrics(userId, normalizedSite);
  return {
    dashboardMode: 'legacy',
    dashboardFlavor: 'ecommerce',
    siteId: siteNum,
    ...legacy,
  };
}
