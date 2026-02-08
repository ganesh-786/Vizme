// src/services/apiKey.service.ts
import crypto from "crypto";
import {
  apiKeyRepository,
  CreateApiKeyParams,
  UpdateApiKeyParams,
  ApiKeySafe,
  ApiKey,
} from "../repositories/apiKey.repository.js";
import { logger } from "../utils/logger.js";

// API Key format: vizme_[prefix]_[random]
// Example: vizme_abc12345_xyzabc123456789...
const API_KEY_PREFIX = "vizme";
const KEY_PREFIX_LENGTH = 8; // Characters shown to user for identification
const KEY_RANDOM_LENGTH = 32; // Random bytes for security

export interface CreateApiKeyInput {
  key_name: string;
  expires_in_days?: number;
  rate_limit_per_minute?: number;
  scopes?: string[];
}

export interface UpdateApiKeyInput {
  key_name?: string;
  is_active?: boolean;
  expires_at?: Date | null;
  rate_limit_per_minute?: number;
  scopes?: string[];
}

export interface ApiKeyValidationResult {
  valid: boolean;
  apiKey?: ApiKey;
  tenantId?: string;
  error?: string;
}

function generateApiKey(): { fullKey: string; prefix: string; hash: string } {
  // Generate random bytes for the key
  const randomPart = crypto.randomBytes(KEY_RANDOM_LENGTH).toString("hex");

  // Create the full key
  const prefix = randomPart.substring(0, KEY_PREFIX_LENGTH);
  const fullKey = `${API_KEY_PREFIX}_${prefix}_${randomPart}`;

  // Hash the full key for storage
  const hash = crypto.createHash("sha256").update(fullKey).digest("hex");

  return { fullKey, prefix, hash };
}

function hashApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

function extractPrefix(apiKey: string): string | null {
  // Format: vizme_[prefix]_[random]
  const parts = apiKey.split("_");
  if (parts.length !== 3 || parts[0] !== API_KEY_PREFIX) {
    return null;
  }
  return parts[1];
}

