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
import type { Tone } from "@/modules/audits/status";
import type { Fraction } from "@/modules/geo/metrics";
import { INTENT_LABELS, PROVIDER_LABELS, RUN_STATUS_LABELS } from "@/modules/geo/presentation";
import { listGeoRuns, listPrompts } from "@/modules/geo/service";
import { summarizeAi, type BlockState } from "@/modules/overview";
import { displayDate, displayDomain } from "@/modules/workspaces/presentation";
import { getWorkspace } from "@/modules/workspaces/service";

export const metadata: Metadata = { title: "Presencia en IA" };

/** Blocking route so an unknown workspace returns a real 404 (same reason as the overview). */
export const instant = false;

const STATUS: Record<BlockState, { tone: Tone; label: string }> = {
  ok: { tone: "neutral", label: "Medido" },
  partial: { tone: "fair", label: "Parcial" },
  analyzing: { tone: "neutral", label: "Recogiendo respuestas" },
  error: { tone: "bad", label: "Error" },
  not_configured: { tone: "neutral", label: "Sin configurar" },
  no_data: { tone: "neutral", label: "Sin mediciones" },
};

function count(f: Fraction, one: string, many: string): string {
  return f.n === 0 ? "Sin datos" : `${f.k} de ${f.n} ${f.n === 1 ? one : many}`;
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
          <li key={q} className="break-words">
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
  const db = getDb();
  const workspace = await getWorkspace(db, id);
  if (!workspace) notFound();

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
          breadcrumbs={[
            { href: "/workspaces", label: "Empresas" },
            { href: `/workspaces/${workspace.id}`, label: workspace.name },
          ]}
          title="Presencia en IA"
          description={`Si ChatGPT menciona a ${workspace.name} (${displayDomain(workspace.domain)}) al responder las preguntas que monitorizamos.`}
          actions={setupLink("Configurar medición")}
        />
        <WorkspaceNav workspaceId={workspace.id} current="geo" />
      </div>

      {!s.coverage ? (
        s.state === "not_configured" ? (
          <Empty title="Todavía no hay preguntas" action={setupLink("Configurar preguntas")}>
            Añade preguntas que podrían hacer tus clientes (por ejemplo, qué empresa de tu sector recomienda ChatGPT en tu ciudad) y lanza una
            medición. Así sabremos si te menciona al responderlas.
          </Empty>
        ) : s.state === "analyzing" && s.runId ? (
          <Empty
            title="Recogiendo respuestas de la primera medición"
            action={
              <Link href={`${base}/runs/${s.runId}`} className={buttonVariants({ variant: "outline" })}>
                Ver la medición en curso
              </Link>
            }
          >
            Cuando estén las respuestas verás aquí en cuántas preguntas apareces.
          </Empty>
        ) : s.state === "error" && s.runId ? (
          <Empty
            title="La medición no pudo recoger ninguna respuesta"
            action={
              <Link href={`${base}/runs/${s.runId}`} className={buttonVariants({ variant: "outline" })}>
                Ver la medición
              </Link>
            }
          >
            No hay resultado que mostrar. Revisa la medición y vuelve a lanzarla desde la configuración.
          </Empty>
        ) : (
          <Empty title="Todavía no hay mediciones" action={setupLink("Lanzar la primera medición")}>
            Tienes {prompts.length} {prompts.length === 1 ? "pregunta preparada" : "preguntas preparadas"}. Lanza una medición para saber si ChatGPT te
            menciona.
          </Empty>
        )
      ) : (
        <>
          <div className="flex flex-col gap-5 rounded-2xl border border-border/80 bg-card shadow-card p-5">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1.2fr_1fr]">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-muted-foreground">Preguntas en las que apareces</span>
                {s.coverage.n > 0 ? (
                  <span className="text-4xl font-semibold tracking-tight tabular-nums">
                    {s.coverage.k}
                    <span className="text-lg font-normal text-muted-foreground">
                      {" "}
                      de {s.coverage.n} {s.coverage.n === 1 ? "pregunta evaluada" : "preguntas evaluadas"}
                    </span>
                  </span>
                ) : (
                  <span className="text-2xl font-medium text-muted-foreground">Sin datos</span>
                )}
                <StatusPill tone={STATUS[s.state].tone}>{STATUS[s.state].label}</StatusPill>
                <ChangeLine change={s.change} note={s.comparisonNote} />
              </div>
              <dl className="flex flex-col gap-3 text-sm sm:border-l sm:pl-6">
                <div>
                  <dt className="text-muted-foreground">Respuestas que citan tu web como fuente</dt>
                  <dd className="font-medium">{s.citing ? count(s.citing, "respuesta", "respuestas") : "Sin datos"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Respuestas recogidas</dt>
                  <dd className="font-medium">{s.capture ? count(s.capture, "prevista", "previstas") : "Sin datos"}</dd>
                </div>
                {s.branded ? (
                  <div>
                    <dt className="text-muted-foreground">Preguntas sobre tu marca (aparte)</dt>
                    <dd className="font-medium">Te nombra en {count(s.branded.mentioned, "respuesta", "respuestas")}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
            <NoticeList notices={notices} />
            {s.attempt?.status === "running" ? (
              <Link href={`${base}/runs/${s.attempt.runId}`} className="w-fit text-sm font-medium text-brand underline underline-offset-4">
                Ver la medición en curso
              </Link>
            ) : null}
            <div className="flex flex-col gap-1 border-t pt-4 text-sm text-muted-foreground">
              <p>
                Es una muestra: las preguntas que hemos hecho a ChatGPT en un momento concreto. No es tu cuota de todas las búsquedas en IA, y las
                respuestas cambian entre consultas.
              </p>
              <p className="text-xs">
                Medición en ChatGPT · {s.provider} · {s.measuredAt ? displayDate(s.measuredAt) : ""} · {s.configured}{" "}
                {s.configured === 1 ? "pregunta" : "preguntas"} en esta medición
              </p>
            </div>
          </div>

          {view ? (
            <Section
              id="geo"
              title="Visibilidad y menciones"
              description="Qué ha contestado ChatGPT a cada pregunta. Las preguntas sobre tu marca la nombran y no cuentan para la presencia."
            >
              <div className="rounded-2xl border border-border/80 bg-card shadow-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pregunta</TableHead>
                      <TableHead>Respuestas</TableHead>
                      <TableHead>Te menciona</TableHead>
                      <TableHead>Cita tu web</TableHead>
                      <TableHead>Competidores mencionados</TableHead>
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
                            <span className="block">{p.text}</span>
                            <span className="text-xs text-muted-foreground">{INTENT_LABELS[p.intent]}</span>
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {p.answered} de {p.scheduled}
                          </TableCell>
                          <TableCell className="tabular-nums">{p.answered === 0 ? "Sin respuesta" : `${p.brandMentions} de ${p.answered}`}</TableCell>
                          <TableCell className="tabular-nums">{p.answered === 0 ? "—" : `${p.ownCitations} de ${p.answered}`}</TableCell>
                          <TableCell className="max-w-xs whitespace-normal">{rivals.length ? rivals.join(", ") : "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-2 rounded-2xl border border-border/80 bg-card shadow-card p-5">
                <h3 className="text-sm font-semibold">Comparación de menciones</h3>
                {view.run.config.panel.competitors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Esta medición no tenía competidores confirmados. Puedes añadirlos en la configuración para las próximas mediciones.
                  </p>
                ) : view.metrics.shareOfVoice ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Respuestas que nombran a cada marca, en preguntas que no nombran la tuya. Son los competidores confirmados cuando se hizo la
                      medición.
                    </p>
                    <ul className="flex flex-col divide-y text-sm">
                      {view.metrics.shareOfVoice.entries.map((e) => (
                        <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                          <span>{e.id === "brand" ? `${workspace.name} (tu marca)` : e.name}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {e.k} {e.k === 1 ? "respuesta" : "respuestas"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Ninguna marca del panel aparece en las respuestas recogidas.</p>
                )}
              </div>
            </Section>
          ) : null}

          <Section
            id="aeo"
            title="Preguntas y oportunidades de contenido (AEO)"
            description="En qué preguntas monitorizadas te mencionó ChatGPT y en cuáles no, según esta medición."
          >
            <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
              No hemos analizado si tu web responde estas preguntas. Que ChatGPT no te mencione no demuestra que te falte contenido, y aparecer hoy
              no garantiza aparecer mañana. Úsalo para decidir qué revisar.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <QuestionGroup
                title="No te menciona"
                hint="En esta medición ChatGPT no te mencionó al responderlas. Puedes revisar si tu web trata estos temas y si siguen siendo preguntas relevantes para tu negocio."
                items={s.uncovered}
              />
              <QuestionGroup title="Te menciona" hint="En esta medición ChatGPT te mencionó en al menos una respuesta a cada una." items={s.covered} />
              <QuestionGroup
                title="Sin respuesta válida"
                hint="No obtuvimos respuesta en esta medición: no cuentan en ningún sentido."
                items={s.unanswered}
              />
            </div>
          </Section>
        </>
      )}

      <Section id="history" title="Mediciones" description="Solo son comparables entre sí las mediciones con la misma configuración.">
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay mediciones.</p>
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
                      <span className="font-medium">{displayDate(run.createdAt)}</span>
                      <span className="text-xs text-muted-foreground">
                        {PROVIDER_LABELS[run.provider]} · {RUN_STATUS_LABELS[run.status]}
                        {changed ? " · configuración distinta a la anterior" : ""}
                      </span>
                    </span>
                    <span className="hidden text-right text-xs text-muted-foreground sm:block">
                      Apareces: {count(metrics.promptCoverage, "pregunta", "preguntas")}
                      <br />
                      Citas a tu web: {count(metrics.citationRate, "respuesta", "respuestas")}
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
