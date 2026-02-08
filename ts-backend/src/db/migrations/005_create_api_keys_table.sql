-- src/db/migrations/005_create_api_keys_table.sql
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id VARCHAR(50) NOT NULL,
  key_name VARCHAR(255) NOT NULL,
  
  -- Store prefix (visible) and hash (secure) separately
  key_prefix VARCHAR(12) NOT NULL, -- First 8 chars of key for identification
  key_hash VARCHAR(255) NOT NULL,  -- SHA-256 hash of full key
  
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP, -- NULL means never expires
  
  -- Rate limiting per key
  rate_limit_per_minute INTEGER DEFAULT 1000,
  
  -- Scopes/permissions
  scopes JSONB DEFAULT '["metrics:write"]'::jsonb,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Unique constraint: one key name per user
  CONSTRAINT unique_key_name_per_user UNIQUE (user_id, key_name)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant_id ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);