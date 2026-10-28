"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import type { Locale } from "@/i18n/locale";
import { getMessages, type Messages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { acceptSuggestion, dismissSuggestion, extractCompetitors } from "@/modules/geo/competitors/service";
import { createCompetitorDeps, createGeoDeps } from "@/modules/geo/deps";
import {
  addCompetitor,
  addPrompt,
  archiveCompetitor,
  archivePrompt,
  createGeoRun,
  recordManualObservation,
  refreshGeoRun,
  updateBrandAliases,
} from "@/modules/geo/service";

/** Private operator only (no authentication until Phase 5, roadmap D-03). */

export interface GeoFormState {
  ok: boolean;
  message: string | null;
  errors: string[];
  values: Record<string, string>;
  attempt: number;
}

type GeoTexts = Messages["geo"];
type ErrorKey = Exclude<keyof GeoTexts["errors"], "saveFailed" | "refreshFailed" | "dismissFailed">;

/** Message for a service error code in the request's language; `fallback` for unknown codes. */
function errorMessage(t: GeoTexts, error: string, fallback: string): string {
  return error in t.errors ? t.errors[error as ErrorKey] : fallback;
}

async function texts(): Promise<{ locale: Locale; t: GeoTexts }> {
  const locale = await getLocale();
  return { locale, t: getMessages(locale).geo };
}

function values(formData: FormData): Record<string, string> {
  return Object.fromEntries([...formData.entries()].flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
}

function failure(t: GeoTexts, previous: GeoFormState, formData: FormData, error: string, fieldErrors?: Record<string, string[]>): GeoFormState {
  return {
    ok: false,
    message: errorMessage(t, error, t.errors.saveFailed),
    errors: Object.values(fieldErrors ?? {}).flat(),
    values: values(formData),
    attempt: previous.attempt + 1,
  };
}

function success(previous: GeoFormState, message: string): GeoFormState {
  return { ok: true, message, errors: [], values: {}, attempt: previous.attempt + 1 };
}

const geoPath = (workspaceId: string) => `/workspaces/${workspaceId}/geo`;

/** Everything that reads GEO data: the overview card, the results page and the setup page (FR-007). */
function revalidateGeo(workspaceId: string): void {
  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(geoPath(workspaceId));
  revalidatePath(`${geoPath(workspaceId)}/setup`);
}

export async function updateAliasesAction(workspaceId: string, previous: GeoFormState, formData: FormData): Promise<GeoFormState> {
  const { locale, t } = await texts();
  const result = await updateBrandAliases(getDb(), workspaceId, values(formData), locale);
  if (!result.ok) return failure(t, previous, formData, result.error, result.fieldErrors);
  revalidateGeo(workspaceId);
  return { ...success(previous, t.success.aliases), values: { aliases: result.value.join("\n") } };
}

export async function addCompetitorAction(workspaceId: string, previous: GeoFormState, formData: FormData): Promise<GeoFormState> {
  const { locale, t } = await texts();
  const result = await addCompetitor(getDb(), workspaceId, values(formData), locale);
  if (!result.ok) return failure(t, previous, formData, result.error, result.fieldErrors);
  revalidateGeo(workspaceId);
  return success(previous, t.success.competitorAdded(result.value.name));
}

export async function archiveCompetitorAction(workspaceId: string, competitorId: string): Promise<void> {
  await archiveCompetitor(getDb(), workspaceId, competitorId);
  revalidateGeo(workspaceId);
}

export async function addPromptAction(workspaceId: string, previous: GeoFormState, formData: FormData): Promise<GeoFormState> {
  const { locale, t } = await texts();
  const result = await addPrompt(getDb(), workspaceId, values(formData), locale);
  if (!result.ok) return failure(t, previous, formData, result.error, result.fieldErrors);
  revalidateGeo(workspaceId);
  return success(previous, t.success.promptAdded);
}

export async function addSuggestedPromptAction(workspaceId: string, text: string, intent: string): Promise<void> {
  await addPrompt(getDb(), workspaceId, { text, intent });
  revalidateGeo(workspaceId);
}

export async function archivePromptAction(workspaceId: string, promptId: string): Promise<void> {
  await archivePrompt(getDb(), workspaceId, promptId);
  revalidateGeo(workspaceId);
}

export async function createRunAction(workspaceId: string, previous: GeoFormState, formData: FormData): Promise<GeoFormState> {
  const result = await createGeoRun(getDb(), workspaceId, values(formData), createGeoDeps());
  if (!result.ok) return failure((await texts()).t, previous, formData, result.error, result.fieldErrors);
  revalidateGeo(workspaceId);
  redirect(`${geoPath(workspaceId)}/runs/${result.value.id}`);
}

export async function recordObservationAction(
  workspaceId: string,
  runId: string,
  observationId: string,
  previous: GeoFormState,
  formData: FormData,
): Promise<GeoFormState> {
  const { locale, t } = await texts();
  const result = await recordManualObservation(getDb(), workspaceId, runId, observationId, values(formData), undefined, locale);
  if (!result.ok) return failure(t, previous, formData, result.error, result.fieldErrors);
  revalidatePath(`${geoPath(workspaceId)}/runs/${runId}`);
  revalidateGeo(workspaceId);
  return success(previous, t.success.answerRecorded);
}

export async function refreshRunAction(workspaceId: string, runId: string, previous: GeoFormState): Promise<GeoFormState> {
  const { t } = await texts();
  const result = await refreshGeoRun(getDb(), workspaceId, runId, createGeoDeps());
  if (!result.ok) return { ...previous, ok: false, message: errorMessage(t, result.error, t.errors.refreshFailed), attempt: previous.attempt + 1 };
  revalidatePath(`${geoPath(workspaceId)}/runs/${runId}`);
  revalidateGeo(workspaceId);
  const { collected, reconciled } = result.value;
  return success(previous, t.success.refreshed(collected, reconciled));
}

// --- Competitor discovery (assisted capture) --------------------------------------------

export async function extractCompetitorsAction(workspaceId: string, previous: GeoFormState, formData: FormData): Promise<GeoFormState> {
  const { locale, t } = await texts();
  const result = await extractCompetitors(getDb(), workspaceId, values(formData), createCompetitorDeps(), locale);
  if (!result.ok) {
    if (result.error === "conflict") revalidateGeo(workspaceId);
    return failure(t, previous, formData, result.error, result.fieldErrors);
  }
  revalidateGeo(workspaceId);
  return success(previous, result.value.repeated ? t.success.repeated : t.success.candidates(result.value.suggestions.length));
}

export async function acceptSuggestionAction(workspaceId: string, suggestionId: string, previous: GeoFormState, formData: FormData): Promise<GeoFormState> {
  const { locale, t } = await texts();
  const result = await acceptSuggestion(getDb(), workspaceId, suggestionId, values(formData), locale);
  if (!result.ok) return failure(t, previous, formData, result.error, result.fieldErrors);
  revalidateGeo(workspaceId);
  return success(previous, t.success.suggestionAccepted(result.value.name));
}

export async function dismissSuggestionAction(workspaceId: string, suggestionId: string, previous: GeoFormState): Promise<GeoFormState> {
  const { t } = await texts();
  const result = await dismissSuggestion(getDb(), workspaceId, suggestionId);
  if (!result.ok) return { ...previous, ok: false, message: errorMessage(t, result.error, t.errors.dismissFailed), attempt: previous.attempt + 1 };
  revalidateGeo(workspaceId);
  return success(previous, t.success.dismissed);
}
