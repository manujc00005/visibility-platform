import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { logger } from "@/lib/logger";
import { createBudget, type SafeFetcher } from "@/modules/audits/fetcher/safe-fetch";
import { compareEvaluated, evaluateCandidates, EVALUATION_RULES_VERSION, EXCLUSION_LABELS, MAX_SHOWN, type EvaluatedCandidate, type Exclusion } from "@/modules/geo/competitors/evaluate";
import { EXCLUSIONS_VERSION, isKnownNonBusinessHost, isOwnBusiness, registeredKeys } from "@/modules/geo/competitors/exclusions";
import { assistedCaptureSource, associateCandidates, EXTRACTION_RULES_VERSION, type PageHead } from "@/modules/geo/competitors/extract";
import { fetchPageHead, PAGE_HEAD_LIMITS } from "@/modules/geo/competitors/page-head";
import {
  geoCompetitorDismissals,
  geoCompetitorExtractions,
  geoCompetitorSuggestions,
  type AcceptedInput,
  type ExtractionContext,
  type GeoCompetitorExtraction,
  type GeoCompetitorSuggestion,
} from "@/modules/geo/competitors/schema";
import { nameKey } from "@/modules/geo/detection";
import { geoCompetitors, type GeoCompetitor } from "@/modules/geo/schema";
import { fieldErrorsOf, insertCompetitorLocked, lockWorkspace, type FieldErrors, type Result, type Tx } from "@/modules/geo/service";
import { normalizeWebsite, WEBSITE_ERROR_MESSAGES } from "@/modules/workspaces/domain";
import { displayCountry } from "@/modules/workspaces/presentation";
import { workspaces, type Workspace } from "@/modules/workspaces/schema";
import { getWorkspace } from "@/modules/workspaces/service";

/**
 * Competitor discovery from an assisted capture. Network happens only in
 * `extractCompetitors`, outside any transaction; accepting and dismissing are short
 * transactions that take the workspace lock first and then the suggestion row.
 */
export const SUGGESTION_RULES_VERSION = `competitors-2026-10-26.1|${EXTRACTION_RULES_VERSION}|${EVALUATION_RULES_VERSION}|${EXCLUSIONS_VERSION}`;
export const EXTERNAL_DEADLINE_MS = 15_000;
export const MAX_CONCURRENCY = 5;
export const MAX_ATTEMPTS = 25;
export const MAX_QUESTION = 500;
export const MAX_ANSWER = 30_000;
export const MAX_SOURCES = 20;
export const MAX_SOURCE_LENGTH = 2_048;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: string) => UUID.test(value);

export interface CompetitorDeps {
  fetcher: SafeFetcher;
  now?: () => Date;
  /** Test override of the external deadline (ms); production uses EXTERNAL_DEADLINE_MS. */
  externalDeadlineMs?: number;
}

// --- Input -------------------------------------------------------------------------------

const normalizeAnswer = (value: string) => value.replace(/\r\n?/g, "\n").trim();

const inputSchema = z.object({
  question: z.string({ error: "Indica la pregunta que hiciste." }).trim().min(1, "Indica la pregunta que hiciste.").max(MAX_QUESTION, `La pregunta admite ${MAX_QUESTION} caracteres.`),
  answer: z
    .string({ error: "Pega la respuesta." })
    .transform(normalizeAnswer)
    .pipe(z.string().min(1, "Pega la respuesta.").max(MAX_ANSWER, `La respuesta admite ${MAX_ANSWER.toLocaleString("es-ES")} caracteres.`)),
  sources: z
    .string()
    .default("")
    .transform((value) => [...new Set(value.split(/\r?\n/).map((v) => v.trim()).filter(Boolean))])
    .pipe(z.array(z.string().max(MAX_SOURCE_LENGTH, `Cada fuente admite ${MAX_SOURCE_LENGTH} caracteres.`)).max(MAX_SOURCES, `Como máximo ${MAX_SOURCES} fuentes.`)),
});

/** WHATWG serialization without fragment; rejects anything that is not a plain public web URL. */
function canonicalSource(raw: string): { ok: true; url: string } | { ok: false; message: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, message: `URL no válida: ${raw.slice(0, 80)}` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, message: `Solo se admiten direcciones http(s): ${raw.slice(0, 80)}` };
  if (url.username || url.password) return { ok: false, message: `La fuente no puede incluir credenciales: ${raw.slice(0, 80)}` };
  if (url.port !== "") return { ok: false, message: `No se admiten puertos no estándar: ${raw.slice(0, 80)}` };
  const host = normalizeWebsite(url.hostname);
  if (!host.ok) return { ok: false, message: `${WEBSITE_ERROR_MESSAGES[host.error]} (${raw.slice(0, 80)})` };
  url.hash = "";
  return { ok: true, url: url.href };
}

