import { useState, useEffect } from 'react';
import { Skeleton } from '@/components/Skeleton';
import './GrafanaEmbed.css';

/**
 * GrafanaEmbed - Embeds Grafana dashboards or panels via iframe
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
  refresh = '10s',
  theme,
  height = 400,
  title = 'Metrics Dashboard',
  kiosk = true,
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const grafanaUrl = import.meta.env.VITE_GRAFANA_URL || 'http://localhost:3001';

  // Build the embed URL
  const buildEmbedUrl = () => {
    const params = new URLSearchParams({
      from,
      to,
      refresh,
      ...(theme && { theme }),
    });

    if (panelId) {
      // Embed a single panel
      return `${grafanaUrl}/d-solo/${dashboardUid}?panelId=${panelId}&${params.toString()}`;
    }

    // Embed full dashboard with optional kiosk mode
    const kioskParam = kiosk ? '&kiosk=tv' : '';
    return `${grafanaUrl}/d/${dashboardUid}?${params.toString()}${kioskParam}`;
  };

  const embedUrl = buildEmbedUrl();

  const handleLoad = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  // Reset loading state when URL changes
  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
  }, [embedUrl]);

  return (
    <div className="grafana-embed">
      {isLoading && (
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
            <a
              href={grafanaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="grafana-embed__error-link"
            >
              Open Grafana directly →
            </a>
          </div>
        </div>
      )}

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
    </div>
  );
}

export { GrafanaEmbed };
export default GrafanaEmbed;
