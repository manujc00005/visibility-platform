import { describe, expect, it } from "vitest";
import { searchAnswer, summarizeRankingCard, summarizeTechnicalCard } from "@/modules/overview/google";
import { summarizeSeo } from "@/modules/overview/seo";
import type { SearchConsoleSnapshot } from "@/modules/search-console/schema";
import { summarizeSearchConsole } from "@/modules/search-console/summary";
import { audit, daysAgo, facts, finding, NOW } from "./fixtures";

/** The two Google cards (feature 023, D001): Search Console without a verdict (014 D002) and the technical audit, each with its own notices and source. */

const READY = { state: "ready" as const, clientEmail: "visibility@demo.iam.gserviceaccount.com" };
const NOT_CONFIGURED = { state: "not_configured" as const };
const zero = { clicks: 0, impressions: 0, ctr: 0, position: 0 };

function snapshot(overrides: Partial<SearchConsoleSnapshot> = {}): SearchConsoleSnapshot {
  return {
    id: "s1",
    workspaceId: "w1",
    status: "completed",
    provider: "google_gsc",
    captureCondition: "owner_api",
    property: "sc-domain:olessium.com",
    currentStart: "2026-09-27",
    currentEnd: "2026-10-24",
    previousStart: "2026-08-30",
    previousEnd: "2026-09-26",
    totals: { clicks: 12, impressions: 400, ctr: 0.03, position: 9.4 },
    previousTotals: { clicks: 8, impressions: 390, ctr: 0.0205, position: 12.1 },
    queries: [],
    pages: [],
    segments: null,
    keywordSeries: null,
    errorKind: null,
    errorMessage: null,
    accessibleProperties: null,
    createdAt: daysAgo(1),
    ...overrides,
  };
}

const gscOf = (latest: SearchConsoleSnapshot | null, config: typeof READY | typeof NOT_CONFIGURED = READY, locale?: "en") =>
  summarizeSearchConsole({ latest, latestCompleted: latest?.status === "completed" ? latest : null }, config, "olessium.com", locale);

/** A clean home page audited yesterday: the technical block says "Bien". */
const cleanAudit = audit({ at: daysAgo(1) });
const seoClean = (locale?: "en") => summarizeSeo([cleanAudit], { [cleanAudit.id]: [] }, NOW, locale);

const both = (gsc: ReturnType<typeof gscOf>, seo: ReturnType<typeof seoClean>, now: Date, locale?: "en") => ({
  ranking: summarizeRankingCard(gsc, now, locale),
  technical: summarizeTechnicalCard(seo, locale),
});

