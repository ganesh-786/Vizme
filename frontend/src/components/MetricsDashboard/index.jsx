import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { getDashboardMetrics } from '@/api/metrics';
import { Skeleton } from '@/components/Skeleton';
import { getEmbedUrl } from '@/api/grafana';
import './MetricsDashboard.css';

const REFRESH_MS = 15_000; // 15s

const StatCard = ({ title, value, subtitle, variant = 'default', icon }) => (
  <div className={`metrics-dashboard__stat metrics-dashboard__stat--${variant}`}>
    <div className="metrics-dashboard__stat-content">
      <p className="metrics-dashboard__stat-label">{title}</p>
      <p className="metrics-dashboard__stat-value">{value}</p>
      {subtitle && <p className="metrics-dashboard__stat-subtitle">{subtitle}</p>}
    </div>
    {icon && <div className="metrics-dashboard__stat-icon" aria-hidden="true">{icon}</div>}
  </div>
);

const formatTime = (ts) => {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

function MetricsDashboard({ height = 500, showGrafanaLink = true }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const result = await getDashboardMetrics();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err?.response?.status === 401 ? 'session' : 'fetch');
    } finally {
      setLoading(false);
    }
  }, []);

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
      // Fallback: open Grafana root
      window.open('/grafana', '_blank', 'noopener,noreferrer');
    }
  };

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

  const stats = data?.stats ?? {};
  const revenueOverTime = data?.revenueOverTime ?? [];
  const timeseries = data?.timeseries ?? [];

  const chartData = revenueOverTime
    .sort((a, b) => a.time - b.time)
    .map(({ time, value }) => ({ time: formatTime(time), value, fullTime: time }));

  const hasTimeseries = timeseries.some((ts) => ts.values?.length > 0);
  const timeseriesChartData = hasTimeseries
    ? (() => {
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
      })()
    : [];

  return (
    <div className="metrics-dashboard" style={{ minHeight: height }}>
      <div className="metrics-dashboard__header">
        <h3 className="metrics-dashboard__title">Metrics Overview</h3>
        <div className="metrics-dashboard__actions">
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

      {/* E-commerce stats */}
      <div className="metrics-dashboard__stats-grid">
        <StatCard
          title="Total Revenue (24h)"
          value={`NPR ${Number(stats.totalRevenue || 0).toLocaleString()}`}
          subtitle="From completed orders"
          variant="revenue"
        />
        <StatCard
          title="Orders Completed (24h)"
          value={stats.ordersCompleted ?? 0}
          subtitle="Successful checkouts"
          variant="orders"
        />
        <StatCard
          title="Products Sold (24h)"
          value={stats.productsSold ?? 0}
          subtitle="Total units"
          variant="products"
        />
        <StatCard
          title="Avg Order Value"
          value={`NPR ${Number(stats.avgOrderValue || 0).toLocaleString()}`}
          subtitle="Revenue ÷ orders"
          variant="avg"
        />
      </div>

      {/* Engagement stats */}
      <div className="metrics-dashboard__stats-grid metrics-dashboard__stats-grid--secondary">
        <StatCard title="Page Views (24h)" value={stats.pageViews ?? 0} />
        <StatCard title="Add to Cart (24h)" value={stats.addToCart ?? 0} />
        <StatCard title="Checkout Started (24h)" value={stats.checkoutStarted ?? 0} />
        <StatCard title="Metric Series" value={stats.metricSeriesCount ?? 0} subtitle="Active" />
      </div>

      {/* Cart snapshot */}
      <div className="metrics-dashboard__stats-grid metrics-dashboard__stats-grid--compact">
        <StatCard title="Cart Items" value={stats.cartItemsCount ?? 0} />
        <StatCard title="Cart Value (NPR)" value={Number(stats.cartValueTotal || 0).toLocaleString()} />
      </div>

      {/* Revenue over time chart */}
      {chartData.length > 0 && (
        <div className="metrics-dashboard__chart">
          <h4 className="metrics-dashboard__chart-title">Revenue Over Time (24h)</h4>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                stroke="var(--border-color)"
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
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

      {/* User metrics over time (if available) - show up to 5 metrics */}
      {hasTimeseries && timeseriesChartData.length > 0 && (() => {
        const metricKeys = Object.keys(timeseriesChartData[0] || {}).filter((k) => k !== 'time');
        const colors = ['var(--primary)', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
        return (
          <div className="metrics-dashboard__chart">
            <h4 className="metrics-dashboard__chart-title">User Metrics Over Time</h4>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={timeseriesChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.6} />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                  stroke="var(--border-color)"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                  stroke="var(--border-color)"
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 8,
                    boxShadow: 'var(--shadow-lg)',
                  }}
                />
                <Legend />
                {metricKeys.slice(0, 5).map((key, i) => (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={colors[i % colors.length]}
                    strokeWidth={1.5}
                    fill={colors[i % colors.length]}
                    fillOpacity={0.15}
                    name={key.replace(/^user_metric_/, '')}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      {!chartData.length && !hasTimeseries && (
        <div className="metrics-dashboard__empty">
          <p>No metrics data yet. Integrate the tracking code and start sending events.</p>
        </div>
      )}
    </div>
  );
}

export { MetricsDashboard };
export default MetricsDashboard;
