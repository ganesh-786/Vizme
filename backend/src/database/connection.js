import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

// SSL configuration for external databases
const sslConfig =
  process.env.DB_SSL === "true"
    ? {
        rejectUnauthorized: false, // Set to true in production with proper certs
      }
    : false;

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "metrics_db",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  ssl: sslConfig,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Increased from 2000ms to 10s for external DB
  // Connection pool settings for external databases
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
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

export const initDatabase = async (retries = 5, delay = 5000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(
        `🔄 Attempting database connection (${attempt}/${retries})...`
      );
      console.log(
        `📡 Connecting to: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`
      );

      // Test connection
      await query("SELECT NOW()");
      console.log("✅ Database connection successful");

      // Run migrations
      await runMigrations();

      console.log("✅ Database initialized successfully");
      return true;
    } catch (error) {
      console.error(
        `❌ Database initialization attempt ${attempt}/${retries} failed:`,
        error.message
      );

      // Provide specific guidance for DNS errors
      if (
        error.message.includes("ENOTFOUND") ||
        error.message.includes("getaddrinfo")
      ) {
        console.error("🔍 DNS Resolution Error Detected:");
        console.error(`   - Hostname: ${process.env.DB_HOST}`);
        console.error("   - This hostname cannot be resolved");
        console.error("💡 Common issues:");
        console.error("   1. Hostname is incomplete (missing domain suffix)");
        console.error("   2. Hostname is incorrect");
        console.error("   3. Network connectivity issue");
        console.error("💡 For Render.com databases, use full hostname like:");
        console.error("   dpg-xxxxx-xxxxx-a.oregon-postgres.render.com");
        console.error(
          "💡 Check your database provider's connection string for the complete hostname"
        );
      }

      if (attempt === retries) {
        console.error("❌ All database connection attempts failed");
        console.error("💡 Check your database credentials in .env file");
        console.error("💡 Verify database is accessible from container");
        console.error(
          "💡 Test DNS resolution: nslookup " + process.env.DB_HOST
        );
        throw error;
      }

      console.log(`⏳ Retrying in ${delay / 1000} seconds...`);
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, metric_name)
    )`,

    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
    `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token)`,
    `CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_api_keys_api_key ON api_keys(api_key)`,
    `CREATE INDEX IF NOT EXISTS idx_metric_configs_user_id ON metric_configs(user_id)`,
  ];

  for (const migration of migrations) {
    await query(migration);
  }

  // Keycloak migration: add keycloak_sub to users, make password_hash optional (no local passwords)
  const keycloakMigrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS keycloak_sub VARCHAR(255) UNIQUE`,
    `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`,
  ];
  for (const m of keycloakMigrations) {
    try {
      await query(m);
    } catch (e) {
      if (e.code !== '42701' && e.code !== '23502') console.error('Keycloak migration warning:', e.message);
    }
  }

  console.log("✅ Migrations completed");
};

export default pool;
