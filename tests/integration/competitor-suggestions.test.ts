import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { audits, geoCompetitorDismissals, geoCompetitorExtractions, geoCompetitorSuggestions, geoCompetitors, geoObservations, geoRuns, providerSpend, reports, workspaces } from "@/db/schema";
import { logger } from "@/lib/logger";
import type { FetchResult, SafeFetcher } from "@/modules/audits/fetcher/safe-fetch";
import { acceptSuggestion, dismissSuggestion, extractCompetitors, listSuggestions, type CompetitorDeps } from "@/modules/geo/competitors/service";
import { suggestPrompts } from "@/modules/geo/prompt-suggestions";
import { addCompetitor, listCompetitors, listGeoRuns, MAX_ACTIVE_COMPETITORS, updateBrandAliases } from "@/modules/geo/service";
import { createWorkspace, updateWorkspace } from "@/modules/workspaces/service";
import { fakeFetcher } from "../support/fake-fetcher";
import { createTestDb } from "./db";

/**
 * Against the Neon `test` branch. Concurrency scenarios use two independent pools so the
 * races go through real, separate connections and the workspace row lock.
 */
const { pool, db } = createTestDb();
const second = createTestDb();
afterAll(async () => {
  await pool.end();
  await second.pool.end();
});
beforeEach(async () => {
  await db.delete(reports);
  await db.delete(audits);
  await db.delete(providerSpend);
  await db.delete(workspaces);
});

const MARKER = "FRASE-MARCADORA-7f3a9c";
const page = (title: string, description: string, extra = "") =>
  `<!doctype html><html lang="es"><head><title>${title}</title><meta name="description" content="${description}">${extra}</head><body></body></html>`;

const ROUTES = {
  "https://alfa.es/": { status: 200, contentType: "text/html", body: page("Alfa Dental, clínica dental en Madrid", "Implantes dentales y ortodoncia en Madrid") },
  "https://beta.es/": { status: 200, contentType: "text/html", body: page("Beta Dental", "Clínica dental en Madrid") },
  "https://gamma.es/": { status: 200, contentType: "text/html", body: page("Gamma Odontología", "Solo atendemos en Barcelona") },
  "https://delta.es/": { status: 200, contentType: "text/html", body: page("Delta", "Dentistas") },
  "https://privada.es/": { fail: "blocked_destination" as const },
};

const ANSWER = `Opciones en Madrid:
1. **Alfa Dental** – [web](https://alfa.es/)
2. **Beta Dental**
3. **Gamma Odontología** [web](https://gamma.es/)
4. **Delta**
5. **Sonrisas Pepe** (es la propia clínica)
6. **Doctoralia** https://www.doctoralia.es/clinicas
${MARKER} esta línea no es un candidato.`;

async function setup(fetcher: SafeFetcher = fakeFetcher(ROUTES)) {
  const ws = await createWorkspace(db, { name: "Clínica Dental García", website: "https://www.clinicagarcia.es/", sector: "Clínica dental", country: "ES", city: "Madrid", services: "Implantes" });
  if (!ws.ok) throw new Error("workspace");
  await updateBrandAliases(db, ws.workspace.id, { aliases: "Sonrisas Pepe" });
  const deps: CompetitorDeps = { fetcher };
  return { id: ws.workspace.id, deps, fetcher };
}

const input = (overrides: Partial<{ question: string; answer: string; sources: string }> = {}) => ({
  question: "¿Qué clínica dental me recomiendas en Madrid?",
  answer: ANSWER,
  sources: "https://beta.es/\nhttps://delta.es/\nhttps://privada.es/\nhttps://www.doctoralia.es/clinicas",
  ...overrides,
});

const accept = (name = "Alfa Dental", website = "alfa.es") => ({ name, website, reviewConfirmed: "true" });

