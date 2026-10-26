import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AliasesForm, CompetitorForm, PromptForm, RunForm } from "@/components/geo/geo-forms";
import { getDb } from "@/db/client";
import { geoProviderStatus } from "@/modules/geo/deps";
import { formatMicros } from "@/modules/geo/budget";
import { fraction, INTENT_LABELS, PROVIDER_LABELS, RUN_STATUS_LABELS } from "@/modules/geo/presentation";
import { suggestPrompts } from "@/modules/geo/prompt-suggestions";
import { listCompetitors, listGeoRuns, listPrompts, MAX_ACTIVE_COMPETITORS, MAX_ACTIVE_PROMPTS } from "@/modules/geo/service";
import { displayCountry, displayDate, displayDomain } from "@/modules/workspaces/presentation";
import { getWorkspace } from "@/modules/workspaces/service";
import {
  addCompetitorAction,
  addPromptAction,
  addSuggestedPromptAction,
  archiveCompetitorAction,
  archivePromptAction,
  createRunAction,
  updateAliasesAction,
} from "./actions";

export const metadata: Metadata = { title: "Visibilidad en IA" };
export const instant = false;

export default async function GeoPage({ params }: PageProps<"/workspaces/[id]/geo">) {
  await connection();
  const { id } = await params;
  const db = getDb();
  const workspace = await getWorkspace(db, id);
  if (!workspace) notFound();
  const [competitors, prompts, runs] = await Promise.all([listCompetitors(db, workspace.id), listPrompts(db, workspace.id), listGeoRuns(db, workspace.id)]);
  const providers = geoProviderStatus();
  const activeTexts = new Set(prompts.map((p) => p.text.toLocaleLowerCase("es")));
  const suggestions = suggestPrompts({
    brandName: workspace.name,
    sector: workspace.sector,
    city: workspace.city,
    countryName: displayCountry(workspace.country),
    services: workspace.services,
    competitorNames: competitors.map((c) => c.name),
  }).filter((s) => !activeTexts.has(s.text.toLocaleLowerCase("es")));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/workspaces/${workspace.id}`} className="text-sm text-muted-foreground hover:underline">
          ← {workspace.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Visibilidad en asistentes de IA</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Medimos si ChatGPT menciona y cita a {displayDomain(workspace.domain)} al responder preguntas de clientes. Es una muestra de
          respuestas en un momento concreto, no datos de búsquedas reales.
        </p>
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

      <Card>
        <CardHeader>
          <CardTitle>Mediciones</CardTitle>
          <CardDescription>Solo son comparables entre sí las que tienen la misma configuración.</CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay mediciones.</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {runs.map(({ run, metrics }, index) => {
                const previous = runs[index + 1];
                const changed = previous && previous.run.methodologyKey !== run.methodologyKey;
                return (
                  <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="flex flex-col">
                      <Link href={`/workspaces/${workspace.id}/geo/runs/${run.id}`} className="font-medium hover:underline">
                        {displayDate(run.createdAt)}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {PROVIDER_LABELS[run.provider]} · {RUN_STATUS_LABELS[run.status]}
                        {changed ? " · configuración distinta a la anterior" : ""}
                      </span>
                    </span>
                    <span className="text-right text-xs">
                      Presencia: {fraction(metrics.brandPresence)}
                      <br />
                      Citas a tu web: {fraction(metrics.citationRate)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