export function contextOf(workspace: Workspace): ExtractionContext {
  return {
    brandName: workspace.name,
    aliases: [...workspace.brandAliases].sort(),
    hostname: workspace.domain,
    sector: workspace.sector,
    city: workspace.city,
    countryCode: workspace.country,
    countryName: displayCountry(workspace.country),
    services: [...workspace.services].sort(),
  };
}

/** Canonical JSON with sorted keys, so equal inputs hash equally. */
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

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function inputFingerprint(input: { workspaceId: string; question: string; answerSha256: string; sources: string[]; context: ExtractionContext; rulesVersion: string }): string {
  return sha256(canonical({ ...input, sources: [...new Set(input.sources)].sort() }));
}

// --- Extraction --------------------------------------------------------------------------

export interface ExtractionView {
  extraction: GeoCompetitorExtraction;
  suggestions: GeoCompetitorSuggestion[];
  /** True when the exact same input had been processed before (no network was used). */
  repeated: boolean;
}

export type ExtractError = "not_found" | "validation" | "conflict";

async function readPageHeads(hosts: string[], deps: CompetitorDeps): Promise<{ heads: Map<string, PageHead>; timedOut: string[]; deadlineHit: boolean }> {
  const deadlineMs = deps.externalDeadlineMs ?? EXTERNAL_DEADLINE_MS;
  const deadline = Date.now() + deadlineMs;
  const budget = createBudget({ maxRequests: MAX_ATTEMPTS, maxTotalBytes: MAX_ATTEMPTS * PAGE_HEAD_LIMITS.maxBytes, timeLimitMs: deadlineMs });
  const controller = new AbortController();
  let deadlineHit = false;
  const timer = setTimeout(() => {
    deadlineHit = true;
    controller.abort();
  }, Math.max(1, deadline - Date.now()));
  const heads = new Map<string, PageHead>();
  const timedOut: string[] = [];
  const queue = [...hosts];
  const worker = async () => {
    for (;;) {
      const host = queue.shift();
      if (host === undefined) return;
      if (controller.signal.aborted || Date.now() >= deadline) {
        timedOut.push(host);
        heads.set(host, unverifiedHead(host, deps));
        continue;
      }
      const perCandidate = Math.min(Date.now() + PAGE_HEAD_LIMITS.perCandidateMs, deadline);
      try {
        heads.set(host, await fetchPageHead(host, deps.fetcher, budget, { deadlineAt: perCandidate, signal: controller.signal, now: deps.now }));
      } catch (error) {
        // One hostile or malformed page must not fail the extraction: that host stays unverified.
        logger.warn({ host, error: error instanceof Error ? error.name : "unknown" }, "page head read failed");
        heads.set(host, unverifiedHead(host, deps));
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, hosts.length) }, worker));
  } finally {
    clearTimeout(timer);
  }
  return { heads, timedOut, deadlineHit };
}

function unverifiedHead(host: string, deps: CompetitorDeps): PageHead {
  return { host, finalHost: null, initialUrl: `https://${host}/`, finalUrl: null, webStatus: "unverified", title: null, description: null, lang: null, localities: [], checkedAt: (deps.now ?? (() => new Date()))() };
}

async function latestExtractionId(tx: Tx | Database, workspaceId: string): Promise<string | null> {
  const [row] = await tx
    .select({ id: geoCompetitorExtractions.id, createdAt: geoCompetitorExtractions.createdAt })
    .from(geoCompetitorExtractions)
    .where(eq(geoCompetitorExtractions.workspaceId, workspaceId))
    .orderBy(desc(geoCompetitorExtractions.createdAt), desc(geoCompetitorExtractions.id))
    .limit(1);
  return row?.id ?? null;
}

async function knownKeys(tx: Tx | Database, workspaceId: string): Promise<{ registeredKeys: Set<string>; dismissedKeys: Set<string> }> {
  const [competitors, dismissals] = await Promise.all([
    tx.select({ name: geoCompetitors.name, domain: geoCompetitors.domain }).from(geoCompetitors).where(eq(geoCompetitors.workspaceId, workspaceId)),
    tx.select({ key: geoCompetitorDismissals.identityKey }).from(geoCompetitorDismissals).where(eq(geoCompetitorDismissals.workspaceId, workspaceId)),
  ]);
  return { registeredKeys: registeredKeys(competitors), dismissedKeys: new Set(dismissals.map((d) => d.key)) };
}