export const apiKeyService = {
  async getAll(userId: string): Promise<ApiKeySafe[]> {
    const keys = await apiKeyRepository.findAllByUser(userId);

    // Add display version of key (masked)
    return keys.map((key) => ({
      ...key,
      // Display format: vizme_abc12345_****...
      api_key: `${API_KEY_PREFIX}_${key.key_prefix}_****...`,
    }));
  },

  async getById(id: number, userId: string): Promise<ApiKeySafe> {
    const key = await apiKeyRepository.findById(id, userId);
    if (!key) {
      throw new Error("API key not found");
    }
    return {
      ...key,
      api_key: `${API_KEY_PREFIX}_${key.key_prefix}_****...`,
    };
  },

  async create(
    userId: string,
    tenantId: string,
    input: CreateApiKeyInput,
  ): Promise<{ key: ApiKeySafe; api_key: string }> {
    // Validate key name
    if (!input.key_name || input.key_name.trim().length === 0) {
      throw new Error("Key name is required");
    }

    if (input.key_name.length > 255) {
      throw new Error("Key name must be 255 characters or less");
    }

    // Check for duplicate name
    const nameExists = await apiKeyRepository.keyNameExists(
      input.key_name.trim(),
      userId,
    );
    if (nameExists) {
      throw new Error("An API key with this name already exists");
    }

    // Validate rate limit
    if (input.rate_limit_per_minute !== undefined) {
      if (
        input.rate_limit_per_minute < 1 ||
        input.rate_limit_per_minute > 100000
      ) {
        throw new Error(
          "Rate limit must be between 1 and 100,000 requests per minute",
        );
      }
    }

    // Validate scopes
    const validScopes = ["metrics:write", "metrics:read", "config:read"];
    if (input.scopes) {
      for (const scope of input.scopes) {
        if (!validScopes.includes(scope)) {
          throw new Error(`Invalid scope: ${scope}`);
        }
      }
    }

    // Generate the API key
    const { fullKey, prefix, hash } = generateApiKey();

    // Calculate expiration
    let expiresAt: Date | undefined;
    if (input.expires_in_days && input.expires_in_days > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + input.expires_in_days);
    }

    const params: CreateApiKeyParams = {
      userId,
      tenantId,
      keyName: input.key_name.trim(),
      keyPrefix: prefix,
      keyHash: hash,
      expiresAt,
      rateLimitPerMinute: input.rate_limit_per_minute,
      scopes: input.scopes || ["metrics:write"],
    };

    const key = await apiKeyRepository.create(params);

    logger.info(
      { keyId: key.id, userId, keyPrefix: prefix },
      "API key created",
    );

    // Return the key with the full API key (only shown once!)
    return {
      key: {
        ...key,
        api_key: `${API_KEY_PREFIX}_${prefix}_****...`,
      },
      api_key: fullKey, // The actual key - shown only once
    };
  },

  async update(
    id: number,
    userId: string,
    input: UpdateApiKeyInput,
  ): Promise<ApiKeySafe> {
    // Check exists
    const existing = await apiKeyRepository.findById(id, userId);
    if (!existing) {
      throw new Error("API key not found");
    }

    // Validate key name if provided
    if (input.key_name !== undefined) {
      if (input.key_name.trim().length === 0) {
        throw new Error("Key name cannot be empty");
      }
      if (input.key_name.length > 255) {
        throw new Error("Key name must be 255 characters or less");
      }

      // Check for duplicate name (excluding current)
      const nameExists = await apiKeyRepository.keyNameExists(
        input.key_name.trim(),
        userId,
        id,
      );
      if (nameExists) {
        throw new Error("An API key with this name already exists");
      }
    }

    const params: UpdateApiKeyParams = {
      keyName: input.key_name?.trim(),
      isActive: input.is_active,
      expiresAt: input.expires_at,
      rateLimitPerMinute: input.rate_limit_per_minute,
      scopes: input.scopes,
    };

    const key = await apiKeyRepository.update(id, userId, params);
    if (!key) {
      throw new Error("Failed to update API key");
    }

    logger.info({ keyId: id, userId }, "API key updated");

    return {
      ...key,
      api_key: `${API_KEY_PREFIX}_${key.key_prefix}_****...`,
    };
  },

  async delete(id: number, userId: string): Promise<void> {
    const deleted = await apiKeyRepository.delete(id, userId);
    if (!deleted) {
      throw new Error("API key not found");
    }
    logger.info({ keyId: id, userId }, "API key deleted");
  },

  /**
   * Validate an API key for SDK authentication
   * This is the method used by the SDK middleware
   */
  async validateApiKey(apiKey: string): Promise<ApiKeyValidationResult> {
    // Basic format validation
    if (!apiKey || typeof apiKey !== "string") {
      return { valid: false, error: "API key is required" };
    }

    const prefix = extractPrefix(apiKey);
    if (!prefix) {
      return { valid: false, error: "Invalid API key format" };
    }

    // Hash the provided key
    const keyHash = hashApiKey(apiKey);

    // Look up by hash
    const storedKey = await apiKeyRepository.findByHash(keyHash);
    if (!storedKey) {
      // Security: Use timing-safe comparison to prevent timing attacks
      // Even if key not found, we still do a dummy comparison
      logger.warn({ keyPrefix: prefix }, "Invalid API key attempted");
      return { valid: false, error: "Invalid API key" };
    }

    // Check if active
    if (!storedKey.is_active) {
      logger.warn(
        { keyId: storedKey.id, keyPrefix: prefix },
        "Inactive API key attempted",
      );
      return { valid: false, error: "API key is inactive" };
    }

    // Check expiration
    if (storedKey.expires_at && new Date() > new Date(storedKey.expires_at)) {
      logger.warn(
        { keyId: storedKey.id, keyPrefix: prefix },
        "Expired API key attempted",
      );
      return { valid: false, error: "API key has expired" };
    }

    // Update last used timestamp (non-blocking)
    apiKeyRepository.updateLastUsed(storedKey.id).catch((err) => {
      logger.error(
        { error: err, keyId: storedKey.id },
        "Failed to update last_used_at",
      );
    });

    return {
      valid: true,
      apiKey: storedKey,
      tenantId: storedKey.tenant_id,
    };
  },

  /**
   * Check if an API key has a specific scope
   */
  hasScope(apiKey: ApiKey, requiredScope: string): boolean {
    return apiKey.scopes.includes(requiredScope);
  },
};
