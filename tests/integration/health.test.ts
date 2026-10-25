import { afterAll, describe, expect, it } from "vitest";
import { checkHealth } from "@/modules/system/health";
import { createTestDb } from "./db";

describe("checkHealth against the test database", () => {
  const { pool } = createTestDb();
  afterAll(() => pool.end());

  it("reports ok with the applied migrations", async () => {
    const report = await checkHealth(pool, () => new Date("2026-10-25T00:00:00Z"));
    expect(report.status).toBe("ok");
    expect(report.checkedAt).toBe("2026-10-25T00:00:00.000Z");
    expect(report.database.reachable).toBe(true);
    expect(report.database.appliedMigrations).toBeGreaterThanOrEqual(1);
    expect(report.database.error).toBeNull();
  });
});
