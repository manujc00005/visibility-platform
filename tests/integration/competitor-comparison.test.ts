import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { auditFindings, audits, competitorComparisons, geoCompetitors, workspaces } from "@/db/schema";
import { emptyFieldData, type FieldDataResult } from "@/modules/audits/crux";
import { emptyResult, type PerformanceResult } from "@/modules/audits/pagespeed";
import { fetchAuthority } from "@/modules/competitor-comparison/open-pagerank";
import { latestComparison, runComparison, type ComparisonDeps } from "@/modules/competitor-comparison/service";
import { parseComparison, type SiteResult } from "@/modules/competitor-comparison/sites";
import { createWorkspace } from "@/modules/workspaces/service";
import { fakeFetcher, HTML_OK, type FakeRoute } from "../support/fake-fetcher";
import { createTestDb } from "./db";

const { pool, db } = createTestDb();
afterAll(() => pool.end());
beforeEach(async () => {
  await db.delete(workspaces);
});

async function company(website = "olessium.com") {
  const result = await createWorkspace(db, { name: "[TEST] Comparativa", website, sector: "Testing", country: "ES", city: "", services: "Testing" });
  if (!result.ok) throw new Error("fixture");
  return result.workspace;
}
const rival = (workspaceId: string, domain: string | null, name = `Rival ${domain}`) => db.insert(geoCompetitors).values({ workspaceId, name, domain }).returning().then(([row]) => row!);

const scored = (score: number) => ({ score, scored: 1, failingTotal: 0, failing: [] });
const performance = (score: number): PerformanceResult =>
  ({
    ...emptyResult("not_configured"),
    status: "ok",
    score,
    metrics: { lcpMs: 2000, cls: 0.1, tbtMs: 300, fcpMs: 900, speedIndexMs: 1500 },
    lighthouseVersion: "12.1.0",
    categories: { seo: scored(80), accessibility: scored(70), "best-practices": scored(90) },
  }) as PerformanceResult;
const field: FieldDataResult = {
  ...emptyFieldData("no_data"),
  status: "ok",
  scope: "origin",
  key: "https://x.es",
  collectionPeriod: { firstDate: "2026-09-01", lastDate: "2026-09-28" },
  metrics: { lcpMs: 3000, inpMs: 200, cls: 0.1, fcpMs: 1000, ttfbMs: 400 },
};
const open = (host: string, html = HTML_OK): Record<string, FakeRoute> => ({
  [`https://${host}/robots.txt`]: { status: 404 },
  [`https://${host}/`]: { status: 200, body: html, contentType: "text/html" },
  [`https://${host}/sitemap.xml`]: { status: 404 },
});

function deps(routes: Record<string, FakeRoute>, over: Partial<ComparisonDeps> & { pageSpeed?: (url: string) => Promise<PerformanceResult> } = {}) {
  const fetcher = fakeFetcher(routes);
  const authorityCalls: (readonly string[])[] = [];
  const { pageSpeed, ...rest } = over;
  const built: ComparisonDeps = {
    audit: { fetcher, pageSpeed: pageSpeed ?? (async () => performance(50)), fieldData: async () => field },
    authority: async (domains) => {
      authorityCalls.push(domains);
      return new Map(domains.map((d) => [d, { status: "ok", requestedDomain: d, effectiveDomain: d, scope: "registered_domain", asOf: "2026-10-01", score: 3, rank: 10, referringDomains: 5 } as const]));
    },
    pageSpeedConfigured: true,
    ...rest,
  };
  return { built, fetcher, authorityCalls };
}
const rows = (workspaceId: string) => db.select().from(competitorComparisons).where(eq(competitorComparisons.workspaceId, workspaceId));
const sitesOf = (raw: unknown) => parseComparison(raw)!.sites;
const byDomain = (sites: SiteResult[], domain: string) => sites.find((s) => s.domain === domain)!;

