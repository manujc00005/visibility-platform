import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { audits, geoObservations, geoRuns, providerSpend, reports, workspaces } from "@/db/schema";
import { committedThisMonth } from "@/modules/geo/budget";
import type { CollectResult, DataForSeoClient, SubmitResult } from "@/modules/geo/dataforseo";
import {
  addCompetitor,
  addPrompt,
  createGeoRun,
  getGeoRun,
  listGeoRuns,
  recordManualObservation,
  refreshGeoRun,
  updateBrandAliases,
} from "@/modules/geo/service";
import { createWorkspace } from "@/modules/workspaces/service";
import { createTestDb } from "./db";

const { pool, db } = createTestDb();
afterAll(() => pool.end());
beforeEach(async () => {
  await db.delete(reports);
  await db.delete(audits);
  await db.delete(providerSpend);
  await db.delete(workspaces);
});

async function setup(website = "https://www.clinicagarcia.es/") {
  const ws = await createWorkspace(db, { name: "Clínica Dental García", website, sector: "Clínica dental", country: "ES", city: "Valladolid", services: "Implantes" });
  if (!ws.ok) throw new Error("workspace");
  const id = ws.workspace.id;
  await addCompetitor(db, id, { name: "Vitaldent", website: "vitaldent.com", aliases: "Vital Dent" });
  await addPrompt(db, id, { text: "¿Qué clínica dental me recomiendas en Valladolid?", intent: "discovery" });
  await addPrompt(db, id, { text: "¿Qué opinan los clientes de Clínica Dental García?", intent: "branded" });
  return id;
}

/** DataForSEO double: records submissions and answers collect/readyTags from a map. */
function fakeDataForSeo(options: { submit?: (tags: string[]) => SubmitResult; results?: Map<string, CollectResult>; ready?: { id: string; tag: string }[] } = {}) {
  const submitted: string[][] = [];
  const client: DataForSeoClient = {
    async submit(tasks) {
      const tags = tasks.map((t) => t.tag);
      submitted.push(tags);
      return (
        options.submit?.(tags) ?? {
          kind: "answered",
          tasks: tags.map((tag, i) => ({ tag, id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, created: true, costUsd: 0.0012, message: "20100 Task Created." })),
        }
      );
    },
    async collect(taskId) {
      return options.results?.get(taskId) ?? { state: "pending" };
    },
    async readyTags() {
      return options.ready ?? [];
    },
  };
  return { client, submitted };
}

const usd = (value: string) => Math.round(Number(value) * 1_000_000);

