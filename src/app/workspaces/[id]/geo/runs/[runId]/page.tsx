import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ManualObservationForm, RefreshRunButton } from "@/components/geo/geo-forms";
import { getDb } from "@/db/client";
import { fraction, INTENT_LABELS, OBSERVATION_STATUS_LABELS, PROVIDER_LABELS, RUN_STATUS_LABELS } from "@/modules/geo/presentation";
import { getGeoRun } from "@/modules/geo/service";
import { displayDate, displayDomain } from "@/modules/workspaces/presentation";
import { getWorkspace } from "@/modules/workspaces/service";
import { recordObservationAction, refreshRunAction } from "../../actions";

export const metadata: Metadata = { title: "Medición de visibilidad en IA" };
export const instant = false;

export default async function GeoRunPage({ params }: PageProps<"/workspaces/[id]/geo/runs/[runId]">) {
  await connection();
  const { id, runId } = await params;
  const db = getDb();
  const workspace = await getWorkspace(db, id);
  if (!workspace) notFound();
  const view = await getGeoRun(db, workspace.id, runId);
  if (!view) notFound();
  const { run, observations, metrics } = view;
  const config = run.config;
  const promptText = new Map(config.prompts.map((p) => [p.id, p]));
  const competitorName = new Map(config.panel.competitors.map((c) => [c.id, c.name]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/workspaces/${workspace.id}/geo`} className="text-sm text-muted-foreground hover:underline">
          ← Visibilidad en IA
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Medición de {displayDomain(workspace.domain)}</h1>
        <p className="text-sm text-muted-foreground">
          {displayDate(run.createdAt)} · {PROVIDER_LABELS[run.provider]} · {RUN_STATUS_LABELS[run.status]} · {config.location.locationName},{" "}
          {config.location.languageCode} · {config.repetitions} repetición(es) · metodología {config.methodologyVersion}
        </p>
      </div>

      {run.provider === "dataforseo_chatgpt" && run.status === "collecting" ? (
        <RefreshRunButton action={refreshRunAction.bind(null, workspace.id, run.id)} />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Te menciona", metrics.brandPresence, "Respuestas que nombran tu marca (sin contar preguntas sobre tu marca)"],
          ["Cita tu web", metrics.citationRate, "Respuestas que enlazan a tu dominio como fuente"],
          ["Preguntas con presencia", metrics.promptCoverage, "Preguntas en las que apareces al menos una vez"],
          ["Respuestas recogidas", metrics.capture, "Observaciones completadas sobre las previstas"],
        ].map(([title, value, hint]) => (
          <Card key={title as string} size="sm">
            <CardHeader>
              <CardDescription>{title as string}</CardDescription>
              <CardTitle className="text-lg">{fraction(value as { k: number; n: number })}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">{hint as string}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Comparación con competidores</CardTitle>
          <CardDescription>Menciones en respuestas a preguntas que no nombran tu marca (cada marca cuenta una vez por respuesta).</CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.shareOfVoice ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Marca</TableHead>
                  <TableHead>Menciones</TableHead>
                  <TableHead>Cuota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.shareOfVoice.entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.id === "brand" ? `${config.panel.brand.name} (tu marca)` : e.name}</TableCell>
                    <TableCell>{e.k}</TableCell>
                    <TableCell>{Math.round((e.k / metrics.shareOfVoice!.total) * 100)} %</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">Sin datos: ninguna marca del panel aparece en las respuestas recogidas.</p>
          )}
          {metrics.branded.n > 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Preguntas sobre tu marca: te nombra en {fraction(metrics.branded)}.</p>
          ) : null}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="answers-title">
        <h2 id="answers-title" className="text-lg font-semibold">
          Respuestas
        </h2>
        {observations.map((o) => {
          const prompt = promptText.get(o.promptId);
          const competitorsMentioned = Object.entries(o.mentions?.competitors ?? {})
            .filter(([, hit]) => hit)
            .map(([cid]) => competitorName.get(cid) ?? cid);
          return (
            <Card key={o.id} size="sm">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                  <span>{prompt?.text}</span>
                  {prompt ? <Badge variant="outline">{INTENT_LABELS[prompt.intent]}</Badge> : null}
                  {config.repetitions > 1 ? <Badge variant="secondary">#{o.repetition}</Badge> : null}
                  <Badge variant={o.status === "completed" ? "secondary" : o.status === "failed" || o.status === "uncertain" ? "destructive" : "outline"}>
                    {OBSERVATION_STATUS_LABELS[o.status]}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {o.status === "completed" ? (
                  <>
                    <p>
                      {o.answerPresent ? (
                        <>
                          Tu marca: <strong>{o.mentions?.brand ? "mencionada" : "no mencionada"}</strong>
                          {competitorsMentioned.length ? ` · competidores: ${competitorsMentioned.join(", ")}` : ""}
                          {o.ownCited ? " · cita tu web" : ""}
                        </>
                      ) : (
                        "Sin respuesta."
                      )}
                    </p>
                    {o.responseText ? (
                      <details>
                        <summary className="cursor-pointer text-muted-foreground">Ver respuesta</summary>
                        <p className="mt-2 whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">{o.responseText}</p>
                      </details>
                    ) : null}
                    {o.sources?.length ? (
                      <ul className="flex flex-col gap-0.5">
                        {o.sources.map((s, i) => (
                          <li key={i} className="font-mono text-xs break-all">
                            [{s.kind === "own" ? "tu web" : s.kind === "competitor" ? "competidor" : "otra"}] {s.url}
                          </li>
                        ))}
                      </ul>
                    ) : o.answerPresent ? (
                      <p className="text-xs text-muted-foreground">Sin fuentes citadas.</p>
                    ) : null}
                  </>
                ) : o.status === "pending" && run.provider === "manual" ? (
                  <ManualObservationForm action={recordObservationAction.bind(null, workspace.id, run.id, o.id)} />
                ) : o.error ? (
                  <p className="text-xs text-muted-foreground">{o.error}</p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
