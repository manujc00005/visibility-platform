import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

export type HealthStatus = "ok" | "degraded";

export interface HealthReport {
  status: HealthStatus;
  checkedAt: string;
  database: {
    reachable: boolean;
    latencyMs: number | null;
    appliedMigrations: number | null;
    error: string | null;
  };
}

/** Drizzle wraps driver errors ("Failed query: …"); the useful reason is in `cause`. */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? error.cause : undefined;
  const code = cause && "code" in cause ? ` [${String(cause.code)}]` : "";
  return cause ? `${cause.message || cause.name}${code}` : error.message;
}

/**
 * Internal health check. The detailed report is for the operator UI and logs;
 * the public HTTP endpoint exposes only `status` (Codex M13: minimal public health).
 */
export async function checkHealth(pool: Pool, now: () => Date = () => new Date()): Promise<HealthReport> {
  const db = drizzle(pool);
  const started = performance.now();
  try {
    await db.execute(sql`select 1`);
    const latencyMs = Math.round(performance.now() - started);
    const migrations = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from drizzle.__drizzle_migrations`,
    );
    return {
      status: "ok",
      checkedAt: now().toISOString(),
      database: {
        reachable: true,
        latencyMs,
        appliedMigrations: Number(migrations.rows[0]?.count ?? 0),
        error: null,
      },
    };
  } catch (error) {
    const message = describeError(error);
    const missingMigrationsTable = /__drizzle_migrations/.test(message);
    return {
      status: "degraded",
      checkedAt: now().toISOString(),
      database: {
        reachable: missingMigrationsTable,
        latencyMs: missingMigrationsTable ? Math.round(performance.now() - started) : null,
        appliedMigrations: missingMigrationsTable ? 0 : null,
        error: missingMigrationsTable ? "No migrations applied yet (run npm run db:migrate)" : message,
      },
    };
  }
}
