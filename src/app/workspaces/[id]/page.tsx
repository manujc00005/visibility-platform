import { Gauge, Search, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { RunAuditButton } from "@/components/audits/run-audit-button";
import { Opportunities } from "@/components/overview/opportunities";
import { ChangeLine, OverviewCard, type Notice } from "@/components/overview/overview-card";
import { PageHeader } from "@/components/overview/page-header";
import { WorkspaceNav } from "@/components/overview/workspace-nav";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages, type Messages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import type { Tone } from "@/modules/audits/status";
import { getAudit, listAudits } from "@/modules/audits/service";
import { listGeoRuns, listPrompts } from "@/modules/geo/service";
import { searchConsoleConfig } from "@/modules/search-console/deps";
import { latestSearchConsole } from "@/modules/search-console/service";
import { summarizeSearchConsole } from "@/modules/search-console/summary";
import {
  buildOpportunities,
  overviewOriginalText,
  splitAudits,
  summarizeAi,
  summarizePerformance,
  summarizeSeo,
  type AiSummary,
  type Attempt,
  type FindingsByAudit,
  type PerformanceSummary,
  type SeoSummary,
  type Stale,
} from "@/modules/overview";
import { displayDate, displayDomain } from "@/modules/workspaces/presentation";
import { getWorkspace } from "@/modules/workspaces/service";
import { runAuditAction } from "./audits/actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).overview.metaTitle };
}

/**
 * Blocking route: the whole page depends on one record, and rendering it before the
 * response starts is what lets an unknown id return a real 404 instead of a streamed 200.
 */
export const instant = false;

type OverviewTexts = Messages["overview"];

const STATE_TONE = { not_configured: "neutral", no_data: "neutral", analyzing: "neutral", partial: "neutral", error: "bad" } as const;

function notices(attempt: Attempt | { status: "running" | "failed"; text: string } | null, stale: Stale | null, extra?: string | null): Notice[] {
  const list: Notice[] = [];
  if (attempt) list.push({ kind: attempt.status === "running" ? "running" : "failed", text: attempt.text });
  if (stale) list.push({ kind: "stale", text: stale.text });
  if (extra) list.push({ kind: "info", text: extra });
  return list;
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-xl font-medium text-muted-foreground">{children}</span>;
}

