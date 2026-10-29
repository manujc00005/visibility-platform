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