describe("schema", () => {
  const valid = { version: 1, sites: [{ any: "detail" }] };
  const insert = (id: string, status: string, sites: unknown, error: string | null = null, finished: string | null = null, started = "2026-10-31T10:00:00Z") =>
    pool.query("insert into competitor_comparisons (workspace_id,status,sites,rules_version,error,started_at,finished_at) values ($1,$2,$3::jsonb,'r',$4,$5,$6)", [
      id,
      status,
      sites === undefined ? null : JSON.stringify(sites),
      error,
      started,
      finished,
    ]);
  const end = "2026-10-31T10:05:00Z";

  it("accepts the three lifecycle states and leaves the detail to the parser", async () => {
    const ws = await company();
    await insert(ws.id, "completed", valid, null, end);
    await insert(ws.id, "failed", undefined, "interrupted", end);
    await insert(ws.id, "running", undefined);
    expect(await rows(ws.id)).toHaveLength(3);
  });

  it.each<[string, unknown]>([
    ["a root array", []],
    ["json null", null],
    ["version as an array", { version: [1], sites: [{}] }],
    ["another version", { version: 2, sites: [{}] }],
    ["sites not an array", { version: 1, sites: {} }],
    ["no sites", { version: 1, sites: [] }],
    ["seven sites", { version: 1, sites: Array(7).fill({}) }],
  ])("rejects %s with its named check", async (_, sites) => {
    const ws = await company();
    await expect(insert(ws.id, "completed", sites, null, end)).rejects.toMatchObject({ code: "23514", constraint: "competitor_comparisons_sites_shape" });
  });

  it.each<[string, string, unknown, string | null, string | null, string]>([
    ["completed without sites", "completed", undefined, null, end, "competitor_comparisons_sites_only_completed"],
    ["running with sites", "running", valid, null, null, "competitor_comparisons_sites_only_completed"],
    ["failed with sites", "failed", valid, "internal_error", end, "competitor_comparisons_sites_only_completed"],
    ["failed without a code", "failed", undefined, null, end, "competitor_comparisons_error_only_failed"],
    ["completed with a code", "completed", valid, "interrupted", end, "competitor_comparisons_error_only_failed"],
    ["an unknown code", "failed", undefined, "boom", end, "competitor_comparisons_error_valid"],
    ["an unknown status", "paused", undefined, null, end, "competitor_comparisons_status_valid"],
    ["running with an end", "running", undefined, null, end, "competitor_comparisons_finished_consistent"],
    ["completed without an end", "completed", valid, null, null, "competitor_comparisons_finished_consistent"],
    ["an end before the start", "completed", valid, null, "2026-10-31T09:00:00Z", "competitor_comparisons_finished_consistent"],
  ])("rejects %s", async (_, status, sites, error, finished, constraint) => {
    const ws = await company();
    await expect(insert(ws.id, status, sites, error, finished)).rejects.toMatchObject({ code: "23514", constraint });
  });

  it("allows one running row per company and cascades with it", async () => {
    const ws = await company();
    await insert(ws.id, "running", undefined);
    await expect(insert(ws.id, "running", undefined)).rejects.toMatchObject({ code: "23505", constraint: "competitor_comparisons_one_running_per_workspace" });
    await db.delete(workspaces).where(eq(workspaces.id, ws.id));
    expect(await rows(ws.id)).toHaveLength(0);
  });
});

