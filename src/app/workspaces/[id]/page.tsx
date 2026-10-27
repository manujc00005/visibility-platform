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
import type { Tone } from "@/modules/audits/status";
import { getAudit, listAudits } from "@/modules/audits/service";
import { listGeoRuns, listPrompts } from "@/modules/geo/service";
import { searchConsoleConfig } from "@/modules/search-console/deps";
import { latestSearchConsole } from "@/modules/search-console/service";
import { summarizeSearchConsole } from "@/modules/search-console/summary";
import {
  buildOpportunities,
  splitAudits,
  summarizeAi,
  summarizePerformance,
  summarizeSeo,
  type AiSummary,
  type Attempt,
  type BlockState,
  type FindingsByAudit,
  type PerformanceSummary,
  type SeoSummary,
  type Stale,
} from "@/modules/overview";
import { displayDate, displayDomain } from "@/modules/workspaces/presentation";
import { getWorkspace } from "@/modules/workspaces/service";
import { runAuditAction } from "./audits/actions";

export const metadata: Metadata = { title: "Resumen" };

/**
 * Blocking route: the whole page depends on one record, and rendering it before the
 * response starts is what lets an unknown id return a real 404 instead of a streamed 200.
 */
export const instant = false;

const STATE_STATUS: Record<Exclude<BlockState, "ok">, { tone: Tone; label: string }> = {
  not_configured: { tone: "neutral", label: "No medida" },
  no_data: { tone: "neutral", label: "Sin datos" },
  analyzing: { tone: "neutral", label: "Analizando" },
  partial: { tone: "neutral", label: "Parcial" },
  error: { tone: "bad", label: "Error" },
};

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

function PerformanceCard({ workspaceId, s }: { workspaceId: string; s: PerformanceSummary }) {
  // Without a score the measurement simply did not happen: "No medida", not "Parcial".
  const status = s.state === "ok" ? { tone: s.tone, label: s.verdict } : s.state === "partial" ? STATE_STATUS.not_configured : STATE_STATUS[s.state];
  return (
    <OverviewCard
      id="card-performance"
      href={`/workspaces/${workspaceId}/performance`}
      icon={Gauge}
      title="Rendimiento de tu web"
      description="Descubre cómo de rápida y cómoda es tu página para los visitantes."
      status={status}
      headline={
        s.score !== null ? (
          <>
            {s.score}
            <span className="text-base font-normal text-muted-foreground">/100</span>
          </>
        ) : (
          <Muted>{s.state === "analyzing" ? "Analizando…" : s.state === "error" ? "Sin resultado" : "No medida"}</Muted>
        )
      }
      notices={notices(s.attempt, s.stale)}
      source={`PageSpeed Insights · ${s.measuredAt ? displayDate(s.measuredAt) : s.state === "error" || s.state === "analyzing" ? "sin resultado" : "sin medir"}`}
    >
      {s.score !== null ? <Line>Puntuación de Google en un móvil simulado, no la experiencia de todos tus visitantes.</Line> : null}
      {s.reason ? <Line>{s.reason}</Line> : null}
      <ChangeLine change={s.change} note={s.comparisonNote} />
      {s.topIssue ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Principal problema: </span>
          {s.topIssue}
        </p>
      ) : null}
      {s.measuredAt ? (
        <div className="flex flex-col gap-0.5">
          <Line>{s.field.text}</Line>
          {s.field.source ? <p className="text-xs text-muted-foreground">Fuente de este dato: {s.field.source}</p> : null}
        </div>
      ) : null}
    </OverviewCard>
  );
}

const SEO_VERDICT: Record<Tone, string> = { good: "Bien", fair: "Regular", bad: "Mal", info: "Mejorable", neutral: "Parcial" };

