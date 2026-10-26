import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { displayCountry, displayDate, displayDomain } from "@/modules/workspaces/presentation";
import { getWorkspace } from "@/modules/workspaces/service";
import { RunAuditButton } from "@/components/audits/run-audit-button";
import { AUDIT_STATUS_LABELS } from "@/modules/audits/presentation";
import { listAudits } from "@/modules/audits/service";
import { runAuditAction } from "./audits/actions";

export const metadata: Metadata = { title: "Empresa" };

/**
 * Blocking route: the whole page depends on one record, and rendering it before the
 * response starts is what lets an unknown id return a real 404 instead of a streamed 200.
 */
export const instant = false;

export default async function WorkspacePage({ params }: PageProps<"/workspaces/[id]">) {
  await connection();
  const { id } = await params;
  const db = getDb();
  const workspace = await getWorkspace(db, id);
  if (!workspace) notFound();
  const audits = await listAudits(db, workspace.id);

  const rows: [string, React.ReactNode][] = [
    ["Dominio", <span key="d" className="font-mono">{displayDomain(workspace.domain)}</span>],
    [
      "Host introducido",
      <span key="h" className="font-mono">
        {displayDomain(workspace.hostname)}
        {displayDomain(workspace.hostname) !== workspace.hostname ? (
          <span className="text-muted-foreground"> ({workspace.hostname})</span>
        ) : null}
      </span>,
    ],
    // Shown as text, not as a link: the address has not been checked by the safe fetcher yet.
    ["Dirección original", <span key="o" className="font-mono break-all">{workspace.originalUrl}</span>],
    ["Sector", workspace.sector],
    ["País", displayCountry(workspace.country)],
    ["Ciudad", workspace.city ?? <span key="c" className="text-muted-foreground">No indicada</span>],
    ["Alta", displayDate(workspace.createdAt)],
    ["Última edición", displayDate(workspace.updatedAt)],
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/workspaces" className="text-sm text-muted-foreground hover:underline">
            ← Empresas
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{workspace.name}</h1>
        </div>
        <Link href={`/workspaces/${workspace.id}/edit`} className={buttonVariants({ variant: "outline" })}>
          Editar
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ficha</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auditorías técnicas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Analiza la portada de {displayDomain(workspace.domain)}, su robots.txt, el sitemap y la velocidad en móvil.
          </p>
          <RunAuditButton workspaceId={workspace.id} action={runAuditAction.bind(null, workspace.id)} />
          {audits.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay auditorías.</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {audits.map((audit) => (
                <li key={audit.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/workspaces/${workspace.id}/audits/${audit.id}`} className="font-medium hover:underline">
                    {displayDate(audit.startedAt)}
                  </Link>
                  <span className="flex flex-wrap items-center gap-2">
                    {audit.status === "completed" ? (
                      <>
                        <Badge variant={audit.criticalCount > 0 ? "destructive" : "outline"}>{audit.criticalCount} críticos</Badge>
                        <Badge variant="outline">{audit.warningCount} importantes</Badge>
                        <Badge variant="secondary">{audit.infoCount} mejoras</Badge>
                      </>
                    ) : (
                      <Badge variant={audit.status === "failed" ? "destructive" : "outline"}>{AUDIT_STATUS_LABELS[audit.status]}</Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Visibilidad en asistentes de IA</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-2 text-sm">
          <p className="text-muted-foreground">Marca, competidores, preguntas y mediciones de si ChatGPT menciona y cita esta web.</p>
          <Link href={`/workspaces/${workspace.id}/geo`} className={buttonVariants({ variant: "outline" })}>
            Abrir visibilidad en IA
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Servicios principales</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {workspace.services.map((service) => (
            <Badge key={service} variant="secondary">
              {service}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
