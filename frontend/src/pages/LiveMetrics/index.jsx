import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getEmbedUrl } from '@/api/grafana';
import { BarChartIcon, ArrowBackIcon, RefreshIcon } from '@/assets/icons';
import { MetricsDashboard } from '@/components/MetricsDashboard';
import { useToast } from '@/components/ToastContainer';
import '@/pages/Dashboard/Dashboard.css';
import './LiveMetrics.css';

const PAGE_TITLE = 'Live Metrics · Vizme';

function LiveMetrics() {
  const { showToast } = useToast();

  useEffect(() => {
    const previous = document.title;
    document.title = PAGE_TITLE;
    return () => {
      document.title = previous;
    };
  }, []);

  const handleOpenGrafana = async () => {
    try {
      const url = await getEmbedUrl({
        dashboard: 'metrics',
        from: 'now-1h',
        to: 'now',
        refresh: '10s',
        kiosk: 'tv',
      });
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      const isUnauthorized = err.response?.status === 401;
      showToast(
        isUnauthorized
          ? 'Session expired. Please log in again to open Grafana.'
          : 'Unable to load Grafana. Please try again.',
        'error',
        4000
      );
    }
  };

  return (
    <div className="live-metrics-page">
      <div className="live-metrics-page__toolbar">
        <Link to="/" className="live-metrics-page__back">
          <ArrowBackIcon size={18} aria-hidden />
          <span>Back to overview</span>
        </Link>
      </div>

      <header className="live-metrics-hero">
        <div className="live-metrics-hero__intro">
          <div className="live-metrics-hero__icon" aria-hidden>
            <BarChartIcon size={28} />
          </div>
          <div className="live-metrics-hero__titles">
            <h1 className="live-metrics-hero__title">Live Metrics</h1>
            <p className="live-metrics-hero__subtitle">
              Real-time telemetry from your instrumented applications. Charts refresh on a short
              interval; open Grafana for saved views and alerting.
            </p>
          </div>
        </div>
        <div className="live-metrics-hero__actions">
          <Link to="/metric-configs" className="live-metrics-page__btn-secondary">
            Metric configs
          </Link>
          <button type="button" className="live-metrics-page__btn-primary" onClick={handleOpenGrafana}>
            Open Grafana
          </button>
        </div>
      </header>

      <div className="live-metrics-page__meta" aria-label="Data freshness">
        <span>
          <span className="live-metrics-page__meta-dot" aria-hidden />
          Auto-refresh on charts (~15s)
        </span>
        <span>
          <RefreshIcon size={14} aria-hidden style={{ opacity: 0.8 }} />
          Filter by property in the panel below when multiple sites exist
        </span>
      </div>

      <section
        className="metrics-visualization live-metrics-page__panel"
        aria-labelledby="live-metrics-panel-heading"
      >
        <div className="metrics-visualization__header">
          <div>
            <h2 id="live-metrics-panel-heading">Telemetry overview</h2>
            <p className="metrics-visualization__subtitle">
              Aggregates for your workspace (legacy ecommerce metrics and configured dashboard
              widgets).
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenGrafana}
            className="metrics-visualization__link button-as-link"
          >
            Full dashboard in Grafana →
          </button>
        </div>

        <div className="metrics-visualization__container">
          <MetricsDashboard height={560} showGrafanaLink />
        </div>

        <p className="metrics-visualization__hint">
          No data yet? Add metric configurations, create an API key, integrate the SDK, and send a
          few events—then return here or open Grafana.
        </p>
      </section>
    </div>
  );
}

export default LiveMetrics;
