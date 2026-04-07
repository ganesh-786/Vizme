import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { openPrimaryGrafanaWindow } from '@/api/grafana';
import { ArrowBackIcon } from '@/assets/icons';
import { GrafanaDashboardEmbed } from '@/components/GrafanaDashboardEmbed/GrafanaDashboardEmbed';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/ToastContainer';
import '@/pages/Dashboard/Dashboard.css';
import './LiveMetrics.css';

const PAGE_TITLE = 'Live Metrics · Vizme';
const GRAFANA_SECTION_MIN_HEIGHT = 560;

function LiveMetrics() {
  const { showToast } = useToast();
  const grafanaSectionRef = useRef(null);
  const [grafanaSectionVisible, setGrafanaSectionVisible] = useState(false);

  useEffect(() => {
    const previous = document.title;
    document.title = PAGE_TITLE;
    return () => {
      document.title = previous;
    };
  }, []);

  /** Delay iframe work until the Grafana section is near the viewport. */
  useEffect(() => {
    const el = grafanaSectionRef.current;
    if (!el) return undefined;

    const margin = 180;
    const maybeVisible = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      if (rect.top < vh + margin && rect.bottom > -margin) setGrafanaSectionVisible(true);
    };
    maybeVisible();

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setGrafanaSectionVisible(true);
      },
      { root: null, rootMargin: `${margin}px 0px`, threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleOpenGrafana = async () => {
    try {
      const result = await openPrimaryGrafanaWindow({
        dashboard: 'metrics',
        from: 'now-24h',
        to: 'now',
        refresh: '15s',
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
          <div className="live-metrics-hero__titles">
            <h1 className="live-metrics-hero__title">Live Metrics</h1>
            <p className="live-metrics-hero__subtitle">
              Grafana workspace for tenant-scoped charts and time series. Open the full UI in a new
              tab if the embed path is unavailable.
            </p>
          </div>
        </div>
        <div className="live-metrics-hero__actions">
          <Link to="/metric-configs" className="live-metrics-page__btn-secondary">
            Metric configs
          </Link>
          <button type="button" className="live-metrics-page__btn-primary" onClick={handleOpenGrafana}>
            Open Grafana workspace
          </button>
        </div>
      </header>

      <div className="live-metrics-page__meta" aria-label="Data freshness">
        <span>
          <span className="live-metrics-page__meta-dot" aria-hidden />
          Embedded Grafana refreshes every 15 seconds
        </span>
        <span>
          Tenant scoping is enforced server-side for this workspace
        </span>
      </div>

      <section
        ref={grafanaSectionRef}
        className="metrics-visualization live-metrics-page__panel"
        aria-labelledby="live-metrics-panel-heading"
      >
        <div className="metrics-visualization__header">
          <div>
            <h2 id="live-metrics-panel-heading">Grafana workspace</h2>
            <p className="metrics-visualization__subtitle">
              Live Metrics now hosts the primary Grafana workspace for telemetry charts and time
              series.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenGrafana}
            className="metrics-visualization__link button-as-link"
          >
            Open in new tab →
          </button>
        </div>

        <div className="metrics-visualization__container">
          {grafanaSectionVisible ? (
            <GrafanaDashboardEmbed
              minHeight={GRAFANA_SECTION_MIN_HEIGHT}
              title="Grafana metrics dashboard"
              kiosk="tv"
            />
          ) : (
            <div
              className="dashboard-grafana__placeholder"
              style={{ minHeight: GRAFANA_SECTION_MIN_HEIGHT }}
              aria-hidden
            >
              <Skeleton width="100%" height={GRAFANA_SECTION_MIN_HEIGHT} />
            </div>
          )}
        </div>

        <p className="metrics-visualization__hint">
          If the embed path is unavailable, use the button above to open the full Grafana UI.
        </p>
      </section>
    </div>
  );
}

export default LiveMetrics;
