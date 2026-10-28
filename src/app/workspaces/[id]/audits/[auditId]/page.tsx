import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { MetricTile, StatusPill, ToneIcon, toneClasses } from "@/components/audits/status-ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { findingText } from "@/i18n/findings";
import { formatBytes, formatMs, formatNumber } from "@/i18n/format";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { auditLabels } from "@/modules/audits/presentation";
import type { Category } from "@/modules/audits/rules";
import { getAudit } from "@/modules/audits/service";
import {
  auditHeadline,
  categoryStatuses,
  METRIC_THRESHOLDS,
  rateMetric,
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

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).audits.page.metaTitle };
}

/** Blocking route so an unknown audit returns a real 404 (same reason as the workspace page). */
export const instant = false;

/** How each metric is displayed, and its "good" reference, in the interface language. */
function metricFormat(locale: Locale): Record<MetricName, { format: (v: number) => string; good: string }> {
  const ms = (v: number) => formatMs(v, locale);
  const cls = (v: number, digits = 2) => formatNumber(v, locale, { maximumFractionDigits: digits });
  return {
    score: { format: (v) => `${v}/100`, good: "≥ 90" },
    lcp: { format: ms, good: `≤ ${ms(METRIC_THRESHOLDS.lcp[0])}` },
    inp: { format: ms, good: `≤ ${ms(METRIC_THRESHOLDS.inp[0])}` },
    cls: { format: (v) => cls(v, 3), good: `≤ ${cls(METRIC_THRESHOLDS.cls[0])}` },
    tbt: { format: ms, good: `≤ ${ms(METRIC_THRESHOLDS.tbt[0])}` },
    fcp: { format: ms, good: `≤ ${ms(METRIC_THRESHOLDS.fcp[0])}` },
    speedIndex: { format: ms, good: `≤ ${ms(METRIC_THRESHOLDS.speedIndex[0])}` },
    ttfb: { format: ms, good: `≤ ${ms(METRIC_THRESHOLDS.ttfb[0])}` },
  };
}

