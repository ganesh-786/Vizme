-- src/db/migrations/004_create_metric_configs_table.sql
CREATE TABLE IF NOT EXISTS metric_configs (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  metric_name VARCHAR(255) NOT NULL,
  metric_type VARCHAR(50) NOT NULL CHECK (metric_type IN ('counter', 'gauge', 'histogram', 'summary')),
  help_text TEXT,
  labels JSONB DEFAULT '[]'::jsonb,
  buckets JSONB DEFAULT NULL, -- For histogram type
  quantiles JSONB DEFAULT NULL, -- For summary type
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Unique constraint: one metric name per tenant
  CONSTRAINT unique_metric_name_per_tenant UNIQUE (tenant_id, metric_name)
);

CREATE INDEX IF NOT EXISTS idx_metric_configs_user_id ON metric_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_metric_configs_tenant_id ON metric_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_metric_configs_metric_name ON metric_configs(metric_name);
CREATE INDEX IF NOT EXISTS idx_metric_configs_is_active ON metric_configs(is_active);
