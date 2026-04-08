/**
 * Application metrics and internal pipeline telemetry for production observability.
 * Uses a dedicated registry so /metrics exposes backend health without leaking user data.
 */

import { Registry, Counter, Gauge, Histogram } from 'prom-client';

export const appRegistry = new Registry();
appRegistry.setDefaultLabels({ service: 'vizme-backend' });

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [appRegistry],
});

const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [appRegistry],
});

const metricsIngestRequestsTotal = new Counter({
  name: 'vizme_metrics_ingest_requests_total',
  help: 'Total metrics ingestion requests processed by the backend.',
  labelNames: ['outcome'],
  registers: [appRegistry],
});

const metricsIngestBatchSize = new Histogram({
  name: 'vizme_metrics_ingest_batch_size',
  help: 'Number of metrics received per ingestion request.',
  buckets: [1, 5, 10, 25, 50, 100],
  registers: [appRegistry],
});

const metricsIngestDurationSeconds = new Histogram({
  name: 'vizme_metrics_ingest_duration_seconds',
  help: 'Time spent validating and forwarding ingestion batches.',
  labelNames: ['outcome'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [appRegistry],
});

const mimirWriteDurationSeconds = new Histogram({
  name: 'vizme_mimir_write_duration_seconds',
  help: 'Duration of remote-write batches sent to Grafana Mimir.',
  labelNames: ['mode', 'outcome'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [appRegistry],
});

const mimirWriteSamples = new Histogram({
  name: 'vizme_mimir_write_samples',
  help: 'Number of samples included in each Mimir remote-write batch.',
  labelNames: ['mode'],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
  registers: [appRegistry],
});

const mimirQueryDurationSeconds = new Histogram({
  name: 'vizme_mimir_query_duration_seconds',
  help: 'Duration of direct Mimir query requests.',
  labelNames: ['query_kind', 'outcome'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [appRegistry],
});

const mimirQueryResultSeries = new Histogram({
  name: 'vizme_mimir_query_result_series',
  help: 'Number of series returned by direct Mimir queries.',
  labelNames: ['query_kind'],
  buckets: [1, 2, 5, 10, 25, 50, 100, 250, 500],
  registers: [appRegistry],
});

const grafanaDatasourceHealthStatus = new Gauge({
  name: 'vizme_grafana_datasource_health_status',
  help: 'Latest Grafana datasource health status (1 healthy, 0 unhealthy).',
  labelNames: ['datasource'],
  registers: [appRegistry],
});

const grafanaDatasourceHealthDurationSeconds = new Histogram({
  name: 'vizme_grafana_datasource_health_duration_seconds',
  help: 'Duration of Grafana datasource health checks.',
  labelNames: ['datasource', 'outcome'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [appRegistry],
});

const metricsPipelineLastSuccessTimestampSeconds = new Gauge({
  name: 'vizme_metrics_pipeline_last_success_timestamp_seconds',
  help: 'Unix timestamp of the latest successful metrics pipeline stage.',
  labelNames: ['stage'],
  registers: [appRegistry],
});

const metricsPipelineLastDurationSeconds = new Gauge({
  name: 'vizme_metrics_pipeline_last_duration_seconds',
  help: 'Duration of the latest observed metrics pipeline stage.',
  labelNames: ['stage'],
  registers: [appRegistry],
});

const pipelineSnapshot = {
  ingest: null,
  mimirWrite: {},
  mimirQuery: {},
  grafanaDatasource: {},
};

function roundNumber(value, digits = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(digits));
}

function sanitizeErrorMessage(error) {
  const message = error?.message || error?.error || error;
  if (message == null) return null;
  return String(message).slice(0, 200);
}

function snapshotStage(section, key, {
  durationMs = 0,
  outcome = 'success',
  details = {},
} = {}) {
  const target = key ? (pipelineSnapshot[section] || {}) : pipelineSnapshot;
  const previous = key ? target[key] || {} : target[section] || {};
  const nowIso = new Date().toISOString();
  const payload = {
    ...previous,
    lastAttemptAt: nowIso,
    lastSuccessAt: outcome === 'success' ? nowIso : previous.lastSuccessAt || null,
    lastDurationMs: roundNumber(durationMs, 1),
    lastOutcome: outcome,
    ...details,
  };

  if (details.error !== undefined) {
    payload.error = sanitizeErrorMessage(details.error);
  } else if (outcome === 'success') {
    payload.error = null;
  }

  if (key) {
    pipelineSnapshot[section][key] = payload;
  } else {
    pipelineSnapshot[section] = payload;
  }
}

export function recordMetricsIngest({
  durationMs = 0,
  batchSize = 0,
  outcome = 'success',
  error = null,
  processed = 0,
  total = 0,
} = {}) {
  const durationSeconds = Math.max(Number(durationMs) / 1000, 0);
  metricsIngestRequestsTotal.inc({ outcome }, 1);
  metricsIngestDurationSeconds.observe({ outcome }, durationSeconds);
  metricsIngestBatchSize.observe(Math.max(Number(batchSize) || 0, 0));
  metricsPipelineLastDurationSeconds.set({ stage: 'ingest' }, durationSeconds);
  if (outcome === 'success') {
    metricsPipelineLastSuccessTimestampSeconds.set({ stage: 'ingest' }, Date.now() / 1000);
  }

  snapshotStage('ingest', null, {
    durationMs,
    outcome,
    details: {
      batchSize: Math.max(Number(batchSize) || 0, 0),
      processed: Math.max(Number(processed) || 0, 0),
      total: Math.max(Number(total) || 0, 0),
      error,
    },
  });
}

export function recordMimirWrite({
  mode = 'batch',
  durationMs = 0,
  outcome = 'success',
  sampleCount = 0,
  tenantCount = 1,
  error = null,
} = {}) {
  const durationSeconds = Math.max(Number(durationMs) / 1000, 0);
  mimirWriteDurationSeconds.observe({ mode, outcome }, durationSeconds);
  mimirWriteSamples.observe({ mode }, Math.max(Number(sampleCount) || 0, 0));
  metricsPipelineLastDurationSeconds.set({ stage: `mimir_write_${mode}` }, durationSeconds);
  if (outcome === 'success') {
    metricsPipelineLastSuccessTimestampSeconds.set({ stage: `mimir_write_${mode}` }, Date.now() / 1000);
  }

  snapshotStage('mimirWrite', mode, {
    durationMs,
    outcome,
    details: {
      sampleCount: Math.max(Number(sampleCount) || 0, 0),
      tenantCount: Math.max(Number(tenantCount) || 0, 0),
      error,
    },
  });
}

export function recordMimirQuery({
  queryKind = 'scalar',
  durationMs = 0,
  outcome = 'success',
  resultSeries = 0,
  stepSeconds = null,
  error = null,
} = {}) {
  const durationSeconds = Math.max(Number(durationMs) / 1000, 0);
  mimirQueryDurationSeconds.observe({ query_kind: queryKind, outcome }, durationSeconds);
  mimirQueryResultSeries.observe({ query_kind: queryKind }, Math.max(Number(resultSeries) || 0, 0));
  metricsPipelineLastDurationSeconds.set({ stage: `mimir_query_${queryKind}` }, durationSeconds);
  if (outcome === 'success') {
    metricsPipelineLastSuccessTimestampSeconds.set({ stage: `mimir_query_${queryKind}` }, Date.now() / 1000);
  }

  snapshotStage('mimirQuery', queryKind, {
    durationMs,
    outcome,
    details: {
      resultSeries: Math.max(Number(resultSeries) || 0, 0),
      ...(stepSeconds != null ? { stepSeconds: Math.max(Number(stepSeconds) || 0, 0) } : {}),
      error,
    },
  });
}

export function recordGrafanaDatasourceHealth({
  datasource = 'unknown',
  durationMs = 0,
  outcome = 'success',
  status = 'OK',
  error = null,
  url = null,
} = {}) {
  const durationSeconds = Math.max(Number(durationMs) / 1000, 0);
  const healthy = outcome === 'success' ? 1 : 0;
  grafanaDatasourceHealthStatus.set({ datasource }, healthy);
  grafanaDatasourceHealthDurationSeconds.observe({ datasource, outcome }, durationSeconds);
  metricsPipelineLastDurationSeconds.set({ stage: `grafana_datasource_${datasource}` }, durationSeconds);
  if (outcome === 'success') {
    metricsPipelineLastSuccessTimestampSeconds.set({ stage: `grafana_datasource_${datasource}` }, Date.now() / 1000);
  }

  snapshotStage('grafanaDatasource', datasource, {
    durationMs,
    outcome,
    details: { status, error, url },
  });
}

export function getPipelineTelemetrySnapshot() {
  return JSON.parse(JSON.stringify(pipelineSnapshot));
}

function normalizeRoute(path) {
  if (!path) return 'unknown';
  // Normalize IDs and variable segments to avoid cardinality explosion
  const normalized = path
    .replace(/\/api\/v1\/metric-configs\/[^/]+/g, '/api/v1/metric-configs/:id')
    .replace(/\/api\/v1\/api-keys\/[^/]+/g, '/api/v1/api-keys/:id')
    .replace(/\/api\/v1\/auth\/[^/]+/g, '/api/v1/auth/:action');
  return normalized || 'unknown';
}

/**
 * Middleware that records request count and duration. Must run early (after requestId).
 */
export function appMetricsMiddleware(req, res, next) {
  const start = Date.now();
  const route = normalizeRoute(req.path);

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const status = String(res.statusCode);
    const method = req.method || 'unknown';

    httpRequestsTotal.inc({ method, route, status }, 1);
    httpRequestDurationSeconds.observe({ method, route, status }, duration);
  });

  next();
}

export async function getAppMetrics() {
  return appRegistry.metrics();
}
