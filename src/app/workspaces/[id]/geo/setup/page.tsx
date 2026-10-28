import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CompetitorSuggestions, type SuggestionCard } from "@/components/geo/competitor-suggestions";
import { PageHeader } from "@/components/overview/page-header";
import { WorkspaceNav } from "@/components/overview/workspace-nav";
import { AliasesForm, CompetitorForm, PromptForm, RunForm } from "@/components/geo/geo-forms";
import { getDb } from "@/db/client";
import { DEFAULT_LOCALE } from "@/i18n/locale";
import { getMessages, type Messages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { geoProviderStatus } from "@/modules/geo/deps";
import { formatMicros } from "@/modules/geo/budget";
import { geoLabels } from "@/modules/geo/presentation";
import type { ExtractionContext } from "@/modules/geo/competitors/schema";
import { listSuggestions } from "@/modules/geo/competitors/service";
import { discoveryQuestions, suggestPrompts } from "@/modules/geo/prompt-suggestions";
import { listCompetitors, listPrompts, MAX_ACTIVE_COMPETITORS, MAX_ACTIVE_PROMPTS } from "@/modules/geo/service";
import { displayCountry, displayDate, displayDomain } from "@/modules/workspaces/presentation";
import { getWorkspace } from "@/modules/workspaces/service";
import {
  acceptSuggestionAction,
  addCompetitorAction,
  addPromptAction,
  addSuggestedPromptAction,
  archiveCompetitorAction,
  archivePromptAction,
  createRunAction,
  dismissSuggestionAction,
  extractCompetitorsAction,
  updateAliasesAction,
} from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).geo.setup.metaTitle };
}
export const instant = false;

/** Company record frozen at extraction time. Its values (sector, place, services) are the user's own data. */
function contextLine(c: ExtractionContext, t: Messages["geo"]["setup"]["context"]): string {
  const parts = [c.brandName, c.sector, c.city ? `${c.city} (${c.countryName})` : c.countryName];
  if (c.aliases.length) parts.push(t.aliases(c.aliases.join(", ")));
  if (c.services.length) parts.push(t.services(c.services.join(", ")));
  return parts.join(" · ");
}

