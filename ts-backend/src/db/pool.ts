import { Pool } from "pg";
import { env } from "@/config/env.js";

export const pool = new Pool({
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  ssl: env.DB_SSL
    ? { rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED }
    : undefined,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
  keepAlive: true, // Enable TCP keep-alive
  keepAliveInitialDelayMillis: 10000, // Start keep-alive after 10 seconds
});
