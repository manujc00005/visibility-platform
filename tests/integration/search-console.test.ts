import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { searchConsoleSnapshots, workspaces } from "@/db/schema";
import type { CollectOutcome } from "@/modules/search-console/collect";
import { latestSearchConsole, refreshSearchConsole, type SearchConsoleDeps } from "@/modules/search-console/service";
import { createWorkspace } from "@/modules/workspaces/service";
import { createTestDb } from "./db";

const { pool, db } = createTestDb();
afterAll(() => pool.end());
beforeEach(async () => {
  await db.delete(searchConsoleSnapshots);
  await db.delete(workspaces);
});

async function workspace() {
  const result = await createWorkspace(db, { name: "Olessium", website: "https://olessium.com/", sector: "Agencia", country: "ES", city: "", services: "CRM" });
  if (!result.ok) throw new Error("workspace setup failed");
  return result.workspace;
}

const OK: CollectOutcome = {
  ok: true,
  data: {
    property: "sc-domain:olessium.com",
    current: { start: "2026-09-27", end: "2026-10-24" },
    previous: { start: "2026-08-30", end: "2026-09-26" },
    totals: { clicks: 12, impressions: 400, ctr: 0.03, position: 9.4 },
    previousTotals: { clicks: 8, impressions: 390, ctr: 0.02, position: 12.1 },
    queries: [{ query: "crm agencias", clicks: 5, impressions: 50, ctr: 0.1, position: 4.2 }],
    pages: [{ page: "https://olessium.com/es", clicks: 10, impressions: 300, ctr: 0.033, position: 8.1 }],
  },
};
const FAIL: CollectOutcome = { ok: false, kind: "no_access", message: "Sin acceso", property: null, accessibleProperties: 0 };
const deps = (outcome: CollectOutcome | null): SearchConsoleDeps & { sites: { domain: string; hostname: string }[] } => {
  const sites: { domain: string; hostname: string }[] = [];
  return {
    sites,
    collect(site) {
      sites.push(site);
      return outcome ? Promise.resolve(outcome) : null;
    },
  };
};

describe("refreshSearchConsole", () => {
  it("stores a completed capture with periods, totals and rows", async () => {
    const ws = await workspace();
    const d = deps(OK);
    const result = await refreshSearchConsole(db, ws.id, d);
    expect(result.ok).toBe(true);
    expect(d.sites).toEqual([{ domain: "olessium.com", hostname: "olessium.com" }]);
    const { latest, latestCompleted } = await latestSearchConsole(db, ws.id);
    expect(latest?.id).toBe(latestCompleted?.id);
    expect(latestCompleted).toMatchObject({
      status: "completed",
      provider: "google_gsc",
      captureCondition: "owner_api",
      property: "sc-domain:olessium.com",
      currentStart: "2026-09-27",
      previousEnd: "2026-09-26",
      totals: { clicks: 12, impressions: 400 },
      queries: [{ query: "crm agencias" }],
    });
  });

  it("stores a failure and keeps the previous good capture as latestCompleted", async () => {
    const ws = await workspace();
    await refreshSearchConsole(db, ws.id, deps(OK));
    await refreshSearchConsole(db, ws.id, deps(FAIL));
    const { latest, latestCompleted } = await latestSearchConsole(db, ws.id);
    expect(latest).toMatchObject({ status: "failed", errorKind: "no_access", errorMessage: "Sin acceso", accessibleProperties: 0, totals: null });
    expect(latestCompleted?.status).toBe("completed");
  });

  it("stores nothing when not configured or the company does not exist", async () => {
    const ws = await workspace();
    expect(await refreshSearchConsole(db, ws.id, deps(null))).toEqual({ ok: false, error: "not_configured" });
    expect(await refreshSearchConsole(db, "00000000-0000-4000-8000-000000000000", deps(OK))).toEqual({ ok: false, error: "not_found" });
    expect(await refreshSearchConsole(db, "not-a-uuid", deps(OK))).toEqual({ ok: false, error: "not_found" });
    expect(await db.select().from(searchConsoleSnapshots)).toHaveLength(0);
  });

  it("returns not_found when the company is deleted while Google answers", async () => {
    const ws = await workspace();
    const slow: SearchConsoleDeps = {
      collect: () =>
        (async () => {
          await db.delete(workspaces).where(eq(workspaces.id, ws.id));
          return OK;
        })(),
    };
    expect(await refreshSearchConsole(db, ws.id, slow)).toEqual({ ok: false, error: "not_found" });
  });

  it("rejects incomplete rows at the database", async () => {
    const ws = await workspace();
    await expect(db.insert(searchConsoleSnapshots).values({ workspaceId: ws.id, status: "completed" })).rejects.toThrow();
    await expect(db.insert(searchConsoleSnapshots).values({ workspaceId: ws.id, status: "failed" })).rejects.toThrow();
  });

  it("deletes captures with the company", async () => {
    const ws = await workspace();
    await refreshSearchConsole(db, ws.id, deps(OK));
    await db.delete(workspaces).where(eq(workspaces.id, ws.id));
    expect(await db.select().from(searchConsoleSnapshots)).toHaveLength(0);
  });

  it("scopes reads by company", async () => {
    const ws = await workspace();
    await refreshSearchConsole(db, ws.id, deps(OK));
    expect(await latestSearchConsole(db, "00000000-0000-4000-8000-000000000000")).toEqual({ latest: null, latestCompleted: null });
  });
});