describe("summarizeRankingCard: Search Console states (014 AC-002, AC-003)", () => {
  it("puts clicks and impressions first when there are impressions, with the clicks change", () => {
    const g = both(gscOf(snapshot()), seoClean(), NOW);
    expect(g.ranking.status).toEqual({ tone: "neutral", label: "Medido" });
    expect(g.ranking.headline).toEqual({ kind: "figures", clicks: "12", clicksUnit: "clics", impressions: "400", impressionsUnit: "impresiones" });
    expect(g.ranking.change).toEqual({ direction: "better", text: "Antes: 8 clics (+50 %)" });
    expect(g.ranking.changeNote).toBeNull();
    expect(g.ranking.line).toBe("Últimos 28 días: del 27 sept 2026 al 24 oct 2026.");
  });

  it("never approves rankings from a clean home page: zero impressions is «Sin impresiones» and the audit verdict stays in its block (AC-003)", () => {
    const g = both(gscOf(snapshot({ totals: zero, previousTotals: zero })), seoClean(), NOW);
    expect(g.ranking.state).toBe("empty");
    expect(g.ranking.status).toEqual({ tone: "neutral", label: "Sin impresiones" });
    expect(g.ranking.headline).toEqual({ kind: "text", text: "Sin impresiones registradas en este periodo" });
    expect(g.ranking.change).toBeNull();
    expect(g.ranking.line).toMatch(/^Últimos 28 días/);
    expect(g.technical.status).toEqual({ tone: "good", label: "Bien" });
    expect(g.technical.counts).toEqual({ critical: 0, warning: 0 });
  });

  it("is pending without a capture, not set up without a credential, and an error after a failed read", () => {
    const noData = both(gscOf(null), seoClean(), NOW);
    expect(noData.ranking.status).toEqual({ tone: "neutral", label: "Sin datos" });
    expect(noData.ranking.headline).toEqual({ kind: "text", text: "Posicionamiento pendiente de medir" });
    expect(noData.ranking.line).toBe("Todavía no se han traído datos de Search Console.");

    const notConfigured = both(gscOf(null, NOT_CONFIGURED), seoClean(), NOW);
    expect(notConfigured.ranking.status).toEqual({ tone: "neutral", label: "Sin configurar" });
    expect(notConfigured.ranking.headline).toEqual({ kind: "text", text: "Posicionamiento pendiente de medir" });
    expect(notConfigured.ranking.line).toBe("Falta conectar Google Search Console.");

    const failed = snapshot({ status: "failed", totals: null, previousTotals: null, errorKind: "no_access", createdAt: daysAgo(0) });
    const error = both(gscOf(failed), seoClean(), NOW);
    expect(error.ranking.status).toEqual({ tone: "bad", label: "Error" });
    expect(error.ranking.headline).toEqual({ kind: "text", text: "Sin resultado" });
    expect(error.ranking.line).toBe("No se pudieron leer los datos de Search Console.");
    expect(error.ranking.source).toBe("Search Console · sin resultado");
  });

  it("explains a missing previous period instead of a change", () => {
    const g = both(gscOf(snapshot({ previousTotals: zero })), seoClean(), NOW);
    expect(g.ranking.change).toBeNull();
    expect(g.ranking.changeNote).toBe("Sin datos del periodo anterior");
  });
});

describe("summarizeTechnicalCard and the notices of each card (014 AC-002, AC-004)", () => {
  it("keeps the audit severity, the partial suffix and the empty states of the old card", () => {
    const bad = audit({ at: daysAgo(1) });
    const g = both(gscOf(snapshot()), summarizeSeo([bad], { [bad.id]: [finding({ severity: "critical", category: "indexability" })] }, NOW), NOW);
    expect(g.technical.status).toEqual({ tone: "bad", label: "Mal" });
    expect(g.technical.counts).toEqual({ critical: 1, warning: 0 });

    const unread = audit({ at: daysAgo(1), facts: facts({ readable: false }) });
    const partial = both(gscOf(snapshot()), summarizeSeo([unread], { [unread.id]: [finding({ severity: "critical", category: "access" })] }, NOW), NOW);
    expect(partial.technical.status.label).toBe("Mal (parcial)");

    const none = both(gscOf(snapshot()), summarizeSeo([], {}, NOW), NOW);
    expect(none.technical.status).toEqual({ tone: "neutral", label: "Sin datos" });
    expect(none.technical.counts).toBeNull();
    expect(none.technical.source).toBe("Auditoría técnica de la portada · sin auditar");
    expect(none.ranking.source).toBe(`Search Console · ${new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" }).format(daysAgo(1))}`);
  });

  it("puts each notice on the card it is about, so it needs no source prefix (023 D001)", () => {
    const oldCapture = snapshot({ createdAt: daysAgo(40) });
    const oldAudit = audit({ at: daysAgo(35) });
    const running = audit({ at: daysAgo(0), status: "running" });
    const seo = summarizeSeo([oldAudit, running], { [oldAudit.id]: [] }, NOW);
    const g = both(gscOf(oldCapture), seo, NOW);
    expect(g.ranking.notices).toEqual([{ kind: "stale", text: "Datos de hace 40 días" }]);
    expect(g.technical.notices).toEqual([
      { kind: "running", text: "Actualizando: hay una auditoría en curso." },
      { kind: "stale", text: "Datos de hace 35 días" },
    ]);
  });

  it("reports a failed update that kept the previous capture", () => {
    const good = snapshot();
    const failed = snapshot({ id: "f1", status: "failed", totals: null, previousTotals: null, errorKind: "quota_exceeded", createdAt: daysAgo(0) });
    const gsc = summarizeSearchConsole({ latest: failed, latestCompleted: good }, READY, "olessium.com");
    const g = both(gsc, seoClean(), NOW);
    expect(g.ranking.state).toBe("ok");
    expect(g.ranking.notices).toEqual([{ kind: "failed", text: "El último intento de actualización falló; se muestra la captura anterior." }]);
  });

  it("translates every branch into English", () => {
    const g = both(gscOf(snapshot(), READY, "en"), seoClean("en"), NOW, "en");
    expect(g.ranking.status.label).toBe("Measured");
    expect(g.ranking.headline).toMatchObject({ kind: "figures", clicksUnit: "clicks", impressionsUnit: "impressions" });
    expect(g.ranking.line).toBe("Last 28 days: from 27 Sept 2026 to 24 Oct 2026.");
    expect(g.technical).toMatchObject({ status: { label: "Good" }, source: expect.stringMatching(/^Technical audit of the home page · /) });
    const empty = both(gscOf(snapshot({ totals: zero, previousTotals: zero }), READY, "en"), seoClean("en"), NOW, "en");
    expect(empty.ranking.status.label).toBe("No impressions");
    expect(empty.ranking.headline).toEqual({ kind: "text", text: "No impressions recorded in this period" });
    expect(both(gscOf(null, NOT_CONFIGURED, "en"), seoClean("en"), NOW, "en").ranking).toMatchObject({ status: { label: "Not set up" }, line: "Google Search Console is not connected." });
  });
});

