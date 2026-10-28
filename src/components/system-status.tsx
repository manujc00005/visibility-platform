import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/config/env";
import { getPool } from "@/db/client";
import { formatTimestamp } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import { checkHealth, type HealthReport } from "@/modules/system/health";

async function loadReport(): Promise<HealthReport | { configError: string }> {
  await connection();
  try {
    env();
  } catch (error) {
    return { configError: error instanceof Error ? error.message : String(error) };
  }
  return checkHealth(getPool());
}

/** Operator-only status card (private development environment, Phase 0). */
export async function SystemStatus({ locale }: { locale: Locale }) {
  const t = getMessages(locale).home.systemStatus;
  const report = await loadReport();

  if ("configError" in report) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>{t.configIncomplete}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Technical error text from the environment validation: not localized (D017). */}
          <pre className="text-sm whitespace-pre-wrap text-destructive">{report.configError}</pre>
        </CardContent>
      </Card>
    );
  }

  const { database } = report;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t.title}
          <Badge variant={report.status === "ok" ? "secondary" : "destructive"}>
            {report.status === "ok" ? t.operational : t.degraded}
          </Badge>
        </CardTitle>
        <CardDescription>{t.checkedAt(formatTimestamp(new Date(report.checkedAt), locale))}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t.database}</dt>
          <dd>{database.reachable ? t.connected(database.latencyMs) : t.noConnection}</dd>
          <dt className="text-muted-foreground">{t.migrations}</dt>
          <dd>{database.appliedMigrations ?? "—"}</dd>
          {database.error ? (
            <>
              <dt className="text-muted-foreground">{t.detail}</dt>
              <dd className="text-destructive">{database.error}</dd>
            </>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}
