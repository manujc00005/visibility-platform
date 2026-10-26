import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { logger } from "@/lib/logger";
import {
  BudgetExceededError,
  BudgetNotConfiguredError,
  markSpendUncertain,
  releaseSpend,
  reserveSpend,
  settleSpend,
  usdFloatToMicros,
} from "@/modules/geo/budget";
import { DATAFORSEO_PRICE, type DataForSeoClient } from "@/modules/geo/dataforseo";
import { classifySources, detectMentions, type BrandPanel } from "@/modules/geo/detection";
import { computeGeoMetrics, type GeoMetrics } from "@/modules/geo/metrics";
import type { PromptIntent } from "@/modules/geo/prompt-suggestions";
import {
  geoCompetitors,
  geoObservations,
  geoPrompts,
  geoRuns,
  type GeoCompetitor,
  type GeoObservation,
  type GeoPrompt,
  type GeoRun,
  type GeoRunConfig,
} from "@/modules/geo/schema";
import { normalizeWebsite, WEBSITE_ERROR_MESSAGES } from "@/modules/workspaces/domain";
import { workspaces } from "@/modules/workspaces/schema";
import { getWorkspace } from "@/modules/workspaces/service";

/** Bump when detection, metrics or capture semantics change: runs stop being comparable. */
export const GEO_METHODOLOGY_VERSION = "geo-2026-10-25.1";
export const GEO_NORMALIZER_VERSION = "mentions-v1";
export const MAX_ACTIVE_PROMPTS = 25;
export const MAX_ACTIVE_COMPETITORS = 5;
/** A paid observation still "pending" after this long was probably never sent (crash): treat as uncertain. */
export const PENDING_SUBMIT_TIMEOUT_MS = 2 * 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: string) => UUID.test(value);

export type FieldErrors = Record<string, string[]>;
type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E; fieldErrors?: FieldErrors };

function fieldErrorsOf(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) (out[String(issue.path[0] ?? "form")] ??= []).push(issue.message);
  return out;
}

const lines = (max: number, maxLength: number, label: string) =>
  z
    .string()
    .default("")
    .transform((value) => [...new Set(value.split(/\r?\n/).map((v) => v.trim()).filter(Boolean))])
    .pipe(z.array(z.string().max(maxLength, `Cada ${label} admite como máximo ${maxLength} caracteres.`)).max(max, `Como máximo ${max} ${label}s.`));

// --- Brand and competitors ------------------------------------------------------------

export async function updateBrandAliases(db: Database, workspaceId: string, raw: unknown): Promise<Result<string[], "not_found" | "validation">> {
  const parsed = z.object({ aliases: lines(10, 80, "alias") }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "validation", fieldErrors: fieldErrorsOf(parsed.error) };
  if (!isUuid(workspaceId)) return { ok: false, error: "not_found" };
  const [row] = await db
    .update(workspaces)
    .set({ brandAliases: parsed.data.aliases, updatedAt: sql`now()` })
    .where(eq(workspaces.id, workspaceId))
    .returning({ aliases: workspaces.brandAliases });
  return row ? { ok: true, value: row.aliases } : { ok: false, error: "not_found" };
}

const competitorSchema = z.object({
  name: z.string({ error: "Indica el nombre." }).trim().min(1, "Indica el nombre.").max(120, "Máximo 120 caracteres."),
  website: z.string().default(""),
  aliases: lines(10, 80, "alias"),
});

export async function addCompetitor(
  db: Database,
  workspaceId: string,
  raw: unknown,
): Promise<Result<GeoCompetitor, "not_found" | "validation" | "limit">> {
  const parsed = competitorSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "validation", fieldErrors: fieldErrorsOf(parsed.error) };
  let domain: string | null = null;
  if (parsed.data.website.trim()) {
    const website = normalizeWebsite(parsed.data.website);
    if (!website.ok) return { ok: false, error: "validation", fieldErrors: { website: [WEBSITE_ERROR_MESSAGES[website.error]] } };
    domain = website.value.domain;
  }
  if (!(await getWorkspace(db, workspaceId))) return { ok: false, error: "not_found" };
  const active = await listCompetitors(db, workspaceId);
  if (active.length >= MAX_ACTIVE_COMPETITORS) return { ok: false, error: "limit" };
  const [row] = await db
    .insert(geoCompetitors)
    .values({ workspaceId, name: parsed.data.name, aliases: parsed.data.aliases, domain })
    .returning();
  return { ok: true, value: row! };
}

