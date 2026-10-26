import { describe, expect, it } from "vitest";
import { emptyFieldData } from "@/modules/audits/crux";
import { emptyResult, type PerformanceResult } from "@/modules/audits/pagespeed";
import { computeEvolution, type AuditLike } from "@/modules/audits/evolution";
import type { AuditFacts } from "@/modules/audits/rules";

const perf = (score: number, lcpMs = 2000): PerformanceResult => ({
  status: "ok",
  strategy: "mobile",
  score,
  metrics: { lcpMs, cls: 0, tbtMs: 50, fcpMs: 900, speedIndexMs: 1500 },
  lighthouseVersion: "13",
  error: null,
});

function facts(performance: PerformanceResult, fieldData?: AuditFacts["fieldData"]): AuditFacts {
  return { requestedUrl: "https://e.es/", httpsFailure: null, page: { kind: "disallowed" }, robots: null, sitemap: null, performance, fieldData };
}

let n = 0;
function audit(partial: Partial<AuditLike> & { day: number }): AuditLike {
  n += 1;
  return {
    id: `a${n}`,
    status: "completed",
    startedAt: new Date(Date.UTC(2026, 9, partial.day)),
    criticalCount: 0,
    warningCount: 0,
    infoCount: 0,
    facts: null,
    ...partial,
  };
}

describe("computeEvolution", () => {
  it("is empty without completed audits", () => {
    const e = computeEvolution([audit({ day: 1, status: "running" }), audit({ day: 2, status: "failed" })]);
    expect(e.points).toEqual([]);
    expect(e.headline).toBeNull();
    expect(e.trend).toBeNull();
  });

  it("orders points oldest first regardless of the input order and has no trend with one audit", () => {
    const e = computeEvolution([audit({ day: 5, criticalCount: 1 }), audit({ day: 2 })]);
    expect(e.points.map((p) => p.date.getUTCDate())).toEqual([2, 5]);
    expect(e.latest?.counts.critical).toBe(1);
    expect(e.headline?.tone).toBe("bad");
    expect(computeEvolution([audit({ day: 1 })]).trend).toBeNull();
  });

  it("says it is better when urgent problems go down, worse when they go up", () => {
    const better = computeEvolution([audit({ day: 1, criticalCount: 2, warningCount: 1 }), audit({ day: 2, warningCount: 1 })]);
    expect(better.trend).toMatchObject({ direction: "better", tone: "good", text: "Va mejor: 2 problemas menos que en la auditoría anterior." });
    expect(better.indicators[0]).toMatchObject({ value: "1", tone: "fair", verdict: "Regular", change: { direction: "better", text: "2 menos que antes" } });

    const worse = computeEvolution([audit({ day: 1 }), audit({ day: 2, criticalCount: 1 })]);
    expect(worse.trend).toMatchObject({ direction: "worse", text: "Va peor: 1 problema nuevo desde la auditoría anterior." });
  });

  it("falls back to Google's speed score when problems are unchanged, ignoring small noise", () => {
    const faster = computeEvolution([audit({ day: 1, facts: facts(perf(60)) }), audit({ day: 2, facts: facts(perf(72)) })]);
    expect(faster.trend).toMatchObject({ direction: "better", text: "Va mejor: la web carga más rápido (+12 puntos de velocidad)." });
    expect(faster.indicators[1]).toMatchObject({ value: "72/100", tone: "fair", verdict: "Mejorable", change: { direction: "better", text: "+12 puntos" } });

    const noise = computeEvolution([audit({ day: 1, facts: facts(perf(95)) }), audit({ day: 2, facts: facts(perf(86)) })]);
    expect(noise.trend).toMatchObject({ direction: "same" });
    expect(noise.indicators[1]?.change).toEqual({ direction: "same", text: "Sin cambio apreciable" });
  });

  it("reports speed as not measured and real users as no data when absent", () => {
    const e = computeEvolution([audit({ day: 1, facts: facts(emptyResult("not_configured"), emptyFieldData("no_data")) })]);
    expect(e.indicators[1]).toMatchObject({ value: "—", tone: "neutral", verdict: "No medida", change: null });
    expect(e.indicators[2]).toMatchObject({ value: "—", verdict: "Pocas visitas" });
    expect(e.points[0]).toMatchObject({ score: null, lcpMs: null });
  });

  it("rates real-user LCP from the latest audit", () => {
    const field = { ...emptyFieldData("ok"), status: "ok" as const, metrics: { lcpMs: 4500, inpMs: null, cls: null, fcpMs: null, ttfbMs: null } };
    const e = computeEvolution([audit({ day: 1, facts: facts(perf(95), field) })]);
    expect(e.indicators[2]).toMatchObject({ value: "4,5 s", tone: "bad", verdict: "Malo" });
  });
});
