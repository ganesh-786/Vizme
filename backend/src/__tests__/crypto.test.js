import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { sha256 } from '../utils/crypto.js';

describe('sha256', () => {
  it('returns a 64-char hex string', () => {
    const hash = sha256('test-input');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    expect(sha256('same')).toBe(sha256('same'));
  });

  it('differs for different inputs', () => {
    expect(sha256('a')).not.toBe(sha256('b'));
  });

  it('matches Node native crypto', () => {
    const input = 'mk_' + 'a'.repeat(64);
    const expected = crypto.createHash('sha256').update(input).digest('hex');
    expect(sha256(input)).toBe(expected);
  });
});
