import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import { getDashboardMetrics } from '@/api/metrics';
import { sitesAPI } from '@/api/sites';
import { Skeleton } from '@/components/Skeleton';
import { getEmbedUrl } from '@/api/grafana';
import './MetricsDashboard.css';

const REFRESH_MS = 15_000;
const MAX_MULTI_SERIES = 5;
const MAX_TIMING_MS = 120_000;
const MAX_CLS_RAW = 10_000;

const CHART_COLORS = ['var(--primary)', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

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

const formatTime = (ts) => {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

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

function formatMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0 || n > MAX_TIMING_MS) return '—';
  if (n === 0) return '0 ms';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)} ms`;
}

function formatCLS(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > MAX_CLS_RAW) return '—';
  return (n / 1000).toFixed(2);
}

function formatDuration(seconds) {
  const n = Math.round(Number(seconds));
  if (!Number.isFinite(n) || n <= 0) return '0s';
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  const s = n % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

const PERF_VITALS_CONFIG = [
  { key: 'pageLoadTime', label: 'Page Load', subtitle: '24h average', good: 2500, poor: 4000 },
  { key: 'ttfb', label: 'TTFB', subtitle: 'Time to first byte', good: 800, poor: 1800 },
  { key: 'domContentLoaded', label: 'DOM Ready', subtitle: 'DOMContentLoaded', good: 1500, poor: 3000 },
  { key: 'fcp', label: 'FCP', subtitle: 'First contentful paint', good: 1800, poor: 3000 },
  { key: 'lcp', label: 'LCP', subtitle: 'Largest contentful paint', good: 2500, poor: 4000 },
  { key: 'fid', label: 'FID', subtitle: 'First input delay', good: 100, poor: 300 },
  { key: 'cls', label: 'CLS', subtitle: 'Cumulative layout shift', good: 100, poor: 250, isCLS: true },
];

function computePerfScore(rawValue, good, poor, isCLS) {
  const v = Number(rawValue);
  const max = isCLS ? MAX_CLS_RAW : MAX_TIMING_MS;
  if (!Number.isFinite(v) || v < 0 || v > max) return null;
  if (v === 0) return 100;
  if (v <= good) return Math.round(90 + (1 - v / good) * 10);
  if (v <= poor) return Math.round(50 + ((poor - v) / (poor - good)) * 40);
  return Math.max(0, Math.round(50 * Math.max(0, 1 - (v - poor) / poor)));
}

function getScoreColor(score) {
  if (score >= 90) return '#0cce6b';
  if (score >= 50) return '#ffa400';
  return '#ff4e42';
}

function getScoreRating(score) {
  if (score >= 90) return 'Good';
  if (score >= 50) return 'Needs Improvement';
  return 'Poor';
}

const PerfVitalsTooltip = ({ active, allMetrics }) => {
  if (!active || !allMetrics?.length) return null;
  return (
    <div className="perf-vitals-tooltip">
      <p className="perf-vitals-tooltip__title">Performance &amp; Web Vitals</p>
      <div className="perf-vitals-tooltip__metrics">
        {allMetrics.map((m) => (
          <div key={m.label} className="perf-vitals-tooltip__row">
            <span
              className="perf-vitals-tooltip__indicator"
              style={{ backgroundColor: m.color }}
            />
            <span className="perf-vitals-tooltip__label">{m.label}</span>
            <span className="perf-vitals-tooltip__value">{m.rawValue}</span>
            <span
              className="perf-vitals-tooltip__rating"
              style={{ color: m.color }}
            >
              {m.rating}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

function buildTimeseriesChartRows(timeseries) {
  const hasTimeseries = timeseries.some((ts) => ts.values?.length > 0);
  if (!hasTimeseries) return [];
  const byTime = new Map();
  for (const ts of timeseries) {
    const name = ts.metric?.__name__ || 'metric';
    for (const v of ts.values || []) {
      const key = formatTime(v.time);
      if (!byTime.has(key)) byTime.set(key, { time: key, sortKey: v.time });
      byTime.get(key)[name] = v.value;
    }
  }
  return Array.from(byTime.values())
    .sort((a, b) => (a.sortKey || 0) - (b.sortKey || 0))
    .map(({ sortKey, ...rest }) => rest);
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

function MetricsDashboard({ height = 500, showGrafanaLink = true }) {
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
      const result = await getEmbedUrl({
        dashboard: 'metrics',
        from: 'now-24h',
        to: 'now',
        refresh: '10s',
        kiosk: 'tv',
      });
      if (result?.url) window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch {
      window.open('/grafana', '_blank', 'noopener,noreferrer');
    }
  };

  const widgetSections = useMemo(() => {
    if (data?.dashboardMode !== 'widgets' || !Array.isArray(data.widgets)) return null;
    return groupWidgetsBySection(data.widgets);
  }, [data]);

  const multiSeriesRows = useMemo(
    () => buildTimeseriesChartRows(data?.multiSeries || data?.timeseries || []),
    [data]
  );

  const perfVitalsData = useMemo(() => {
    const stats = data?.stats || {};
    return PERF_VITALS_CONFIG.map((cfg) => {
      const raw = stats[cfg.key] ?? 0;
      const score = computePerfScore(raw, cfg.good, cfg.poor, cfg.isCLS);
      const valid = score !== null;
      return {
        label: cfg.label,
        score: valid ? score : 0,
        rawValue: valid ? (cfg.isCLS ? formatCLS(raw) : formatMs(raw)) : '—',
        rating: valid ? getScoreRating(score) : 'No Data',
        subtitle: cfg.subtitle,
        color: valid ? getScoreColor(score) : 'var(--text-tertiary)',
        valid,
      };
    });
  }, [data]);

  const overallPerfScore = useMemo(() => {
    const validMetrics = perfVitalsData.filter((m) => m.valid);
    if (!validMetrics.length) return 0;
    return Math.round(validMetrics.reduce((sum, m) => sum + m.score, 0) / validMetrics.length);
  }, [perfVitalsData]);

  const hasMultiData = multiSeriesRows.length > 0;

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
  const revenueOverTime = data?.revenueOverTime ?? [];
  const legacyChartData = revenueOverTime
    .sort((a, b) => a.time - b.time)
    .map(({ time, value }) => ({ time: formatTime(time), value, fullTime: time }));

  const perfChartData = (data?.performanceOverTime ?? [])
    .sort((a, b) => a.time - b.time)
    .map(({ time, value }) => ({ time: formatTime(time), value: Math.round(value) }));

  const errorsChartData = (data?.errorsOverTime ?? [])
    .sort((a, b) => a.time - b.time)
    .map(({ time, value }) => ({ time: formatTime(time), value: Math.round(value) }));

  const featuredWidgets =
    mode === 'widgets' && Array.isArray(data.widgets)
      ? data.widgets.filter((w) => w.featuredChart && w.featuredSeries?.length > 0)
      : [];

  const sectionTitle = (key) =>
    key === 'primary'
      ? 'Key metrics'
      : key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const legacyEmpty = mode === 'legacy' && !legacyChartData.length && !hasMultiData;

  return (
    <div className="metrics-dashboard" style={{ minHeight: height }}>
      <div className="metrics-dashboard__header">
        <h3 className="metrics-dashboard__title">Metrics Overview</h3>
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
          <span className="metrics-dashboard__refresh">Auto-refresh: 15s</span>
          {showGrafanaLink && (
            <button
              type="button"
              className="metrics-dashboard__grafana-link"
              onClick={handleOpenGrafana}
            >
              Open in Grafana →
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

          {featuredWidgets.map((w) => {
            const chartData = (w.featuredSeries || [])
              .sort((a, b) => a.time - b.time)
              .map((p) => ({ time: formatTime(p.time), value: p.value }));
            if (!chartData.length) return null;
            return (
              <div key={`feat-${w.id}`} className="metrics-dashboard__chart">
                <h4 className="metrics-dashboard__chart-title">{w.title} (24h)</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`grad-${w.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.6} />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                      stroke="var(--border-color)"
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                      stroke="var(--border-color)"
                      width={48}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 8,
                        boxShadow: 'var(--shadow-lg)',
                      }}
                      formatter={(v) => [formatWidgetValue(v, w.format, w.currencyCode), w.title]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fill={`url(#grad-${w.id})`}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            );
          })}

          {hasMultiData && (() => {
            const metricKeys = Object.keys(multiSeriesRows[0] || {}).filter((k) => k !== 'time');
            const keys = metricKeys.slice(0, MAX_MULTI_SERIES);
            return (
              <div className="metrics-dashboard__chart">
                <h4 className="metrics-dashboard__chart-title">Metrics over time</h4>
                <p className="metrics-dashboard__chart-subtitle">
                  Metrics flagged &quot;Include in multi-chart&quot; (up to {MAX_MULTI_SERIES} series
                  shown)
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={multiSeriesRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.6} />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                      stroke="var(--border-color)"
                      minTickGap={28}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                      stroke="var(--border-color)"
                      width={44}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 8,
                        boxShadow: 'var(--shadow-lg)',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {keys.map((key, i) => (
                      <Area
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={CHART_COLORS[i % CHART_COLORS.length]}
                        strokeWidth={1.5}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        fillOpacity={0.12}
                        name={key.replace(/^user_metric_/, '')}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            );
          })()}
        </>
      )}

      {mode === 'legacy' && (
        <>
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
              title="Metric Series"
              value={Number(data?.stats?.metricSeriesCount ?? 0).toLocaleString()}
              subtitle="Active"
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

          <div className="metrics-dashboard__section-divider">
            <h4 className="metrics-dashboard__section-heading">
              Performance &amp; Web Vitals
              <span
                className="metrics-dashboard__perf-badge"
                style={{ color: getScoreColor(overallPerfScore), borderColor: getScoreColor(overallPerfScore) }}
              >
                {overallPerfScore}
              </span>
            </h4>
          </div>
          <div className="metrics-dashboard__perf-chart">
            <ResponsiveContainer width="100%" height={340}>
              <RadarChart data={perfVitalsData} outerRadius="70%">
                <PolarGrid stroke="var(--border-color)" />
                <PolarAngleAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                />
                <PolarRadiusAxis
                  domain={[0, 100]}
                  tick={false}
                  axisLine={false}
                />
                <Radar
                  dataKey="score"
                  stroke="#06b6d4"
                  fill="#06b6d4"
                  fillOpacity={0.25}
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#06b6d4', strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#06b6d4', strokeWidth: 2, stroke: '#fff' }}
                />
                <Tooltip content={<PerfVitalsTooltip allMetrics={perfVitalsData} />} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="metrics-dashboard__section-divider">
            <h4 className="metrics-dashboard__section-heading">Errors</h4>
          </div>
          <div className="metrics-dashboard__stats-grid metrics-dashboard__stats-grid--compact">
            <StatCard title="JS Errors (24h)" value={Number(data?.stats?.jsErrors ?? 0).toLocaleString()} subtitle="Window error events" variant="error" />
            <StatCard title="Promise Rejections (24h)" value={Number(data?.stats?.promiseRejections ?? 0).toLocaleString()} subtitle="Unhandled rejections" variant="error" />
          </div>

          <div className="metrics-dashboard__section-divider">
            <h4 className="metrics-dashboard__section-heading">User Engagement</h4>
          </div>
          <div className="metrics-dashboard__stats-grid">
            <StatCard title="Avg Scroll Depth" value={`${Number(data?.stats?.avgScrollDepth ?? 0)}%`} subtitle="All sessions (24h)" variant="engagement" />
            <StatCard title="Max Scroll Depth" value={`${Number(data?.stats?.avgMaxScrollDepth ?? 0)}%`} subtitle="Average peak" variant="engagement" />
            <StatCard title="Avg Time on Page" value={formatDuration(data?.stats?.avgTimeOnPage ?? 0)} subtitle="24h average" variant="engagement" />
            <StatCard title="Interactions (24h)" value={Number(data?.stats?.totalInteractions ?? 0).toLocaleString()} subtitle="Clicks and inputs" variant="engagement" />
          </div>

          {legacyChartData.length > 0 && (
            <div className="metrics-dashboard__chart">
              <h4 className="metrics-dashboard__chart-title">Revenue Over Time (24h)</h4>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={legacyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.6} />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                    stroke="var(--border-color)"
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                    stroke="var(--border-color)"
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
                    width={48}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      boxShadow: 'var(--shadow-lg)',
                    }}
                    labelStyle={{ color: 'var(--text-primary)' }}
                    formatter={(value) => [`NPR ${Number(value).toLocaleString()}`, 'Revenue']}
                    labelFormatter={(label) => `Time: ${label}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fill="url(#revenueGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {perfChartData.length > 0 && (
            <div className="metrics-dashboard__chart">
              <h4 className="metrics-dashboard__chart-title">Page Load Time (24h)</h4>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={perfChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="perfGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.6} />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                    stroke="var(--border-color)"
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                    stroke="var(--border-color)"
                    tickFormatter={(v) => `${v}ms`}
                    width={56}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      boxShadow: 'var(--shadow-lg)',
                    }}
                    formatter={(value) => [`${Number(value).toLocaleString()} ms`, 'Page Load']}
                    labelFormatter={(label) => `Time: ${label}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    fill="url(#perfGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {errorsChartData.length > 0 && (
            <div className="metrics-dashboard__chart">
              <h4 className="metrics-dashboard__chart-title">Errors Over Time (24h)</h4>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={errorsChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="errorsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.6} />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                    stroke="var(--border-color)"
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                    stroke="var(--border-color)"
                    width={40}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      boxShadow: 'var(--shadow-lg)',
                    }}
                    formatter={(value) => [Number(value).toLocaleString(), 'JS Errors']}
                    labelFormatter={(label) => `Time: ${label}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#ef4444"
                    strokeWidth={2}
                    fill="url(#errorsGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {hasMultiData && (() => {
            const metricKeys = Object.keys(multiSeriesRows[0] || {}).filter((k) => k !== 'time');
            return (
              <div className="metrics-dashboard__chart">
                <h4 className="metrics-dashboard__chart-title">User Metrics Over Time</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={multiSeriesRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.6} />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                      stroke="var(--border-color)"
                      minTickGap={28}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                      stroke="var(--border-color)"
                      width={44}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 8,
                        boxShadow: 'var(--shadow-lg)',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {metricKeys.slice(0, MAX_MULTI_SERIES).map((key, i) => (
                      <Area
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={CHART_COLORS[i % CHART_COLORS.length]}
                        strokeWidth={1.5}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        fillOpacity={0.15}
                        name={key.replace(/^user_metric_/, '')}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            );
          })()}
        </>
      )}

      {legacyEmpty && (
        <div className="metrics-dashboard__empty">
          <p>No metrics data yet. Integrate the tracking code and start sending events.</p>
        </div>
      )}
    </div>
  );
}

export { MetricsDashboard };
export default MetricsDashboard;
