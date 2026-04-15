import pg from 'pg';
import dotenv from 'dotenv';
import { config } from '../config.js';
import { logger } from '../logger.js';

dotenv.config();

const { Pool } = pg;

const sslConfig = config.db.ssl ? { rejectUnauthorized: config.db.sslRejectUnauthorized } : false;

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  ssl: sslConfig,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on('connect', () => {
  logger.debug('Database pool: new client connected');
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle database client');
});

export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug({ text, duration, rows: res.rowCount }, 'Executed query');
    return res;
  } catch (error) {
    logger.error({ text, err: error.message }, 'Query error');
    throw error;
  }
};

export const initDatabase = async (retries = 5, delay = 5000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logger.info(
        { attempt, retries, host: config.db.host, port: config.db.port, database: config.db.database },
        'Attempting database connection'
      );

      await query('SELECT NOW()');
      logger.info('Database connection successful');

      await runMigrations();

      logger.info('Database initialized successfully');
      return true;
    } catch (error) {
      logger.error(
        { err: error.message, attempt, retries },
        'Database initialization attempt failed'
      );

      if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
        logger.error(
          { hostname: config.db.host },
          'DNS resolution failed — verify the hostname is complete and reachable'
        );
      }

      if (attempt === retries) {
        logger.error('All database connection attempts exhausted');
        throw error;
      }

      logger.info({ retryInMs: delay }, 'Retrying database connection');
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

const runMigrations = async () => {
  const migrations = [
    // Users table
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Refresh tokens table
    `CREATE TABLE IF NOT EXISTS refresh_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(500) UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // API keys table
    `CREATE TABLE IF NOT EXISTS api_keys (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key_name VARCHAR(255) NOT NULL,
      api_key VARCHAR(255) UNIQUE NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Metric configs table
    `CREATE TABLE IF NOT EXISTS metric_configs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      metric_type VARCHAR(50) NOT NULL CHECK (metric_type IN ('counter', 'gauge', 'histogram', 'summary')),
      metric_name VARCHAR(255) NOT NULL,
      labels JSONB DEFAULT '[]'::jsonb,
      help_text TEXT,
      status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'draft')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, metric_name)
    )`,

    // Add status column to existing metric_configs (idempotent)
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'metric_configs' AND column_name = 'status') THEN
        ALTER TABLE metric_configs ADD COLUMN status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'draft'));
      END IF;
    END $$`,

    // Add metric_config_id column to api_keys (idempotent) — links key to a specific metric configuration
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'metric_config_id') THEN
        ALTER TABLE api_keys ADD COLUMN metric_config_id INTEGER REFERENCES metric_configs(id) ON DELETE SET NULL;
      END IF;
    END $$`,

    // (Legacy) Unique partial index for old per-metric keys — kept for backward
    // compat but new keys are user-level.
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_user_metric_config ON api_keys (user_id, metric_config_id) WHERE metric_config_id IS NOT NULL`,

    // Add onboarding_completed_at column to users (tracks when the user finished setup)
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'onboarding_completed_at') THEN
        ALTER TABLE users ADD COLUMN onboarding_completed_at TIMESTAMP DEFAULT NULL;
      END IF;
    END $$`,

    // Sites (properties) per user — optional site_id label on metrics when ingesting with a site-scoped API key
    `CREATE TABLE IF NOT EXISTS sites (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE INDEX IF NOT EXISTS idx_sites_user_id ON sites(user_id)`,

    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'site_id') THEN
        ALTER TABLE api_keys ADD COLUMN site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL;
      END IF;
    END $$`,

    `CREATE INDEX IF NOT EXISTS idx_api_keys_site_id ON api_keys(site_id)`,

    // Dashboard widgets: config-driven KPIs for Live Metrics (per user, optionally per site)
    `CREATE TABLE IF NOT EXISTS dashboard_widgets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
      metric_name VARCHAR(255) NOT NULL,
      query_kind VARCHAR(50) NOT NULL CHECK (query_kind IN ('increase_24h', 'max_latest', 'custom')),
      promql_custom TEXT,
      title VARCHAR(255) NOT NULL,
      subtitle TEXT,
      section VARCHAR(100) DEFAULT 'primary',
      sort_order INTEGER DEFAULT 0,
      format VARCHAR(20) DEFAULT 'number' CHECK (format IN ('currency', 'number', 'percent', 'integer')),
      currency_code VARCHAR(10) DEFAULT 'USD',
      include_in_multi_chart BOOLEAN DEFAULT false,
      featured_chart BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_user_id ON dashboard_widgets(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_site_id ON dashboard_widgets(site_id)`,

    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
    `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token)`,
    // Add key_prefix column (stores first 10 chars for display identification)
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'key_prefix') THEN
        ALTER TABLE api_keys ADD COLUMN key_prefix VARCHAR(12);
      END IF;
    END $$`,

    // One-time migration: hash any remaining plaintext keys (those starting with 'mk_')
    `DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM api_keys WHERE api_key LIKE 'mk\\_%' LIMIT 1) THEN
        UPDATE api_keys
           SET key_prefix = LEFT(api_key, 10),
               api_key    = encode(sha256(convert_to(api_key, 'UTF8')), 'hex')
         WHERE api_key LIKE 'mk\\_%';
      END IF;
    END $$`,

    `CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_api_keys_api_key ON api_keys(api_key)`,
    `CREATE INDEX IF NOT EXISTS idx_metric_configs_user_id ON metric_configs(user_id)`,
  ];

  for (const migration of migrations) {
    await query(migration);
  }

  logger.info('Migrations completed');
};

export default pool;
