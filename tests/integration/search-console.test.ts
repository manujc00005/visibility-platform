import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { searchConsoleSnapshots, trackedKeywords, workspaces } from "@/db/schema";
import { brandTerms } from "@/modules/search-console/brand-terms";
import { collectSearchConsole, type CaptureSite, type CollectOutcome } from "@/modules/search-console/collect";
import { parseServiceAccount } from "@/modules/search-console/credentials";
import { keywordExpression } from "@/modules/search-console/keywords";
import { latestSearchConsole, refreshSearchConsole, type SearchConsoleDeps } from "@/modules/search-console/service";
import { addTrackedKeyword, listTrackedKeywords, removeTrackedKeyword } from "@/modules/search-console/tracked-keywords-service";
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
    keywordSeries: {version:1,start:"2026-04-26",end:"2026-10-24",keywords:[]},
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
    expect(d.sites).toEqual([{ domain: "olessium.com", hostname: "olessium.com", name: "Olessium", brandAliases: [], trackedKeywords: [] }]);
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

describe("search console previous position per query (feature 009)", () => {
  const parsedAccount = parseServiceAccount(serviceAccountJson());
  if (!parsedAccount?.ok) throw new Error("fixture");
  const account = parsedAccount.value;
  const SECRET = "ya29.integration-secret-009";
  const previous = { clicks: 2, impressions: 40, ctr: 0.05, position: 12.1 };

  /** Google double: `before` answers the query report of the previous period. */
  function google(before: () => Response) {
    const bodies: string[] = [];
    const fetchImpl = (async (input: string, init?: RequestInit) => {
      const url = String(input);
      const body = String(init?.body ?? "");
      bodies.push(body);
      if (url.includes("oauth2")) return Response.json({ access_token: SECRET });
      if (url.endsWith("/sites")) return Response.json({ siteEntry: [{ siteUrl: "sc-domain:olessium.com", permissionLevel: "siteOwner" }] });
      const request = JSON.parse(body) as { dimensions: string[]; startDate: string };
      if (request.dimensions[0] !== "query") return Response.json({});
      if (request.startDate === "2026-09-27") {
        return Response.json({
          rows: [
            { keys: ["crm agencias"], clicks: 5, impressions: 50, ctr: 0.1, position: 8 },
            { keys: ["olessium"], clicks: 3, impressions: 9, ctr: 0.33, position: 1.2 },
          ],
        });
      }
      return before();
    }) as typeof fetch;
    return { bodies, deps: { collect: (site: CaptureSite) => collectSearchConsole(account, site, { fetchImpl, now: new Date("2026-10-27T10:00:00Z") }) } };
  }
  const answer = () => Response.json({ rows: [{ keys: ["crm agencias"], ...previous }] });

  it("stores previous figures and null per query and reads them back (AC-001)", async () => {
    const ws = await workspace();
    await refreshSearchConsole(db, ws.id, google(answer).deps);
    const { latestCompleted } = await latestSearchConsole(db, ws.id);
    expect(latestCompleted?.queries.map((q) => [q.query, q.previous])).toEqual([
      ["crm agencias", previous],
      ["olessium", null],
    ]);
  });

  it("reads a capture stored before the feature without the key", async () => {
    const ws = await workspace();
    await refreshSearchConsole(db, ws.id, deps(OK));
    const { latestCompleted } = await latestSearchConsole(db, ws.id);
    expect(latestCompleted?.queries[0]).not.toHaveProperty("previous");
  });

  it.each([
    [403, { error: { details: [{ reason: "SERVICE_DISABLED" }] } }, "api_disabled"],
    [403, { error: { message: "User does not have sufficient permission for site." } }, "no_access"],
    [429, {}, "quota_exceeded"],
    [500, {}, "error"],
  ])("stores one failed row without secrets when the previous queries answer %i (AC-007)", async (status, body, kind) => {
    const ws = await workspace();
    const { bodies, deps: failing } = google(() => Response.json(body, { status }));
    await refreshSearchConsole(db, ws.id, failing);
    const rows = await db.select().from(searchConsoleSnapshots).where(eq(searchConsoleSnapshots.workspaceId, ws.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "failed", errorKind: kind, queries: [] });
    const stored = JSON.stringify(rows[0]);
    for (const secret of [SECRET, new URLSearchParams(bodies[0]!).get("assertion")!, PRIVATE_PEM.split("\n")[1]!]) expect(stored).not.toContain(secret);
  });

  it.each([
    [403, { error: { details: [{ reason: "SERVICE_DISABLED" }] } }],
    [403, { error: { message: "User does not have sufficient permission for site." } }],
    [429, {}],
    [500, {}],
  ])("keeps the last good capture after the new query answers %i (AC-007)", async (status, body) => {
    const ws = await workspace();
    await refreshSearchConsole(db, ws.id, google(answer).deps);
    await refreshSearchConsole(db, ws.id, google(() => Response.json(body, { status })).deps);
    const { latest, latestCompleted } = await latestSearchConsole(db, ws.id);
    expect(latest?.status).toBe("failed");
    expect(latestCompleted?.queries[0]?.previous).toEqual(previous);
  });
});