async function extracted(id: string, deps: CompetitorDeps, raw = input()) {
  const result = await extractCompetitors(db, id, raw, deps);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

/** Fetcher whose every call blocks until `release()`; used to open a window for races. */
function gatedFetcher(routes: typeof ROUTES) {
  const inner = fakeFetcher(routes);
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let started = 0;
  const fetcher: SafeFetcher = {
    async fetch(url, limits, budget) {
      started += 1;
      await gate;
      return inner.fetch(url, limits, budget);
    },
  };
  return { fetcher, release: () => release(), started: () => started, calls: inner.calls };
}

describe("extraction", () => {
  it("persists the extraction with context, fingerprint, rules and bounded evidence; cards follow the rules", async () => {
    const { id, deps, fetcher } = await setup();
    const view = await extracted(id, deps);
    expect(view.repeated).toBe(false);
    expect(view.extraction).toMatchObject({ workspaceId: id, source: "assisted", rulesVersion: expect.stringContaining("competitors-"), candidatesShown: 3 });
    expect(view.extraction.contextSnapshot).toMatchObject({ brandName: "Clínica Dental García", hostname: "clinicagarcia.es", city: "Madrid", services: ["Implantes"] });
    expect(view.extraction.inputFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(view.extraction.sources).toEqual(["https://beta.es/", "https://delta.es/", "https://privada.es/", "https://www.doctoralia.es/clinicas"]);
    // Only non-excluded hosts were read: alfa, beta, gamma, delta, privada (doctoralia is a known directory).
    expect((fetcher as ReturnType<typeof fakeFetcher>).calls.sort()).toEqual(["https://alfa.es/", "https://beta.es/", "https://delta.es/", "https://gamma.es/", "https://privada.es/"]);
    expect(view.suggestions.map((s) => s.name)).toEqual(["Alfa Dental", "Beta Dental", "Delta"]);
    expect(view.suggestions[0]).toMatchObject({ domain: "alfa.es", webStatus: "reachable", status: "suggested", candidateKey: "host:alfa.es" });
    expect(view.suggestions[0]!.factors.sector.state).toBe("matched");
    expect(view.suggestions[0]!.factors.services.state).toBe("matched");
    expect(view.suggestions[2]!.factors.zone.state).toBe("unknown");
    expect(view.extraction.warnings.join(" ")).toMatch(/propia empresa/);
    expect(view.extraction.warnings.join(" ")).toMatch(/otra zona/);
    expect(JSON.stringify(view)).not.toMatch(/titularidad verificada|propia verificada|%/);
  });

  it("does not store the full answer, HTML or the marker, and logs no content", async () => {
    const infoSpy = vi.spyOn(logger, "info");
    const { id, deps } = await setup();
    await extracted(id, deps);
    const texts = await db.execute(sql`
      select string_agg(coalesce(question,'') || coalesce(context_snapshot::text,'') || coalesce(warnings::text,'') || coalesce(sources::text,''), ' ') as t from geo_competitor_extractions
      union all
      select string_agg(coalesce(name,'') || coalesce(snippet,'') || coalesce(page_title,'') || coalesce(page_description,'') || factors::text, ' ') from geo_competitor_suggestions`);
    for (const row of texts.rows as { t: string | null }[]) {
      expect(row.t ?? "").not.toContain(MARKER);
      expect(row.t ?? "").not.toContain("<title>");
    }
    const [row] = await db.select({ n: sql<number>`max(length(snippet))::int` }).from(geoCompetitorSuggestions);
    expect(row!.n).toBeLessThanOrEqual(200);
    const logged = JSON.stringify(infoSpy.mock.calls);
    expect(logged).not.toContain(MARKER);
    expect(logged).not.toContain("alfa.es");
    expect(logged).not.toContain("¿Qué clínica");
    infoSpy.mockRestore();
  });

  it("returns the existing extraction for an exact repetition without network; changed sources or context extract again", async () => {
    const { id, deps, fetcher } = await setup();
    const first = await extracted(id, deps);
    const calls = (fetcher as ReturnType<typeof fakeFetcher>).calls.length;
    const again = await extracted(id, deps, { ...input(), answer: `${ANSWER}\r\n` });
    expect(again.repeated).toBe(true);
    expect(again.extraction.id).toBe(first.extraction.id);
    expect((fetcher as ReturnType<typeof fakeFetcher>).calls.length).toBe(calls);

    const other = await extracted(id, deps, input({ sources: "https://beta.es/" }));
    expect(other.repeated).toBe(false);
    expect(other.extraction.id).not.toBe(first.extraction.id);
    await updateWorkspace(db, id, { name: "Clínica Dental García", website: "https://www.clinicagarcia.es/", sector: "Clínica dental", country: "ES", city: "Getafe", services: "Implantes" });
    const edited = await extracted(id, deps, input({ sources: "https://beta.es/" }));
    expect(edited.repeated).toBe(false);
  });

  it("rejects oversized or invalid input before any network", async () => {
    const { id, deps, fetcher } = await setup();
    const tooMany = Array.from({ length: 21 }, (_, i) => `https://s${i}.es/`).join("\n");
    expect(await extractCompetitors(db, id, input({ sources: tooMany }), deps)).toMatchObject({ ok: false, error: "validation" });
    expect(await extractCompetitors(db, id, input({ answer: "x".repeat(30_001) }), deps)).toMatchObject({ ok: false, error: "validation" });
    expect(await extractCompetitors(db, id, input({ sources: "ftp://x.es/\nhttps://user:pw@y.es/\nhttps://z.es:8443/" }), deps)).toMatchObject({ ok: false, error: "validation" });
    expect(await extractCompetitors(db, id, input({ question: "" }), deps)).toMatchObject({ ok: false, error: "validation" });
    expect((fetcher as ReturnType<typeof fakeFetcher>).calls).toEqual([]);
    expect(await extractCompetitors(db, "00000000-0000-4000-8000-000000000000", input(), deps)).toMatchObject({ ok: false, error: "not_found" });
  });

  it("touches no GEO measurement or spend rows, even without any paid budget", async () => {
    const { id, deps } = await setup();
    const before = await Promise.all([db.select().from(geoRuns), db.select().from(geoObservations), db.select().from(providerSpend)]);
    await extracted(id, deps);
    const after = await Promise.all([db.select().from(geoRuns), db.select().from(geoObservations), db.select().from(providerSpend)]);
    expect(after.map((r) => r.length)).toEqual(before.map((r) => r.length));
    expect(await listGeoRuns(db, id)).toEqual([]);
  });

  it("publishes a partial result with a warning when the external deadline expires, and keeps the previous extraction on global failure", async () => {
    const { id, deps } = await setup();
    const first = await extracted(id, deps);
    // A fetcher that only answers when cancelled: the deadline must cut it off.
    const slow: SafeFetcher = {
      fetch: (url, limits, budget) =>
        new Promise<FetchResult>((resolve) => {
          const done = () => {
            budget.requests += 1;
            resolve({ ok: false, failure: { kind: "timeout", message: "Cancelled", url } });
          };
          limits.signal?.addEventListener("abort", done, { once: true });
        }),
    };
    const many = Array.from({ length: 8 }, (_, i) => `https://extra${i}.es/`).join("\n");
    const partial = await extractCompetitors(db, id, input({ sources: `https://beta.es/\nhttps://delta.es/\n${many}` }), { fetcher: slow, externalDeadlineMs: 150 });
    expect(partial.ok).toBe(true);
    if (!partial.ok) return;
    expect(partial.value.extraction.warnings.join(" ")).toMatch(/Se agotó el tiempo de comprobación.*Resultado parcial/);
    expect(partial.value.suggestions.every((s) => s.webStatus !== "reachable")).toBe(true);
    // Hosts the deadline skipped are still unverified cards: an explicit link keeps its host.
    expect(partial.value.suggestions.find((s) => s.name === "Alfa Dental")).toMatchObject({ domain: "alfa.es", webStatus: "unverified" });

    // Global failure = the publication itself fails (induced at the database); nothing is published.
    await db.execute(sql`
      create or replace function test_block_extraction() returns trigger language plpgsql as $$
      begin raise exception 'induced publish failure'; end $$;
      create trigger test_block_extraction before insert on geo_competitor_extractions for each row execute function test_block_extraction();`);
    try {
      await expect(extractCompetitors(db, id, input({ sources: "https://alfa.es/" }), deps)).rejects.toThrow();
    } finally {
      await db.execute(sql`drop trigger if exists test_block_extraction on geo_competitor_extractions; drop function if exists test_block_extraction();`);
    }
    const current = await listSuggestions(db, id);
    expect(current!.extraction.id).toBe(partial.value.extraction.id);
    expect(current!.extraction.id).not.toBe(first.extraction.id);
  });
});

describe("decisions", () => {
  it("accepting creates the competitor and marks the card atomically; repeating returns the same competitor", async () => {
    const { id, deps } = await setup();
    const view = await extracted(id, deps);
    const alfa = view.suggestions.find((s) => s.name === "Alfa Dental")!;
    expect(await acceptSuggestion(db, id, alfa.id, { name: "Alfa Dental", website: "alfa.es" })).toMatchObject({ ok: false, error: "validation" });
    const first = await acceptSuggestion(db, id, alfa.id, accept());
    expect(first.ok && first.value).toMatchObject({ name: "Alfa Dental", domain: "alfa.es", status: "active" });
    const [row] = await db.select().from(geoCompetitorSuggestions).where(eq(geoCompetitorSuggestions.id, alfa.id));
    expect(row).toMatchObject({ status: "accepted", competitorId: first.ok ? first.value.id : null });
    expect(row!.acceptedInput).toMatchObject({ corrected: false, websiteStatus: "as_suggested", reviewConfirmed: true });
    expect(row!.decidedAt).not.toBeNull();
    const again = await acceptSuggestion(db, id, alfa.id, accept());
    expect(again.ok && again.value.id).toBe(first.ok && first.value.id);
    expect(await listCompetitors(db, id)).toHaveLength(1);
    const prompts = suggestPrompts({ brandName: "Clínica Dental García", sector: "Clínica dental", city: "Madrid", countryName: "España", services: ["Implantes"], competitorNames: (await listCompetitors(db, id)).map((c) => c.name) });
    expect(prompts.some((p) => p.text === "¿Qué alternativas hay a Alfa Dental en Madrid?")).toBe(true);
  });

  it("corrections are a manual decision: a corrected website inherits no evidence and cannot be the own business or a directory", async () => {
    const { id, deps } = await setup();
    const view = await extracted(id, deps);
    const delta = view.suggestions.find((s) => s.name === "Delta")!;
    expect(await acceptSuggestion(db, id, delta.id, accept("Delta", "doctoralia.es"))).toMatchObject({ ok: false, error: "validation" });
    expect(await acceptSuggestion(db, id, delta.id, accept("Sonrisas Pepe", ""))).toMatchObject({ ok: false, error: "validation" });
    const ok = await acceptSuggestion(db, id, delta.id, accept("Delta Dental", "www.delta-dental.es"));
    expect(ok.ok && ok.value).toMatchObject({ name: "Delta Dental", domain: "delta-dental.es" });
    const [row] = await db.select().from(geoCompetitorSuggestions).where(eq(geoCompetitorSuggestions.id, delta.id));
    expect(row!.acceptedInput).toMatchObject({ corrected: true, websiteStatus: "operator_provided_unverified", website: "delta-dental.es" });
    expect(row!.domain).toBe("delta.es"); // original evidence kept as history
  });

  it("rejects duplicates of registered competitors, also archived, with already_exists", async () => {
    const { id, deps } = await setup();
    await addCompetitor(db, id, { name: "Beta Dental", website: "", aliases: "" });
    const view = await extracted(id, deps);
    expect(view.suggestions.map((s) => s.name)).not.toContain("Beta Dental"); // excluded at extraction
    const alfa = view.suggestions.find((s) => s.name === "Alfa Dental")!;
    await db.update(geoCompetitors).set({ status: "archived" }).where(eq(geoCompetitors.workspaceId, id));
    expect(await acceptSuggestion(db, id, alfa.id, accept("beta dental", ""))).toMatchObject({ ok: false, error: "already_exists" });
    expect(await addCompetitor(db, id, { name: "Beta Dental", website: "", aliases: "" })).toMatchObject({ ok: true }); // manual form may re-add an archived one
  });

  it("dismissing persists host and name keys, is idempotent, and survives a new extraction", async () => {
    const { id, deps } = await setup();
    const view = await extracted(id, deps);
    const beta = view.suggestions.find((s) => s.name === "Beta Dental")!;
    expect(await dismissSuggestion(db, id, beta.id)).toMatchObject({ ok: true, value: { keys: ["host:beta.es", "name:beta dental"] } });
    expect(await dismissSuggestion(db, id, beta.id)).toMatchObject({ ok: true });
    expect(await db.select().from(geoCompetitorDismissals).where(eq(geoCompetitorDismissals.workspaceId, id))).toHaveLength(2);

    const next = await extracted(id, deps, input({ sources: "https://alfa.es/\nhttps://beta.es/", answer: "1. **Beta Dental** https://beta.es/\n2. **Alfa Dental**" }));
    expect(next.suggestions.map((s) => s.name)).toEqual(["Alfa Dental"]);
    const old = await db.select().from(geoCompetitorSuggestions).where(eq(geoCompetitorSuggestions.extractionId, view.extraction.id));
    expect(old.find((s) => s.name === "Beta Dental")!.status).toBe("dismissed");
    expect(old.filter((s) => s.name !== "Beta Dental").every((s) => s.status === "superseded")).toBe(true);
    // The manual form may still add the business; the dismissal stays.
    expect(await addCompetitor(db, id, { name: "Beta Dental", website: "beta.es", aliases: "" })).toMatchObject({ ok: true });
    expect(await db.select().from(geoCompetitorDismissals).where(eq(geoCompetitorDismissals.workspaceId, id))).toHaveLength(2);
  });

  it("a dismissed card cannot be accepted afterwards", async () => {
    const { id, deps } = await setup();
    const view = await extracted(id, deps);
    const beta = view.suggestions.find((s) => s.name === "Beta Dental")!;
    await dismissSuggestion(db, id, beta.id);
    expect(await acceptSuggestion(db, id, beta.id, accept("Beta Dental", "beta.es"))).toMatchObject({ ok: false, error: "conflict" });
    expect(await listCompetitors(db, id)).toHaveLength(0);
  });

  it("an accepted card cannot be dismissed, and a superseded card cannot be accepted", async () => {
    const { id, deps } = await setup();
    const view = await extracted(id, deps);
    const alfa = view.suggestions.find((s) => s.name === "Alfa Dental")!;
    const beta = view.suggestions.find((s) => s.name === "Beta Dental")!;
    await acceptSuggestion(db, id, alfa.id, accept());
    expect(await dismissSuggestion(db, id, alfa.id)).toMatchObject({ ok: false, error: "conflict" });
    await extracted(id, deps, input({ sources: "https://delta.es/" }));
    expect(await acceptSuggestion(db, id, beta.id, accept("Beta Dental", "beta.es"))).toMatchObject({ ok: false, error: "stale" });
    expect(await listCompetitors(db, id)).toHaveLength(1);
  });

  it("scopes every read and mutation by workspace", async () => {
    const { id, deps } = await setup();
    const other = await createWorkspace(db, { name: "Otra", website: "https://otra.es/", sector: "Clínica dental", country: "ES", city: "Madrid", services: "Implantes" });
    if (!other.ok) throw new Error("other");
    const view = await extracted(id, deps);
    const alfa = view.suggestions[0]!;
    expect(await acceptSuggestion(db, other.workspace.id, alfa.id, accept())).toMatchObject({ ok: false, error: "not_found" });
    expect(await dismissSuggestion(db, other.workspace.id, alfa.id)).toMatchObject({ ok: false, error: "not_found" });
    expect(await acceptSuggestion(db, "no-uuid", alfa.id, accept())).toMatchObject({ ok: false, error: "not_found" });
    expect(await listSuggestions(db, other.workspace.id)).toBeNull();
    const [row] = await db.select().from(geoCompetitorSuggestions).where(eq(geoCompetitorSuggestions.id, alfa.id));
    expect(row!.status).toBe("suggested");
  });

  it("rolls back the competitor when marking the card fails after the insert", async () => {
    const { id, deps } = await setup();
    const view = await extracted(id, deps);
    const alfa = view.suggestions[0]!;
    await db.execute(sql`
      create or replace function test_block_accept() returns trigger language plpgsql as $$
      begin if new.status = 'accepted' then raise exception 'induced failure'; end if; return new; end $$;
      create trigger test_block_accept before update on geo_competitor_suggestions for each row execute function test_block_accept();`);
    try {
      const error = await acceptSuggestion(db, id, alfa.id, accept()).then(() => null, (e: unknown) => e as Error & { cause?: Error });
      expect(error).not.toBeNull();
      expect(`${error!.message} ${error!.cause?.message ?? ""}`).toMatch(/induced failure/);
    } finally {
      await db.execute(sql`drop trigger if exists test_block_accept on geo_competitor_suggestions; drop function if exists test_block_accept();`);
    }
    expect(await listCompetitors(db, id)).toHaveLength(0);
    const [row] = await db.select().from(geoCompetitorSuggestions).where(eq(geoCompetitorSuggestions.id, alfa.id));
    expect(row!.status).toBe("suggested");
  });
});

describe("races (two independent connections)", () => {
  it("with four active competitors, a simultaneous manual add and acceptance create exactly one fifth", async () => {
    const { id, deps } = await setup();
    for (const n of ["Uno", "Dos", "Tres", "Cuatro"]) await addCompetitor(db, id, { name: n, website: "", aliases: "" });
    const view = await extracted(id, deps);
    const alfa = view.suggestions.find((s) => s.name === "Alfa Dental")!;
    const results = await Promise.all([acceptSuggestion(db, id, alfa.id, accept()), addCompetitor(second.db, id, { name: "Manual", website: "", aliases: "" })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.error === "limit")).toHaveLength(1);
    expect(await listCompetitors(db, id)).toHaveLength(MAX_ACTIVE_COMPETITORS);
  });

  it("two simultaneous acceptances of the same card create one competitor; accept vs dismiss lets one win", async () => {
    const { id, deps } = await setup();
    const view = await extracted(id, deps);
    const [alfa, beta] = view.suggestions;
    const both = await Promise.all([acceptSuggestion(db, id, alfa!.id, accept()), acceptSuggestion(second.db, id, alfa!.id, accept())]);
    expect(both.every((r) => r.ok)).toBe(true);
    expect(new Set(both.map((r) => r.ok && r.value.id)).size).toBe(1);
    expect(await db.select().from(geoCompetitors).where(and(eq(geoCompetitors.workspaceId, id), eq(geoCompetitors.name, "Alfa Dental")))).toHaveLength(1);

    const race = await Promise.all([acceptSuggestion(db, id, beta!.id, accept("Beta Dental", "beta.es")), dismissSuggestion(second.db, id, beta!.id)]);
    expect(race.filter((r) => r.ok)).toHaveLength(1);
    const [row] = await db.select().from(geoCompetitorSuggestions).where(eq(geoCompetitorSuggestions.id, beta!.id));
    expect(["accepted", "dismissed"]).toContain(row!.status);
    expect((await listCompetitors(db, id)).length).toBe(row!.status === "accepted" ? 2 : 1);
  });

  it("two overlapping extractions: the loser gets conflict and does not overwrite the newer result", async () => {
    const { id } = await setup();
    const a = gatedFetcher(ROUTES);
    const b = gatedFetcher(ROUTES);
    const pa = extractCompetitors(db, id, input({ sources: "https://alfa.es/" }), { fetcher: a.fetcher });
    const pb = extractCompetitors(second.db, id, input({ sources: "https://beta.es/" }), { fetcher: b.fetcher });
    await vi.waitFor(() => expect(a.started() + b.started()).toBeGreaterThan(0));
    a.release();
    const ra = await pa;
    b.release();
    const rb = await pb;
    expect(ra).toMatchObject({ ok: true });
    expect(rb).toMatchObject({ ok: false, error: "conflict" });
    const current = await listSuggestions(db, id);
    expect(current!.extraction.id).toBe(ra.ok ? ra.value.extraction.id : null);
    expect(await db.select().from(geoCompetitorExtractions).where(eq(geoCompetitorExtractions.workspaceId, id))).toHaveLength(1);
  });

  it("two identical extractions started together end with one row and the same id", async () => {
    const { id } = await setup();
    const a = gatedFetcher(ROUTES);
    const b = gatedFetcher(ROUTES);
    const pa = extractCompetitors(db, id, input(), { fetcher: a.fetcher });
    const pb = extractCompetitors(second.db, id, input(), { fetcher: b.fetcher });
    await vi.waitFor(() => expect(a.started() + b.started()).toBeGreaterThan(0));
    a.release();
    b.release();
    const [ra, rb] = await Promise.all([pa, pb]);
    expect(ra.ok && rb.ok).toBe(true);
    if (!ra.ok || !rb.ok) return;
    expect(ra.value.extraction.id).toBe(rb.value.extraction.id);
    expect([ra.value.repeated, rb.value.repeated].filter(Boolean)).toHaveLength(1);
    expect(await db.select().from(geoCompetitorExtractions).where(eq(geoCompetitorExtractions.workspaceId, id))).toHaveLength(1);
  });

  it("editing the company record during the external reads makes the extraction conflict", async () => {
    const { id } = await setup();
    const g = gatedFetcher(ROUTES);
    const pending = extractCompetitors(db, id, input({ sources: "https://alfa.es/" }), { fetcher: g.fetcher });
    await vi.waitFor(() => expect(g.started()).toBeGreaterThan(0));
    await updateWorkspace(second.db, id, { name: "Clínica Dental García", website: "https://www.clinicagarcia.es/", sector: "Clínica dental", country: "ES", city: "Getafe", services: "Implantes" });
    g.release();
    expect(await pending).toMatchObject({ ok: false, error: "conflict" });
    expect(await listSuggestions(db, id)).toBeNull();
  });

  it("a decision taken during the external reads is not resurrected by the publication", async () => {
    const { id, deps } = await setup();
    const first = await extracted(id, deps);
    const beta = first.suggestions.find((s) => s.name === "Beta Dental")!;
    const g = gatedFetcher(ROUTES);
    const pending = extractCompetitors(db, id, input({ sources: "https://beta.es/\nhttps://alfa.es/" }), { fetcher: g.fetcher });
    await vi.waitFor(() => expect(g.started()).toBeGreaterThan(0));
    await dismissSuggestion(second.db, id, beta.id);
    g.release();
    const result = await pending;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.suggestions.map((s) => s.name)).not.toContain("Beta Dental");
    const [row] = await db.select().from(geoCompetitorSuggestions).where(eq(geoCompetitorSuggestions.id, beta.id));
    expect(row!.status).toBe("dismissed");
  });
});

describe("page reads", () => {
  it("listSuggestions serves the latest extraction in rule order without any network dependency", async () => {
    const { id, deps } = await setup();
    const view = await extracted(id, deps);
    const listed = await listSuggestions(db, id);
    expect(listed!.extraction.id).toBe(view.extraction.id);
    expect(listed!.suggestions.map((s) => s.name)).toEqual(view.suggestions.map((s) => s.name));
    expect(listSuggestions.length).toBe(2); // (db, workspaceId): no fetcher can reach it
    expect(acceptSuggestion.length).toBe(4);
    expect(dismissSuggestion.length).toBe(3);
  });
});

describe("limits and empty results", () => {
  it("reads at most 5 hosts at a time with one shared budget of 25 attempts", async () => {
    const { id } = await setup();
    let inFlight = 0;
    let maxInFlight = 0;
    let budgetSeen: { maxRequests: number } | null = null;
    const fetcher: SafeFetcher = {
      async fetch(url, _limits, budget) {
        budgetSeen = budget;
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 20));
        inFlight -= 1;
        budget.requests += 1;
        return { ok: false, failure: { kind: "dns", message: "fake", url } };
      },
    };
    const sources = Array.from({ length: 20 }, (_, i) => `https://host${i}.es/`).join("\n");
    const result = await extractCompetitors(db, id, input({ answer: "Sin nombres en lista.", sources }), { fetcher });
    expect(result.ok).toBe(true);
    expect(maxInFlight).toBeLessThanOrEqual(5);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(budgetSeen).toMatchObject({ maxRequests: 25 });
  });

  it("a page whose read throws leaves that host unverified and does not fail the extraction", async () => {
    const { id } = await setup();
    const inner = fakeFetcher(ROUTES);
    const fetcher: SafeFetcher = {
      fetch(url, limits, budget) {
        if (url === "https://alfa.es/") throw new Error("parser exploded");
        return inner.fetch(url, limits, budget);
      },
    };
    const result = await extractCompetitors(db, id, input({ sources: "https://alfa.es/\nhttps://beta.es/" }), { fetcher });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Alfa is explicitly linked in the answer, so it keeps its host with the degraded status.
    expect(result.value.suggestions.find((s) => s.name === "Alfa Dental")).toMatchObject({ domain: "alfa.es", webStatus: "unverified" });
    expect(result.value.suggestions.find((s) => s.name === "Beta Dental")?.webStatus).toBe("reachable");
  });

  it("publishes an explained empty extraction when nothing usable is found", async () => {
    const { id, deps, fetcher } = await setup();
    const result = await extractCompetitors(db, id, input({ answer: "No conozco clínicas concretas, consulta un directorio.", sources: "" }), deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.suggestions).toEqual([]);
    expect(result.value.extraction.warnings.join(" ")).toMatch(/no contiene nombres/);
    expect((fetcher as ReturnType<typeof fakeFetcher>).calls).toEqual([]);
    expect((await listSuggestions(db, id))!.extraction.id).toBe(result.value.extraction.id);
  });
});
