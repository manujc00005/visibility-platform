"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getMessages, type Messages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { createWorkspace, updateWorkspace, type WorkspaceResult } from "@/modules/workspaces/service";
import { formValuesFrom, type FieldErrors, type WorkspaceFormValues } from "@/modules/workspaces/validation";

/**
 * Phase 1 runs for a single private operator with no authentication (roadmap D-03):
 * these actions must not be reachable from a public deployment.
 */

export interface WorkspaceFormState {
  values: WorkspaceFormValues;
  fieldErrors: FieldErrors;
  /** Workspace that already uses the submitted domain, to link to it. */
  duplicateOf: string | null;
  formError: string | null;
  /** Changes on every failed submit so the form remounts with the returned values. */
  attempt: number;
}

function failure(
  previous: WorkspaceFormState,
  values: WorkspaceFormValues,
  result: WorkspaceResult,
  messages: Messages["workspaces"]["errors"],
): WorkspaceFormState {
  const base = { values, fieldErrors: {}, duplicateOf: null, formError: null, attempt: previous.attempt + 1 };
  if (result.ok) return base;
  switch (result.error.kind) {
    case "validation":
      return { ...base, fieldErrors: result.error.fieldErrors };
    case "duplicate_domain":
      return {
        ...base,
        fieldErrors: { website: [messages.duplicateDomain(result.error.domain)] },
        duplicateOf: result.error.existingId,
      };
    case "not_found":
      return { ...base, formError: messages.notFound };
  }
}

export async function createWorkspaceAction(previous: WorkspaceFormState, formData: FormData): Promise<WorkspaceFormState> {
  const locale = await getLocale();
  const values = formValuesFrom(formData);
  const result = await createWorkspace(getDb(), values, locale);
  if (!result.ok) return failure(previous, values, result, getMessages(locale).workspaces.errors);
  revalidatePath("/workspaces");
  redirect(`/workspaces/${result.workspace.id}`);
}

export async function updateWorkspaceAction(
  id: string,
  previous: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const locale = await getLocale();
  const values = formValuesFrom(formData);
  const result = await updateWorkspace(getDb(), id, values, locale);
  if (!result.ok) return failure(previous, values, result, getMessages(locale).workspaces.errors);
  revalidatePath("/workspaces");
  revalidatePath(`/workspaces/${id}`);
  redirect(`/workspaces/${id}`);
}
