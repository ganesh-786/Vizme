// src/repositories/apiKey.repository.ts
import { pool } from "../db/pool.js";

export interface ApiKey {
  id: number;
  user_id: string;
  tenant_id: string;
  key_name: string;
  key_prefix: string;
  key_hash: string;
  is_active: boolean;
  last_used_at: Date | null;
  expires_at: Date | null;
  rate_limit_per_minute: number;
  scopes: string[];
  created_at: Date;
  updated_at: Date;
}

// Safe version without hash
export interface ApiKeySafe {
  id: number;
  user_id: string;
  tenant_id: string;
  key_name: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at: Date | null;
  expires_at: Date | null;
  rate_limit_per_minute: number;
  api_key: string;
  scopes: string[];
  created_at: Date;
  updated_at: Date;
}

export interface CreateApiKeyParams {
  userId: string;
  tenantId: string;
  keyName: string;
  keyPrefix: string;
  keyHash: string;
  expiresAt?: Date;
  rateLimitPerMinute?: number;
  scopes?: string[];
}

export interface UpdateApiKeyParams {
  keyName?: string;
  isActive?: boolean;
  expiresAt?: Date | null;
  rateLimitPerMinute?: number;
  scopes?: string[];
}

const SAFE_COLUMNS = `
  id, user_id, tenant_id, key_name, key_prefix, is_active, 
  last_used_at, expires_at, rate_limit_per_minute, scopes, 
  created_at, updated_at
`;

export const apiKeyRepository = {
  async findAllByUser(userId: string): Promise<ApiKeySafe[]> {
    const result = await pool.query(
      `SELECT ${SAFE_COLUMNS} FROM api_keys 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows;
  },

  async findById(id: number, userId: string): Promise<ApiKeySafe | null> {
    const result = await pool.query(
      `SELECT ${SAFE_COLUMNS} FROM api_keys 
       WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return result.rows[0] || null;
  },

  async findByHash(keyHash: string): Promise<ApiKey | null> {
    const result = await pool.query(
      `SELECT * FROM api_keys WHERE key_hash = $1`,
      [keyHash],
    );
    return result.rows[0] || null;
  },

  async findByPrefix(keyPrefix: string): Promise<ApiKey[]> {
    const result = await pool.query(
      `SELECT * FROM api_keys WHERE key_prefix = $1`,
      [keyPrefix],
    );
    return result.rows;
  },

  async create(params: CreateApiKeyParams): Promise<ApiKeySafe> {
    const result = await pool.query(
      `INSERT INTO api_keys 
       (user_id, tenant_id, key_name, key_prefix, key_hash, expires_at, rate_limit_per_minute, scopes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${SAFE_COLUMNS}`,
      [
        params.userId,
        params.tenantId,
        params.keyName,
        params.keyPrefix,
        params.keyHash,
        params.expiresAt || null,
        params.rateLimitPerMinute || 1000,
        JSON.stringify(params.scopes || ["metrics:write"]),
      ],
    );
    return result.rows[0];
  },

  async update(
    id: number,
    userId: string,
    params: UpdateApiKeyParams,
  ): Promise<ApiKeySafe | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (params.keyName !== undefined) {
      updates.push(`key_name = $${paramIndex++}`);
      values.push(params.keyName);
    }
    if (params.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(params.isActive);
    }
    if (params.expiresAt !== undefined) {
      updates.push(`expires_at = $${paramIndex++}`);
      values.push(params.expiresAt);
    }
    if (params.rateLimitPerMinute !== undefined) {
      updates.push(`rate_limit_per_minute = $${paramIndex++}`);
      values.push(params.rateLimitPerMinute);
    }
    if (params.scopes !== undefined) {
      updates.push(`scopes = $${paramIndex++}`);
      values.push(JSON.stringify(params.scopes));
    }

    if (updates.length === 0) {
      return this.findById(id, userId);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id, userId);

    const result = await pool.query(
      `UPDATE api_keys 
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
       RETURNING ${SAFE_COLUMNS}`,
      values,
    );
    return result.rows[0] || null;
  },

  async updateLastUsed(id: number): Promise<void> {
    await pool.query(`UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`, [
      id,
    ]);
  },

  async delete(id: number, userId: string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM api_keys WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (result.rowCount ?? 0) > 0;
  },

  async exists(id: number, userId: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT 1 FROM api_keys WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return result.rows.length > 0;
  },

  async keyNameExists(
    keyName: string,
    userId: string,
    excludeId?: number,
  ): Promise<boolean> {
    let query = `SELECT 1 FROM api_keys WHERE key_name = $1 AND user_id = $2`;
    const values: any[] = [keyName, userId];

    if (excludeId) {
      query += ` AND id != $3`;
      values.push(excludeId);
    }

    const result = await pool.query(query, values);
    return result.rows.length > 0;
  },

  // Log usage for analytics
  async logUsage(
    apiKeyId: number,
    tenantId: string,
    endpoint: string,
    method: string,
    statusCode: number,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO api_key_usage_log 
       (api_key_id, tenant_id, endpoint, method, status_code, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [apiKeyId, tenantId, endpoint, method, statusCode, ipAddress, userAgent],
    );
  },
};
