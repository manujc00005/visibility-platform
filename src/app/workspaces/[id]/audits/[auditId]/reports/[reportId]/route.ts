import { connection } from "next/server";
import { getDb } from "@/db/client";
import { getReport } from "@/modules/reports/service";

/**
 * Report preview. The document is static and escaped; this Content-Security-Policy is a
 * second barrier: no script, no network request, no form, no framing, even if escaping failed.
 */
const PREVIEW_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cache-control": "private, no-store",
  "x-robots-tag": "noindex, nofollow",
};

export async function GET(_request: Request, { params }: RouteContext<"/workspaces/[id]/audits/[auditId]/reports/[reportId]">) {
  await connection();
  const { id, auditId, reportId } = await params;
  const report = await getReport(getDb(), id, auditId, reportId);
  if (!report) return new Response("Informe no encontrado", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(report.html, { headers: PREVIEW_HEADERS });
}
