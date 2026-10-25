import { connection } from "next/server";
import { getDb } from "@/db/client";
import { getReport, reportFileName } from "@/modules/reports/service";

/** Serves the exact PDF that was generated and stored for this report. */
export async function GET(_request: Request, { params }: RouteContext<"/workspaces/[id]/audits/[auditId]/reports/[reportId]/pdf">) {
  await connection();
  const { id, auditId, reportId } = await params;
  const report = await getReport(getDb(), id, auditId, reportId);
  if (!report) return new Response("Informe no encontrado", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(new Uint8Array(report.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${reportFileName(report)}"`,
      "content-length": String(report.pdfBytes),
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
      etag: `"${report.pdfSha256}"`,
    },
  });
}
