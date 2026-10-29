import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { analyticsSnapshots, workspaces } from "@/db/schema";
import type { CollectOutcome } from "@/modules/analytics/collect";
import { createAnalyticsDeps } from "@/modules/analytics/deps";
import { latestAnalytics, refreshAnalytics, type AnalyticsDeps } from "@/modules/analytics/service";
import { TOKEN_ENDPOINT } from "@/modules/search-console/google";
import { createWorkspace } from "@/modules/workspaces/service";
import { PRIVATE_PEM, serviceAccountJson } from "../unit/search-console/fixtures";
import { createTestDb } from "./db";

const TOKEN = "ya29.integration-secret-token";

const { pool, db } = createTestDb();
afterAll(() => pool.end());
beforeEach(async () => {
  await db.delete(analyticsSnapshots);
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
    property: "properties/123",
    propertyName: "Olessium",
    current: { start: "2026-09-29", end: "2026-10-26" },
    previous: { start: "2026-09-01", end: "2026-09-28" },
    totals: { users: 80, sessions: 120, views: 300 },
    previousTotals: { users: 60, sessions: 100, views: 250 },
    channels: [{ channel: "Organic Search", sessions: 70, previousSessions: 50 }],
    pages: [{ page: "/", views: 200, users: 70 }],
    quality: { otherRow: false, thresholded: true, sampled: false },
  },
};
const ZERO = { users: 0, sessions: 0, views: 0 };
const EMPTY: CollectOutcome = { ok: true, data: { ...OK.data, totals: ZERO, previousTotals: ZERO, channels: [], pages: [], quality: { otherRow: false, thresholded: false, sampled: false } } };
const FAIL: CollectOutcome = { ok: false, kind: "no_access", message: "Sin acceso", property: null, accessibleProperties: 2, propertiesSkipped: false };

const deps = (outcome: CollectOutcome | null): AnalyticsDeps & { sites: { domain: string; hostname: string }[] } => {
  const sites: { domain: string; hostname: string }[] = [];
  return {
    sites,
    collect(site) {
      sites.push(site);
      return outcome ? Promise.resolve(outcome) : null;
    },
  };
};

describe("refreshAnalytics", () => {
  it("stores a completed capture with property, periods, totals, channels, pages and quality", async () => {
    const ws = await workspace();
    const d = deps(OK);
    expect((await refreshAnalytics(db, ws.id, d)).ok).toBe(true);
    expect(d.sites).toEqual([{ domain: "olessium.com", hostname: "olessium.com" }]);
    const { latest, latestCompleted } = await latestAnalytics(db, ws.id);
    expect(latest?.id).toBe(latestCompleted?.id);
    expect(latestCompleted).toMatchObject({
      status: "completed",
      provider: "ga4",
      captureCondition: "owner_api",
      property: "properties/123",
      propertyName: "Olessium",
      currentStart: "2026-09-29",
      previousEnd: "2026-09-28",
      totals: { users: 80, sessions: 120, views: 300 },
      channels: [{ channel: "Organic Search", sessions: 70, previousSessions: 50 }],
      pages: [{ page: "/", views: 200, users: 70 }],
      quality: { thresholded: true },
    });
  });

  it("stores a capture with zeros when GA4 has no visits", async () => {
    const ws = await workspace();
    await refreshAnalytics(db, ws.id, deps(EMPTY));
    const { latestCompleted } = await latestAnalytics(db, ws.id);
    expect(latestCompleted).toMatchObject({ status: "completed", totals: ZERO, channels: [], pages: [] });
  });

  it("stores a failure and keeps the previous good capture as latestCompleted", async () => {
    const ws = await workspace();
    await refreshAnalytics(db, ws.id, deps(OK));
    await refreshAnalytics(db, ws.id, deps(FAIL));
    const { latest, latestCompleted } = await latestAnalytics(db, ws.id);
    expect(latest).toMatchObject({ status: "failed", errorKind: "no_access", errorMessage: "Sin acceso", accessibleProperties: 2, propertiesSkipped: false, totals: null });
    expect(latestCompleted?.status).toBe("completed");
  });

  it("stores nothing when not configured or the company does not exist", async () => {
    const ws = await workspace();
    expect(await refreshAnalytics(db, ws.id, deps(null))).toEqual({ ok: false, error: "not_configured" });
    expect(await refreshAnalytics(db, "00000000-0000-4000-8000-000000000000", deps(OK))).toEqual({ ok: false, error: "not_found" });
    expect(await refreshAnalytics(db, "not-a-uuid", deps(OK))).toEqual({ ok: false, error: "not_found" });
    expect(await db.select().from(analyticsSnapshots)).toHaveLength(0);
  });

  it("deletes captures with their company", async () => {
    const ws = await workspace();
    await refreshAnalytics(db, ws.id, deps(OK));
    await db.delete(workspaces).where(eq(workspaces.id, ws.id));
    expect(await db.select().from(analyticsSnapshots)).toHaveLength(0);
  });

  it("never stores the token or the private key, even when Google quotes them back (AC-006)", async () => {
    const ws = await workspace();
    const leaky = (status: number) => new Response(JSON.stringify({ error: { message: `${TOKEN} ${PRIVATE_PEM}` } }), { status });
    // Token refused, then token granted but the Admin API refusing: both end as stored failures.
    for (const tokenReply of [() => leaky(400), () => new Response(JSON.stringify({ access_token: TOKEN }))]) {
      const fetchImpl = (async (input: string | URL | Request) => (String(input) === TOKEN_ENDPOINT ? tokenReply() : leaky(403))) as unknown as typeof fetch;
      expect((await refreshAnalytics(db, ws.id, createAnalyticsDeps(() => serviceAccountJson(), { fetchImpl }))).ok).toBe(true);
    }
    const rows = await db.select().from(analyticsSnapshots);
    expect(rows.map((r) => r.errorKind).sort()).toEqual(["invalid_credentials", "no_access"]);
    const text = JSON.stringify(rows);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("PRIVATE KEY");
  });

  it("rejects a failure without reason and a completed capture without property", async () => {
    const ws = await workspace();
    await expect(db.execute(sql`insert into analytics_snapshots (workspace_id, status) values (${ws.id}, 'failed')`)).rejects.toThrow();
    await expect(
      db.execute(sql`insert into analytics_snapshots (workspace_id, status, current_start, current_end, previous_start, previous_end, totals, previous_totals, quality)
        values (${ws.id}, 'completed', '2026-09-29', '2026-10-26', '2026-09-01', '2026-09-28', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)`),
    ).rejects.toThrow();
    await expect(db.execute(sql`insert into analytics_snapshots (workspace_id, status, error_kind, error_message) values (${ws.id}, 'failed', 'api_disabled', 'x')`)).rejects.toThrow();
  });
});
