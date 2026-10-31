import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { geoBusinessProfiles, geoCompetitorExtractions, geoCompetitorSuggestions, geoCompetitors, workspaces } from "@/db/schema";
import type { FetchLimits, SafeFetcher } from "@/modules/audits/fetcher/safe-fetch";
import { getBusinessProfile, proposeBusinessProfile, saveBusinessProfile } from "@/modules/geo/competitors/profile-service";
import { acceptSuggestion, extractCompetitors, listSuggestions } from "@/modules/geo/competitors/service";
import { addCompetitor } from "@/modules/geo/service";
import { createWorkspace } from "@/modules/workspaces/service";
import { fakeFetcher, type FakeRoute } from "../support/fake-fetcher";
import { createTestDb } from "./db";

const { pool, db } = createTestDb();
afterAll(() => pool.end());
beforeEach(async () => {
  await db.delete(workspaces);
});

const PAGE = `<!doctype html><html><head><title>Acme</title><meta name="description" content="CRM para pymes"></head><body><h2>Automatización</h2></body></html>`;
const profile = { summary: "CRM para pymes", offerings: "Automatización", customerType: "b2b", targetCustomer: "Pymes", zoneRelevance: "international", servedArea: "", competitorKinds: ["direct", "indirect"] };

async function workspace() {
  const ws = await createWorkspace(db, { name: "Empresa", website: "https://www.empresa.es/", sector: "Agencia", country: "ES", services: "CRM" });
  if (!ws.ok) throw new Error("workspace");
  return ws.workspace.id;
}

