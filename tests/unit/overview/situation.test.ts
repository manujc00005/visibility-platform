import { describe, expect, it } from "vitest";
import { en } from "@/i18n/messages/en";
import { es } from "@/i18n/messages/es";
import { summarizeAi } from "@/modules/overview/ai";
import { summarizePerformance } from "@/modules/overview/performance";
import { summarizeSeo } from "@/modules/overview/seo";
import { AREAS, hasResult, pendingRows, situationLine, type AreaSummaries } from "@/modules/overview/situation";
import type { AuditInput, FindingLike } from "@/modules/overview/types";
import type { SearchConsoleSnapshot } from "@/modules/search-console/schema";
import { summarizeSearchConsole } from "@/modules/search-console/summary";
import { audit, daysAgo, emptyFieldData, emptyResult, facts, finding, NOW, perf, run } from "./fixtures";

/** Feature 023: the situation line and the card/row split read the cards' own summaries (D003). */

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

type Run = ReturnType<typeof run>;

function areas(
  options: {
    audits?: AuditInput[];
    findings?: FindingLike[];
    gsc?: SearchConsoleSnapshot | null;
    gscConfig?: typeof READY | typeof NOT_CONFIGURED;
    runs?: Run[];
    prompts?: number;
  } = {},
  locale?: "en",
): AreaSummaries {
  const audits = options.audits ?? [];
  const findings = options.findings ?? [];
  const latest = audits.find((a) => a.status === "completed");
  const gsc = options.gsc ?? null;
  return {
    performance: summarizePerformance(audits, findings, NOW, locale),
    seo: summarizeSeo(audits, latest ? { [latest.id]: findings } : {}, NOW, locale),
    gsc: summarizeSearchConsole({ latest: gsc, latestCompleted: gsc?.status === "completed" ? gsc : null }, options.gscConfig ?? READY, "olessium.com", locale),
    ai: summarizeAi(options.runs ?? [], options.prompts ?? 0, NOW, locale),
  };
}

const answered = (outcomes: ("yes" | "no" | "none")[], at = daysAgo(1)) => run({ at, questions: outcomes.map((o, i) => ({ id: `p${i}`, outcomes: [o] })) });
const texts = (s: AreaSummaries, locale?: "en") => situationLine(s, NOW, locale)?.map((f) => f.text) ?? null;
const fragment = (s: AreaSummaries, area: (typeof AREAS)[number], locale?: "en") => situationLine(s, NOW, locale)?.find((f) => f.area === area)?.text;

describe("situationLine: when it shows (AC-002)", () => {
  it("says nothing without a single result: the empty state speaks instead", () => {
    expect(situationLine(areas(), NOW)).toBeNull();
    // Attempts in progress or failed are not results either.
    const running = audit({ at: daysAgo(0), status: "running" });
    expect(situationLine(areas({ audits: [running], gscConfig: NOT_CONFIGURED }), NOW)).toBeNull();
  });

  it("gives one fragment per area in card order once any area has a result", () => {
    const a = audit({ at: daysAgo(1), facts: facts({ performance: perf(95) }) });
    const line = situationLine(areas({ audits: [a], gsc: snapshot(), runs: [answered(["yes", "yes"])], prompts: 2 }), NOW);
    expect(line?.map((f) => f.area)).toEqual(["performance", "technical", "ranking", "ai"]);
    expect(line?.map((f) => f.text)).toEqual([
      "En la prueba de Google en móvil, tu web va bien",
      "Google puede leer tu portada sin problemas importantes",
      "Google te muestra en sus resultados",
      "ChatGPT te menciona en todas las preguntas medidas",
    ]);
  });

  it("speaks of real visitors when they set the speed verdict", () => {
    const fieldData = { ...emptyFieldData("ok"), scope: "url" as const, metrics: { lcpMs: 1700, inpMs: 100, cls: 0.01, fcpMs: null, ttfbMs: null } };
    const a = audit({ at: daysAgo(1), facts: facts({ performance: perf(82), fieldData }) });
    expect(fragment(areas({ audits: [a] }), "performance")).toBe("Tus visitantes reales ven tu web rápida");
    expect(fragment(areas({ audits: [a] }, "en"), "performance", "en")).toBe("Your real visitors find your website fast");
  });

  it("names unmeasured areas as not measured, not as good or bad", () => {
    const a = audit({ at: daysAgo(1) });
    // Without a PageSpeed key the speed test was never tried: "not measured yet" is the truth.
    expect(texts(areas({ audits: [a], gscConfig: NOT_CONFIGURED }))).toEqual([
      "La velocidad de tu web aún no se ha medido",
      "Google puede leer tu portada sin problemas importantes",
      "Aún no hemos medido si Google te muestra",
      "Aún no hemos medido tu presencia en IA",
    ]);
  });
});

