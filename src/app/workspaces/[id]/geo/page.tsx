import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { StatusPill } from "@/components/audits/status-ui";
import { ChangeLine, NoticeList, type Notice } from "@/components/overview/overview-card";
import { PageHeader } from "@/components/overview/page-header";
import { WorkspaceNav } from "@/components/overview/workspace-nav";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { getMessages, type Messages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import type { Tone } from "@/modules/audits/status";
import type { Fraction } from "@/modules/geo/metrics";
import { geoLabels } from "@/modules/geo/presentation";
import { listGeoRuns, listPrompts } from "@/modules/geo/service";
import { summarizeAi, type BlockState } from "@/modules/overview";
import { displayDate, displayDomain } from "@/modules/workspaces/presentation";
import { getWorkspace } from "@/modules/workspaces/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).geo.page.metaTitle };
}

/** Blocking route so an unknown workspace returns a real 404 (same reason as the overview). */
export const instant = false;

const STATUS_TONE: Record<BlockState, Tone> = { ok: "neutral", partial: "fair", analyzing: "neutral", error: "bad", not_configured: "neutral", no_data: "neutral" };

type PageTexts = Messages["geo"]["page"];

function count(t: PageTexts, noData: string, f: Fraction, unit: "answer" | "scheduled" | "question"): string {
  return f.n === 0 ? noData : t.count(f.k, f.n, unit);
}

