import { useState, useEffect, useRef } from 'react';
import { Skeleton } from '@/components/Skeleton';
import { getEmbedUrl } from '@/api/grafana';
import { useToast } from '@/components/ToastContainer';
import { forceSessionLogout } from '@/lib/session';
import './GrafanaEmbed.css';

/**
 * GrafanaEmbed - Embeds Grafana dashboards via backend proxy with user isolation.
 * Fetches a signed embed URL from the API; only the authenticated user's metrics are shown.
 * Implements proactive token refresh before expiry (production-grade).
 *
 * @param {string} dashboardUid - The unique identifier of the Grafana dashboard
 * @param {number} panelId - Optional panel ID to embed a specific panel (uses d-solo endpoint)
 * @param {string} from - Time range start (default: 'now-1h')
 * @param {string} to - Time range end (default: 'now')
 * @param {string} refresh - Auto-refresh interval (default: '15s')
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
  refresh = '15s',
  theme,
  height = 400,
  title = 'Metrics Dashboard',
  kiosk = false,
}) {
  const [embedUrl, setEmbedUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const refreshIntervalRef = useRef(null);
  const { showToast } = useToast();

  const fetchParams = {
    dashboard: dashboardUid,
    panelId,
    from,
    to,
    refresh,
    theme,
    kiosk: kiosk ? 'tv' : undefined,
  };

  useEffect(() => {
    let cancelled = false;

    async function fetchAndSetUrl() {
      try {
        const result = await getEmbedUrl(fetchParams);
        if (!cancelled && result?.url) {
          // Probe embed URL before iframe load; 503 = tenant setup failed, 404 = dashboard not found.
          const probe = await fetch(result.url, { credentials: 'include', method: 'GET' });
          if (probe.status === 503 || probe.status === 404) {
            setHasError(true);
            setIsLoading(false);
            return;
          }
          setEmbedUrl(result.url);
          setHasError(false);

          // Clear any existing refresh interval
          if (refreshIntervalRef.current) {
            clearInterval(refreshIntervalRef.current);
            refreshIntervalRef.current = null;
          }

          // Proactive token refresh: refresh at 70% of token lifetime
          const intervalMs = result.refreshIntervalMs ?? 10 * 60 * 1000;
          if (intervalMs > 0) {
            refreshIntervalRef.current = setInterval(() => {
              // Pause refresh when tab is hidden (save resources)
              if (document.visibilityState === 'hidden') return;

              getEmbedUrl(fetchParams)
                .then((next) => {
                  if (next?.url) setEmbedUrl(next.url);
                })
                .catch((err) => {
                  if (err.response?.status === 401) {
                    forceSessionLogout();
                  }
                });
            }, intervalMs);
          }
        } else if (!cancelled) {
          setHasError(true);
        }
      } catch (err) {
        if (!cancelled) {
          setHasError(true);
          if (err.response?.status === 401) {
            forceSessionLogout();
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchAndSetUrl();
    return () => {
      cancelled = true;
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
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
            <p className="grafana-embed__error-hint">
              Dashboard may still be initializing. Try again in a few seconds.
            </p>
            <div className="grafana-embed__error-actions">
              <button
                type="button"
                className="grafana-embed__error-link grafana-embed__error-link--button"
                onClick={async () => {
                  setHasError(false);
                  setIsLoading(true);
                  try {
                    const result = await getEmbedUrl(fetchParams);
                    if (result?.url) {
                      setEmbedUrl(result.url);
                      setHasError(false);
                    }
                  } catch (err) {
                    setHasError(true);
                    if (err.response?.status === 401) {
                      forceSessionLogout();
                    } else {
                      showToast('Unable to load Grafana. Please try again.', 'error', 4000);
                    }
                  } finally {
                    setIsLoading(false);
                  }
                }}
              >
                Retry
              </button>
              <button
                type="button"
                className="grafana-embed__error-link grafana-embed__error-link--button"
                onClick={async () => {
                  try {
                    const result = await getEmbedUrl(fetchParams);
                    if (result?.url) window.open(result.url, '_blank', 'noopener,noreferrer');
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
                Open in new tab →
              </button>
            </div>
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
