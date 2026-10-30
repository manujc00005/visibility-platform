import { describe, expect, it } from "vitest";
import type { SearchConsoleSnapshot } from "@/modules/search-console/schema";
import { displayDay, summarizeSearchConsole } from "@/modules/search-console/summary";

const READY = { state: "ready" as const, clientEmail: "visibility@demo.iam.gserviceaccount.com" };
const at = (iso: string) => new Date(iso);

function completed(overrides: Partial<SearchConsoleSnapshot> = {}): SearchConsoleSnapshot {
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
    queries: [{ query: "crm agencias", clicks: 5, impressions: 50, ctr: 0.1, position: 4.2 }],
    pages: [],
    segments: null,
    errorKind: null,
    errorMessage: null,
    accessibleProperties: null,
    createdAt: at("2026-10-27T10:00:00Z"),
    ...overrides,
  };
}

function failed(kind: NonNullable<SearchConsoleSnapshot["errorKind"]>, overrides: Partial<SearchConsoleSnapshot> = {}): SearchConsoleSnapshot {
  return completed({
    id: "f1",
    status: "failed",
    property: null,
    currentStart: null,
    currentEnd: null,
    previousStart: null,
    previousEnd: null,
    totals: null,
    previousTotals: null,
    queries: [],
    errorKind: kind,
    errorMessage: "Algo falló",
    createdAt: at("2026-10-27T11:00:00Z"),
    ...overrides,
  });
}

describe("summarizeSearchConsole", () => {
  it("is not configured without a credential or data", () => {
    const s = summarizeSearchConsole({ latest: null, latestCompleted: null }, { state: "not_configured" }, "olessium.com");
    expect(s.state).toBe("not_configured");
    expect(s.cardLine).toBeNull();
  });

  it("asks for a first capture when configured", () => {
    const s = summarizeSearchConsole({ latest: null, latestCompleted: null }, READY, "olessium.com");
    expect(s.state).toBe("no_data");
    expect(s.reason).toMatch(/Traer datos/);
  });

  it("explains no_access with the email to add and the properties it can see", () => {
    const f = failed("no_access", { accessibleProperties: 2 });
    const s = summarizeSearchConsole({ latest: f, latestCompleted: null }, READY, "olessium.com");
    expect(s.state).toBe("error");
    expect(s.reason).toContain("visibility@demo.iam.gserviceaccount.com");
    expect(s.reason).toContain("olessium.com");
    expect(s.reason).toContain("2 propiedades");
  });

  it("shows metrics with changes against the previous period", () => {
    const s = summarizeSearchConsole({ latest: completed(), latestCompleted: completed() }, READY, "olessium.com");
    expect(s.state).toBe("ok");
    expect(s.metrics?.clicks).toEqual({ value: "12", previous: "8", change: { direction: "better", text: "Antes: 8 clics (+50 %)" } });
    expect(s.metrics?.impressions.change).toEqual({ direction: "same", text: "Antes: 390 impresiones (sin cambio apreciable)" });
    expect(s.metrics?.position.change).toEqual({ direction: "better", text: "Antes: 12,1 (sube 2,7 puestos)" });
    expect(s.metrics?.ctr.value).toBe("3,0 %");
    expect(s.cardLine).toBe("En Google: 12 clics y 400 impresiones en los últimos 28 días, posición media 9,4 (Search Console).");
  });

  it("does not compare when the previous period had no impressions", () => {
    const snapshot = completed({ previousTotals: { clicks: 0, impressions: 0, ctr: 0, position: 0 } });
    const s = summarizeSearchConsole({ latest: snapshot, latestCompleted: snapshot }, READY, "olessium.com");
    expect(s.metrics?.clicks.change).toBeNull();
    expect(s.metrics?.position.change).toBeNull();
  });

  it("never shows a position for a period without impressions", () => {
    const snapshot = completed({ totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 } });
    const s = summarizeSearchConsole({ latest: snapshot, latestCompleted: snapshot }, READY, "olessium.com");
    expect(s.metrics?.position.value).toBe("—");
    expect(s.metrics?.position.change).toBeNull();
    expect(s.cardLine).toBe("En Google: sin impresiones en los últimos 28 días (Search Console).");
  });

  it("keeps the last good data visible after a failed attempt and reports the failure", () => {
    const s = summarizeSearchConsole({ latest: failed("quota_exceeded"), latestCompleted: completed() }, READY, "olessium.com");
    expect(s.state).toBe("ok");
    expect(s.metrics?.clicks.value).toBe("12");
    expect(s.lastFailure?.text).toMatch(/Vuelve a intentarlo/);
  });

  it("reports an invalid configuration with a translated reason", () => {
    const s = summarizeSearchConsole({ latest: null, latestCompleted: null }, { state: "invalid", reason: "not_json" }, "olessium.com");
    expect(s.state).toBe("invalid_config");
    expect(s.reason).toBe("GSC_SERVICE_ACCOUNT_JSON no es un JSON válido, ni en crudo ni en base64.");
  });

  it("explains failures from their kind, not from the stored diagnostic", () => {
    const f = failed("quota_exceeded", { errorMessage: "Search Console respondió 429" });
    const s = summarizeSearchConsole({ latest: f, latestCompleted: null }, READY, "olessium.com");
    expect(s.reason).toBe("La cuota de la API de Search Console está agotada. Vuelve a intentarlo más tarde.");
  });
});

