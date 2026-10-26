import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
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
  FIELD_RATING_LABELS,
  PERFORMANCE_STATUS_MESSAGES,
  SEVERITY_LABELS,
} from "@/modules/audits/presentation";
import { rateFieldMetric, type FieldMetricName } from "@/modules/audits/crux";
import type { Category, Severity } from "@/modules/audits/rules";
import { getAudit } from "@/modules/audits/service";
import { GenerateReportButton } from "@/components/reports/generate-report-button";
import { listReports } from "@/modules/reports/service";
import { generateReportAction } from "./actions";
import { displayDate, displayDomain } from "@/modules/workspaces/presentation";
import { getWorkspace } from "@/modules/workspaces/service";

export const metadata: Metadata = { title: "Auditoría técnica" };

/** Blocking route so an unknown audit returns a real 404 (same reason as the workspace page). */
export const instant = false;

const SEVERITY_BADGE: Record<Severity, "destructive" | "outline" | "secondary"> = {
  critical: "destructive",
  warning: "outline",
  info: "secondary",
};

function fieldValue(metric: FieldMetricName, value: number | null, text: string | null): string | null {
  if (value === null || text === null) return null;
  return `${text} · ${FIELD_RATING_LABELS[rateFieldMetric(metric, value)]}`;
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

  return (
    <div className="flex flex-col gap-6">
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
          <div className="flex flex-wrap gap-2">
            <Badge variant={audit.criticalCount > 0 ? "destructive" : "outline"}>{audit.criticalCount} críticos</Badge>
            <Badge variant="outline">{audit.warningCount} importantes</Badge>
            <Badge variant="secondary">{audit.infoCount} mejoras</Badge>
          </div>

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
            <h2 id="findings-title" className="text-lg font-semibold">
              Problemas y recomendaciones
            </h2>
            {findings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hemos detectado problemas en las comprobaciones realizadas.</p>
            ) : (
              findings.map((finding) => (
                <Card key={finding.id} size="sm">
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      <Badge variant={SEVERITY_BADGE[finding.severity]}>{SEVERITY_LABELS[finding.severity]}</Badge>
                      <span className="text-xs font-normal text-muted-foreground">
                        {CATEGORY_LABELS[finding.category as Category] ?? finding.category}
                      </span>
                      <span>{finding.title}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2 text-sm">
                    {finding.evidence.length > 0 ? (
                      <div>
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
              ))
            )}
          </section>

          <section aria-labelledby="technical-title" className="flex flex-col gap-3">
            <h2 id="technical-title" className="text-lg font-semibold">
              Datos técnicos
            </h2>
            <p className="text-sm text-muted-foreground">
              Alcance: la portada, su robots.txt, un sitemap y la velocidad en móvil. No se rastrea el resto de la web.
            </p>

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
                  <Row label="Estado HTTP">{page ? String(page.status) : facts?.page.kind === "disallowed" ? "No leída (robots.txt)" : "Sin respuesta"}</Row>
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
                    {facts?.robots?.homepageAllowedForGoogle === null || !facts?.robots ? null : facts.robots.homepageAllowedForGoogle ? "Sí" : "No"}
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
                    {facts?.sitemap
                      ? facts.sitemap.status === "ok" && facts.sitemap.sitemap
                        ? `${facts.sitemap.sitemap.kind === "index" ? "Índice de sitemaps" : "Sitemap"} con ${facts.sitemap.sitemap.locCount} URLs`
                        : `${facts.sitemap.status}${facts.sitemap.httpStatus ? ` (${facts.sitemap.httpStatus})` : ""}`
                      : null}
                  </Row>
                  <Row label="Incluye la portada">
                    {facts?.sitemap?.homepageListed === null || !facts?.sitemap ? null : facts.sitemap.homepageListed ? "Sí" : "No"}
                  </Row>
                </Facts>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Rendimiento en móvil (laboratorio)</CardTitle>
                <CardDescription>Medición de PageSpeed Insights en un entorno simulado; no son datos de visitantes reales.</CardDescription>
              </CardHeader>
              <CardContent>
                {facts?.performance.status === "ok" && facts.performance.metrics ? (
                  <Facts>
                    <Row label="Puntuación Lighthouse">{facts.performance.score !== null ? `${facts.performance.score}/100` : null}</Row>
                    <Row label="LCP">{formatMs(facts.performance.metrics.lcpMs)}</Row>
                    <Row label="CLS">{facts.performance.metrics.cls?.toLocaleString("es-ES", { maximumFractionDigits: 3 }) ?? null}</Row>
                    <Row label="Tiempo de bloqueo">{formatMs(facts.performance.metrics.tbtMs)}</Row>
                    <Row label="FCP">{formatMs(facts.performance.metrics.fcpMs)}</Row>
                    <Row label="Speed Index">{formatMs(facts.performance.metrics.speedIndexMs)}</Row>
                    <Row label="Versión Lighthouse">{facts.performance.lighthouseVersion}</Row>
                  </Facts>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {facts ? PERFORMANCE_STATUS_MESSAGES[facts.performance.status as Exclude<typeof facts.performance.status, "ok">] : "—"}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Experiencia real en móvil</CardTitle>
                <CardDescription>
                  Chrome UX Report: visitantes reales con Chrome en el móvil, percentil 75 de los últimos 28 días.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {facts?.fieldData?.status === "ok" && facts.fieldData.metrics ? (
                  <Facts>
                    <Row label="Datos de">{facts.fieldData.scope === "url" ? "Esta página" : "Toda la web (la página no tiene datos propios)"}</Row>
                    <Row label="Periodo">
                      {facts.fieldData.collectionPeriod
                        ? `${facts.fieldData.collectionPeriod.firstDate} a ${facts.fieldData.collectionPeriod.lastDate}`
                        : null}
                    </Row>
                    <Row label="LCP">{fieldValue("lcp", facts.fieldData.metrics.lcpMs, formatMs(facts.fieldData.metrics.lcpMs))}</Row>
                    <Row label="INP">{fieldValue("inp", facts.fieldData.metrics.inpMs, formatMs(facts.fieldData.metrics.inpMs))}</Row>
                    <Row label="CLS">
                      {fieldValue(
                        "cls",
                        facts.fieldData.metrics.cls,
                        facts.fieldData.metrics.cls?.toLocaleString("es-ES", { maximumFractionDigits: 2 }) ?? null,
                      )}
                    </Row>
                    <Row label="FCP">{formatMs(facts.fieldData.metrics.fcpMs)}</Row>
                    <Row label="TTFB">{formatMs(facts.fieldData.metrics.ttfbMs)}</Row>
                  </Facts>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {facts?.fieldData
                      ? FIELD_DATA_STATUS_MESSAGES[facts.fieldData.status as Exclude<typeof facts.fieldData.status, "ok">]
                      : "Esta auditoría es anterior a la consulta de datos reales."}
                  </p>
                )}
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
                          {OUTCOME_LABELS[entry.outcome]}
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
