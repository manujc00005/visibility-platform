import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { bingWebmasterSnapshots, workspaces } from "@/db/schema";
import type { CollectOutcome } from "@/modules/bing-webmaster/collect";
import { latestBingWebmaster, refreshBingWebmaster, type BingWebmasterDeps } from "@/modules/bing-webmaster/service";
import { createWorkspace } from "@/modules/workspaces/service";
import { createTestDb } from "./db";

const { pool, db } = createTestDb();
afterAll(() => pool.end());
beforeEach(async () => {
  await db.delete(bingWebmasterSnapshots);
  await db.delete(workspaces);
});

const KEY = "EEDECC1EA4AE341CC57365E075EBC8B6";

async function workspace() {
  const result = await createWorkspace(db, { name: "Olessium", website: "https://olessium.com/", sector: "Agencia", country: "ES", city: "", services: "CRM" });
  if (!result.ok) throw new Error("workspace setup failed");
  return result.workspace;
}

const OK: CollectOutcome = {
  ok: true,
  data: {
    siteUrl: "https://olessium.com/",
    current: { start: "2026-09-29", end: "2026-10-26" },
    previous: { start: "2026-09-01", end: "2026-09-28" },
    totals: { clicks: 12, impressions: 400, ctr: 0.03 },
    previousTotals: { clicks: 8, impressions: 390, ctr: 0.0205 },
    queries: [{ query: "ropa trail", clicks: 5, impressions: 50, ctr: 0.1, position: 4.2 }],
    pages: [{ page: "https://olessium.com/es", clicks: 10, impressions: 300, ctr: 0.033, position: null }],
    rows: { start: "2026-05-01", end: "2026-10-25" },
  },
};
const EMPTY: CollectOutcome = {
  ok: true,
  data: { siteUrl: "https://olessium.com/", current: null, previous: null, totals: null, previousTotals: null, queries: [], pages: [], rows: null },
};
const FAIL: CollectOutcome = { ok: false, kind: "no_access", message: "Sin acceso", siteUrl: null, verifiedSites: 2 };

const deps = (outcome: CollectOutcome | null): BingWebmasterDeps & { sites: { domain: string; hostname: string }[] } => {
  const sites: { domain: string; hostname: string }[] = [];
  return {
    sites,
    collect(site) {
      sites.push(site);
      return outcome ? Promise.resolve(outcome) : null;
    },
  };
};

describe("refreshBingWebmaster", () => {
  it("stores a completed capture with periods, totals, rows and their window", async () => {
    const ws = await workspace();
    const d = deps(OK);
    expect((await refreshBingWebmaster(db, ws.id, d)).ok).toBe(true);
    expect(d.sites).toEqual([{ domain: "olessium.com", hostname: "olessium.com" }]);
    const { latest, latestCompleted } = await latestBingWebmaster(db, ws.id);
    expect(latest?.id).toBe(latestCompleted?.id);
    expect(latestCompleted).toMatchObject({
      status: "completed",
      provider: "bing_wmt",
      captureCondition: "owner_api",
      siteUrl: "https://olessium.com/",
      currentStart: "2026-09-29",
      previousEnd: "2026-09-28",
      totals: { clicks: 12, impressions: 400 },
      queries: [{ query: "ropa trail" }],
      pages: [{ page: "https://olessium.com/es", position: null }],
      rowsStart: "2026-05-01",
      rowsEnd: "2026-10-25",
    });
  });

  it("stores a capture without data while Bing is still processing", async () => {
    const ws = await workspace();
    await refreshBingWebmaster(db, ws.id, deps(EMPTY));
    const { latestCompleted } = await latestBingWebmaster(db, ws.id);
    expect(latestCompleted).toMatchObject({ status: "completed", siteUrl: "https://olessium.com/", totals: null, currentStart: null, rowsStart: null, queries: [], pages: [] });
  });

  it("stores a failure and keeps the previous good capture as latestCompleted", async () => {
    const ws = await workspace();
    await refreshBingWebmaster(db, ws.id, deps(OK));
    await refreshBingWebmaster(db, ws.id, deps(FAIL));
    const { latest, latestCompleted } = await latestBingWebmaster(db, ws.id);
    expect(latest).toMatchObject({ status: "failed", errorKind: "no_access", errorMessage: "Sin acceso", verifiedSites: 2, totals: null });
    expect(latestCompleted?.status).toBe("completed");
  });

  it("stores an invalid-key failure without the key anywhere in the row", async () => {
    const ws = await workspace();
    const fetchImpl = (async () => new Response(JSON.stringify({ ErrorCode: 3, Message: `InvalidApiKey ${KEY}` }), { status: 400 })) as unknown as typeof fetch;
    const { createBingWebmasterDeps } = await import("@/modules/bing-webmaster/deps");
    await refreshBingWebmaster(db, ws.id, createBingWebmasterDeps(() => KEY, { fetchImpl }));
    const rows = await db.select().from(bingWebmasterSnapshots);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "failed", errorKind: "invalid_credentials" });
    expect(JSON.stringify(rows)).not.toContain(KEY);
  });

  it("stores nothing when not configured or the company does not exist", async () => {
    const ws = await workspace();
    expect(await refreshBingWebmaster(db, ws.id, deps(null))).toEqual({ ok: false, error: "not_configured" });
    expect(await refreshBingWebmaster(db, "00000000-0000-4000-8000-000000000000", deps(OK))).toEqual({ ok: false, error: "not_found" });
    expect(await refreshBingWebmaster(db, "not-a-uuid", deps(OK))).toEqual({ ok: false, error: "not_found" });
    expect(await db.select().from(bingWebmasterSnapshots)).toHaveLength(0);
  });

  it("returns not_found when the company is deleted while Bing answers", async () => {
    const ws = await workspace();
    const slow: BingWebmasterDeps = {
      collect: () =>
        (async () => {
          await db.delete(workspaces).where(eq(workspaces.id, ws.id));
          return OK;
        })(),
    };
    expect(await refreshBingWebmaster(db, ws.id, slow)).toEqual({ ok: false, error: "not_found" });
  });

  it("rejects incomplete rows at the database", async () => {
    const ws = await workspace();
    await expect(db.insert(bingWebmasterSnapshots).values({ workspaceId: ws.id, status: "completed" })).rejects.toThrow();
    await expect(db.insert(bingWebmasterSnapshots).values({ workspaceId: ws.id, status: "failed" })).rejects.toThrow();
    await expect(
      db.insert(bingWebmasterSnapshots).values({ workspaceId: ws.id, status: "completed", siteUrl: "https://olessium.com/", currentStart: "2026-10-01" }),
    ).rejects.toThrow();
    await expect(
      db.insert(bingWebmasterSnapshots).values({ workspaceId: ws.id, status: "completed", siteUrl: "https://olessium.com/", rowsStart: "2026-10-01" }),
    ).rejects.toThrow();
  });

  it("deletes captures with the company", async () => {
    const ws = await workspace();
    await refreshBingWebmaster(db, ws.id, deps(OK));
    await db.delete(workspaces).where(eq(workspaces.id, ws.id));
    expect(await db.select().from(bingWebmasterSnapshots)).toHaveLength(0);
  });

  it("scopes reads by company", async () => {
    const ws = await workspace();
    await refreshBingWebmaster(db, ws.id, deps(OK));
    expect(await latestBingWebmaster(db, "00000000-0000-4000-8000-000000000000")).toEqual({ latest: null, latestCompleted: null });
  });
});
