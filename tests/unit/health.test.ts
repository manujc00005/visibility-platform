import { afterAll, describe, expect, it } from "vitest";
import { createPool } from "@/db/client";
import { checkHealth } from "@/modules/system/health";

describe("checkHealth with an unreachable database", () => {
  // Port 1 on loopback: nothing listens there, so the connection is refused immediately.
  const pool = createPool("postgresql://nobody:nothing@127.0.0.1:1/none");
  afterAll(() => pool.end());

  it("reports degraded with the underlying cause, without throwing", async () => {
    const report = await checkHealth(pool);
    expect(report.status).toBe("degraded");
    expect(report.database.reachable).toBe(false);
    expect(report.database.error).toMatch(/ECONNREFUSED/);
  });
});
