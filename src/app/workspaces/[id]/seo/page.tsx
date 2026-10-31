import { TrackedKeywordsSection } from "@/components/search-console/tracked-keywords-section";
import { listTrackedKeywords } from "@/modules/search-console/tracked-keywords-service";
import { summarizeTrackedKeywords } from "@/modules/search-console/keyword-summary";
import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { ChartDataTable, ProblemsChart, ProblemsLegend } from "@/components/audits/evolution-chart";
import { RunAuditButton } from "@/components/audits/run-audit-button";
import { StatusPill, ToneIcon } from "@/components/audits/status-ui";
import { AnalyticsSection } from "@/components/analytics/analytics-section";
import { BingWebmasterSection } from "@/components/bing-webmaster/bing-webmaster-section";
import { SearchConsoleSection } from "@/components/search-console/search-console-section";
import { ChangeLine, NoticeList, type Notice } from "@/components/overview/overview-card";
import { PageHeader } from "@/components/overview/page-header";
import { WorkspaceNav } from "@/components/overview/workspace-nav";
import { getDb } from "@/db/client";
import { findingText } from "@/i18n/findings";
import { DEFAULT_LOCALE } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { auditLabels } from "@/modules/audits/presentation";
import type { Category } from "@/modules/audits/rules";
import { getAudit, listAudits } from "@/modules/audits/service";
import { SEVERITY_TONE } from "@/modules/audits/status";
import { analyticsConfig } from "@/modules/analytics/deps";
import { latestAnalytics } from "@/modules/analytics/service";
import { summarizeAnalytics } from "@/modules/analytics/summary";
import { bingWebmasterConfig } from "@/modules/bing-webmaster/deps";
import { latestBingWebmaster } from "@/modules/bing-webmaster/service";
import { summarizeBingWebmaster } from "@/modules/bing-webmaster/summary";
import { searchConsoleConfig } from "@/modules/search-console/deps";
import { latestSearchConsole } from "@/modules/search-console/service";
import { summarizeSearchConsole } from "@/modules/search-console/summary";
import { seoCounts, seoFindings, seoHistoryPoints, splitAudits, summarizeSeo, type FindingsByAudit } from "@/modules/overview";
import { displayDate } from "@/modules/workspaces/presentation";
import { getWorkspace } from "@/modules/workspaces/service";
import { runAuditAction } from "../audits/actions";
import { addTrackedKeywordAction, removeTrackedKeywordAction, refreshAnalyticsAction, refreshBingWebmasterAction, refreshSearchConsoleAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).seoPage.metaTitle };
}

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

