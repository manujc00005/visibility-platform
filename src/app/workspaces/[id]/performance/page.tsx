import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { ChartDataTable, SpeedChart, SpeedLegend } from "@/components/audits/evolution-chart";
import { LighthouseCategoryCard } from "@/components/audits/lighthouse-category";
import { RunAuditButton } from "@/components/audits/run-audit-button";
import { StatusPill } from "@/components/audits/status-ui";
import { ChangeLine, NoticeList, type Notice } from "@/components/overview/overview-card";
import { PageHeader } from "@/components/overview/page-header";
import { WorkspaceNav } from "@/components/overview/workspace-nav";
import { getDb } from "@/db/client";
import { findingText } from "@/i18n/findings";
import { formatMs, formatNumber } from "@/i18n/format";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages, type Messages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { speedBreaks, toPoint } from "@/modules/audits/evolution";
import { lighthouseView } from "@/modules/audits/lighthouse";
import { auditLabels } from "@/modules/audits/presentation";
import { getAudit, listAudits } from "@/modules/audits/service";
import { rateMetric, RATING_TONE, SEVERITY_TONE, type MetricName } from "@/modules/audits/status";
import { fieldPeriod, splitAudits, summarizePerformance } from "@/modules/overview";
import { displayDate } from "@/modules/workspaces/presentation";
import { getWorkspace } from "@/modules/workspaces/service";
import { runAuditAction } from "../audits/actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).performancePage.metaTitle };
}

/** Blocking route so an unknown workspace returns a real 404 (same reason as the overview). */
export const instant = false;

type PerformanceTexts = Messages["performancePage"];
type MetricKey = keyof PerformanceTexts["metrics"];

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

