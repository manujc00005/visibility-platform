import type { Pool } from "pg";

/**
 * Two-layer protection so that tests which write can only ever run against a
 * dedicated test database, never against `production` or the shared `dev` data.
 *
 * 1. The connection string must name a database ending in `_test`.
 * 2. The server must confirm it: `current_database()` ends in `_test` and the
 *    database carries TEST_DATABASE_MARKER as its comment. Only
 *    `npm run db:test:prepare` writes that marker, and it refuses non-`_test`
 *    databases. The Neon `production` branch has no such database or marker.
 */
export const TEST_DATABASE_MARKER = "visibility-platform:test-database";

export class UnsafeTestDatabaseError extends Error {
  constructor(message: string) {
    super(`Refusing to run against this database: ${message}`);
    this.name = "UnsafeTestDatabaseError";
  }
}

export function testDatabaseName(connectionString: string): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new UnsafeTestDatabaseError("TEST_DATABASE_URL is not a valid URL");
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) {
    throw new UnsafeTestDatabaseError("TEST_DATABASE_URL must be a postgres:// URL");
  }
  return decodeURIComponent(url.pathname.replace(/^\//, ""));
}

/** Layer 1: reject by the database name in the URL, before connecting. */
export function assertTestDatabaseUrl(connectionString: string | undefined): string {
  if (!connectionString) {
    throw new UnsafeTestDatabaseError(
      "TEST_DATABASE_URL is not set. Integration tests are mandatory: create .env.test.local " +
        "(see .env.example) pointing to the Neon 'test' branch, then run npm run db:test:prepare.",
    );
  }
  const name = testDatabaseName(connectionString);
  if (!name.endsWith("_test")) {
    throw new UnsafeTestDatabaseError(`database "${name}" does not end in "_test"`);
  }
  return connectionString;
}

/** Layer 2: ask the server which database this is and whether it carries the marker. */
export async function assertTestDatabaseMarker(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ db: string; marker: string | null }>(
    `select current_database() as db,
            shobj_description(oid, 'pg_database') as marker
       from pg_database
      where datname = current_database()`,
  );
  const row = rows[0];
  if (!row || !row.db.endsWith("_test")) {
    throw new UnsafeTestDatabaseError(`server reports database "${row?.db}", which is not a test database`);
  }
  if (row.marker !== TEST_DATABASE_MARKER) {
    throw new UnsafeTestDatabaseError(
      `database "${row.db}" has no test marker. Run npm run db:test:prepare first.`,
    );
  }
}