describe("situationLine: each fragment follows its card's state (AC-003)", () => {
  it("carries the tone its card shows, and neutral where the card makes no judgement", () => {
    const tones = (s: AreaSummaries) => situationLine(s, NOW)?.map((f) => f.tone);
    expect(tones(areas({ audits: [audit({ at: daysAgo(1), facts: facts({ performance: perf(30) }) })], gsc: snapshot() }))).toEqual(["bad", "good", "neutral", "neutral"]);
    expect(tones(areas({ audits: [audit({ at: daysAgo(1), facts: facts({ performance: perf(70) }) })], findings: [finding({ severity: "critical", category: "indexability" })] }))).toEqual(["fair", "bad", "neutral", "neutral"]);
    // A failed attempt could not measure either area: both say so in the bad tone; figures stay neutral.
    expect(tones(areas({ audits: [audit({ at: daysAgo(1), status: "failed", facts: null })], gsc: snapshot() }))).toEqual(["bad", "bad", "neutral", "neutral"]);
  });

  it("performance follows the verdict tone of the score", () => {
    const at = (score: number) => areas({ audits: [audit({ at: daysAgo(1), facts: facts({ performance: perf(score) }) })] });
    expect(fragment(at(95), "performance")).toBe("En la prueba de Google en móvil, tu web va bien");
    expect(fragment(at(70), "performance")).toBe("En la prueba de Google en móvil, tu web podría ir más rápido");
    expect(fragment(at(30), "performance")).toBe("En la prueba de Google en móvil, tu web va lenta");
  });

  it("says an area is being measured, failed or was tried without a result, never that it was not measured", () => {
    const withGsc = (audits: AuditInput[]) => areas({ audits, gsc: snapshot() });
    const running = withGsc([audit({ at: daysAgo(0), status: "running" })]);
    expect(fragment(running, "performance")).toBe("Estamos midiendo la velocidad de tu web");
    expect(fragment(running, "technical")).toBe("Estamos revisando tu portada");
    const failed = withGsc([audit({ at: daysAgo(0), status: "failed" })]);
    expect(fragment(failed, "performance")).toBe("No se pudo medir la velocidad de tu web");
    expect(fragment(failed, "technical")).toBe("No se pudo revisar tu portada");
    // The audit ran and the speed test failed (quota): tried, so never "not measured yet".
    const quota = withGsc([audit({ at: daysAgo(1), facts: facts({ performance: emptyResult("quota_exceeded") }) })]);
    expect(fragment(quota, "performance")).toBe("No se pudo medir la velocidad de tu web");
    const noTechnical = areas({ gsc: snapshot() });
    expect(fragment(noTechnical, "technical")).toBe("Aún no hemos revisado tu portada");
    expect(fragment(noTechnical, "performance")).toBe("La velocidad de tu web aún no se ha medido");
  });

  it("keeps describing the last result while a new attempt runs, as the card does (002 D011)", () => {
    const done = audit({ at: daysAgo(2), facts: facts({ performance: perf(95) }) });
    const running = audit({ at: daysAgo(0), status: "running" });
    const s = areas({ audits: [running, done] });
    expect(fragment(s, "performance")).toBe("En la prueba de Google en móvil, tu web va bien");
    expect(fragment(s, "technical")).toBe("Google puede leer tu portada sin problemas importantes");
  });

  it("technical keeps the audit severity and never turns a partial check into good news (002 AC-013)", () => {
    const one = (f: FindingLike[], readable = true) => areas({ audits: [audit({ at: daysAgo(1), facts: facts({ readable }) })], findings: f, gsc: snapshot() });
    expect(fragment(one([finding({ severity: "critical", category: "indexability" })]), "technical")).toBe("Tu portada tiene problemas que impiden o dificultan que Google la muestre");
    expect(fragment(one([finding({ severity: "warning", category: "metadata" })]), "technical")).toBe("Tu portada tiene aspectos que dificultan que Google la lea");
    // Informational findings alone are «Bien» in the audit, so the fragment is the good one.
    expect(fragment(one([finding({ severity: "info", category: "structured_data" })]), "technical")).toBe("Google puede leer tu portada sin problemas importantes");
    expect(fragment(one([finding({ severity: "critical", category: "access" })], false), "technical")).toBe("La revisión de tu portada fue parcial y ya encontró problemas graves");
    expect(fragment(one([], false), "technical")).toBe("Solo pudimos revisar tu portada en parte");
  });

  it("says Google does not show you yet only with zero impressions in both periods", () => {
    const g = (snap: SearchConsoleSnapshot) => fragment(areas({ audits: [audit({ at: daysAgo(1) })], gsc: snap }), "ranking");
    expect(g(snapshot({ totals: zero, previousTotals: zero }))).toBe("Google aún no te muestra en sus resultados");
    expect(g(snapshot({ totals: zero }))).toBe("Google ha dejado de mostrarte en sus resultados");
    expect(g(snapshot())).toBe("Google te muestra en sus resultados");
    const failed = snapshot({ status: "failed", totals: null, previousTotals: null, errorKind: "no_access", createdAt: daysAgo(0) });
    expect(g(failed)).toBe("No se pudieron leer tus datos de Google");
    expect(fragment(areas({ audits: [audit({ at: daysAgo(1) })] }), "ranking")).toBe("Aún no hemos medido si Google te muestra");
  });

  it("AI follows the evaluated questions and calls an incomplete measurement incomplete", () => {
    const ai = (outcomes: ("yes" | "no" | "none")[]) => fragment(areas({ runs: [answered(outcomes)], prompts: outcomes.length }), "ai");
    expect(ai(["yes", "yes"])).toBe("ChatGPT te menciona en todas las preguntas medidas");
    expect(ai(["yes", "no"])).toBe("ChatGPT te menciona en algunas de las preguntas medidas");
    expect(ai(["no", "no"])).toBe("ChatGPT no te mencionó en las preguntas medidas");
    expect(ai(["yes", "none"])).toBe("La medición en IA quedó incompleta");
    const withGsc = (runs: Run[]) => fragment(areas({ gsc: snapshot(), runs, prompts: 1 }), "ai");
    expect(withGsc([run({ at: daysAgo(0), status: "collecting", questions: [{ id: "p0", outcomes: ["yes"] }] })])).toBe("Estamos midiendo tu presencia en IA");
    expect(withGsc([run({ at: daysAgo(0), questions: [{ id: "p0", outcomes: ["failed"] }] })])).toBe("No se pudo medir tu presencia en IA");
  });

  it("says when a result is more than 30 days old, without the number (the card's notice has it)", () => {
    const old = audit({ at: daysAgo(35), facts: facts({ performance: perf(95) }) });
    const s = areas({ audits: [old] });
    expect(fragment(s, "performance")).toBe("En la prueba de Google en móvil, tu web va bien (datos de hace más de un mes)");
    expect(fragment(s, "technical")).toBe("Google puede leer tu portada sin problemas importantes (datos de hace más de un mes)");
    expect(fragment(areas({ audits: [old], gsc: snapshot({ createdAt: daysAgo(40) }) }), "ranking")).toBe("Google te muestra en sus resultados (datos de hace más de un mes)");
    expect(fragment(areas({ audits: [old], runs: [answered(["yes"], daysAgo(45))], prompts: 1 }), "ai")).toBe("ChatGPT te menciona en todas las preguntas medidas (datos de hace más de un mes)");
    // Not measured is not stale: no age on a fragment without a result.
    expect(fragment(s, "ranking")).toBe("Aún no hemos medido si Google te muestra");
  });

  it("translates every fragment into English", () => {
    const a = audit({ at: daysAgo(1), facts: facts({ performance: perf(95) }) });
    expect(texts(areas({ audits: [a], gsc: snapshot({ totals: zero, previousTotals: zero }) }, "en"), "en")).toEqual([
      "In Google's mobile test, your website does well",
      "Google can read your home page with no important problems",
      "Google does not show you in its results yet",
      "We have not measured your presence in AI yet",
    ]);
  });
});

