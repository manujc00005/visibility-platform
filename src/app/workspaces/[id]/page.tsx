import { Gauge, ScanSearch, Search, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  Opportunities,
  OpportunityLead,
} from "@/components/overview/opportunities";
import {
  ChangeLine,
  OverviewCard,
  type Notice,
} from "@/components/overview/overview-card";
import { PageHeader } from "@/components/overview/page-header";
import { PendingList } from "@/components/overview/pending-list";
import { SituationLine } from "@/components/overview/situation-line";
import { GoalLine } from "@/components/workspaces/goal-line";
import { WorkspaceNav } from "@/components/overview/workspace-nav";
import { getDb } from "@/db/client";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages, type Messages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import type { Tone } from "@/modules/audits/status";
import { getAudit, listAudits } from "@/modules/audits/service";
import { listGeoRuns, listPrompts } from "@/modules/geo/service";
import { getGoal, goalEvidence } from "@/modules/goals/service";
import { summarizeGoal } from "@/modules/goals/summary";
import { latestAnalytics } from "@/modules/analytics/service";
import { searchConsoleConfig } from "@/modules/search-console/deps";
import { latestSearchConsole } from "@/modules/search-console/service";
import { summarizeSearchConsole } from "@/modules/search-console/summary";
import {
  buildOpportunities,
  overviewOriginalText,
  splitAudits,
  AREAS,
  hasResult,
  isEvaluated,
  isScored,
  pendingRows,
  situationLine,
  summarizeAi,
  summarizePerformance,
  summarizeRankingCard,
  summarizeSeo,
  summarizeTechnicalCard,
  type AiSummary,
  type AreaSummaries,
  type Attempt,
  type FindingsByAudit,
  type PerformanceSummary,
  type RankingCardSummary,
  type Stale,
  type TechnicalCardSummary,
} from "@/modules/overview";
import { displayDate, displayDomain } from "@/modules/workspaces/presentation";
import { getWorkspace } from "@/modules/workspaces/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).overview.metaTitle };
}

/**
 * Blocking route: the whole page depends on one record, and rendering it before the
 * response starts is what lets an unknown id return a real 404 instead of a streamed 200.
 */
export const instant = false;

type OverviewTexts = Messages["overview"];

function notices(
  attempt: Attempt | { status: "running" | "failed"; text: string } | null,
  stale: Stale | null,
  extra?: string | null,
): Notice[] {
  const list: Notice[] = [];
  if (attempt)
    list.push({
      kind: attempt.status === "running" ? "running" : "failed",
      text: attempt.text,
    });
  if (stale) list.push({ kind: "stale", text: stale.text });
  if (extra) list.push({ kind: "info", text: extra });
  return list;
}