export async function archiveCompetitor(db: Database, workspaceId: string, competitorId: string): Promise<boolean> {
  if (!isUuid(workspaceId) || !isUuid(competitorId)) return false;
  const rows = await db
    .update(geoCompetitors)
    .set({ status: "archived" })
    .where(and(eq(geoCompetitors.id, competitorId), eq(geoCompetitors.workspaceId, workspaceId)))
    .returning({ id: geoCompetitors.id });
  return rows.length === 1;
}

export async function listCompetitors(db: Database, workspaceId: string): Promise<GeoCompetitor[]> {
  if (!isUuid(workspaceId)) return [];
  return db
    .select()
    .from(geoCompetitors)
    .where(and(eq(geoCompetitors.workspaceId, workspaceId), eq(geoCompetitors.status, "active")))
    .orderBy(asc(geoCompetitors.createdAt));
}

// --- Prompts ----------------------------------------------------------------------------

const promptSchema = z.object({
  text: z.string({ error: "Escribe la pregunta." }).trim().min(5, "La pregunta es demasiado corta.").max(400, "Máximo 400 caracteres."),
  intent: z.enum(["discovery", "recommendation", "comparison", "branded"], { error: "Tipo de pregunta no válido." }),
});

export async function addPrompt(db: Database, workspaceId: string, raw: unknown): Promise<Result<GeoPrompt, "not_found" | "validation" | "limit" | "duplicate">> {
  const parsed = promptSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "validation", fieldErrors: fieldErrorsOf(parsed.error) };
  if (!(await getWorkspace(db, workspaceId))) return { ok: false, error: "not_found" };
  const active = await listPrompts(db, workspaceId);
  if (active.length >= MAX_ACTIVE_PROMPTS) return { ok: false, error: "limit" };
  if (active.some((p) => p.text.toLocaleLowerCase("es") === parsed.data.text.toLocaleLowerCase("es"))) {
    return { ok: false, error: "duplicate" };
  }
  const [row] = await db.insert(geoPrompts).values({ workspaceId, ...parsed.data }).returning();
  return { ok: true, value: row! };
}

export async function archivePrompt(db: Database, workspaceId: string, promptId: string): Promise<boolean> {
  if (!isUuid(workspaceId) || !isUuid(promptId)) return false;
  const rows = await db
    .update(geoPrompts)
    .set({ status: "archived" })
    .where(and(eq(geoPrompts.id, promptId), eq(geoPrompts.workspaceId, workspaceId)))
    .returning({ id: geoPrompts.id });
  return rows.length === 1;
}

export async function listPrompts(db: Database, workspaceId: string): Promise<GeoPrompt[]> {
  if (!isUuid(workspaceId)) return [];
  return db
    .select()
    .from(geoPrompts)
    .where(and(eq(geoPrompts.workspaceId, workspaceId), eq(geoPrompts.status, "active")))
    .orderBy(asc(geoPrompts.createdAt));
}

// --- Runs -------------------------------------------------------------------------------

export interface GeoDeps {
  /** null when credentials are not configured. */
  dataforseo: DataForSeoClient | null;
  /** Monthly cap in micro-USD; null = not configured (paid runs refused). */
  budgetCapMicros: number | null;
  now?: () => Date;
}

