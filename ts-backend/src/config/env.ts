import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DB_HOST: z.string().min(1),
  DB_PORT: z.string().default("5432"),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_SSL: z.string().optional(),
  FRONTEND_URL: z.string().optional()
});

//If any required environment variable is missing or invalid, the module will throw a Zod validation error at import time, preventing the application from starting with invalid configuration.
export const env = envSchema.parse(process.env);