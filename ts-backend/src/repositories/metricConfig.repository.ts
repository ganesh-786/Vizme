// src/repositories/metricConfig.repository.ts
import { pool } from "../db/pool.js";

export interface MetricConfig {
  id: number;
  user_id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  metric_name: string;
  metric_type: "counter" | "gauge" | "histogram" | "summary";
  help_text: string | null;
  labels: string[];
  buckets: number[] | null;
  quantiles: number[] | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateMetricConfigParams {
  userId: string;
  tenantId: string;
  name: string;
  description?: string;
  metricName: string;
  metricType: string;
  helpText?: string;
  labels?: string[];
  buckets?: number[];
  quantiles?: number[];
}

export interface UpdateMetricConfigParams {
  name?: string;
  description?: string;
  metricName?: string;
  metricType?: string;
  helpText?: string;
  labels?: string[];
  buckets?: number[];
  quantiles?: number[];
  isActive?: boolean;
}

export const metricConfigRepository = {
  async findAllByTenant(tenantId: string): Promise<MetricConfig[]> {
    const result = await pool.query(
      `SELECT * FROM metric_configs 
       WHERE tenant_id = $1 
       ORDER BY created_at DESC`,
      [tenantId],
    );
    return result.rows;
  },

  async findById(id: number, tenantId: string): Promise<MetricConfig | null> {
    const result = await pool.query(
      `SELECT * FROM metric_configs 
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return result.rows[0] || null;
  },

  async findByMetricName(
    metricName: string,
    tenantId: string,
  ): Promise<MetricConfig | null> {
    const result = await pool.query(
      `SELECT * FROM metric_configs 
       WHERE metric_name = $1 AND tenant_id = $2`,
      [metricName, tenantId],
    );
    return result.rows[0] || null;
  },

  async findActiveByTenant(tenantId: string): Promise<MetricConfig[]> {
    const result = await pool.query(
      `SELECT * FROM metric_configs 
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY metric_name ASC`,
      [tenantId],
    );
    return result.rows;
  },

  async create(params: CreateMetricConfigParams): Promise<MetricConfig> {
    const result = await pool.query(
      `INSERT INTO metric_configs 
       (user_id, tenant_id, name, description, metric_name, metric_type, help_text, labels, buckets, quantiles)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        params.userId,
        params.tenantId,
        params.name,
        params.description || null,
        params.metricName,
        params.metricType,
        params.helpText || null,
        JSON.stringify(params.labels || []),
        params.buckets ? JSON.stringify(params.buckets) : null,
        params.quantiles ? JSON.stringify(params.quantiles) : null,
      ],
    );
    return result.rows[0];
  },

  async update(
    id: number,
    tenantId: string,
    params: UpdateMetricConfigParams,
  ): Promise<MetricConfig | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (params.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(params.name);
    }
    if (params.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(params.description);
    }
    if (params.metricName !== undefined) {
      updates.push(`metric_name = $${paramIndex++}`);
      values.push(params.metricName);
    }
    if (params.metricType !== undefined) {
      updates.push(`metric_type = $${paramIndex++}`);
      values.push(params.metricType);
    }
    if (params.helpText !== undefined) {
      updates.push(`help_text = $${paramIndex++}`);
      values.push(params.helpText);
    }
    if (params.labels !== undefined) {
      updates.push(`labels = $${paramIndex++}`);
      values.push(JSON.stringify(params.labels));
    }
    if (params.buckets !== undefined) {
      updates.push(`buckets = $${paramIndex++}`);
      values.push(params.buckets ? JSON.stringify(params.buckets) : null);
    }
    if (params.quantiles !== undefined) {
      updates.push(`quantiles = $${paramIndex++}`);
      values.push(params.quantiles ? JSON.stringify(params.quantiles) : null);
    }
    if (params.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(params.isActive);
    }

    if (updates.length === 0) {
      return this.findById(id, tenantId);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id, tenantId);

    const result = await pool.query(
      `UPDATE metric_configs 
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
       RETURNING *`,
      values,
    );
    return result.rows[0] || null;
  },

  async delete(id: number, tenantId: string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM metric_configs 
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return (result.rowCount ?? 0) > 0;
  },

  async exists(id: number, tenantId: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT 1 FROM metric_configs WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return result.rows.length > 0;
  },

  async metricNameExists(
    metricName: string,
    tenantId: string,
    excludeId?: number,
  ): Promise<boolean> {
    let query = `SELECT 1 FROM metric_configs WHERE metric_name = $1 AND tenant_id = $2`;
    const values: any[] = [metricName, tenantId];

    if (excludeId) {
      query += ` AND id != $3`;
      values.push(excludeId);
    }

    const result = await pool.query(query, values);
    return result.rows.length > 0;
  },
};