function Metric({ label, metric, value, locale }: { label: string; metric: MetricName; value: number | null; locale: Locale }) {
  const speed = getMessages(locale).audits.page.speed;
  if (value === null) return <MetricTile label={label} value="—" tone="neutral" verdict={speed.noValue} />;
  const rating = rateMetric(metric, value);
  const format = metricFormat(locale)[metric];
  return <MetricTile label={label} value={format.format(value)} tone={RATING_TONE[rating]} verdict={auditLabels(locale).rating[rating]} hint={speed.good(format.good)} />;
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
function YesNo({ value, goodWhen, yes, no }: { value: boolean | null | undefined; goodWhen: boolean; yes: string; no: string }) {
  if (value === null || value === undefined) return null;
  return <StatusPill tone={value === goodWhen ? "good" : "bad"}>{value ? yes : no}</StatusPill>;
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
  const locale = await getLocale();
  const db = getDb();
  const workspace = await getWorkspace(db, id);
  if (!workspace) notFound();
  const result = await getAudit(db, workspace.id, auditId);
  if (!result) notFound();
  const { audit, findings } = result;
  const t = getMessages(locale).audits.page;
  const L = auditLabels(locale);
  const reportList = audit.status === "completed" ? await listReports(db, workspace.id, audit.id) : [];
  const reportBase = `/workspaces/${workspace.id}/audits/${audit.id}/reports`;
  const facts = audit.facts;
  const page = facts?.page.kind === "fetched" ? facts.page.result : null;
  // The content of an error page (404 parking page, 500…) is not the website's content.
  const pageFacts = page && page.status < 400 ? page.facts : null;
  const duration = audit.finishedAt ? audit.finishedAt.getTime() - audit.startedAt.getTime() : null;

  const counts = { critical: audit.criticalCount, warning: audit.warningCount, info: audit.infoCount };
  const headline = auditHeadline(counts, locale);
  const areas = categoryStatuses(findings, facts, locale);
  const perf = facts?.performance;
  const field = facts?.fieldData;
  // Titles and recommendations of the stored findings in the interface language (SPEC «Contrato de hallazgos»).
  const context = { facts, rulesVersion: audit.rulesVersion };
  const texts = findings.map((finding) => findingText(finding, locale, context));
  const anyFallback = texts.some((text) => text.fallback);
  const anyEvidence = findings.some((finding) => finding.evidence.length > 0);
  // One notice per view when the language is not the one the audit was stored in.
  const originalNotice =
    locale !== DEFAULT_LOCALE && (anyEvidence || anyFallback)
      ? [anyEvidence ? t.findings.originalNotice : null, anyFallback ? t.findings.fallbackNotice : null].filter(Boolean).join(" ")
      : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href={`/workspaces/${workspace.id}`} className="text-sm text-muted-foreground hover:underline">
          ← {workspace.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title(displayDomain(workspace.domain))}</h1>
        <p className="text-sm text-muted-foreground">
          {displayDate(audit.startedAt, locale)}
          {duration !== null ? ` · ${formatMs(duration, locale)}` : ""} · {t.rules(audit.rulesVersion)}
        </p>
      </div>

      {audit.status !== "completed" ? (
        <Card>
          <CardHeader>
            <CardTitle>{L.status[audit.status]}</CardTitle>
            <CardDescription>{audit.status === "running" ? t.stillRunning : (audit.error ?? t.notFinished)}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <section aria-labelledby="summary-title" className="flex flex-col gap-4">
            <h2 id="summary-title" className="sr-only">
              {t.summary}
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
              {(["critical", "warning", "info"] as const).map((severity) => {
                const n = counts[severity];
                const tone: Tone = n > 0 ? SEVERITY_TONE[severity] : "good";
                return (
                  <li key={severity} className={cn("flex flex-col gap-2 rounded-lg border border-l-4 bg-card p-3 sm:flex-row sm:items-center sm:gap-3", toneClasses(tone).accent)}>
                    <ToneIcon tone={tone} className="size-5" />
                    <div className="flex flex-col">
                      <span className="text-2xl leading-none font-semibold tabular-nums">{n}</span>
                      <span className="text-sm font-medium">{t.counts[severity].label}</span>
                      <span className="hidden text-xs text-muted-foreground sm:block">{t.counts[severity].hint}</span>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t.areas}</h3>
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
                <span>{t.legend.good}</span>
                <span>{t.legend.fair}</span>
                <span>{t.legend.bad}</span>
                <span>{t.legend.info}</span>
                <span>{t.legend.neutral}</span>
              </p>
            </div>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>{t.report.title}</CardTitle>
              <CardDescription>{t.report.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <GenerateReportButton action={generateReportAction.bind(null, workspace.id, audit.id)} labels={getMessages(locale).audits.reportButton} />
              {reportList.length > 0 ? (
                <ul className="flex flex-col divide-y text-sm">
                  {reportList.map((report) => (
                    <li key={report.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        {displayDate(report.createdAt, locale)}
                        <span className="text-muted-foreground">
                          {" "}
                          · {formatBytes(report.pdfBytes, locale)} · {t.report.template(report.templateVersion)}
                        </span>
                      </span>
                      <span className="flex gap-3">
                        <a href={`${reportBase}/${report.id}`} target="_blank" rel="noopener noreferrer" className="underline">
                          {t.report.view}
                        </a>
                        <a href={`${reportBase}/${report.id}/pdf`} className="underline">
                          {t.report.download}
                        </a>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>

          <section aria-labelledby="findings-title" className="flex flex-col gap-3">
            <SectionTitle id="findings-title" description={t.findings.description}>
              {t.findings.title}
            </SectionTitle>
            {originalNotice ? (
              <p role="note" className="rounded-md border border-border/80 bg-muted/60 p-2.5 text-xs text-muted-foreground">
                {originalNotice}
              </p>
            ) : null}
            {findings.length === 0 ? (
              <div className={cn("flex items-center gap-2 rounded-lg border p-4 text-sm", toneClasses("good").soft, toneClasses("good").line)}>
                <ToneIcon tone="good" className="size-5" />
                {t.findings.none}
              </div>
            ) : (
              findings.map((finding, index) => {
                const tone = SEVERITY_TONE[finding.severity];
                const text = texts[index]!;
                return (
                  <Card
                    key={finding.id}
                    id={`finding-${finding.id}`}
                    size="sm"
                    className={cn("scroll-mt-6 border-l-4", toneClasses(tone).accent)}
                  >
                    <CardHeader>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={tone}>{L.severity[finding.severity]}</StatusPill>
                        <span className="text-xs text-muted-foreground">{L.category[finding.category as Category] ?? finding.category}</span>
                      </div>
                      <CardTitle className="text-base" lang={text.fallback ? DEFAULT_LOCALE : undefined}>
                        {text.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 text-sm">
                      {finding.evidence.length > 0 ? (
                        <div className="rounded-md bg-muted/60 p-2.5">
                          <p className="text-xs font-medium text-muted-foreground">{t.findings.evidence}</p>
                          {/* Evidence is stored as observed, in Spanish; it is never translated (SPEC «Límites»). */}
                          <ul className="mt-1 flex flex-col gap-0.5" lang={DEFAULT_LOCALE}>
                            {finding.evidence.map((line, i) => (
                              <li key={i}>
                                <Mono>{line}</Mono>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <p lang={text.fallback ? DEFAULT_LOCALE : undefined}>
                        <span className="font-medium">{t.findings.whatToDo} </span>
                        {text.recommendation}
                      </p>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </section>

          <section aria-labelledby="speed-title" className="flex flex-col gap-3">
            <SectionTitle id="speed-title" description={t.speed.description}>
              {t.speed.title}
            </SectionTitle>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Card size="sm">
                <CardHeader>
                  <CardTitle>{t.speed.lab}</CardTitle>
                  <CardDescription>{t.speed.labDescription(perf?.status === "ok" ? perf.lighthouseVersion : null)}</CardDescription>
                </CardHeader>
                <CardContent>
                  {perf?.status === "ok" && perf.metrics ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <Metric label={t.speed.metrics.score} metric="score" value={perf.score} locale={locale} />
                      <Metric label={t.speed.metrics.lcp} metric="lcp" value={perf.metrics.lcpMs} locale={locale} />
                      <Metric label={t.speed.metrics.cls} metric="cls" value={perf.metrics.cls} locale={locale} />
                      <Metric label={t.speed.metrics.tbt} metric="tbt" value={perf.metrics.tbtMs} locale={locale} />
                      <Metric label={t.speed.metrics.fcp} metric="fcp" value={perf.metrics.fcpMs} locale={locale} />
                      <Metric label={t.speed.metrics.speedIndex} metric="speedIndex" value={perf.metrics.speedIndexMs} locale={locale} />
                    </div>
                  ) : (
                    <p className="flex items-start gap-2 text-sm text-muted-foreground">
                      <ToneIcon tone="neutral" className="mt-0.5 size-4" />
                      {perf ? L.performanceStatus[perf.status as Exclude<typeof perf.status, "ok">] : "—"}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>{t.speed.field}</CardTitle>
                  <CardDescription>
                    {t.speed.fieldDescription(
                      field?.status === "ok"
                        ? {
                            period: field.collectionPeriod ? { first: field.collectionPeriod.firstDate, last: field.collectionPeriod.lastDate } : null,
                            scope: field.scope,
                          }
                        : null,
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {field?.status === "ok" && field.metrics ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <Metric label={t.speed.metrics.lcp} metric="lcp" value={field.metrics.lcpMs} locale={locale} />
                      <Metric label={t.speed.metrics.inp} metric="inp" value={field.metrics.inpMs} locale={locale} />
                      <Metric label={t.speed.metrics.cls} metric="cls" value={field.metrics.cls} locale={locale} />
                      <Metric label={t.speed.metrics.fcp} metric="fcp" value={field.metrics.fcpMs} locale={locale} />
                      <Metric label={t.speed.metrics.ttfb} metric="ttfb" value={field.metrics.ttfbMs} locale={locale} />
                    </div>
                  ) : (
                    <p className="flex items-start gap-2 text-sm text-muted-foreground">
                      <ToneIcon tone="neutral" className="mt-0.5 size-4" />
                      {field ? L.fieldDataStatus[field.status as Exclude<typeof field.status, "ok">] : t.speed.fieldLegacy}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          <section aria-labelledby="technical-title" className="flex flex-col gap-3">
            <SectionTitle id="technical-title" description={t.technical.description}>
              {t.technical.title}
            </SectionTitle>

            <Card size="sm">
              <CardHeader>
                <CardTitle>{t.technical.homePage.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <Facts>
                  <Row label={t.technical.homePage.requestedUrl}>
                    <Mono>{audit.requestedUrl}</Mono>
                  </Row>
                  <Row label={t.technical.homePage.finalUrl}>{page ? <Mono>{page.url}</Mono> : null}</Row>
                  <Row label={t.technical.homePage.httpStatus}>
                    {page ? (
                      <StatusPill tone={httpTone(page.status)}>{String(page.status)}</StatusPill>
                    ) : facts?.page.kind === "disallowed" ? (
                      <StatusPill tone="fair">{t.technical.homePage.notRead}</StatusPill>
                    ) : (
                      <StatusPill tone="bad">{t.technical.homePage.noResponse}</StatusPill>
                    )}
                  </Row>
                  <Row label={t.technical.homePage.contentType}>{page?.contentType ? <Mono>{page.contentType}</Mono> : null}</Row>
                  <Row label={t.technical.homePage.redirects}>
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
                      t.technical.homePage.none
                    ) : null}
                  </Row>
                  <Row label={t.technical.homePage.xRobotsTag}>{page?.xRobotsTag ? <Mono>{page.xRobotsTag}</Mono> : page ? t.no : null}</Row>
                </Facts>
              </CardContent>
            </Card>

            {pageFacts ? (
              <>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>{t.technical.metadata.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Facts>
                      <Row label={t.technical.metadata.titleWithLength(pageFacts.titleLength)}>{pageFacts.title}</Row>
                      <Row label={t.technical.metadata.descriptionWithLength(pageFacts.metaDescriptionLength)}>{pageFacts.metaDescription}</Row>
                      <Row label={t.technical.metadata.lang}>{pageFacts.lang}</Row>
                      <Row label={t.technical.metadata.viewport}>{pageFacts.viewport ? <Mono>{pageFacts.viewport}</Mono> : null}</Row>
                      <Row label={t.technical.metadata.metaRobots}>{pageFacts.metaRobots.length ? <Mono>{pageFacts.metaRobots.join(" · ")}</Mono> : null}</Row>
                      <Row label={t.technical.metadata.canonical}>
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
                    <CardTitle>{t.technical.headings.title}</CardTitle>
                    <CardDescription>
                      {Object.entries(pageFacts.headingCounts)
                        .map(([tag, n]) => `${tag.toUpperCase()}: ${n}`)
                        .join(" · ")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {pageFacts.headings.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t.technical.headings.none}</p>
                    ) : (
                      <ul className="flex flex-col gap-0.5 text-sm">
                        {pageFacts.headings.map((h, i) => (
                          <li key={i} style={{ paddingLeft: `${(h.level - 1) * 1}rem` }}>
                            <span className="font-mono text-xs text-muted-foreground">H{h.level}</span> {h.text || t.technical.headings.empty}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle>{t.technical.structured.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Facts>
                      {Object.keys(pageFacts.openGraph).length === 0 ? (
                        <Row label={t.technical.structured.openGraph}>{null}</Row>
                      ) : (
                        Object.entries(pageFacts.openGraph).map(([key, value]) => (
                          <Row key={key} label={key}>
                            <Mono>{value}</Mono>
                          </Row>
                        ))
                      )}
                      <Row label={t.technical.structured.jsonLd}>
                        {t.technical.structured.jsonLdCount(pageFacts.structuredData.jsonLdBlocks, pageFacts.structuredData.invalidJsonLdBlocks)}
                      </Row>
                      <Row label={t.technical.structured.types}>
                        {[...pageFacts.structuredData.types, ...pageFacts.structuredData.microdataTypes].join(", ") || null}
                      </Row>
                    </Facts>
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle>{t.technical.links.title}</CardTitle>
                    <CardDescription>
                      {t.technical.links.summary(pageFacts.links.internalCount, pageFacts.links.externalCount, pageFacts.links.nofollowCount)}
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
                <CardTitle>{t.technical.crawling.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <Facts>
                  <Row label={t.technical.crawling.robots}>
                    {facts?.robots ? <Mono>{`${facts.robots.url} · ${facts.robots.httpStatus ?? facts.robots.status}`}</Mono> : null}
                  </Row>
                  <Row label={t.technical.crawling.googleCanCrawl}>
                    <YesNo value={facts?.robots?.homepageAllowedForGoogle} goodWhen={true} yes={t.yes} no={t.no} />
                  </Row>
                  <Row label={t.technical.crawling.sitemapsDeclared}>
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
                  <Row label={t.technical.crawling.sitemapAnalyzed}>{facts?.sitemap?.url ? <Mono>{facts.sitemap.url}</Mono> : null}</Row>
                  <Row label={t.technical.crawling.result}>
                    {facts?.sitemap ? (
                      facts.sitemap.status === "ok" && facts.sitemap.sitemap ? (
                        <StatusPill tone="good">{t.technical.crawling.sitemapWithUrls(facts.sitemap.sitemap.kind, facts.sitemap.sitemap.locCount)}</StatusPill>
                      ) : (
                        <StatusPill tone="fair">
                          {`${facts.sitemap.status}${facts.sitemap.httpStatus ? ` (${facts.sitemap.httpStatus})` : ""}`}
                        </StatusPill>
                      )
                    ) : null}
                  </Row>
                  <Row label={t.technical.crawling.includesHome}>
                    <YesNo value={facts?.sitemap?.homepageListed} goodWhen={true} yes={t.yes} no={t.no} />
                  </Row>
                </Facts>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>{t.technical.requests.title}</CardTitle>
                <CardDescription>{t.technical.requests.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.technical.requests.url}</TableHead>
                      <TableHead>{t.technical.requests.result}</TableHead>
                      <TableHead>{t.technical.requests.http}</TableHead>
                      <TableHead>{t.technical.requests.size}</TableHead>
                      <TableHead>{t.technical.requests.time}</TableHead>
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
                            {L.outcome[entry.outcome]}
                          </StatusPill>
                          {entry.error ? <span className="block text-xs text-muted-foreground break-words">{entry.error}</span> : null}
                        </TableCell>
                        <TableCell>{entry.status ?? "—"}</TableCell>
                        <TableCell>{formatBytes(entry.bytes, locale)}</TableCell>
                        <TableCell>{formatMs(entry.ms, locale)}</TableCell>
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
