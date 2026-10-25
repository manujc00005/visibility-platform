import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { audits, reports, workspaces } from "@/db/schema";
import { emptyResult } from "@/modules/audits/pagespeed";
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
    ).toBe("diagnostico-seo-bucher.de-2026-10-26.pdf");
  });
});