function Section({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-6 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {description ? <p className="max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed bg-card/60 p-6">
      <p className="font-medium">{title}</p>
      <p className="max-w-2xl text-sm text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}

function QuestionGroup({ title, hint, items }: { title: string; hint: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/80 bg-card shadow-card p-5">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold">
          {title} <span className="font-normal text-muted-foreground">· {items.length}</span>
        </h3>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {items.map((q) => (
          <li key={q} className="break-words" lang="es">
            «{q}»
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function GeoPage({ params }: PageProps<"/workspaces/[id]/geo">) {
  await connection();
  const { id } = await params;
  const locale = await getLocale();
  const db = getDb();
  const workspace = await getWorkspace(db, id);
  if (!workspace) notFound();
  const m = getMessages(locale);
  const t = m.geo.page;
  const L = geoLabels(locale);

  const [runs, prompts] = await Promise.all([listGeoRuns(db, workspace.id), listPrompts(db, workspace.id)]);
  const s = summarizeAi(
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
    new Date(),
    locale,
  );
  const view = s.coverage ? runs.find((r) => r.run.id === s.runId) : undefined;
  const competitorName = new Map(view?.run.config.panel.competitors.map((c) => [c.id, c.name]) ?? []);
  const base = `/workspaces/${workspace.id}/geo`;
  const setupLink = (label: string) => (
    <Link href={`${base}/setup`} className={buttonVariants({ variant: "outline" })}>
      {label}
    </Link>
  );

  const notices: Notice[] = [];
  if (s.attempt) notices.push({ kind: s.attempt.status === "running" ? "running" : "failed", text: s.attempt.text });
  if (s.stale) notices.push({ kind: "stale", text: s.stale.text });
  if (s.setupNotice) notices.push({ kind: "info", text: s.setupNotice });
  if (s.reason && s.coverage) notices.push({ kind: "info", text: s.reason });

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
          description={t.description(workspace.name, displayDomain(workspace.domain))}
          actions={setupLink(t.configure)}
        />
        <WorkspaceNav workspaceId={workspace.id} current="geo" locale={locale} />
      </div>

      {!s.coverage ? (
        s.state === "not_configured" ? (
          <Empty title={t.empty.noQuestionsTitle} action={setupLink(t.empty.configureQuestions)}>
            {t.empty.noQuestionsBody}
          </Empty>
        ) : s.state === "analyzing" && s.runId ? (
          <Empty
            title={t.empty.collectingTitle}
            action={
              <Link href={`${base}/runs/${s.runId}`} className={buttonVariants({ variant: "outline" })}>
                {t.empty.viewRunning}
              </Link>
            }
          >
            {t.empty.collectingBody}
          </Empty>
        ) : s.state === "error" && s.runId ? (
          <Empty
            title={t.empty.failedTitle}
            action={
              <Link href={`${base}/runs/${s.runId}`} className={buttonVariants({ variant: "outline" })}>
                {t.empty.viewRun}
              </Link>
            }
          >
            {t.empty.failedBody}
          </Empty>
        ) : (
          <Empty title={t.empty.noRunsTitle} action={setupLink(t.empty.firstRun)}>
            {t.empty.noRunsBody(prompts.length)}
          </Empty>
        )
      ) : (
        <>
          <div className="flex flex-col gap-5 rounded-2xl border border-border/80 bg-card shadow-card p-5">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1.2fr_1fr]">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-muted-foreground">{t.appear}</span>
                {s.coverage.n > 0 ? (
                  <span className="text-4xl font-semibold tracking-tight tabular-nums">
                    {s.coverage.k}
                    <span className="text-lg font-normal text-muted-foreground"> {t.ofEvaluated(s.coverage.n)}</span>
                  </span>
                ) : (
                  <span className="text-2xl font-medium text-muted-foreground">{L.noData}</span>
                )}
                <StatusPill tone={STATUS_TONE[s.state]}>{t.status[s.state]}</StatusPill>
                <ChangeLine change={s.change} note={s.comparisonNote} />
              </div>
              <dl className="flex flex-col gap-3 text-sm sm:border-l sm:pl-6">
                <div>
                  <dt className="text-muted-foreground">{t.citing}</dt>
                  <dd className="font-medium">{s.citing ? count(t, L.noData, s.citing, "answer") : L.noData}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t.collected}</dt>
                  <dd className="font-medium">{s.capture ? count(t, L.noData, s.capture, "scheduled") : L.noData}</dd>
                </div>
                {s.branded ? (
                  <div>
                    <dt className="text-muted-foreground">{t.branded}</dt>
                    <dd className="font-medium">{t.brandedValue(count(t, L.noData, s.branded.mentioned, "answer"))}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
            <NoticeList notices={notices} />
            {s.attempt?.status === "running" ? (
              <Link href={`${base}/runs/${s.attempt.runId}`} className="w-fit text-sm font-medium text-brand underline underline-offset-4">
                {t.empty.viewRunning}
              </Link>
            ) : null}
            <div className="flex flex-col gap-1 border-t pt-4 text-sm text-muted-foreground">
              <p>{t.sample}</p>
              <p className="text-xs">{t.source(s.provider ?? "", s.measuredAt ? displayDate(s.measuredAt, locale) : "", s.configured ?? 0)}</p>
            </div>
          </div>

          {view ? (
            <Section id="geo" title={t.visibility.title} description={t.visibility.description}>
              <div className="rounded-2xl border border-border/80 bg-card shadow-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.visibility.question}</TableHead>
                      <TableHead>{t.visibility.answers}</TableHead>
                      <TableHead>{t.visibility.mentions}</TableHead>
                      <TableHead>{t.visibility.cites}</TableHead>
                      <TableHead>{t.visibility.competitors}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {view.metrics.perPrompt.map((p) => {
                      const rivals = Object.entries(p.competitorMentions)
                        .filter(([, n]) => n > 0)
                        .map(([cid]) => competitorName.get(cid) ?? cid);
                      return (
                        <TableRow key={p.promptId}>
                          <TableCell className="max-w-xs whitespace-normal">
                            <span className="block" lang="es">
                              {p.text}
                            </span>
                            <span className="text-xs text-muted-foreground">{L.intent[p.intent]}</span>
                          </TableCell>
                          <TableCell className="tabular-nums">{t.visibility.of(p.answered, p.scheduled)}</TableCell>
                          <TableCell className="tabular-nums">{p.answered === 0 ? t.visibility.noAnswer : t.visibility.of(p.brandMentions, p.answered)}</TableCell>
                          <TableCell className="tabular-nums">{p.answered === 0 ? "—" : t.visibility.of(p.ownCitations, p.answered)}</TableCell>
                          <TableCell className="max-w-xs whitespace-normal">{rivals.length ? rivals.join(", ") : "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-2 rounded-2xl border border-border/80 bg-card shadow-card p-5">
                <h3 className="text-sm font-semibold">{t.comparison.title}</h3>
                {view.run.config.panel.competitors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.comparison.noCompetitors}</p>
                ) : view.metrics.shareOfVoice ? (
                  <>
                    <p className="text-sm text-muted-foreground">{t.comparison.description}</p>
                    <ul className="flex flex-col divide-y text-sm">
                      {view.metrics.shareOfVoice.entries.map((e) => (
                        <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                          <span>{e.id === "brand" ? t.comparison.yourBrand(workspace.name) : e.name}</span>
                          <span className="tabular-nums text-muted-foreground">{t.comparison.answers(e.k)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">{t.comparison.none}</p>
                )}
              </div>
            </Section>
          ) : null}

          <Section id="aeo" title={t.aeo.title} description={t.aeo.description}>
            <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-sm">{t.aeo.caveat}</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <QuestionGroup title={t.aeo.uncovered.title} hint={t.aeo.uncovered.hint} items={s.uncovered} />
              <QuestionGroup title={t.aeo.covered.title} hint={t.aeo.covered.hint} items={s.covered} />
              <QuestionGroup title={t.aeo.unanswered.title} hint={t.aeo.unanswered.hint} items={s.unanswered} />
            </div>
          </Section>
        </>
      )}

      <Section id="history" title={t.history.title} description={t.history.description}>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.history.none}</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-2xl border border-border/80 bg-card shadow-card">
            {runs.map(({ run, metrics }, index) => {
              const previous = runs[index + 1];
              const changed = previous && previous.run.methodologyKey !== run.methodologyKey;
              return (
                <li key={run.id}>
                  <Link
                    href={`${base}/runs/${run.id}`}
                    className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:outline-none"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-medium">{displayDate(run.createdAt, locale)}</span>
                      <span className="text-xs text-muted-foreground">
                        {L.provider[run.provider]} · {L.runStatus[run.status]}
                        {changed ? t.history.changed : ""}
                      </span>
                    </span>
                    <span className="hidden text-right text-xs text-muted-foreground sm:block">
                      {t.history.appear(count(t, L.noData, metrics.promptCoverage, "question"))}
                      <br />
                      {t.history.cites(count(t, L.noData, metrics.citationRate, "answer"))}
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-brand" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