/** Plain-words meaning of each metric and Google's "good" reference, in the interface language. */
function MetricList({ rows, locale }: { rows: { metric: MetricKey; value: number | null }[]; locale: Locale }) {
  const t = getMessages(locale).performancePage;
  const rating = auditLabels(locale).rating;
  const format = (metric: MetricKey, v: number) => (metric === "cls" ? formatNumber(v, locale, { maximumFractionDigits: 2 }) : formatMs(v, locale));
  return (
    <ul className="divide-y rounded-2xl border border-border/80 bg-card shadow-card">
      {rows.map(({ metric, value }) => {
        const m = t.metrics[metric];
        const rated = value === null ? null : rateMetric(metric as MetricName, value);
        return (
          <li key={metric} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium">{m.label}</span>
              <span className="text-sm text-muted-foreground">{m.meaning}</span>
              <span className="text-xs text-muted-foreground">{t.goodLabel(m.good)}</span>
            </div>
            <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
              <span className="text-xl font-semibold tabular-nums">{value === null ? "—" : format(metric, value)}</span>
              {rated ? <StatusPill tone={RATING_TONE[rated]}>{rating[rated]}</StatusPill> : <StatusPill tone="neutral">{t.noValue}</StatusPill>}
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
  const locale = await getLocale();
  const db = getDb();
  const workspace = await getWorkspace(db, id);
  if (!workspace) notFound();
  const m = getMessages(locale);
  const t = m.performancePage;

  const audits = await listAudits(db, workspace.id);
  const { result } = splitAudits(audits);
  const detail = result ? await getAudit(db, workspace.id, result.id) : null;
  const findings = detail?.findings ?? [];
  const s = summarizePerformance(audits, findings, new Date(), locale);
  const perf = result?.facts?.performance;
  const field = result?.facts?.fieldData;
  // Findings are translated with the facts and rules version of the audit they belong to.
  const context = result ? { facts: result.facts, rulesVersion: result.rulesVersion } : undefined;
  const problems = findings.filter((f) => f.category === "performance").map((f) => ({ finding: f, text: findingText(f, locale, context) }));
  const anyFallback = problems.some((p) => p.text.fallback);
  const problemsNotice =
    locale !== DEFAULT_LOCALE && problems.length > 0
      ? [problems.some((p) => p.finding.evidence.length > 0) ? t.problems.originalNotice : null, anyFallback ? t.problems.fallbackNotice : null].filter(Boolean).join(" ")
      : null;
  const points = audits
    .filter((a) => a.status === "completed")
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
    .map(toPoint);
  // The chart shows the most recent 12; every notice is computed on exactly those points.
  const shown = points.slice(-12);
  const measuredPoints = shown.filter((p) => p.score !== null).length;
  const breaks = speedBreaks(shown);
  const breakReasons = [
    breaks.differentVersion ? t.history.breakVersion : null,
    breaks.unknownVersion ? t.history.breakUnknown : null,
    breaks.gap ? t.history.breakGap : null,
  ].filter((r) => r !== null);

  const notices: Notice[] = [];
  if (s.attempt) notices.push({ kind: s.attempt.status === "running" ? "running" : "failed", text: s.attempt.text });
  if (s.stale) notices.push({ kind: "stale", text: s.stale.text });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        <PageHeader
          locale={locale}
          breadcrumbs={[
            { href: "/workspaces", label: m.workspaces.list.title },
            { href: `/workspaces/${workspace.id}`, label: workspace.name },
          ]}
          title={t.title}
          description={t.description}
          actions={<RunAuditButton workspaceId={workspace.id} action={runAuditAction.bind(null, workspace.id)} labels={m.audits.runButton} />}
        />
        <WorkspaceNav workspaceId={workspace.id} current="performance" locale={locale} />
      </div>

      <Panel>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground">{t.mobile}</span>
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
                {s.state === "analyzing" ? t.analyzing : s.state === "error" ? t.noResult : t.notMeasured}
              </span>
            )}
            {s.reason ? <p className="text-sm text-muted-foreground">{s.reason}</p> : null}
            <ChangeLine change={s.change} note={s.comparisonNote} />
            {s.measuredAt ? (
              <p className="text-xs text-muted-foreground">{t.source(displayDate(s.measuredAt, locale), perf?.status === "ok" ? perf.lighthouseVersion : null)}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:border-l sm:pl-6">
            <span className="text-sm font-medium text-muted-foreground">{t.desktop}</span>
            <span className="text-2xl font-medium text-muted-foreground">{t.notAvailable}</span>
            <p className="text-sm text-muted-foreground">{t.desktopNote}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 border-t pt-4">
          <NoticeList notices={notices} />
          <p className="text-sm text-muted-foreground">{t.labNote}</p>
        </div>
      </Panel>

      {result === null ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed bg-card/60 p-6">
          <p className="font-medium">{t.noMeasurementsTitle}</p>
          <p className="max-w-2xl text-sm text-muted-foreground">{t.noMeasurementsBody}</p>
        </div>
      ) : (
        <>
          <Section id="lab-title" title={t.lab.title} description={t.lab.description}>
            {perf?.status === "ok" && perf.metrics ? (
              <MetricList
                locale={locale}
                rows={[
                  { metric: "lcp", value: perf.metrics.lcpMs },
                  { metric: "fcp", value: perf.metrics.fcpMs },
                  { metric: "tbt", value: perf.metrics.tbtMs },
                  { metric: "cls", value: perf.metrics.cls },
                ]}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{s.reason ?? t.lab.notMeasured}</p>
            )}
          </Section>

          <Section id="field-title" title={t.field.title} description={t.field.description}>
            {field?.status === "ok" && field.metrics ? (
              <>
                <MetricList
                  locale={locale}
                  rows={[
                    { metric: "lcp", value: field.metrics.lcpMs },
                    // INP only exists as real-user data: it is shown only with valid field data.
                    ...(field.metrics.inpMs !== null ? [{ metric: "inp" as const, value: field.metrics.inpMs }] : []),
                    { metric: "cls", value: field.metrics.cls },
                  ]}
                />
                <p className="text-xs text-muted-foreground">
                  {t.field.line(field.scope ? t.field.scope[field.scope] : t.field.scope.unknown, fieldPeriod(field.collectionPeriod, locale) ?? t.field.periodUnknown)}
                </p>
              </>
            ) : (
              <Panel>
                <p className="text-sm text-muted-foreground">
                  {t.field.withLabOnly(field && field.status !== "ok" ? t.field.unavailable[field.status] : t.field.none)}
                </p>
              </Panel>
            )}
          </Section>

          <Section id="lighthouse-quality-title" title={m.lighthouse.section.qualityTitle} description={m.lighthouse.section.qualityDescription}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {(["accessibility", "best-practices"] as const).map((category) => (
                <LighthouseCategoryCard
                  key={category}
                  view={lighthouseView(perf, category, locale)}
                  locale={locale}
                  auditedAt={result?.startedAt ?? null}
                  version={perf?.lighthouseVersion ?? null}
                />
              ))}
            </div>
          </Section>

          <Section id="problems-title" title={t.problems.title} description={t.problems.description}>
            {problemsNotice ? (
              <p role="note" className="rounded-md border border-border/80 bg-muted/60 p-2.5 text-xs text-muted-foreground">
                {problemsNotice}
              </p>
            ) : null}
            {problems.length > 0 ? (
              <ol className="flex flex-col gap-3">
                {problems.map(({ finding: f, text }) => (
                  <li key={f.id} className="flex flex-col gap-2 rounded-2xl border border-border/80 bg-card shadow-card p-5">
                    <StatusPill tone={SEVERITY_TONE[f.severity]}>{auditLabels(locale).severity[f.severity]}</StatusPill>
                    <h3 className="text-base font-semibold tracking-tight" lang={text.fallback ? DEFAULT_LOCALE : undefined}>
                      {text.title}
                    </h3>
                    {f.ruleId in t.problems.meaning ? <p className="text-sm text-muted-foreground">{t.problems.meaning[f.ruleId as keyof typeof t.problems.meaning]}</p> : null}
                    <p className="text-sm" lang={text.fallback ? DEFAULT_LOCALE : undefined}>
                      <span className="font-medium">{t.problems.recommend} </span>
                      {text.recommendation}
                    </p>
                    {f.evidence.length > 0 ? (
                      <ul className="flex flex-col gap-0.5 rounded-lg bg-muted/60 p-3 text-xs" lang={DEFAULT_LOCALE}>
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
              <p className="text-sm text-muted-foreground">{s.score !== null ? t.problems.none : t.problems.noMeasurement}</p>
            )}
          </Section>

          <Section id="history-title" title={t.history.title} description={t.history.description}>
            {measuredPoints > 0 ? (
              <Panel>
                <div className="flex flex-col gap-3">
                  <SpeedLegend locale={locale} />
                  <SpeedChart points={shown} locale={locale} />
                  <ChartDataTable points={shown} kind="speed" locale={locale} />
                  {points.length > 12 ? <p className="text-xs text-muted-foreground">{t.history.showing(12, points.length)}</p> : null}
                  {breakReasons.length > 0 ? <p className="text-xs text-muted-foreground">{t.history.breaks(breakReasons.join(t.history.and))}</p> : null}
                </div>
              </Panel>
            ) : (
              <p className="text-sm text-muted-foreground">{t.history.none}</p>
            )}
          </Section>

          <Link
            href={`/workspaces/${workspace.id}/audits/${result.id}`}
            className="inline-flex w-fit items-center gap-1 rounded-sm text-sm font-medium text-brand hover:underline focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:outline-none"
          >
            {t.fullAudit(displayDate(result.startedAt, locale))}
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </>
      )}
    </div>
  );
}