describe("summarizeSearchConsole in English", () => {
  it("translates metrics, changes and the card line with en-GB numbers", () => {
    const snapshot = completed({ totals: { clicks: 1234, impressions: 40_000, ctr: 0.03085, position: 9.4 }, previousTotals: { clicks: 1500, impressions: 39_000, ctr: 0.0385, position: 8.1 } });
    const s = summarizeSearchConsole({ latest: snapshot, latestCompleted: snapshot }, READY, "olessium.com", "en");
    expect(s.metrics?.clicks).toEqual({ value: "1,234", previous: "1,500", change: { direction: "worse", text: "Before: 1,500 clicks (−18%)" } });
    expect(s.metrics?.impressions.change?.text).toBe("Before: 39,000 impressions (no noticeable change)");
    expect(s.metrics?.ctr).toMatchObject({ value: "3.1%", change: { direction: "worse", text: "Before: 3.9% (−0.8 points)" } });
    expect(s.metrics?.position.change).toEqual({ direction: "worse", text: "Before: 8.1 (down 1.3 places)" });
    expect(s.cardLine).toBe("On Google: 1,234 clicks and 40,000 impressions in the last 28 days, average position 9.4 (Search Console).");
  });

  it("translates setup and failure reasons", () => {
    expect(summarizeSearchConsole({ latest: null, latestCompleted: null }, { state: "not_configured" }, "olessium.com", "en").reason).toBe(
      "Search Console is not set up on the platform.",
    );
    expect(summarizeSearchConsole({ latest: null, latestCompleted: null }, READY, "olessium.com", "en").reason).toBe(
      "Press “Get Search Console data” to see how people find you on Google.",
    );
    const noAccess = summarizeSearchConsole({ latest: failed("no_access", { accessibleProperties: 1 }), latestCompleted: null }, READY, "olessium.com", "en");
    expect(noAccess.reason).toBe(
      "Add visibility@demo.iam.gserviceaccount.com as a user of the olessium.com property in Search Console (Settings › Users and permissions) and try again. Right now the account can read 1 property.",
    );
  });
});

describe("displayDay", () => {
  it("formats a calendar date without shifting it, in both languages", () => {
    expect(displayDay("2026-10-24")).toMatch(/24 oct.* 2026/);
    expect(displayDay("2026-10-24", "en")).toBe("24 Oct 2026");
  });
});

describe("summarizeSearchConsole keeps the Spanish output of acba536 (D007, D020)", () => {
  it("writes decreases with a hyphen and the raw integer percent, and CTR points with a minus sign", () => {
    const snapshot = completed({
      totals: { clicks: 15, impressions: 1234, ctr: 0.03, position: 9.4 },
      previousTotals: { clicks: 20, impressions: 1500, ctr: 0.04, position: 12.1 },
    });
    const s = summarizeSearchConsole({ latest: snapshot, latestCompleted: snapshot }, READY, "olessium.com");
    expect(s.metrics?.clicks.change?.text).toBe("Antes: 20 clics (-25 %)");
    expect(s.metrics?.impressions).toMatchObject({ value: "1234", change: { direction: "worse", text: "Antes: 1500 impresiones (-18 %)" } });
    expect(s.metrics?.ctr.change?.text).toBe("Antes: 4,0 % (−1,0 puntos)");
    expect(s.metrics?.position.change?.text).toBe("Antes: 12,1 (sube 2,7 puestos)");
  });

  it("does not group a large percent change, as the original template did", () => {
    const snapshot = completed({ totals: { clicks: 200, impressions: 400, ctr: 0.5, position: 9.4 }, previousTotals: { clicks: 1, impressions: 400, ctr: 0.5, position: 9.4 } });
    const s = summarizeSearchConsole({ latest: snapshot, latestCompleted: snapshot }, READY, "olessium.com");
    expect(s.metrics?.clicks.change?.text).toBe("Antes: 1 clic (+19900 %)");
  });

  it("groups Spanish numbers from five digits only", () => {
    const snapshot = completed({ totals: { clicks: 12345, impressions: 40000, ctr: 0.3, position: 9.4 }, previousTotals: { clicks: 12000, impressions: 40000, ctr: 0.3, position: 9.4 } });
    const s = summarizeSearchConsole({ latest: snapshot, latestCompleted: snapshot }, READY, "olessium.com");
    expect(s.metrics?.clicks.value).toBe("12.345");
    expect(s.cardLine).toContain("12.345 clics");
  });
});

