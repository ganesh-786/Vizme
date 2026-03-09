import client from './client';

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