/** A text headline. Block-level with its own leading: inside the Display wrapper a wrapped line would inherit its 36px strut. */
function Muted({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-xl leading-snug font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** Rendered only with a score (023 FR-003); without one the area is a row of the pending list. */
function PerformanceCard({
  workspaceId,
  s,
  locale,
  t,
}: {
  workspaceId: string;
  s: PerformanceSummary & { score: number };
  locale: Locale;
  t: OverviewTexts;
}) {
  const c = t.cards.performance;
  return (
    <OverviewCard
      id="card-performance"
      href={`/workspaces/${workspaceId}/performance`}
      icon={Gauge}
      title={c.title}
      status={{ tone: s.tone, label: t.verdict[s.tone] }}
      headline={
        <>
          {s.score}
          <span className="text-base font-normal text-muted-foreground">
            /100
          </span>
        </>
      }
      notices={notices(s.attempt, s.stale)}
      source={c.source(
        s.measuredAt ? displayDate(s.measuredAt, locale) : c.noResultShort,
      )}
      cta={t.viewReport}
    >
      <Line>{c.labNote}</Line>
      <ChangeLine change={s.change} note={s.comparisonNote} labels={t.change} />
      {s.topIssue ? (
        <p className="text-sm">
          <span className="text-muted-foreground">
            {s.tone === "good" ? c.topIssueGood : c.topIssue}{" "}
          </span>
          <span lang={s.topIssueOriginal ? DEFAULT_LOCALE : undefined}>
            {s.topIssue}
          </span>
        </p>
      ) : null}
    </OverviewCard>
  );
}

/** «¿Puede Google leer tu portada?»: the audit verdict, with critical problems as the one figure (023 D001). */
function TechnicalCard({
  workspaceId,
  h,
  t,
}: {
  workspaceId: string;
  h: TechnicalCardSummary & { counts: NonNullable<TechnicalCardSummary["counts"]> };
  t: OverviewTexts;
}) {
  const c = t.cards.seo.technical;
  return (
    <OverviewCard
      id="card-technical"
      href={`/workspaces/${workspaceId}/seo#health-title`}
      icon={ScanSearch}
      title={c.title}
      status={h.status}
      headline={
        <>
          {h.counts.critical}
          {/* A real space, so assistive tech reads "2 críticos", not "2críticos". */}
          <span className="ml-1 text-base font-normal text-muted-foreground">
            {" "}
            {c.critical(h.counts.critical)}
          </span>
        </>
      }
      notices={h.notices}
      source={h.source}
      cta={t.viewReport}
    >
      <p className="text-sm text-muted-foreground tabular-nums">
        {h.counts.warning} {c.warning(h.counts.warning)}
      </p>
      {h.reason ? <Line>{h.reason}</Line> : null}
      <ChangeLine change={h.change} note={h.comparisonNote} labels={t.change} />
    </OverviewCard>
  );
}

/** «¿Te encuentran en Google?»: Search Console figures, never a verdict (014 D002). */
function RankingCard({
  workspaceId,
  r,
  t,
}: {
  workspaceId: string;
  r: RankingCardSummary;
  t: OverviewTexts;
}) {
  const c = t.cards.seo;
  return (
    <OverviewCard
      id="card-ranking"
      href={`/workspaces/${workspaceId}/seo#results-title`}
      icon={Search}
      title={c.title}
      status={r.status}
      headline={
        r.headline.kind === "figures" ? (
          <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span>
              {r.headline.clicks}
              {/* A real space, so assistive tech reads "3 clics", not "3clics". */}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                {" "}
                {r.headline.clicksUnit}
              </span>
            </span>
            <span>
              {r.headline.impressions}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                {" "}
                {r.headline.impressionsUnit}
              </span>
            </span>
          </span>
        ) : (
          <Muted>{r.headline.text}</Muted>
        )
      }
      notices={r.notices}
      source={r.source}
      cta={t.viewReport}
    >
      <ChangeLine change={r.change} note={r.changeNote} labels={t.change} />
      {r.line ? <Line>{r.line}</Line> : null}
    </OverviewCard>
  );
}

// An incomplete measurement is a fact about the capture, not a verdict on the result: it stays neutral.
const AI_TONE = {
  ok: "neutral",
  partial: "neutral",
  analyzing: "neutral",
  error: "bad",
  not_configured: "neutral",
  no_data: "neutral",
} as const satisfies Record<AiSummary["state"], Tone>;

/** Rendered only with evaluated questions (023 FR-003). */
function AiCard({
  workspaceId,
  s,
  locale,
  t,
}: {
  workspaceId: string;
  s: AiSummary & { coverage: NonNullable<AiSummary["coverage"]> };
  locale: Locale;
  t: OverviewTexts;
}) {
  const c = t.cards.ai;
  return (
    <OverviewCard
      id="card-ai"
      href={`/workspaces/${workspaceId}/geo`}
      icon={Sparkles}
      title={c.title}
      status={{
        tone: AI_TONE[s.state],
        label:
          s.state === "analyzing" || s.state === "no_data"
            ? c.status[s.state]
            : t.states[s.state],
      }}
      headline={
        <>
          {s.coverage.k}
          <span className="text-base font-normal text-muted-foreground">
            {" "}
            {c.ofQuestions(s.coverage.n)}
          </span>
        </>
      }
      notices={notices(s.attempt, s.stale, s.setupNotice)}
      source={c.source(
        s.measuredAt && s.provider
          ? `${s.provider} · ${displayDate(s.measuredAt, locale)}`
          : c.noResultShort,
      )}
      cta={t.viewReport}
    >
      <Line>{c.sampleNote}</Line>
      {s.citing && s.citing.n > 0 ? (
        <Line>{c.cited(s.citing.k, s.citing.n)}</Line>
      ) : null}
      <ChangeLine change={s.change} note={s.comparisonNote} labels={t.change} />
    </OverviewCard>
  );
}

export default async function WorkspacePage({
  params,
}: PageProps<"/workspaces/[id]">) {
  await connection();
  const { id } = await params;
  const locale = await getLocale();
  const db = getDb();
  const workspace = await getWorkspace(db, id);
  if (!workspace) notFound();
  const m = getMessages(locale);
  const t = m.overview;

  // Stored data only: nothing on this page calls PageSpeed, CrUX, Search Console, a website or an AI provider.
  const [audits, runs, prompts, gscStored, analyticsStored, [goal, evidence]] =
    await Promise.all([
      listAudits(db, workspace.id),
      listGeoRuns(db, workspace.id),
      listPrompts(db, workspace.id),
      latestSearchConsole(db, workspace.id),
      latestAnalytics(db, workspace.id),
      // Verified from the stored GA4 captures, never from a stored flag (feature 016, D002); the
      // evidence only depends on the goal, so it overlaps with the other reads.
      getGoal(db, workspace.id).then(
        async (g) =>
          [
            g,
            g ? await goalEvidence(db, workspace.id, g.eventName) : null,
          ] as const,
      ),
    ]);
  const goalView = summarizeGoal(
    { goal, analytics: analyticsStored, evidence },
    locale,
  );
  const { result, previous } = splitAudits(audits);
  const loaded = await Promise.all(
    [result, previous]
      .filter((a) => a !== null)
      .map((a) => getAudit(db, workspace.id, a.id)),
  );
  const findingsByAudit: FindingsByAudit = Object.fromEntries(
    loaded.filter((r) => r !== null).map((r) => [r.audit.id, r.findings]),
  );
  const latestFindings = result ? (findingsByAudit[result.id] ?? []) : [];

  const now = new Date();
  const performance = summarizePerformance(audits, latestFindings, now, locale);
  const seo = summarizeSeo(audits, findingsByAudit, now, locale);
  const ai = summarizeAi(
    runs.map(({ run, metrics }) => ({
      id: run.id,
      status: run.status,
      origin: run.origin,
      provider: run.provider,
      methodologyKey: run.methodologyKey,
      createdAt: run.createdAt,
      completedAt: run.completedAt,
      metrics,
    })),
    prompts.length,
    now,
    locale,
  );
  // Findings are translated with the facts and rules version of the audit they belong to.
  const context = result
    ? { facts: result.facts, rulesVersion: result.rulesVersion }
    : undefined;
  const gsc = summarizeSearchConsole(
    gscStored,
    searchConsoleConfig(),
    workspace.domain,
    locale,
  );
  const ranking = summarizeRankingCard(gsc, now, locale);
  const technical = summarizeTechnicalCard(seo, locale);
  const areas: AreaSummaries = { performance, seo, gsc, ai };
  const situation = situationLine(areas, now, locale);
  const pending = pendingRows(areas, locale);
  const opportunities = buildOpportunities(
    { findings: latestFindings, seo, performance, ai, gsc, context },
    locale,
  );
  // One original-language notice for the whole view (AC-009): opportunities and the performance card.
  const original = overviewOriginalText(opportunities, performance);
  const notice =
    locale !== DEFAULT_LOCALE && (original.storedEvidence || original.fallback)
      ? [
          original.storedEvidence ? t.opportunities.originalNotice : null,
          original.fallback ? t.opportunities.fallbackNotice : null,
        ]
          .filter(Boolean)
          .join(" ")
      : null;
  const domain = displayDomain(workspace.domain);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        <PageHeader
          locale={locale}
          breadcrumbs={[
            { href: "/workspaces", label: m.workspaces.list.title },
          ]}
          title={workspace.name}
          meta={
            <>
              <span className="font-mono">{domain}</span> · {workspace.sector}
              {workspace.city ? ` · ${workspace.city}` : ""}
            </>
          }
        />
        <WorkspaceNav
          workspaceId={workspace.id}
          current="overview"
          locale={locale}
        />
      </div>

      <SituationLine fragments={situation} locale={locale} />

      <OpportunityLead list={opportunities} locale={locale} />

      <GoalLine view={goalView} workspaceId={workspace.id} locale={locale} />

      {/* Full cards only for areas with a result; with an odd count the last one spans both columns, so none is left alone. */}
      {AREAS.some((area) => hasResult(area, areas)) ? (
        <section
          aria-label={t.sectionLabel}
          className="grid grid-cols-1 gap-4 md:grid-cols-2 md:[&>*:last-child:nth-child(odd)]:col-span-2"
        >
          {/* The same guards `hasResult` uses (D003), so a card and its pending row can never both show. */}
          {isScored(performance) ? (
            <PerformanceCard
              workspaceId={workspace.id}
              s={performance}
              locale={locale}
              t={t}
            />
          ) : null}
          {hasResult("technical", areas) && technical.counts ? (
            <TechnicalCard
              workspaceId={workspace.id}
              h={{ ...technical, counts: technical.counts }}
              t={t}
            />
          ) : null}
          {hasResult("ranking", areas) ? (
            <RankingCard workspaceId={workspace.id} r={ranking} t={t} />
          ) : null}
          {isEvaluated(ai) ? (
            <AiCard workspaceId={workspace.id} s={ai} locale={locale} t={t} />
          ) : null}
        </section>
      ) : null}

      <PendingList rows={pending} locale={locale} />

      {notice ? (
        <p
          role="note"
          className="rounded-md border border-border/80 bg-muted/60 p-2.5 text-xs text-muted-foreground"
        >
          {notice}
        </p>
      ) : null}

      <Opportunities
        workspaceId={workspace.id}
        list={opportunities}
        locale={locale}
      />
    </div>
  );
}