describe("Google cards: remaining states and edge cases (014 review DOM-06)", () => {
  const INVALID = { state: "invalid" as const, reason: "not_json" as const };
  const gscWith = (latest: SearchConsoleSnapshot | null, latestCompleted: SearchConsoleSnapshot | null, config: Parameters<typeof summarizeSearchConsole>[1] = READY) =>
    summarizeSearchConsole({ latest, latestCompleted }, config, "olessium.com");

  it("treats an unusable credential as not set up, but keeps a stored good capture as measured", () => {
    const invalid = both(gscWith(null, null, INVALID), seoClean(), NOW);
    expect(invalid.ranking.status).toEqual({ tone: "neutral", label: "Sin configurar" });
    expect(invalid.ranking.line).toBe("Falta conectar Google Search Console.");
    const stored = both(gscWith(snapshot(), snapshot(), INVALID), seoClean(), NOW);
    expect(stored.ranking.state).toBe("ok");
    expect(stored.ranking.headline).toMatchObject({ kind: "figures", clicks: "12" });
    expect(stored.ranking.notices).toEqual([]);
  });

  it("keeps the empty state with the failed-attempt notice, and a drop to zero as figures with a worse change", () => {
    const zeros = snapshot({ totals: zero, previousTotals: zero });
    const failed = snapshot({ id: "f1", status: "failed", totals: null, previousTotals: null, errorKind: "error", createdAt: daysAgo(0) });
    const empty = both(gscWith(failed, zeros), seoClean(), NOW);
    expect(empty.ranking.state).toBe("empty");
    expect(empty.ranking.notices).toEqual([{ kind: "failed", text: "El último intento de actualización falló; se muestra la captura anterior." }]);
    const drop = both(gscOf(snapshot({ totals: zero })), seoClean(), NOW);
    expect(drop.ranking.state).toBe("ok");
    expect(drop.ranking.headline).toEqual({ kind: "figures", clicks: "0", clicksUnit: "clics", impressions: "0", impressionsUnit: "impresiones" });
    expect(drop.ranking.change?.direction).toBe("worse");
  });

  it("gives an error no notices, and uses singular units for one click and one impression", () => {
    const failed = snapshot({ status: "failed", totals: null, previousTotals: null, errorKind: "error", createdAt: daysAgo(0) });
    expect(both(gscOf(failed), seoClean(), NOW).ranking.notices).toEqual([]);
    const one = both(gscOf(snapshot({ totals: { clicks: 1, impressions: 1, ctr: 1, position: 1 } })), seoClean(), NOW);
    expect(one.ranking.headline).toMatchObject({ clicksUnit: "clic", impressionsUnit: "impresión" });
    const oneEn = both(gscOf(snapshot({ totals: { clicks: 1, impressions: 1, ctr: 1, position: 1 } }), READY, "en"), seoClean("en"), NOW, "en");
    expect(oneEn.ranking.headline).toMatchObject({ clicksUnit: "click", impressionsUnit: "impression" });
  });

  it("explains a technical block that is analysing or failed without a prior result", () => {
    const running = audit({ at: daysAgo(0), status: "running" });
    const analyzing = both(gscOf(snapshot()), summarizeSeo([running], {}, NOW), NOW);
    expect(analyzing.technical).toMatchObject({ status: { tone: "neutral", label: "Analizando" }, counts: null });
    expect(analyzing.technical.source).toBe("Auditoría técnica de la portada · sin resultado");
    const failed = audit({ at: daysAgo(0), status: "failed" });
    const error = both(gscOf(snapshot()), summarizeSeo([failed], {}, NOW), NOW);
    expect(error.technical).toMatchObject({ status: { tone: "bad", label: "Error" }, counts: null });
    expect(error.technical.source).toBe("Auditoría técnica de la portada · sin resultado");
  });
});

