import { query } from '../database/connection.js';

function parseTenantId(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

async function ensureTenantForUser(userId) {
  const tenantName = `user-${userId}`;
  const created = await query(
    `INSERT INTO tenants (name)
     VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name`,
    [tenantName]
  );
  const tenant = created.rows[0];

  await query(
    `INSERT INTO tenant_memberships (tenant_id, user_id, role)
     VALUES ($1, $2, 'owner')
     ON CONFLICT (tenant_id, user_id) DO NOTHING`,
    [tenant.id, userId]
  );

  await query(
    `UPDATE users
     SET default_tenant_id = COALESCE(default_tenant_id, $1), updated_at = NOW()
     WHERE id = $2`,
    [tenant.id, userId]
  );

  return tenant;
}

export async function resolveTenantContextForUser(userId, requestedTenantId = null) {
  const userRow = await query(
    'SELECT id, default_tenant_id FROM users WHERE id = $1',
    [userId]
  );
  if (userRow.rows.length === 0) {
    throw new Error('User not found for tenant resolution');
  }

  let defaultTenantId = userRow.rows[0].default_tenant_id;
  if (!defaultTenantId) {
    const tenant = await ensureTenantForUser(userId);
    defaultTenantId = tenant.id;
  }

  const requested = parseTenantId(requestedTenantId);
  const effectiveTenantId = requested ?? defaultTenantId;

  const membership = await query(
    `SELECT tenant_id, role
     FROM tenant_memberships
     WHERE user_id = $1 AND tenant_id = $2`,
    [userId, effectiveTenantId]
  );

  if (membership.rows.length === 0) {
    const fallback = await query(
      `SELECT tenant_id, role
       FROM tenant_memberships
       WHERE user_id = $1 AND tenant_id = $2`,
      [userId, defaultTenantId]
    );
    if (fallback.rows.length === 0) {
      const tenant = await ensureTenantForUser(userId);
      return {
        id: tenant.id,
        role: 'owner',
        source: 'auto-provisioned',
      };
    }
    return {
      id: fallback.rows[0].tenant_id,
      role: fallback.rows[0].role,
      source: 'default',
    };
  }

  return {
    id: membership.rows[0].tenant_id,
    role: membership.rows[0].role,
    source: requested ? 'requested' : 'default',
  };
}

