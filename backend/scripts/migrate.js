#!/usr/bin/env node
import pool, { initDatabase } from '../src/database/connection.js';
import { logger } from '../src/logger.js';

try {
  await initDatabase();
  logger.info('Standalone migration completed');
} catch (err) {
  logger.error({ err }, 'Migration failed');
  process.exit(1);
} finally {
  await pool.end();
}