describe("capture", () => {
  it("measures the company and five competitors in one row, company first (AC-001)", async () => {
    const ws = await company();
    const names = ["uno.es", "dos.es", "tres.es", "cuatro.es", "cinco.es"];
    for (const name of names) await rival(ws.id, name);
    const { built, authorityCalls } = deps(Object.assign({}, open("olessium.com"), ...names.map((n) => open(n))));
    const result = await runComparison(db, ws.id, built);
    expect(result.ok).toBe(true);
    const [row, ...others] = await rows(ws.id);
    expect(others).toHaveLength(0);
    expect(row).toMatchObject({ status: "completed", error: null });
    expect(row!.finishedAt).not.toBeNull();
    const sites = sitesOf(row!.sites);
    expect(sites.map((s) => s.domain)).toEqual(["olessium.com", ...names]);
    expect(sites[0]).toMatchObject({ role: "company", competitorId: null, access: "analyzed" });
    expect(authorityCalls).toEqual([["olessium.com", ...names]]);
  });

  it("measures each domain once and lists no competitor without a website (AC-001)", async () => {
    const ws = await company();
    await rival(ws.id, "uno.es");
    await rival(ws.id, "uno.es", "Duplicado");
    await rival(ws.id, "olessium.com", "Yo mismo");
    await rival(ws.id, null, "Sin web");
    const { built, fetcher } = deps({ ...open("olessium.com"), ...open("uno.es") });
    await runComparison(db, ws.id, built);
    const [row] = await rows(ws.id);
    expect(sitesOf(row!.sites).map((s) => s.domain)).toEqual(["olessium.com", "uno.es"]);
    expect(fetcher.calls.filter((c) => c === "https://uno.es/")).toHaveLength(1);
  });

  it("uses the stored hostname to measure and the domain for authority", async () => {
    const ws = await company("www.olessium.com");
    await rival(ws.id, "uno.es");
    const { built, fetcher, authorityCalls } = deps({ ...open("www.olessium.com"), ...open("uno.es") });
    await runComparison(db, ws.id, built);
    expect(fetcher.calls).toContain("https://www.olessium.com/");
    expect(authorityCalls[0]).toContain("olessium.com");
    expect(sitesOf((await rows(ws.id))[0]!.sites)[0]).toMatchObject({ domain: "olessium.com", hostname: "www.olessium.com" });
  });

  it("freezes the sites and keeps no lock while the network answers (AC-002, AC-021)", async () => {
    const ws = await company();
    const first = await rival(ws.id, "uno.es");
    let release!: () => void;
    let reached!: () => void;
    const started = new Promise<void>((resolve) => (reached = resolve));
    const held = new Promise<void>((resolve) => (release = resolve));
    const { built } = deps(
      { ...open("olessium.com"), ...open("uno.es") },
      {
        pageSpeed: async () => {
          reached();
          await held;
          return performance(50);
        },
      },
    );
    const pending = runComparison(db, ws.id, built);
    await started;
    await db.update(geoCompetitors).set({ status: "archived" }).where(eq(geoCompetitors.id, first.id));
    await rival(ws.id, "nuevo.es");
    await db.update(workspaces).set({ domain: "otro-dominio.es", hostname: "otro-dominio.es" }).where(eq(workspaces.id, ws.id));
    release();
    expect((await pending).ok).toBe(true);
    const sites = sitesOf((await rows(ws.id))[0]!.sites);
    expect(sites.map((s) => [s.competitorId, s.domain, s.hostname])).toEqual([
      [null, "olessium.com", "olessium.com"],
      [first.id, "uno.es", "uno.es"],
    ]);
  });

  it("never measures more than three sites at once", async () => {
    const ws = await company();
    const names = ["uno.es", "dos.es", "tres.es", "cuatro.es", "cinco.es"];
    for (const name of names) await rival(ws.id, name);
    let active = 0;
    let peak = 0;
    const { built } = deps(Object.assign({}, open("olessium.com"), ...names.map((n) => open(n))), {
      pageSpeed: async () => {
        peak = Math.max(peak, ++active);
        await new Promise((resolve) => setTimeout(resolve, 15));
        active--;
        return performance(50);
      },
    });
    await runComparison(db, ws.id, built);
    expect(peak).toBe(3);
  });

  it("keeps each failure on its own site and source (AC-003)", async () => {
    const ws = await company();
    for (const name of ["caido.es", "prohibido.es", "cuota.es", "error.es", "pdf.es"]) await rival(ws.id, name);
    const { built } = deps(
      {
        ...open("olessium.com"),
        "https://caido.es/robots.txt": { fail: "dns" },
        "https://caido.es/": { fail: "dns" },
        "https://prohibido.es/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /", contentType: "text/plain" },
        ...open("cuota.es"),
        "https://error.es/robots.txt": { status: 404 },
        "https://error.es/": { status: 503, body: "no", contentType: "text/html" },
        "https://pdf.es/robots.txt": { status: 404 },
        "https://pdf.es/": { status: 200, body: "%PDF", contentType: "application/pdf" },
      },
      { pageSpeed: async (url) => (url.includes("cuota") ? emptyResult("quota_exceeded", "Cuota") : performance(50)) },
    );
    await runComparison(db, ws.id, built);
    const [row] = await rows(ws.id);
    expect(row!.status).toBe("completed");
    const sites = sitesOf(row!.sites);
    expect(byDomain(sites, "olessium.com")).toMatchObject({ access: "analyzed", lighthouse: { status: "ok" } });
    expect(byDomain(sites, "caido.es")).toMatchObject({ access: "unreachable", cause: "dns", lighthouse: { status: "skipped" }, criticalCount: null });
    expect(byDomain(sites, "prohibido.es")).toMatchObject({ access: "robots_disallowed", lighthouse: { status: "skipped" }, field: { status: "skipped" }, authority: { status: "ok" } });
    expect(byDomain(sites, "cuota.es")).toMatchObject({ access: "analyzed", lighthouse: { status: "quota_exceeded" }, field: { status: "ok" } });
    expect(byDomain(sites, "error.es")).toMatchObject({ access: "http_error", criticalCount: null });
    expect(byDomain(sites, "pdf.es")).toMatchObject({ access: "non_html", criticalCount: null });
  });

  it("asks for authority of sites that robots.txt forbids to read, in one request (AC-005, AC-018)", async () => {
    const ws = await company();
    await rival(ws.id, "prohibido.es");
    const { built, authorityCalls } = deps({ ...open("olessium.com"), "https://prohibido.es/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /", contentType: "text/plain" } });
    await runComparison(db, ws.id, built);
    expect(authorityCalls).toEqual([["olessium.com", "prohibido.es"]]);
  });

  it("turns the robots guard on: a redirect to a forbidden path is never read nor sent to Google (AC-018)", async () => {
    const ws = await company();
    await rival(ws.id, "redirige.es");
    const routes = {
      ...open("olessium.com"),
      "https://redirige.es/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /privado", contentType: "text/plain" },
      "https://redirige.es/": { status: 200, body: HTML_OK, contentType: "text/html" },
    };
    const psi: string[] = [];
    const { built, fetcher } = deps(routes, {
      pageSpeed: async (url) => {
        psi.push(url);
        return performance(50);
      },
    });
    // The fetcher double follows the redirect the way the real one does: asking first.
    const fetchPlain = fetcher.fetch;
    built.audit.fetcher = {
      fetch: async (url, limits, budget) => {
        if (url === "https://redirige.es/" && limits.allowRequest) {
          const target = new URL("https://redirige.es/privado");
          if (!(await limits.allowRequest(target))) return { ok: false, failure: { kind: "refused_by_policy", message: "x", url: target.href } };
        }
        return fetchPlain(url, limits, budget);
      },
    };
    await runComparison(db, ws.id, built);
    expect(byDomain(sitesOf((await rows(ws.id))[0]!.sites), "redirige.es")).toMatchObject({ access: "robots_disallowed", lighthouse: { status: "skipped" } });
    expect(psi).toEqual(["https://olessium.com/"]);
  });

  it.each<[string, () => Response, string]>([
    ["a rejected key", () => Response.json({}, { status: 401 }), "invalid_key"],
    ["another address", () => Response.json({ error: { type: "address_error" } }, { status: 403 }), "ip_not_allowed"],
    ["the quota", () => Response.json({ error: { type: "quota_error" } }, { status: 429 }), "quota_exceeded"],
    ["a server error", () => new Response("x", { status: 500 }), "error"],
    ["a malformed answer", () => Response.json({ nope: true }), "error"],
  ])("completes with %s on Open PageRank, without the key (AC-004)", async (_, answer, status) => {
    const ws = await company();
    await rival(ws.id, "uno.es");
    const key = "opr_live_secreta";
    const { built } = deps({ ...open("olessium.com"), ...open("uno.es") }, { authority: (domains) => fetchAuthority(domains, { apiKey: key, fetchImpl: (async () => answer()) as typeof fetch }) });
    await runComparison(db, ws.id, built);
    const [row] = await rows(ws.id);
    expect(row!.status).toBe("completed");
    expect(sitesOf(row!.sites).map((s) => s.authority.status)).toEqual([status, status]);
    expect(JSON.stringify(row)).not.toContain(key);
  });

  it("makes no authority request without a key and still completes (AC-004, AC-005)", async () => {
    const ws = await company();
    await rival(ws.id, "uno.es");
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return Response.json({});
    }) as typeof fetch;
    const { built } = deps({ ...open("olessium.com"), ...open("uno.es") }, { authority: (domains) => fetchAuthority(domains, { apiKey: undefined, fetchImpl }) });
    await runComparison(db, ws.id, built);
    expect(calls).toBe(0);
    expect(sitesOf((await rows(ws.id))[0]!.sites)[0]!.authority.status).toBe("not_configured");
  });

  it("allows one attempt at a time (AC-006)", async () => {
    const ws = await company();
    await rival(ws.id, "uno.es");
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const { built } = deps(
      { ...open("olessium.com"), ...open("uno.es") },
      {
        pageSpeed: async () => {
          await held;
          return performance(50);
        },
      },
    );
    const results = [runComparison(db, ws.id, built), runComparison(db, ws.id, built)];
    const second = await Promise.race(results);
    expect(second).toEqual({ ok: false, error: "already_running" });
    release();
    expect((await Promise.all(results)).filter((r) => r.ok)).toHaveLength(1);
    expect(await rows(ws.id)).toHaveLength(1);
  });

  it("closes a stale attempt, and its late worker touches neither that row nor the new one (AC-006)", async () => {
    const ws = await company();
    await rival(ws.id, "uno.es");
    let release!: () => void;
    let reached!: () => void;
    const started = new Promise<void>((resolve) => (reached = resolve));
    const held = new Promise<void>((resolve) => (release = resolve));
    const slow = deps(
      { ...open("olessium.com"), ...open("uno.es") },
      {
        pageSpeed: async () => {
          reached();
          await held;
          return performance(10);
        },
      },
    );
    const late = runComparison(db, ws.id, slow.built);
    await started;
    await pool.query("update competitor_comparisons set started_at = now() - interval '11 minutes' where workspace_id = $1", [ws.id]);

    const fresh = await runComparison(db, ws.id, deps({ ...open("olessium.com"), ...open("uno.es") }).built);
    expect(fresh.ok).toBe(true);
    release();
    expect(await late).toEqual({ ok: false, error: "capture_closed" });

    const all = await rows(ws.id);
    expect(all.map((r) => [r.status, r.error]).sort()).toEqual([
      ["completed", null],
      ["failed", "interrupted"],
    ]);
    const { latestCompleted } = await latestComparison(db, ws.id);
    expect(sitesOf(latestCompleted!.sites)[0]!.lighthouse).toMatchObject({ performance: { value: 50 } });
  });

  it("answers not_found only when the company is really gone", async () => {
    const ws = await company();
    await rival(ws.id, "uno.es");
    let release!: () => void;
    let reached!: () => void;
    const started = new Promise<void>((resolve) => (reached = resolve));
    const held = new Promise<void>((resolve) => (release = resolve));
    const { built } = deps(
      { ...open("olessium.com"), ...open("uno.es") },
      {
        pageSpeed: async () => {
          reached();
          await held;
          return performance(50);
        },
      },
    );
    const pending = runComparison(db, ws.id, built);
    await started;
    await db.delete(workspaces).where(eq(workspaces.id, ws.id));
    release();
    expect(await pending).toEqual({ ok: false, error: "not_found" });
    expect(await rows(ws.id)).toHaveLength(0);
  });

  it("marks only an internal error as failed, with a closed code", async () => {
    const ws = await company();
    await rival(ws.id, "uno.es");
    const { built } = deps(
      { ...open("olessium.com"), ...open("uno.es") },
      {
        pageSpeed: async () => {
          throw new Error("texto interno con detalle");
        },
      },
    );
    expect((await runComparison(db, ws.id, built)).ok).toBe(true);
    expect(await rows(ws.id)).toMatchObject([{ status: "failed", error: "internal_error", sites: null }]);
  });

  it.each<[string, string | null, () => Partial<ComparisonDeps>, string]>([
    ["without PageSpeed", "uno.es", () => ({ pageSpeedConfigured: false }), "not_configured"],
    ["without competitors with a website", null, () => ({}), "no_competitors"],
    ["with the company as its only competitor", "olessium.com", () => ({}), "no_competitors"],
  ])("rejects a comparison %s, with no row and no network (AC-013, AC-022)", async (_, domain, over, error) => {
    const ws = await company();
    await rival(ws.id, domain);
    const { built, fetcher, authorityCalls } = deps({}, over());
    expect(await runComparison(db, ws.id, built)).toEqual({ ok: false, error });
    expect(await rows(ws.id)).toHaveLength(0);
    expect(fetcher.calls).toHaveLength(0);
    expect(authorityCalls).toHaveLength(0);
  });

  it.each(["no-es-un-id", "00000000-0000-4000-8000-000000000000", ["00000000-0000-4000-8000-000000000000"] as unknown as string])("rejects the id %j without touching anything", async (id) => {
    const { built, fetcher } = deps({});
    expect(await runComparison(db, id, built)).toEqual({ ok: false, error: "not_found" });
    expect(fetcher.calls).toHaveLength(0);
  });

  it("leaves the company's audits untouched (AC-007)", async () => {
    const ws = await company();
    await rival(ws.id, "uno.es");
    const [audit] = await db.insert(audits).values({ workspaceId: ws.id, requestedUrl: "https://olessium.com/", rulesVersion: "r", status: "completed", finishedAt: new Date() }).returning();
    const before = await db.select().from(audits).where(eq(audits.workspaceId, ws.id));
    const { built } = deps({ ...open("olessium.com"), ...open("uno.es") });
    await runComparison(db, ws.id, built);
    expect(await db.select().from(audits).where(eq(audits.workspaceId, ws.id))).toEqual(before);
    expect(await db.select().from(auditFindings).where(eq(auditFindings.auditId, audit!.id))).toHaveLength(0);
  });

  it("stores no text from a website (AC-008)", async () => {
    const ws = await company();
    await rival(ws.id, "uno.es");
    const secret = "Texto-privado-del-competidor";
    const html = `<!doctype html><html lang="es"><head><title>${secret} titulo</title><meta name="description" content="${secret} descripcion"></head><body><h1>${secret}</h1></body></html>`;
    const { built } = deps({ ...open("olessium.com"), ...open("uno.es", html) });
    await runComparison(db, ws.id, built);
    const stored = JSON.stringify(await rows(ws.id));
    expect(stored).not.toContain(secret);
    expect(stored).not.toContain("https://");
    expect(stored).not.toContain("<html");
  });

  it("breaks a tie on the start time by id", async () => {
    const ws = await company();
    const data = (name: string) => ({ version: 1, sites: [{ name }] });
    const at = new Date("2026-10-31T10:00:00Z");
    const end = new Date("2026-10-31T10:05:00Z");
    const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
    for (const id of [ids[1]!, ids[0]!]) await db.insert(competitorComparisons).values({ id, workspaceId: ws.id, status: "completed", sites: data(id), rulesVersion: "r", startedAt: at, finishedAt: end });
    expect((await latestComparison(db, ws.id)).latestCompleted?.id).toBe(ids[1]);
  });

  it("reads the newest attempt and the newest completed one", async () => {
    const ws = await company();
    await rival(ws.id, "uno.es");
    const good = deps({ ...open("olessium.com"), ...open("uno.es") });
    await runComparison(db, ws.id, good.built);
    await runComparison(db, ws.id, deps({ ...open("olessium.com"), ...open("uno.es") }, { pageSpeed: async () => Promise.reject(new Error("x")) }).built);
    const { latest, latestCompleted } = await latestComparison(db, ws.id);
    expect(latest?.status).toBe("failed");
    expect(latestCompleted?.status).toBe("completed");
  });
});
