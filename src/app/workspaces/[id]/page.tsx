import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { EvolutionChart } from "@/components/audits/evolution-chart";
import { RunAuditButton } from "@/components/audits/run-audit-button";
import { StatusPill, ToneIcon, toneClasses } from "@/components/audits/status-ui";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { cn } from "@/lib/utils";
import { computeEvolution, DIRECTION_TONE, type Direction } from "@/modules/audits/evolution";
import { AUDIT_STATUS_LABELS } from "@/modules/audits/presentation";
import { listAudits } from "@/modules/audits/service";
import { auditHeadline, rateMetric, RATING_LABELS, RATING_TONE } from "@/modules/audits/status";
import { displayCountry, displayDate, displayDomain } from "@/modules/workspaces/presentation";
import { getWorkspace } from "@/modules/workspaces/service";
import { runAuditAction } from "./audits/actions";

export const metadata: Metadata = { title: "Empresa" };

/**
 * Blocking route: the whole page depends on one record, and rendering it before the
 * response starts is what lets an unknown id return a real 404 instead of a streamed 200.
 */
export const instant = false;

const CHANGE_ICON: Record<Direction, typeof ArrowUpRight> = { better: ArrowUpRight, same: ArrowRight, worse: ArrowDownRight };

function Change({ direction, text }: { direction: Direction; text: string }) {
  const Icon = CHANGE_ICON[direction];
  const tone = DIRECTION_TONE[direction];
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium", toneClasses(tone).text)}>
      <Icon aria-hidden="true" className="size-[1.1em]" />
      {text}
    </span>
  );
}

export default async function WorkspacePage({ params }: PageProps<"/workspaces/[id]">) {
  await connection();
  const { id } = await params;
  const db = getDb();
  const workspace = await getWorkspace(db, id);
  if (!workspace) notFound();
  const audits = await listAudits(db, workspace.id);
  const evolution = computeEvolution(audits);
  const domain = displayDomain(workspace.domain);

  const rows: [string, React.ReactNode][] = [
    ["Dominio", <span key="d" className="font-mono">{domain}</span>],
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
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/workspaces" className="text-sm text-muted-foreground hover:underline">
            ← Empresas
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{workspace.name}</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{domain}</span> · {workspace.sector}
          </p>
        </div>
        <Link href={`/workspaces/${workspace.id}/edit`} className={buttonVariants({ variant: "outline" })}>
          Editar
        </Link>
      </div>

      <section aria-labelledby="state-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="state-title" className="text-lg font-semibold">
              Estado de la web
            </h2>
            <p className="text-sm text-muted-foreground">
              {evolution.latest ? `Según la auditoría del ${displayDate(evolution.latest.date)}.` : "Aún no hay ninguna auditoría."}
            </p>
          </div>
          <RunAuditButton workspaceId={workspace.id} action={runAuditAction.bind(null, workspace.id)} />
        </div>

        {evolution.headline && evolution.latest ? (
          <>
            <Link
              href={`/workspaces/${workspace.id}/audits/${evolution.latest.id}`}
              className={cn(
                "flex items-start gap-3 rounded-xl border border-l-4 p-4 transition-colors hover:brightness-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                toneClasses(evolution.headline.tone).soft,
                toneClasses(evolution.headline.tone).accent,
              )}
            >
              <ToneIcon tone={evolution.headline.tone} className="mt-0.5 size-6" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={cn("text-base font-semibold", toneClasses(evolution.headline.tone).text)}>{evolution.headline.title}</span>
                <span className="text-sm text-foreground/80">{evolution.headline.detail}</span>
                {evolution.trend ? (
                  <span className="mt-1 text-sm">
                    <Change direction={evolution.trend.direction} text={evolution.trend.text} />
                  </span>
                ) : null}
              </span>
              <ChevronRight aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground" />
            </Link>

            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {evolution.indicators.map((ind) => (
                <li key={ind.label} className={cn("flex flex-col gap-1.5 rounded-lg border border-l-4 bg-card p-3", toneClasses(ind.tone).accent)}>
                  <span className="text-xs text-muted-foreground">{ind.label}</span>
                  <span className="text-2xl leading-none font-semibold tabular-nums">{ind.value}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={ind.tone}>{ind.verdict}</StatusPill>
                    {ind.change ? <Change direction={ind.change.direction} text={ind.change.text} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <Card>
            <CardContent className="text-sm text-muted-foreground">
              Ejecuta la primera auditoría para ver si la web carga rápido y qué problemas tiene. Tarda menos de un minuto.
            </CardContent>
          </Card>
        )}
      </section>

      {evolution.points.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Evolución</CardTitle>
            <CardDescription>Cómo han cambiado los problemas y la velocidad en cada auditoría. Menos problemas y más puntuación es mejor.</CardDescription>
          </CardHeader>
          <CardContent>
            <EvolutionChart points={evolution.points} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Auditorías técnicas</CardTitle>
          <CardDescription>
            Cada auditoría analiza la portada de {domain}, su robots.txt, el sitemap y la velocidad en móvil. Pulsa una para ver el detalle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {audits.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay auditorías.</p>
          ) : (
            <ul className="-mx-2 flex flex-col text-sm">
              {audits.map((audit) => {
                const completed = audit.status === "completed";
                const headline = completed ? auditHeadline({ critical: audit.criticalCount, warning: audit.warningCount, info: audit.infoCount }) : null;
                const perf = audit.facts?.performance;
                const score = perf?.status === "ok" ? perf.score : null;
                const verdict = headline ? (headline.tone === "bad" ? "Mal" : headline.tone === "fair" ? "Regular" : "Bien") : null;
                return (
                  <li key={audit.id}>
                    <Link
                      href={`/workspaces/${workspace.id}/audits/${audit.id}`}
                      className="flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {headline ? (
                        <ToneIcon tone={headline.tone} className="size-5" />
                      ) : (
                        <ToneIcon tone={audit.status === "failed" ? "bad" : "neutral"} className="size-5" />
                      )}
                      <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                        <span className="font-medium">{displayDate(audit.startedAt)}</span>
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {completed && headline && verdict ? (
                            <>
                              <StatusPill tone={headline.tone}>{verdict}</StatusPill>
                              <span>
                                {audit.criticalCount} críticos · {audit.warningCount} importantes · {audit.infoCount} mejoras
                              </span>
                            </>
                          ) : (
                            <StatusPill tone={audit.status === "failed" ? "bad" : "neutral"}>{AUDIT_STATUS_LABELS[audit.status]}</StatusPill>
                          )}
                        </span>
                      </span>
                      {score !== null ? (
                        <StatusPill tone={RATING_TONE[rateMetric("score", score)]} className="hidden sm:inline-flex">
                          {`Velocidad ${score} · ${RATING_LABELS[rateMetric("score", score)]}`}
                        </StatusPill>
                      ) : completed ? (
                        <span className="hidden text-xs text-muted-foreground sm:inline">Velocidad no medida</span>
                      ) : null}
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Visibilidad en asistentes de IA</CardTitle>
          <CardDescription>Marca, competidores, preguntas y mediciones de si ChatGPT menciona y cita esta web.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={`/workspaces/${workspace.id}/geo`} className={buttonVariants({ variant: "outline" })}>
            Abrir visibilidad en IA
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ficha</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Servicios principales</p>
            <div className="flex flex-wrap gap-2">
              {workspace.services.map((service) => (
                <Badge key={service} variant="secondary">
                  {service}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
