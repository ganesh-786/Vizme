import client from './client';

const DEFAULT_GRAFANA_STANDALONE_PORT = '3001';

/**
 * Parse expiry string (e.g. '15m', '1h') to milliseconds.
 * Returns 70% of token lifetime for proactive refresh before expiry.
 */
function parseExpiryToRefreshMs(str) {
  const match = String(str || '15m').match(/^(\d+)(m|h|d)$/);
  if (!match) return 10 * 60 * 1000; // 10 min default
  const num = parseInt(match[1], 10);
  const unit = match[2];
  let ms = 0;
  if (unit === 'm') ms = num * 60 * 1000;
  else if (unit === 'h') ms = num * 60 * 60 * 1000;
  else if (unit === 'd') ms = num * 24 * 60 * 60 * 1000;
  return Math.floor(ms * 0.7); // Refresh at 70% of token lifetime
}

/**
 * Fetch a signed Grafana embed URL with user isolation.
 * The URL includes an embed token and forces var-user_id to the authenticated user.
 * @returns {{ url: string, expiresIn?: string, refreshIntervalMs: number }}
 */
export async function getEmbedUrl(params = {}) {
  const { data } = await client.get('/grafana/embed-url', { params });
  const url = data?.data?.url ?? data?.url;
  const expiresIn = data?.data?.expiresIn ?? data?.expiresIn;
  return {
    url,
    expiresIn,
    refreshIntervalMs: parseExpiryToRefreshMs(expiresIn),
  };
}

function defaultStandaloneGrafanaUrl() {
  if (typeof window === 'undefined') {
    return `http://localhost:${DEFAULT_GRAFANA_STANDALONE_PORT}/grafana/login`;
  }

  const protocol = window.location.protocol || 'http:';
  const hostname = window.location.hostname || 'localhost';
  return `${protocol}//${hostname}:${DEFAULT_GRAFANA_STANDALONE_PORT}/grafana/login`;
}

export function getStandaloneGrafanaUrl() {
  const configured = String(import.meta.env.VITE_GRAFANA_STANDALONE_URL || '').trim();
  return configured || defaultStandaloneGrafanaUrl();
}

function openGrafanaUrl(url) {
  if (!url || typeof window === 'undefined') return null;
  window.open(url, '_blank', 'noopener,noreferrer');
  return url;
}

/**
 * Open the tenant-scoped Grafana URL when available; otherwise fall back to the standalone Grafana UI.
 * 401 responses are preserved so callers can prompt for a Vizme re-login.
 */
export async function openPrimaryGrafanaWindow(params = {}) {
  try {
    const result = await getEmbedUrl(params);
    if (result?.url) {
      openGrafanaUrl(result.url);
      return { mode: 'tenant-proxy', url: result.url };
    }
  } catch (error) {
    if (error?.response?.status === 401) throw error;
  }

  const standaloneUrl = getStandaloneGrafanaUrl();
  openGrafanaUrl(standaloneUrl);
  return { mode: 'standalone', url: standaloneUrl };
}
