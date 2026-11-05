import { describe, expect, it } from "vitest";
import type { FieldDataResult } from "@/modules/audits/crux";
import { summarizePerformance } from "@/modules/overview/performance";
import { audit, daysAgo, emptyFieldData, emptyResult, facts, finding, NOW, perf } from "./fixtures";

const field = (lcpMs: number | null, inpMs: number | null = 100, cls: number | null = 0.01): FieldDataResult => ({
  ...emptyFieldData("ok"),
  scope: "url",
  metrics: { lcpMs, inpMs, cls, fcpMs: null, ttfbMs: null },
});

describe("summarizePerformance", () => {
  it("lets real visitors set the verdict and keeps the lab tone on the score", () => {
    const s = summarizePerformance([audit({ at: daysAgo(1), facts: facts({ performance: perf(84), fieldData: field(1700) }) })], [], NOW);
    expect(s.score).toBe(84);
    expect(s.visitors).toBe("good");
    expect(s.tone).toBe("good");
    expect(s.verdict).toBe("Bueno");
    expect(s.scoreTone).toBe("fair");
    expect(s.visitorsLine).toBe("Tus visitantes reales ven tu web rápida.");
  });

  it("takes the worst real-visitor metric even when the lab score is good", () => {
    const s = summarizePerformance([audit({ at: daysAgo(1), facts: facts({ performance: perf(95), fieldData: field(1700, 600) }) })], [], NOW);
    expect(s.tone).toBe("bad");
    expect(s.scoreTone).toBe("good");
  });

  it("falls back to the lab score without real-visitor data", () => {
    const s = summarizePerformance([audit({ at: daysAgo(1), facts: facts({ performance: perf(84), fieldData: emptyFieldData("no_data") }) })], [], NOW);
    expect(s.visitors).toBeNull();
    expect(s.visitorsLine).toBeNull();
    expect(s.tone).toBe("fair");
    expect(s.scoreTone).toBe("fair");
  });

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

  it("reports the main speed finding", () => {
    const issue = finding({ severity: "warning", category: "performance", title: "El contenido principal tarda 5 s" });
    const s = summarizePerformance([audit({ at: daysAgo(1), facts: facts({ performance: perf(40), fieldData: emptyFieldData("no_data") }) })], [finding({ severity: "critical", category: "metadata" }), issue], NOW);
    expect(s.topIssue).toBe(issue.title);
    expect(s.tone).toBe("bad");
  });
});
