import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { logger } from "@/lib/logger";
import { getAudit } from "@/modules/audits/service";
import { PROVIDER_LABELS } from "@/modules/geo/presentation";
import type { GeoRun } from "@/modules/geo/schema";
import { listGeoRuns } from "@/modules/geo/service";
import type { Severity } from "@/modules/audits/rules";
import { buildReportHtml, TEMPLATE_VERSION, type ReportGeo, type ReportInput } from "@/modules/reports/build-report";
import type { RenderedPdf } from "@/modules/reports/render-pdf";
import { reports, type Report, type ReportSummary } from "@/modules/reports/schema";
import { displayCountry, displayDomain } from "@/modules/workspaces/presentation";
import { getWorkspace } from "@/modules/workspaces/service";

export interface ReportDeps {
  renderPdf: (html: string) => Promise<RenderedPdf>;
  now?: () => Date;
  /**
   * Measurement providers whose data may appear in client reports (M01). Assisted capture
   * is the operator's own observation; DataForSEO only after written confirmation.
   */
  geoReportableProviders?: GeoRun["provider"][];
}

export type CreateReportResult =
  | { ok: true; report: ReportSummary }
  | { ok: false; error: { kind: "not_found" } | { kind: "audit_not_completed" } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const summaryColumns = {
  id: reports.id,
  auditId: reports.auditId,
  workspaceId: reports.workspaceId,
  templateVersion: reports.templateVersion,
  geoRunId: reports.geoRunId,
  workspaceSnapshot: reports.workspaceSnapshot,
  pdfSha256: reports.pdfSha256,
  pdfBytes: reports.pdfBytes,
  createdAt: reports.createdAt,
};

/**
 * Generates a report from stored data only (the website is not contacted again) and stores
 * the exact PDF that will be delivered.
 */
export async function createReport(
  db: Database,
  workspaceId: string,
  auditId: string,
  deps: ReportDeps,
): Promise<CreateReportResult> {
  const workspace = await getWorkspace(db, workspaceId);
  if (!workspace) return { ok: false, error: { kind: "not_found" } };
  const stored = await getAudit(db, workspace.id, auditId);
  if (!stored) return { ok: false, error: { kind: "not_found" } };
  const { audit, findings } = stored;
  if (audit.status !== "completed" || !audit.facts) return { ok: false, error: { kind: "audit_not_completed" } };

  const snapshot: ReportInput["workspace"] = {
    name: workspace.name,
    displayDomain: displayDomain(workspace.domain),
    sector: workspace.sector,
    country: displayCountry(workspace.country),
    city: workspace.city,
    services: workspace.services,
  };
  const reportable = deps.geoReportableProviders ?? ["manual"];
  const geoView = (await listGeoRuns(db, workspace.id)).find(
    (v) => v.run.status === "completed" && v.metrics.answers.k > 0 && reportable.includes(v.run.provider),
  );
  const geo: ReportGeo | null = geoView
    ? {
        measuredAt: geoView.run.createdAt,
        method: PROVIDER_LABELS[geoView.run.provider],
        locationName: geoView.run.config.location.locationName,
        languageCode: geoView.run.config.location.languageCode,
        repetitions: geoView.run.config.repetitions,
        brandName: geoView.run.config.panel.brand.name,
        metrics: geoView.metrics,
      }
    : null;

  const html = buildReportHtml({
    workspace: snapshot,
    audit: {
      id: audit.id,
      startedAt: audit.startedAt,
      rulesVersion: audit.rulesVersion,
      requestedUrl: audit.requestedUrl,
      finalUrl: audit.finalUrl,
      facts: audit.facts,
      findings: findings.map((f) => ({
        ruleId: f.ruleId,
        severity: f.severity as Severity,
        category: f.category,
        title: f.title,
        evidence: f.evidence,
        recommendation: f.recommendation,
      })),
      fetchLog: audit.fetchLog,
    },
    generatedAt: (deps.now ?? (() => new Date()))(),
    geo,
  });

  const started = Date.now();
  const { pdf, blockedRequests } = await deps.renderPdf(html);
  if (blockedRequests.length > 0) {
    // Our template references no resource: any blocked request means a template regression.
    logger.warn({ auditId, blockedRequests: blockedRequests.length }, "report document attempted network requests");
  }
  const [report] = await db
    .insert(reports)
    .values({
      auditId: audit.id,
      workspaceId: workspace.id,
      templateVersion: TEMPLATE_VERSION,
      geoRunId: geoView?.run.id ?? null,
      workspaceSnapshot: snapshot,
      html,
      pdf,
      pdfSha256: createHash("sha256").update(pdf).digest("hex"),
      pdfBytes: pdf.length,
    })
    .returning(summaryColumns);
  logger.info({ workspaceId, auditId, reportId: report!.id, bytes: pdf.length, ms: Date.now() - started }, "report generated");
  return { ok: true, report: report! };
}

export async function listReports(db: Database, workspaceId: string, auditId: string): Promise<ReportSummary[]> {
  if (!UUID.test(workspaceId) || !UUID.test(auditId)) return [];
  return db
    .select(summaryColumns)
    .from(reports)
    .where(and(eq(reports.workspaceId, workspaceId), eq(reports.auditId, auditId)))
    .orderBy(desc(reports.createdAt));
}

/** Loads one report only if it belongs to the given workspace and audit. */
export async function getReport(db: Database, workspaceId: string, auditId: string, reportId: string): Promise<Report | null> {
  if (![workspaceId, auditId, reportId].every((id) => UUID.test(id))) return null;
  const [report] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.id, reportId), eq(reports.workspaceId, workspaceId), eq(reports.auditId, auditId)));
  return report ?? null;
}

/** File name for downloads: ASCII only, derived from the stored snapshot. */
export function reportFileName(report: Pick<Report, "workspaceSnapshot" | "createdAt">): string {
  const slug = report.workspaceSnapshot.displayDomain
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // drop combining accents left by NFKD ("ü" → "u")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `diagnostico-seo-${slug || "web"}-${report.createdAt.toISOString().slice(0, 10)}.pdf`;
}
