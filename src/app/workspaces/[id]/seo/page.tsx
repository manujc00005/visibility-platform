import { ChevronRight, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { ChartDataTable, ProblemsChart, ProblemsLegend } from "@/components/audits/evolution-chart";
import { RunAuditButton } from "@/components/audits/run-audit-button";
import { StatusPill, ToneIcon } from "@/components/audits/status-ui";
import { ChangeLine, NoticeList, type Notice } from "@/components/overview/overview-card";
import { PageHeader } from "@/components/overview/page-header";
import { WorkspaceNav } from "@/components/overview/workspace-nav";
import { getDb } from "@/db/client";
import { AUDIT_STATUS_LABELS, CATEGORY_LABELS, SEVERITY_LABELS } from "@/modules/audits/presentation";
import type { Category } from "@/modules/audits/rules";
import { getAudit, listAudits } from "@/modules/audits/service";
import { SEVERITY_TONE } from "@/modules/audits/status";
import { seoCounts, seoFindings, seoHistoryPoints, splitAudits, summarizeSeo, type FindingsByAudit } from "@/modules/overview";
import { displayDate } from "@/modules/workspaces/presentation";
import { getWorkspace } from "@/modules/workspaces/service";
import { runAuditAction } from "../audits/actions";

export const metadata: Metadata = { title: "Visibilidad en Google" };

/** Blocking route so an unknown workspace returns a real 404 (same reason as the overview). */
export const instant = false;

/** History reads the findings of each audit: bounded to what the chart can show. */
const HISTORY_LIMIT = 12;

function Section({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {description ? <p className="max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export default async function SeoPage({ params }: PageProps<"/workspaces/[id]/seo">) {
  await connection();
  const { id } = await params;
  const db = getDb();
  const workspace = await getWorkspace(db, id);
  if (!workspace) notFound();

  const audits = await listAudits(db, workspace.id);
  const recent = audits.slice(0, HISTORY_LIMIT);
  const { result, previous } = splitAudits(audits);
  const toLoad = new Set([...recent.filter((a) => a.status === "completed").map((a) => a.id), ...[result, previous].flatMap((a) => (a ? [a.id] : []))]);
  const loaded = await Promise.all([...toLoad].map((auditId) => getAudit(db, workspace.id, auditId)));
  const findingsByAudit: FindingsByAudit = Object.fromEntries(loaded.filter((r) => r !== null).map((r) => [r.audit.id, r.findings]));

  const s = summarizeSeo(audits, findingsByAudit, new Date());
  const problems = result ? seoFindings(findingsByAudit[result.id] ?? []) : [];
  const points = seoHistoryPoints(recent, findingsByAudit);

  const notices: Notice[] = [];
  if (s.attempt) notices.push({ kind: s.attempt.status === "running" ? "running" : "failed", text: s.attempt.text });
  if (s.stale) notices.push({ kind: "stale", text: s.stale.text });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[
            { href: "/workspaces", label: "Empresas" },
            { href: `/workspaces/${workspace.id}`, label: workspace.name },
          ]}
          title="Visibilidad en Google"
          description="Si los clientes encuentran tu empresa cuando buscan tus servicios, y si Google puede leer y entender tu web."
          actions={<RunAuditButton workspaceId={workspace.id} action={runAuditAction.bind(null, workspace.id)} />}
        />
        <WorkspaceNav workspaceId={workspace.id} current="seo" />
      </div>

      <Section id="ranking-title" title="Posicionamiento en Google">
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed bg-card/60 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand ring-1 ring-brand/15">
              <Search className="size-4" />
            </span>
            <span className="text-sm font-medium">Google Search Console</span>
            <StatusPill tone="neutral">No disponible todavía</StatusPill>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Para saber cuántas personas te encuentran en Google necesitamos conectar Search Console, la herramienta gratuita de Google para
            propietarios de webs. Con ella podremos mostrarte los clics y las veces que apareces en los resultados, las búsquedas por las que te
            encuentran, tus páginas más visibles y su evolución. Esta conexión aún no está disponible en la plataforma: mientras tanto no
            mostramos ninguna cifra de tráfico.
          </p>
        </div>
      </Section>

      <Section
        id="health-title"
        title="Salud técnica de tu portada"
        description="Comprobamos si Google puede acceder, leer y entender tu portada, su robots.txt y su sitemap. Es salud técnica, no tu posición en Google, y no rastreamos el resto de la web."
      >
        {s.headline ? (
          <div className="flex flex-col gap-5 rounded-2xl border border-border/80 bg-card shadow-card p-5">
            <div className="flex items-start gap-3">
              <ToneIcon tone={s.tone} className="mt-0.5 size-5" />
              <div className="flex flex-col gap-0.5">
                <p className="text-base font-semibold">{s.headline.title}</p>
                <p className="text-sm text-muted-foreground">{s.headline.detail}</p>
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-3">
              {(
                [
                  ["critical", "Críticos", "Bloquean o dañan la visibilidad"],
                  ["warning", "Importantes", "Conviene corregirlos pronto"],
                  ["info", "Mejoras", "Opcionales"],
                ] as const
              ).map(([severity, label, hint]) => (
                <div key={severity} className="flex flex-col gap-0.5 rounded-lg bg-muted/50 p-3">
                  <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{s.counts[severity]}</dd>
                  <dd className="hidden text-xs text-muted-foreground sm:block">{hint}</dd>
                </div>
              ))}
            </dl>
            <ChangeLine change={s.change} note={s.comparisonNote} />
            <NoticeList notices={notices} />
            <p className="text-xs text-muted-foreground">Auditoría técnica de la portada · {s.auditedAt ? displayDate(s.auditedAt) : ""}</p>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed bg-card/60 p-6">
            <p className="font-medium">{s.state === "analyzing" ? "Analizando la web" : s.state === "error" ? "La auditoría no terminó" : "Todavía no hay auditorías"}</p>
            <p className="max-w-2xl text-sm text-muted-foreground">{s.reason}</p>
          </div>
        )}
      </Section>

      {s.headline ? (
        <>
          <Section id="areas-title" title="Estado por área" description="«No comprobado» significa que esta auditoría no pudo revisar esa parte; no es un aprobado.">
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {s.areas.map((area) => {
                const body = (
                  <>
                    <span className="text-sm font-medium">{area.label}</span>
                    <StatusPill tone={area.tone}>
                      {area.verdict}
                      {area.count > 0 ? ` · ${area.count}` : ""}
                    </StatusPill>
                  </>
                );
                const className = "flex h-full items-center justify-between gap-3 rounded-xl border border-border/80 bg-card px-4 py-3 shadow-card";
                return (
                  <li key={area.key}>
                    {area.firstFindingId ? (
                      <a
                        href={`#finding-${area.firstFindingId}`}
                        className={`${className} transition-colors hover:border-brand/30 hover:bg-muted focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:outline-none`}
                      >
                        {body}
                      </a>
                    ) : (
                      <div className={className}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section id="problems-title" title="Problemas y recomendaciones" description="Ordenados de más a menos urgente. Los problemas de velocidad están en Rendimiento.">
            {problems.length > 0 ? (
              <ol className="flex flex-col gap-3">
                {problems.map((f) => (
                  <li key={f.id} id={`finding-${f.id}`} className="flex scroll-mt-6 flex-col gap-2 rounded-2xl border border-border/80 bg-card shadow-card p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={SEVERITY_TONE[f.severity]}>{SEVERITY_LABELS[f.severity]}</StatusPill>
                      <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[f.category as Category] ?? f.category}</span>
                    </div>
                    <h3 className="text-base font-semibold tracking-tight">{f.title}</h3>
                    <p className="text-sm">
                      <span className="font-medium">Qué recomendamos: </span>
                      {f.recommendation}
                    </p>
                    {f.evidence.length > 0 ? (
                      <div className="rounded-lg bg-muted/60 p-3">
                        <p className="text-xs font-medium text-muted-foreground">Evidencia</p>
                        <ul className="mt-1 flex flex-col gap-0.5">
                          {f.evidence.map((line, i) => (
                            <li key={i} className="font-mono text-xs break-all">
                              {line}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                {s.state === "partial"
                  ? "No hay problemas en lo que pudimos comprobar, pero la portada no se pudo leer: el resultado es incompleto."
                  : "No hemos detectado problemas de SEO técnico en las comprobaciones realizadas."}
              </p>
            )}
          </Section>
        </>
      ) : null}

      <Section
        id="history-title"
        title="Histórico de auditorías"
        description="Problemas de SEO técnico en cada auditoría, sin contar los de velocidad. Compara auditorías concretas, no es una tendencia del negocio."
      >
        {points.length > 0 ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card shadow-card p-5">
            <ProblemsLegend />
            <ProblemsChart points={points} />
            <ChartDataTable points={points} kind="problems" />
          </div>
        ) : null}
        {recent.length > 0 ? (
          <ul className="flex flex-col divide-y rounded-2xl border border-border/80 bg-card shadow-card">
            {recent.map((audit) => {
              const findings = findingsByAudit[audit.id];
              const counts = findings ? seoCounts(findings) : null;
              const read = audit.facts?.page.kind === "fetched" && audit.facts.page.result.status < 400 && audit.facts.page.result.facts !== null;
              return (
                <li key={audit.id}>
                  <Link
                    href={`/workspaces/${workspace.id}/audits/${audit.id}`}
                    className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:outline-none"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                      <span className="font-medium">{displayDate(audit.startedAt)}</span>
                      <span className="text-xs text-muted-foreground">
                        {audit.status !== "completed"
                          ? AUDIT_STATUS_LABELS[audit.status]
                          : counts
                            ? `${plural(counts.critical, "crítico", "críticos")} · ${plural(counts.warning, "importante", "importantes")} · ${plural(counts.info, "mejora", "mejoras")}${read ? "" : " · portada no leída"}`
                            : "Completada"}
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-brand" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Todavía no hay auditorías.</p>
        )}
        {audits.length > HISTORY_LIMIT ? (
          <p className="text-xs text-muted-foreground">
            Se muestran las {HISTORY_LIMIT} auditorías más recientes de {audits.length}.
          </p>
        ) : null}
      </Section>
    </div>
  );
}
