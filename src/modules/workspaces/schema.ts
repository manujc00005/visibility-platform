import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * A business website the operator manages. Phase 1: single private operator, no
 * organizations or tenancy yet (those arrive with authentication in Phase 5).
 */
export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** Commercial key: lowercase ASCII hostname without leading "www.". Unique in this pilot. */
    domain: text("domain").notNull().unique("workspaces_domain_key"),
    /** Lowercase ASCII hostname as entered (may keep "www."). */
    hostname: text("hostname").notNull(),
    /** Website exactly as the operator typed it (trimmed). Never fetched in Phase 1. */
    originalUrl: text("original_url").notNull(),
    sector: text("sector").notNull(),
    /** ISO 3166-1 alpha-2. */
    country: text("country").notNull(),
    city: text("city"),
    services: text("services").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Defence in depth: the application normalizes, the database refuses anything else.
    check("workspaces_domain_normalized", sql`${table.domain} = lower(${table.domain}) and ${table.domain} !~ '^www\\.[^.]+\\.'`),
    check("workspaces_hostname_lowercase", sql`${table.hostname} = lower(${table.hostname})`),
    check("workspaces_name_not_blank", sql`length(btrim(${table.name})) between 1 and 120`),
    check("workspaces_sector_not_blank", sql`length(btrim(${table.sector})) between 1 and 80`),
    check("workspaces_country_iso2", sql`${table.country} ~ '^[A-Z]{2}$'`),
    check("workspaces_services_count", sql`cardinality(${table.services}) between 1 and 10`),
  ],
);

export type Workspace = typeof workspaces.$inferSelect;
