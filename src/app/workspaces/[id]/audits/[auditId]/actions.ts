"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { renderPdf } from "@/modules/reports/render-pdf";
import { createReport } from "@/modules/reports/service";

/** Private operator only (no authentication until Phase 5, roadmap D-03). */

export interface GenerateReportState {
  error: string | null;
  generatedId: string | null;
}

export async function generateReportAction(workspaceId: string, auditId: string): Promise<GenerateReportState> {
  const result = await createReport(getDb(), workspaceId, auditId, { renderPdf });
  if (!result.ok) {
    return {
      error: result.error.kind === "audit_not_completed" ? "Solo se pueden generar informes de auditorías completadas." : "La auditoría ya no existe.",
      generatedId: null,
    };
  }
  revalidatePath(`/workspaces/${workspaceId}/audits/${auditId}`);
  return { error: null, generatedId: result.report.id };
}
