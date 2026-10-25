/**
 * Applies pending migrations from src/db/migrations.
 * Usage: npm run db:migrate  (reads .env.local, then .env)
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { migrationDatabaseUrl, parseEnv } from "@/config/env";
import { createPool } from "@/db/client";
import { logger } from "@/lib/logger";

async function main() {
  const url = migrationDatabaseUrl(parseEnv(process.env));
  const pool = createPool(url);
  const host = new URL(url).host;
  try {
    logger.info({ host }, "applying migrations");
    await migrate(drizzle(pool), { migrationsFolder: "src/db/migrations" });
    logger.info({ host }, "migrations applied");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  logger.error({ err: error }, "migration failed");
  process.exit(1);
});
