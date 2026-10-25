import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/config/env";
import * as schema from "@/db/schema";

export type Database = NodePgDatabase<typeof schema>;

/**
 * One pool per process. In development Next.js reloads modules on every change,
 * so the pool is kept on globalThis to avoid exhausting Neon's connection limit.
 */
const globalForDb = globalThis as unknown as { __visibilityPool?: Pool };

/**
 * pg 8 treats `sslmode=require` as `verify-full` and warns that pg 9 will downgrade it
 * to libpq semantics (encrypted, server not verified). Neon URLs ship `sslmode=require`;
 * pinning `verify-full` keeps today's certificate verification across the upgrade.
 */
export function withVerifiedSsl(connectionString: string): string {
  return connectionString.replace(/([?&]sslmode=)(require|prefer|verify-ca)(?=&|$)/, "$1verify-full");
}

export function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString: withVerifiedSsl(connectionString),
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
}

export function getPool(): Pool {
  globalForDb.__visibilityPool ??= createPool(env().DATABASE_URL);
  return globalForDb.__visibilityPool;
}

export function getDb(): Database {
  return drizzle(getPool(), { schema });
}