describe("summarizeSearchConsole brand segments (feature 007)", () => {
  const t = (clicks: number, impressions: number) => ({ clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: 5 });
  const segments = (overrides: Partial<NonNullable<SearchConsoleSnapshot["segments"]>> = {}) => ({
    version: 1 as const,
    terms: ["Olessium", "olessium.com"],
    termsTruncated: false,
    branded: t(30, 120),
    nonBranded: t(50, 700),
    previousBranded: t(20, 100),
    previousNonBranded: t(40, 650),
    ...overrides,
  });
  const summarize = (overrides: Partial<SearchConsoleSnapshot>, locale: "es" | "en" = "es") => {
    const snapshot = completed({ totals: t(100, 1000), previousTotals: t(80, 900), ...overrides });
    return summarizeSearchConsole({ latest: snapshot, latestCompleted: snapshot }, READY, "olessium.com", locale);
  };

  it("shows both blocks with their share of the total and the unclassified gap (AC-001, AC-004)", () => {
    const s = summarize({ segments: segments() });
    expect(s.segments).toMatchObject({
      empty: false,
      branded: { clicks: "30 clics", impressions: "120 impresiones", clicksShare: "30,0 %", impressionsShare: "12,0 %" },
      nonBranded: { clicks: "50 clics", impressions: "700 impresiones", clicksShare: "50,0 %", impressionsShare: "70,0 %" },
      hidden: { clicks: "20 clics", impressions: "180 impresiones" },
      previousHidden: { clicks: "20 clics", impressions: "150 impresiones" },
      mismatch: false,
      terms: ["Olessium", "olessium.com"],
      truncated: false,
    });
    expect(s.segments?.branded.change?.text).toBe("Antes: 20 clics (+50 %)");
    expect(s.segments?.nonBranded.change?.text).toBe("Antes: 40 clics (+25 %)");
  });

  it("shows zero and flags a mismatch when the blocks add up to more than the total (AC-004)", () => {
    const now = summarize({ segments: segments({ branded: t(70, 400), nonBranded: t(50, 700) }) });
    expect(now.segments?.hidden).toEqual({ clicks: "0 clics", impressions: "0 impresiones" });
    expect(now.segments?.mismatch).toBe(true);
    // A mismatch in the previous period only also counts, for impressions alone too.
    const before = summarize({ segments: segments({ previousNonBranded: t(40, 850) }) });
    expect(before.segments?.previousHidden.impressions).toBe("0 impresiones");
    expect(before.segments?.hidden).toEqual({ clicks: "20 clics", impressions: "180 impresiones" });
    expect(before.segments?.mismatch).toBe(true);
  });

  it("marks the period empty and drops shares without impressions (AC-013)", () => {
    const s = summarize({ totals: t(0, 0), segments: segments({ branded: t(0, 0), nonBranded: t(0, 0) }) });
    expect(s.segments).toMatchObject({ empty: true, branded: { clicksShare: "—", impressionsShare: "—" }, nonBranded: { clicksShare: "—", impressionsShare: "—" } });
  });

  it("shows no click share when there were no clicks, but keeps the impression share (AC-013)", () => {
    const s = summarize({ totals: t(0, 1000), segments: segments({ branded: t(0, 120), nonBranded: t(0, 700) }) });
    expect(s.segments?.branded).toMatchObject({ clicksShare: "—", impressionsShare: "12,0 %" });
  });

  it("compares a block only when it had impressions before, and from zero clicks with the base-zero phrase (AC-013)", () => {
    const none = summarize({ segments: segments({ previousBranded: t(0, 0) }) });
    expect(none.segments?.branded.change).toBeNull();
    expect(none.segments?.nonBranded.change).not.toBeNull();
    const zeroClicks = summarize({ segments: segments({ previousBranded: t(0, 60) }) });
    expect(zeroClicks.segments?.branded.change).toEqual({ direction: "better", text: "Antes: 0 clics" });
  });

  it("carries the truncation flag (AC-012)", () => {
    expect(summarize({ segments: segments({ termsTruncated: true }) }).segments?.truncated).toBe(true);
  });

  it("labels the stored queries that contain a brand term (AC-005)", () => {
    const s = summarize({
      segments: segments(),
      queries: [
        { query: "olessium opiniones", clicks: 3, impressions: 9, ctr: 0.33, position: 1.2 },
        { query: "OLESSIUM.COM", clicks: 2, impressions: 5, ctr: 0.4, position: 1 },
        { query: "crm agencias", clicks: 5, impressions: 50, ctr: 0.1, position: 4.2 },
      ],
    });
    expect(s.queries.map((q) => [q.query, q.branded])).toEqual([
      ["olessium opiniones", true],
      ["OLESSIUM.COM", true],
      ["crm agencias", false],
    ]);
  });

  it("labels the rows of another company with its own stored terms (AC-005)", () => {
    const s = summarize({
      segments: segments({ terms: ["Clínica García", "clinicagarcia", "clinicagarcia.es"] }),
      queries: [
        { query: "clínica garcía", clicks: 3, impressions: 9, ctr: 0.33, position: 1.2 },
        { query: "clinica dental madrid", clicks: 5, impressions: 50, ctr: 0.1, position: 4.2 },
        { query: "clinicagarcia.es citas", clicks: 1, impressions: 2, ctr: 0.5, position: 1 },
      ],
    });
    expect(s.queries.map((q) => q.branded)).toEqual([true, false, true]);
  });

  it("leaves a capture without segments as before: no block, no labels, same card line (AC-006)", () => {
    const old = summarize({ segments: null });
    expect(old.segments).toBeNull();
    expect(old.queries.every((q) => !("branded" in q))).toBe(true);
    const fresh = summarize({ segments: segments() });
    expect(fresh.cardLine).toBe(old.cardLine);
    expect(fresh.metrics).toEqual(old.metrics);
  });

  it("formats the blocks in English", () => {
    const s = summarize({ segments: segments() }, "en");
    expect(s.segments?.branded).toMatchObject({ clicks: "30 clicks", clicksShare: "30.0%" });
  });
});

