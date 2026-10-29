import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { searchConsoleSnapshots, workspaces } from "@/db/schema";
import { brandTerms } from "@/modules/search-console/brand-terms";
import { collectSearchConsole, type CaptureSite, type CollectOutcome } from "@/modules/search-console/collect";
import { parseServiceAccount } from "@/modules/search-console/credentials";
import { latestSearchConsole, refreshSearchConsole, type SearchConsoleDeps } from "@/modules/search-console/service";
import { createWorkspace } from "@/modules/workspaces/service";
import { PRIVATE_PEM, serviceAccountJson } from "../unit/search-console/fixtures";
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
    segments: {
      version: 1,
      terms: ["Olessium", "olessium.com"],
      termsTruncated: false,
      branded: { clicks: 4, impressions: 60, ctr: 0.067, position: 2.1 },
      nonBranded: { clicks: 6, impressions: 300, ctr: 0.02, position: 11.3 },
      previousBranded: { clicks: 3, impressions: 50, ctr: 0.06, position: 2.4 },
      previousNonBranded: { clicks: 4, impressions: 290, ctr: 0.014, position: 13 },
    },
  },
};
const FAIL: CollectOutcome = { ok: false, kind: "no_access", message: "Sin acceso", property: null, accessibleProperties: 0 };
const deps = (outcome: CollectOutcome | null): SearchConsoleDeps & { sites: CaptureSite[] } => {
  const sites: CaptureSite[] = [];
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
    expect(d.sites).toEqual([{ domain: "olessium.com", hostname: "olessium.com", name: "Olessium", brandAliases: [] }]);
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

/** The insert fails on exactly this check constraint, not on any other error. */
async function violates(insert: Promise<unknown>, constraint: string) {
  const error = await insert.then(
    () => null,
    (e: unknown) => e,
  );
  const cause = (error as { cause?: unknown } | null)?.cause ?? error;
  expect(cause).toMatchObject({ code: "23514", constraint });
}

describe("search console brand segments (feature 007)", () => {
  const segments = OK.ok ? OK.data.segments : null;
  const zero = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  /** A completed row written the way captures before feature 007 were, plus optional segments. */
  const row = (workspaceId: string, extra: Record<string, unknown> = {}) => ({
    workspaceId,
    status: "completed" as const,
    property: "sc-domain:olessium.com",
    currentStart: "2026-09-27",
    currentEnd: "2026-10-24",
    previousStart: "2026-08-30",
    previousEnd: "2026-09-26",
    totals: { clicks: 1, impressions: 2, ctr: 0.5, position: 3 },
    previousTotals: { clicks: 1, impressions: 2, ctr: 0.5, position: 3 },
    ...extra,
  });

  it("stores the segments of a completed capture and reads them back unchanged (AC-001)", async () => {
    const ws = await workspace();
    await refreshSearchConsole(db, ws.id, deps(OK));
    const { latestCompleted } = await latestSearchConsole(db, ws.id);
    expect(latestCompleted?.segments).toEqual(segments);
  });

  it("reads a capture stored before the column existed as segments null (AC-008)", async () => {
    const ws = await workspace();
    await db.insert(searchConsoleSnapshots).values(row(ws.id));
    const { latestCompleted } = await latestSearchConsole(db, ws.id);
    expect(latestCompleted?.status).toBe("completed");
    expect(latestCompleted?.segments).toBeNull();
  });

  it("keeps failed rows without segments (AC-007, AC-008)", async () => {
    const ws = await workspace();
    await refreshSearchConsole(db, ws.id, deps(FAIL));
    const { latest } = await latestSearchConsole(db, ws.id);
    expect(latest).toMatchObject({ status: "failed", segments: null });
    await violates(
      db.insert(searchConsoleSnapshots).values({ workspaceId: ws.id, status: "failed", errorKind: "error", errorMessage: "x", segments }),
      "search_console_snapshots_failed_without_segments",
    );
  });

  it.each([
    ["an array instead of an object", []],
    ["version 2", { ...segments, version: 2 }],
    ["the version as text", { ...segments, version: "1" }],
    ["no previousNonBranded", Object.fromEntries(Object.entries(segments!).filter(([key]) => key !== "previousNonBranded"))],
    ["a term that is not text", { ...segments, terms: ["Olessium", 7] }],
    ["termsTruncated as text", { ...segments, termsTruncated: "no" }],
    ["a metric as text", { ...segments, branded: { ...segments!.branded, clicks: "4" } }],
    ["a totals object without position", { ...segments, nonBranded: { clicks: 1, impressions: 2, ctr: 0.5 } }],
    // Shapes that the lax JSON path mode let through (review of 007, DB-1).
    ["the version inside an array", { ...segments, version: [1] }],
    ["the version in a mixed array", { ...segments, version: [1, "x"] }],
    ["a totals object inside an array", { ...segments, branded: [segments!.branded] }],
    ["a good and a bad totals object in an array", { ...segments, branded: [segments!.branded, "x"] }],
    ["terms nested in an array", { ...segments, terms: [["Olessium"]] }],
    ["no terms at all", { ...segments, terms: [] }],
    ["JSON null", null],
  ])("rejects segments with %s (AC-008)", async (_label, bad) => {
    const ws = await workspace();
    const value = bad === null ? sql`'null'::jsonb` : bad;
    await violates(db.insert(searchConsoleSnapshots).values(row(ws.id, { segments: value })), "search_console_snapshots_segments_shape");
  });

  it.each([
    ["all zero, as the real Olessium capture", { ...segments, branded: zero, nonBranded: zero, previousBranded: zero, previousNonBranded: zero }],
    ["a truncated term list", { ...segments, termsTruncated: true }],
    ["a single term", { ...segments, terms: ["olessium.com"] }],
    ["decimals and an extra key", { ...segments, branded: { clicks: 1, impressions: 3, ctr: 0.333, position: 2.75 }, note: "x" }],
  ])("accepts segments with %s (AC-008)", async (_label, good) => {
    const ws = await workspace();
    await db.insert(searchConsoleSnapshots).values(row(ws.id, { segments: good }));
    expect((await latestSearchConsole(db, ws.id)).latestCompleted?.segments).toEqual(good);
  });

  const parsedAccount = parseServiceAccount(serviceAccountJson());
  if (!parsedAccount?.ok) throw new Error("fixture");
  const account = parsedAccount.value;
  const NOW = new Date("2026-10-27T10:00:00Z");
  const SECRET = "ya29.integration-secret-token";
  /** Google double: every brand query answers `brand(body)`; the rest answer an empty report. */
  function google(brand: (body: string) => Response) {
    const bodies: string[] = [];
    const fetchImpl = (async (input: string, init?: RequestInit) => {
      const url = String(input);
      const body = String(init?.body ?? "");
      bodies.push(body);
      if (url.includes("oauth2")) return Response.json({ access_token: SECRET });
      if (url.endsWith("/sites")) return Response.json({ siteEntry: [{ siteUrl: "sc-domain:olessium.com", permissionLevel: "siteOwner" }] });
      return body.includes("dimensionFilterGroups") ? brand(body) : Response.json({});
    }) as typeof fetch;
    return { bodies, deps: { collect: (site: CaptureSite) => collectSearchConsole(account, site, { fetchImpl, now: NOW }) } };
  }
  const secretsIn = (bodies: string[]) => [
    SECRET,
    new URLSearchParams(bodies[0]!).get("assertion")!,
    PRIVATE_PEM.split("\n")[1]!,
    brandTerms({ name: "Olessium", brandAliases: [], domain: "olessium.com" }).expression,
  ];

  it.each([
    [403, { error: { details: [{ reason: "SERVICE_DISABLED" }] } }, "api_disabled"],
    [403, { error: { message: "User does not have sufficient permission for site." } }, "no_access"],
    [429, {}, "quota_exceeded"],
    [500, {}, "error"],
  ])("stores one failed row and nothing secret when a brand query answers %i (AC-007)", async (status, body, kind) => {
    const ws = await workspace();
    const { bodies, deps } = google((request) => (request.includes("excludingRegex") ? Response.json(body, { status }) : Response.json({})));
    expect((await refreshSearchConsole(db, ws.id, deps)).ok).toBe(true);
    const rows = await db.select().from(searchConsoleSnapshots).where(eq(searchConsoleSnapshots.workspaceId, ws.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "failed", errorKind: kind, segments: null });
    const stored = JSON.stringify(rows[0]);
    for (const secret of secretsIn(bodies)) expect(stored).not.toContain(secret);
  });

  it("stores terms but no token, JWT, key or expression in a real completed capture (AC-007)", async () => {
    const ws = await workspace();
    const { bodies, deps } = google(() => Response.json({ rows: [{ clicks: 1, impressions: 4, ctr: 0.25, position: 3 }] }));
    await refreshSearchConsole(db, ws.id, deps);
    const { latestCompleted } = await latestSearchConsole(db, ws.id);
    expect(latestCompleted?.segments?.terms).toEqual(["Olessium", "olessium.com"]);
    const stored = JSON.stringify(latestCompleted);
    for (const secret of secretsIn(bodies)) expect(stored).not.toContain(secret);
  });
});
