import { describe, expect, it } from "vitest";
import { summarizeGoogleCard } from "@/modules/overview/google";
import { summarizeSeo } from "@/modules/overview/seo";
import type { SearchConsoleSnapshot } from "@/modules/search-console/schema";
import { summarizeSearchConsole } from "@/modules/search-console/summary";
import { audit, daysAgo, facts, finding, NOW } from "./fixtures";

/** The «Visibilidad en Google» card (feature 014): Search Console decides the status; the audit is a block apart. */

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

describe("summarizeGoogleCard: ranking states (AC-002, AC-003)", () => {
  it("puts clicks and impressions first when there are impressions, with the clicks change", () => {
    const g = summarizeGoogleCard(gscOf(snapshot()), seoClean(), NOW);
    expect(g.ranking.status).toEqual({ tone: "neutral", label: "Medido" });
    expect(g.ranking.headline).toEqual({ kind: "figures", clicks: "12", clicksUnit: "clics", impressions: "400", impressionsUnit: "impresiones" });
    expect(g.ranking.change).toEqual({ direction: "better", text: "Antes: 8 clics (+50 %)" });
    expect(g.ranking.changeNote).toBeNull();
    expect(g.ranking.line).toBe("Últimos 28 días: del 27 sept 2026 al 24 oct 2026.");
  });

  it("never approves rankings from a clean home page: zero impressions is «Sin impresiones» and the audit verdict stays in its block (AC-003)", () => {
    const g = summarizeGoogleCard(gscOf(snapshot({ totals: zero, previousTotals: zero })), seoClean(), NOW);
    expect(g.ranking.state).toBe("empty");
    expect(g.ranking.status).toEqual({ tone: "neutral", label: "Sin impresiones" });
    expect(g.ranking.headline).toEqual({ kind: "text", text: "Sin impresiones registradas en este periodo" });
    expect(g.ranking.change).toBeNull();
    expect(g.ranking.line).toMatch(/^Últimos 28 días/);
    expect(g.technical.status).toEqual({ tone: "good", label: "Bien" });
    expect(g.technical.counts).toEqual({ critical: 0, warning: 0 });
    expect(g.technical.title).toBe("Tu web, vista por Google");
  });

  it("is pending without a capture, not set up without a credential, and an error after a failed read", () => {
    const noData = summarizeGoogleCard(gscOf(null), seoClean(), NOW);
    expect(noData.ranking.status).toEqual({ tone: "neutral", label: "Sin datos" });
    expect(noData.ranking.headline).toEqual({ kind: "text", text: "Posicionamiento pendiente de medir" });
    expect(noData.ranking.line).toBe("Todavía no se han traído datos de Search Console.");

    const notConfigured = summarizeGoogleCard(gscOf(null, NOT_CONFIGURED), seoClean(), NOW);
    expect(notConfigured.ranking.status).toEqual({ tone: "neutral", label: "Sin configurar" });
    expect(notConfigured.ranking.headline).toEqual({ kind: "text", text: "Posicionamiento pendiente de medir" });
    expect(notConfigured.ranking.line).toBe("Falta conectar Google Search Console.");

    const failed = snapshot({ status: "failed", totals: null, previousTotals: null, errorKind: "no_access", createdAt: daysAgo(0) });
    const error = summarizeGoogleCard(gscOf(failed), seoClean(), NOW);
    expect(error.ranking.status).toEqual({ tone: "bad", label: "Error" });
    expect(error.ranking.headline).toEqual({ kind: "text", text: "Sin resultado" });
    expect(error.ranking.line).toBe("No se pudieron leer los datos de Search Console.");
    expect(error.source).toBe("Search Console · sin resultado · Auditoría técnica · " + error.source.split(" · ").at(-1));
  });

  it("explains a missing previous period instead of a change", () => {
    const g = summarizeGoogleCard(gscOf(snapshot({ previousTotals: zero })), seoClean(), NOW);
    expect(g.ranking.change).toBeNull();
    expect(g.ranking.changeNote).toBe("Sin datos del periodo anterior");
  });
});