function exclusionWarnings(excluded: Exclusion[]): string[] {
  const counts = new Map<Exclusion["reason"], number>();
  for (const e of excluded) counts.set(e.reason, (counts.get(e.reason) ?? 0) + 1);
  return [...counts].map(([reason, n]) => `${n} ${n === 1 ? "candidato excluido" : "candidatos excluidos"}: ${EXCLUSION_LABELS[reason]}.`);
}

export async function extractCompetitors(db: Database, workspaceId: string, raw: unknown, deps: CompetitorDeps): Promise<Result<ExtractionView, ExtractError>> {
  // 1. Validate everything before any network.
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "validation", fieldErrors: fieldErrorsOf(parsed.error) };
  const sources: string[] = [];
  const sourceErrors: string[] = [];
  for (const rawUrl of parsed.data.sources) {
    const c = canonicalSource(rawUrl);
    if (c.ok) sources.push(c.url);
    else sourceErrors.push(c.message);
  }
  if (sourceErrors.length > 0) return { ok: false, error: "validation", fieldErrors: { sources: sourceErrors } };
  const uniqueSources = [...new Set(sources)].sort();

  const workspace = await getWorkspace(db, workspaceId);
  if (!workspace) return { ok: false, error: "not_found" };
  const context = contextOf(workspace);
  const answerSha256 = sha256(parsed.data.answer);
  const fingerprint = inputFingerprint({ workspaceId: workspace.id, question: parsed.data.question, answerSha256, sources: uniqueSources, context, rulesVersion: SUGGESTION_RULES_VERSION });

  // 2. Exact repetition: return what exists, no network, nothing resurrected.
  const existing = await findByFingerprint(db, workspace.id, fingerprint);
  if (existing) return { ok: true, value: { ...existing, repeated: true } };

  // 3. Capture the baseline this extraction competes against.
  const baseId = await latestExtractionId(db, workspace.id);
  const known = await knownKeys(db, workspace.id);

  // 4. Pure extraction, then pre-filter hosts that would be excluded anyway (no network for them).
  const extraction = assistedCaptureSource.extract({ answerText: parsed.data.answer, sources: uniqueSources });
  const hosts = extraction.references
    .map((r) => r.host)
    .filter((h) => !isOwnBusiness({ nameKey: null, host: h }, context) && !isKnownNonBusinessHost(h) && !known.registeredKeys.has(`host:${h}`) && !known.dismissedKeys.has(`host:${h}`));
  const excludedHosts = new Set(extraction.references.map((r) => r.host).filter((h) => !hosts.includes(h)));
  const skippedHosts = excludedHosts.size;

  // 5. External reads, bounded and cancellable, outside any transaction.
  const started = Date.now();
  const { heads, timedOut, deadlineHit } = await readPageHeads(hosts, deps);
  const { candidates, unshown } = associateCandidates(extraction, heads, excludedHosts);
  const evaluated = evaluateCandidates(candidates, context, known);

  const warnings = [...extraction.warnings];
  if (skippedHosts > 0) warnings.push(`${skippedHosts} ${skippedHosts === 1 ? "web citada no se consultó" : "webs citadas no se consultaron"} por ser la propia empresa, un directorio o un competidor ya registrado o descartado.`);
  const unchecked = timedOut.length + (deadlineHit ? [...heads.values()].filter((h) => h.webStatus === "unverified").length : 0);
  if (deadlineHit || timedOut.length > 0) {
    warnings.push(`Se agotó el tiempo de comprobación (${Math.round((deps.externalDeadlineMs ?? EXTERNAL_DEADLINE_MS) / 1000)} s): ${unchecked} ${unchecked === 1 ? "web quedó" : "webs quedaron"} sin comprobar. Resultado parcial.`);
  }
  if (unshown.length > 0) warnings.push(`${unshown.length} ${unshown.length === 1 ? "web citada no produjo" : "webs citadas no produjeron"} un candidato (${[...new Set(unshown.map((u) => u.reason))].join(", ")}).`);
  warnings.push(...exclusionWarnings(evaluated.excluded));
  if (evaluated.overflow > 0) warnings.push(`${evaluated.overflow} ${evaluated.overflow === 1 ? "candidato más quedó" : "candidatos más quedaron"} fuera de las ${MAX_SHOWN} tarjetas.`);
  if (extraction.names.length === 0 && extraction.references.length === 0) warnings.push("La respuesta no contiene nombres en lista o negrita ni URLs: pide a ChatGPT que incluya las webs.");

  // 6. Publish in a short transaction with the workspace lock; no network inside.
  const now = (deps.now ?? (() => new Date()))();
  const result = await db.transaction(async (tx): Promise<Result<ExtractionView, ExtractError>> => {
    if (!(await lockWorkspace(tx, workspace.id))) return { ok: false, error: "not_found" };
    const again = await findByFingerprint(tx, workspace.id, fingerprint);
    if (again) return { ok: true, value: { ...again, repeated: true } };
    const [current] = await tx.select().from(workspaces).where(eq(workspaces.id, workspace.id));
    if (!current || canonical(contextOf(current)) !== canonical(context)) return { ok: false, error: "conflict" };
    if ((await latestExtractionId(tx, workspace.id)) !== baseId) return { ok: false, error: "conflict" };

    // Decisions taken while we were reading the web still win.
    const fresh = await knownKeys(tx, workspace.id);
    const shown = evaluated.shown.filter((c) => {
      const keys = [c.host ? `host:${c.host}` : null, c.nameKey ? `name:${c.nameKey}` : null].filter((k): k is string => k !== null);
      return !keys.some((k) => fresh.registeredKeys.has(k) || fresh.dismissedKeys.has(k));
    });
    const removed = evaluated.shown.length - shown.length;
    const published = removed > 0 ? [...warnings, `${removed} ${removed === 1 ? "candidato quedó" : "candidatos quedaron"} fuera por una decisión tomada mientras se comprobaban las webs.`] : warnings;

    const [last] = await tx
      .select({ createdAt: geoCompetitorExtractions.createdAt })
      .from(geoCompetitorExtractions)
      .where(eq(geoCompetitorExtractions.workspaceId, workspace.id))
      .orderBy(desc(geoCompetitorExtractions.createdAt), desc(geoCompetitorExtractions.id))
      .limit(1);
    const createdAt = new Date(Math.max(now.getTime(), (last?.createdAt.getTime() ?? 0) + 1));

    const [created] = await tx
      .insert(geoCompetitorExtractions)
      .values({
        workspaceId: workspace.id,
        source: "assisted",
        question: parsed.data.question,
        answerSha256,
        inputFingerprint: fingerprint,
        sources: uniqueSources,
        rulesVersion: SUGGESTION_RULES_VERSION,
        contextSnapshot: context,
        candidatesTotal: candidates.length,
        candidatesShown: shown.length,
        warnings: published,
        createdAt,
      })
      .returning();
    await tx
      .update(geoCompetitorSuggestions)
      .set({ status: "superseded" })
      .where(and(eq(geoCompetitorSuggestions.workspaceId, workspace.id), eq(geoCompetitorSuggestions.status, "suggested")));
    const rows = shown.length > 0 ? await tx.insert(geoCompetitorSuggestions).values(shown.map((c) => suggestionRow(workspace.id, created!.id, c))).returning() : [];
    return { ok: true, value: { extraction: created!, suggestions: rows.sort(compareStored), repeated: false } };
  });

  logger.info(
    { workspaceId: workspace.id, extractionId: result.ok ? result.value.extraction.id : null, outcome: result.ok ? (result.value.repeated ? "repeated" : "published") : result.error, names: extraction.names.length, hosts: hosts.length, shown: result.ok ? result.value.suggestions.length : 0, timedOut: timedOut.length, ms: Date.now() - started },
    "competitor extraction",
  );
  return result;
}

