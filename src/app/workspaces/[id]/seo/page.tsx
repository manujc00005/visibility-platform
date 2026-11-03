import { TrackedKeywordsSection } from "@/components/search-console/tracked-keywords-section";
import { listTrackedKeywords } from "@/modules/search-console/tracked-keywords-service";
import { summarizeTrackedKeywords } from "@/modules/search-console/keyword-summary";
import { ChevronRight, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import {
  ChartDataTable,
  ProblemsChart,
  ProblemsLegend,
} from "@/components/audits/evolution-chart";
import { LighthouseCategoryCard } from "@/components/audits/lighthouse-category";
import { RunAuditButton } from "@/components/audits/run-audit-button";
import {
  accentRow,
  figureClasses,
  StatusPill,
  ToneIcon,
  VerdictCard,
} from "@/components/audits/status-ui";
import { AnalyticsSection } from "@/components/analytics/analytics-section";
import { BingWebmasterSection } from "@/components/bing-webmaster/bing-webmaster-section";
import { ComparisonSection } from "@/components/competitor-comparison/comparison-section";
import {
  SearchConsoleQueries,
  SearchConsoleSection,
} from "@/components/search-console/search-console-section";
import {
  ChangeLine,
  NoticeList,
  type Notice,
} from "@/components/overview/overview-card";
import { PageHeader } from "@/components/overview/page-header";
import { WorkspaceNav } from "@/components/overview/workspace-nav";
import { getDb } from "@/db/client";
import { findingText } from "@/i18n/findings";
import { DEFAULT_LOCALE } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { auditLabels } from "@/modules/audits/presentation";
import type { Category } from "@/modules/audits/rules";
import { getAudit, listAudits } from "@/modules/audits/service";
import { lighthouseView } from "@/modules/audits/lighthouse";
import { SEVERITY_TONE } from "@/modules/audits/status";
import { analyticsConfig } from "@/modules/analytics/deps";
import { latestAnalytics } from "@/modules/analytics/service";
import { summarizeAnalytics } from "@/modules/analytics/summary";
import { bingWebmasterConfig } from "@/modules/bing-webmaster/deps";
import { latestBingWebmaster } from "@/modules/bing-webmaster/service";
import { summarizeBingWebmaster } from "@/modules/bing-webmaster/summary";
import { searchConsoleConfig } from "@/modules/search-console/deps";
import { comparisonConfig } from "@/modules/competitor-comparison/deps";
import { latestComparison } from "@/modules/competitor-comparison/service";
import { summarizeComparison } from "@/modules/competitor-comparison/summary";
import { listCompetitors } from "@/modules/geo/service";
import { latestSearchConsole } from "@/modules/search-console/service";
import { summarizeSearchConsole } from "@/modules/search-console/summary";
import {
  seoCounts,
  seoFindings,
  seoHistoryPoints,
  splitAudits,
  summarizeSeo,
  type FindingsByAudit,
} from "@/modules/overview";
import { searchAnswer, summarizeRankingCard } from "@/modules/overview/google";
import { displayDate } from "@/modules/workspaces/presentation";
import { getWorkspace } from "@/modules/workspaces/service";
import { runAuditAction } from "../audits/actions";
import {
  addTrackedKeywordAction,
  removeTrackedKeywordAction,
  refreshAnalyticsAction,
  refreshBingWebmasterAction,
  refreshSearchConsoleAction,
  runCompetitorComparisonAction,
} from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).seoPage.metaTitle };
}

/** Blocking route so an unknown workspace returns a real 404 (same reason as the overview). */
export const instant = false;

/** History reads the findings of each audit: bounded to what the chart can show. */
const HISTORY_LIMIT = 12;

/** A fold says it opens: a chevron that turns, a pointer and a visible focus ring. */
const SUMMARY_CLASSES =
  "flex cursor-pointer list-none items-start gap-2 rounded-md text-sm font-medium focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:ring-offset-4 focus-visible:ring-offset-card focus-visible:outline-none [&::-webkit-details-marker]:hidden";
const CHEVRON_CLASSES =
  "size-4 shrink-0 text-brand transition-transform group-open:rotate-90 motion-reduce:transition-none";

