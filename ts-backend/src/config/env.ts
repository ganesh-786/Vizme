// src/config/env.ts
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().default(3000),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_SSL: z.coerce.boolean().default(false),
  DB_SSL_REJECT_UNAUTHORIZED: z.coerce.boolean().default(true),

  // JWT Configuration
  JWT_SECRET: z.string().min(32), // At least 32 chars for security
  JWT_ACCESS_EXPIRY: z.string().default('15m'), // 15 minutes
  JWT_REFRESH_EXPIRY: z.string().default('7d'), // 7 days

  FRONTEND_URL: z.string().optional(),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().default(300),
});

export const env = envSchema.parse(process.env);
