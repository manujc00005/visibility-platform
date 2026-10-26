import { describe, expect, it } from "vitest";
import { InvalidEnvironmentError, parseEnv } from "@/config/env";

describe("parseEnv", () => {
  it("accepts a postgres URL and applies defaults", () => {
    const env = parseEnv({ DATABASE_URL: "postgresql://u:p@localhost:5432/db" });
    expect(env.DATABASE_URL).toBe("postgresql://u:p@localhost:5432/db");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.NODE_ENV).toBe("development");
  });

  it("accepts a Neon-style URL with sslmode", () => {
    const url = "postgresql://u:p@ep-x-123.eu-central-1.aws.neon.tech/neondb?sslmode=require";
    expect(parseEnv({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });

  it("rejects a missing DATABASE_URL with an actionable message", () => {
    expect(() => parseEnv({})).toThrowError(InvalidEnvironmentError);
    expect(() => parseEnv({})).toThrowError(/DATABASE_URL/);
  });

  it("rejects a non-postgres URL", () => {
    expect(() => parseEnv({ DATABASE_URL: "mysql://u:p@localhost/db" })).toThrowError(/postgres/);
  });

  it("rejects an unknown log level", () => {
    expect(() =>
      parseEnv({ DATABASE_URL: "postgres://u:p@localhost/db", LOG_LEVEL: "verbose" }),
    ).toThrowError(/LOG_LEVEL/);
  });
});

describe("migrationDatabaseUrl", () => {
  it("prefers the direct (unpooled) URL for migrations", async () => {
    const { migrationDatabaseUrl } = await import("@/config/env");
    const env = parseEnv({
      DATABASE_URL: "postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require",
      DATABASE_URL_UNPOOLED: "postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require",
    });
    expect(migrationDatabaseUrl(env)).not.toContain("-pooler");
  });

  it("falls back to DATABASE_URL when no direct URL is set (local Postgres)", async () => {
    const { migrationDatabaseUrl } = await import("@/config/env");
    const env = parseEnv({ DATABASE_URL: "postgresql://u:p@127.0.0.1:5433/db" });
    expect(migrationDatabaseUrl(env)).toBe("postgresql://u:p@127.0.0.1:5433/db");
  });
});

describe("PAGESPEED_API_KEY", () => {
  it("is optional and an empty value means not configured", () => {
    const base = { DATABASE_URL: "postgresql://u:p@h/db" };
    expect(parseEnv(base).PAGESPEED_API_KEY).toBeUndefined();
    expect(parseEnv({ ...base, PAGESPEED_API_KEY: "" }).PAGESPEED_API_KEY).toBeUndefined();
    expect(parseEnv({ ...base, PAGESPEED_API_KEY: "  " }).PAGESPEED_API_KEY).toBeUndefined();
    expect(parseEnv({ ...base, PAGESPEED_API_KEY: "AIza-x" }).PAGESPEED_API_KEY).toBe("AIza-x");
  });
});

describe("GEO provider variables", () => {
  const base = { DATABASE_URL: "postgresql://u:p@h/db" };
  it("treats empty credentials as absent and redistribution as false unless explicitly true", () => {
    const env = parseEnv({ ...base, DATAFORSEO_LOGIN: " ", DATAFORSEO_PASSWORD: "", DATAFORSEO_REDISTRIBUTION_CONFIRMED: "yes" });
    expect(env.DATAFORSEO_LOGIN).toBeUndefined();
    expect(env.DATAFORSEO_PASSWORD).toBeUndefined();
    expect(env.DATAFORSEO_REDISTRIBUTION_CONFIRMED).toBe(false);
    expect(parseEnv({ ...base, DATAFORSEO_REDISTRIBUTION_CONFIRMED: "TRUE" }).DATAFORSEO_REDISTRIBUTION_CONFIRMED).toBe(true);
  });
});