function SeoCard({ workspaceId, s, rankingLine }: { workspaceId: string; s: SeoSummary; rankingLine: string | null }) {
  // A partial check keeps the severity it did find: "Mal (parcial)", never a neutral grey over critical problems.
  const status =
    s.state === "ok"
      ? { tone: s.tone, label: SEO_VERDICT[s.tone] }
      : s.state === "partial" && s.tone !== "neutral"
        ? { tone: s.tone, label: `${SEO_VERDICT[s.tone]} (parcial)` }
        : STATE_STATUS[s.state];
  const measured = s.headline !== null;
  return (
    <OverviewCard
      id="card-seo"
      href={`/workspaces/${workspaceId}/seo`}
      icon={Search}
      title="Visibilidad en Google"
      description="Descubre si los clientes encuentran tu empresa cuando buscan tus servicios."
      status={status}
      headline={
        measured ? (
          <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span>
              {s.counts.critical}
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">{s.counts.critical === 1 ? "crítico" : "críticos"}</span>
            </span>
            <span>
              {s.counts.warning}
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">{s.counts.warning === 1 ? "importante" : "importantes"}</span>
            </span>
          </span>
        ) : (
          <Muted>{s.state === "analyzing" ? "Analizando…" : s.state === "error" ? "Sin resultado" : "Sin auditoría"}</Muted>
        )
      }
      notices={notices(s.attempt, s.stale)}
      source={`Auditoría técnica de la portada · ${s.auditedAt ? displayDate(s.auditedAt) : s.state === "error" || s.state === "analyzing" ? "sin resultado" : "sin auditar"}`}
    >
      {s.headline ? <p className="text-sm font-medium">{s.headline.title}</p> : null}
      {s.reason ? <Line>{s.reason}</Line> : null}
      <ChangeLine change={s.change} note={s.comparisonNote} />
      {rankingLine ? (
        <Line>{rankingLine}</Line>
      ) : (
        <Line>
          Posicionamiento todavía no medido: falta conectar Google Search Console. Esto es la salud técnica de tu portada, no tu posición en
          Google.
        </Line>
      )}
    </OverviewCard>
  );
}

const AI_STATUS: Record<BlockState, { tone: Tone; label: string }> = {
  ok: { tone: "neutral", label: "Medido" },
  partial: { tone: "fair", label: "Parcial" },
  analyzing: { tone: "neutral", label: "Recogiendo respuestas" },
  error: { tone: "bad", label: "Error" },
  not_configured: { tone: "neutral", label: "Sin configurar" },
  no_data: { tone: "neutral", label: "Sin mediciones" },
};

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** What the headline leaves out, in one small line: capture, unanswered and branded questions. */
function AiFootnote({ s }: { s: AiSummary }) {
  if (s.configured === null || s.capture === null) return null;
  const parts = [`${s.configured} ${plural(s.configured, "pregunta medida", "preguntas medidas")}`];
  if (s.capture.k < s.capture.n) parts.push(`${s.capture.k} de ${s.capture.n} respuestas recogidas`);
  if (s.unanswered.length > 0) parts.push(`${s.unanswered.length} sin respuesta válida`);
  if (s.branded) {
    parts.push(
      `${s.branded.questions} sobre tu marca (te nombra en ${s.branded.mentioned.k} de ${s.branded.mentioned.n} ${plural(s.branded.mentioned.n, "respuesta", "respuestas")})`,
    );
  }
  if (parts.length === 1) return null;
  return <p className="text-xs text-muted-foreground">{parts.join(" · ")}. Solo cuentan arriba las preguntas evaluadas que no nombran tu marca.</p>;
}

