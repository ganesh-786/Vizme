import client from './client';

/**
 * Fetch dashboard metrics from Mimir (tenant-isolated).
 * @returns {Promise<{stats: object, timeseries: array, revenueOverTime: array}>}
 */
export async function getDashboardMetrics() {
  const { data } = await client.get('/metrics/dashboard');
  return data?.data ?? { stats: {}, timeseries: [], revenueOverTime: [] };
}
