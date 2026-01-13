import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "metrics_db",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Increased to 10 seconds
});

// Test connection
pool.on("connect", () => {
  console.log("✅ Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("❌ Unexpected error on idle client", err);
  process.exit(-1);
});

export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log("Executed query", { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error("Query error", { text, error: error.message });
    throw error;
  }
};

export const initDatabase = async () => {
  const maxRetries = 5;
  const retryDelay = 2000; // 2 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Attempting database connection (attempt ${attempt}/${maxRetries})...`);
      
      // Test connection with retry
      await query("SELECT NOW()");
      console.log("✅ Database connection successful");

      // Run migrations
      await runMigrations();

      console.log("✅ Database initialized successfully");
      return true;
    } catch (error) {
      console.error(`❌ Database connection attempt ${attempt} failed:`, error.message);
      
      if (attempt < maxRetries) {
        console.log(`⏳ Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        console.error("❌ Database initialization failed after all retries:", error);
        throw error;
      }
    }
  }
};

const runMigrations = async () => {
  const migrations = [
    // Users table
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255),
      name VARCHAR(255),
      keycloak_id VARCHAR(255) UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    // Add keycloak_id column if it doesn't exist (for existing databases)
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS keycloak_id VARCHAR(255)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_keycloak_id ON users(keycloak_id) WHERE keycloak_id IS NOT NULL`,

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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, metric_name)
    )`,

    // Login records table - tracks all user login attempts and sessions
    `CREATE TABLE IF NOT EXISTS login_records (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      keycloak_id VARCHAR(255),
      email VARCHAR(255) NOT NULL,
      login_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      logout_timestamp TIMESTAMP,
      ip_address VARCHAR(45),
      user_agent TEXT,
      login_status VARCHAR(20) DEFAULT 'success' CHECK (login_status IN ('success', 'failed', 'expired')),
      session_duration INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Indexes - only create if table exists
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
    `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token)`,
    `CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_api_keys_api_key ON api_keys(api_key)`,
    `CREATE INDEX IF NOT EXISTS idx_metric_configs_user_id ON metric_configs(user_id)`,
    `DO $$ BEGIN
       IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'login_records') THEN
         CREATE INDEX IF NOT EXISTS idx_login_records_user_id ON login_records(user_id);
         CREATE INDEX IF NOT EXISTS idx_login_records_keycloak_id ON login_records(keycloak_id);
         CREATE INDEX IF NOT EXISTS idx_login_records_login_timestamp ON login_records(login_timestamp DESC);
       END IF;
     END $$;`,
  ];

  for (let i = 0; i < migrations.length; i++) {
    try {
      console.log(`🔄 Running migration ${i + 1}/${migrations.length}...`);
      await query(migrations[i]);
    } catch (error) {
      console.error(`❌ Migration ${i + 1} failed:`, error.message);
      // Continue with next migration even if one fails (for IF NOT EXISTS cases)
      if (!error.message.includes('already exists') && !error.message.includes('duplicate')) {
        throw error;
      }
    }
  }

  console.log("✅ Migrations completed");
};

export default pool;
