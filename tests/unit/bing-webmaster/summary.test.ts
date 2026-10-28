import { describe, expect, it } from "vitest";
import type { BingWebmasterSnapshot } from "@/modules/bing-webmaster/schema";
import { summarizeBingWebmaster } from "@/modules/bing-webmaster/summary";

const READY = { state: "ready" as const };
const at = (iso: string) => new Date(iso);

function completed(overrides: Partial<BingWebmasterSnapshot> = {}): BingWebmasterSnapshot {
  return {
    id: "s1",
    workspaceId: "w1",
    status: "completed",
    provider: "bing_wmt",
    captureCondition: "owner_api",
    siteUrl: "https://olessium.com/",
    currentStart: "2026-09-29",
    currentEnd: "2026-10-26",
    previousStart: "2026-09-01",
    previousEnd: "2026-09-28",
    totals: { clicks: 12, impressions: 400, ctr: 0.03 },
    previousTotals: { clicks: 8, impressions: 400, ctr: 0.02 },
    queries: [{ query: "ropa trail", clicks: 5, impressions: 50, ctr: 0.1, position: 4.2 }],
    pages: [{ page: "https://olessium.com/es", clicks: 3, impressions: 30, ctr: 0.1, position: null }],
    rowsStart: "2026-05-01",
    rowsEnd: "2026-10-25",
    errorKind: null,
    errorMessage: null,
    verifiedSites: null,
    createdAt: at("2026-10-28T10:00:00Z"),
    ...overrides,
  };
}

const EMPTY: Partial<BingWebmasterSnapshot> = {
  currentStart: null,
  currentEnd: null,
  previousStart: null,
  previousEnd: null,
  totals: null,
  previousTotals: null,
  queries: [],
  pages: [],
  rowsStart: null,
  rowsEnd: null,
};

function failed(kind: NonNullable<BingWebmasterSnapshot["errorKind"]>, overrides: Partial<BingWebmasterSnapshot> = {}): BingWebmasterSnapshot {
  return completed({ ...EMPTY, id: "f1", status: "failed", siteUrl: null, errorKind: kind, errorMessage: "diagnóstico", createdAt: at("2026-10-28T12:00:00Z"), ...overrides });
}

const none = { latest: null, latestCompleted: null };