export default async function SeoPage({ params }: PageProps<"/workspaces/[id]/seo">) {
  await connection();
  const { id } = await params;
  const locale = await getLocale();
  const db = getDb();
  const workspace = await getWorkspace(db, id);
  if (!workspace) notFound();
  const m = getMessages(locale);
  const t = m.seoPage;
  const L = auditLabels(locale);

  const [audits, stored, storedBing, storedAnalytics, tracked] = await Promise.all([
    listAudits(db, workspace.id),
    latestSearchConsole(db, workspace.id),
    latestBingWebmaster(db, workspace.id),
    latestAnalytics(db, workspace.id),
    listTrackedKeywords(db, workspace.id),
  ]);
  const gscConfig = searchConsoleConfig();
  const trackedSummary = summarizeTrackedKeywords(tracked, stored);
  const gsc = summarizeSearchConsole(stored, gscConfig, workspace.domain, locale);
  const bingConfig = bingWebmasterConfig();
  const bing = summarizeBingWebmaster(storedBing, bingConfig, workspace.domain, locale);
  const analyticsConf = analyticsConfig();
  const analytics = summarizeAnalytics(storedAnalytics, analyticsConf, workspace.domain, locale);
  const recent = audits.slice(0, HISTORY_LIMIT);
  const { result, previous } = splitAudits(audits);
  const toLoad = new Set([...recent.filter((a) => a.status === "completed").map((a) => a.id), ...[result, previous].flatMap((a) => (a ? [a.id] : []))]);
  const loaded = await Promise.all([...toLoad].map((auditId) => getAudit(db, workspace.id, auditId)));
  const findingsByAudit: FindingsByAudit = Object.fromEntries(loaded.filter((r) => r !== null).map((r) => [r.audit.id, r.findings]));

  const s = summarizeSeo(audits, findingsByAudit, new Date(), locale);
  // Findings are translated with the facts and rules version of the audit they belong to.
  const context = result ? { facts: result.facts, rulesVersion: result.rulesVersion } : undefined;
  const problems = result ? seoFindings(findingsByAudit[result.id] ?? []).map((f) => ({ finding: f, text: findingText(f, locale, context) })) : [];
  const problemsNotice =
    locale !== DEFAULT_LOCALE && problems.length > 0
      ? [problems.some((p) => p.finding.evidence.length > 0) ? t.problems.originalNotice : null, problems.some((p) => p.text.fallback) ? t.problems.fallbackNotice : null]
          .filter(Boolean)
          .join(" ")
      : null;
  const points = seoHistoryPoints(recent, findingsByAudit);

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
        <WorkspaceNav workspaceId={workspace.id} current="seo" locale={locale} />
      </div>

      <Section
        id="ranking-title"
        title={t.ranking.title}
        description={t.ranking.description}
      >
        <SearchConsoleSection s={gsc} config={gscConfig} action={refreshSearchConsoleAction.bind(null, workspace.id)} locale={locale} />
        <TrackedKeywordsSection summary={trackedSummary} locale={locale} addAction={addTrackedKeywordAction.bind(null,workspace.id)} removeAction={(keywordId) => removeTrackedKeywordAction.bind(null,workspace.id,keywordId)} />
      </Section>

      <Section id="bing-title" title={m.bingWebmaster.section.title} description={m.bingWebmaster.section.description}>
        <BingWebmasterSection s={bing} config={bingConfig} action={refreshBingWebmasterAction.bind(null, workspace.id)} locale={locale} />
      </Section>

      <Section id="analytics-title" title={m.analytics.section.title} description={m.analytics.section.description}>
        <AnalyticsSection s={analytics} config={analyticsConf} action={refreshAnalyticsAction.bind(null, workspace.id)} locale={locale} />
      </Section>

      <Section id="health-title" title={t.health.title} description={t.health.description}>
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
              {(["critical", "warning", "info"] as const).map((severity) => (
                <div key={severity} className="flex flex-col gap-0.5 rounded-lg bg-muted/50 p-3">
                  <dt className="text-xs font-medium text-muted-foreground">{t.health.counts[severity].label}</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{s.counts[severity]}</dd>
                  <dd className="hidden text-xs text-muted-foreground sm:block">{t.health.counts[severity].hint}</dd>
                </div>
              ))}
            </dl>
            <ChangeLine change={s.change} note={s.comparisonNote} />
            <NoticeList notices={notices} />
            <p className="text-xs text-muted-foreground">{t.health.source(s.auditedAt ? displayDate(s.auditedAt, locale) : "")}</p>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed bg-card/60 p-6">
            <p className="font-medium">{s.state === "analyzing" ? t.health.analyzing : s.state === "error" ? t.health.failed : t.health.none}</p>
            <p className="max-w-2xl text-sm text-muted-foreground">{s.reason}</p>
          </div>
        )}
      </Section>

      {s.headline ? (
        <>
          <Section id="areas-title" title={t.areas.title} description={t.areas.description}>
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

          <Section id="problems-title" title={t.problems.title} description={t.problems.description}>
            {problemsNotice ? (
              <p role="note" className="rounded-md border border-border/80 bg-muted/60 p-2.5 text-xs text-muted-foreground">
                {problemsNotice}
              </p>
            ) : null}
            {problems.length > 0 ? (
              <ol className="flex flex-col gap-3">
                {problems.map(({ finding: f, text }) => (
                  <li key={f.id} id={`finding-${f.id}`} className="flex scroll-mt-6 flex-col gap-2 rounded-2xl border border-border/80 bg-card shadow-card p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={SEVERITY_TONE[f.severity]}>{L.severity[f.severity]}</StatusPill>
                      <span className="text-xs text-muted-foreground">{L.category[f.category as Category] ?? f.category}</span>
                    </div>
                    <h3 className="text-base font-semibold tracking-tight" lang={text.fallback ? DEFAULT_LOCALE : undefined}>
                      {text.title}
                    </h3>
                    <p className="text-sm" lang={text.fallback ? DEFAULT_LOCALE : undefined}>
                      <span className="font-medium">{t.problems.recommend} </span>
                      {text.recommendation}
                    </p>
                    {f.evidence.length > 0 ? (
                      <div className="rounded-lg bg-muted/60 p-3">
                        <p className="text-xs font-medium text-muted-foreground">{t.problems.evidence}</p>
                        <ul className="mt-1 flex flex-col gap-0.5" lang={DEFAULT_LOCALE}>
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
              <p className="text-sm text-muted-foreground">{s.state === "partial" ? t.problems.nonePartial : t.problems.none}</p>
            )}
          </Section>
        </>
      ) : null}

      <Section id="history-title" title={t.history.title} description={t.history.description}>
        {points.length > 0 ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card shadow-card p-5">
            <ProblemsLegend locale={locale} />
            <ProblemsChart points={points} locale={locale} />
            <ChartDataTable points={points} kind="problems" locale={locale} />
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
                      <span className="font-medium">{displayDate(audit.startedAt, locale)}</span>
                      <span className="text-xs text-muted-foreground">
                        {audit.status !== "completed"
                          ? L.status[audit.status]
                          : counts
                            ? t.history.summary(counts.critical, counts.warning, counts.info, read)
                            : t.history.completed}
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-brand" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t.history.none}</p>
        )}
        {audits.length > HISTORY_LIMIT ? <p className="text-xs text-muted-foreground">{t.history.showing(HISTORY_LIMIT, audits.length)}</p> : null}
      </Section>
    </div>
  );
}
