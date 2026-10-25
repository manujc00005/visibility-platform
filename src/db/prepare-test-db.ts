/**
 * Prepares the integration-test database: marks it as a test database and applies migrations.
 * Usage: npm run db:test:prepare   (reads TEST_DATABASE_URL from .env.test.local)
 *
 * Refuses any database whose name does not end in "_test", so it cannot mark or migrate
 * the dev or production databases by mistake.
 */
import { config } from "dotenv";
config({ path: [".env.test.local"], quiet: true });

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createPool } from "@/db/client";
import {
  TEST_DATABASE_MARKER,
  UnsafeTestDatabaseError,
  assertTestDatabaseMarker,
  assertTestDatabaseUrl,
  testDatabaseName,
} from "@/db/test-guard";
import { logger } from "@/lib/logger";

async function main() {
  const url = assertTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const name = testDatabaseName(url);
  const pool = createPool(url);
  try {
    const { rows } = await pool.query<{ db: string }>("select current_database() as db");
    if (rows[0]?.db !== name || !name.endsWith("_test")) {
      throw new UnsafeTestDatabaseError(`server reports "${rows[0]?.db}", expected "${name}"`);
    }
    // Identifier comes from the server and was checked against /_test$/ above.
    const ident = `"${name.replace(/"/g, '""')}"`;
    await pool.query(`comment on database ${ident} is '${TEST_DATABASE_MARKER}'`);
    await assertTestDatabaseMarker(pool);
    await migrate(drizzle(pool), { migrationsFolder: "src/db/migrations" });
    logger.info({ database: name, host: new URL(url).host }, "test database prepared");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  logger.error({ err: error }, "test database preparation failed");
  process.exit(1);
});