function AiCard({ workspaceId, s }: { workspaceId: string; s: AiSummary }) {
  const toSetup = s.coverage === null && (s.state === "not_configured" || s.state === "no_data");
  return (
    <OverviewCard
      id="card-ai"
      href={`/workspaces/${workspaceId}/geo${toSetup ? "/setup" : ""}`}
      icon={Sparkles}
      title="Presencia en IA"
      description="Descubre si herramientas como ChatGPT mencionan o recomiendan tu empresa."
      status={AI_STATUS[s.state]}
      headline={
        s.coverage && s.coverage.n > 0 ? (
          <>
            {s.coverage.k}
            <span className="text-base font-normal text-muted-foreground">
              {" "}
              de {s.coverage.n} {plural(s.coverage.n, "pregunta", "preguntas")}
            </span>
          </>
        ) : (
          <Muted>
            {s.coverage ? "Sin datos" : s.state === "analyzing" ? "Recogiendo…" : s.state === "error" ? "Sin resultado" : s.state === "not_configured" ? "Sin preguntas" : "Pendiente de medir"}
          </Muted>
        )
      }
      notices={notices(s.attempt, s.stale, s.setupNotice)}
      source={`Medición en ChatGPT · ${s.measuredAt && s.provider ? `${s.provider} · ${displayDate(s.measuredAt)}` : s.state === "error" || s.state === "analyzing" ? "sin resultado" : "sin mediciones"}`}
      cta={toSetup ? "Configurar" : "Ver informe"}
    >
      {s.coverage && s.coverage.n > 0 ? (
        <Line>Preguntas monitorizadas en las que ChatGPT te mencionó, de las que obtuvieron respuesta válida. Es una muestra, no el total de búsquedas en IA.</Line>
      ) : s.reason ? (
        <Line>{s.reason}</Line>
      ) : null}
      {s.citing && s.citing.n > 0 ? (
        <Line>
          Tu web aparece citada como fuente en {s.citing.k} de {s.citing.n} {plural(s.citing.n, "respuesta", "respuestas")}.
        </Line>
      ) : null}
      <ChangeLine change={s.change} note={s.comparisonNote} />
      {s.uncovered[0] ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Principal oportunidad: </span>
          no te menciona en «{s.uncovered[0]}».
        </p>
      ) : null}
      <AiFootnote s={s} />
    </OverviewCard>
  );
}

export default async function WorkspacePage({ params }: PageProps<"/workspaces/[id]">) {
  await connection();
  const { id } = await params;
  const db = getDb();
  const workspace = await getWorkspace(db, id);
  if (!workspace) notFound();

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
  const performance = summarizePerformance(audits, latestFindings, now);
  const seo = summarizeSeo(audits, findingsByAudit, now);
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
  );
  const gsc = summarizeSearchConsole(gscStored, searchConsoleConfig(), workspace.domain);
  const opportunities = buildOpportunities({ findings: latestFindings, seo, performance, ai });
  const domain = displayDomain(workspace.domain);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[{ href: "/workspaces", label: "Empresas" }]}
          title={workspace.name}
          meta={
            <>
              <span className="font-mono">{domain}</span> · {workspace.sector}
              {workspace.city ? ` · ${workspace.city}` : ""}
            </>
          }
          actions={
            <>
              <RunAuditButton workspaceId={workspace.id} action={runAuditAction.bind(null, workspace.id)} />
              <Link href={`/workspaces/${workspace.id}/edit`} className={buttonVariants({ variant: "outline" })}>
                Editar
              </Link>
            </>
          }
        />
        <WorkspaceNav workspaceId={workspace.id} current="overview" />
      </div>

      <section aria-label="Estado de tu presencia digital" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <PerformanceCard workspaceId={workspace.id} s={performance} />
        <SeoCard workspaceId={workspace.id} s={seo} rankingLine={gsc.cardLine} />
        <AiCard workspaceId={workspace.id} s={ai} />
      </section>

      <Opportunities
        workspaceId={workspace.id}
        list={opportunities}
        emptyAction={
          <p className="text-sm text-muted-foreground">
            Pulsa «Ejecutar auditoría» arriba o{" "}
            <Link href={`/workspaces/${workspace.id}/geo/setup`} className="font-medium text-foreground underline underline-offset-4">
              configura las preguntas de IA
            </Link>
            .
          </p>
        }
      />
    </div>
  );
}
