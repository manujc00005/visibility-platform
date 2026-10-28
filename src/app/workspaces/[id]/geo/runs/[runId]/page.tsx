import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ManualObservationForm, RefreshRunButton } from "@/components/geo/geo-forms";
import { PageHeader } from "@/components/overview/page-header";
import { getDb } from "@/db/client";
import { DEFAULT_LOCALE } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { fraction, geoLabels } from "@/modules/geo/presentation";
import { getGeoRun } from "@/modules/geo/service";
import { displayDate, displayDomain } from "@/modules/workspaces/presentation";
import { getWorkspace } from "@/modules/workspaces/service";
import { recordObservationAction, refreshRunAction } from "../../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).geo.run.metaTitle };
}
export const instant = false;

export default async function GeoRunPage({ params }: PageProps<"/workspaces/[id]/geo/runs/[runId]">) {
  await connection();
  const { id, runId } = await params;
  const locale = await getLocale();
  const db = getDb();
  const workspace = await getWorkspace(db, id);
  if (!workspace) notFound();
  const view = await getGeoRun(db, workspace.id, runId);
  if (!view) notFound();
  const m = getMessages(locale);
  const t = m.geo.run;
  const L = geoLabels(locale);
  const { run, observations, metrics } = view;
  const config = run.config;
  const promptText = new Map(config.prompts.map((p) => [p.id, p]));
  const competitorName = new Map(config.panel.competitors.map((c) => [c.id, c.name]));
  // Captured answers, sources and provider messages are stored content: one notice per view outside Spanish.
  const showNotice = locale !== DEFAULT_LOCALE && observations.some((o) => o.responseText || o.sources?.length || o.error);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        locale={locale}
        breadcrumbs={[
          { href: "/workspaces", label: m.workspaces.list.title },
          { href: `/workspaces/${workspace.id}`, label: workspace.name },
          { href: `/workspaces/${workspace.id}/geo`, label: m.geo.page.title },
        ]}
        title={t.title(workspace.name)}
        meta={t.meta({
          domain: displayDomain(workspace.domain),
          when: displayDate(run.createdAt, locale),
          provider: L.provider[run.provider],
          status: L.runStatus[run.status],
          location: config.location.locationName,
          language: config.location.languageCode,
          repetitions: config.repetitions,
          methodology: config.methodologyVersion,
        })}
      />

      {run.provider === "dataforseo_chatgpt" && run.status === "collecting" ? (
        <RefreshRunButton action={refreshRunAction.bind(null, workspace.id, run.id)} labels={m.geo.forms} />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["mentions", metrics.brandPresence],
            ["cites", metrics.citationRate],
            ["coverage", metrics.promptCoverage],
            ["capture", metrics.capture],
          ] as const
        ).map(([key, value]) => (
          <Card key={key} size="sm">
            <CardHeader>
              <CardDescription>{t.metrics[key].title}</CardDescription>
              <CardTitle className="text-lg">{fraction(value, locale)}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">{t.metrics[key].hint}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.comparison.title}</CardTitle>
          <CardDescription>{t.comparison.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.shareOfVoice ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.comparison.brand}</TableHead>
                  <TableHead>{t.comparison.mentions}</TableHead>
                  <TableHead>{t.comparison.share}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.shareOfVoice.entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.id === "brand" ? t.comparison.yourBrand(config.panel.brand.name) : e.name}</TableCell>
                    <TableCell>{e.k}</TableCell>
                    <TableCell>{Math.round((e.k / metrics.shareOfVoice!.total) * 100)} %</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">{t.comparison.none}</p>
          )}
          {metrics.branded.n > 0 ? <p className="mt-3 text-sm text-muted-foreground">{t.comparison.branded(fraction(metrics.branded, locale))}</p> : null}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="answers-title">
        <h2 id="answers-title" className="text-lg font-semibold">
          {t.answers.title}
        </h2>
        {showNotice ? (
          <p role="note" className="rounded-md border border-border/80 bg-muted/60 p-2.5 text-xs text-muted-foreground">
            {t.answers.originalNotice}
          </p>
        ) : null}
        {observations.map((o) => {
          const prompt = promptText.get(o.promptId);
          const competitorsMentioned = Object.entries(o.mentions?.competitors ?? {})
            .filter(([, hit]) => hit)
            .map(([cid]) => competitorName.get(cid) ?? cid);
          return (
            <Card key={o.id} size="sm">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                  <span lang="es">{prompt?.text}</span>
                  {prompt ? <Badge variant="outline">{L.intent[prompt.intent]}</Badge> : null}
                  {config.repetitions > 1 ? <Badge variant="secondary">#{o.repetition}</Badge> : null}
                  <Badge variant={o.status === "completed" ? "secondary" : o.status === "failed" || o.status === "uncertain" ? "destructive" : "outline"}>
                    {L.observationStatus[o.status]}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {o.status === "completed" ? (
                  <>
                    <p>
                      {o.answerPresent ? (
                        <>
                          {t.answers.brand} <strong>{o.mentions?.brand ? t.answers.mentioned : t.answers.notMentioned}</strong>
                          {competitorsMentioned.length ? t.answers.competitors(competitorsMentioned.join(", ")) : ""}
                          {o.ownCited ? t.answers.citesYou : ""}
                        </>
                      ) : (
                        t.answers.noAnswer
                      )}
                    </p>
                    {o.responseText ? (
                      <details>
                        <summary className="cursor-pointer text-muted-foreground">{t.answers.viewAnswer}</summary>
                        <p className="mt-2 whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">{o.responseText}</p>
                      </details>
                    ) : null}
                    {o.sources?.length ? (
                      <ul className="flex flex-col gap-0.5">
                        {o.sources.map((s, i) => (
                          <li key={i} className="font-mono text-xs break-all">
                            [{t.answers.sourceKind[s.kind === "own" ? "own" : s.kind === "competitor" ? "competitor" : "other"]}] {s.url}
                          </li>
                        ))}
                      </ul>
                    ) : o.answerPresent ? (
                      <p className="text-xs text-muted-foreground">{t.answers.noSources}</p>
                    ) : null}
                  </>
                ) : o.status === "pending" && run.provider === "manual" ? (
                  <ManualObservationForm action={recordObservationAction.bind(null, workspace.id, run.id, o.id)} labels={m.geo.forms} />
                ) : o.error ? (
                  <p className="text-xs text-muted-foreground" lang="es">
                    {o.error}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
