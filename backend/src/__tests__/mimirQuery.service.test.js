import { beforeEach, describe, expect, it, vi } from 'vitest';

const setupService = async () => {
  vi.resetModules();

  const recordMimirQuery = vi.fn();

  vi.doMock('../config.js', () => ({
    config: {
      urls: {
        mimir: 'http://mimir:9009',
      },
    },
  }));

  vi.doMock('../logger.js', () => ({
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }));

  vi.doMock('../middleware/appMetrics.js', () => ({
    recordMimirQuery,
  }));

  vi.doMock('../services/dashboardWidget.service.js', () => ({
    buildTenantLabelFilter: vi.fn((userId, siteId = null) =>
      siteId == null ? `user_id=~"^${userId}$"` : `user_id=~"^${userId}$",site_id=~"^${siteId}$"`
    ),
    listDashboardWidgetsForScope: vi.fn().mockResolvedValue([]),
    promqlCountDistinctMetricNames: vi.fn(() => 'count(count by (__name__)({__name__=~"user_metric_.*"}))'),
    promqlForWidget: vi.fn(() => 'sum(user_metric_orders_completed)'),
    promqlRangeForMetricName: vi.fn(() => 'user_metric_orders_completed'),
    promqlSelectorForMetricNames: vi.fn(() => '{__name__=~"user_metric_.*"}'),
    promqlMultiSeriesSelector: vi.fn(() => '{__name__=~"user_metric_.*"}'),
  }));

  const service = await import('../services/mimirQuery.service.js');
  return { service, recordMimirQuery };
};

describe('mimirQuery.service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('recommends step sizes based on query range duration', async () => {
    const { service } = await setupService();

    expect(service.recommendRangeStepSeconds(0, 3600)).toBe(15);
    expect(service.recommendRangeStepSeconds(0, 24 * 3600)).toBe(60);
    expect(service.recommendRangeStepSeconds(0, 8 * 24 * 3600)).toBe(900);
  });

  it('returns scalar values for successful scalar query responses', async () => {
    const { service } = await setupService();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        data: {
          resultType: 'scalar',
          result: [1710000000, '42.5'],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await service.queryScalar('12', 'sum(up)');

    expect(result).toBe(42.5);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/prometheus/api/v1/query?query=sum(up)'),
      expect.objectContaining({
        headers: { 'X-Scope-OrgID': '12' },
      })
    );
  });

  it('sums vector results for successful scalar queries', async () => {
    const { service } = await setupService();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          data: {
            resultType: 'vector',
            result: [{ value: [1, '2'] }, { value: [1, '3.5'] }],
          },
        }),
      })
    );

    const result = await service.queryScalar('12', 'some_vector_query');
    expect(result).toBe(5.5);
  });

  it('returns null for non-OK scalar query responses', async () => {
    const { service } = await setupService();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'internal error',
      })
    );

    const result = await service.queryScalar('12', 'sum(up)');
    expect(result).toBeNull();
  });

  it('aligns query range bounds and enforces minimum step', async () => {
    const { service } = await setupService();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        data: { result: [] },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await service.queryRange('13', 'rate(http_requests_total[5m])', 100, 200, 10);

    expect(result).toEqual([]);
    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('start=90');
    expect(calledUrl).toContain('end=210');
    expect(calledUrl).toContain('step=15');
  });

  it('detects movie dashboard flavor from activity signals', async () => {
    const { service } = await setupService();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: 'success',
            data: { resultType: 'scalar', result: [1, '10'] },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: 'success',
            data: { resultType: 'scalar', result: [1, '0'] },
          }),
        })
    );

    const mode = await service.detectDashboardVertical(5);
    expect(mode).toBe('movie');
  });
});
