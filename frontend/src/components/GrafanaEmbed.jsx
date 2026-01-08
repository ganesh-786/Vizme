import { useState, useEffect } from 'react';
import './GrafanaEmbed.css';

function GrafanaEmbed({ dashboardUid, panelId, theme = 'light', height = '600px' }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const grafanaUrl = import.meta.env.VITE_GRAFANA_URL || 'http://localhost:3001';
  
  // Construct Grafana panel URL
  const panelUrl = panelId 
    ? `${grafanaUrl}/d/${dashboardUid}?viewPanel=${panelId}&theme=${theme}&kiosk=tv`
    : `${grafanaUrl}/d/${dashboardUid}?theme=${theme}&kiosk=tv`;

  useEffect(() => {
    // Set loading to false after a short delay to allow iframe to load
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const handleIframeLoad = () => {
    setLoading(false);
    setError(null);
  };

  const handleIframeError = () => {
    setLoading(false);
    setError('Failed to load Grafana dashboard. Please check if Grafana is running.');
  };

  if (error) {
    return (
      <div className="grafana-error">
        <p>{error}</p>
        <a 
          href={panelUrl.replace('&kiosk=tv', '')} 
          target="_blank" 
          rel="noopener noreferrer"
          className="btn btn-primary"
        >
          Open in New Tab
        </a>
      </div>
    );
  }

  return (
    <div className="grafana-embed-container" style={{ height }}>
      {loading && (
        <div className="grafana-loading">
          <div className="spinner"></div>
          <p>Loading Grafana dashboard...</p>
        </div>
      )}
      <iframe
        src={panelUrl}
        className="grafana-iframe"
        title="Grafana Dashboard"
        frameBorder="0"
        allow="clipboard-read; clipboard-write"
        onLoad={handleIframeLoad}
        onError={handleIframeError}
        style={{ display: loading ? 'none' : 'block' }}
      />
    </div>
  );
}

export default GrafanaEmbed;

