import { useState, useEffect, useCallback, useMemo } from 'react';
import { getDashboardMetrics } from '@/api/metrics';
import { sitesAPI } from '@/api/sites';
import { openPrimaryGrafanaWindow } from '@/api/grafana';
import { GrafanaDashboardEmbed } from '@/components/GrafanaDashboardEmbed/GrafanaDashboardEmbed';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/ToastContainer';
import './MetricsDashboard.css';

const REFRESH_MS = 15_000;

const StatCard = ({ title, value, subtitle, variant = 'default', icon }) => (
  <div className={`metrics-dashboard__stat metrics-dashboard__stat--${variant}`}>
    <div className="metrics-dashboard__stat-content">
      <p className="metrics-dashboard__stat-label">{title}</p>
      <p className="metrics-dashboard__stat-value">{value}</p>
      {subtitle && <p className="metrics-dashboard__stat-subtitle">{subtitle}</p>}
    </div>
    {icon && (
      <div className="metrics-dashboard__stat-icon" aria-hidden="true">
        {icon}
      </div>
    )}
  </div>
);

function formatWidgetValue(value, format, currencyCode) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  if (format === 'currency') {
    const code = currencyCode || 'USD';
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(safe);
    } catch {
      return `${code} ${safe.toLocaleString()}`;
    }
  }
  if (format === 'percent') return `${safe.toFixed(1)}%`;
  if (format === 'integer') return Math.round(safe).toLocaleString();
  return safe.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatDuration(seconds) {
  const n = Math.round(Number(seconds));
  if (!Number.isFinite(n) || n <= 0) return '0s';
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  const s = n % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function groupWidgetsBySection(widgets) {
  const m = new Map();
  for (const w of widgets) {
    const s = w.section || 'primary';
    if (!m.has(s)) m.set(s, []);
    m.get(s).push(w);
  }
  for (const [, arr] of m) {
    arr.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }
  return m;
}

function hasNonZeroStats(stats) {
  if (!stats || typeof stats !== 'object') return false;
  const keys = [
    'pageViews',
    'totalRevenue',
    'ordersCompleted',
    'ticketsSold',
    'metricSeriesCount',
    'bookNowClicks',
    'featuredBookClicks',
    'addToCart',
  ];
  return keys.some((k) => Number(stats[k]) > 0);
}

function hasAnyMetrics(data, flavor) {
  if (!data) return false;
  if (flavor === 'mixed') {
    return hasNonZeroStats(data.stats) || hasNonZeroStats(data.movieStats);
  }
  return hasNonZeroStats(data.stats);
}

function MetricsDashboard({ height = 500, showGrafanaLink = true, showGrafanaEmbed = true }) {
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    sitesAPI
      .getAll()
      .then((list) => {
        if (!cancelled) setSites(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setSites([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const sid = siteId === '' ? undefined : Number(siteId);
      const result = await getDashboardMetrics(sid);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err?.response?.status === 401 ? 'session' : 'fetch');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleOpenGrafana = async () => {
    try {
      const result = await openPrimaryGrafanaWindow({
        dashboard: 'metrics',
        from: 'now-24h',
        to: 'now',
        refresh: '15s',
        site_id: siteId || undefined,
      });
      if (result?.mode === 'standalone') {
        showToast(
          'Opened the standalone Grafana UI because the tenant embed path is not ready yet.',
          'info',
          4000
        );
      }
    } catch (err) {
      const isUnauthorized = err?.response?.status === 401;
      showToast(
        isUnauthorized
          ? 'Session expired. Please log in again to open Grafana.'
          : 'Unable to open Grafana. Please try again.',
        'error',
        4000
      );
    }
  };

  const widgetSections = useMemo(() => {
    if (data?.dashboardMode !== 'widgets' || !Array.isArray(data.widgets)) return null;
    return groupWidgetsBySection(data.widgets);
  }, [data]);

  if (loading && !data) {
    return (
      <div className="metrics-dashboard" style={{ minHeight: height }}>
        <div className="metrics-dashboard__skeleton">
          <Skeleton width="100%" height={height} />
        </div>
      </div>
    );
  }

  if (error === 'session') {
    return (
      <div className="metrics-dashboard metrics-dashboard--error">
        <p>Session expired. Please log in again.</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="metrics-dashboard metrics-dashboard--error">
        <p>Unable to load metrics. Ensure Mimir is running and your tracking code is integrated.</p>
        <button type="button" className="metrics-dashboard__retry" onClick={fetchData}>
          Retry
        </button>
      </div>
    );
  }

  const mode = data?.dashboardMode || 'legacy';
  const flavor = data?.dashboardFlavor ?? 'ecommerce';

  const movieKpis = flavor === 'mixed' ? data?.movieStats : data?.stats;

  const showLegacyEmpty = mode === 'legacy' && !hasAnyMetrics(data, flavor);

  const sectionTitle = (key) =>
    key === 'primary'
      ? 'Key metrics'
      : key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const embedMinHeight = Math.max(height, 480);
  const metricsScopeLabel = siteId ? 'the selected property' : 'all properties';
  const refreshMessage = showGrafanaEmbed
    ? `Summary cards poll every ${REFRESH_MS / 1000}s for ${metricsScopeLabel}. Grafana charts refresh every 15s and separate 24h KPIs from current cart and experience signals.`
    : `Summary cards poll every ${REFRESH_MS / 1000}s for ${metricsScopeLabel} and update automatically from the dashboard API.`;

  return (
    <div className="metrics-dashboard" style={{ minHeight: height }}>
      <div className="metrics-dashboard__header">
        <h3 className="metrics-dashboard__title">KPI summary</h3>
        <div className="metrics-dashboard__actions metrics-dashboard__actions--wrap">
          {sites.length > 0 && (
            <label className="metrics-dashboard__site-filter">
              <span className="metrics-dashboard__site-filter-label">Property</span>
              <select
                className="metrics-dashboard__site-select"
                value={siteId}
                onChange={(e) => {
                  setLoading(true);
                  setSiteId(e.target.value);
                }}
                aria-label="Filter dashboard by property"
              >
                <option value="">All properties</option>
                {sites.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="metrics-dashboard__refresh">{refreshMessage}</span>
          {showGrafanaLink && (
            <button
              type="button"
              className="metrics-dashboard__grafana-link"
              onClick={handleOpenGrafana}
            >
              Open Grafana workspace →
            </button>
          )}
        </div>
      </div>

      {mode === 'widgets' && widgetSections && (
        <>
          {[...widgetSections.entries()].map(([sectionKey, widgets]) => (
            <div key={sectionKey} className="metrics-dashboard__section">
              <h4 className="metrics-dashboard__section-title">{sectionTitle(sectionKey)}</h4>
              <div className="metrics-dashboard__stats-grid">
                {widgets.map((w) => (
                  <StatCard
                    key={w.id}
                    title={w.title}
                    value={formatWidgetValue(w.value, w.format, w.currencyCode)}
                    subtitle={w.subtitle}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {mode === 'legacy' && (
        <>
          {flavor === 'mixed' && (
            <div className="metrics-dashboard__vertical-label" role="status">
              <span className="metrics-dashboard__vertical-pill metrics-dashboard__vertical-pill--commerce">
                Commerce
              </span>
              <span className="metrics-dashboard__vertical-hint">Store funnel (24h)</span>
            </div>
          )}

          {(flavor === 'ecommerce' || flavor === 'mixed') && (
            <div className="metrics-dashboard__stats-grid">
              <StatCard
                title="Total Revenue (24h)"
                value={`NPR ${Number(data?.stats?.totalRevenue || 0).toLocaleString()}`}
                subtitle="From completed orders"
                variant="revenue"
              />
              <StatCard
                title="Orders Completed (24h)"
                value={Number(data?.stats?.ordersCompleted ?? 0).toLocaleString()}
                subtitle="Successful checkouts"
                variant="orders"
              />
              <StatCard
                title="Products Sold (24h)"
                value={Number(data?.stats?.productsSold ?? 0).toLocaleString()}
                subtitle="Total units"
                variant="products"
              />
              <StatCard
                title="Avg Order Value"
                value={`NPR ${Number(data?.stats?.avgOrderValue || 0).toLocaleString()}`}
                subtitle="Revenue ÷ orders"
                variant="avg"
              />
            </div>
          )}

          {(flavor === 'movie' || flavor === 'mixed') && (
            <>
              {flavor === 'mixed' && (
                <div className="metrics-dashboard__vertical-label metrics-dashboard__vertical-label--spaced">
                  <span className="metrics-dashboard__vertical-pill metrics-dashboard__vertical-pill--movie">
                    Ticketing
                  </span>
                  <span className="metrics-dashboard__vertical-hint">Cinema / events (24h)</span>
                </div>
              )}
              <div className="metrics-dashboard__stats-grid">
                <StatCard
                  title="Tickets completed (24h)"
                  value={Number(movieKpis?.ticketsSold ?? 0).toLocaleString()}
                  subtitle="Successful bookings"
                  variant="orders"
                />
                <StatCard
                  title="Book now clicks (24h)"
                  value={Number(movieKpis?.bookNowClicks ?? 0).toLocaleString()}
                  subtitle="From movie cards"
                  variant="products"
                />
                <StatCard
                  title="Featured booking clicks (24h)"
                  value={Number(movieKpis?.featuredBookClicks ?? 0).toLocaleString()}
                  subtitle="Hero CTA"
                  variant="avg"
                />
                <StatCard
                  title="Revenue attributed (24h)"
                  value={`NPR ${Number(movieKpis?.ticketRevenue ?? 0).toLocaleString()}`}
                  subtitle="If tracked as revenue metrics"
                  variant="revenue"
                />
              </div>
            </>
          )}

          {(flavor === 'ecommerce' || flavor === 'mixed') && (
            <>
              <div className="metrics-dashboard__stats-grid metrics-dashboard__stats-grid--secondary">
                <StatCard
                  title="Page Views (24h)"
                  value={Number(data?.stats?.pageViews ?? 0).toLocaleString()}
                />
                <StatCard
                  title="Add to Cart (24h)"
                  value={Number(data?.stats?.addToCart ?? 0).toLocaleString()}
                />
                <StatCard
                  title="Checkout Started (24h)"
                  value={Number(data?.stats?.checkoutStarted ?? 0).toLocaleString()}
                />
                <StatCard
                  title="Tracked Metrics"
                  value={Number(data?.stats?.metricSeriesCount ?? 0).toLocaleString()}
                  subtitle="Distinct names"
                />
              </div>

              <div className="metrics-dashboard__stats-grid metrics-dashboard__stats-grid--compact">
                <StatCard
                  title="Cart Items"
                  value={Number(data?.stats?.cartItemsCount ?? 0).toLocaleString()}
                />
                <StatCard
                  title="Cart Value (NPR)"
                  value={Number(data?.stats?.cartValueTotal || 0).toLocaleString()}
                />
              </div>
            </>
          )}

          {flavor === 'movie' && (
            <div className="metrics-dashboard__stats-grid metrics-dashboard__stats-grid--secondary">
              <StatCard
                title="Page Views (24h)"
                value={Number(data?.stats?.pageViews ?? 0).toLocaleString()}
              />
              <StatCard
                title="Tracked Metrics"
                value={Number(data?.stats?.metricSeriesCount ?? 0).toLocaleString()}
                subtitle="Distinct names"
              />
            </div>
          )}

          <div className="metrics-dashboard__section-divider">
            <h4 className="metrics-dashboard__section-heading">Errors</h4>
          </div>
          <div className="metrics-dashboard__stats-grid metrics-dashboard__stats-grid--compact">
            <StatCard
              title="JS Errors (24h)"
              value={Number(data?.stats?.jsErrors ?? 0).toLocaleString()}
              subtitle="Window error events"
              variant="error"
            />
            <StatCard
              title="Promise Rejections (24h)"
              value={Number(data?.stats?.promiseRejections ?? 0).toLocaleString()}
              subtitle="Unhandled rejections"
              variant="error"
            />
          </div>

          <div className="metrics-dashboard__section-divider">
            <h4 className="metrics-dashboard__section-heading">User Engagement</h4>
          </div>
          <div className="metrics-dashboard__stats-grid">
            <StatCard
              title="Avg Scroll Depth"
              value={`${Number(data?.stats?.avgScrollDepth ?? 0)}%`}
              subtitle="All sessions (24h)"
              variant="engagement"
            />
            <StatCard
              title="Max Scroll Depth"
              value={`${Number(data?.stats?.avgMaxScrollDepth ?? 0)}%`}
              subtitle="Average peak"
              variant="engagement"
            />
            <StatCard
              title="Avg Time on Page"
              value={formatDuration(data?.stats?.avgTimeOnPage ?? 0)}
              subtitle="24h average"
              variant="engagement"
            />
            <StatCard
              title="Interactions (24h)"
              value={Number(data?.stats?.totalInteractions ?? 0).toLocaleString()}
              subtitle="Clicks and inputs"
              variant="engagement"
            />
          </div>
        </>
      )}

      {showGrafanaEmbed && (
        <>
          <div className="metrics-dashboard__section-divider metrics-dashboard__grafana-block">
            <h4 className="metrics-dashboard__section-heading">
              Primary charts &amp; time series (Grafana)
            </h4>
            <p className="metrics-dashboard__grafana-note">
              Grafana is the primary visualization surface. These KPI cards are lightweight
              summaries from the dashboard API; tenant isolation still comes from the Vizme proxy
              and server-side <code>X-Scope-OrgID</code> handling.
            </p>
          </div>
          <GrafanaDashboardEmbed
            minHeight={embedMinHeight}
            from="now-24h"
            to="now"
            siteId={siteId}
          />
        </>
      )}

      {mode === 'legacy' && showLegacyEmpty && (
        <div className="metrics-dashboard__empty">
          <p>No metrics data yet. Integrate the tracking code and start sending events.</p>
        </div>
      )}
    </div>
  );
}

export { MetricsDashboard };
export default MetricsDashboard;
