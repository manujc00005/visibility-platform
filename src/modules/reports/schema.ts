import { customType, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { audits } from "@/modules/audits/schema";
import { geoRuns } from "@/modules/geo/schema";
import type { ReportInput } from "@/modules/reports/build-report";
import { workspaces } from "@/modules/workspaces/schema";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/**
 * A generated client report. The PDF actually delivered is stored as-is (with its hash) so
 * the same file can be served again; regenerating creates a new row (a new revision).
 * `workspaceSnapshot` freezes the company data printed in the report, because the
 * workspace can be edited afterwards. Pilot volumes are small: object storage is P1.
 */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auditId: uuid("audit_id")
      .notNull()
      .references(() => audits.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    templateVersion: text("template_version").notNull(),
    /** AI-visibility measurement included in the report, if any (Phase 4). */
    geoRunId: uuid("geo_run_id").references(() => geoRuns.id, { onDelete: "set null" }),
    workspaceSnapshot: jsonb("workspace_snapshot").$type<ReportInput["workspace"]>().notNull(),
    html: text("html").notNull(),
    pdf: bytea("pdf").notNull(),
    pdfSha256: text("pdf_sha256").notNull(),
    pdfBytes: integer("pdf_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("reports_audit_created_idx").on(table.auditId, table.createdAt.desc())],
);

export type Report = typeof reports.$inferSelect;
export type ReportSummary = Omit<Report, "html" | "pdf">;
