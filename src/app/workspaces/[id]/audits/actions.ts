"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getMessages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { createAuditDeps } from "@/modules/audits/deps";
import { runAudit } from "@/modules/audits/service";

/** Private operator only (no authentication until Phase 5, roadmap D-03). */

export interface RunAuditState {
  error: string | null;
  runningAuditId: string | null;
}

export async function runAuditAction(workspaceId: string): Promise<RunAuditState> {
  const result = await runAudit(getDb(), workspaceId, createAuditDeps());
  if (!result.ok) {
    const t = getMessages(await getLocale()).audits.runErrors;
    if (result.error.kind === "already_running") {
      return { error: t.alreadyRunning, runningAuditId: result.error.auditId };
    }
    return { error: t.workspaceGone, runningAuditId: null };
  }
  // The overview and both detail pages read audits.
  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces/${workspaceId}/performance`);
  revalidatePath(`/workspaces/${workspaceId}/seo`);
  redirect(`/workspaces/${workspaceId}/audits/${result.audit.id}`);
}
