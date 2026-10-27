import { describe, expect, it } from "vitest";
import type { FieldDataResult } from "@/modules/audits/crux";
import { summarizePerformance } from "@/modules/overview/performance";
import { audit, daysAgo, emptyFieldData, emptyResult, facts, finding, NOW, perf } from "./fixtures";

describe("summarizePerformance", () => {
  it("says there is nothing yet without audits", () => {
    const s = summarizePerformance([], [], NOW);
    expect(s.state).toBe("no_data");
    expect(s.score).toBeNull();
  });

  it("never shows 0/100 when PageSpeed is not configured (AC-002)", () => {
    const s = summarizePerformance([audit({ at: daysAgo(1), facts: facts({ performance: emptyResult("not_configured") }) })], [], NOW);
    expect(s.state).toBe("not_configured");
    expect(s.score).toBeNull();
    expect(s.verdict).toBe("No medida");
    expect(s.reason).toMatch(/clave de PageSpeed/);
  });

  it("is partial when the measurement failed or was skipped", () => {
    expect(summarizePerformance([audit({ at: daysAgo(1), facts: facts({ performance: emptyResult("quota_exceeded") }) })], [], NOW).state).toBe("partial");
    expect(summarizePerformance([audit({ at: daysAgo(1), facts: facts({ performance: emptyResult("skipped") }) })], [], NOW).reason).toMatch(/portada/);
  });

  it("treats ±9 points as noise and ±10 as a change (AC-003, AC-015)", () => {
    const same = summarizePerformance([audit({ at: daysAgo(2), facts: facts({ performance: perf(60) }) }), audit({ at: daysAgo(1), facts: facts({ performance: perf(69) }) })], [], NOW);
    expect(same.change?.direction).toBe("same");
    const down = summarizePerformance([audit({ at: daysAgo(2), facts: facts({ performance: perf(70) }) }), audit({ at: daysAgo(1), facts: facts({ performance: perf(61) }) })], [], NOW);
    expect(down.change?.direction).toBe("same");
    const better = summarizePerformance([audit({ at: daysAgo(2), facts: facts({ performance: perf(60) }) }), audit({ at: daysAgo(1), facts: facts({ performance: perf(70) }) })], [], NOW);
    expect(better.change).toEqual({ direction: "better", text: "+10 puntos frente a la medición anterior" });
    const worse = summarizePerformance([audit({ at: daysAgo(2), facts: facts({ performance: perf(70) }) }), audit({ at: daysAgo(1), facts: facts({ performance: perf(60) }) })], [], NOW);
    expect(worse.change?.direction).toBe("worse");
  });

  it("does not compare different or unknown Lighthouse major versions (AC-015)", () => {
    const other = summarizePerformance([audit({ at: daysAgo(2), facts: facts({ performance: perf(30, "11.0.0") }) }), audit({ at: daysAgo(1), facts: facts({ performance: perf(90, "12.8.2") }) })], [], NOW);
    expect(other.change).toBeNull();
    expect(other.comparisonNote).toMatch(/otra versión/);
    const unknown = summarizePerformance([audit({ at: daysAgo(2), facts: facts({ performance: perf(30, null) }) }), audit({ at: daysAgo(1), facts: facts({ performance: perf(90) }) })], [], NOW);
    expect(unknown.change).toBeNull();
    const minor = summarizePerformance([audit({ at: daysAgo(2), facts: facts({ performance: perf(30, "12.1.0") }) }), audit({ at: daysAgo(1), facts: facts({ performance: perf(90, "12.8.2") }) })], [], NOW);
    expect(minor.change?.direction).toBe("better");
  });

  it("compares only with the audit immediately before, never skipping one without score", () => {
    const s = summarizePerformance(
      [
        audit({ at: daysAgo(3), facts: facts({ performance: perf(20) }) }),
        audit({ at: daysAgo(2), facts: facts({ performance: emptyResult("error") }) }),
        audit({ at: daysAgo(1), facts: facts({ performance: perf(90) }) }),
      ],
      [],
      NOW,
    );
    expect(s.change).toBeNull();
    expect(s.comparisonNote).toMatch(/no midió/);
  });

  it("keeps the dated result when a newer attempt is running or failed (AC-013)", () => {
    const result = audit({ at: daysAgo(40), facts: facts({ performance: perf(55) }) });
    const running = summarizePerformance([result, audit({ at: daysAgo(0), status: "running", facts: null })], [], NOW);
    expect(running.score).toBe(55);
    expect(running.measuredAt).toEqual(result.startedAt);
    expect(running.attempt?.status).toBe("running");
    expect(running.stale?.days).toBe(40);
    const failed = summarizePerformance([result, audit({ at: daysAgo(0), status: "failed", facts: null })], [], NOW);
    expect(failed.attempt?.status).toBe("failed");
    expect(failed.stale?.days).toBe(40);
  });

  it("shows analyzing or error without a previous result (AC-013)", () => {
    expect(summarizePerformance([audit({ at: daysAgo(0), status: "running", facts: null })], [], NOW).state).toBe("analyzing");
    const failed = summarizePerformance([audit({ at: daysAgo(0), status: "failed", facts: null })], [], NOW);
    expect(failed.state).toBe("error");
    expect(failed.attempt).toBeNull();
  });

  it("reports the main speed finding and real-visitor data honestly", () => {
    const issue = finding({ severity: "warning", category: "performance", title: "El contenido principal tarda 5 s" });
    const s = summarizePerformance([audit({ at: daysAgo(1), facts: facts({ performance: perf(40), fieldData: emptyFieldData("no_data") }) })], [finding({ severity: "critical", category: "metadata" }), issue], NOW);
    expect(s.topIssue).toBe(issue.title);
    expect(s.field.available).toBe(false);
    expect(s.field.text).toBe("Chrome UX Report no tiene datos suficientes de esta web.");
    expect(s.tone).toBe("bad");
  });
});

