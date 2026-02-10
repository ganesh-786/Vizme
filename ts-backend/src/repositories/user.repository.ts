// src/repositories/user.repository.ts
import { pool } from '../db/pool.js';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  tenant_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserParams {
  email: string;
  passwordHash: string;
  name?: string;
  tenantId: string;
}

export const userRepository = {
  async findByEmail(email: string): Promise<User | null> {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [
      email.toLowerCase(),
    ]);
    return result.rows[0] || null;
  },

  async findById(id: string): Promise<User | null> {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async create(params: CreateUserParams): Promise<User> {
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, tenant_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        params.email.toLowerCase(),
        params.passwordHash,
        params.name,
        params.tenantId,
      ]
    );
    return result.rows[0];
  },

  async emailExists(email: string): Promise<boolean> {
    const result = await pool.query('SELECT 1 FROM users WHERE email = $1', [
      email.toLowerCase(),
    ]);
    return result.rows.length > 0;
  },
};