describe("manual (assisted) measurements", () => {
  it("freezes the panel: aliases added after the run do not change its results", async () => {
    const id = await setup();
    const created = await createGeoRun(db, id, { provider: "manual" }, { dataforseo: null, budgetCapMicros: null });
    if (!created.ok) throw new Error(created.error);
    await updateBrandAliases(db, id, { aliases: "Sonrisas Pepe" });

    const view = await getGeoRun(db, id, created.value.id);
    expect(view!.run.config.panel.brand.aliases).toEqual([]);
    expect(view!.observations).toHaveLength(2);
    const [discovery] = view!.observations;
    const result = await recordManualObservation(db, id, created.value.id, discovery!.id, {
      answer: "Te recomiendo Sonrisas Pepe o Vital Dent en Valladolid.",
      sources: "https://www.vitaldent.com/clinicas\nhttps://www.doctoralia.es/x",
    });
    expect(result.ok && result.value).toMatchObject({
      status: "completed",
      answerPresent: true,
      mentions: { brand: false, competitors: expect.any(Object) },
      ownCited: false,
    });
    expect(result.ok && Object.values(result.value.mentions!.competitors)).toEqual([true]);
    expect(await db.select().from(providerSpend)).toHaveLength(0);
  });

  it("completes the run when every observation is recorded and computes fractions", async () => {
    const id = await setup();
    const created = await createGeoRun(db, id, { provider: "manual", repetitions: 3 }, { dataforseo: null, budgetCapMicros: null });
    if (!created.ok) throw new Error(created.error);
    const view = await getGeoRun(db, id, created.value.id);
    expect(view!.observations).toHaveLength(2); // manual runs use one repetition
    const [first, second] = view!.observations;
    await recordManualObservation(db, id, created.value.id, first!.id, { answer: "Clínica Dental García es muy buena. https://clinicagarcia.es", sources: "https://clinicagarcia.es/" });
    await recordManualObservation(db, id, created.value.id, second!.id, { noAnswer: "true" });
    const done = await getGeoRun(db, id, created.value.id);
    expect(done!.run.status).toBe("completed");
    expect(done!.metrics.brandPresence).toEqual({ k: 1, n: 1 });
    expect(done!.metrics.citationRate).toEqual({ k: 1, n: 1 });
    expect(done!.metrics.answers).toEqual({ k: 1, n: 2 });
  });

  it("rejects recording twice, invalid sources and empty answers", async () => {
    const id = await setup();
    const created = await createGeoRun(db, id, { provider: "manual" }, { dataforseo: null, budgetCapMicros: null });
    if (!created.ok) throw new Error(created.error);
    const [obs] = (await getGeoRun(db, id, created.value.id))!.observations;
    expect((await recordManualObservation(db, id, created.value.id, obs!.id, { answer: "" })).ok).toBe(false);
    expect(await recordManualObservation(db, id, created.value.id, obs!.id, { answer: "x", sources: "javascript:alert(1)" })).toMatchObject({ ok: false, error: "validation" });
    expect((await recordManualObservation(db, id, created.value.id, obs!.id, { answer: "x" })).ok).toBe(true);
    expect(await recordManualObservation(db, id, created.value.id, obs!.id, { answer: "y" })).toMatchObject({ ok: false, error: "not_pending" });
  });

  it("needs at least one active question", async () => {
    const ws = await createWorkspace(db, { name: "Sin preguntas", website: "sinpreguntas.es", sector: "x", country: "ES", city: "", services: "x" });
    if (!ws.ok) throw new Error("ws");
    expect(await createGeoRun(db, ws.workspace.id, { provider: "manual" }, { dataforseo: null, budgetCapMicros: null })).toMatchObject({ ok: false, error: "no_prompts" });
  });
});

