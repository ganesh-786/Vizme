import client from './client';

/**
 * Fetch dashboard metrics from Mimir (tenant-isolated).
 * @param {number|string|null|undefined} siteId - Optional site filter (must match site_id label on series).
 */
export async function getDashboardMetrics(siteId) {
  const params = {
    include_series: '0',
    include_details: '0',
  };
  if (siteId !== undefined && siteId !== null && siteId !== '') {
    params.site_id = siteId;
  }
  const { data } = await client.get('/metrics/dashboard', { params });
  return (
    data?.data ?? {
      dashboardMode: 'legacy',
      dashboardFlavor: 'ecommerce',
      stats: {},
      timeseries: [],
      revenueOverTime: [],
      widgets: [],
      multiSeries: [],
    }
  );
}
