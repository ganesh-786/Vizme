// src/db/migrate.ts
import { pool } from './pool.js';
import { logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();

  try {
    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Get already executed migrations
    const { rows: executed } = await client.query(
      'SELECT name FROM _migrations ORDER BY name'
    );
    const executedNames = new Set(executed.map((r) => r.name));

    // Read migration files
    let files: string[];
    try {
      files = await fs.readdir(MIGRATIONS_DIR);
    } catch {
      logger.warn('No migrations directory found, skipping migrations');
      return;
    }

    // Filter and sort SQL files
    const migrationFiles = files.filter((f) => f.endsWith('.sql')).sort(); // Sorts by filename (001_, 002_, etc.)

    // Run pending migrations
    for (const file of migrationFiles) {
      const migrationName = file.replace('.sql', '');

      if (executedNames.has(migrationName)) {
        logger.debug(
          { migration: migrationName },
          'Migration already executed'
        );
        continue;
      }

      logger.info({ migration: migrationName }, 'Running migration');

      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = await fs.readFile(filePath, 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [
          migrationName,
        ]);
        await client.query('COMMIT');
        logger.info({ migration: migrationName }, 'Migration completed');
      } catch (error) {
        await client.query('ROLLBACK');
        logger.error({ migration: migrationName, error }, 'Migration failed');
        throw error;
      }
    }

    logger.info('All migrations completed');
  } finally {
    client.release();
  }
}
