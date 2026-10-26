import { describe, expect, it } from "vitest";
import { computeGeoMetrics, type MetricsObservation } from "@/modules/geo/metrics";

const prompts = [
  { id: "p1", text: "¿Qué clínica dental me recomiendas?", intent: "discovery" as const },
  { id: "p2", text: "¿Quién ofrece implantes?", intent: "discovery" as const },
  { id: "p3", text: "¿Qué opinan de García?", intent: "branded" as const },
];
const competitors = [
  { id: "c1", name: "Sonrisas" },
  { id: "c2", name: "Vitaldent" },
];

function obs(promptId: string, repetition: number, fields: Partial<MetricsObservation> = {}): MetricsObservation {
  return {
    promptId,
    repetition,
    status: "completed",
    answerPresent: true,
    mentions: { brand: false, competitors: { c1: false, c2: false } },
    ownCited: false,
    competitorsCited: [],
    ...fields,
  };
}

describe("computeGeoMetrics", () => {
  it("separates capture, answer presence and mentions, excluding branded prompts from presence", () => {
    const metrics = computeGeoMetrics({ prompts, competitors }, [
      obs("p1", 1, { mentions: { brand: true, competitors: { c1: true, c2: false } }, ownCited: true }),
      obs("p1", 2, { mentions: { brand: false, competitors: { c1: false, c2: true } } }),
      obs("p2", 1, { answerPresent: false, mentions: null, ownCited: null, competitorsCited: null }),
      obs("p2", 2, { status: "failed", answerPresent: null, mentions: null, ownCited: null, competitorsCited: null }),
      obs("p3", 1, { mentions: { brand: true, competitors: { c1: false, c2: false } } }),
      obs("p3", 2, { status: "pending", answerPresent: null, mentions: null, ownCited: null, competitorsCited: null }),
    ]);
    expect(metrics.capture).toEqual({ k: 4, n: 6 });
    expect(metrics.answers).toEqual({ k: 3, n: 4 });
    expect(metrics.brandPresence).toEqual({ k: 1, n: 2 });
    expect(metrics.citationRate).toEqual({ k: 1, n: 2 });
    expect(metrics.promptCoverage).toEqual({ k: 1, n: 1 });
    expect(metrics.branded).toEqual({ k: 1, n: 1 });
    expect(metrics.shareOfVoice).toEqual({
      total: 3,
      entries: [
        { id: "brand", name: "Tu marca", k: 1 },
        { id: "c1", name: "Sonrisas", k: 1 },
        { id: "c2", name: "Vitaldent", k: 1 },
      ],
    });
    expect(metrics.perPrompt.find((p) => p.promptId === "p1")).toMatchObject({ answered: 2, brandMentions: 1, ownCitations: 1 });
    expect(metrics.perPrompt.find((p) => p.promptId === "p2")).toMatchObject({ answered: 0, captured: 1, scheduled: 2 });
  });

  it("reports no data instead of zero when nothing was answered", () => {
    const metrics = computeGeoMetrics({ prompts, competitors }, [
      obs("p1", 1, { status: "failed", answerPresent: null, mentions: null }),
    ]);
    expect(metrics.brandPresence).toEqual({ k: 0, n: 0 });
    expect(metrics.shareOfVoice).toBeNull();
  });

  it("counts a brand once per answer for share of voice", () => {
    const metrics = computeGeoMetrics({ prompts, competitors }, [
      obs("p1", 1, { mentions: { brand: true, competitors: { c1: true, c2: true } } }),
    ]);
    expect(metrics.shareOfVoice?.total).toBe(3);
  });
});
