// src/repositories/refreshToken.repository.ts
import { pool } from '@/db/pool.js';
import crypto from 'crypto';

export interface RefreshTokenData {
  user_id: string;
  expires_at: Date;
  family_id: string;
  is_revoked: boolean;
}

export const refreshTokenRepository = {
  // Hash token before storing (security best practice)
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  },

  /**
   * Save a new refresh token
   * @param familyId - If provided, continues the token family chain (for refresh rotation)
   *                   If not provided, starts a new family (for login/signup)
   * @returns The family_id of the saved token
   */
  async save(
    userId: string,
    token: string,
    expiresAt: Date,
    familyId?: string
  ): Promise<string> {
    const tokenHash = this.hashToken(token);
    const family = familyId || crypto.randomUUID();
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, family_id, is_revoked)
       VALUES ($1, $2, $3, $4, FALSE)`,
      [userId, tokenHash, expiresAt, family]
    );
    return family;
  },

  /**
   * Find a token by its value (includes revoked tokens for reuse detection)
   */
  async findByToken(token: string): Promise<RefreshTokenData | null> {
    const tokenHash = this.hashToken(token);
    const result = await pool.query(
      `SELECT user_id, expires_at, family_id, is_revoked FROM refresh_tokens
       WHERE token_hash = $1 AND expires_at > NOW()`,
      [tokenHash]
    );
    return result.rows[0] || null;
  },

  /**
   * Mark a token as revoked (used) instead of deleting
   * This allows detection of token reuse attacks
   */
  async markRevoked(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    await pool.query(
      'UPDATE refresh_tokens SET is_revoked = TRUE WHERE token_hash = $1',
      [tokenHash]
    );
  },

  /**
   * Delete a specific token (for backward compatibility)
   */
  async deleteByToken(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [
      tokenHash,
    ]);
  },

  /**
   * Revoke an entire token family (used when reuse is detected)
   * This invalidates all tokens in the refresh chain
   */
  async revokeFamily(familyId: string): Promise<void> {
    await pool.query('DELETE FROM refresh_tokens WHERE family_id = $1', [
      familyId,
    ]);
  },

  /**
   * Delete all tokens for a user (logout from all devices)
   */
  async deleteAllForUser(userId: string): Promise<void> {
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
  },

  /**
   * Cleanup expired tokens (run periodically)
   */
  async deleteExpired(): Promise<void> {
    await pool.query('DELETE FROM refresh_tokens WHERE expires_at < NOW()');
  },
};
