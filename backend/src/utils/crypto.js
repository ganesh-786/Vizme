import crypto from 'crypto';

/**
 * SHA-256 hash for API keys and refresh tokens.
 * Fast enough for indexed lookups; appropriate for high-entropy secrets
 * where brute-force resistance is provided by the key's randomness (256 bits).
 */
export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