const saved = async (id: string, over = {}) => {
  const result = await saveBusinessProfile(db, id, { ...profile, ...over });
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

const routes: Record<string, FakeRoute> = {
  "https://www.empresa.es/": { status: 200, contentType: "text/html", body: PAGE },
  "https://rival.es/": { status: 200, contentType: "text/html", body: "<title>Rival CRM</title>" },
  "https://sustituto.es/": { status: 200, contentType: "text/html", body: "<title>Hoja</title>" },
};

const answer = ["COMPETIDOR | Rival | https://rival.es | directo | España | Hace lo mismo", "COMPETIDOR | Hoja | https://sustituto.es | sustituto | España | Alternativa"].join("\n");

describe("saving the profile (AC-001, AC-012)", () => {
  it("creates one row, updates it on repeat and writes nothing when invalid", async () => {
    const id = await workspace();
    const first = await saved(id);
    const second = await saved(id, { summary: "Otro resumen" });
    expect(second.createdAt).toEqual(first.createdAt);
    expect(await db.select().from(geoBusinessProfiles)).toHaveLength(1);
    expect((await getBusinessProfile(db, id))?.summary).toBe("Otro resumen");
    expect(await saveBusinessProfile(db, id, { ...profile, summary: "" })).toMatchObject({ ok: false, error: "validation" });
    expect((await getBusinessProfile(db, id))?.summary).toBe("Otro resumen");
  });

  it("answers not_found for an unknown company", async () => {
    expect(await saveBusinessProfile(db, "00000000-0000-4000-8000-000000000000", profile)).toMatchObject({ ok: false, error: "not_found" });
  });

  it("cascades with the company", async () => {
    const id = await workspace();
    await saved(id);
    await db.delete(workspaces).where(eq(workspaces.id, id));
    expect(await db.select().from(geoBusinessProfiles)).toHaveLength(0);
  });

  it.each([
    ["geo_business_profiles_summary_length", { summary: " " }],
    ["geo_business_profiles_offerings_count", { offerings: Array.from({ length: 11 }, (_, i) => `${i}`) }],
    ["geo_business_profiles_offering_length", { offerings: ["o".repeat(81)] }],
    ["geo_business_profiles_target_length", { targetCustomer: "" }],
    ["geo_business_profiles_area_required", { zoneRelevance: "local", servedArea: null }],
    ["geo_business_profiles_kinds_valid", { competitorKinds: [] }],
    ["geo_business_profiles_kinds_valid", { competitorKinds: ["cliente"] }],
    ["geo_business_profiles_customer_type_valid", { customerType: "x" }],
    ["geo_business_profiles_zone_valid", { zoneRelevance: "x" }],
  ])("the database refuses %s", async (constraint, over) => {
    const id = await workspace();
    const row = { workspaceId: id, summary: "s", offerings: [], customerType: "b2b", targetCustomer: "t", zoneRelevance: "national", servedArea: null, competitorKinds: ["direct"], ...over };
    await expect(db.insert(geoBusinessProfiles).values(row as typeof geoBusinessProfiles.$inferInsert)).rejects.toMatchObject({ cause: { constraint } });
  });

  it("the database refuses an unknown competitor kind", async () => {
    const id = await workspace();
    await expect(db.insert(geoCompetitors).values({ workspaceId: id, name: "x", kind: "otro" as "direct" })).rejects.toMatchObject({ cause: { constraint: "geo_competitors_kind_valid" } });
  });
});

describe("the proposal (AC-002, AC-004)", () => {
  it("reads only the home page and stores nothing", async () => {
    const id = await workspace();
    const fetcher = fakeFetcher(routes);
    const result = await proposeBusinessProfile(db, id, { fetcher });
    expect(result).toMatchObject({ ok: true, value: { draft: { summary: "CRM para pymes", customerType: "b2b", offerings: ["Automatización"] } } });
    expect(fetcher.calls).toEqual(["https://www.empresa.es/"]);
    expect(await getBusinessProfile(db, id)).toBeNull();
  });

  it.each<[string, FakeRoute]>([
    ["unreachable", { fail: "network" }],
    ["private destination", { fail: "blocked_destination" }],
    ["error page", { status: 500, contentType: "text/html", body: PAGE }],
    ["not html", { status: 200, contentType: "application/pdf", body: "x" }],
  ])("explains a page it cannot use: %s", async (_name, route) => {
    const id = await workspace();
    expect(await proposeBusinessProfile(db, id, { fetcher: fakeFetcher({ "https://www.empresa.es/": route }) })).toEqual({ ok: false, error: "unreadable" });
  });

  it("never asks for a host outside the company's domain", async () => {
    const id = await workspace();
    let allow: FetchLimits["allowRequest"];
    const fetcher: SafeFetcher = {
      async fetch(url, limits) {
        allow = limits.allowRequest;
        return { ok: false, failure: { kind: "network", message: "x", url } };
      },
    };
    await proposeBusinessProfile(db, id, { fetcher });
    expect(await allow!(new URL("https://www.empresa.es/es"))).toBe(true);
    expect(await allow!(new URL("https://empresa.es/"))).toBe(true);
    expect(await allow!(new URL("https://empresa.es.mal.com/"))).toBe(false);
    expect(await allow!(new URL("http://empresa.es/"))).toBe(false);
  });
});

describe("extraction with a profile (AC-009, AC-010)", () => {
  const raw = { question: "Pregunta larga ".repeat(40).slice(0, 600), answer, sources: "" };

  it("freezes the profile, filters kinds and stores the declared one", async () => {
    const id = await workspace();
    await saved(id);
    const result = await extractCompetitors(db, id, raw, { fetcher: fakeFetcher(routes) });
    if (!result.ok) throw new Error(result.error);
    expect(result.value.extraction.contextSnapshot.profile).toMatchObject({ zoneRelevance: "international", competitorKinds: ["direct", "indirect"] });
    expect(result.value.suggestions.map((s) => [s.name, s.competitorKind])).toEqual([["Rival", "direct"]]);
    expect(result.value.suggestions[0]!.factors.zone.state).toBe("not_applicable");
    expect(result.value.extraction.warnings.join(" ")).toContain("tipos de competidor que no buscas");
  });

  it("counts a question with CRLF line ends as the operator wrote it", async () => {
    const id = await workspace();
    const question = "x\r\n".repeat(660) + "y".repeat(600);
    expect(question.length).toBeGreaterThan(2_000);
    expect(await extractCompetitors(db, id, { ...raw, question }, { fetcher: fakeFetcher(routes) })).toMatchObject({ ok: true });
  });

  it("changing the profile changes the fingerprint", async () => {
    const id = await workspace();
    await saved(id);
    const deps = { fetcher: fakeFetcher(routes) };
    await extractCompetitors(db, id, raw, deps);
    await saved(id, { targetCustomer: "Otras pymes" });
    expect(await extractCompetitors(db, id, raw, deps)).toMatchObject({ ok: true, value: { repeated: false } });
    expect(await db.select().from(geoCompetitorExtractions)).toHaveLength(2);
  });

  it("a profile edited during the network reads as a conflict and keeps the previous result", async () => {
    const id = await workspace();
    await saved(id);
    const inner = fakeFetcher(routes);
    const fetcher: SafeFetcher = {
      async fetch(url, limits, budget) {
        await saved(id, { summary: "Editado" });
        return inner.fetch(url, limits, budget);
      },
    };
    expect(await extractCompetitors(db, id, raw, { fetcher })).toMatchObject({ ok: false, error: "conflict" });
    expect(await db.select().from(geoCompetitorSuggestions)).toHaveLength(0);
  });

  it("accepting keeps the corrected kind, the declared one, or none", async () => {
    const id = await workspace();
    await extractCompetitors(db, id, { ...raw, answer }, { fetcher: fakeFetcher(routes) });
    const stored = (await listSuggestions(db, id))!.suggestions;
    const rival = stored.find((s) => s.name === "Rival")!;
    const hoja = stored.find((s) => s.name === "Hoja")!;
    const accepted = await acceptSuggestion(db, id, rival.id, { name: "Rival", website: "rival.es", reviewConfirmed: "true", kind: "indirect" });
    expect(accepted).toMatchObject({ ok: true, value: { kind: "indirect" } });
    expect(await acceptSuggestion(db, id, hoja.id, { name: "Hoja", website: "sustituto.es", reviewConfirmed: "true", kind: "cliente" })).toMatchObject({ ok: false, error: "validation" });
    expect(await acceptSuggestion(db, id, hoja.id, { name: "Hoja", website: "sustituto.es", reviewConfirmed: "true" })).toMatchObject({ ok: true, value: { kind: "substitute" } });
  });

  it("a manual competitor has no kind", async () => {
    const id = await workspace();
    expect(await addCompetitor(db, id, { name: "Manual", website: "manual.es" })).toMatchObject({ ok: true, value: { kind: null } });
  });

  it("an extraction stored before profiles still reads", async () => {
    const id = await workspace();
    const result = await extractCompetitors(db, id, raw, { fetcher: fakeFetcher(routes) });
    if (!result.ok) throw new Error(result.error);
    const legacy = { ...result.value.extraction.contextSnapshot };
    delete legacy.profile;
    await db.update(geoCompetitorExtractions).set({ contextSnapshot: legacy }).where(eq(geoCompetitorExtractions.id, result.value.extraction.id));
    expect((await listSuggestions(db, id))?.extraction.contextSnapshot.profile).toBeUndefined();
  });
});
