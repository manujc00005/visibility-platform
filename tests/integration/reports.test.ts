import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { analyticsSnapshots, audits, geoRuns, providerSpend, reports, searchConsoleSnapshots, workspaces } from "@/db/schema";
import { getMessages } from "@/i18n/messages";
import { saveGoal } from "@/modules/goals/service";
import { emptyResult } from "@/modules/audits/pagespeed";
import type { DataForSeoClient } from "@/modules/geo/dataforseo";
import { addPrompt, createGeoRun, getGeoRun, recordManualObservation, refreshGeoRun } from "@/modules/geo/service";
import { runAudit } from "@/modules/audits/service";
import { renderPdf } from "@/modules/reports/render-pdf";
import { createReport, getReport, listReports, reportFileName } from "@/modules/reports/service";
import { createWorkspace, updateWorkspace } from "@/modules/workspaces/service";
import { fakeFetcher, HTML_OK, SITEMAP_OK } from "../support/fake-fetcher";
import { createTestDb } from "./db";

const { pool, db } = createTestDb();
afterAll(() => pool.end());
beforeEach(async () => {
  await db.delete(reports);
  await db.delete(providerSpend);
  await db.delete(audits);
  await db.delete(workspaces);
});

const form = {
  name: "Clínica García",
  website: "https://www.clinicagarcia.es/",
  sector: "Dental",
  country: "ES",
  city: "Valladolid",
  services: "Implantes",
};

async function completedAudit() {
  const ws = await createWorkspace(db, form);
  if (!ws.ok) throw new Error("workspace");
  const fetcher = fakeFetcher({
    "https://www.clinicagarcia.es/robots.txt": { status: 200, body: "User-agent: *\nAllow: /", contentType: "text/plain" },
    "https://www.clinicagarcia.es/": { status: 200, body: HTML_OK, contentType: "text/html" },
    "https://www.clinicagarcia.es/sitemap.xml": { status: 200, body: SITEMAP_OK, contentType: "application/xml" },
  });
  const audit = await runAudit(db, ws.workspace.id, { fetcher, pageSpeed: async () => emptyResult("not_configured") });
  if (!audit.ok) throw new Error("audit");
  return { workspace: ws.workspace, audit: audit.audit };
}

const fakeRender = async (html: string) => ({ pdf: Buffer.from(`%PDF-1.4 fake ${html.length}\n%%EOF`), blockedRequests: [] });