function suggestionRow(workspaceId: string, extractionId: string, c: EvaluatedCandidate): typeof geoCompetitorSuggestions.$inferInsert {
  return {
    workspaceId,
    extractionId,
    candidateKey: c.key,
    name: c.name,
    domain: c.host,
    sourceUrls: c.sourceUrls.slice(0, 10),
    snippet: c.snippet.slice(0, 200),
    pageTitle: c.head?.title ?? null,
    pageDescription: c.head?.description ?? null,
    factors: c.factors,
    webStatus: c.head?.webStatus ?? null,
    initialUrl: c.head?.initialUrl ?? null,
    finalUrl: c.head?.finalUrl ?? null,
    checkedAt: c.head?.checkedAt ?? null,
    status: "suggested",
  };
}

/** Same order as FR-003b, recomputed from stored columns. */
export function compareStored(a: GeoCompetitorSuggestion, b: GeoCompetitorSuggestion): number {
  const view = (s: GeoCompetitorSuggestion): EvaluatedCandidate => ({
    key: s.candidateKey,
    name: s.name,
    nameKey: s.candidateKey.startsWith("name:") ? s.candidateKey.slice(5) : nameKey(s.name),
    nameProvisional: false,
    host: s.domain,
    sourceUrls: [],
    snippet: "",
    association: "none",
    head: s.webStatus ? { host: s.domain ?? "", finalHost: null, initialUrl: "", finalUrl: null, webStatus: s.webStatus, title: null, description: null, lang: null, localities: [], checkedAt: s.checkedAt ?? new Date(0) } : null,
    notes: [],
    factors: s.factors,
  });
  return compareEvaluated(view(a), view(b));
}