function Line({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function PerformanceCard({ workspaceId, s, locale, t }: { workspaceId: string; s: PerformanceSummary; locale: Locale; t: OverviewTexts }) {
  const c = t.cards.performance;
  // Without a score the measurement simply did not happen: "No medida", not "Parcial".
  const status =
    s.state === "ok"
      ? { tone: s.tone, label: s.verdict }
      : s.state === "partial"
        ? { tone: STATE_TONE.not_configured, label: t.states.not_configured }
        : { tone: STATE_TONE[s.state], label: t.states[s.state] };
  return (
    <OverviewCard
      id="card-performance"
      href={`/workspaces/${workspaceId}/performance`}
      icon={Gauge}
      title={c.title}
      description={c.description}
      status={status}
      headline={
        s.score !== null ? (
          <>
            {s.score}
            <span className="text-base font-normal text-muted-foreground">/100</span>
          </>
        ) : (
          <Muted>{s.state === "analyzing" ? c.analyzing : s.state === "error" ? c.noResult : c.notMeasured}</Muted>
        )
      }
      notices={notices(s.attempt, s.stale)}
      source={c.source(s.measuredAt ? displayDate(s.measuredAt, locale) : s.state === "error" || s.state === "analyzing" ? c.noResultShort : c.notMeasuredShort)}
      cta={t.viewReport}
    >
      {s.score !== null ? <Line>{c.labNote}</Line> : null}
      {s.reason ? <Line>{s.reason}</Line> : null}
      <ChangeLine change={s.change} note={s.comparisonNote} />
      {s.topIssue ? (
        <p className="text-sm">
          <span className="text-muted-foreground">{c.topIssue} </span>
          <span lang={s.topIssueOriginal ? DEFAULT_LOCALE : undefined}>{s.topIssue}</span>
        </p>
      ) : null}
      {s.measuredAt ? (
        <div className="flex flex-col gap-0.5">
          <Line>{s.field.text}</Line>
          {s.field.source ? <p className="text-xs text-muted-foreground">{c.fieldSource(s.field.source)}</p> : null}
        </div>
      ) : null}
    </OverviewCard>
  );
}

function SeoCard({
  workspaceId,
  s,
  locale,
  t,
  rankingLine,
}: {
  workspaceId: string;
  s: SeoSummary;
  locale: Locale;
  t: OverviewTexts;
  rankingLine: string | null;
}) {
  const c = t.cards.seo;
  // A partial check keeps the severity it did find: "Mal (parcial)", never a neutral grey over critical problems.
  const status =
    s.state === "ok"
      ? { tone: s.tone, label: t.seoVerdict[s.tone] }
      : s.state === "partial" && s.tone !== "neutral"
        ? { tone: s.tone, label: t.partial(t.seoVerdict[s.tone]) }
        : { tone: STATE_TONE[s.state], label: t.states[s.state] };
  const measured = s.headline !== null;
  return (
    <OverviewCard
      id="card-seo"
      href={`/workspaces/${workspaceId}/seo`}
      icon={Search}
      title={c.title}
      description={c.description}
      status={status}
      headline={
        measured ? (
          <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span>
              {s.counts.critical}
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">{c.critical(s.counts.critical)}</span>
            </span>
            <span>
              {s.counts.warning}
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">{c.warning(s.counts.warning)}</span>
            </span>
          </span>
        ) : (
          <Muted>{s.state === "analyzing" ? c.analyzing : s.state === "error" ? c.noResult : c.noAudit}</Muted>
        )
      }
      notices={notices(s.attempt, s.stale)}
      source={c.source(s.auditedAt ? displayDate(s.auditedAt, locale) : s.state === "error" || s.state === "analyzing" ? c.noResultShort : c.notAuditedShort)}
      cta={t.viewReport}
    >
      {s.headline ? <p className="text-sm font-medium">{s.headline.title}</p> : null}
      {s.reason ? <Line>{s.reason}</Line> : null}
      <ChangeLine change={s.change} note={s.comparisonNote} />
      {rankingLine ? <Line>{rankingLine}</Line> : <Line>{c.searchConsole}</Line>}
    </OverviewCard>
  );
}

const AI_TONE = { ok: "neutral", partial: "fair", analyzing: "neutral", error: "bad", not_configured: "neutral", no_data: "neutral" } as const satisfies Record<AiSummary["state"], Tone>;

/** What the headline leaves out, in one small line: capture, unanswered and branded questions. */
function AiFootnote({ s, t }: { s: AiSummary; t: OverviewTexts["cards"]["ai"]["footnote"] }) {
  if (s.configured === null || s.capture === null) return null;
  const parts = [t.measured(s.configured)];
  if (s.capture.k < s.capture.n) parts.push(t.captured(s.capture.k, s.capture.n));
  if (s.unanswered.length > 0) parts.push(t.unanswered(s.unanswered.length));
  if (s.branded) parts.push(t.branded(s.branded.questions, s.branded.mentioned.k, s.branded.mentioned.n));
  if (parts.length === 1) return null;
  return (
    <p className="text-xs text-muted-foreground">{t.line(parts.join(" · "))}</p>
  );
}

function AiCard({ workspaceId, s, locale, t }: { workspaceId: string; s: AiSummary; locale: Locale; t: OverviewTexts }) {
  const c = t.cards.ai;
  const toSetup = s.coverage === null && (s.state === "not_configured" || s.state === "no_data");
  return (
    <OverviewCard
      id="card-ai"
      href={`/workspaces/${workspaceId}/geo${toSetup ? "/setup" : ""}`}
      icon={Sparkles}
      title={c.title}
      description={c.description}
      status={{ tone: AI_TONE[s.state], label: c.status[s.state] }}
      headline={
        s.coverage && s.coverage.n > 0 ? (
          <>
            {s.coverage.k}
            <span className="text-base font-normal text-muted-foreground"> {c.ofQuestions(s.coverage.n)}</span>
          </>
        ) : (
          <Muted>{s.coverage ? c.noData : s.state === "analyzing" ? c.collecting : s.state === "error" ? c.noResult : s.state === "not_configured" ? c.noQuestions : c.pending}</Muted>
        )
      }
      notices={notices(s.attempt, s.stale, s.setupNotice)}
      source={c.source(
        s.measuredAt && s.provider ? `${s.provider} · ${displayDate(s.measuredAt, locale)}` : s.state === "error" || s.state === "analyzing" ? c.noResultShort : c.noMeasurementsShort,
      )}
      cta={toSetup ? c.configure : t.viewReport}
    >
      {s.coverage && s.coverage.n > 0 ? <Line>{c.sampleNote}</Line> : s.reason ? <Line>{s.reason}</Line> : null}
      {s.citing && s.citing.n > 0 ? <Line>{c.cited(s.citing.k, s.citing.n)}</Line> : null}
      <ChangeLine change={s.change} note={s.comparisonNote} />
      {s.uncovered[0] ? (
        <p className="text-sm">
          <span className="text-muted-foreground">{c.topOpportunity} </span>
          {c.notMentioned(s.uncovered[0])}
        </p>
      ) : null}
      <AiFootnote s={s} t={c.footnote} />
    </OverviewCard>
  );
}

export default async function WorkspacePage({ params }: PageProps<"/workspaces/[id]">) {
  await connection();
  const { id } = await params;
  const locale = await getLocale();
  const db = getDb();
  const workspace = await getWorkspace(db, id);
  if (!workspace) notFound();
  const m = getMessages(locale);
  const t = m.overview;

  // Stored data only: nothing on this page calls PageSpeed, CrUX, Search Console, a website or an AI provider.
  const [audits, runs, prompts, gscStored] = await Promise.all([
    listAudits(db, workspace.id),
    listGeoRuns(db, workspace.id),
    listPrompts(db, workspace.id),
    latestSearchConsole(db, workspace.id),
  ]);
  const { result, previous } = splitAudits(audits);
  const loaded = await Promise.all([result, previous].filter((a) => a !== null).map((a) => getAudit(db, workspace.id, a.id)));
  const findingsByAudit: FindingsByAudit = Object.fromEntries(loaded.filter((r) => r !== null).map((r) => [r.audit.id, r.findings]));
  const latestFindings = result ? (findingsByAudit[result.id] ?? []) : [];

  const now = new Date();
  const performance = summarizePerformance(audits, latestFindings, now, locale);
  const seo = summarizeSeo(audits, findingsByAudit, now, locale);
  const ai = summarizeAi(
    runs.map(({ run, metrics }) => ({
      id: run.id,
      status: run.status,
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
  const context = result ? { facts: result.facts, rulesVersion: result.rulesVersion } : undefined;
  const gsc = summarizeSearchConsole(gscStored, searchConsoleConfig(), workspace.domain, locale);
  const opportunities = buildOpportunities({ findings: latestFindings, seo, performance, ai, context }, locale);
  // One original-language notice for the whole view (AC-009): opportunities and the performance card.
  const original = overviewOriginalText(opportunities, performance);
  const notice =
    locale !== DEFAULT_LOCALE && (original.storedEvidence || original.fallback)
      ? [original.storedEvidence ? t.opportunities.originalNotice : null, original.fallback ? t.opportunities.fallbackNotice : null].filter(Boolean).join(" ")
      : null;
  const domain = displayDomain(workspace.domain);
  const [emptyBefore, emptyAfter] = t.emptyAction.split("{link}");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        <PageHeader
          locale={locale}
          breadcrumbs={[{ href: "/workspaces", label: m.workspaces.list.title }]}
          title={workspace.name}
          meta={
            <>
              <span className="font-mono">{domain}</span> · {workspace.sector}
              {workspace.city ? ` · ${workspace.city}` : ""}
            </>
          }
          actions={
            <>
              <RunAuditButton workspaceId={workspace.id} action={runAuditAction.bind(null, workspace.id)} labels={m.audits.runButton} />
              <Link href={`/workspaces/${workspace.id}/edit`} className={buttonVariants({ variant: "outline" })}>
                {t.edit}
              </Link>
            </>
          }
        />
        <WorkspaceNav workspaceId={workspace.id} current="overview" locale={locale} />
      </div>

      <section aria-label={t.sectionLabel} className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <PerformanceCard workspaceId={workspace.id} s={performance} locale={locale} t={t} />
        <SeoCard workspaceId={workspace.id} s={seo} locale={locale} t={t} rankingLine={gsc.cardLine} />
        <AiCard workspaceId={workspace.id} s={ai} locale={locale} t={t} />
      </section>

      {notice ? (
        <p role="note" className="rounded-md border border-border/80 bg-muted/60 p-2.5 text-xs text-muted-foreground">
          {notice}
        </p>
      ) : null}

      <Opportunities
        workspaceId={workspace.id}
        list={opportunities}
        locale={locale}
        emptyAction={
          <p className="text-sm text-muted-foreground">
            {emptyBefore}
            <Link href={`/workspaces/${workspace.id}/geo/setup`} className="font-medium text-foreground underline underline-offset-4">
              {t.emptyActionLink}
            </Link>
            {emptyAfter}
          </p>
        }
      />
    </div>
  );
}
