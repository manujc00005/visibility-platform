/**
 * Drizzle schema entry point. Each module owns its tables and re-exports them here so
 * drizzle-kit and the typed client see the whole schema.
 */
export * from "@/modules/workspaces/schema";
export * from "@/modules/audits/schema";
export * from "@/modules/reports/schema";
export * from "@/modules/geo/schema";
export * from "@/modules/geo/competitors/schema";
export * from "@/modules/search-console/schema";
