import { drizzle } from "drizzle-orm/node-postgres";
import { createPool } from "@/db/client";
import * as schema from "@/db/schema";
import { assertTestDatabaseUrl } from "@/db/test-guard";

/** Pool and Drizzle handle bound to the guarded test database. */
export function createTestDb() {
  const pool = createPool(assertTestDatabaseUrl(process.env.TEST_DATABASE_URL));
  return { pool, db: drizzle(pool, { schema }) };
}
