import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/config/env";
import { getPool } from "@/db/client";
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
export async function SystemStatus() {
  const report = await loadReport();

  if ("configError" in report) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Estado del sistema</CardTitle>
          <CardDescription>Configuración incompleta</CardDescription>
        </CardHeader>
        <CardContent>
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
          Estado del sistema
          <Badge variant={report.status === "ok" ? "secondary" : "destructive"}>
            {report.status === "ok" ? "Operativo" : "Degradado"}
          </Badge>
        </CardTitle>
        <CardDescription>Comprobado {new Date(report.checkedAt).toLocaleString("es-ES")}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Base de datos</dt>
          <dd>{database.reachable ? `Conectada (${database.latencyMs} ms)` : "Sin conexión"}</dd>
          <dt className="text-muted-foreground">Migraciones aplicadas</dt>
          <dd>{database.appliedMigrations ?? "—"}</dd>
          {database.error ? (
            <>
              <dt className="text-muted-foreground">Detalle</dt>
              <dd className="text-destructive">{database.error}</dd>
            </>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}
