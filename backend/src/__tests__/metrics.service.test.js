import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../config.js', () => ({
  config: {
    metrics: {
      maxLabelsPerMetric: 2,
      maxLabelValueLength: 5,
      maxSeriesPerUser: 2,
    },
  },
}));

import {
  clearUserMetrics,
  getMetrics,
  getMetricsStats,
  recordMetric,
} from '../services/metrics.service.js';

let seq = 0;
const nextId = () => {
  seq += 1;
  return `u${seq}`;
};

describe('metrics.service', () => {
  beforeEach(() => {
    // Isolate metricsStore/userSeriesCount across tests.
    clearUserMetrics('u1');
    clearUserMetrics('u2');
    clearUserMetrics('u3');
    clearUserMetrics('u4');
    clearUserMetrics('u5');
    clearUserMetrics('u6');
    clearUserMetrics('u7');
  });

  it('rejects non-numeric metric values', () => {
    expect(() =>
      recordMetric(
        {
          name: `invalid_value_${nextId()}`,
          type: 'gauge',
          value: 'not-a-number',
          labels: { env: 'prod' },
        },
        'u1'
      )
    ).toThrow(/Invalid metric value/);
  });

  it('rejects negative counter values', () => {
    expect(() =>
      recordMetric(
        {
          name: `negative_counter_${nextId()}`,
          type: 'counter',
          value: -1,
          labels: { env: 'prod' },
        },
        'u2'
      )
    ).toThrow(/cannot have negative values/);
  });

  it('rejects label sets above configured limit', () => {
    expect(() =>
      recordMetric(
        {
          name: `too_many_labels_${nextId()}`,
          type: 'gauge',
          value: 1,
          labels: { a: '1', b: '2', c: '3' },
        },
        'u3'
      )
    ).toThrow(/Too many labels/);
  });

  it('truncates label values and ignores internal _type/_operation labels', async () => {
    const metricName = `truncated_label_${nextId()}`;
    recordMetric(
      {
        name: metricName,
        type: 'gauge',
        value: 10,
        labels: {
          env: 'production',
          _type: 'ignore-me',
          _operation: 'ignore-me-too',
        },
      },
      'u4'
    );

    const text = await getMetrics();
    expect(text).toContain(`user_metric_${metricName}`);
    expect(text).toContain('env="produ"');
    expect(text).not.toContain('_type=');
    expect(text).not.toContain('_operation=');
  });

  it('enforces per-user cardinality limit by distinct series', () => {
    const metricName = `cardinality_${nextId()}`;
    recordMetric({ name: metricName, type: 'gauge', value: 1, labels: { route: '/a' } }, 'u5');
    recordMetric({ name: metricName, type: 'gauge', value: 1, labels: { route: '/b' } }, 'u5');

    expect(() =>
      recordMetric({ name: metricName, type: 'gauge', value: 1, labels: { route: '/c' } }, 'u5')
    ).toThrow(/Cardinality limit exceeded/);
  });

  it('supports gauge decrement operation and tracks stats', () => {
    const metricName = `gauge_ops_${nextId()}`;
    recordMetric({ name: metricName, type: 'gauge', value: -3, labels: { env: 'dev' } }, 'u6');

    const stats = getMetricsStats();
    expect(stats.totalMetrics).toBeGreaterThanOrEqual(1);
    expect(stats.totalInstances).toBeGreaterThanOrEqual(1);
    expect(stats.registryMetrics).toBeGreaterThanOrEqual(1);
  });

  it('clears user metrics snapshot state', () => {
    const userId = 'u7';
    const before = getMetricsStats().totalMetrics;

    recordMetric(
      { name: `clear_test_${nextId()}`, type: 'gauge', value: 2, labels: { env: 'qa' } },
      userId
    );
    expect(getMetricsStats().totalMetrics).toBeGreaterThan(before);

    clearUserMetrics(userId);
    expect(getMetricsStats().totalMetrics).toBe(before);
  });
});