describe("summarizeSearchConsole position change per query (feature 009)", () => {
  const row = (position: number, previous: { position: number } | null | undefined) => ({
    query: "crm agencias",
    clicks: 5,
    impressions: 50,
    ctr: 0.1,
    position,
    ...(previous === undefined ? {} : { previous: previous && { clicks: 2, impressions: 20, ctr: 0.1, position: previous.position } }),
  });
  const summarize = (queries: ReturnType<typeof row>[], locale: "es" | "en" = "es", overrides: Partial<SearchConsoleSnapshot> = {}) => {
    const snapshot = completed({ queries, ...overrides });
    return summarizeSearchConsole({ latest: snapshot, latestCompleted: snapshot }, READY, "olessium.com", locale);
  };
  const change = (position: number, previous: { position: number } | null | undefined) => summarize([row(position, previous)]).queries[0]!.positionChange;

  it("goes up when the position number falls, and down when it rises (AC-003)", () => {
    expect(change(8, { position: 12 })).toEqual({ direction: "better", text: "Sube 4,0" });
    expect(change(12, { position: 8 })).toEqual({ direction: "worse", text: "Baja 4,0" });
  });

  it("uses the same threshold as the overall position (AC-003)", () => {
    expect(change(8.3, { position: 8 })).toEqual({ direction: "same", text: "Igual" });
    expect(change(8.5, { position: 8 })).toEqual({ direction: "worse", text: "Baja 0,5" });
    expect(change(7.5, { position: 8 })).toEqual({ direction: "better", text: "Sube 0,5" });
  });

  it("tells apart no previous data from a capture without the key (AC-004)", () => {
    expect(change(8, null)).toEqual({ direction: "same", text: "Sin dato anterior" });
    expect(change(8, undefined)).toBeNull();
  });

  it("projects the change with and without segments, leaving branded as in feature 007", () => {
    const segments = {
      version: 1 as const,
      terms: ["crm"],
      termsTruncated: false,
      branded: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
      nonBranded: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
      previousBranded: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
      previousNonBranded: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
    };
    const withSegments = summarize([row(8, { position: 12 })], "es", { segments }).queries[0]!;
    expect(withSegments).toMatchObject({ branded: true, positionChange: { text: "Sube 4,0" } });
    const without = summarize([row(8, { position: 12 })]).queries[0]!;
    expect(without).not.toHaveProperty("branded");
    expect(without.positionChange?.text).toBe("Sube 4,0");
  });

  it("does not change the wording of the overall position (regression)", () => {
    const s = summarize([row(8, { position: 12 })]);
    expect(s.metrics?.position.change?.text).toBe("Antes: 12,1 (sube 2,7 puestos)");
  });

  it("writes the change in English", () => {
    expect(summarize([row(8, { position: 12 })], "en").queries[0]!.positionChange?.text).toBe("Up 4.0");
    expect(summarize([row(12, { position: 8 })], "en").queries[0]!.positionChange?.text).toBe("Down 4.0");
    expect(summarize([row(8, null)], "en").queries[0]!.positionChange?.text).toBe("No previous data");
  });
});
