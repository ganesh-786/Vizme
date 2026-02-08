// src/services/metricConfig.service.ts
import {
  metricConfigRepository,
  CreateMetricConfigParams,
  UpdateMetricConfigParams,
  MetricConfig,
} from "../repositories/metricConfig.repository.js";
import { logger } from "../utils/logger.js";

// Prometheus metric name validation regex
const METRIC_NAME_REGEX = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const VALID_METRIC_TYPES = ["counter", "gauge", "histogram", "summary"];

export interface CreateMetricConfigInput {
  name: string;
  description?: string;
  metric_name: string;
  metric_type: string;
  help_text?: string;
  labels?: string[];
  buckets?: number[];
  quantiles?: number[];
}

export interface UpdateMetricConfigInput {
  name?: string;
  description?: string;
  metric_name?: string;
  metric_type?: string;
  help_text?: string;
  labels?: string[];
  buckets?: number[];
  quantiles?: number[];
  is_active?: boolean;
}

function validateMetricName(name: string): void {
  if (!METRIC_NAME_REGEX.test(name)) {
    throw new Error(
      "Invalid metric name. Must start with a letter, underscore, or colon, " +
        "and contain only alphanumeric characters, underscores, and colons.",
    );
  }

  // Reserved prefixes check
  const reservedPrefixes = ["__"];
  for (const prefix of reservedPrefixes) {
    if (name.startsWith(prefix)) {
      throw new Error(
        `Metric name cannot start with reserved prefix: ${prefix}`,
      );
    }
  }
}

function validateMetricType(type: string): void {
  if (!VALID_METRIC_TYPES.includes(type)) {
    throw new Error(
      `Invalid metric type. Must be one of: ${VALID_METRIC_TYPES.join(", ")}`,
    );
  }
}

function validateLabels(labels: string[]): void {
  const labelRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  const reservedLabels = ["__name__", "le", "quantile"];

  for (const label of labels) {
    if (!labelRegex.test(label)) {
      throw new Error(
        `Invalid label name: ${label}. Must start with a letter or underscore ` +
          "and contain only alphanumeric characters and underscores.",
      );
    }
    if (label.startsWith("__")) {
      throw new Error(`Label name cannot start with '__': ${label}`);
    }
  }

  // Check for duplicates
  const uniqueLabels = new Set(labels);
  if (uniqueLabels.size !== labels.length) {
    throw new Error("Duplicate label names are not allowed");
  }
}

function validateBuckets(buckets: number[]): void {
  if (buckets.length === 0) {
    throw new Error("Buckets array cannot be empty");
  }

  // Check if sorted in ascending order
  for (let i = 1; i < buckets.length; i++) {
    if (buckets[i] <= buckets[i - 1]) {
      throw new Error("Buckets must be in strictly ascending order");
    }
  }

  // All values must be positive
  if (buckets.some((b) => b <= 0)) {
    throw new Error("All bucket values must be positive");
  }
}

function validateQuantiles(quantiles: number[]): void {
  if (quantiles.length === 0) {
    throw new Error("Quantiles array cannot be empty");
  }

  // All values must be between 0 and 1
  if (quantiles.some((q) => q < 0 || q > 1)) {
    throw new Error("Quantile values must be between 0 and 1");
  }

  // Check for duplicates
  const uniqueQuantiles = new Set(quantiles);
  if (uniqueQuantiles.size !== quantiles.length) {
    throw new Error("Duplicate quantile values are not allowed");
  }
}

export const metricConfigService = {
  async getAll(tenantId: string): Promise<MetricConfig[]> {
    return metricConfigRepository.findAllByTenant(tenantId);
  },

  async getById(id: number, tenantId: string): Promise<MetricConfig> {
    const config = await metricConfigRepository.findById(id, tenantId);
    if (!config) {
      throw new Error("Metric configuration not found");
    }
    return config;
  },

  async getActiveConfigs(tenantId: string): Promise<MetricConfig[]> {
    return metricConfigRepository.findActiveByTenant(tenantId);
  },

  async create(
    userId: string,
    tenantId: string,
    input: CreateMetricConfigInput,
  ): Promise<MetricConfig> {
    // Validation
    validateMetricName(input.metric_name);
    validateMetricType(input.metric_type);

    if (input.labels && input.labels.length > 0) {
      validateLabels(input.labels);
    }

    // Type-specific validation
    if (input.metric_type === "histogram" && input.buckets) {
      validateBuckets(input.buckets);
    }
    if (input.metric_type === "summary" && input.quantiles) {
      validateQuantiles(input.quantiles);
    }

    // Check for duplicate metric name
    const exists = await metricConfigRepository.metricNameExists(
      input.metric_name,
      tenantId,
    );
    if (exists) {
      throw new Error("A metric with this name already exists");
    }

    const params: CreateMetricConfigParams = {
      userId,
      tenantId,
      name: input.name.trim(),
      description: input.description?.trim(),
      metricName: input.metric_name,
      metricType: input.metric_type,
      helpText: input.help_text?.trim(),
      labels: input.labels || [],
      buckets: input.metric_type === "histogram" ? input.buckets : undefined,
      quantiles: input.metric_type === "summary" ? input.quantiles : undefined,
    };

    const config = await metricConfigRepository.create(params);
    logger.info({ configId: config.id, tenantId }, "Metric config created");

    return config;
  },

  async update(
    id: number,
    tenantId: string,
    input: UpdateMetricConfigInput,
  ): Promise<MetricConfig> {
    // Check exists
    const existing = await metricConfigRepository.findById(id, tenantId);
    if (!existing) {
      throw new Error("Metric configuration not found");
    }

    // Validation
    if (input.metric_name) {
      validateMetricName(input.metric_name);

      // Check for duplicate (excluding current)
      const exists = await metricConfigRepository.metricNameExists(
        input.metric_name,
        tenantId,
        id,
      );
      if (exists) {
        throw new Error("A metric with this name already exists");
      }
    }

    if (input.metric_type) {
      validateMetricType(input.metric_type);
    }

    if (input.labels) {
      validateLabels(input.labels);
    }

    const effectiveType = input.metric_type || existing.metric_type;
    if (effectiveType === "histogram" && input.buckets) {
      validateBuckets(input.buckets);
    }
    if (effectiveType === "summary" && input.quantiles) {
      validateQuantiles(input.quantiles);
    }

    const params: UpdateMetricConfigParams = {
      name: input.name?.trim(),
      description: input.description?.trim(),
      metricName: input.metric_name,
      metricType: input.metric_type,
      helpText: input.help_text?.trim(),
      labels: input.labels,
      buckets: input.buckets,
      quantiles: input.quantiles,
      isActive: input.is_active,
    };

    const config = await metricConfigRepository.update(id, tenantId, params);
    if (!config) {
      throw new Error("Failed to update metric configuration");
    }

    logger.info({ configId: id, tenantId }, "Metric config updated");
    return config;
  },

  async delete(id: number, tenantId: string): Promise<void> {
    const deleted = await metricConfigRepository.delete(id, tenantId);
    if (!deleted) {
      throw new Error("Metric configuration not found");
    }
    logger.info({ configId: id, tenantId }, "Metric config deleted");
  },
};
