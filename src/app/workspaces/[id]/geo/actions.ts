"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
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

const ERROR_MESSAGES: Record<string, string> = {
  not_found: "La empresa o la medición ya no existe.",
  limit: "Has alcanzado el máximo permitido.",
  duplicate: "Esa pregunta ya está en la lista.",
  no_prompts: "Añade al menos una pregunta antes de medir.",
  provider_unavailable: "El proveedor no está configurado.",
  budget_not_configured: "No hay presupuesto mensual configurado: no se hacen llamadas de pago.",
  budget_exceeded: "El presupuesto mensual no alcanza para esta medición.",
  not_pending: "Esta respuesta ya estaba registrada.",
  validation: "Revisa los datos.",
  already_exists: "Ese competidor ya está registrado (activo o archivado).",
  conflict: "Otra acción se adelantó: recarga la página para ver el estado actual.",
  stale: "Esta sugerencia pertenece a una extracción anterior; vuelve a extraer.",
};

function values(formData: FormData): Record<string, string> {
  return Object.fromEntries([...formData.entries()].flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
}

function failure(previous: GeoFormState, formData: FormData, error: string, fieldErrors?: Record<string, string[]>): GeoFormState {
  return {
    ok: false,
    message: ERROR_MESSAGES[error] ?? "No se pudo guardar.",
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
  const result = await updateBrandAliases(getDb(), workspaceId, values(formData));
  if (!result.ok) return failure(previous, formData, result.error, result.fieldErrors);
  revalidateGeo(workspaceId);
  return { ...success(previous, "Alias guardados."), values: { aliases: result.value.join("\n") } };
}

export async function addCompetitorAction(workspaceId: string, previous: GeoFormState, formData: FormData): Promise<GeoFormState> {
  const result = await addCompetitor(getDb(), workspaceId, values(formData));
  if (!result.ok) return failure(previous, formData, result.error, result.fieldErrors);
  revalidateGeo(workspaceId);
  return success(previous, `${result.value.name} añadido.`);
}

export async function archiveCompetitorAction(workspaceId: string, competitorId: string): Promise<void> {
  await archiveCompetitor(getDb(), workspaceId, competitorId);
  revalidateGeo(workspaceId);
}

export async function addPromptAction(workspaceId: string, previous: GeoFormState, formData: FormData): Promise<GeoFormState> {
  const result = await addPrompt(getDb(), workspaceId, values(formData));
  if (!result.ok) return failure(previous, formData, result.error, result.fieldErrors);
  revalidateGeo(workspaceId);
  return success(previous, "Pregunta añadida.");
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
  if (!result.ok) return failure(previous, formData, result.error, result.fieldErrors);
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
  const result = await recordManualObservation(getDb(), workspaceId, runId, observationId, values(formData));
  if (!result.ok) return failure(previous, formData, result.error, result.fieldErrors);
  revalidatePath(`${geoPath(workspaceId)}/runs/${runId}`);
  revalidateGeo(workspaceId);
  return success(previous, "Respuesta registrada.");
}

export async function refreshRunAction(workspaceId: string, runId: string, previous: GeoFormState): Promise<GeoFormState> {
  const result = await refreshGeoRun(getDb(), workspaceId, runId, createGeoDeps());
  if (!result.ok) return { ...previous, ok: false, message: ERROR_MESSAGES[result.error] ?? "No se pudo actualizar.", attempt: previous.attempt + 1 };
  revalidatePath(`${geoPath(workspaceId)}/runs/${runId}`);
  revalidateGeo(workspaceId);
  const { collected, reconciled } = result.value;
  return success(previous, `${collected} respuestas recogidas${reconciled ? `, ${reconciled} envíos reconciliados` : ""}.`);
}

// --- Competitor discovery (assisted capture) --------------------------------------------

export async function extractCompetitorsAction(workspaceId: string, previous: GeoFormState, formData: FormData): Promise<GeoFormState> {
  const result = await extractCompetitors(getDb(), workspaceId, values(formData), createCompetitorDeps());
  if (!result.ok) {
    if (result.error === "conflict") revalidateGeo(workspaceId);
    return failure(previous, formData, result.error, result.fieldErrors);
  }
  revalidateGeo(workspaceId);
  const n = result.value.suggestions.length;
  return success(
    previous,
    result.value.repeated
      ? "Esta misma captura ya se procesó antes; no se repite. La página muestra la extracción más reciente de la empresa."
      : `${n} ${n === 1 ? "candidato" : "candidatos"} para revisar.`,
  );
}

export async function acceptSuggestionAction(workspaceId: string, suggestionId: string, previous: GeoFormState, formData: FormData): Promise<GeoFormState> {
  const result = await acceptSuggestion(getDb(), workspaceId, suggestionId, values(formData));
  if (!result.ok) return failure(previous, formData, result.error, result.fieldErrors);
  revalidateGeo(workspaceId);
  return success(previous, `${result.value.name} añadido como competidor.`);
}

export async function dismissSuggestionAction(workspaceId: string, suggestionId: string, previous: GeoFormState): Promise<GeoFormState> {
  const result = await dismissSuggestion(getDb(), workspaceId, suggestionId);
  if (!result.ok) return { ...previous, ok: false, message: ERROR_MESSAGES[result.error] ?? "No se pudo descartar.", attempt: previous.attempt + 1 };
  revalidateGeo(workspaceId);
  return success(previous, "Descartado.");
}
