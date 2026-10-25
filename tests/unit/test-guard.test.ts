import { describe, expect, it } from "vitest";
import { UnsafeTestDatabaseError, assertTestDatabaseUrl } from "@/db/test-guard";

describe("assertTestDatabaseUrl", () => {
  it("fails, not skips, when TEST_DATABASE_URL is missing", () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrowError(UnsafeTestDatabaseError);
    expect(() => assertTestDatabaseUrl("")).toThrowError(/TEST_DATABASE_URL is not set/);
  });

  it("rejects the Neon default database used by dev and production", () => {
    expect(() =>
      assertTestDatabaseUrl("postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require"),
    ).toThrowError(/does not end in "_test"/);
  });

  it("rejects names that only contain test", () => {
    expect(() => assertTestDatabaseUrl("postgresql://u:p@h/test_visibility")).toThrowError(UnsafeTestDatabaseError);
    expect(() => assertTestDatabaseUrl("postgresql://u:p@h/visibility_testing")).toThrowError(UnsafeTestDatabaseError);
  });

  it("rejects non-postgres URLs", () => {
    expect(() => assertTestDatabaseUrl("mysql://u:p@h/x_test")).toThrowError(/postgres/);
    expect(() => assertTestDatabaseUrl("not a url")).toThrowError(/valid URL/);
  });

  it("accepts a *_test database", () => {
    const url = "postgresql://u:p@ep-y.eu-central-1.aws.neon.tech/visibility_test?sslmode=require";
    expect(assertTestDatabaseUrl(url)).toBe(url);
  });
});
