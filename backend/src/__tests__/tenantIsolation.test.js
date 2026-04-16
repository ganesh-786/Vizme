import { describe, it, expect } from 'vitest';
import { buildTenantLabelFilter } from '../services/dashboardWidget.service.js';

describe('buildTenantLabelFilter', () => {
  it('returns user_id filter for user-only query', () => {
    const result = buildTenantLabelFilter(42);
    expect(result).toBe('user_id=~"^42$"');
  });

  it('appends site_id filter when provided', () => {
    const result = buildTenantLabelFilter(7, 'site-abc');
    expect(result).toContain('user_id=~"^7$"');
    expect(result).toContain('site_id=~"^site-abc$"');
  });

  it('omits site_id when null', () => {
    const result = buildTenantLabelFilter(1, null);
    expect(result).not.toContain('site_id');
  });

  it('omits site_id when empty string', () => {
    const result = buildTenantLabelFilter(1, '');
    expect(result).not.toContain('site_id');
  });

  it('escapes backslashes in userId', () => {
    const result = buildTenantLabelFilter('a\\b');
    expect(result).toContain('a\\\\b');
  });

  it('escapes double quotes in userId', () => {
    const result = buildTenantLabelFilter('a"b');
    expect(result).toContain('a\\"b');
  });

  it('escapes special chars in siteId', () => {
    const result = buildTenantLabelFilter(1, 'x"y\\z');
    expect(result).toContain('x\\"y\\\\z');
  });
});
