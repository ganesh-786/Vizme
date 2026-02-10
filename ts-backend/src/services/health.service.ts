import { pool } from '@/db/pool.js';

// Checks if the database connection is healthy by running a simple query.
export async function checkHealth() {
  try {
    const result = await pool.query('SELECT 1 as ok');
    return { ok: result.rows[0]?.ok === 1 };
  } catch (_error) {
    return { ok: false };
  }
}