describe("searchAnswer: the sentence that opens the Google page (014 D002: words, no verdict)", () => {
  it("says both directions, joined by «pero» when they go opposite ways", () => {
    expect(searchAnswer(gscOf(snapshot()))).toBe(
      "Google te mostró más o menos las mismas veces que en los 28 días anteriores y recibiste más visitas desde Google.",
    );
    const down = snapshot({ totals: { clicks: 424, impressions: 4460, ctr: 0.095, position: 4.4 }, previousTotals: { clicks: 511, impressions: 7422, ctr: 0.069, position: 6.2 } });
    expect(searchAnswer(gscOf(down))).toBe("Google te mostró menos veces que en los 28 días anteriores y recibiste menos visitas desde Google.");
    const mixed = snapshot({ totals: { clicks: 20, impressions: 300, ctr: 0.067, position: 8 }, previousTotals: { clicks: 10, impressions: 400, ctr: 0.025, position: 9 } });
    expect(searchAnswer(gscOf(mixed))).toBe("Google te mostró menos veces que en los 28 días anteriores, pero recibiste más visitas desde Google.");
    expect(searchAnswer(gscOf(mixed), "en")).toBe("Google showed you less often than in the previous 28 days, but you got more visits from Google.");
  });

  it("claims no direction without a previous period to compare against", () => {
    const fresh = snapshot({ previousTotals: zero });
    expect(searchAnswer(gscOf(fresh))).toBe(
      "Ya sabemos cuántas veces te muestra Google, pero no hay datos de los 28 días anteriores para saber si vas a más o a menos.",
    );
  });

  it("states the status, not an instruction, when there are no figures", () => {
    expect(searchAnswer(gscOf(snapshot({ totals: zero, previousTotals: zero })))).toBe("En los últimos 56 días Google no te ha mostrado en ninguna búsqueda.");
    expect(searchAnswer(gscOf(null))).toMatch(/^Todavía no hemos traído/);
    expect(searchAnswer(gscOf(null, NOT_CONFIGURED))).toBe("Search Console no está conectado, así que aún no sabemos cuántas veces te muestra Google.");
    const failed = snapshot({ status: "failed", totals: null, previousTotals: null, errorKind: "api_disabled" });
    expect(searchAnswer(gscOf(failed))).toBe("No pudimos leer Search Console, así que aún no sabemos cuántas veces te muestra Google.");
    expect(searchAnswer(gscOf(null, NOT_CONFIGURED, "en"), "en")).toBe("Search Console is not connected, so we do not know yet how often Google shows you.");
  });
});
