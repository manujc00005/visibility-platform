import { afterAll, describe, expect, it } from "vitest";
import { assertTestDatabaseMarker } from "@/db/test-guard";
import { createTestDb } from "./db";

describe("integration database guard", () => {
  const { pool } = createTestDb();
  afterAll(() => pool.end());

  it("is connected to a marked *_test database", async () => {
    await expect(assertTestDatabaseMarker(pool)).resolves.toBeUndefined();
    const { rows } = await pool.query<{ db: string }>("select current_database() as db");
    expect(rows[0]!.db).toMatch(/_test$/);
  });
});