const LANGUAGE_BY_COUNTRY: Record<string, string> = { ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", PT: "pt", FR: "fr", IT: "it", DE: "de" };
const englishRegion = new Intl.DisplayNames(["en"], { type: "region" });

/** Canonical JSON (sorted keys) so equal configurations hash equally. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function methodologyKey(config: GeoRunConfig): string {
  return createHash("sha256").update(canonical(config)).digest("hex");
}

export type CreateRunError = "not_found" | "no_prompts" | "provider_unavailable" | "budget_not_configured" | "budget_exceeded" | "validation";

export async function createGeoRun(
  db: Database,
  workspaceId: string,
  raw: unknown,
  deps: GeoDeps,
): Promise<Result<GeoRun, CreateRunError>> {
  const parsed = z
    .object({ provider: z.enum(["manual", "dataforseo_chatgpt"]), repetitions: z.coerce.number().int().min(1).max(3).default(1) })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "validation", fieldErrors: fieldErrorsOf(parsed.error) };
  const { provider } = parsed.data;
  const repetitions = provider === "manual" ? 1 : parsed.data.repetitions;
  if (provider === "dataforseo_chatgpt" && !deps.dataforseo) return { ok: false, error: "provider_unavailable" };

  const workspace = await getWorkspace(db, workspaceId);
  if (!workspace) return { ok: false, error: "not_found" };
  const [prompts, competitors] = await Promise.all([listPrompts(db, workspace.id), listCompetitors(db, workspace.id)]);
  if (prompts.length === 0) return { ok: false, error: "no_prompts" };

  const panel: BrandPanel = {
    brand: { name: workspace.name, aliases: workspace.brandAliases, domain: workspace.domain },
    competitors: competitors.map((c) => ({ id: c.id, name: c.name, aliases: c.aliases, domain: c.domain })),
  };
  const config: GeoRunConfig = {
    methodologyVersion: GEO_METHODOLOGY_VERSION,
    normalizerVersion: GEO_NORMALIZER_VERSION,
    provider,
    surface: "chatgpt",
    captureCondition: provider === "manual" ? "manual_ui" : "ui_scraper",
    repetitions,
    location: {
      countryCode: workspace.country,
      locationName: englishRegion.of(workspace.country) ?? workspace.country,
      languageCode: LANGUAGE_BY_COUNTRY[workspace.country] ?? "en",
    },
    providerParams: provider === "manual" ? {} : { queue: "standard", forceWebSearch: true, priceVersion: DATAFORSEO_PRICE.version },
    panel,
    prompts: prompts.map((p) => ({ id: p.id, text: p.text, intent: p.intent as PromptIntent })),
  };

  const runId = randomUUID();
  const observations = config.prompts.flatMap((prompt) =>
    Array.from({ length: repetitions }, (_, i) => {
      const id = randomUUID();
      return { id, runId, workspaceId: workspace.id, promptId: prompt.id, repetition: i + 1, tag: `vp-${id}`, status: "pending" as const };
    }),
  );

  let run: GeoRun;
  try {
    run = await db.transaction(async (tx) => {
      const [created] = await tx.insert(geoRuns).values({ id: runId, workspaceId: workspace.id, provider, config, methodologyKey: methodologyKey(config) }).returning();
      await tx.insert(geoObservations).values(observations);
      if (provider === "dataforseo_chatgpt") {
        await reserveSpend(tx, deps.budgetCapMicros, {
          provider: "dataforseo",
          operation: "chatgpt_llm_scraper_task",
          priceVersion: DATAFORSEO_PRICE.version,
          unitMicros: DATAFORSEO_PRICE.unitMicros,
          workspaceId: workspace.id,
          runId,
          observationIds: observations.map((o) => o.id),
        });
      }
      return created!;
    });
  } catch (error) {
    if (error instanceof BudgetNotConfiguredError) return { ok: false, error: "budget_not_configured" };
    if (error instanceof BudgetExceededError) return { ok: false, error: "budget_exceeded" };
    throw error;
  }

  if (provider === "dataforseo_chatgpt") await submitToDataForSeo(db, run, observations, deps.dataforseo!, deps.now);
  logger.info({ workspaceId, runId, provider, observations: observations.length }, "geo run created");
  return { ok: true, value: run };
}

async function submitToDataForSeo(
  db: Database,
  run: GeoRun,
  observations: { id: string; promptId: string; tag: string }[],
  client: DataForSeoClient,
  now: (() => Date) | undefined,
): Promise<void> {
  const promptText = new Map(run.config.prompts.map((p) => [p.id, p.text]));
  const submittedAt = (now ?? (() => new Date()))();
  for (let i = 0; i < observations.length; i += 100) {
    const batch = observations.slice(i, i + 100);
    const result = await client.submit(
      batch.map((o) => ({
        tag: o.tag,
        keyword: promptText.get(o.promptId)!,
        locationName: run.config.location.locationName,
        languageCode: run.config.location.languageCode,
        forceWebSearch: true,
      })),
    );
    for (const observation of batch) {
      if (result.kind === "uncertain") {
        await db.update(geoObservations).set({ status: "uncertain", error: result.message }).where(eq(geoObservations.id, observation.id));
        await markSpendUncertain(db, observation.id);
        continue;
      }
      if (result.kind === "rejected") {
        await db.update(geoObservations).set({ status: "failed", error: result.message }).where(eq(geoObservations.id, observation.id));
        await releaseSpend(db, observation.id);
        continue;
      }
      const task = result.tasks.find((t) => t.tag === observation.tag)!;
      if (task.created && task.id) {
        const cost = usdFloatToMicros(task.costUsd);
        await db
          .update(geoObservations)
          .set({ status: "submitted", providerTaskId: task.id, submittedAt, costMicroUsd: cost })
          .where(eq(geoObservations.id, observation.id));
        await settleSpend(db, observation.id, cost);
      } else {
        // "Charged only for setting a task": a task that was not created was not charged.
        await db.update(geoObservations).set({ status: "failed", error: task.message }).where(eq(geoObservations.id, observation.id));
        await releaseSpend(db, observation.id);
      }
    }
  }
  await updateRunCompletion(db, run.id);
}

function completedFields(config: GeoRunConfig, text: string, sources: { url: string; title: string | null }[], observedAt: Date) {
  const answer = text.slice(0, 20_000);
  const answerPresent = answer.trim().length > 0;
  const classified = classifySources(sources.slice(0, 50), config.panel);
  return {
    status: "completed" as const,
    responseText: answer,
    answerPresent,
    mentions: detectMentions(answerPresent ? answer : "", config.panel),
    sources: classified.sources,
    ownCited: classified.ownCited,
    competitorsCited: classified.competitorsCited,
    observedAt,
    error: null,
  };
}

async function updateRunCompletion(db: Database, runId: string): Promise<void> {
  const [open] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(geoObservations)
    .where(and(eq(geoObservations.runId, runId), inArray(geoObservations.status, ["pending", "submitted"])));
  if (open!.n === 0) {
    await db.update(geoRuns).set({ status: "completed", completedAt: sql`now()` }).where(and(eq(geoRuns.id, runId), eq(geoRuns.status, "collecting")));
  }
}

const manualSchema = z.object({
  answer: z.string().default("").transform((v) => v.trim()).pipe(z.string().max(20_000, "Máximo 20.000 caracteres.")),
  sources: lines(30, 2_000, "fuente"),
  noAnswer: z.coerce.boolean().default(false),
});

/** Stores an answer the operator observed in ChatGPT's web interface (assisted capture, no cost). */
export async function recordManualObservation(
  db: Database,
  workspaceId: string,
  runId: string,
  observationId: string,
  raw: unknown,
  now: () => Date = () => new Date(),
): Promise<Result<GeoObservation, "not_found" | "validation" | "not_pending">> {
  const parsed = manualSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "validation", fieldErrors: fieldErrorsOf(parsed.error) };
  if (!parsed.data.noAnswer && !parsed.data.answer) {
    return { ok: false, error: "validation", fieldErrors: { answer: ["Pega la respuesta o marca «Sin respuesta»."] } };
  }
  const invalidSource = parsed.data.sources.find((s) => {
    try {
      return !["http:", "https:"].includes(new URL(s).protocol);
    } catch {
      return true;
    }
  });
  if (invalidSource) return { ok: false, error: "validation", fieldErrors: { sources: [`URL no válida: ${invalidSource.slice(0, 80)}`] } };

  const run = await getRunRow(db, workspaceId, runId);
  if (!run || run.provider !== "manual" || !isUuid(observationId)) return { ok: false, error: "not_found" };
  const fields = completedFields(
    run.config,
    parsed.data.noAnswer ? "" : parsed.data.answer,
    parsed.data.sources.map((url) => ({ url, title: null })),
    now(),
  );
  const [row] = await db
    .update(geoObservations)
    .set(fields)
    .where(and(eq(geoObservations.id, observationId), eq(geoObservations.runId, run.id), eq(geoObservations.status, "pending")))
    .returning();
  if (!row) return { ok: false, error: "not_pending" };
  await updateRunCompletion(db, run.id);
  return { ok: true, value: row };
}

