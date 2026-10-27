import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { ChartDataTable, SpeedChart, SpeedLegend } from "@/components/audits/evolution-chart";
import { RunAuditButton } from "@/components/audits/run-audit-button";
import { StatusPill } from "@/components/audits/status-ui";
import { ChangeLine, NoticeList, type Notice } from "@/components/overview/overview-card";
import { PageHeader } from "@/components/overview/page-header";
import { WorkspaceNav } from "@/components/overview/workspace-nav";
import { getDb } from "@/db/client";
import { speedBreaks, toPoint } from "@/modules/audits/evolution";
import { formatMs, SEVERITY_LABELS } from "@/modules/audits/presentation";
import { getAudit, listAudits } from "@/modules/audits/service";
import { rateMetric, RATING_LABELS, RATING_TONE, SEVERITY_TONE, type MetricName } from "@/modules/audits/status";
import { fieldPeriod, splitAudits, summarizePerformance } from "@/modules/overview";
import { displayDate } from "@/modules/workspaces/presentation";
import { getWorkspace } from "@/modules/workspaces/service";
import { runAuditAction } from "../audits/actions";

export const metadata: Metadata = { title: "Rendimiento de tu web" };

/** Blocking route so an unknown workspace returns a real 404 (same reason as the overview). */
export const instant = false;

const decimal = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 2 });

/** Plain-words meaning of each metric and Google's "good" reference. */
const METRICS: Record<"lcp" | "cls" | "tbt" | "fcp" | "inp", { label: string; meaning: string; format: (v: number) => string; good: string }> = {
  lcp: {
    label: "Contenido principal (LCP)",
    meaning: "Tiempo hasta que se ve lo más importante de la página, como la foto o el titular principal.",
    format: formatMs,
    good: "2,5 s o menos",
  },
  fcp: { label: "Primer contenido (FCP)", meaning: "Tiempo hasta que aparece algo en pantalla.", format: formatMs, good: "1,8 s o menos" },
  tbt: {
    label: "Bloqueo mientras carga (TBT)",
    meaning: "Tiempo en que la página no responde porque el navegador está ocupado ejecutando código.",
    format: formatMs,
    good: "200 ms o menos",
  },
  cls: {
    label: "Estabilidad visual (CLS)",
    meaning: "Cuánto se mueven los elementos mientras carga. Si saltan, el visitante pulsa donde no quería.",
    format: decimal,
    good: "0,1 o menos",
  },
  inp: {
    label: "Respuesta al tocar o hacer clic (INP)",
    meaning: "Lo que tarda la página en reaccionar cuando el visitante interactúa con ella.",
    format: formatMs,
    good: "200 ms o menos",
  },
};

/** What each speed problem means for the visitor, beyond its technical title. */
const PROBLEM_MEANING: Record<string, string> = {
  lcp_slow: "Hasta que aparece el contenido principal, quien visita la página la ve incompleta.",
  cls_high: "Los elementos cambian de sitio mientras la página carga, y el visitante pulsa donde no quería.",
  tbt_high: "El navegador está ocupado ejecutando código y la página tarda en responder a toques y clics.",
  field_cwv_failed: "Los datos de visitantes reales muestran que la experiencia no llega al nivel que Google considera bueno.",
  performance_unavailable: "Esta vez no se pudo medir la velocidad, así que no sabemos si hay problemas.",
};

/** Real-user availability in owner words (the audit screen keeps the operator messages). */
const FIELD_UNAVAILABLE = {
  no_data: "Tu web aún no tiene suficientes visitas en Chrome para que Google publique datos reales. Es habitual en webs pequeñas.",
  not_configured: "Los datos de visitantes reales no están disponibles en esta medición.",
  quota_exceeded: "Los datos de visitantes reales no se pudieron consultar en esta medición.",
  error: "Los datos de visitantes reales no se pudieron consultar en esta medición.",
  skipped: "No se consultaron porque la portada no se pudo leer.",
} as const;

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