describe("summarizeBingWebmaster", () => {
  it("shows figures, Spanish changes, site, both periods and the rows window", () => {
    const s = summarizeBingWebmaster({ latest: completed(), latestCompleted: completed() }, READY, "olessium.com");
    expect(s.state).toBe("ok");
    expect(s.siteUrl).toBe("https://olessium.com/");
    expect(s.period).toEqual({ start: "2026-09-29", end: "2026-10-26" });
    expect(s.previousPeriod).toEqual({ start: "2026-09-01", end: "2026-09-28" });
    expect(s.configWarning).toBeNull();
    expect(s.rows).toEqual({ start: "2026-05-01", end: "2026-10-25" });
    expect(s.metrics).toEqual({
      clicks: { value: "12", previous: "8", change: { direction: "better", text: "Antes: 8 clics (+50 %)" } },
      impressions: { value: "400", previous: "400", change: { direction: "same", text: "Antes: 400 impresiones (sin cambio apreciable)" } },
      ctr: { value: "3,0 %", previous: "2,0 %", change: { direction: "better", text: "Antes: 2,0 % (+1,0 puntos)" } },
    });
    expect(s.queries).toHaveLength(1);
    expect(s.pages[0]!.position).toBeNull();
    expect(s.lastFailure).toBeNull();
  });

  it("speaks English when asked", () => {
    const s = summarizeBingWebmaster({ latest: completed(), latestCompleted: completed() }, READY, "olessium.com", "en");
    expect(s.metrics?.clicks.change?.text).toBe("Before: 8 clicks (+50%)");
  });

  it("hides the change when the previous period had no impressions (FR-010)", () => {
    const s = summarizeBingWebmaster(
      { latest: null, latestCompleted: completed({ previousTotals: { clicks: 0, impressions: 0, ctr: 0 } }) },
      READY,
      "olessium.com",
    );
    expect(s.metrics?.clicks).toEqual({ value: "12", previous: null, change: null });
    expect(s.metrics?.ctr.change).toBeNull();
  });

  it("shows a dash for CTR without impressions", () => {
    const s = summarizeBingWebmaster({ latest: null, latestCompleted: completed({ totals: { clicks: 0, impressions: 0, ctr: 0 } }) }, READY, "olessium.com");
    expect(s.metrics?.ctr.value).toBe("—");
  });

  it("explains that Bing is still processing a site with no data yet, without an error tone", () => {
    const empty = completed(EMPTY);
    const s = summarizeBingWebmaster({ latest: empty, latestCompleted: empty }, READY, "olessium.com");
    expect(s.state).toBe("processing");
    expect(s.reason).toBe("Bing todavía no tiene datos de este sitio. Tras verificarlo tarda hasta 48 horas en mostrarlos; vuelve a intentarlo más tarde.");
    expect(s.metrics).toBeNull();
    expect(s.siteUrl).toBe("https://olessium.com/");
  });

  it("keeps searches when only the traffic is missing", () => {
    const partial = completed({ ...EMPTY, queries: completed().queries, rowsStart: "2026-05-01", rowsEnd: "2026-10-25" });
    const s = summarizeBingWebmaster({ latest: partial, latestCompleted: partial }, READY, "olessium.com");
    expect(s.state).toBe("ok");
    expect(s.metrics).toBeNull();
    expect(s.reason).toBe("Bing todavía no tiene clics ni impresiones diarias de este sitio. Abajo están las búsquedas y páginas que ya tiene.");
    expect(s.queries).toHaveLength(1);
  });

  it("keeps stored data visible and says so when the key is later removed or broken (D009)", () => {
    const stored = { latest: completed(), latestCompleted: completed() };
    const gone = summarizeBingWebmaster(stored, { state: "not_configured" }, "olessium.com");
    expect(gone.state).toBe("ok");
    expect(gone.configWarning).toBe("Bing Webmaster Tools no está configurado en la plataforma. Se muestran los datos de la última consulta guardada.");
    const broken = summarizeBingWebmaster(stored, { state: "invalid", reason: "bad_format" }, "olessium.com");
    expect(broken.configWarning).toMatch(/^BING_WEBMASTER_API_KEY no tiene el formato/);
  });

  it("keeps the last good data visible after a failure (AC-007)", () => {
    const s = summarizeBingWebmaster({ latest: failed("quota_exceeded"), latestCompleted: completed() }, READY, "olessium.com");
    expect(s.state).toBe("ok");
    expect(s.metrics).not.toBeNull();
    expect(s.lastFailure).toEqual({ text: "La cuota de la API de Bing Webmaster está agotada. Vuelve a intentarlo más tarde.", at: at("2026-10-28T12:00:00Z") });
  });

  it("explains each failure from its kind, never from the stored message", () => {
    const text = (s: BingWebmasterSnapshot) => summarizeBingWebmaster({ latest: s, latestCompleted: null }, READY, "olessium.com").reason;
    expect(text(failed("no_access", { verifiedSites: 2 }))).toBe(
      "La cuenta de la clave no tiene olessium.com entre sus sitios de Bing Webmaster Tools. Añádelo y verifícalo en esa cuenta y vuelve a intentarlo. Ahora mismo la clave ve 2 sitios verificados.",
    );
    expect(text(failed("not_verified", { siteUrl: "https://olessium.com/" }))).toBe(
      "https://olessium.com/ está en Bing Webmaster Tools pero sin verificar. Verifícalo y vuelve a intentarlo.",
    );
    expect(text(failed("invalid_credentials"))).toContain("BING_WEBMASTER_API_KEY");
    expect(text(failed("error"))).toBe("No se pudieron leer los datos de Bing Webmaster Tools. Vuelve a intentarlo.");
    expect(summarizeBingWebmaster({ latest: failed("error"), latestCompleted: null }, READY, "olessium.com").state).toBe("error");
  });

  it("covers configuration states before any capture", () => {
    expect(summarizeBingWebmaster(none, { state: "not_configured" }, "olessium.com")).toMatchObject({
      state: "not_configured",
      reason: "Bing Webmaster Tools no está configurado en la plataforma.",
    });
    expect(summarizeBingWebmaster(none, { state: "invalid", reason: "bad_format" }, "olessium.com")).toMatchObject({ state: "invalid_config" });
    expect(summarizeBingWebmaster(none, READY, "olessium.com")).toMatchObject({
      state: "no_data",
      reason: "Pulsa «Traer datos de Bing» para ver cómo te encuentran en Bing.",
    });
  });
});
