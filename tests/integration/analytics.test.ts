import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { analyticsSnapshots, workspaces } from "@/db/schema";
import type { CollectOutcome } from "@/modules/analytics/collect";
import { createAnalyticsDeps } from "@/modules/analytics/deps";
import { latestAnalytics, refreshAnalytics, type AnalyticsDeps } from "@/modules/analytics/service";
import { ADMIN_BASE, DATA_BASE } from "@/modules/analytics/ga4";
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
    keyEvents: {
      version: 1,
      configured: ["generate_lead", "purchase"],
      configuredMore: false,
      total: 100,
      previousTotal: 40,
      organic: 25,
      previousOrganic: 10,
      organicByEvent: [{ event: "generate_lead", keyEvents: 18 }],
    },
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

/** The insert fails on exactly this check constraint, not on any other error. */
async function violates(insert: Promise<unknown>, constraint: string) {
  const error = await insert.then(
    () => null,
    (e: unknown) => e,
  );
  const cause = (error as { cause?: unknown } | null)?.cause ?? error;
  expect(cause).toMatchObject({ code: "23514", constraint });
}

describe("analytics key events (feature 008)", () => {
  const keyEvents = OK.ok ? OK.data.keyEvents : null;
  const SHAPE = "analytics_snapshots_key_events_shape";
  const row = (workspaceId: string, value: unknown) =>
    db.execute(sql`insert into analytics_snapshots (workspace_id, status, property, current_start, current_end, previous_start, previous_end, totals, previous_totals, quality, key_events)
      values (${workspaceId}, 'completed', 'properties/123', '2026-09-29', '2026-10-26', '2026-09-01', '2026-09-28', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, ${value === undefined ? null : JSON.stringify(value)}::jsonb)`);

  it("stores the key events of a completed capture and reads them back unchanged (AC-001)", async () => {
    const ws = await workspace();
    await refreshAnalytics(db, ws.id, deps(OK));
    expect((await latestAnalytics(db, ws.id)).latestCompleted?.keyEvents).toEqual(keyEvents);
  });

  it("reads a capture stored before the column existed as key_events null (AC-009)", async () => {
    const ws = await workspace();
    await row(ws.id, undefined);
    expect((await latestAnalytics(db, ws.id)).latestCompleted?.keyEvents).toBeNull();
  });

  it("refuses key events in a failed row (AC-009)", async () => {
    const ws = await workspace();
    await violates(
      db.execute(sql`insert into analytics_snapshots (workspace_id, status, error_kind, error_message, key_events) values (${ws.id}, 'failed', 'error', 'x', ${JSON.stringify(keyEvents)}::jsonb)`),
      "analytics_snapshots_failed_without_key_events",
    );
  });

  const without = (key: string) => Object.fromEntries(Object.entries(keyEvents!).filter(([k]) => k !== key));
  it.each([
    ["an array instead of an object", []],
    ["JSON null", null],
    ["version 2", { ...keyEvents, version: 2 }],
    ["the version inside an array", { ...keyEvents, version: [1] }],
    ["no organic count", without("organic")],
    ["a count as text", { ...keyEvents, total: "100" }],
    ["configuredMore as text", { ...keyEvents, configuredMore: "no" }],
    ["a configured name that is a number", { ...keyEvents, configured: ["purchase", 7] }],
    ["a configured name nested in an array", { ...keyEvents, configured: [["purchase"]] }],
    ["a breakdown item without event", { ...keyEvents, organicByEvent: [{ event: "a", keyEvents: 1 }, { keyEvents: 2 }] }],
    ["a breakdown item without keyEvents", { ...keyEvents, organicByEvent: [{ event: "a" }] }],
    ["a breakdown item that is text", { ...keyEvents, organicByEvent: ["a"] }],
    ["a breakdown that is not an array", { ...keyEvents, organicByEvent: { event: "a", keyEvents: 1 } }],
  ])("rejects key events with %s (AC-009)", async (_label, bad) => {
    const ws = await workspace();
    await violates(row(ws.id, bad), SHAPE);
  });

  it.each([
    ["empty lists and zeros", { ...keyEvents, configured: [], total: 0, previousTotal: 0, organic: 0, previousOrganic: 0, organicByEvent: [] }],
    ["the stored example", keyEvents],
    ["a (not set) event and more configured", { ...keyEvents, configuredMore: true, organicByEvent: [{ event: "(not set)", keyEvents: 4 }] }],
  ])("accepts key events with %s (AC-009)", async (_label, good) => {
    const ws = await workspace();
    await row(ws.id, good);
    expect((await latestAnalytics(db, ws.id)).latestCompleted?.keyEvents).toEqual(good);
  });

  /** GA4 double for the whole capture; `fail` answers the matching new call with an error. */
  function google(fail?: { match: (url: string, body: string) => boolean; status: number; body?: unknown }) {
    const calls: { url: string; body: string }[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = String(init?.body ?? "");
      calls.push({ url, body });
      if (url === TOKEN_ENDPOINT) return Response.json({ access_token: TOKEN });
      if (fail?.match(url, body)) return Response.json(fail.body ?? { error: { message: `${TOKEN} ${PRIVATE_PEM}` } }, { status: fail.status });
      if (url.startsWith(`${ADMIN_BASE}/accountSummaries`)) return Response.json({ accountSummaries: [{ propertySummaries: [{ property: "properties/123", displayName: "Olessium" }] }] });
      if (url.includes("/dataStreams")) return Response.json({ dataStreams: [{ type: "WEB_DATA_STREAM", webStreamData: { defaultUri: "https://olessium.com" } }] });
      if (url.includes("/keyEvents")) return Response.json({ keyEvents: [{ eventName: "generate_lead" }] });
      return Response.json({});
    }) as unknown as typeof fetch;
    return { calls, deps: createAnalyticsDeps(() => serviceAccountJson(), { fetchImpl }) };
  }
  const secretsIn = (calls: { body: string }[]) => [TOKEN, new URLSearchParams(calls[0]!.body).get("assertion")!, PRIVATE_PEM.split("\n")[1]!];

  it.each([
    ["the key event list", (url: string) => url.includes("/keyEvents"), 403, { error: { details: [{ reason: "SERVICE_DISABLED" }] } }, "admin_api_disabled"],
    ["the report by channel", (url: string, body: string) => url.startsWith(DATA_BASE) && body.includes("keyEvents") && !body.includes("eventName"), 429, undefined, "quota_exceeded"],
    ["the organic breakdown", (url: string, body: string) => url.startsWith(DATA_BASE) && body.includes("eventName"), 500, undefined, "error"],
  ])("stores one failed row without key events or secrets when %s fails (AC-005)", async (_label, match, status, body, kind) => {
    const ws = await workspace();
    const { calls, deps: failing } = google({ match, status, body });
    expect((await refreshAnalytics(db, ws.id, failing)).ok).toBe(true);
    const rows = await db.select().from(analyticsSnapshots).where(eq(analyticsSnapshots.workspaceId, ws.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "failed", errorKind: kind, keyEvents: null });
    const stored = JSON.stringify(rows[0]);
    for (const secret of secretsIn(calls)) expect(stored).not.toContain(secret);
  });

  it("stores a real completed capture with key events and no secret (AC-001, AC-010)", async () => {
    const ws = await workspace();
    const { calls, deps: working } = google();
    await refreshAnalytics(db, ws.id, working);
    const { latestCompleted } = await latestAnalytics(db, ws.id);
    expect(latestCompleted?.keyEvents).toMatchObject({ version: 1, configured: ["generate_lead"], total: 0, organic: 0, organicByEvent: [] });
    const stored = JSON.stringify(latestCompleted);
    for (const secret of secretsIn(calls)) expect(stored).not.toContain(secret);
  });
});
