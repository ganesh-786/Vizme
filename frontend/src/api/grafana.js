import client from './client';

/**
 * Fetch a signed Grafana embed URL with user isolation.
 * The URL includes an embed token and forces var-user_id to the authenticated user.
 */
export async function getEmbedUrl(params = {}) {
  const { data } = await client.get('/grafana/embed-url', { params });
  return data?.data?.url ?? data?.url;
}
