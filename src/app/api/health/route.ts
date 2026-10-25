import { connection } from "next/server";
import { getPool } from "@/db/client";
import { logger } from "@/lib/logger";
import { checkHealth } from "@/modules/system/health";

/** Public liveness/readiness probe. Returns only the status, never internals. */
export async function GET() {
  await connection();
  try {
    const report = await checkHealth(getPool());
    if (report.status !== "ok") {
      logger.warn({ database: report.database }, "health check degraded");
    }
    return Response.json(
      { status: report.status },
      { status: report.status === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error({ err: error }, "health check failed");
    return Response.json({ status: "degraded" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
