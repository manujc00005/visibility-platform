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
import { geoProviderStatus } from "@/modules/geo/deps";
import { formatMicros } from "@/modules/geo/budget";
import { INTENT_LABELS } from "@/modules/geo/presentation";
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

export const metadata: Metadata = { title: "Configurar la medición en IA" };
export const instant = false;

function contextLine(c: ExtractionContext): string {
  const parts = [c.brandName, c.sector, c.city ? `${c.city} (${c.countryName})` : c.countryName];
  if (c.aliases.length) parts.push(`alias: ${c.aliases.join(", ")}`);
  if (c.services.length) parts.push(`servicios: ${c.services.join(", ")}`);
  return parts.join(" · ");
}

export default async function GeoSetupPage({ params }: PageProps<"/workspaces/[id]/geo/setup">) {
  await connection();
  const { id } = await params;
  const db = getDb();
  const workspace = await getWorkspace(db, id);
  if (!workspace) notFound();
  const [competitors, prompts, discovery] = await Promise.all([
    listCompetitors(db, workspace.id),
    listPrompts(db, workspace.id),
    listSuggestions(db, workspace.id),
  ]);
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
  const providers = geoProviderStatus();
  const activeTexts = new Set(prompts.map((p) => p.text.toLocaleLowerCase("es")));
  const suggestions = suggestPrompts({
    brandName: workspace.name,
    sector: workspace.sector,
    city: workspace.city,
    countryName,
    services: workspace.services,
    competitorNames: competitors.map((c) => c.name),
  }).filter((s) => !activeTexts.has(s.text.toLocaleLowerCase("es")));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[
            { href: "/workspaces", label: "Empresas" },
            { href: `/workspaces/${workspace.id}`, label: workspace.name },
            { href: `/workspaces/${workspace.id}/geo`, label: "Presencia en IA" },
          ]}
          title="Configurar la medición en IA"
          description={`Qué preguntas hacemos a ChatGPT, cómo reconocemos a ${displayDomain(workspace.domain)} y con qué competidores te comparamos. Los resultados están en Presencia en IA.`}
        />
        <WorkspaceNav workspaceId={workspace.id} current="geo" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Marca</CardTitle>
          <CardDescription>
            Se detecta «{workspace.name}», su dominio {displayDomain(workspace.domain)} y estos otros nombres.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AliasesForm action={updateAliasesAction.bind(null, workspace.id)} defaultAliases={workspace.brandAliases} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Competidores confirmados</CardTitle>
          <CardDescription>Hasta {MAX_ACTIVE_COMPETITORS}. Solo los que confirmes aparecen en la comparación.</CardDescription>
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
                      Quitar
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Sin competidores todavía.</p>
          )}
          {competitors.length < MAX_ACTIVE_COMPETITORS ? <CompetitorForm action={addCompetitorAction.bind(null, workspace.id)} /> : null}
          <CompetitorSuggestions
            workspaceId={workspace.id}
            questions={questions}
            extraction={
              discovery
                ? {
                    question: discovery.extraction.question,
                    capturedAt: displayDate(discovery.extraction.createdAt),
                    sourcesCount: discovery.extraction.sources.length,
                    candidatesTotal: discovery.extraction.candidatesTotal,
                    warnings: discovery.extraction.warnings,
                    context: contextLine(discovery.extraction.contextSnapshot),
                    rulesVersion: discovery.extraction.rulesVersion,
                  }
                : null
            }
            cards={cards}
            activeCount={competitors.length}
            maxActive={MAX_ACTIVE_COMPETITORS}
            extract={extractCompetitorsAction.bind(null, workspace.id)}
            accept={acceptSuggestionAction}
            dismiss={dismissSuggestionAction}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preguntas</CardTitle>
          <CardDescription>
            Hasta {MAX_ACTIVE_PROMPTS}. Las preguntas «sobre tu marca» la nombran y se informan aparte: no cuentan para la presencia.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {prompts.length > 0 ? (
            <ul className="flex flex-col divide-y text-sm">
              {prompts.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {p.text} <Badge variant="outline">{INTENT_LABELS[p.intent]}</Badge>
                  </span>
                  <form action={archivePromptAction.bind(null, workspace.id, p.id)}>
                    <Button type="submit" variant="ghost" size="sm">
                      Quitar
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Sin preguntas todavía. Añade alguna de las sugeridas o escribe la tuya.</p>
          )}
          {suggestions.length > 0 && prompts.length < MAX_ACTIVE_PROMPTS ? (
            <div>
              <p className="text-sm font-medium">Sugerencias a partir de la ficha</p>
              <ul className="mt-1 flex flex-col gap-1 text-sm">
                {suggestions.map((s) => (
                  <li key={s.text} className="flex flex-wrap items-center gap-2">
                    <form action={addSuggestedPromptAction.bind(null, workspace.id, s.text, s.intent)}>
                      <Button type="submit" variant="outline" size="sm">
                        Añadir
                      </Button>
                    </form>
                    <span>{s.text}</span>
                    <Badge variant="secondary">{INTENT_LABELS[s.intent]}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {prompts.length < MAX_ACTIVE_PROMPTS ? <PromptForm action={addPromptAction.bind(null, workspace.id)} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nueva medición</CardTitle>
          <CardDescription>
            Se congela la configuración actual (marca, competidores y preguntas) para que el resultado sea reproducible.
            {providers.dataforseo.budgetMicros !== null ? ` Presupuesto mensual de pago: ${formatMicros(providers.dataforseo.budgetMicros)}.` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RunForm action={createRunAction.bind(null, workspace.id)} paid={providers.dataforseo} />
        </CardContent>
      </Card>

    </div>
  );
}
