import { describe, expect, it } from "vitest";
import { emptyResult, type PerformanceResult } from "@/modules/audits/pagespeed";
import { speedAxis, speedBreaks, speedSegments, toPoint, type AuditLike } from "@/modules/audits/evolution";
import type { AuditFacts } from "@/modules/audits/rules";

const perf = (score: number, lcpMs = 2000): PerformanceResult => ({
  status: "ok",
  strategy: "mobile",
  score,
  metrics: { lcpMs, cls: 0, tbtMs: 50, fcpMs: 900, speedIndexMs: 1500 },
  lighthouseVersion: "13",
  error: null,
});

function facts(performance: PerformanceResult): AuditFacts {
  return { requestedUrl: "https://e.es/", httpsFailure: null, page: { kind: "disallowed" }, robots: null, sitemap: null, performance };
}

function audit(partial: Partial<AuditLike>): AuditLike {
  return { id: "a1", status: "completed", startedAt: new Date(Date.UTC(2026, 9, 1)), criticalCount: 1, warningCount: 2, infoCount: 3, facts: null, ...partial };
}

describe("toPoint", () => {
  it("keeps the stored counts and takes score and LCP from a successful measurement", () => {
    expect(toPoint(audit({ facts: facts(perf(72, 3100)) }))).toEqual({
      id: "a1",
      date: new Date(Date.UTC(2026, 9, 1)),
      counts: { critical: 1, warning: 2, info: 3 },
      score: 72,
      lcpMs: 3100,
      methodology: { strategy: "mobile", major: "13" },
    });
  });

  it("never turns a missing measurement into a zero", () => {
    expect(toPoint(audit({ facts: facts(emptyResult("not_configured")) }))).toMatchObject({ score: null, lcpMs: null });
    expect(toPoint(audit({ facts: null }))).toMatchObject({ score: null, lcpMs: null });
  });
});

describe("speed methodology and segments (D019)", () => {
  const point = (id: string, score: number | null, major: string | null) => ({
    id,
    score,
    methodology: score !== null && major !== null ? { strategy: "mobile", major } : null,
  });

  it("records strategy and Lighthouse major only for a measurement with a known version", () => {
    expect(toPoint(audit({ facts: facts(perf(72)) })).methodology).toEqual({ strategy: "mobile", major: "13" });
    expect(toPoint(audit({ facts: facts({ ...perf(72), lighthouseVersion: "12.8.2" }) })).methodology).toEqual({ strategy: "mobile", major: "12" });
    expect(toPoint(audit({ facts: facts({ ...perf(72), lighthouseVersion: null }) })).methodology).toBeNull();
    expect(toPoint(audit({ facts: facts(emptyResult("error")) })).methodology).toBeNull();
  });

  it("joins consecutive measurements with the same methodology", () => {
    expect(speedSegments([point("a", 60, "13"), point("b", 70, "13"), point("c", 65, "13")])).toEqual([[0, 1, 2]]);
  });

  it("breaks the line at a different major or an unknown version", () => {
    expect(speedSegments([point("a", 60, "12"), point("b", 70, "13"), point("c", 65, "13")])).toEqual([[0], [1, 2]]);
    expect(speedSegments([point("a", 60, "13"), point("b", 70, null), point("c", 65, "13")])).toEqual([[0], [1], [2]]);
  });

  it("joins comparable measurements across audits that measured nothing", () => {
    expect(speedSegments([point("x", null, null), point("a", 95, "13"), point("b", 86, "13"), point("y", null, null), point("c", 96, "13")])).toEqual([[1, 2, 4]]);
  });

  it("still breaks at a version change hidden behind an audit that measured nothing", () => {
    expect(speedSegments([point("a", 60, "12"), point("x", null, null), point("b", 70, "13")])).toEqual([[0], [2]]);
    expect(speedBreaks([point("a", 60, "12"), point("x", null, null), point("b", 70, "13")])).toMatchObject({ differentVersion: true });
  });

  it("starts the speed axis a noise margin below the lowest score, in tens", () => {
    expect(speedAxis([95, 86, 96])).toEqual({ min: 70, ticks: [70, 80, 90, 100] });
    expect(speedAxis([60, 72])).toEqual({ min: 50, ticks: [50, 60, 70, 80, 90, 100] });
  });

  it("keeps the good threshold in view and falls back towards 0 with low scores", () => {
    expect(speedAxis([100, 100]).min).toBe(80);
    expect(speedAxis([45])).toEqual({ min: 30, ticks: [30, 50, 90, 100] });
    expect(speedAxis([5])).toEqual({ min: 0, ticks: [0, 50, 90, 100] });
  });

  it("explains the breaks found among the points shown", () => {
    expect(speedBreaks([point("a", 60, "13"), point("b", 70, "13")])).toEqual({ differentVersion: false, unknownVersion: false });
    expect(speedBreaks([point("a", 60, "12"), point("b", 70, "13")])).toMatchObject({ differentVersion: true });
    expect(speedBreaks([point("a", 60, null), point("b", 70, "13")])).toMatchObject({ unknownVersion: true });
    expect(speedBreaks([point("a", 60, "13"), point("x", null, null), point("b", 70, "13")])).toEqual({ differentVersion: false, unknownVersion: false });
  });
});
