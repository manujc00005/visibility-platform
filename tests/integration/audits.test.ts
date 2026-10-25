import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { auditFindings, audits, workspaces } from "@/db/schema";
import { emptyResult } from "@/modules/audits/pagespeed";
import { getAudit, listAudits, runAudit } from "@/modules/audits/service";
import { createWorkspace } from "@/modules/workspaces/service";
import { fakeFetcher, HTML_OK, SITEMAP_OK } from "../support/fake-fetcher";
import { createTestDb } from "./db";

const { pool, db } = createTestDb();
afterAll(() => pool.end());
beforeEach(async () => {
  await db.delete(audits);
  await db.delete(workspaces);
});

async function workspace(website = "https://www.clinicagarcia.es/") {
  const result = await createWorkspace(db, {
    name: "Clínica García",
    website,
    sector: "Dental",
    country: "ES",
    city: "",
    services: "Implantes",
  });
  if (!result.ok) throw new Error("workspace setup failed");
  return result.workspace;
}

const site = () =>
  fakeFetcher({
    "https://www.clinicagarcia.es/robots.txt": { status: 200, body: "User-agent: *\nAllow: /\nSitemap: https://www.clinicagarcia.es/sitemap.xml", contentType: "text/plain" },
    "https://www.clinicagarcia.es/": { status: 200, body: HTML_OK, contentType: "text/html" },
    "https://www.clinicagarcia.es/sitemap.xml": { status: 200, body: SITEMAP_OK, contentType: "application/xml" },
  });
const deps = (overrides: Partial<Parameters<typeof runAudit>[2]> = {}) => ({
  fetcher: site(),
  pageSpeed: async () => emptyResult("not_configured"),
  ...overrides,
});

describe("runAudit", () => {
  it("stores a completed audit with ordered findings, counts, facts and request log", async () => {
    const ws = await workspace();
    const result = await runAudit(db, ws.id, deps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { audit } = result;
    expect(audit).toMatchObject({
      status: "completed",
      requestedUrl: "https://www.clinicagarcia.es/",
      finalUrl: "https://www.clinicagarcia.es/",
      rulesVersion: expect.any(String),
    });
    expect(audit.finishedAt).toBeInstanceOf(Date);
    expect(audit.fetchLog).toHaveLength(3);
    const stored = await getAudit(db, ws.id, audit.id);
    const findings = stored!.findings;
    expect(findings.map((f) => f.position)).toEqual(findings.map((_, i) => i));
    expect(audit.criticalCount + audit.warningCount + audit.infoCount).toBe(findings.length);
    expect(stored!.audit.facts?.page.kind).toBe("fetched");
    // HTML_OK lacks Open Graph and structured data: those findings must be there with evidence.
    expect(findings.map((f) => f.ruleId)).toEqual(expect.arrayContaining(["open_graph_incomplete", "structured_data_missing"]));
    expect(findings.every((f) => Array.isArray(f.evidence) && f.recommendation.length > 0)).toBe(true);
  });

  it("completes (not fails) when the website is unreachable, with a critical finding", async () => {
    const ws = await workspace("noexiste-xyz.es");
    const result = await runAudit(db, ws.id, deps({ fetcher: fakeFetcher({ "https://noexiste-xyz.es/robots.txt": { fail: "dns" }, "https://noexiste-xyz.es/": { fail: "dns" } }) }));
    expect(result.ok && result.audit).toMatchObject({ status: "completed", finalUrl: null, criticalCount: 1 });
  });

  it("returns not_found for unknown or malformed workspaces", async () => {
    expect(await runAudit(db, "00000000-0000-4000-8000-000000000000", deps())).toEqual({ ok: false, error: { kind: "not_found" } });
    expect(await runAudit(db, "no-uuid", deps())).toEqual({ ok: false, error: { kind: "not_found" } });
  });

  it("allows only one running audit per workspace, even under concurrency", async () => {
    const ws = await workspace();
    const slow = deps({
      pageSpeed: async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return emptyResult("not_configured");
      },
    });
    const results = await Promise.all([runAudit(db, ws.id, slow), runAudit(db, ws.id, slow), runAudit(db, ws.id, slow)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).map((r) => !r.ok && r.error.kind)).toEqual(["already_running", "already_running"]);
    expect(await listAudits(db, ws.id)).toHaveLength(1);
  });

  it("closes an audit left running by a crash after the stale timeout, then runs a new one", async () => {
    const ws = await workspace();
    const [stale] = await db
      .insert(audits)
      .values({ workspaceId: ws.id, requestedUrl: "https://x/", rulesVersion: "old", startedAt: sql`now() - interval '11 minutes'` })
      .returning();
    const result = await runAudit(db, ws.id, deps());
    expect(result.ok && result.audit.status).toBe("completed");
    const closed = await getAudit(db, ws.id, stale!.id);
    expect(closed!.audit).toMatchObject({ status: "failed", error: expect.stringContaining("interrumpió") });
  });

  it("does not close a recent running audit", async () => {
    const ws = await workspace();
    await db.insert(audits).values({ workspaceId: ws.id, requestedUrl: "https://x/", rulesVersion: "old" });
    expect(await runAudit(db, ws.id, deps())).toMatchObject({ ok: false, error: { kind: "already_running" } });
  });

  it("marks the audit failed on an internal error and stores no findings", async () => {
    const ws = await workspace();
    const result = await runAudit(db, ws.id, deps({ pageSpeed: async () => { throw new Error("boom"); } }));
    expect(result.ok && result.audit).toMatchObject({ status: "failed", error: "Error interno durante la auditoría." });
    const findings = await db.select().from(auditFindings);
    expect(findings).toHaveLength(0);
    // The workspace can be audited again immediately.
    expect((await runAudit(db, ws.id, deps())).ok).toBe(true);
  });
});

describe("audit queries", () => {
  it("only returns an audit within its own workspace and lists newest first", async () => {
    const a = await workspace();
    const b = await workspace("otra-empresa.es");
    const first = await runAudit(db, a.id, deps());
    const second = await runAudit(db, a.id, deps());
    if (!first.ok || !second.ok) throw new Error("setup");
    expect(await getAudit(db, b.id, first.audit.id)).toBeNull();
    expect(await getAudit(db, a.id, "bad-id")).toBeNull();
    expect((await listAudits(db, a.id)).map((x) => x.id)).toEqual([second.audit.id, first.audit.id]);
    expect(await listAudits(db, b.id)).toEqual([]);
  });

  it("deletes audits and findings with their workspace", async () => {
    const ws = await workspace();
    await runAudit(db, ws.id, deps());
    await db.delete(workspaces);
    expect(await db.select().from(audits)).toHaveLength(0);
    expect(await db.select().from(auditFindings)).toHaveLength(0);
  });
});