export default async function GeoSetupPage({ params }: PageProps<"/workspaces/[id]/geo/setup">) {
  await connection();
  const { id } = await params;
  const locale = await getLocale();
  const db = getDb();
  const workspace = await getWorkspace(db, id);
  if (!workspace) notFound();
  const m = getMessages(locale);
  const t = m.geo.setup;
  const L = geoLabels(locale);
  const [competitors, prompts, discovery] = await Promise.all([
    listCompetitors(db, workspace.id),
    listPrompts(db, workspace.id),
    listSuggestions(db, workspace.id),
  ]);
  // Market questions are built in the business's language: the country name stays Spanish (SPEC «Límites»).
  const countryName = displayCountry(workspace.country);
  const questions = discoveryQuestions({ brandName: workspace.name, sector: workspace.sector, city: workspace.city, countryName });
  const cards: SuggestionCard[] = (discovery?.suggestions ?? [])
    .filter((s) => s.status !== "superseded")
    .map((s) => ({
      id: s.id,
      status: s.status,
      name: s.name,
      domain: s.domain,
      sourceUrls: s.sourceUrls,
      snippet: s.snippet,
      pageTitle: s.pageTitle,
      pageDescription: s.pageDescription,
      factors: s.factors,
      webStatus: s.webStatus,
      finalUrl: s.finalUrl,
      acceptedName: s.acceptedInput?.name ?? null,
    }));
  const providers = geoProviderStatus(locale);
  const activeTexts = new Set(prompts.map((p) => p.text.toLocaleLowerCase("es")));
  const suggestions = suggestPrompts({
    brandName: workspace.name,
    sector: workspace.sector,
    city: workspace.city,
    countryName,
    services: workspace.services,
    competitorNames: competitors.map((c) => c.name),
  }).filter((s) => !activeTexts.has(s.text.toLocaleLowerCase("es")));
  const domain = displayDomain(workspace.domain);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-6">
        <PageHeader
          locale={locale}
          breadcrumbs={[
            { href: "/workspaces", label: m.workspaces.list.title },
            { href: `/workspaces/${workspace.id}`, label: workspace.name },
            { href: `/workspaces/${workspace.id}/geo`, label: m.geo.page.title },
          ]}
          title={t.title}
          description={t.description(domain)}
        />
        <WorkspaceNav workspaceId={workspace.id} current="geo" locale={locale} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.brand.title}</CardTitle>
          <CardDescription>{t.brand.description(workspace.name, domain)}</CardDescription>
        </CardHeader>
        <CardContent>
          <AliasesForm action={updateAliasesAction.bind(null, workspace.id)} defaultAliases={workspace.brandAliases} labels={m.geo.forms} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.competitors.title}</CardTitle>
          <CardDescription>{t.competitors.description(MAX_ACTIVE_COMPETITORS)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {competitors.length > 0 ? (
            <ul className="flex flex-col divide-y text-sm">
              {competitors.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <strong>{c.name}</strong>
                    {c.domain ? <span className="font-mono text-xs text-muted-foreground"> · {displayDomain(c.domain)}</span> : null}
                    {c.aliases.length ? <span className="text-muted-foreground"> · {c.aliases.join(", ")}</span> : null}
                  </span>
                  <form action={archiveCompetitorAction.bind(null, workspace.id, c.id)}>
                    <Button type="submit" variant="ghost" size="sm">
                      {t.competitors.remove}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t.competitors.none}</p>
          )}
          {competitors.length < MAX_ACTIVE_COMPETITORS ? <CompetitorForm action={addCompetitorAction.bind(null, workspace.id)} labels={m.geo.forms} /> : null}
          <CompetitorSuggestions
            workspaceId={workspace.id}
            questions={questions}
            extraction={
              discovery
                ? {
                    question: discovery.extraction.question,
                    capturedAt: displayDate(discovery.extraction.createdAt, locale),
                    sourcesCount: discovery.extraction.sources.length,
                    candidatesTotal: discovery.extraction.candidatesTotal,
                    warnings: discovery.extraction.warnings,
                    context: contextLine(discovery.extraction.contextSnapshot, t.context),
                    rulesVersion: discovery.extraction.rulesVersion,
                    notice: locale !== DEFAULT_LOCALE ? m.geo.suggestions.originalNotice : null,
                  }
                : null
            }
            cards={cards}
            activeCount={competitors.length}
            maxActive={MAX_ACTIVE_COMPETITORS}
            extract={extractCompetitorsAction.bind(null, workspace.id)}
            accept={acceptSuggestionAction}
            dismiss={dismissSuggestionAction}
            labels={m.geo.suggestions}
            locale={locale}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.prompts.title}</CardTitle>
          <CardDescription>{t.prompts.description(MAX_ACTIVE_PROMPTS)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {prompts.length > 0 ? (
            <ul className="flex flex-col divide-y text-sm">
              {prompts.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span lang="es">{p.text}</span> <Badge variant="outline">{L.intent[p.intent]}</Badge>
                  </span>
                  <form action={archivePromptAction.bind(null, workspace.id, p.id)}>
                    <Button type="submit" variant="ghost" size="sm">
                      {t.prompts.remove}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t.prompts.none}</p>
          )}
          {suggestions.length > 0 && prompts.length < MAX_ACTIVE_PROMPTS ? (
            <div>
              <p className="text-sm font-medium">{t.prompts.suggested}</p>
              {locale !== DEFAULT_LOCALE ? <p className="text-xs text-muted-foreground">{t.prompts.marketNote}</p> : null}
              <ul className="mt-1 flex flex-col gap-1 text-sm">
                {suggestions.map((s) => (
                  <li key={s.text} className="flex flex-wrap items-center gap-2">
                    <form action={addSuggestedPromptAction.bind(null, workspace.id, s.text, s.intent)}>
                      <Button type="submit" variant="outline" size="sm">
                        {t.prompts.add}
                      </Button>
                    </form>
                    <span lang="es">{s.text}</span>
                    <Badge variant="secondary">{L.intent[s.intent]}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {prompts.length < MAX_ACTIVE_PROMPTS ? <PromptForm action={addPromptAction.bind(null, workspace.id)} labels={m.geo.forms} intents={L.intent} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.run.title}</CardTitle>
          <CardDescription>
            {t.run.description}
            {providers.dataforseo.budgetMicros !== null ? t.run.budget(formatMicros(providers.dataforseo.budgetMicros, locale)) : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RunForm action={createRunAction.bind(null, workspace.id)} paid={providers.dataforseo} labels={m.geo.forms} />
        </CardContent>
      </Card>
    </div>
  );
}
