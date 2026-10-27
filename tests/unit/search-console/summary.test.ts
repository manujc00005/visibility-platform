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

  it("reports an invalid configuration", () => {
    const s = summarizeSearchConsole({ latest: null, latestCompleted: null }, { state: "invalid", reason: "No es JSON" }, "olessium.com");
    expect(s.state).toBe("invalid_config");
  });
});

describe("displayDay", () => {
  it("formats a calendar date without shifting it", () => {
    expect(displayDay("2026-10-24")).toMatch(/24 oct.* 2026/);
  });
});
