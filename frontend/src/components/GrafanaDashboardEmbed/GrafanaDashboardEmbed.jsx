import { useState, useEffect, useCallback, useRef } from 'react';
import { getEmbedUrl, openPrimaryGrafanaWindow } from '@/api/grafana';
import { Skeleton } from '@/components/Skeleton';
import './GrafanaDashboardEmbed.css';

const DEFAULT_ROTATE_MS = 10 * 60 * 1000;

/**
 * Embeds the tenant-scoped Grafana dashboard (uid: metrics) in an iframe.
 * The browser never sends X-Scope-OrgID to Mimir: the embed JWT is validated by the
 * Vizme proxy, which sets org context and forwards Mimir queries with the correct tenant header.
 */
function GrafanaDashboardEmbed({
  dashboard = 'metrics',
  from = 'now-24h',
  to = 'now',
  refresh = '15s',
  kiosk = 'tv',
  siteId = '',
  minHeight = 520,
  title = 'Metrics charts (Grafana)',
  className = '',
}) {
  const [embedUrl, setEmbedUrl] = useState(null);
  const [error, setError] = useState(null);
  const [errorDetail, setErrorDetail] = useState('');
  const [loading, setLoading] = useState(true);
  const [rotateMs, setRotateMs] = useState(DEFAULT_ROTATE_MS);
  const hasEmbedRef = useRef(false);

  const fetchEmbed = useCallback(async () => {
    try {
      const result = await getEmbedUrl({
        dashboard,
        from,
        to,
        refresh,
        kiosk,
        site_id: siteId || undefined,
      });
      if (result?.url) {
        hasEmbedRef.current = true;
        setEmbedUrl(result.url);
        setRotateMs(result.refreshIntervalMs || DEFAULT_ROTATE_MS);
        setError(null);
        setErrorDetail('');
        return true;
      }
      if (!hasEmbedRef.current) setError('no-url');
      return false;
    } catch (e) {
      const status = e?.response?.status;
      const apiMsg =
        e?.response?.data?.message || e?.response?.data?.error || e?.response?.data?.data?.message;
      if (status === 401) {
        hasEmbedRef.current = false;
        setError('session');
        setErrorDetail('');
      } else if (!hasEmbedRef.current) {
        setError(status === 503 ? 'unavailable' : 'fetch');
        setErrorDetail(typeof apiMsg === 'string' ? apiMsg : '');
      }
      return false;
    }
  }, [dashboard, from, to, refresh, kiosk, siteId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await fetchEmbed();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchEmbed]);

  useEffect(() => {
    if (!embedUrl || error === 'session') return undefined;
    const id = setInterval(() => {
      fetchEmbed();
    }, rotateMs);
    return () => clearInterval(id);
  }, [embedUrl, error, rotateMs, fetchEmbed]);

  if (loading && !embedUrl) {
    return (
      <div className={`grafana-dashboard-embed ${className}`.trim()} style={{ minHeight }}>
        <Skeleton width="100%" height={minHeight} />
      </div>
    );
  }

  if (error === 'session') {
    return (
      <div className={`grafana-dashboard-embed grafana-dashboard-embed--error ${className}`.trim()}>
        <p>Session expired. Sign in again to load Grafana.</p>
      </div>
    );
  }

  if (error && !embedUrl) {
    const defaultMsg =
      error === 'unavailable'
        ? 'Grafana is not ready or the metrics dashboard is missing.'
        : 'Could not load Grafana embed. Ensure the backend and Grafana are reachable.';
    return (
      <div className={`grafana-dashboard-embed grafana-dashboard-embed--error ${className}`.trim()}>
        <p>{errorDetail || defaultMsg}</p>
        <p className="grafana-dashboard-embed__hint">
          Grafana remains the primary visualization surface. If the iframe path is unavailable, open
          the full Grafana UI in a new tab.
        </p>
        <div className="grafana-dashboard-embed__actions">
          <button
            type="button"
            className="grafana-dashboard-embed__retry"
            onClick={() => fetchEmbed()}
          >
            Retry
          </button>
          <button
            type="button"
            className="grafana-dashboard-embed__retry"
            onClick={async () => {
              try {
                await openPrimaryGrafanaWindow({
                  dashboard,
                  from,
                  to,
                  refresh,
                  site_id: siteId || undefined,
                });
              } catch (e) {
                if (e?.response?.status === 401) {
                  hasEmbedRef.current = false;
                  setError('session');
                  setErrorDetail('');
                }
              }
            }}
          >
            Open Grafana
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`grafana-dashboard-embed ${className}`.trim()}>
      <iframe
        title={title}
        className="grafana-dashboard-embed__frame"
        src={embedUrl}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="fullscreen"
        style={{ minHeight }}
      />
    </div>
  );
}

export { GrafanaDashboardEmbed };
export default GrafanaDashboardEmbed;