function Section({
  id,
  title,
  description,
  level = 3,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  level?: 2 | 3;
  children: ReactNode;
}) {
  const Heading = `h${level}` as const;
  return (
    <section
      aria-labelledby={id}
      className={level === 2 ? "flex flex-col gap-6" : "flex flex-col gap-3"}
    >
      <div className="flex flex-col gap-1">
        <Heading
          id={id}
          className={
            level === 2
              ? "scroll-mt-6 text-xl font-semibold tracking-tight"
              : "scroll-mt-6 text-lg font-semibold tracking-tight"
          }
        >
          {title}
        </Heading>
        {description ? (
          <p className="max-w-3xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default async function SeoPage({
  params,
}: PageProps<"/workspaces/[id]/seo">) {
  await connection();
  const { id } = await params;
  const locale = await getLocale();
  const db = getDb();
  const workspace = await getWorkspace(db, id);
  if (!workspace) notFound();
  const m = getMessages(locale);
  const t = m.seoPage;
  const L = auditLabels(locale);

  const [
    audits,
    stored,
    storedBing,
    storedAnalytics,
    tracked,
    storedComparison,
    competitors,
  ] = await Promise.all([
    listAudits(db, workspace.id),
    latestSearchConsole(db, workspace.id),
    latestBingWebmaster(db, workspace.id),
    latestAnalytics(db, workspace.id),
    listTrackedKeywords(db, workspace.id),
    latestComparison(db, workspace.id),
    listCompetitors(db, workspace.id),
  ]);
  const comparison = summarizeComparison({
    stored: storedComparison,
    company: workspace,
    competitors,
    config: comparisonConfig(),
    now: new Date(),
  });
  const gscConfig = searchConsoleConfig();
  const trackedSummary = summarizeTrackedKeywords(tracked, stored);
  const gsc = summarizeSearchConsole(
    stored,
    gscConfig,
    workspace.domain,
    locale,
  );
  const bingConfig = bingWebmasterConfig();
  const bing = summarizeBingWebmaster(
    storedBing,
    bingConfig,
    workspace.domain,
    locale,
  );
  const analyticsConf = analyticsConfig();
  const analytics = summarizeAnalytics(
    storedAnalytics,
    analyticsConf,
    workspace.domain,
    locale,
  );
  const recent = audits.slice(0, HISTORY_LIMIT);
  const { result, previous } = splitAudits(audits);
  const toLoad = new Set([
    ...recent.filter((a) => a.status === "completed").map((a) => a.id),
    ...[result, previous].flatMap((a) => (a ? [a.id] : [])),
  ]);
  const loaded = await Promise.all(
    [...toLoad].map((auditId) => getAudit(db, workspace.id, auditId)),
  );
  const findingsByAudit: FindingsByAudit = Object.fromEntries(
    loaded.filter((r) => r !== null).map((r) => [r.audit.id, r.findings]),
  );

  const s = summarizeSeo(audits, findingsByAudit, new Date(), locale);
  // Findings are translated with the facts and rules version of the audit they belong to.
  const context = result
    ? { facts: result.facts, rulesVersion: result.rulesVersion }
    : undefined;
  const problems = result
    ? seoFindings(findingsByAudit[result.id] ?? []).map((f) => ({
        finding: f,
        text: findingText(f, locale, context),
      }))
    : [];
  const problemsNotice =
    locale !== DEFAULT_LOCALE && problems.length > 0
      ? [
          problems.some((p) => p.finding.evidence.length > 0)
            ? t.problems.originalNotice
            : null,
          problems.some((p) => p.text.fallback)
            ? t.problems.fallbackNotice
            : null,
        ]
          .filter(Boolean)
          .join(" ")
      : null;
  const points = seoHistoryPoints(recent, findingsByAudit);

  const notices: Notice[] = [];
  if (s.attempt)
    notices.push({
      kind: s.attempt.status === "running" ? "running" : "failed",
      text: s.attempt.text,
    });
  if (s.stale) notices.push({ kind: "stale", text: s.stale.text });

  const a = t.answer;
  const ranking = summarizeRankingCard(gsc, new Date(), locale);
  const searchMeasured = gsc.state === "ok" || gsc.state === "empty";
  // Findings come most urgent first: the first critical one is the news the answer block names.
  const urgent =
    problems.find((p) => p.finding.severity === "critical") ?? null;

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
          actions={
            <RunAuditButton
              workspaceId={workspace.id}
              action={runAuditAction.bind(null, workspace.id)}
              labels={m.audits.runButton}
            />
          }
        />
        <WorkspaceNav
          workspaceId={workspace.id}
          current="seo"
          locale={locale}
        />
      </div>

      <nav
        aria-label={t.jump}
        className="flex flex-wrap gap-x-4 gap-y-1 text-sm"
      >
        {(["answer", "health", "detail", "competitors"] as const).map(
          (block) => (
            <a
              key={block}
              href={`#${block}-title`}
              className="font-medium text-brand underline-offset-4 hover:underline"
            >
              {t.blocks[block].title}
            </a>
          ),
        )}
      </nav>

      {/* The owner's question first: Search Console in words (no verdict, 014 D002), then the technical health. */}
      <Section id="answer-title" level={2} title={t.blocks.answer.title}>
        <div className="flex flex-col gap-3">
          <section
            aria-labelledby="answer-search"
            className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card p-5 shadow-card"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand ring-1 ring-brand/15"
              >
                <Search className="size-4" />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <h3
                  id="answer-search"
                  className="text-base font-semibold tracking-tight"
                >
                  {a.searchTitle}
                </h3>
                <p className="max-w-2xl text-base">
                  {searchAnswer(gsc, locale)}
                </p>
                {ranking.headline.kind === "figures" ? (
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {ranking.headline.clicks} {ranking.headline.clicksUnit} ·{" "}
                    {ranking.headline.impressions}{" "}
                    {ranking.headline.impressionsUnit}
                  </p>
                ) : null}
                {searchMeasured && ranking.line ? (
                  <p className="text-sm text-muted-foreground">
                    {ranking.line}
                  </p>
                ) : null}
              </div>
            </div>
            <NoticeList notices={ranking.notices} />
            <p className="text-xs text-muted-foreground">{ranking.source}</p>
          </section>

          {s.headline ? (
            <VerdictCard
              tone={s.tone}
              className="flex flex-col gap-5"
              role="region"
              aria-labelledby="health-summary"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <ToneIcon tone={s.tone} className="mt-0.5 size-6" />
                  <div className="flex flex-col gap-0.5">
                    <h3
                      id="health-summary"
                      className="text-base font-semibold tracking-tight"
                    >
                      {m.overview.cards.seo.technical.title}
                    </h3>
                    <p
                      className={cn(
                        "text-lg font-semibold tracking-tight",
                        figureClasses(s.tone),
                      )}
                    >
                      {s.headline.title}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {s.headline.detail}
                    </p>
                  </div>
                </div>
                <StatusPill
                  tone={s.tone}
                  variant={s.tone === "neutral" ? "soft" : "solid"}
                >
                  {s.state === "partial" && s.tone !== "neutral"
                    ? m.overview.partial(m.overview.verdict[s.tone])
                    : s.state === "partial"
                      ? m.overview.states.partial
                      : m.overview.verdict[s.tone]}
                </StatusPill>
              </div>
              {urgent ? (
                <p className="text-sm">
                  <span className="font-medium">{a.urgent}</span>{" "}
                  <a
                    href={`#finding-${urgent.finding.id}`}
                    lang={urgent.text.fallback ? DEFAULT_LOCALE : undefined}
                    className="font-medium text-brand underline underline-offset-4 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:outline-none"
                  >
                    {urgent.text.title}
                  </a>
                </p>
              ) : null}
              <dl className="grid grid-cols-3 gap-3">
                {(["critical", "warning", "info"] as const).map((severity) => {
                  // A count tile wears its severity only when it counts something: three zeros stay quiet.
                  const tone =
                    s.counts[severity] > 0
                      ? SEVERITY_TONE[severity]
                      : "neutral";
                  return (
                    <div
                      key={severity}
                      className={cn(
                        "flex flex-col gap-0.5 rounded-lg bg-muted/50 p-3",
                        accentRow(tone),
                      )}
                    >
                      <dt className="text-xs font-medium text-muted-foreground">
                        {t.health.counts[severity].label}
                      </dt>
                      <dd
                        className={cn(
                          "text-3xl leading-none font-semibold tabular-nums",
                          figureClasses(tone),
                        )}
                      >
                        {s.counts[severity]}
                      </dd>
                      <dd className="hidden text-xs text-muted-foreground sm:block">
                        {t.health.counts[severity].hint}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              <ChangeLine
                change={s.change}
                note={s.comparisonNote}
                labels={m.overview.change}
              />
              <NoticeList notices={notices} />
              <p className="text-xs text-muted-foreground">
                {t.health.source(
                  s.auditedAt ? displayDate(s.auditedAt, locale) : "",
                )}
              </p>
            </VerdictCard>
          ) : (
            <section
              aria-labelledby="health-summary"
              className="flex flex-col items-start gap-2 rounded-2xl border border-dashed bg-card/60 p-5"
            >
              <h3
                id="health-summary"
                className="text-base font-semibold tracking-tight"
              >
                {m.overview.cards.seo.technical.title}
              </h3>
              <p className="font-medium">
                {s.state === "analyzing"
                  ? t.health.analyzing
                  : s.state === "error"
                    ? t.health.failed
                    : t.health.none}
              </p>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {s.reason}
              </p>
            </section>
          )}
        </div>
      </Section>

      <Section
        id="health-title"
        level={2}
        title={t.blocks.health.title}
        description={t.health.description}
      >
        {s.headline ? (
          <>
            <Section
              id="areas-title"
              title={t.areas.title}
              description={t.areas.description}
            >
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {s.areas.map((area) => {
                  const body = (
                    <>
                      <span className="text-sm font-medium">{area.label}</span>
                      <StatusPill
                        tone={area.tone}
                        variant={area.tone === "neutral" ? "soft" : "solid"}
                      >
                        {area.verdict}
                        {area.count > 0 ? ` · ${area.count}` : ""}
                      </StatusPill>
                    </>
                  );
                  const className =
                    "flex h-full items-center justify-between gap-3 rounded-xl border border-border/80 bg-card px-4 py-3 shadow-card";
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

            <Section
              id="problems-title"
              title={t.problems.title}
              description={t.problems.description}
            >
              {problemsNotice ? (
                <p
                  role="note"
                  className="rounded-md border border-border/80 bg-muted/60 p-2.5 text-xs text-muted-foreground"
                >
                  {problemsNotice}
                </p>
              ) : null}
              {problems.length > 0 ? (
                <ol className="flex flex-col gap-3">
                  {problems.map(({ finding: f, text }) => (
                    <li
                      key={f.id}
                      id={`finding-${f.id}`}
                      className="flex scroll-mt-6 flex-col gap-2 rounded-2xl border border-border/80 bg-card shadow-card p-5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill
                          tone={SEVERITY_TONE[f.severity]}
                          variant="solid"
                        >
                          {L.severity[f.severity]}
                        </StatusPill>
                        <span className="text-xs text-muted-foreground">
                          {L.category[f.category as Category] ?? f.category}
                        </span>
                      </div>
                      <h4
                        className="text-base font-semibold tracking-tight"
                        lang={text.fallback ? DEFAULT_LOCALE : undefined}
                      >
                        {text.title}
                      </h4>
                      <p
                        className="text-sm"
                        lang={text.fallback ? DEFAULT_LOCALE : undefined}
                      >
                        <span className="font-medium">
                          {t.problems.recommend}{" "}
                        </span>
                        {text.recommendation}
                      </p>
                      {f.evidence.length > 0 ? (
                        <div className="rounded-lg bg-muted/60 p-3">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t.problems.evidence}
                          </p>
                          <ul
                            className="mt-1 flex flex-col gap-0.5"
                            lang={DEFAULT_LOCALE}
                          >
                            {f.evidence.map((line, i) => (
                              <li
                                key={i}
                                className="font-mono text-xs break-all"
                              >
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
                    ? t.problems.nonePartial
                    : t.problems.none}
                </p>
              )}
            </Section>
          </>
        ) : null}

        {/* Occasional reading with no incoming links, so it can stay folded (017, D003). */}
        <details className="group rounded-2xl border border-border/80 bg-card p-5 shadow-card">
          <summary className={SUMMARY_CLASSES}>
            <ChevronRight
              aria-hidden="true"
              className={cn(CHEVRON_CLASSES, "mt-0.5")}
            />
            {t.technicalDetail}
          </summary>
          <div className="mt-5 flex flex-col gap-8">
            <Section
              id="lighthouse-seo-title"
              title={m.lighthouse.section.seoTitle}
            >
              <LighthouseCategoryCard
                view={lighthouseView(result?.facts?.performance, "seo", locale)}
                locale={locale}
                auditedAt={result?.startedAt ?? null}
                version={result?.facts?.performance?.lighthouseVersion ?? null}
                headingLevel={4}
              />
            </Section>

            <Section
              id="history-title"
              title={t.history.title}
              description={t.history.description}
            >
              {points.length > 0 ? (
                <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card shadow-card p-5">
                  <ProblemsLegend locale={locale} />
                  <ProblemsChart points={points} locale={locale} />
                  <ChartDataTable
                    points={points}
                    kind="problems"
                    locale={locale}
                  />
                </div>
              ) : null}
              {recent.length > 0 ? (
                <ul className="flex flex-col divide-y rounded-2xl border border-border/80 bg-card shadow-card">
                  {recent.map((audit) => {
                    const findings = findingsByAudit[audit.id];
                    const counts = findings ? seoCounts(findings) : null;
                    const read =
                      audit.facts?.page.kind === "fetched" &&
                      audit.facts.page.result.status < 400 &&
                      audit.facts.page.result.facts !== null;
                    return (
                      <li key={audit.id}>
                        <Link
                          href={`/workspaces/${workspace.id}/audits/${audit.id}`}
                          className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:outline-none"
                        >
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                            <span className="font-medium">
                              {displayDate(audit.startedAt, locale)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {audit.status !== "completed"
                                ? L.status[audit.status]
                                : counts
                                  ? t.history.summary(
                                      counts.critical,
                                      counts.warning,
                                      counts.info,
                                      read,
                                    )
                                  : t.history.completed}
                            </span>
                          </span>
                          <ChevronRight
                            aria-hidden="true"
                            className="size-4 shrink-0 text-brand"
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t.history.none}
                </p>
              )}
              {audits.length > HISTORY_LIMIT ? (
                <p className="text-xs text-muted-foreground">
                  {t.history.showing(HISTORY_LIMIT, audits.length)}
                </p>
              ) : null}
            </Section>
          </div>
        </details>
      </Section>

      {/* Every source figure, the tables and the tracked searches: reading for whoever runs the website. */}
      <details
        aria-labelledby="detail-title"
        className="group rounded-2xl border border-border/80 bg-card p-5 shadow-card"
      >
        <summary className={SUMMARY_CLASSES}>
          <ChevronRight
            aria-hidden="true"
            className={cn(CHEVRON_CLASSES, "mt-1.5 size-5")}
          />
          <span className="flex flex-col gap-1">
            <h2
              id="detail-title"
              className="scroll-mt-6 text-xl font-semibold tracking-tight"
            >
              {t.blocks.detail.title}
            </h2>
            <span className="max-w-3xl text-sm font-normal text-muted-foreground">
              {t.blocks.detail.description}
            </span>
          </span>
        </summary>
        <div className="mt-6 flex flex-col gap-8">
          <Section
            id="ranking-title"
            title={t.ranking.title}
            description={t.ranking.description}
          >
            <SearchConsoleSection
              s={gsc}
              config={gscConfig}
              action={refreshSearchConsoleAction.bind(null, workspace.id)}
              locale={locale}
            />
          </Section>
          <Section
            id="queries-title"
            title={t.blocks.queries.title}
            description={t.blocks.queries.description}
          >
            <SearchConsoleQueries s={gsc} config={gscConfig} locale={locale} />
          </Section>
          <TrackedKeywordsSection
            summary={trackedSummary}
            locale={locale}
            addAction={addTrackedKeywordAction.bind(null, workspace.id)}
            removeAction={(keywordId) =>
              removeTrackedKeywordAction.bind(null, workspace.id, keywordId)
            }
          />
          <Section
            id="bing-title"
            title={m.bingWebmaster.section.title}
            description={m.bingWebmaster.section.description}
          >
            <BingWebmasterSection
              s={bing}
              config={bingConfig}
              action={refreshBingWebmasterAction.bind(null, workspace.id)}
              locale={locale}
            />
          </Section>
          <Section
            id="analytics-title"
            title={m.analytics.section.title}
            description={m.analytics.section.description}
          >
            <AnalyticsSection
              s={analytics}
              config={analyticsConf}
              action={refreshAnalyticsAction.bind(null, workspace.id)}
              locale={locale}
            />
          </Section>
        </div>
      </details>

      <Section
        id="competitors-title"
        level={2}
        title={t.blocks.competitors.title}
        description={m.competitorComparison.section.description}
      >
        <ComparisonSection
          s={comparison}
          action={runCompetitorComparisonAction.bind(null, workspace.id)}
          manageHref={`/workspaces/${workspace.id}/edit#competitors`}
          locale={locale}
        />
      </Section>
    </div>
  );
}
