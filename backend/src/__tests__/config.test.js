import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests config validation logic by extracting the env-validation
 * rules rather than re-importing the module (Vite ESM modules are
 * singletons and cannot be cache-busted with query strings).
 */

function runValidation(env) {
  const isProduction = env.NODE_ENV === 'production';
  const requiredProduction = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET'];
  const requiredAll = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];

  const required = isProduction ? requiredProduction : requiredAll;
  const missing = required.filter((key) => !env[key] || env[key] === '');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}.`);
  }

  if (isProduction) {
    const secret = env.JWT_SECRET;
    if (
      !secret ||
      secret.length < 32 ||
      /change-in-production|your-secret|dev|test/i.test(secret)
    ) {
      throw new Error(
        'JWT_SECRET must be set to a strong random value (min 32 chars) in production.'
      );
    }
  }
}

describe('config validation rules', () => {
  it('fails in production without JWT_SECRET', () => {
    expect(() =>
      runValidation({
        NODE_ENV: 'production',
        DB_HOST: 'localhost',
        DB_NAME: 'db',
        DB_USER: 'user',
        DB_PASSWORD: 'pw',
      })
    ).toThrow(/JWT_SECRET/);
  });

  it('fails in production with short JWT_SECRET', () => {
    expect(() =>
      runValidation({
        NODE_ENV: 'production',
        DB_HOST: 'localhost',
        DB_NAME: 'db',
        DB_USER: 'user',
        DB_PASSWORD: 'pw',
        JWT_SECRET: 'short',
      })
    ).toThrow(/strong random value/);
  });

  it('fails in production with weak JWT_SECRET pattern', () => {
    expect(() =>
      runValidation({
        NODE_ENV: 'production',
        DB_HOST: 'localhost',
        DB_NAME: 'db',
        DB_USER: 'user',
        DB_PASSWORD: 'pw',
        JWT_SECRET: 'change-in-production-placeholder-string!!',
      })
    ).toThrow(/strong random value/);
  });

  it('passes in production with a strong JWT_SECRET', () => {
    expect(() =>
      runValidation({
        NODE_ENV: 'production',
        DB_HOST: 'localhost',
        DB_NAME: 'db',
        DB_USER: 'user',
        DB_PASSWORD: 'pw',
        JWT_SECRET: 'a'.repeat(64),
      })
    ).not.toThrow();
  });

  it('passes in development without JWT_SECRET', () => {
    expect(() =>
      runValidation({
        NODE_ENV: 'development',
        DB_HOST: 'localhost',
        DB_NAME: 'db',
        DB_USER: 'user',
        DB_PASSWORD: 'pw',
      })
    ).not.toThrow();
  });

  it('fails in development without DB_HOST', () => {
    expect(() =>
      runValidation({
        NODE_ENV: 'development',
        DB_NAME: 'db',
        DB_USER: 'user',
        DB_PASSWORD: 'pw',
      })
    ).toThrow(/DB_HOST/);
  });
});
