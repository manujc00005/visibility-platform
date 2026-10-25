import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createPool } from "@/db/client";
import { assertTestDatabaseMarker, assertTestDatabaseUrl } from "@/db/test-guard";

/**
 * Runs once before integration tests. Fails (never skips) when the test database is
 * missing, unreachable or not marked as a test database. Then applies pending migrations.
 */
export default async function setup() {
  try {
    config({ path: [".env.test.local"], quiet: true });
    const url = assertTestDatabaseUrl(process.env.TEST_DATABASE_URL);
    const pool = createPool(url);
    try {
      await assertTestDatabaseMarker(pool);
      await migrate(drizzle(pool), { migrationsFolder: "src/db/migrations" });
    } finally {
      await pool.end();
    }
  } catch (error) {
    // Vitest 5 can crash while source-mapping errors thrown from globalSetup and hide the
    // message, so print the reason explicitly before failing the run.
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n[integration] ${message}\n`);
    throw new Error(message);
  }
}
