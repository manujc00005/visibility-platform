import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { MetricTile, StatusPill, ToneIcon, toneClasses } from "@/components/audits/status-ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import {
  AUDIT_STATUS_LABELS,
  CATEGORY_LABELS,
  formatBytes,
  formatMs,
  OUTCOME_LABELS,
  FIELD_DATA_STATUS_MESSAGES,
  PERFORMANCE_STATUS_MESSAGES,
  SEVERITY_LABELS,
} from "@/modules/audits/presentation";
import type { Category } from "@/modules/audits/rules";
import { getAudit } from "@/modules/audits/service";
import {
  auditHeadline,
  categoryStatuses,
  METRIC_THRESHOLDS,
  rateMetric,
  RATING_LABELS,
  RATING_TONE,
  SEVERITY_TONE,
  type MetricName,
  type Tone,
} from "@/modules/audits/status";
import { GenerateReportButton } from "@/components/reports/generate-report-button";
import { cn } from "@/lib/utils";
import { listReports } from "@/modules/reports/service";
import { generateReportAction } from "./actions";
import { displayDate, displayDomain } from "@/modules/workspaces/presentation";
import { getWorkspace } from "@/modules/workspaces/service";

export const metadata: Metadata = { title: "Auditoría técnica" };

/** Blocking route so an unknown audit returns a real 404 (same reason as the workspace page). */
export const instant = false;

const cls = (value: number, digits = 2) => value.toLocaleString("es-ES", { maximumFractionDigits: digits });

/** How each metric is displayed, and its "good" reference. */
const METRIC_FORMAT: Record<MetricName, { format: (v: number) => string; good: string }> = {
  score: { format: (v) => `${v}/100`, good: "≥ 90" },
  lcp: { format: formatMs, good: `≤ ${formatMs(METRIC_THRESHOLDS.lcp[0])}` },
  inp: { format: formatMs, good: `≤ ${formatMs(METRIC_THRESHOLDS.inp[0])}` },
  cls: { format: (v) => cls(v, 3), good: `≤ ${cls(METRIC_THRESHOLDS.cls[0])}` },
  tbt: { format: formatMs, good: `≤ ${formatMs(METRIC_THRESHOLDS.tbt[0])}` },
  fcp: { format: formatMs, good: `≤ ${formatMs(METRIC_THRESHOLDS.fcp[0])}` },
  speedIndex: { format: formatMs, good: `≤ ${formatMs(METRIC_THRESHOLDS.speedIndex[0])}` },
  ttfb: { format: formatMs, good: `≤ ${formatMs(METRIC_THRESHOLDS.ttfb[0])}` },
};

function Metric({ label, metric, value }: { label: string; metric: MetricName; value: number | null }) {
  if (value === null) return <MetricTile label={label} value="—" tone="neutral" verdict="Sin dato" />;
  const rating = rateMetric(metric, value);
  return (
    <MetricTile
      label={label}
      value={METRIC_FORMAT[metric].format(value)}
      tone={RATING_TONE[rating]}
      verdict={RATING_LABELS[rating]}
      hint={`Bueno: ${METRIC_FORMAT[metric].good}`}
    />
  );
}

/** Everything below renders text only: values come from the audited site and are never HTML. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children ?? <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

function Facts({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(8rem,auto)_1fr]">{children}</dl>;
}

function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs break-all">{children}</span>;
}

/** Yes/no answer where one of the two is the good one. */
function YesNo({ value, goodWhen }: { value: boolean | null | undefined; goodWhen: boolean }) {
  if (value === null || value === undefined) return null;
  return <StatusPill tone={value === goodWhen ? "good" : "bad"}>{value ? "Sí" : "No"}</StatusPill>;
}

function httpTone(status: number): Tone {
  if (status < 300) return "good";
  return status < 400 ? "fair" : "bad";
}

