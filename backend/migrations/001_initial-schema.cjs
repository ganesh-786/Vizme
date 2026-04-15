/**
 * Initial schema — captures the existing database structure as the baseline
 * migration. All prior CREATE TABLE IF NOT EXISTS logic in connection.js is
 * represented here as a versioned, rollback-capable migration.
 */

exports.up = (pgm) => {
  pgm.createTable('users', {
    id: 'id',
    email: { type: 'varchar(255)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)', notNull: true },
    name: { type: 'varchar(255)' },
    onboarding_completed_at: { type: 'timestamp' },
    created_at: { type: 'timestamp', default: pgm.func('CURRENT_TIMESTAMP') },
    updated_at: { type: 'timestamp', default: pgm.func('CURRENT_TIMESTAMP') },
  }, { ifNotExists: true });

  pgm.createTable('refresh_tokens', {
    id: 'id',
    user_id: {
      type: 'integer', notNull: true,
      references: 'users', onDelete: 'CASCADE',
    },
    token: { type: 'varchar(500)', notNull: true, unique: true },
    expires_at: { type: 'timestamp', notNull: true },
    created_at: { type: 'timestamp', default: pgm.func('CURRENT_TIMESTAMP') },
  }, { ifNotExists: true });

  pgm.createTable('metric_configs', {
    id: 'id',
    user_id: {
      type: 'integer', notNull: true,
      references: 'users', onDelete: 'CASCADE',
    },
    name: { type: 'varchar(255)', notNull: true },
    description: { type: 'text' },
    metric_type: {
      type: 'varchar(50)', notNull: true,
      check: "metric_type IN ('counter', 'gauge', 'histogram', 'summary')",
    },
    metric_name: { type: 'varchar(255)', notNull: true },
    labels: { type: 'jsonb', default: "'[]'::jsonb" },
    help_text: { type: 'text' },
    status: {
      type: 'varchar(50)', default: "'active'",
      check: "status IN ('active', 'paused', 'draft')",
    },
    created_at: { type: 'timestamp', default: pgm.func('CURRENT_TIMESTAMP') },
    updated_at: { type: 'timestamp', default: pgm.func('CURRENT_TIMESTAMP') },
  }, {
    ifNotExists: true,
    constraints: { unique: [['user_id', 'metric_name']] },
  });

  pgm.createTable('sites', {
    id: 'id',
    user_id: {
      type: 'integer', notNull: true,
      references: 'users', onDelete: 'CASCADE',
    },
    name: { type: 'varchar(255)', notNull: true },
    created_at: { type: 'timestamp', default: pgm.func('CURRENT_TIMESTAMP') },
    updated_at: { type: 'timestamp', default: pgm.func('CURRENT_TIMESTAMP') },
  }, { ifNotExists: true });

  pgm.createTable('api_keys', {
    id: 'id',
    user_id: {
      type: 'integer', notNull: true,
      references: 'users', onDelete: 'CASCADE',
    },
    key_name: { type: 'varchar(255)', notNull: true },
    api_key: { type: 'varchar(255)', notNull: true, unique: true },
    key_prefix: { type: 'varchar(12)' },
    metric_config_id: {
      type: 'integer',
      references: 'metric_configs', onDelete: 'SET NULL',
    },
    site_id: {
      type: 'integer',
      references: 'sites', onDelete: 'SET NULL',
    },
    is_active: { type: 'boolean', default: true },
    created_at: { type: 'timestamp', default: pgm.func('CURRENT_TIMESTAMP') },
    updated_at: { type: 'timestamp', default: pgm.func('CURRENT_TIMESTAMP') },
  }, { ifNotExists: true });

  pgm.createTable('dashboard_widgets', {
    id: 'id',
    user_id: {
      type: 'integer', notNull: true,
      references: 'users', onDelete: 'CASCADE',
    },
    site_id: {
      type: 'integer',
      references: 'sites', onDelete: 'CASCADE',
    },
    metric_name: { type: 'varchar(255)', notNull: true },
    query_kind: {
      type: 'varchar(50)', notNull: true,
      check: "query_kind IN ('increase_24h', 'max_latest', 'custom')",
    },
    promql_custom: { type: 'text' },
    title: { type: 'varchar(255)', notNull: true },
    subtitle: { type: 'text' },
    section: { type: 'varchar(100)', default: "'primary'" },
    sort_order: { type: 'integer', default: 0 },
    format: {
      type: 'varchar(20)', default: "'number'",
      check: "format IN ('currency', 'number', 'percent', 'integer')",
    },
    currency_code: { type: 'varchar(10)', default: "'USD'" },
    include_in_multi_chart: { type: 'boolean', default: false },
    featured_chart: { type: 'boolean', default: false },
    created_at: { type: 'timestamp', default: pgm.func('CURRENT_TIMESTAMP') },
    updated_at: { type: 'timestamp', default: pgm.func('CURRENT_TIMESTAMP') },
  }, { ifNotExists: true });

  // Indexes
  pgm.createIndex('users', 'email', { ifNotExists: true, name: 'idx_users_email' });
  pgm.createIndex('refresh_tokens', 'user_id', { ifNotExists: true, name: 'idx_refresh_tokens_user_id' });
  pgm.createIndex('refresh_tokens', 'token', { ifNotExists: true, name: 'idx_refresh_tokens_token' });
  pgm.createIndex('api_keys', 'user_id', { ifNotExists: true, name: 'idx_api_keys_user_id' });
  pgm.createIndex('api_keys', 'api_key', { ifNotExists: true, name: 'idx_api_keys_api_key' });
  pgm.createIndex('api_keys', 'site_id', { ifNotExists: true, name: 'idx_api_keys_site_id' });
  pgm.createIndex('metric_configs', 'user_id', { ifNotExists: true, name: 'idx_metric_configs_user_id' });
  pgm.createIndex('sites', 'user_id', { ifNotExists: true, name: 'idx_sites_user_id' });
  pgm.createIndex('dashboard_widgets', 'user_id', { ifNotExists: true, name: 'idx_dashboard_widgets_user_id' });
  pgm.createIndex('dashboard_widgets', 'site_id', { ifNotExists: true, name: 'idx_dashboard_widgets_site_id' });
};

exports.down = (pgm) => {
  pgm.dropTable('dashboard_widgets', { ifExists: true, cascade: true });
  pgm.dropTable('api_keys', { ifExists: true, cascade: true });
  pgm.dropTable('sites', { ifExists: true, cascade: true });
  pgm.dropTable('metric_configs', { ifExists: true, cascade: true });
  pgm.dropTable('refresh_tokens', { ifExists: true, cascade: true });
  pgm.dropTable('users', { ifExists: true, cascade: true });
};
