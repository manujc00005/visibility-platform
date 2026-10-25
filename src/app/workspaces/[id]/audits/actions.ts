"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
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
    if (result.error.kind === "already_running") {
      return { error: "Ya hay una auditoría en curso para esta empresa.", runningAuditId: result.error.auditId };
    }
    return { error: "Esta empresa ya no existe.", runningAuditId: null };
  }
  revalidatePath(`/workspaces/${workspaceId}`);
  redirect(`/workspaces/${workspaceId}/audits/${result.audit.id}`);
}