function SectionTitle({ id, children, description }: { id: string; children: ReactNode; description?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 id={id} className="text-lg font-semibold">
        {children}
      </h2>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export default async function AuditPage({ params }: PageProps<"/workspaces/[id]/audits/[auditId]">) {
  await connection();
  const { id, auditId } = await params;
  const db = getDb();
  const workspace = await getWorkspace(db, id);
  if (!workspace) notFound();
  const result = await getAudit(db, workspace.id, auditId);
  if (!result) notFound();
  const { audit, findings } = result;
  const reportList = audit.status === "completed" ? await listReports(db, workspace.id, audit.id) : [];
  const reportBase = `/workspaces/${workspace.id}/audits/${audit.id}/reports`;
  const facts = audit.facts;
  const page = facts?.page.kind === "fetched" ? facts.page.result : null;
  // The content of an error page (404 parking page, 500…) is not the website's content.
  const pageFacts = page && page.status < 400 ? page.facts : null;
  const duration = audit.finishedAt ? audit.finishedAt.getTime() - audit.startedAt.getTime() : null;

  const counts = { critical: audit.criticalCount, warning: audit.warningCount, info: audit.infoCount };
  const headline = auditHeadline(counts);
  const areas = categoryStatuses(findings, facts);
  const perf = facts?.performance;
  const field = facts?.fieldData;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href={`/workspaces/${workspace.id}`} className="text-sm text-muted-foreground hover:underline">
          ← {workspace.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoría técnica de {displayDomain(workspace.domain)}</h1>
        <p className="text-sm text-muted-foreground">
          {displayDate(audit.startedAt)}
          {duration !== null ? ` · ${formatMs(duration)}` : ""} · reglas {audit.rulesVersion}
        </p>
      </div>

      {audit.status !== "completed" ? (
        <Card>
          <CardHeader>
            <CardTitle>{AUDIT_STATUS_LABELS[audit.status]}</CardTitle>
            <CardDescription>
              {audit.status === "running"
                ? "La auditoría sigue en curso. Recarga la página en unos segundos."
                : (audit.error ?? "La auditoría no terminó.")}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <section aria-labelledby="summary-title" className="flex flex-col gap-4">
            <h2 id="summary-title" className="sr-only">
              Resumen
            </h2>
            <div
              className={cn(
                "flex items-start gap-3 rounded-xl border border-l-4 p-4",
                toneClasses(headline.tone).soft,
                toneClasses(headline.tone).line,
              )}
            >
              <ToneIcon tone={headline.tone} className="mt-0.5 size-6" />
              <div className="flex flex-col gap-0.5">
                <p className={cn("text-base font-semibold", toneClasses(headline.tone).text)}>{headline.title}</p>
                <p className="text-sm text-foreground/80">{headline.detail}</p>
              </div>
            </div>

            <ul className="grid grid-cols-3 gap-2 sm:gap-3">
              {(
                [
                  ["critical", "Críticos", "Bloquean o dañan la visibilidad"],
                  ["warning", "Importantes", "Conviene corregirlos pronto"],
                  ["info", "Mejoras", "Opcionales, suman calidad"],
                ] as const
              ).map(([severity, label, hint]) => {
                const n = counts[severity];
                const tone: Tone = n > 0 ? SEVERITY_TONE[severity] : "good";
                return (
                  <li key={severity} className={cn("flex flex-col gap-2 rounded-lg border border-l-4 bg-card p-3 sm:flex-row sm:items-center sm:gap-3", toneClasses(tone).accent)}>
                    <ToneIcon tone={tone} className="size-5" />
                    <div className="flex flex-col">
                      <span className="text-2xl leading-none font-semibold tabular-nums">{n}</span>
                      <span className="text-sm font-medium">{label}</span>
                      <span className="hidden text-xs text-muted-foreground sm:block">{hint}</span>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Estado por área</h3>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {areas.map((area) => {
                  const body = (
                    <>
                      <span className="text-sm font-medium">{area.label}</span>
                      <StatusPill tone={area.tone}>
                        {area.verdict}
                        {area.count > 0 ? ` · ${area.count}` : ""}
                      </StatusPill>
                    </>
                  );
                  const className = cn(
                    "flex h-full flex-col gap-2 rounded-lg border border-l-4 bg-card p-3",
                    toneClasses(area.tone).accent,
                  );
                  return (
                    <li key={area.category}>
                      {area.firstFindingId ? (
                        <a
                          href={`#finding-${area.firstFindingId}`}
                          className={cn(className, "transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}
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
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Verde: bien</span>
                <span>Ámbar: regular</span>
                <span>Rojo: mal</span>
                <span>Azul: mejorable (opcional)</span>
                <span>Gris: no comprobado</span>
              </p>
            </div>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Informe para el cliente</CardTitle>
              <CardDescription>PDF con resumen ejecutivo, resultados, problemas, recomendaciones, evidencias y limitaciones.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <GenerateReportButton action={generateReportAction.bind(null, workspace.id, audit.id)} />
              {reportList.length > 0 ? (
                <ul className="flex flex-col divide-y text-sm">
                  {reportList.map((report) => (
                    <li key={report.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        {displayDate(report.createdAt)}
                        <span className="text-muted-foreground"> · {formatBytes(report.pdfBytes)} · plantilla {report.templateVersion}</span>
                      </span>
                      <span className="flex gap-3">
                        <a href={`${reportBase}/${report.id}`} target="_blank" rel="noopener noreferrer" className="underline">
                          Ver
                        </a>
                        <a href={`${reportBase}/${report.id}/pdf`} className="underline">
                          Descargar PDF
                        </a>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>

          <section aria-labelledby="findings-title" className="flex flex-col gap-3">
            <SectionTitle id="findings-title" description="Ordenados de más a menos urgente.">
              Problemas y recomendaciones
            </SectionTitle>
            {findings.length === 0 ? (
              <div className={cn("flex items-center gap-2 rounded-lg border p-4 text-sm", toneClasses("good").soft, toneClasses("good").line)}>
                <ToneIcon tone="good" className="size-5" />
                No hemos detectado problemas en las comprobaciones realizadas.
              </div>
            ) : (
              findings.map((finding) => {
                const tone = SEVERITY_TONE[finding.severity];
                return (
                  <Card
                    key={finding.id}
                    id={`finding-${finding.id}`}
                    size="sm"
                    className={cn("scroll-mt-6 border-l-4", toneClasses(tone).accent)}
                  >
                    <CardHeader>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={tone}>{SEVERITY_LABELS[finding.severity]}</StatusPill>
                        <span className="text-xs text-muted-foreground">
                          {CATEGORY_LABELS[finding.category as Category] ?? finding.category}
                        </span>
                      </div>
                      <CardTitle className="text-base">{finding.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 text-sm">
                      {finding.evidence.length > 0 ? (
                        <div className="rounded-md bg-muted/60 p-2.5">
                          <p className="text-xs font-medium text-muted-foreground">Evidencia</p>
                          <ul className="mt-1 flex flex-col gap-0.5">
                            {finding.evidence.map((line, index) => (
                              <li key={index}>
                                <Mono>{line}</Mono>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <p>
                        <span className="font-medium">Qué hacer: </span>
                        {finding.recommendation}
                      </p>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </section>

          <section aria-labelledby="speed-title" className="flex flex-col gap-3">
            <SectionTitle id="speed-title" description="Verde: bueno · ámbar: mejorable · rojo: malo, según los umbrales de Google.">
              Velocidad y experiencia en móvil
            </SectionTitle>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Prueba de laboratorio</CardTitle>
                  <CardDescription>
                    PageSpeed Insights en un móvil simulado
                    {perf?.status === "ok" && perf.lighthouseVersion ? ` (Lighthouse ${perf.lighthouseVersion})` : ""}. No son visitantes reales.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {perf?.status === "ok" && perf.metrics ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <Metric label="Puntuación" metric="score" value={perf.score} />
                      <Metric label="Contenido principal (LCP)" metric="lcp" value={perf.metrics.lcpMs} />
                      <Metric label="Estabilidad (CLS)" metric="cls" value={perf.metrics.cls} />
                      <Metric label="Bloqueo (TBT)" metric="tbt" value={perf.metrics.tbtMs} />
                      <Metric label="Primer contenido (FCP)" metric="fcp" value={perf.metrics.fcpMs} />
                      <Metric label="Speed Index" metric="speedIndex" value={perf.metrics.speedIndexMs} />
                    </div>
                  ) : (
                    <p className="flex items-start gap-2 text-sm text-muted-foreground">
                      <ToneIcon tone="neutral" className="mt-0.5 size-4" />
                      {perf ? PERFORMANCE_STATUS_MESSAGES[perf.status as Exclude<typeof perf.status, "ok">] : "—"}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>Experiencia real</CardTitle>
                  <CardDescription>
                    Chrome UX Report: visitantes con Chrome en el móvil, percentil 75 de 28 días
                    {field?.status === "ok"
                      ? `${field.collectionPeriod ? ` (${field.collectionPeriod.firstDate} a ${field.collectionPeriod.lastDate})` : ""}, ${field.scope === "url" ? "de esta página" : "de toda la web: la página no tiene datos propios"}`
                      : ""}
                    .
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {field?.status === "ok" && field.metrics ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <Metric label="Contenido principal (LCP)" metric="lcp" value={field.metrics.lcpMs} />
                      <Metric label="Respuesta (INP)" metric="inp" value={field.metrics.inpMs} />
                      <Metric label="Estabilidad (CLS)" metric="cls" value={field.metrics.cls} />
                      <Metric label="Primer contenido (FCP)" metric="fcp" value={field.metrics.fcpMs} />
                      <Metric label="Respuesta del servidor (TTFB)" metric="ttfb" value={field.metrics.ttfbMs} />
                    </div>
                  ) : (
                    <p className="flex items-start gap-2 text-sm text-muted-foreground">
                      <ToneIcon tone="neutral" className="mt-0.5 size-4" />
                      {field
                        ? FIELD_DATA_STATUS_MESSAGES[field.status as Exclude<typeof field.status, "ok">]
                        : "Esta auditoría es anterior a la consulta de datos reales."}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          <section aria-labelledby="technical-title" className="flex flex-col gap-3">
            <SectionTitle
              id="technical-title"
              description="Alcance: la portada, su robots.txt, un sitemap y la velocidad en móvil. No se rastrea el resto de la web."
            >
              Datos técnicos
            </SectionTitle>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Página principal</CardTitle>
              </CardHeader>
              <CardContent>
                <Facts>
                  <Row label="URL solicitada">
                    <Mono>{audit.requestedUrl}</Mono>
                  </Row>
                  <Row label="URL final">{page ? <Mono>{page.url}</Mono> : null}</Row>
                  <Row label="Estado HTTP">
                    {page ? (
                      <StatusPill tone={httpTone(page.status)}>{String(page.status)}</StatusPill>
                    ) : facts?.page.kind === "disallowed" ? (
                      <StatusPill tone="fair">No leída (robots.txt)</StatusPill>
                    ) : (
                      <StatusPill tone="bad">Sin respuesta</StatusPill>
                    )}
                  </Row>
                  <Row label="Tipo de contenido">{page?.contentType ? <Mono>{page.contentType}</Mono> : null}</Row>
                  <Row label="Redirecciones">
                    {page && page.redirects.length > 0 ? (
                      <ul>
                        {page.redirects.map((r, i) => (
                          <li key={i}>
                            <Mono>
                              {r.status} {r.url} → {r.location}
                            </Mono>
                          </li>
                        ))}
                      </ul>
                    ) : page ? (
                      "Ninguna"
                    ) : null}
                  </Row>
                  <Row label="X-Robots-Tag">{page?.xRobotsTag ? <Mono>{page.xRobotsTag}</Mono> : page ? "No" : null}</Row>
                </Facts>
              </CardContent>
            </Card>

            {pageFacts ? (
              <>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Metadatos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Facts>
                      <Row label={`Título (${pageFacts.titleLength})`}>{pageFacts.title}</Row>
                      <Row label={`Descripción (${pageFacts.metaDescriptionLength})`}>{pageFacts.metaDescription}</Row>
                      <Row label="Idioma">{pageFacts.lang}</Row>
                      <Row label="Viewport">{pageFacts.viewport ? <Mono>{pageFacts.viewport}</Mono> : null}</Row>
                      <Row label="Meta robots">{pageFacts.metaRobots.length ? <Mono>{pageFacts.metaRobots.join(" · ")}</Mono> : null}</Row>
                      <Row label="Canonical">
                        {pageFacts.canonicals.length ? (
                          <ul>
                            {pageFacts.canonicals.map((c, i) => (
                              <li key={i}>
                                <Mono>{c}</Mono>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </Row>
                    </Facts>
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Encabezados</CardTitle>
                    <CardDescription>
                      {Object.entries(pageFacts.headingCounts)
                        .map(([tag, n]) => `${tag.toUpperCase()}: ${n}`)
                        .join(" · ")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {pageFacts.headings.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sin encabezados.</p>
                    ) : (
                      <ul className="flex flex-col gap-0.5 text-sm">
                        {pageFacts.headings.map((h, i) => (
                          <li key={i} style={{ paddingLeft: `${(h.level - 1) * 1}rem` }}>
                            <span className="font-mono text-xs text-muted-foreground">H{h.level}</span> {h.text || "(vacío)"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Open Graph y datos estructurados</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Facts>
                      {Object.keys(pageFacts.openGraph).length === 0 ? (
                        <Row label="Open Graph">{null}</Row>
                      ) : (
                        Object.entries(pageFacts.openGraph).map(([key, value]) => (
                          <Row key={key} label={key}>
                            <Mono>{value}</Mono>
                          </Row>
                        ))
                      )}
                      <Row label="Bloques JSON-LD">
                        {`${pageFacts.structuredData.jsonLdBlocks} (${pageFacts.structuredData.invalidJsonLdBlocks} con errores)`}
                      </Row>
                      <Row label="Tipos">
                        {[...pageFacts.structuredData.types, ...pageFacts.structuredData.microdataTypes].join(", ") || null}
                      </Row>
                    </Facts>
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Enlaces de la portada</CardTitle>
                    <CardDescription>
                      {pageFacts.links.internalCount} internos únicos · {pageFacts.links.externalCount} externos ·{" "}
                      {pageFacts.links.nofollowCount} nofollow
                    </CardDescription>
                  </CardHeader>
                  {pageFacts.links.internal.length > 0 ? (
                    <CardContent>
                      <ul className="flex flex-col gap-0.5">
                        {pageFacts.links.internal.map((link) => (
                          <li key={link}>
                            <Mono>{link}</Mono>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  ) : null}
                </Card>
              </>
            ) : null}

            <Card size="sm">
              <CardHeader>
                <CardTitle>Rastreo</CardTitle>
              </CardHeader>
              <CardContent>
                <Facts>
                  <Row label="robots.txt">{facts?.robots ? <Mono>{`${facts.robots.url} · ${facts.robots.httpStatus ?? facts.robots.status}`}</Mono> : null}</Row>
                  <Row label="Google puede rastrear la portada">
                    <YesNo value={facts?.robots?.homepageAllowedForGoogle} goodWhen={true} />
                  </Row>
                  <Row label="Sitemaps declarados">
                    {facts?.robots?.sitemaps.length ? (
                      <ul>
                        {facts.robots.sitemaps.map((s, i) => (
                          <li key={i}>
                            <Mono>{s}</Mono>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </Row>
                  <Row label="Sitemap analizado">{facts?.sitemap?.url ? <Mono>{facts.sitemap.url}</Mono> : null}</Row>
                  <Row label="Resultado">
                    {facts?.sitemap ? (
                      facts.sitemap.status === "ok" && facts.sitemap.sitemap ? (
                        <StatusPill tone="good">
                          {`${facts.sitemap.sitemap.kind === "index" ? "Índice de sitemaps" : "Sitemap"} con ${facts.sitemap.sitemap.locCount} URLs`}
                        </StatusPill>
                      ) : (
                        <StatusPill tone="fair">
                          {`${facts.sitemap.status}${facts.sitemap.httpStatus ? ` (${facts.sitemap.httpStatus})` : ""}`}
                        </StatusPill>
                      )
                    ) : null}
                  </Row>
                  <Row label="Incluye la portada">
                    <YesNo value={facts?.sitemap?.homepageListed} goodWhen={true} />
                  </Row>
                </Facts>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Peticiones realizadas</CardTitle>
                <CardDescription>Cada acceso a la web durante la auditoría, con su resultado.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead>Resultado</TableHead>
                      <TableHead>HTTP</TableHead>
                      <TableHead>Tamaño</TableHead>
                      <TableHead>Tiempo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audit.fetchLog.map((entry, i) => (
                      <TableRow key={i}>
                        <TableCell className="max-w-xs whitespace-normal">
                          <Mono>{entry.url}</Mono>
                        </TableCell>
                        <TableCell className="max-w-xs whitespace-normal">
                          <StatusPill tone={entry.outcome === "ok" ? "good" : entry.outcome === "redirect" ? "neutral" : "bad"}>
                            {OUTCOME_LABELS[entry.outcome]}
                          </StatusPill>
                          {entry.error ? <span className="block text-xs text-muted-foreground break-words">{entry.error}</span> : null}
                        </TableCell>
                        <TableCell>{entry.status ?? "—"}</TableCell>
                        <TableCell>{formatBytes(entry.bytes)}</TableCell>
                        <TableCell>{formatMs(entry.ms)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