describe("real-visitor attribution on the card (D020)", () => {
  const field = (over: Partial<FieldDataResult>): FieldDataResult => ({
    status: "ok",
    formFactor: "PHONE",
    scope: "url",
    key: "https://e.es/",
    collectionPeriod: { firstDate: "2026-09-27", lastDate: "2026-10-24" },
    metrics: { lcpMs: 2100, inpMs: 150, cls: 0.05, fcpMs: 1200, ttfbMs: 500 },
    error: null,
    ...over,
  });
  const card = (fieldData?: FieldDataResult) => summarizePerformance([audit({ at: daysAgo(1), facts: facts({ performance: perf(80), fieldData }) })], [], NOW).field;

  it("names Chrome UX Report, the home page scope and the period for URL data", () => {
    const f = card(field({}));
    expect(f.available).toBe(true);
    expect(f.text).toBe("Visitantes reales de esta página: el contenido principal aparece en 2,1 s (bueno).");
    expect(f.source).toBe("Chrome UX Report · del 27 sept 2026 al 24 oct 2026");
  });

  it("attributes origin data to the whole site, never to the home page alone", () => {
    const f = card(field({ scope: "origin", key: "https://e.es" }));
    expect(f.text).toMatch(/^Visitantes reales de todo el sitio \(la portada no tiene datos propios\):/);
    expect(f.text).not.toMatch(/esta página/);
  });

  it("declares missing scope or period instead of inventing them", () => {
    const f = card(field({ scope: null, collectionPeriod: null }));
    expect(f.text).toMatch(/^Visitantes reales \(alcance no indicado\):/);
    expect(f.source).toBe("Chrome UX Report · periodo no indicado");
  });

  it("states the absence of data without inventing causes", () => {
    expect(card(emptyFieldData("no_data"))).toEqual({ available: false, text: "Chrome UX Report no tiene datos suficientes de esta web.", source: null });
    expect(card(emptyFieldData("quota_exceeded"))).toEqual({ available: false, text: "No hay datos de visitantes reales en esta medición.", source: null });
    expect(card(undefined)).toEqual({ available: false, text: "No hay datos de visitantes reales en esta medición.", source: null });
    expect(card(field({ metrics: { lcpMs: null, inpMs: null, cls: null, fcpMs: null, ttfbMs: null } })).available).toBe(false);
  });
});