async function findByFingerprint(tx: Tx | Database, workspaceId: string, fingerprint: string): Promise<Omit<ExtractionView, "repeated"> | null> {
  const [extraction] = await tx
    .select()
    .from(geoCompetitorExtractions)
    .where(and(eq(geoCompetitorExtractions.workspaceId, workspaceId), eq(geoCompetitorExtractions.inputFingerprint, fingerprint)));
  if (!extraction) return null;
  return { extraction, suggestions: await suggestionsOf(tx, workspaceId, extraction.id) };
}

async function suggestionsOf(tx: Tx | Database, workspaceId: string, extractionId: string): Promise<GeoCompetitorSuggestion[]> {
  const rows = await tx
    .select()
    .from(geoCompetitorSuggestions)
    .where(and(eq(geoCompetitorSuggestions.workspaceId, workspaceId), eq(geoCompetitorSuggestions.extractionId, extractionId)));
  return rows.sort(compareStored);
}

/** The latest extraction and its cards (all statuses), for the page. No network. */
export async function listSuggestions(db: Database, workspaceId: string): Promise<Omit<ExtractionView, "repeated"> | null> {
  if (!isUuid(workspaceId)) return null;
  const [extraction] = await db
    .select()
    .from(geoCompetitorExtractions)
    .where(eq(geoCompetitorExtractions.workspaceId, workspaceId))
    .orderBy(desc(geoCompetitorExtractions.createdAt), desc(geoCompetitorExtractions.id))
    .limit(1);
  if (!extraction) return null;
  return { extraction, suggestions: await suggestionsOf(db, workspaceId, extraction.id) };
}

// --- Decisions ---------------------------------------------------------------------------

const acceptSchema = z.object({
  name: z.string({ error: "Indica el nombre." }).trim().min(1, "Indica el nombre.").max(120, "Máximo 120 caracteres."),
  website: z.string().default(""),
  reviewConfirmed: z.string().default("").transform((v) => v === "true" || v === "on"),
});

export type AcceptError = "not_found" | "validation" | "limit" | "already_exists" | "conflict" | "stale";

/**
 * Creates the competitor and marks the suggestion accepted in one transaction. Repeating
 * an accepted suggestion returns its competitor; dismissed → conflict; superseded → stale.
 * Corrections are a manual decision: a corrected website inherits no evidence.
 */