describe("search console tracked keywords (feature 010)", () => {
  const parsedAccount = parseServiceAccount(serviceAccountJson());
  if (!parsedAccount?.ok) throw new Error("fixture");
  const account = parsedAccount.value;
  const SECRET = "ya29.integration-secret-010";
  const DAY = "2026-10-24";
  const row = (query: string) => ({ keys: [DAY, query], clicks: 1, impressions: 5, ctr: 0.2, position: 8 });
  type Filtered = { dimensions: string[]; dimensionFilterGroups?: { filters: { expression: string }[] }[] };

  /** Google double: `keywords` answers the date/query request, the only one with that dimension. */
  function google(keywords: () => Response | Promise<Response>) {
    const bodies: string[] = [];
    const fetchImpl = (async (input: string, init?: RequestInit) => {
      const url = String(input);
      const body = String(init?.body ?? "");
      bodies.push(body);
      if (url.includes("oauth2")) return Response.json({ access_token: SECRET });
      if (url.endsWith("/sites")) return Response.json({ siteEntry: [{ siteUrl: "sc-domain:olessium.com", permissionLevel: "siteOwner" }] });
      return (JSON.parse(body) as Filtered).dimensions.includes("date") ? keywords() : Response.json({});
    }) as typeof fetch;
    const filter = () =>
      bodies
        .filter((b) => b.startsWith("{"))
        .map((b) => JSON.parse(b) as Filtered)
        .find((b) => b.dimensions.includes("date"))?.dimensionFilterGroups?.[0]?.filters[0]?.expression;
    return { bodies, filter, deps: { collect: (site: CaptureSite) => collectSearchConsole(account, site, { fetchImpl, now: new Date("2026-10-27T10:00:00Z") }) } };
  }
  const held = () => {
    let release!: (response: Response) => void;
    let reached!: () => void;
    const started = new Promise<void>((resolve) => (reached = resolve));
    const answer = () => {
      reached();
      return new Promise<Response>((resolve) => (release = resolve));
    };
    return { started, answer, release: (response: Response) => release(response) };
  };
  const snapshots = (id: string) => db.select().from(searchConsoleSnapshots).where(eq(searchConsoleSnapshots.workspaceId, id));

  it("sends the list read at the start and leaves the company unlocked while Google answers (AC-018)", async () => {
    const ws = await workspace();
    await addTrackedKeyword(db, ws.id, "crm agencias");
    const google1 = held();
    const { filter, deps: live } = google(google1.answer);
    const pending = refreshSearchConsole(db, ws.id, live);
    await google1.started;

    const [saved] = await listTrackedKeywords(db, ws.id);
    expect(await removeTrackedKeyword(db, ws.id, saved!.id)).toEqual({ ok: true });
    expect(await addTrackedKeyword(db, ws.id, "otra busqueda")).toEqual({ ok: true });
    google1.release(Response.json({ rows: [row("CRM  Agencias"), row("otra busqueda")] }));

    expect((await pending).ok).toBe(true);
    expect(filter()).toBe(keywordExpression(["crm agencias"]));
    const { latestCompleted } = await latestSearchConsole(db, ws.id);
    expect(latestCompleted?.keywordSeries?.keywords.map((k) => [k.keyword, k.weeks.length])).toEqual([["crm agencias", 1]]);
  });

  it("stores nothing when the company is deleted while Google answers (AC-018)", async () => {
    const ws = await workspace();
    await addTrackedKeyword(db, ws.id, "crm agencias");
    const google1 = held();
    const pending = refreshSearchConsole(db, ws.id, google(google1.answer).deps);
    await google1.started;
    await db.delete(workspaces).where(eq(workspaces.id, ws.id));
    google1.release(Response.json({ rows: [row("crm agencias")] }));

    expect(await pending).toEqual({ ok: false, error: "not_found" });
    expect(await snapshots(ws.id)).toHaveLength(0);
    expect(await db.select().from(trackedKeywords).where(eq(trackedKeywords.workspaceId, ws.id))).toHaveLength(0);
  });

  it.each([
    [403, { error: { details: [{ reason: "SERVICE_DISABLED" }] } }, "api_disabled"],
    [403, { error: { message: "User does not have sufficient permission for site." } }, "no_access"],
    [429, {}, "quota_exceeded"],
    [500, {}, "error"],
  ])("stores one failed row without secrets when the keyword query answers %i (AC-009)", async (status, body, kind) => {
    const ws = await workspace();
    await addTrackedKeyword(db, ws.id, "crm agencias");
    const { bodies, deps: failing } = google(() => Response.json(body, { status }));
    await refreshSearchConsole(db, ws.id, failing);
    const rows = await snapshots(ws.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "failed", errorKind: kind, keywordSeries: null, queries: [] });
    const stored = JSON.stringify(rows[0]);
    for (const secret of [SECRET, new URLSearchParams(bodies[0]!).get("assertion")!, PRIVATE_PEM.split("\n")[1]!, "crm agencias"]) expect(stored).not.toContain(secret);
  });

  it("stores a completed capture when Google reports more clicks than impressions", async () => {
    const ws = await workspace();
    await addTrackedKeyword(db, ws.id, "crm agencias");
    await refreshSearchConsole(db, ws.id, google(() => Response.json({ rows: [{ ...row("crm agencias"), clicks: 3, impressions: 2, ctr: 1.5 }] })).deps);
    expect(await snapshots(ws.id)).toMatchObject([{ status: "completed", keywordSeries: { keywords: [{ keyword: "crm agencias", weeks: [{ clicks: 3, impressions: 2 }] }] } }]);
  });

  it("keeps the last good series after a failed keyword query (AC-009)", async () => {
    const ws = await workspace();
    await addTrackedKeyword(db, ws.id, "crm agencias");
    await refreshSearchConsole(db, ws.id, google(() => Response.json({ rows: [row("crm agencias")] })).deps);
    await refreshSearchConsole(db, ws.id, google(() => Response.json({}, { status: 500 })).deps);
    const { latest, latestCompleted } = await latestSearchConsole(db, ws.id);
    expect(latest?.status).toBe("failed");
    expect(latestCompleted?.keywordSeries?.keywords[0]?.weeks).toHaveLength(1);
  });

  it("stores one actionable failed row for a list over the filter limit, without calling Google (AC-004)", async () => {
    const ws = await workspace();
    await db.insert(trackedKeywords).values(Array.from({ length: 25 }, (_, i) => ({ workspaceId: ws.id, keyword: `${i}${"界".repeat(78)}` })));
    const { bodies, deps: live } = google(() => Response.json({}));
    await refreshSearchConsole(db, ws.id, live);
    expect(bodies).toHaveLength(0);
    expect(await snapshots(ws.id)).toMatchObject([{ status: "failed", errorKind: "keyword_limit", keywordSeries: null }]);
  });

  it.each([
    ["the row limit", () => Array(25000).fill(row("otra")), "keyword_limit"],
    ["an invalid row", () => [{ ...row("crm agencias"), keys: ["2026-02-30", "crm agencias"] }], "error"],
    ["a repeated row", () => [row("crm agencias"), row("crm agencias")], "error"],
  ])("stores a failed row and no partial series for %s (AC-016)", async (_, rows, kind) => {
    const ws = await workspace();
    await addTrackedKeyword(db, ws.id, "crm agencias");
    await refreshSearchConsole(db, ws.id, google(() => Response.json({ rows: rows() })).deps);
    expect(await snapshots(ws.id)).toMatchObject([{ status: "failed", errorKind: kind, keywordSeries: null }]);
  });
});