describe("summarizeGoogleCard: technical block and notices (AC-002, AC-004)", () => {
  it("keeps the audit severity, the partial suffix and the empty states of the old card", () => {
    const bad = audit({ at: daysAgo(1) });
    const g = summarizeGoogleCard(gscOf(snapshot()), summarizeSeo([bad], { [bad.id]: [finding({ severity: "critical", category: "indexability" })] }, NOW), NOW);
    expect(g.technical.status).toEqual({ tone: "bad", label: "Mal" });
    expect(g.technical.counts).toEqual({ critical: 1, warning: 0 });

    const unread = audit({ at: daysAgo(1), facts: facts({ readable: false }) });
    const partial = summarizeGoogleCard(gscOf(snapshot()), summarizeSeo([unread], { [unread.id]: [finding({ severity: "critical", category: "access" })] }, NOW), NOW);
    expect(partial.technical.status.label).toBe("Mal (parcial)");

    const none = summarizeGoogleCard(gscOf(snapshot()), summarizeSeo([], {}, NOW), NOW);
    expect(none.technical.status).toEqual({ tone: "neutral", label: "Sin datos" });
    expect(none.technical.counts).toBeNull();
    expect(none.technical.headline).toBe("Sin auditoría");
    expect(none.source).toBe(`Search Console · ${new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" }).format(daysAgo(1))} · Auditoría técnica · sin auditar`);
  });

  it("names which source each notice is about (AC-004)", () => {
    const oldCapture = snapshot({ createdAt: daysAgo(40) });
    const oldAudit = audit({ at: daysAgo(35) });
    const running = audit({ at: daysAgo(0), status: "running" });
    const seo = summarizeSeo([oldAudit, running], { [oldAudit.id]: [] }, NOW);
    const g = summarizeGoogleCard(gscOf(oldCapture), seo, NOW);
    expect(g.notices).toEqual([
      { kind: "stale", text: "Posicionamiento · datos de hace 40 días" },
      { kind: "running", text: "Salud técnica · Actualizando: hay una auditoría en curso." },
      { kind: "stale", text: "Salud técnica · datos de hace 35 días" },
    ]);
  });

  it("reports a failed update that kept the previous capture", () => {
    const good = snapshot();
    const failed = snapshot({ id: "f1", status: "failed", totals: null, previousTotals: null, errorKind: "quota_exceeded", createdAt: daysAgo(0) });
    const gsc = summarizeSearchConsole({ latest: failed, latestCompleted: good }, READY, "olessium.com");
    const g = summarizeGoogleCard(gsc, seoClean(), NOW);
    expect(g.ranking.state).toBe("ok");
    expect(g.notices).toEqual([{ kind: "failed", text: "Posicionamiento · el último intento de actualización falló; se muestra la captura anterior." }]);
  });

  it("translates every branch into English", () => {
    const g = summarizeGoogleCard(gscOf(snapshot(), READY, "en"), seoClean("en"), NOW, "en");
    expect(g.ranking.status.label).toBe("Measured");
    expect(g.ranking.headline).toMatchObject({ kind: "figures", clicksUnit: "clicks", impressionsUnit: "impressions" });
    expect(g.ranking.line).toBe("Last 28 days: from 27 Sept 2026 to 24 Oct 2026.");
    expect(g.technical).toMatchObject({ title: "Your site, as Google sees it", status: { label: "Good" } });
    const empty = summarizeGoogleCard(gscOf(snapshot({ totals: zero, previousTotals: zero }), READY, "en"), seoClean("en"), NOW, "en");
    expect(empty.ranking.status.label).toBe("No impressions");
    expect(empty.ranking.headline).toEqual({ kind: "text", text: "No impressions recorded in this period" });
    expect(summarizeGoogleCard(gscOf(null, NOT_CONFIGURED, "en"), seoClean("en"), NOW, "en").ranking).toMatchObject({ status: { label: "Not set up" }, line: "Google Search Console is not connected." });
  });
});

