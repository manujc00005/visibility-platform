"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { getMessages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { removeGoal, saveGoal } from "@/modules/goals/service";

/** Private operator only (no authentication until Phase 5, roadmap D-03). */

export interface GoalFormState {
  ok: boolean;
  message: string | null;
  errors: string[];
  values: Record<string, string>;
  attempt: number;
}

function values(formData: FormData): Record<string, string> {
  return Object.fromEntries([...formData.entries()].flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
}

/** The overview shows the goal line; the edit page shows the form. */
function revalidateGoal(workspaceId: string): void {
  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces/${workspaceId}/edit`);
}

export async function saveGoalAction(workspaceId: string, previous: GoalFormState, formData: FormData): Promise<GoalFormState> {
  const locale = await getLocale();
  const t = getMessages(locale).goals;
  const result = await saveGoal(getDb(), workspaceId, values(formData), locale);
  if (!result.ok) {
    return { ok: false, message: t.errors[result.error], errors: Object.values(result.fieldErrors ?? {}).flat(), values: values(formData), attempt: previous.attempt + 1 };
  }
  revalidateGoal(workspaceId);
  return { ok: true, message: t.form.saved, errors: [], values: {}, attempt: previous.attempt + 1 };
}

export async function removeGoalAction(workspaceId: string, previous: GoalFormState): Promise<GoalFormState> {
  const t = getMessages(await getLocale()).goals;
  await removeGoal(getDb(), workspaceId);
  revalidateGoal(workspaceId);
  return { ok: true, message: t.form.removed, errors: [], values: {}, attempt: previous.attempt + 1 };
}