/**
 * Collects DataForSEO results that are ready and reconciles uncertain submissions.
 * Safe to call repeatedly: every transition is conditional on the current status.
 */
export async function refreshGeoRun(db: Database, workspaceId: string, runId: string, deps: GeoDeps): Promise<Result<{ collected: number; reconciled: number }, "not_found" | "provider_unavailable">> {
  const run = await getRunRow(db, workspaceId, runId);
  if (!run) return { ok: false, error: "not_found" };
  if (run.provider !== "dataforseo_chatgpt") return { ok: true, value: { collected: 0, reconciled: 0 } };
  if (!deps.dataforseo) return { ok: false, error: "provider_unavailable" };
  const now = (deps.now ?? (() => new Date()))();

  // Paid observations never submitted (crash between commit and POST): we cannot know → uncertain.
  if (now.getTime() - run.createdAt.getTime() > PENDING_SUBMIT_TIMEOUT_MS) {
    const stale = await db
      .update(geoObservations)
      .set({ status: "uncertain", error: "No consta el envío al proveedor." })
      .where(and(eq(geoObservations.runId, run.id), eq(geoObservations.status, "pending")))
      .returning({ id: geoObservations.id });
    for (const s of stale) await markSpendUncertain(db, s.id);
  }

  let reconciled = 0;
  const uncertain = await db.select().from(geoObservations).where(and(eq(geoObservations.runId, run.id), eq(geoObservations.status, "uncertain")));
  if (uncertain.length > 0) {
    const ready = new Map((await deps.dataforseo.readyTags()).map((r) => [r.tag, r.id]));
    for (const observation of uncertain) {
      const taskId = ready.get(observation.tag);
      if (!taskId) continue;
      await db
        .update(geoObservations)
        .set({ status: "submitted", providerTaskId: taskId, error: null })
        .where(and(eq(geoObservations.id, observation.id), eq(geoObservations.status, "uncertain")));
      await settleSpend(db, observation.id, null);
      reconciled += 1;
    }
  }

  let collected = 0;
  const submitted = await db
    .select()
    .from(geoObservations)
    .where(and(eq(geoObservations.runId, run.id), eq(geoObservations.status, "submitted")))
    .limit(100);
  for (const observation of submitted) {
    const result = await deps.dataforseo.collect(observation.providerTaskId ?? "");
    if (result.state === "ready") {
      await db
        .update(geoObservations)
        .set(completedFields(run.config, result.markdown, result.sources, now))
        .where(and(eq(geoObservations.id, observation.id), eq(geoObservations.status, "submitted")));
      collected += 1;
    } else if (result.state === "not_found") {
      await db
        .update(geoObservations)
        .set({ status: "failed", error: "El proveedor no encuentra la tarea." })
        .where(and(eq(geoObservations.id, observation.id), eq(geoObservations.status, "submitted")));
    } else if (result.state === "error") {
      await db.update(geoObservations).set({ error: result.message }).where(eq(geoObservations.id, observation.id));
    }
  }
  await updateRunCompletion(db, run.id);
  return { ok: true, value: { collected, reconciled } };
}