function Panel({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-border/80 bg-card shadow-card p-5">{children}</div>;
}

function MetricList({ rows }: { rows: { metric: keyof typeof METRICS; value: number | null }[] }) {
  return (
    <ul className="divide-y rounded-2xl border border-border/80 bg-card shadow-card">
      {rows.map(({ metric, value }) => {
        const m = METRICS[metric];
        const rating = value === null ? null : rateMetric(metric as MetricName, value);
        return (
          <li key={metric} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium">{m.label}</span>
              <span className="text-sm text-muted-foreground">{m.meaning}</span>
              <span className="text-xs text-muted-foreground">Bueno: {m.good}</span>
            </div>
            <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
              <span className="text-xl font-semibold tabular-nums">{value === null ? "—" : m.format(value)}</span>
              {rating ? <StatusPill tone={RATING_TONE[rating]}>{RATING_LABELS[rating]}</StatusPill> : <StatusPill tone="neutral">Sin dato</StatusPill>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default async function PerformancePage({ params }: PageProps<"/workspaces/[id]/performance">) {
  await connection();
  const { id } = await params;
  const db = getDb();
  const workspace = await getWorkspace(db, id);
  if (!workspace) notFound();

  const audits = await listAudits(db, workspace.id);
  const { result } = splitAudits(audits);
  const detail = result ? await getAudit(db, workspace.id, result.id) : null;
  const findings = detail?.findings ?? [];
  const s = summarizePerformance(audits, findings, new Date());
  const perf = result?.facts?.performance;
  const field = result?.facts?.fieldData;
  const problems = findings.filter((f) => f.category === "performance");
  const points = audits
    .filter((a) => a.status === "completed")
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
    .map(toPoint);
  // The chart shows the most recent 12; every notice is computed on exactly those points.
  const shown = points.slice(-12);
  const measuredPoints = shown.filter((p) => p.score !== null).length;
  const breaks = speedBreaks(shown);
  const breakReasons = [
    breaks.differentVersion ? "versiones distintas de la prueba de Google" : null,
    breaks.unknownVersion ? "mediciones cuya versión de la prueba no consta" : null,
    breaks.gap ? "auditorías que no midieron la velocidad" : null,
  ].filter((r) => r !== null);

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
          title="Rendimiento de tu web"
          description="Cómo de rápida y cómoda es tu página para los visitantes, según las mediciones de Google."
          actions={<RunAuditButton workspaceId={workspace.id} action={runAuditAction.bind(null, workspace.id)} />}
        />
        <WorkspaceNav workspaceId={workspace.id} current="performance" />
      </div>

      <Panel>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground">Móvil</span>
            {s.score !== null ? (
              <>
                <span className="text-4xl font-semibold tracking-tight tabular-nums">
                  {s.score}
                  <span className="text-lg font-normal text-muted-foreground">/100</span>
                </span>
                <StatusPill tone={s.tone}>{s.verdict}</StatusPill>
              </>
            ) : (
              <span className="text-2xl font-medium text-muted-foreground">
                {s.state === "analyzing" ? "Analizando…" : s.state === "error" ? "Sin resultado" : "No medida"}
              </span>
            )}
            {s.reason ? <p className="text-sm text-muted-foreground">{s.reason}</p> : null}
            <ChangeLine change={s.change} note={s.comparisonNote} />
            {s.measuredAt ? (
              <p className="text-xs text-muted-foreground">
                PageSpeed Insights · {displayDate(s.measuredAt)}
                {perf?.status === "ok" && perf.lighthouseVersion ? ` · Lighthouse ${perf.lighthouseVersion}` : ""}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:border-l sm:pl-6">
            <span className="text-sm font-medium text-muted-foreground">Escritorio</span>
            <span className="text-2xl font-medium text-muted-foreground">No disponible</span>
            <p className="text-sm text-muted-foreground">Nuestra medición usa solo el perfil móvil de PageSpeed Insights; no medimos el escritorio.</p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 border-t pt-4">
          <NoticeList notices={notices} />
          <p className="text-sm text-muted-foreground">
            La puntuación es una prueba de laboratorio: Google carga tu portada en un móvil simulado con conexión lenta. Sirve para detectar
            problemas, pero no es la experiencia de todos tus visitantes. Entre dos pruebas idénticas puede variar varios puntos; solo
            consideramos cambio una diferencia de 10 puntos o más.
          </p>
        </div>
      </Panel>

      {result === null ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed bg-card/60 p-6">
          <p className="font-medium">Todavía no hay mediciones de velocidad</p>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Ejecuta una auditoría: leemos tu portada y pedimos a Google que mida su velocidad en móvil. Tarda menos de un minuto.
          </p>
        </div>
      ) : (
        <>
          <Section id="lab-title" title="Prueba de laboratorio" description="Medida por PageSpeed Insights en un móvil simulado. No son visitantes reales.">
            {perf?.status === "ok" && perf.metrics ? (
              <MetricList
                rows={[
                  { metric: "lcp", value: perf.metrics.lcpMs },
                  { metric: "fcp", value: perf.metrics.fcpMs },
                  { metric: "tbt", value: perf.metrics.tbtMs },
                  { metric: "cls", value: perf.metrics.cls },
                ]}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{s.reason ?? "No se midió en la última auditoría."}</p>
            )}
          </Section>

          <Section
            id="field-title"
            title="Visitantes reales"
            description="Chrome UX Report: visitas reales con Chrome en el móvil durante 28 días, valor que cumple el 75 % de las visitas."
          >
            {field?.status === "ok" && field.metrics ? (
              <>
                <MetricList
                  rows={[
                    { metric: "lcp", value: field.metrics.lcpMs },
                    // INP only exists as real-user data: it is shown only with valid field data.
                    ...(field.metrics.inpMs !== null ? [{ metric: "inp" as const, value: field.metrics.inpMs }] : []),
                    { metric: "cls", value: field.metrics.cls },
                  ]}
                />
                <p className="text-xs text-muted-foreground">
                  {field.scope === "url" ? "Datos de esta página" : field.scope === "origin" ? "Datos de todo el sitio: la portada no tiene datos propios" : "Alcance no indicado"}
                  {` · ${fieldPeriod(field.collectionPeriod) ?? "periodo no indicado"}`}.
                </p>
              </>
            ) : (
              <Panel>
                <p className="text-sm text-muted-foreground">
                  {field && field.status !== "ok" ? FIELD_UNAVAILABLE[field.status] : "Esta medición no incluye datos de visitantes reales."} Sin
                  estos datos solo conocemos la prueba de laboratorio.
                </p>
              </Panel>
            )}
          </Section>

          <Section id="problems-title" title="Problemas de velocidad" description="Ordenados de más a menos importante, con lo que recomendamos hacer.">
            {problems.length > 0 ? (
              <ol className="flex flex-col gap-3">
                {problems.map((f) => (
                  <li key={f.id} className="flex flex-col gap-2 rounded-2xl border border-border/80 bg-card shadow-card p-5">
                    <StatusPill tone={SEVERITY_TONE[f.severity]}>{SEVERITY_LABELS[f.severity]}</StatusPill>
                    <h3 className="text-base font-semibold tracking-tight">{f.title}</h3>
                    {PROBLEM_MEANING[f.ruleId] ? <p className="text-sm text-muted-foreground">{PROBLEM_MEANING[f.ruleId]}</p> : null}
                    <p className="text-sm">
                      <span className="font-medium">Qué recomendamos: </span>
                      {f.recommendation}
                    </p>
                    {f.evidence.length > 0 ? (
                      <ul className="flex flex-col gap-0.5 rounded-lg bg-muted/60 p-3 text-xs">
                        {f.evidence.map((line) => (
                          <li key={line} className="break-words">
                            {line}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                {s.score !== null ? "No hemos detectado problemas de velocidad en la última medición." : "Sin medición no podemos detectar problemas de velocidad."}
              </p>
            )}
          </Section>

          <Section
            id="history-title"
            title="Histórico de mediciones"
            description="Puntuación móvil en cada auditoría. Compara mediciones concretas, no es una tendencia del negocio."
          >
            {measuredPoints > 0 ? (
              <Panel>
                <div className="flex flex-col gap-3">
                  <SpeedLegend />
                  <SpeedChart points={shown} />
                  <ChartDataTable points={shown} kind="speed" />
                  {points.length > 12 ? <p className="text-xs text-muted-foreground">Se muestran las 12 auditorías más recientes de {points.length}.</p> : null}
                  {breakReasons.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      La línea solo une mediciones comparables. Se interrumpe por {breakReasons.join(" y ")}.
                    </p>
                  ) : null}
                </div>
              </Panel>
            ) : (
              <p className="text-sm text-muted-foreground">Ninguna auditoría ha medido todavía la velocidad.</p>
            )}
          </Section>

          <Link
            href={`/workspaces/${workspace.id}/audits/${result.id}`}
            className="inline-flex w-fit items-center gap-1 rounded-sm text-sm font-medium text-brand hover:underline focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:outline-none"
          >
            Ver la auditoría técnica completa del {displayDate(result.startedAt)}
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </>
      )}
    </div>
  );
}
