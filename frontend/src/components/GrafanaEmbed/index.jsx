import { useState, useEffect } from 'react';
import { Skeleton } from '@/components/Skeleton';
import { getEmbedUrl } from '@/api/grafana';
import { useToast } from '@/components/ToastContainer';
import { getApiBaseUrl } from '@/config/env';
import './GrafanaEmbed.css';

/**
 * GrafanaEmbed - Embeds Grafana dashboards via backend proxy with user isolation.
 * Fetches a signed embed URL from the API; only the authenticated user's metrics are shown.
 *
 * @param {string} dashboardUid - The unique identifier of the Grafana dashboard
 * @param {number} panelId - Optional panel ID to embed a specific panel (uses d-solo endpoint)
 * @param {string} from - Time range start (default: 'now-1h')
 * @param {string} to - Time range end (default: 'now')
 * @param {string} refresh - Auto-refresh interval (default: '10s')
 * @param {string} theme - Grafana theme: 'light' or 'dark' (default: follows system)
 * @param {number} height - iframe height in pixels (default: 400)
 * @param {string} title - Accessible title for the iframe
 * @param {boolean} kiosk - Enable kiosk mode for full dashboard (default: true)
 */
function GrafanaEmbed({
  dashboardUid,
  panelId,
  from = 'now-1h',
  to = 'now',
  refresh = '3s',
  theme,
  height = 400,
  title = 'Metrics Dashboard',
  kiosk = false,
}) {
  const [embedUrl, setEmbedUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;

    async function fetchUrl() {
      try {
        const url = await getEmbedUrl({
          dashboard: dashboardUid,
          panelId,
          from,
          to,
          refresh,
          theme,
          kiosk: kiosk ? 'tv' : undefined,
        });
        if (!cancelled && url) setEmbedUrl(url);
        else if (!cancelled) setHasError(true);
      } catch (err) {
        if (!cancelled) setHasError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchUrl();
    return () => { cancelled = true; };
  }, [dashboardUid, panelId, from, to, refresh, theme, kiosk]);

  const handleLoad = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  return (
    <div className="grafana-embed">
      {isLoading && !embedUrl && (
        <div className="grafana-embed__loading" style={{ height }}>
          <Skeleton width="100%" height="100%" />
        </div>
      )}

      {hasError && (
        <div className="grafana-embed__error" style={{ height }}>
          <div className="grafana-embed__error-content">
            <svg
              className="grafana-embed__error-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p>Unable to load Grafana dashboard</p>
            <button
              type="button"
              className="grafana-embed__error-link grafana-embed__error-link--button"
              onClick={async () => {
                try {
                  const url = await getEmbedUrl({
                    dashboard: dashboardUid,
                    from,
                    to,
                    refresh,
                    theme,
                    kiosk: kiosk ? 'tv' : undefined,
                  });
                  if (url) window.open(url, '_blank', 'noopener,noreferrer');
                } catch (err) {
                  showToast(
                    err.response?.status === 401
                      ? 'Session expired. Please log in again.'
                      : 'Unable to load Grafana. Please try again.',
                    'error',
                    4000
                  );
                }
              }}
            >
              Open Grafana →
            </button>
          </div>
        </div>
      )}

      {embedUrl && (
        <iframe
          src={embedUrl}
          width="100%"
          height={height}
          frameBorder="0"
          title={title}
          onLoad={handleLoad}
          onError={handleError}
          className={`grafana-embed__iframe ${isLoading ? 'grafana-embed__iframe--loading' : ''}`}
          allow="fullscreen"
        />
      )}
    </div>
  );
}

export { GrafanaEmbed };
export default GrafanaEmbed;