async function getRunRow(db: Database, workspaceId: string, runId: string): Promise<GeoRun | null> {
  if (!isUuid(workspaceId) || !isUuid(runId)) return null;
  const [run] = await db.select().from(geoRuns).where(and(eq(geoRuns.id, runId), eq(geoRuns.workspaceId, workspaceId)));
  return run ?? null;
}

export interface GeoRunView {
  run: GeoRun;
  observations: GeoObservation[];
  metrics: GeoMetrics;
}

function metricsOf(run: GeoRun, observations: GeoObservation[]): GeoMetrics {
  return computeGeoMetrics(
    { prompts: run.config.prompts, competitors: run.config.panel.competitors.map((c) => ({ id: c.id, name: c.name })) },
    observations.map((o) => ({
      promptId: o.promptId,
      repetition: o.repetition,
      status: o.status,
      answerPresent: o.answerPresent,
      mentions: o.mentions,
      ownCited: o.ownCited,
      competitorsCited: o.competitorsCited,
    })),
  );
}

export async function getGeoRun(db: Database, workspaceId: string, runId: string): Promise<GeoRunView | null> {
  const run = await getRunRow(db, workspaceId, runId);
  if (!run) return null;
  const observations = await db
    .select()
    .from(geoObservations)
    .where(eq(geoObservations.runId, run.id))
    .orderBy(asc(geoObservations.promptId), asc(geoObservations.repetition));
  const order = new Map(run.config.prompts.map((p, i) => [p.id, i]));
  observations.sort((a, b) => order.get(a.promptId)! - order.get(b.promptId)! || a.repetition - b.repetition);
  return { run, observations, metrics: metricsOf(run, observations) };
}

export async function listGeoRuns(db: Database, workspaceId: string): Promise<GeoRunView[]> {
  if (!isUuid(workspaceId)) return [];
  const runs = await db.select().from(geoRuns).where(eq(geoRuns.workspaceId, workspaceId)).orderBy(desc(geoRuns.createdAt));
  if (runs.length === 0) return [];
  const observations = await db.select().from(geoObservations).where(inArray(geoObservations.runId, runs.map((r) => r.id)));
  return runs.map((run) => {
    const own = observations.filter((o) => o.runId === run.id);
    return { run, observations: own, metrics: metricsOf(run, own) };
  });
}
