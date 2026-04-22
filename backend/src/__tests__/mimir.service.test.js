import { beforeEach, describe, expect, it, vi } from 'vitest';

const setupService = async ({
  mimirUrl = 'http://mimir:9009',
  pushImpl = vi.fn().mockResolvedValue(undefined),
} = {}) => {
  vi.resetModules();

  vi.doMock('prometheus-remote-write', () => ({
    pushTimeseries: pushImpl,
  }));

  vi.doMock('../config.js', () => ({
    config: {
      urls: { mimir: mimirUrl },
      metrics: { heartbeatIntervalMs: 15000 },
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
    recordMimirWrite: vi.fn(),
  }));

  const service = await import('../services/mimir.service.js');
  return { service, pushImpl };
};

describe('mimir.service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a successful summary for empty metric batches', async () => {
    const { service } = await setupService();
    const result = await service.pushMetricsToMimir([]);

    expect(result).toEqual({
      ok: true,
      mode: 'batch',
      sampleCount: 0,
      tenantCount: 0,
      successfulTenants: [],
      failedTenants: [],
      durationMs: 0,
    });
  });

  it('returns a failure summary when MIMIR_URL is missing', async () => {
    const { service } = await setupService({ mimirUrl: '' });
    const result = await service.pushMetricsToMimir([
      { name: 'orders_completed', type: 'counter', value: 1, labels: {}, userId: '10' },
    ]);

    expect(result.ok).toBe(false);
    expect(result.tenantCount).toBe(0);
    expect(result.failedTenants[0]).toEqual(
      expect.objectContaining({ tenantId: null, error: 'MIMIR_URL is not configured' })
    );
  });

  it('throws when MIMIR_URL is missing and throwOnFailure is enabled', async () => {
    const { service } = await setupService({ mimirUrl: '' });

    await expect(
      service.pushMetricsToMimir(
        [{ name: 'orders_completed', type: 'counter', value: 1, labels: {}, userId: '10' }],
        { throwOnFailure: true }
      )
    ).rejects.toMatchObject({ message: 'MIMIR_URL is not configured', status: 503 });
  });

  it('pushes one request per tenant with tenant isolation headers', async () => {
    const pushImpl = vi.fn().mockResolvedValue(undefined);
    const { service } = await setupService({ pushImpl });

    const result = await service.pushMetricsToMimir([
      { name: 'orders_completed', type: 'counter', value: 1, labels: { env: 'prod' }, userId: '1' },
      { name: 'orders_completed', type: 'counter', value: 2, labels: { env: 'prod' }, userId: '2' },
    ]);

    expect(result.ok).toBe(true);
    expect(result.successfulTenants).toEqual(['1', '2']);
    expect(pushImpl).toHaveBeenCalledTimes(2);
    expect(pushImpl).toHaveBeenNthCalledWith(
      1,
      expect.any(Array),
      expect.objectContaining({
        url: 'http://mimir:9009/api/v1/push',
        headers: expect.objectContaining({ 'X-Scope-OrgID': '1', 'Content-Encoding': 'snappy' }),
      })
    );
    expect(pushImpl).toHaveBeenNthCalledWith(
      2,
      expect.any(Array),
      expect.objectContaining({
        url: 'http://mimir:9009/api/v1/push',
        headers: expect.objectContaining({ 'X-Scope-OrgID': '2', 'Content-Encoding': 'snappy' }),
      })
    );
  });

  it('keeps counter values cumulative across pushes for the same series', async () => {
    const pushImpl = vi.fn().mockResolvedValue(undefined);
    const { service } = await setupService({ pushImpl });

    await service.pushMetricsToMimir([
      {
        name: 'orders_completed',
        type: 'counter',
        value: 2,
        labels: { env: 'prod' },
        userId: '11',
      },
    ]);
    await service.pushMetricsToMimir([
      {
        name: 'orders_completed',
        type: 'counter',
        value: 3,
        labels: { env: 'prod' },
        userId: '11',
      },
    ]);

    const firstSeries = pushImpl.mock.calls[0][0][0];
    const secondSeries = pushImpl.mock.calls[1][0][0];

    expect(firstSeries.samples[0].value).toBe(2);
    expect(secondSeries.samples[0].value).toBe(5);
  });

  it('opens circuit breaker after repeated failures and rejects subsequent attempts', async () => {
    const pushImpl = vi.fn().mockRejectedValue(new Error('mimir down'));
    const { service } = await setupService({ pushImpl });

    for (let i = 0; i < 5; i += 1) {
      const result = await service.pushMetricsToMimir([
        { name: `fail_${i}`, type: 'counter', value: 1, labels: {}, userId: '99' },
      ]);
      expect(result.ok).toBe(false);
    }

    expect(service.getMimirCircuitState()).toBe('OPEN');

    const blocked = await service.pushMetricsToMimir([
      { name: 'blocked_write', type: 'counter', value: 1, labels: {}, userId: '99' },
    ]);
    expect(blocked.ok).toBe(false);
    expect(blocked.failedTenants[0].error).toMatch(/Circuit breaker OPEN/);
    expect(pushImpl).toHaveBeenCalledTimes(5);
  });
});
