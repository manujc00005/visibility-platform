"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { getMessages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { geoProviderStatus } from "@/modules/geo/deps";
import { renderPdf } from "@/modules/reports/render-pdf";
import { createReport } from "@/modules/reports/service";

/** Private operator only (no authentication until Phase 5, roadmap D-03). */

export interface GenerateReportState {
  error: string | null;
  generatedId: string | null;
}

export async function generateReportAction(workspaceId: string, auditId: string): Promise<GenerateReportState> {
  const result = await createReport(getDb(), workspaceId, auditId, {
    renderPdf,
    geoReportableProviders: geoProviderStatus().dataforseo.reportable ? ["manual", "dataforseo_chatgpt"] : ["manual"],
  });
  if (!result.ok) {
    const t = getMessages(await getLocale()).audits.reportErrors;
    return { error: result.error.kind === "audit_not_completed" ? t.notCompleted : t.auditGone, generatedId: null };
  }
  revalidatePath(`/workspaces/${workspaceId}/audits/${auditId}`);
  return { error: null, generatedId: result.report.id };
}