describe("summarizeGoogleCard: remaining states and edge cases (review DOM-06)", () => {
  const INVALID = { state: "invalid" as const, reason: "not_json" as const };
  const gscWith = (latest: SearchConsoleSnapshot | null, latestCompleted: SearchConsoleSnapshot | null, config: Parameters<typeof summarizeSearchConsole>[1] = READY) =>
    summarizeSearchConsole({ latest, latestCompleted }, config, "olessium.com");

  it("treats an unusable credential as not set up, but keeps a stored good capture as measured", () => {
    const invalid = summarizeGoogleCard(gscWith(null, null, INVALID), seoClean(), NOW);
    expect(invalid.ranking.status).toEqual({ tone: "neutral", label: "Sin configurar" });
    expect(invalid.ranking.line).toBe("Falta conectar Google Search Console.");
    const stored = summarizeGoogleCard(gscWith(snapshot(), snapshot(), INVALID), seoClean(), NOW);
    expect(stored.ranking.state).toBe("ok");
    expect(stored.ranking.headline).toMatchObject({ kind: "figures", clicks: "12" });
    expect(stored.notices).toEqual([]);
  });

  it("keeps the empty state with the failed-attempt notice, and a drop to zero as figures with a worse change", () => {
    const zeros = snapshot({ totals: zero, previousTotals: zero });
    const failed = snapshot({ id: "f1", status: "failed", totals: null, previousTotals: null, errorKind: "error", createdAt: daysAgo(0) });
    const empty = summarizeGoogleCard(gscWith(failed, zeros), seoClean(), NOW);
    expect(empty.ranking.state).toBe("empty");
    expect(empty.notices).toEqual([{ kind: "failed", text: "Posicionamiento · el último intento de actualización falló; se muestra la captura anterior." }]);
    const drop = summarizeGoogleCard(gscOf(snapshot({ totals: zero })), seoClean(), NOW);
    expect(drop.ranking.state).toBe("ok");
    expect(drop.ranking.headline).toEqual({ kind: "figures", clicks: "0", clicksUnit: "clics", impressions: "0", impressionsUnit: "impresiones" });
    expect(drop.ranking.change?.direction).toBe("worse");
  });

  it("gives an error no notices, and uses singular units for one click and one impression", () => {
    const failed = snapshot({ status: "failed", totals: null, previousTotals: null, errorKind: "error", createdAt: daysAgo(0) });
    expect(summarizeGoogleCard(gscOf(failed), seoClean(), NOW).notices).toEqual([]);
    const one = summarizeGoogleCard(gscOf(snapshot({ totals: { clicks: 1, impressions: 1, ctr: 1, position: 1 } })), seoClean(), NOW);
    expect(one.ranking.headline).toMatchObject({ clicksUnit: "clic", impressionsUnit: "impresión" });
    const oneEn = summarizeGoogleCard(gscOf(snapshot({ totals: { clicks: 1, impressions: 1, ctr: 1, position: 1 } }), READY, "en"), seoClean("en"), NOW, "en");
    expect(oneEn.ranking.headline).toMatchObject({ clicksUnit: "click", impressionsUnit: "impression" });
  });

  it("explains a technical block that is analysing or failed without a prior result", () => {
    const running = audit({ at: daysAgo(0), status: "running" });
    const analyzing = summarizeGoogleCard(gscOf(snapshot()), summarizeSeo([running], {}, NOW), NOW);
    expect(analyzing.technical).toMatchObject({ status: { tone: "neutral", label: "Analizando" }, counts: null, headline: "Analizando…" });
    expect(analyzing.source).toMatch(/ · Auditoría técnica · sin resultado$/);
    const failed = audit({ at: daysAgo(0), status: "failed" });
    const error = summarizeGoogleCard(gscOf(snapshot()), summarizeSeo([failed], {}, NOW), NOW);
    expect(error.technical).toMatchObject({ status: { tone: "bad", label: "Error" }, counts: null, headline: "Sin resultado" });
    expect(error.source).toMatch(/ · Auditoría técnica · sin resultado$/);
  });
});