export async function acceptSuggestion(db: Database, workspaceId: string, suggestionId: string, raw: unknown): Promise<Result<GeoCompetitor, AcceptError>> {
  if (!isUuid(workspaceId) || !isUuid(suggestionId)) return { ok: false, error: "not_found" };
  const parsed = acceptSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "validation", fieldErrors: fieldErrorsOf(parsed.error) };
  if (!parsed.data.reviewConfirmed) return { ok: false, error: "validation", fieldErrors: { reviewConfirmed: ["Confirma que has revisado el candidato."] } };
  let domain: string | null = null;
  if (parsed.data.website.trim()) {
    const website = normalizeWebsite(parsed.data.website);
    if (!website.ok) return { ok: false, error: "validation", fieldErrors: { website: [WEBSITE_ERROR_MESSAGES[website.error]] } };
    domain = website.value.domain;
  }

  return db.transaction(async (tx): Promise<Result<GeoCompetitor, AcceptError>> => {
    if (!(await lockWorkspace(tx, workspaceId))) return { ok: false, error: "not_found" };
    const [suggestion] = await tx
      .select()
      .from(geoCompetitorSuggestions)
      .where(and(eq(geoCompetitorSuggestions.id, suggestionId), eq(geoCompetitorSuggestions.workspaceId, workspaceId)))
      .for("update");
    if (!suggestion) return { ok: false, error: "not_found" };
    if (suggestion.status === "accepted") {
      const [competitor] = suggestion.competitorId
        ? await tx.select().from(geoCompetitors).where(and(eq(geoCompetitors.id, suggestion.competitorId), eq(geoCompetitors.workspaceId, workspaceId)))
        : [];
      return competitor ? { ok: true, value: competitor } : { ok: false, error: "stale" };
    }
    if (suggestion.status === "dismissed") return { ok: false, error: "conflict" };
    if (suggestion.status === "superseded") return { ok: false, error: "stale" };

    const [current] = await tx.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    if (!current) return { ok: false, error: "not_found" };
    const context = contextOf(current);
    const fieldErrors: FieldErrors = {};
    if (isOwnBusiness({ nameKey: nameKey(parsed.data.name), host: domain }, context)) fieldErrors.name = ["Ese nombre o web corresponde a la propia empresa."];
    if (domain && isKnownNonBusinessHost(domain)) fieldErrors.website = ["Esa web es un directorio, red social o buscador, no un competidor."];
    if (Object.keys(fieldErrors).length > 0) return { ok: false, error: "validation", fieldErrors };

    const inserted = await insertCompetitorLocked(tx, workspaceId, { name: parsed.data.name, domain, aliases: [] }, "all");
    if (!inserted.ok) return inserted;
    const corrected = parsed.data.name !== suggestion.name || domain !== suggestion.domain;
    const acceptedInput: AcceptedInput = {
      name: parsed.data.name,
      website: domain,
      corrected,
      websiteStatus: domain === null ? "none" : domain === suggestion.domain ? "as_suggested" : "operator_provided_unverified",
      reviewConfirmed: true,
    };
    await tx
      .update(geoCompetitorSuggestions)
      .set({ status: "accepted", competitorId: inserted.value.id, acceptedInput, decidedAt: sql`now()` })
      .where(and(eq(geoCompetitorSuggestions.id, suggestionId), eq(geoCompetitorSuggestions.workspaceId, workspaceId), eq(geoCompetitorSuggestions.status, "suggested")));
    logger.info({ workspaceId, suggestionId, competitorId: inserted.value.id, corrected }, "competitor suggestion accepted");
    return inserted;
  });
}

export type DismissError = "not_found" | "conflict";

/** Idempotent: a dismissed suggestion dismisses again without duplicating keys; an accepted one is a conflict. */
export async function dismissSuggestion(db: Database, workspaceId: string, suggestionId: string): Promise<Result<{ keys: string[] }, DismissError>> {
  if (!isUuid(workspaceId) || !isUuid(suggestionId)) return { ok: false, error: "not_found" };
  return db.transaction(async (tx): Promise<Result<{ keys: string[] }, DismissError>> => {
    if (!(await lockWorkspace(tx, workspaceId))) return { ok: false, error: "not_found" };
    const [suggestion] = await tx
      .select()
      .from(geoCompetitorSuggestions)
      .where(and(eq(geoCompetitorSuggestions.id, suggestionId), eq(geoCompetitorSuggestions.workspaceId, workspaceId)))
      .for("update");
    if (!suggestion) return { ok: false, error: "not_found" };
    if (suggestion.status === "accepted") return { ok: false, error: "conflict" };
    const keys = [suggestion.domain ? `host:${suggestion.domain}` : null, `name:${suggestion.candidateKey.startsWith("name:") ? suggestion.candidateKey.slice(5) : nameKey(suggestion.name)}`].filter(
      (k): k is string => k !== null && k.length > 5,
    );
    if (suggestion.status === "dismissed") return { ok: true, value: { keys } };
    await tx
      .insert(geoCompetitorDismissals)
      .values(keys.map((identityKey) => ({ workspaceId, identityKey })))
      .onConflictDoNothing();
    await tx
      .update(geoCompetitorSuggestions)
      .set({ status: "dismissed", decidedAt: sql`now()` })
      .where(and(eq(geoCompetitorSuggestions.id, suggestionId), eq(geoCompetitorSuggestions.workspaceId, workspaceId), inArray(geoCompetitorSuggestions.status, ["suggested", "superseded"])));
    logger.info({ workspaceId, suggestionId, keys: keys.length }, "competitor suggestion dismissed");
    return { ok: true, value: { keys } };
  });
}