describe("createReport", () => {
  it("renders a real PDF from stored data and stores the exact delivered file with its hash", async () => {
    const { workspace, audit } = await completedAudit();
    const result = await createReport(db, workspace.id, audit.id, { renderPdf });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stored = await getReport(db, workspace.id, audit.id, result.report.id);
    expect(stored!.pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(stored!.pdfBytes).toBe(stored!.pdf.length);
    expect(stored!.pdfSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(stored!.html).toContain("1. Resumen ejecutivo");
    expect(stored!.workspaceSnapshot).toMatchObject({ name: "Clínica García", displayDomain: "clinicagarcia.es", country: "España" });
  }, 60_000);

  it("freezes company data: editing the workspace later does not change an existing report", async () => {
    const { workspace, audit } = await completedAudit();
    const first = await createReport(db, workspace.id, audit.id, { renderPdf: fakeRender });
    await updateWorkspace(db, workspace.id, { ...form, name: "Nombre Nuevo" });
    const second = await createReport(db, workspace.id, audit.id, { renderPdf: fakeRender });
    if (!first.ok || !second.ok) throw new Error("setup");
    expect((await getReport(db, workspace.id, audit.id, first.report.id))!.html).toContain("Clínica García");
    expect((await getReport(db, workspace.id, audit.id, second.report.id))!.html).toContain("Nombre Nuevo");
    expect((await listReports(db, workspace.id, audit.id)).map((r) => r.id)).toEqual([second.report.id, first.report.id]);
  });

  it("refuses audits that are not completed", async () => {
    const ws = await createWorkspace(db, form);
    if (!ws.ok) throw new Error("workspace");
    const [running] = await db.insert(audits).values({ workspaceId: ws.workspace.id, requestedUrl: "https://x/", rulesVersion: "v" }).returning();
    expect(await createReport(db, ws.workspace.id, running!.id, { renderPdf: fakeRender })).toEqual({
      ok: false,
      error: { kind: "audit_not_completed" },
    });
  });

  it("does not create reports across workspaces or for unknown ids", async () => {
    const { audit } = await completedAudit();
    const other = await createWorkspace(db, { ...form, website: "otra.es" });
    if (!other.ok) throw new Error("other");
    expect(await createReport(db, other.workspace.id, audit.id, { renderPdf: fakeRender })).toEqual({ ok: false, error: { kind: "not_found" } });
    expect(await createReport(db, "bad", audit.id, { renderPdf: fakeRender })).toEqual({ ok: false, error: { kind: "not_found" } });
    expect(await db.select().from(reports)).toHaveLength(0);
  });
});

describe("report queries", () => {
  it("only returns a report within its own workspace and audit", async () => {
    const { workspace, audit } = await completedAudit();
    const created = await createReport(db, workspace.id, audit.id, { renderPdf: fakeRender });
    if (!created.ok) throw new Error("setup");
    const id = created.report.id;
    expect(await getReport(db, workspace.id, audit.id, id)).not.toBeNull();
    expect(await getReport(db, workspace.id, "00000000-0000-4000-8000-000000000000", id)).toBeNull();
    expect(await getReport(db, "00000000-0000-4000-8000-000000000000", audit.id, id)).toBeNull();
    expect(await getReport(db, workspace.id, audit.id, "x")).toBeNull();
  });

  it("lists summaries without loading the HTML or the PDF", async () => {
    const { workspace, audit } = await completedAudit();
    await createReport(db, workspace.id, audit.id, { renderPdf: fakeRender });
    const [summary] = await listReports(db, workspace.id, audit.id);
    expect(summary).not.toHaveProperty("pdf");
    expect(summary).not.toHaveProperty("html");
  });

  it("builds an ASCII download file name", () => {
    expect(
      reportFileName({
        workspaceSnapshot: { name: "x", displayDomain: "bücher.de", sector: "x", country: "x", city: null, services: [] },
        createdAt: new Date("2026-10-26T10:00:00Z"),
      }),
    ).toBe("diagnostico-visibilidad-bucher.de-2026-10-26.pdf");
  });
});

describe("results in search engines in the report (feature 021)", () => {
  const totals = { clicks: 12, impressions: 400, ctr: 0.03, position: 9.4 };
  const capture = (workspaceId: string) =>
    db.insert(searchConsoleSnapshots).values({
      workspaceId,
      status: "completed",
      property: "sc-domain:clinicagarcia.es",
      currentStart: "2026-09-27",
      currentEnd: "2026-10-24",
      previousStart: "2026-08-30",
      previousEnd: "2026-09-26",
      totals,
      previousTotals: { clicks: 8, impressions: 390, ctr: 0.02, position: 12.1 },
    });
  const htmlOf = async (workspaceId: string, auditId: string) => {
    const report = await createReport(db, workspaceId, auditId, { renderPdf: fakeRender });
    if (!report.ok) throw new Error("report");
    return (await getReport(db, workspaceId, auditId, report.report.id))!.html;
  };

  it("uses the figures of the stored capture and the goal sentence of the overview (AC-001, AC-003)", async () => {
    const { workspace, audit } = await completedAudit();
    await capture(workspace.id);
    await saveGoal(db, workspace.id, { kind: "request", label: "Solicitud de presupuesto", eventName: "generate_lead" });
    const doc = await htmlOf(workspace.id, audit.id);
    expect(doc).toContain("<strong>12 clics</strong>");
    expect(doc).toContain("<strong>400 impresiones</strong>");
    expect(doc).toContain("Antes: 8 clics (+50 %)");
    expect(doc).toContain("<dt>CTR</dt><dd>3,0 %");
    expect(doc).toContain("<dt>Posición media</dt><dd>9,4");
    expect(doc).toContain("Solicitud de presupuesto: pendiente de comprobar la medición.");
    // Steps for the operator stay out of the client document (D002).
    expect(doc).not.toContain("Conecta Google Analytics");
    expect(doc).toContain("sc-domain:clinicagarcia.es");
  });

  it("prints the figures at zero with their change when only the previous period had impressions (feature 021)", async () => {
    const { workspace, audit } = await completedAudit();
    await capture(workspace.id);
    await db.update(searchConsoleSnapshots).set({ totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 } }).where(eq(searchConsoleSnapshots.workspaceId, workspace.id));
    const doc = await htmlOf(workspace.id, audit.id);
    expect(doc).toContain("<dt>Clics</dt><dd>0");
    expect(doc).toContain("Antes: 8 clics");
    expect(doc).toContain("comparado con los 28 días anteriores");
  });

  it("explains a capture with no impressions in either period without figures (feature 021)", async () => {
    const { workspace, audit } = await completedAudit();
    await capture(workspace.id);
    const none = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    await db.update(searchConsoleSnapshots).set({ totals: none, previousTotals: none }).where(eq(searchConsoleSnapshots.workspaceId, workspace.id));
    const doc = await htmlOf(workspace.id, audit.id);
    expect(doc).toContain("no registra impresiones de esta web en este periodo ni en los 28 días anteriores");
    expect(doc).not.toContain('class="figures"');
  });

  it("prints a verified goal with its evidence and leaves out the note for the operator (AC-003)", async () => {
    const { workspace, audit } = await completedAudit();
    await db.insert(analyticsSnapshots).values({
      workspaceId: workspace.id,
      status: "completed",
      property: "properties/123",
      propertyName: "Web",
      currentStart: "2026-10-01",
      currentEnd: "2026-10-28",
      previousStart: "2026-09-03",
      previousEnd: "2026-09-30",
      totals: { users: 1, sessions: 1, views: 1 },
      previousTotals: { users: 0, sessions: 0, views: 0 },
      quality: { otherRow: false, thresholded: false, sampled: false },
      keyEvents: { version: 1, configured: ["purchase"], configuredMore: false, total: 5, previousTotal: 0, organic: 2, previousOrganic: 0, organicByEvent: [{ event: "generate_lead", keyEvents: 2 }] },
    });
    await saveGoal(db, workspace.id, { kind: "request", label: "Solicitud de presupuesto", eventName: "generate_lead" });
    const doc = await htmlOf(workspace.id, audit.id);
    expect(doc).toContain("Solicitud de presupuesto: 2 desde buscadores");
    expect(doc).toContain("Última recepción observada");
    expect(doc).toContain("No equivale a clientes ni a ventas");
    expect(doc).not.toContain(getMessages("es").goals.line.notConfigured);
  });

  it("keeps the good capture after a later failure without mentioning it, and never reads another company (feature 021)", async () => {
    const { workspace, audit } = await completedAudit();
    await capture(workspace.id);
    await db.insert(searchConsoleSnapshots).values({ workspaceId: workspace.id, status: "failed", errorKind: "no_access", errorMessage: "Sin acceso", accessibleProperties: 2 });
    const doc = await htmlOf(workspace.id, audit.id);
    expect(doc).toContain("<strong>12 clics</strong>");
    expect(doc).not.toContain("Sin acceso");
    expect(doc).not.toContain("Usuarios y permisos");

    const other = await createWorkspace(db, { name: "Otra", website: "https://otra-empresa.es/", sector: "Agencia", country: "ES", city: "", services: "CRM" });
    if (!other.ok) throw new Error("workspace");
    await capture(other.workspace.id);
    await saveGoal(db, other.workspace.id, { kind: "request", label: "Objetivo de otra empresa", eventName: "generate_lead" });
    const again = await htmlOf(workspace.id, audit.id);
    expect(again).not.toContain("Objetivo de otra empresa");
  });

  it("never shows a failed read or the service account to the client (AC-002)", async () => {
    const { workspace, audit } = await completedAudit();
    await db.insert(searchConsoleSnapshots).values({ workspaceId: workspace.id, status: "failed", errorKind: "no_access", errorMessage: "Sin acceso", accessibleProperties: 2 });
    const doc = await htmlOf(workspace.id, audit.id);
    expect(doc).not.toContain("iam.gserviceaccount.com");
    expect(doc).not.toContain("Usuarios y permisos");
    expect(doc).toContain("pendiente de medir");
  });
});

describe("AI visibility in reports (license gate, M01)", () => {
  async function completedManualRun(workspaceId: string, origin: "real" | "demo" | "test" = "real") {
    await addPrompt(db, workspaceId, { text: "¿Qué clínica dental me recomiendas en Valladolid?", intent: "discovery" });
    const run = await createGeoRun(db, workspaceId, { provider: "manual", origin }, { dataforseo: null, budgetCapMicros: null });
    if (!run.ok) throw new Error(run.error);
    const [obs] = (await getGeoRun(db, workspaceId, run.value.id))!.observations;
    await recordManualObservation(db, workspaceId, run.value.id, obs!.id, { answer: "Clínica García es buena opción." });
    return run.value.id;
  }

  async function completedPaidRun(workspaceId: string) {
    await addPrompt(db, workspaceId, { text: "¿Qué clínica dental me recomiendas en Valladolid?", intent: "discovery" });
    const client: DataForSeoClient = {
      submit: async (tasks) => ({ kind: "answered", tasks: tasks.map((t) => ({ tag: t.tag, id: "33333333-3333-4333-8333-333333333333", created: true, costUsd: 0.0012, message: "20100" })) }),
      collect: async () => ({ state: "ready", markdown: "Clínica García.", sources: [] }),
      readyTags: async () => [],
    };
    const run = await createGeoRun(db, workspaceId, { provider: "dataforseo_chatgpt" }, { dataforseo: client, budgetCapMicros: 1_000_000 });
    if (!run.ok) throw new Error(run.error);
    await refreshGeoRun(db, workspaceId, run.value.id, { dataforseo: client, budgetCapMicros: 1_000_000 });
    return run.value.id;
  }

  it("includes the latest completed assisted measurement and records which one", async () => {
    const { workspace, audit } = await completedAudit();
    const runId = await completedManualRun(workspace.id);
    const report = await createReport(db, workspace.id, audit.id, { renderPdf: fakeRender });
    if (!report.ok) throw new Error("report");
    expect(report.report.geoRunId).toBe(runId);
    const stored = await getReport(db, workspace.id, audit.id, report.report.id);
    expect(stored!.html).toContain("Visibilidad en asistentes de IA (muestra)");
    expect(stored!.html).not.toContain("Clínica García es buena opción."); // metrics only, never answer text
  });

  it("excludes paid DataForSEO data unless redistribution is confirmed", async () => {
    const { workspace, audit } = await completedAudit();
    const paidRunId = await completedPaidRun(workspace.id);
    const blocked = await createReport(db, workspace.id, audit.id, { renderPdf: fakeRender });
    if (!blocked.ok) throw new Error("report");
    expect(blocked.report.geoRunId).toBeNull();
    const allowed = await createReport(db, workspace.id, audit.id, { renderPdf: fakeRender, geoReportableProviders: ["manual", "dataforseo_chatgpt"] });
    if (!allowed.ok) throw new Error("report");
    expect(allowed.report.geoRunId).toBe(paidRunId);
    expect((await db.select().from(geoRuns)).length).toBe(1);
  });

  it("never prints a demo or test measurement, and picks the real one when both exist (feature 013, AC-004)", async () => {
    const { workspace, audit } = await completedAudit();
    await completedManualRun(workspace.id, "test");
    const blocked = await createReport(db, workspace.id, audit.id, { renderPdf: fakeRender });
    if (!blocked.ok) throw new Error("report");
    expect(blocked.report.geoRunId).toBeNull();
    expect((await getReport(db, workspace.id, audit.id, blocked.report.id))!.html).not.toContain("Visibilidad en asistentes de IA");
    const realRunId = await completedManualRun(workspace.id, "real");
    const allowed = await createReport(db, workspace.id, audit.id, { renderPdf: fakeRender });
    if (!allowed.ok) throw new Error("report");
    expect(allowed.report.geoRunId).toBe(realRunId);
  });

  it("omits the section when there is no completed measurement", async () => {
    const { workspace, audit } = await completedAudit();
    const report = await createReport(db, workspace.id, audit.id, { renderPdf: fakeRender });
    if (!report.ok) throw new Error("report");
    const stored = await getReport(db, workspace.id, audit.id, report.report.id);
    expect(stored!.html).not.toContain("Visibilidad en asistentes de IA");
    expect(stored!.html).toContain("8. Limitaciones de la medición");
  });
});
