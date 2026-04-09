/**
 * Type declarations for the Vizme browser metrics library.
 */

export interface VizmeConstructorOptions {
  /** Required API key from the Vizme dashboard */
  apiKey: string;
  /** Metrics ingestion URL (default: http://localhost:3000/api/v1/metrics) */
  endpoint?: string;
  /** Enable automatic tracking (default: true) */
  autoTrack?: boolean;
  /** Fetch metric configs from the server (default: true) */
  autoFetchConfigs?: boolean;
  batchSize?: number;
  flushInterval?: number;
  metricConfigs?: Record<string, { type?: string; labels?: Record<string, string> }>;
  sampleRate?: number;
  maxRetries?: number;
  retryBaseMs?: number;
  autoInteractions?: boolean;
  [key: string]: unknown;
}

export default class Vizme {
  constructor(options: VizmeConstructorOptions);

  fetchMetricConfigs(): Promise<Record<string, { type?: string }>>;

  track(name: string, value?: number, labels?: Record<string, unknown>): this;

  increment(
    name: string,
    value?: number,
    labels?: Record<string, unknown>
  ): Promise<this>;

  decrement(
    name: string,
    value?: number,
    labels?: Record<string, unknown>
  ): Promise<this>;

  set(name: string, value: number, labels?: Record<string, unknown>): Promise<this>;

  flush(): Promise<void>;

  getStatus(): Record<string, unknown>;

  destroy(): void;
}

export { Vizme };