describe("paid measurements (DataForSEO) and budget (B04)", () => {
  it("is fail-closed: without a configured budget nothing is created or reserved", async () => {
    const id = await setup();
    const { client, submitted } = fakeDataForSeo();
    expect(await createGeoRun(db, id, { provider: "dataforseo_chatgpt", repetitions: 2 }, { dataforseo: client, budgetCapMicros: null })).toMatchObject({
      ok: false,
      error: "budget_not_configured",
    });
    expect(submitted).toEqual([]);
    expect(await db.select().from(geoRuns)).toHaveLength(0);
    expect(await db.select().from(providerSpend)).toHaveLength(0);
  });

  it("refuses runs that would exceed the cap, creating nothing", async () => {
    const id = await setup();
    const { client, submitted } = fakeDataForSeo();
    // 2 prompts × 3 repetitions × 0.0012 = 0.0072 USD > 0.005 cap
    expect(await createGeoRun(db, id, { provider: "dataforseo_chatgpt", repetitions: 3 }, { dataforseo: client, budgetCapMicros: usd("0.005") })).toMatchObject({
      ok: false,
      error: "budget_exceeded",
    });
    expect(submitted).toEqual([]);
    expect(await db.select().from(geoObservations)).toHaveLength(0);
  });

  it("serializes concurrent reservations so the cap holds", async () => {
    const id = await setup();
    const { client } = fakeDataForSeo();
    const cap = usd("0.005"); // fits one run of 2 prompts × 2 reps (0.0048), not two
    const results = await Promise.all([
      createGeoRun(db, id, { provider: "dataforseo_chatgpt", repetitions: 2 }, { dataforseo: client, budgetCapMicros: cap }),
      createGeoRun(db, id, { provider: "dataforseo_chatgpt", repetitions: 2 }, { dataforseo: client, budgetCapMicros: cap }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ error: "budget_exceeded" });
    expect(await committedThisMonth(db)).toBe(4_800);
  });

  it("settles created tasks at the provider cost and releases rejected ones", async () => {
    const id = await setup();
    const { client } = fakeDataForSeo({
      submit: (tags) => ({
        kind: "answered",
        tasks: tags.map((tag, i) =>
          i === 0
            ? { tag, id: "11111111-1111-4111-8111-111111111111", created: true, costUsd: 0.0012, message: "20100" }
            : { tag, id: null, created: false, costUsd: 0, message: "40501 Invalid Field" },
        ),
      }),
    });
    const created = await createGeoRun(db, id, { provider: "dataforseo_chatgpt" }, { dataforseo: client, budgetCapMicros: usd("1") });
    if (!created.ok) throw new Error(created.error);
    const spend = await db.select().from(providerSpend).orderBy(providerSpend.status);
    expect(spend.map((s) => [s.status, s.amountMicroUsd])).toEqual([
      ["released", 1_200],
      ["settled", 1_200],
    ]);
    expect(await committedThisMonth(db)).toBe(1_200);
    const view = await getGeoRun(db, id, created.value.id);
    expect(view!.observations.map((o) => o.status).sort()).toEqual(["failed", "submitted"]);
  });

  it("keeps uncertain submissions counted against the budget (never released by timeout)", async () => {
    const id = await setup();
    const { client } = fakeDataForSeo({ submit: () => ({ kind: "uncertain", message: "TimeoutError" }) });
    const created = await createGeoRun(db, id, { provider: "dataforseo_chatgpt" }, { dataforseo: client, budgetCapMicros: usd("1") });
    if (!created.ok) throw new Error(created.error);
    expect((await db.select().from(providerSpend)).map((s) => s.status)).toEqual(["uncertain", "uncertain"]);
    expect(await committedThisMonth(db)).toBe(2_400);
  });

  it("releases everything when the provider refuses the request (e.g. insufficient funds)", async () => {
    const id = await setup();
    const { client } = fakeDataForSeo({ submit: () => ({ kind: "rejected", message: "40210 insufficient funds." }) });
    const created = await createGeoRun(db, id, { provider: "dataforseo_chatgpt" }, { dataforseo: client, budgetCapMicros: usd("1") });
    if (!created.ok) throw new Error(created.error);
    expect(await committedThisMonth(db)).toBe(0);
    expect((await getGeoRun(db, id, created.value.id))!.run.status).toBe("completed");
  });
});

describe("collecting results (submit/poll) and reconciliation", () => {
  it("collects ready answers, keeps queued ones pending and completes the run at the end", async () => {
    const id = await setup();
    const results = new Map<string, CollectResult>();
    const { client } = fakeDataForSeo({ results });
    const created = await createGeoRun(db, id, { provider: "dataforseo_chatgpt" }, { dataforseo: client, budgetCapMicros: usd("1") });
    if (!created.ok) throw new Error(created.error);
    const [a, b] = (await getGeoRun(db, id, created.value.id))!.observations;
    results.set(a!.providerTaskId!, {
      state: "ready",
      markdown: "La mejor es **Clínica Dental García** ([web](https://www.clinicagarcia.es)).",
      sources: [{ url: "https://www.clinicagarcia.es/", title: "García" }],
    });
    expect(await refreshGeoRun(db, id, created.value.id, { dataforseo: client, budgetCapMicros: usd("1") })).toEqual({ ok: true, value: { collected: 1, reconciled: 0 } });
    let view = await getGeoRun(db, id, created.value.id);
    expect(view!.run.status).toBe("collecting");
    expect(view!.observations.find((o) => o.id === a!.id)).toMatchObject({ status: "completed", ownCited: true, mentions: { brand: true } });

    results.set(b!.providerTaskId!, { state: "ready", markdown: "", sources: [] });
    await refreshGeoRun(db, id, created.value.id, { dataforseo: client, budgetCapMicros: usd("1") });
    view = await getGeoRun(db, id, created.value.id);
    expect(view!.run.status).toBe("completed");
    expect(view!.metrics.answers).toEqual({ k: 1, n: 2 });
    // A second refresh is a no-op.
    expect(await refreshGeoRun(db, id, created.value.id, { dataforseo: client, budgetCapMicros: usd("1") })).toEqual({ ok: true, value: { collected: 0, reconciled: 0 } });
  });

  it("reconciles uncertain submissions through tasks_ready tags", async () => {
    const id = await setup();
    const uncertain = fakeDataForSeo({ submit: () => ({ kind: "uncertain", message: "TimeoutError" }) });
    const created = await createGeoRun(db, id, { provider: "dataforseo_chatgpt" }, { dataforseo: uncertain.client, budgetCapMicros: usd("1") });
    if (!created.ok) throw new Error(created.error);
    const [a] = (await getGeoRun(db, id, created.value.id))!.observations;
    const taskId = "22222222-2222-4222-8222-222222222222";
    const later = fakeDataForSeo({ ready: [{ id: taskId, tag: a!.tag }], results: new Map([[taskId, { state: "ready", markdown: "Hola", sources: [] }]]) });
    const refreshed = await refreshGeoRun(db, id, created.value.id, { dataforseo: later.client, budgetCapMicros: usd("1") });
    expect(refreshed).toEqual({ ok: true, value: { collected: 1, reconciled: 1 } });
    const spend = await db.select().from(providerSpend).where(eq(providerSpend.observationId, a!.id));
    expect(spend[0]!.status).toBe("settled");
  });

  it("marks paid observations that were never submitted (crash) as uncertain after the timeout", async () => {
    const id = await setup();
    const { client } = fakeDataForSeo();
    const created = await createGeoRun(db, id, { provider: "dataforseo_chatgpt" }, { dataforseo: client, budgetCapMicros: usd("1") });
    if (!created.ok) throw new Error(created.error);
    // Simulate a crash: put observations back to pending and age the run.
    await db.update(geoObservations).set({ status: "pending", providerTaskId: null }).where(eq(geoObservations.runId, created.value.id));
    await db.update(providerSpend).set({ status: "reserved" }).where(eq(providerSpend.runId, created.value.id));
    await db.update(geoRuns).set({ createdAt: sql`now() - interval '5 minutes'` }).where(eq(geoRuns.id, created.value.id));
    await refreshGeoRun(db, id, created.value.id, { dataforseo: client, budgetCapMicros: usd("1") });
    const view = await getGeoRun(db, id, created.value.id);
    expect(view!.observations.map((o) => o.status)).toEqual(["uncertain", "uncertain"]);
    expect((await db.select().from(providerSpend)).every((s) => s.status === "uncertain")).toBe(true);
  });

  it("does not touch a recent run's pending observations", async () => {
    const id = await setup();
    const { client } = fakeDataForSeo();
    const created = await createGeoRun(db, id, { provider: "dataforseo_chatgpt" }, { dataforseo: client, budgetCapMicros: usd("1") });
    if (!created.ok) throw new Error(created.error);
    await db.update(geoObservations).set({ status: "pending" }).where(eq(geoObservations.runId, created.value.id));
    await refreshGeoRun(db, id, created.value.id, { dataforseo: client, budgetCapMicros: usd("1") });
    expect((await getGeoRun(db, id, created.value.id))!.observations.every((o) => o.status === "pending")).toBe(true);
  });
});

describe("isolation and history", () => {
  it("never returns or modifies another workspace's runs", async () => {
    const a = await setup();
    const b = await setup("otra-clinica.es");
    const run = await createGeoRun(db, a, { provider: "manual" }, { dataforseo: null, budgetCapMicros: null });
    if (!run.ok) throw new Error(run.error);
    const [obs] = (await getGeoRun(db, a, run.value.id))!.observations;
    expect(await getGeoRun(db, b, run.value.id)).toBeNull();
    expect(await recordManualObservation(db, b, run.value.id, obs!.id, { answer: "x" })).toMatchObject({ ok: false, error: "not_found" });
    expect(await listGeoRuns(db, b)).toEqual([]);
  });

  it("gives equal methodology keys only to equal configurations", async () => {
    const id = await setup();
    const one = await createGeoRun(db, id, { provider: "manual" }, { dataforseo: null, budgetCapMicros: null });
    const two = await createGeoRun(db, id, { provider: "manual" }, { dataforseo: null, budgetCapMicros: null });
    await addPrompt(db, id, { text: "¿Quién ofrece implantes en Valladolid?", intent: "discovery" });
    const three = await createGeoRun(db, id, { provider: "manual" }, { dataforseo: null, budgetCapMicros: null });
    if (!one.ok || !two.ok || !three.ok) throw new Error("setup");
    expect(one.value.methodologyKey).toBe(two.value.methodologyKey);
    expect(three.value.methodologyKey).not.toBe(one.value.methodologyKey);
  });
});
