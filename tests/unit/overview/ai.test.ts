import { describe, expect, it } from "vitest";
import { summarizeAi } from "@/modules/overview/ai";
import { daysAgo, NOW, run } from "./fixtures";

const q = (id: string, outcome: "yes" | "no" | "none" | "failed", intent?: "branded") => ({ id, intent, outcomes: [outcome] });

describe("summarizeAi", () => {
  it("is not configured without questions or runs, and waiting with questions (AC-004)", () => {
    expect(summarizeAi([], 0, NOW).state).toBe("not_configured");
    const waiting = summarizeAi([], 3, NOW);
    expect(waiting.state).toBe("no_data");
    expect(waiting.coverage).toBeNull();
  });

  it("shows collecting when the first run is still collecting (AC-004)", () => {
    const s = summarizeAi([run({ at: daysAgo(0), status: "collecting", questions: [q("p1", "none")] })], 1, NOW);
    expect(s.state).toBe("analyzing");
    expect(s.reason).toMatch(/Recogiendo/);
  });

  it("counts evaluated questions, lists unanswered ones apart and reports branded separately (AC-012)", () => {
    const questions = [
      q("p1", "yes"),
      q("p2", "yes"),
      q("p3", "no"),
      q("p4", "no"),
      ...["p5", "p6", "p7", "p8", "p9", "p10"].map((id) => q(id, "none")),
      q("b1", "yes", "branded"),
    ];
    const s = summarizeAi([run({ at: daysAgo(1), questions, cited: 1 })], 11, NOW);
    expect(s.coverage).toEqual({ k: 2, n: 4 });
    expect(s.unanswered).toHaveLength(6);
    expect(s.uncovered).toEqual(["Pregunta p3", "Pregunta p4"]);
    expect(s.configured).toBe(11);
    expect(s.branded).toEqual({ questions: 1, mentioned: { k: 1, n: 1 } });
    // Citations are answers, not questions.
    expect(s.citing).toEqual({ k: 1, n: 4 });
    expect(s.state).toBe("partial");
    // Everything was collected: the partial result comes from empty answers, not from capture.
    expect(s.reason).toBe("Resultado parcial: 6 preguntas no obtuvieron respuesta válida.");
  });

  it("treats 0 of 4 as a valid zero and a zero denominator as no data (AC-012)", () => {
    const zero = summarizeAi([run({ at: daysAgo(1), questions: ["a", "b", "c", "d"].map((id) => q(id, "no")) })], 4, NOW);
    expect(zero.coverage).toEqual({ k: 0, n: 4 });
    expect(zero.state).toBe("ok");
    const brandedOnly = summarizeAi([run({ at: daysAgo(1), questions: [q("b1", "yes", "branded"), q("p1", "none")] })], 2, NOW);
    expect(brandedOnly.coverage).toEqual({ k: 0, n: 0 });
    expect(brandedOnly.state).toBe("partial");
    expect(brandedOnly.reason).toMatch(/no podemos decir/);
  });

  it("is an error when every observation failed and there is no earlier result (AC-013)", () => {
    const s = summarizeAi([run({ at: daysAgo(0), questions: [q("p1", "failed"), q("p2", "failed")] })], 2, NOW);
    expect(s.state).toBe("error");
    expect(s.coverage).toBeNull();
  });

  it("is partial when some repetitions failed", () => {
    const s = summarizeAi([run({ at: daysAgo(1), questions: [{ id: "p1", outcomes: ["yes", "failed"] }, q("p2", "no")] })], 2, NOW);
    expect(s.state).toBe("partial");
    expect(s.capture).toEqual({ k: 2, n: 3 });
    expect(s.reason).toMatch(/no se pudieron recoger/);
  });

  it("keeps the dated result while a newer run collects or fails (AC-013)", () => {
    const result = run({ at: daysAgo(35), questions: [q("p1", "yes"), q("p2", "no")] });
    const collecting = summarizeAi([result, run({ at: daysAgo(0), status: "collecting", questions: [q("p1", "none")] })], 2, NOW);
    expect(collecting.runId).toBe(result.id);
    expect(collecting.coverage).toEqual({ k: 1, n: 2 });
    expect(collecting.attempt?.status).toBe("running");
    expect(collecting.stale?.days).toBe(35);
    const failed = summarizeAi([result, run({ at: daysAgo(0), questions: [q("p1", "failed"), q("p2", "failed")] })], 2, NOW);
    expect(failed.runId).toBe(result.id);
    expect(failed.attempt?.status).toBe("failed");
  });

  it("keeps the historical result when every question is archived (AC-004)", () => {
    const s = summarizeAi([run({ at: daysAgo(2), questions: [q("p1", "yes")] })], 0, NOW);
    expect(s.coverage).toEqual({ k: 1, n: 1 });
    expect(s.setupNotice).toMatch(/No hay preguntas activas/);
  });

  describe("comparison (AC-005)", () => {
    const full = (at: Date, key: string, outcomes: ("yes" | "no")[]) => run({ at, key, questions: outcomes.map((o, i) => q(`p${i}`, o)) });

    it("compares consecutive complete runs with the same key and evaluated set", () => {
      const s = summarizeAi([full(daysAgo(3), "A", ["no", "no"]), full(daysAgo(1), "A", ["yes", "no"])], 2, NOW);
      expect(s.change).toEqual({ direction: "better", text: "Antes: 0 de 2" });
    });

    it("does not jump over a different configuration (A/B/A)", () => {
      const s = summarizeAi([full(daysAgo(3), "A", ["no", "no"]), full(daysAgo(2), "B", ["yes", "yes"]), full(daysAgo(1), "A", ["yes", "no"])], 2, NOW);
      expect(s.change).toBeNull();
      expect(s.comparisonNote).toMatch(/otra configuración/);
    });

    it("does not compare partial captures or different evaluated questions", () => {
      const partial = summarizeAi(
        [run({ at: daysAgo(2), key: "A", questions: [{ id: "p0", outcomes: ["no", "failed"] }, q("p1", "no")] }), run({ at: daysAgo(1), key: "A", questions: [{ id: "p0", outcomes: ["yes", "yes"] }, q("p1", "no")] })],
        2,
        NOW,
      );
      expect(partial.change).toBeNull();
      const differentSet = summarizeAi(
        [run({ at: daysAgo(2), key: "A", questions: [q("p0", "no"), q("p1", "none")] }), run({ at: daysAgo(1), key: "A", questions: [q("p0", "yes"), q("p1", "no")] })],
        2,
        NOW,
      );
      expect(differentSet.change).toBeNull();
    });

    it("does not compare two runs that leave the same question without a valid answer (reproduced finding)", () => {
      const s = summarizeAi(
        [run({ at: daysAgo(2), key: "A", questions: [q("p1", "no"), q("p2", "none")] }), run({ at: daysAgo(1), key: "A", questions: [q("p1", "yes"), q("p2", "none")] })],
        2,
        NOW,
      );
      expect(s.state).toBe("partial");
      expect(s.change).toBeNull();
      expect(s.comparisonNote).toMatch(/no está completa/);
    });

    it("does not compare when only the latest run is partial", () => {
      const s = summarizeAi(
        [run({ at: daysAgo(2), key: "A", questions: [q("p1", "no"), q("p2", "no")] }), run({ at: daysAgo(1), key: "A", questions: [q("p1", "yes"), q("p2", "none")] })],
        2,
        NOW,
      );
      expect(s.change).toBeNull();
    });

    it("does not compare when only the previous run is partial", () => {
      const s = summarizeAi(
        [run({ at: daysAgo(2), key: "A", questions: [q("p1", "no"), q("p2", "none")] }), run({ at: daysAgo(1), key: "A", questions: [q("p1", "yes"), q("p2", "no")] })],
        2,
        NOW,
      );
      expect(s.state).toBe("ok");
      expect(s.change).toBeNull();
    });

    it("treats a collected repetition without a valid answer as partial, even if the question was evaluated", () => {
      const s = summarizeAi(
        [
          run({ at: daysAgo(2), key: "A", questions: [{ id: "p1", outcomes: ["no", "no"] }] }),
          run({ at: daysAgo(1), key: "A", questions: [{ id: "p1", outcomes: ["yes", "none"] }] }),
        ],
        1,
        NOW,
      );
      expect(s.state).toBe("partial");
      expect(s.capture).toEqual({ k: 2, n: 2 });
      expect(s.change).toBeNull();
      expect(s.reason).toBe("Resultado parcial: 1 respuesta recogida no tenía contenido válido.");
    });

    it("compares two complete runs with branded questions included", () => {
      const s = summarizeAi(
        [
          run({ at: daysAgo(2), key: "A", questions: [q("p1", "no"), q("b", "yes", "branded")] }),
          run({ at: daysAgo(1), key: "A", questions: [q("p1", "yes"), q("b", "yes", "branded")] }),
        ],
        2,
        NOW,
      );
      expect(s.state).toBe("ok");
      expect(s.change).toEqual({ direction: "better", text: "Antes: 0 de 1" });
    });

    it("does not compare when either denominator is zero", () => {
      const s = summarizeAi([run({ at: daysAgo(2), key: "A", questions: [q("b", "yes", "branded")] }), run({ at: daysAgo(1), key: "A", questions: [q("b", "yes", "branded")] })], 1, NOW);
      expect(s.change).toBeNull();
    });
  });
});