describe("hasResult: full card or pending row (AC-007)", () => {
  it("needs a score, counts, a Search Console capture (a measured zero counts) or evaluated questions", () => {
    const none = areas();
    expect(AREAS.map((area) => hasResult(area, none))).toEqual([false, false, false, false]);
    const a = audit({ at: daysAgo(1), facts: facts({ readable: false }) });
    const s = areas({ audits: [a], gsc: snapshot({ totals: zero, previousTotals: zero }), runs: [answered(["no"])], prompts: 1 });
    // An unreadable home page: no speed score, but the partial technical check has counts.
    expect(AREAS.map((area) => hasResult(area, s))).toEqual([false, true, true, true]);
  });
});

describe("pendingRows: the reason of each row, in the owner's voice", () => {
  it("lists only areas without a result, in card order, with the card's question", () => {
    const rows = pendingRows(areas({ gscConfig: NOT_CONFIGURED }));
    expect(rows.map((r) => [r.area, r.title])).toEqual([
      ["performance", "¿Cómo funciona tu web?"],
      ["technical", "¿Puede Google leer tu portada?"],
      ["ranking", "¿Te encuentran en Google?"],
      ["ai", "¿Apareces en las respuestas de IA?"],
    ]);
    expect(rows.map((r) => r.reason)).toEqual([
      "Aún no hemos medido la velocidad de tu web.",
      "Aún no hemos revisado tu portada.",
      "Aún no hemos conectado los datos de Google de tu web.",
      "Aún no hemos medido si las respuestas de IA te mencionan.",
    ]);
  });

  it("follows each state: measuring, failed, tried without a result, no data yet", () => {
    const reason = (s: AreaSummaries, area: (typeof AREAS)[number]) => pendingRows(s).find((r) => r.area === area)?.reason;
    const running = areas({ audits: [audit({ at: daysAgo(0), status: "running" })] });
    expect(reason(running, "performance")).toBe("La estamos midiendo ahora.");
    expect(reason(running, "technical")).toBe("La estamos revisando ahora.");
    const failed = areas({ audits: [audit({ at: daysAgo(0), status: "failed" })] });
    expect(reason(failed, "performance")).toBe("El último intento de medirla no terminó.");
    expect(reason(failed, "technical")).toBe("El último intento de revisarla no terminó.");
    // The audit finished and the speed test failed: partial, so it was tried.
    expect(reason(areas({ audits: [audit({ at: daysAgo(1), facts: facts({ performance: emptyResult("error") }) })] }), "performance")).toBe("La última revisión no pudo medirla.");
    expect(reason(areas(), "ranking")).toBe("Aún no hemos traído los datos de Google de tu web.");
    const gscFailed = snapshot({ status: "failed", totals: null, previousTotals: null, errorKind: "no_access", createdAt: daysAgo(0) });
    expect(reason(areas({ gsc: gscFailed }), "ranking")).toBe("No se pudieron leer los datos de Google de tu web.");
    expect(reason(areas({ runs: [run({ at: daysAgo(0), status: "collecting", questions: [{ id: "p0", outcomes: ["yes"] }] })], prompts: 1 }), "ai")).toBe("Estamos recogiendo las respuestas ahora.");
  });
});

describe("situation texts (AC-004)", () => {
  const strings = (node: unknown): string[] =>
    typeof node === "string" ? [node] : node && typeof node === "object" ? Object.values(node).flatMap(strings) : [];
  const AGGREGATE = /\b(en general|en conjunto|vas bien|todo bien|overall|in general|doing well|all good)\b/i;

  it.each([
    ["es", es.overview.situation],
    ["en", en.overview.situation],
  ])("carries no figures and no word that adds areas up (%s)", (_locale, catalog) => {
    // The age template too, applied: it is the only function in the block.
    for (const text of [...strings(catalog), catalog.stale(catalog.performance.good)]) {
      expect(text).not.toMatch(/\d/);
      expect(text).not.toMatch(AGGREGATE);
    }
  });
});
